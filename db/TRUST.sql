-- ═══════════════════════════════════════════════════════════════════════════
--  مراجعة · الجودة والثقة
--
--  المشكلة التي يحلّها هذا الملف:
--  حين يفتح الرفع لكل طالب، يدخل المحتوى الرديء مع الجيد. وبنك أسئلة فيه
--  إجابة خاطئة أسوأ من لا بنك: الطالب يحفظ الخطأ ويدخل به الامتحان واثقًا.
--  فنحتاج ثلاث طبقات: تقييم يرفع الجيد، وبلاغ يُسقط الخاطئ، ووسم يميّز
--  ما راجعه إنسان. ورابعة تمنع المشكلة قبل حدوثها: كشف المكرر عند الرفع.
--
--  آمن التكرار بالكامل: لا drop لجدول ولا لعمود.
-- ═══════════════════════════════════════════════════════════════════════════
set search_path = qbank, public;

-- ═══ ١ · التقييم ═══
/*
  تقييم واحد لكل طالب لكل مادة (مفتاح مركّب) — لا حشد أصوات.
  والتعديل مسموح: من قيّم قبل أن يذاكر يغيّر رأيه بعدها، وهذا رأي أنضج.
*/
create table if not exists qbank.subject_ratings (
  subject_id uuid not null references qbank.subjects(id) on delete cascade,
  user_id    uuid not null references auth.users(id)     on delete cascade,
  stars      int  not null check (stars between 1 and 5),
  note       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (subject_id, user_id)
);
create index if not exists ratings_subject_idx on qbank.subject_ratings (subject_id);

/*
  المتوسط والعدد على المادة نفسها: عمودان منزوعا التطبيع.
  السبب أن كل قائمة مواد ستحتاجهما، وحساب المتوسط بانضمام في كل استعلام
  يضاعف كلفة الشاشة الأكثر فتحًا في المنصة.
*/
alter table qbank.subjects add column if not exists rating_avg  numeric(3,2) not null default 0;
alter table qbank.subjects add column if not exists rating_n    int not null default 0;
alter table qbank.subjects add column if not exists verified    boolean not null default false;
alter table qbank.subjects add column if not exists reports_open int not null default 0;

create or replace function qbank.refresh_rating(p_subject uuid)
returns void language sql security definer set search_path = qbank, public as $$
  update qbank.subjects s
     set rating_avg = coalesce((select round(avg(r.stars)::numeric, 2)
                                  from qbank.subject_ratings r where r.subject_id = p_subject), 0),
         rating_n   = (select count(*) from qbank.subject_ratings r where r.subject_id = p_subject)
   where s.id = p_subject;
$$;

create or replace function qbank.rate_subject(p_subject uuid, p_stars int, p_note text default '')
returns jsonb language plpgsql security definer set search_path = qbank, public as $$
declare
  uid uuid := auth.uid();
  st  int  := least(greatest(coalesce(p_stars, 0), 1), 5);
begin
  if uid is null then return jsonb_build_object('ok', false, 'reason','auth'); end if;

  /*
    لا يُقيّم إلا من فتح المادة فعلًا.
    بلا هذا الشرط يستطيع منافس أن يُغرق مادة بتقييم واحد نجم من حسابات
    لم تفتحها — وهو أرخص هجوم على منصة محتواها من المستخدمين.
  */
  if not exists (select 1 from qbank.enrollments e where e.user_id = uid and e.subject_id = p_subject)
     and not exists (select 1 from qbank.subject_trials t where t.user_id = uid and t.subject_id = p_subject)
  then
    return jsonb_build_object('ok', false, 'reason','not_enrolled');
  end if;

  insert into qbank.subject_ratings (subject_id, user_id, stars, note)
  values (p_subject, uid, st, coalesce(left(p_note, 500), ''))
  on conflict (subject_id, user_id)
  do update set stars = excluded.stars, note = excluded.note, updated_at = now();

  perform qbank.refresh_rating(p_subject);
  return (select jsonb_build_object('ok', true, 'avg', s.rating_avg, 'n', s.rating_n, 'mine', st)
            from qbank.subjects s where s.id = p_subject);
end $$;
revoke all on function qbank.rate_subject(uuid, int, text) from public;
grant execute on function qbank.rate_subject(uuid, int, text) to authenticated;

create or replace function qbank.my_rating(p_subject uuid)
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select coalesce((select jsonb_build_object('stars', r.stars, 'note', r.note)
                     from qbank.subject_ratings r
                    where r.subject_id = p_subject and r.user_id = auth.uid()), '{}'::jsonb)
$$;
revoke all on function qbank.my_rating(uuid) from public;
grant execute on function qbank.my_rating(uuid) to authenticated;

-- ═══ ٢ · البلاغات ═══
/*
  البلاغ يشير إلى سؤال بعينه لا إلى المادة كلها حين أمكن: «الإجابة خاطئة»
  بلا تحديد السؤال بلاغٌ لا يمكن التصرف فيه. وnullable للمادة كلها حين
  تكون المشكلة عامة (تكرار، محتوى مخالف).
*/
create table if not exists qbank.reports (
  id          uuid primary key default gen_random_uuid(),
  subject_id  uuid not null references qbank.subjects(id)  on delete cascade,
  question_id uuid references qbank.questions(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  reason      text not null,                    -- wrong_answer | typo | duplicate | offensive | other
  note        text not null default '',
  status      text not null default 'open',     -- open | resolved | rejected
  admin_note  text not null default '',
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists reports_open_idx on qbank.reports (status, created_at desc);
create index if not exists reports_subject_idx on qbank.reports (subject_id);

-- بلاغ واحد مفتوح لكل طالب لكل سؤال: التكرار يُغرق الطابور ولا يضيف معلومة
create unique index if not exists reports_once
  on qbank.reports (user_id, subject_id, coalesce(question_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'open';

create or replace function qbank.refresh_reports_open(p_subject uuid)
returns void language sql security definer set search_path = qbank, public as $$
  update qbank.subjects s
     set reports_open = (select count(*) from qbank.reports r
                          where r.subject_id = p_subject and r.status = 'open')
   where s.id = p_subject;
$$;

create or replace function qbank.report_issue(
  p_subject uuid, p_question uuid default null,
  p_reason text default 'other', p_note text default ''
) returns jsonb language plpgsql security definer set search_path = qbank, public as $$
declare
  uid uuid := auth.uid();
  ok_reason text[] := array['wrong_answer','typo','duplicate','offensive','other'];
begin
  if uid is null then return jsonb_build_object('ok', false, 'reason','auth'); end if;
  if not (p_reason = any(ok_reason)) then p_reason := 'other'; end if;

  insert into qbank.reports (subject_id, question_id, user_id, reason, note)
  values (p_subject, p_question, uid, p_reason, coalesce(left(p_note, 1000), ''))
  on conflict do nothing;

  perform qbank.refresh_reports_open(p_subject);
  return jsonb_build_object('ok', true);
end $$;
revoke all on function qbank.report_issue(uuid, uuid, text, text) from public;
grant execute on function qbank.report_issue(uuid, uuid, text, text) to authenticated;

/*
  طابور المشرف: البلاغ ومعه نص السؤال وإجابته المعلنة.
  بلا النص يضطر المشرف إلى فتح المادة مع كل بلاغ — فيتراكم الطابور
  ولا يُقرأ، وطابورٌ لا يُقرأ كأنه غير موجود.
*/
create or replace function qbank.admin_reports(p_status text default 'open', p_limit int default 100)
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select case when not qbank.is_admin() then '[]'::jsonb else coalesce((
    select jsonb_agg(x order by x->>'created_at' desc)
      from (
        select jsonb_build_object(
                 'id', r.id, 'reason', r.reason, 'note', r.note, 'status', r.status,
                 'created_at', r.created_at,
                 'subject_id', r.subject_id, 'subject', s.name,
                 'question_id', r.question_id,
                 'q', q.q, 'options', q.options, 'answer', q.answer
               ) x
          from qbank.reports r
          join qbank.subjects s on s.id = r.subject_id
          left join qbank.questions q on q.id = r.question_id
         where r.status = coalesce(nullif(p_status,''), 'open')
         order by r.created_at desc
         limit least(greatest(coalesce(p_limit,100), 1), 300)
      ) t), '[]'::jsonb) end
$$;
revoke all on function qbank.admin_reports(text, int) from public;
grant execute on function qbank.admin_reports(text, int) to authenticated;

create or replace function qbank.resolve_report(p_report uuid, p_status text, p_note text default '')
returns jsonb language plpgsql security definer set search_path = qbank, public as $$
declare sid uuid;
begin
  if not qbank.is_admin() then return jsonb_build_object('ok', false, 'reason','forbidden'); end if;
  if p_status not in ('resolved','rejected','open') then
    return jsonb_build_object('ok', false, 'reason','bad_status');
  end if;

  update qbank.reports
     set status = p_status, admin_note = coalesce(left(p_note, 1000), ''),
         resolved_at = case when p_status = 'open' then null else now() end
   where id = p_report
  returning subject_id into sid;

  if sid is null then return jsonb_build_object('ok', false, 'reason','not_found'); end if;
  perform qbank.refresh_reports_open(sid);
  return jsonb_build_object('ok', true);
end $$;
revoke all on function qbank.resolve_report(uuid, text, text) from public;
grant execute on function qbank.resolve_report(uuid, text, text) to authenticated;

-- ═══ ٣ · وسم «موثّق» ═══
/*
  التوثيق قرار إنسان لا نتيجة حساب. المشرف يفتح المادة، يقرأ عيّنة منها،
  ثم يسمها. ولا يُمنح تلقائيًا بعدد تقييمات — وإلا صار وسمًا يمكن شراؤه.
*/
create or replace function qbank.set_verified(p_subject uuid, p_on boolean)
returns jsonb language plpgsql security definer set search_path = qbank, public as $$
begin
  if not qbank.is_admin() then return jsonb_build_object('ok', false, 'reason','forbidden'); end if;
  update qbank.subjects set verified = coalesce(p_on, false) where id = p_subject;
  return jsonb_build_object('ok', true, 'verified', coalesce(p_on, false));
end $$;
revoke all on function qbank.set_verified(uuid, boolean) from public;
grant execute on function qbank.set_verified(uuid, boolean) to authenticated;

-- ═══ ٤ · كشف المكرر قبل الرفع ═══
/*
  يُنادى قبل النشر لا بعده. الطالب يرى: «هذه المادة موجودة في جامعتك
  باسم قريب — افتحها أو أكمل نشرك». فنمنع عشر نسخ من مقرّر واحد.

  المطابقة على الاسم المطبَّع داخل نفس الجامعة فقط: «فيزياء ١» في نجران
  ليست تكرارًا لـ«فيزياء ١» في القاهرة — مقرّران مختلفان بالكامل.
*/
create or replace function qbank.find_similar(p_name text, p_university uuid default null)
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select coalesce(jsonb_agg(x), '[]'::jsonb)
    from (
      select jsonb_build_object(
               'id', s.id, 'name', s.name, 'slug', s.slug,
               'q_count', s.q_count, 'rating_avg', s.rating_avg, 'rating_n', s.rating_n,
               'verified', s.verified, 'college', c.name
             ) x
        from qbank.subjects s
        left join qbank.colleges c on c.id = s.college_id
       where s.published and s.status = 'published'
         and coalesce(p_university, s.university_id) is not distinct from s.university_id
         and qbank.ar_norm(coalesce(p_name,'')) <> ''
         and (qbank.ar_norm(s.name) like '%' || qbank.ar_norm(p_name) || '%'
           or qbank.ar_norm(p_name) like '%' || qbank.ar_norm(s.name) || '%')
       order by s.q_count desc
       limit 5
    ) t
$$;
revoke all on function qbank.find_similar(text, uuid) from public;
grant execute on function qbank.find_similar(text, uuid) to authenticated;

-- ═══ ٥ · الحماية على مستوى الصفوف ═══
alter table qbank.subject_ratings enable row level security;
alter table qbank.reports         enable row level security;

drop policy if exists ratings_read on qbank.subject_ratings;
create policy ratings_read on qbank.subject_ratings for select
  using (true);                                    -- التقييمات معلنة بطبيعتها

drop policy if exists ratings_write on qbank.subject_ratings;
create policy ratings_write on qbank.subject_ratings for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists reports_read on qbank.reports;
create policy reports_read on qbank.reports for select
  using (user_id = auth.uid() or qbank.is_admin());  -- بلاغك لك، والطابور للمشرف

drop policy if exists reports_insert on qbank.reports;
create policy reports_insert on qbank.reports for insert
  with check (user_id = auth.uid());

-- ★ لا سياسة update للطالب: البلاغ لا يُغلقه صاحبه، يُغلقه المشرف عبر الدالة
notify pgrst, 'reload schema';
