-- ═══════════════════════════════════════════════════════════════════════════
--  مراجعة · المجتمع — الدفعة تراجع معًا
--
--  المشكلة التي يحلّها هذا الملف:
--  المذاكرة وحدها تنقطع. والطالب الذي يعرف أن ثلاثين من دفعته يراجعون
--  المادة نفسها الليلة يُكمل، ومن يظنّ نفسه وحده يتوقّف. فنُظهر الدفعة:
--  متصدّرون داخل جامعته هو لا العالم كله، ونشاط حيّ على المادة.
--
--  خطّان حمراوان في هذا الملف:
--  ١ · لا بريد ولا معرّف مستخدم يخرج في أي دالة — الاسم والصورة فقط.
--  ٢ · المقارنة داخل الجامعة لا عبر المنصة — طالب نجران لا يُقارَن بمن
--      يذاكر مقرّرًا آخر في بلد آخر، والمقارنة الظالمة تُحبط ولا تُحفّز.
-- ═══════════════════════════════════════════════════════════════════════════
set search_path = qbank, public;

-- ═══ ١ · الظهور في المتصدرين: اختيار لا فرض ═══
/*
  الافتراضي «ظاهر» لأن لوحة فارغة لا تُحفّز أحدًا، لكن الخروج بضغطة.
  ومن يخرج لا يُحسب ولا يُعرض — لا «مجهول» في المركز الثالث يذكّره
  بأنه اختار الاختفاء.
*/
alter table qbank.profiles add column if not exists show_on_board boolean not null default true;

-- ═══ ٢ · لوحة متصدّري الجامعة ═══
/*
  المعيار: عدد الأسئلة المُراجَعة صحيحةً في اختبارات المادة، لا عدد
  الاختبارات. ولو كان العدّ بالاختبارات لتصدّر من يفتح اختبارًا ويغلقه
  عشرين مرة — نقيس المراجعة لا النقر.

  والنافذة ٣٠ يومًا: لوحة أبدية يتصدّرها من بدأ مبكرًا فلا يلحقه أحد،
  فيتوقّف الباقون عن المحاولة. الشهر يُبقيها قابلة للفوز دائمًا.
*/
create or replace function qbank.university_board(p_uni uuid default null, p_days int default 30, p_limit int default 20)
returns jsonb language plpgsql stable security definer set search_path = qbank, public as $$
declare
  uni uuid := p_uni;
  since timestamptz := now() - (least(greatest(coalesce(p_days,30), 1), 365) || ' days')::interval;
  lim int := least(greatest(coalesce(p_limit,20), 1), 50);
  me uuid := auth.uid();
  rows jsonb;
  mine jsonb;
begin
  if uni is null then
    select p.university_id into uni from qbank.profiles p where p.id = me;
  end if;
  if uni is null then
    return jsonb_build_object('ok', false, 'reason','no_university');
  end if;

  with scores as (
    select a.user_id,
           sum(greatest(coalesce(a.correct, 0), 0))::int pts,
           count(*)::int exams,
           max(a.pct)::int best
      from qbank.attempts a
      join qbank.profiles p on p.id = a.user_id
     where a.created_at >= since
       and p.university_id = uni
       and p.show_on_board
     group by a.user_id
  ), ranked as (
    select s.*, row_number() over (order by s.pts desc, s.best desc) rn
      from scores s
  )
  select
    coalesce((select jsonb_agg(jsonb_build_object(
                'rank', r.rn, 'name', nullif(btrim(p.name), ''), 'avatar', p.avatar,
                'points', r.pts, 'exams', r.exams, 'best', r.best,
                'me', (r.user_id = me))
              order by r.rn)
                from ranked r join qbank.profiles p on p.id = r.user_id
               where r.rn <= lim), '[]'::jsonb),
    -- ★ ترتيبك أنت ولو كنت خارج العشرين: «٤٧ من ٢٠٠» يُحفّز، والغياب يُحبط
    (select jsonb_build_object('rank', r.rn, 'points', r.pts, 'exams', r.exams)
       from ranked r where r.user_id = me)
    into rows, mine;

  return jsonb_build_object(
    'ok', true, 'rows', rows, 'me', coalesce(mine, 'null'::jsonb),
    'total', (select count(*) from qbank.profiles p
               where p.university_id = uni and p.show_on_board),
    'days', least(greatest(coalesce(p_days,30), 1), 365));
end $$;
revoke all on function qbank.university_board(uuid, int, int) from public;
grant execute on function qbank.university_board(uuid, int, int) to authenticated;

-- ═══ ٣ · نشاط المادة: كم من دفعتك يراجعها الآن ═══
/*
  الرقم الذي يُبقي الطالب مستيقظًا في ليلة الامتحان: «١٧ من جامعتك
  راجعوها هذا الأسبوع». ولا نُظهر أسماءهم هنا — العدد يكفي للطمأنة،
  والأسماء في اللوحة لمن اختار الظهور.
*/
create or replace function qbank.subject_pulse(p_subject uuid, p_days int default 7)
returns jsonb language plpgsql stable security definer set search_path = qbank, public as $$
declare
  since timestamptz := now() - (least(greatest(coalesce(p_days,7), 1), 90) || ' days')::interval;
  uni uuid;
begin
  select p.university_id into uni from qbank.profiles p where p.id = auth.uid();
  return jsonb_build_object(
    'ok', true,
    'week', (select count(distinct a.user_id) from qbank.attempts a
              where a.subject_id = p_subject and a.created_at >= since),
    'campus', case when uni is null then null else
      (select count(distinct a.user_id) from qbank.attempts a
         join qbank.profiles p on p.id = a.user_id
        where a.subject_id = p_subject and a.created_at >= since and p.university_id = uni) end,
    'enrolled', (select count(*) from qbank.enrollments e where e.subject_id = p_subject));
end $$;
revoke all on function qbank.subject_pulse(uuid, int) from public;
grant execute on function qbank.subject_pulse(uuid, int) to authenticated;

-- ═══ ٤ · تحدّي ما قبل الاختبار ═══
/*
  تحدٍّ لمادة: يفتحه طالب، وينضم زملاؤه برابط، وتُقارَن نتائجهم على
  اختبار المادة نفسها حتى موعد ينتهي. لا جوائز ولا كوينز — الحافز هو
  اسمك أمام دفعتك، وهذا يكفي في ليلة الامتحان.
*/
create table if not exists qbank.challenges (
  id         uuid primary key default gen_random_uuid(),
  subject_id uuid not null references qbank.subjects(id) on delete cascade,
  owner_id   uuid not null references auth.users(id) on delete cascade,
  title      text not null default '',
  code       text not null unique,              -- رمز قصير يُكتب في مجموعة الدفعة
  ends_at    timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists challenges_subject_idx on qbank.challenges (subject_id);

create table if not exists qbank.challenge_entries (
  challenge_id uuid not null references qbank.challenges(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  score        int  not null default 0,
  correct      int  not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

create or replace function qbank.create_challenge(p_subject uuid, p_title text default '', p_hours int default 48)
returns jsonb language plpgsql security definer set search_path = qbank, public as $$
declare
  uid uuid := auth.uid();
  c text;
  -- ★ new_id لا id: متغيّر يطابق اسم عمود يجعل returning ملتبسًا عند Postgres،
  --   وهو عطل صامت لا يظهر إلا وقت التشغيل. وقعنا فيه من قبل في rpc_record_trial_heartbeat.
  new_id uuid;
  hrs int := least(greatest(coalesce(p_hours, 48), 1), 720);
begin
  if uid is null then return jsonb_build_object('ok', false, 'reason','auth'); end if;

  -- رمز من ستة محارف بلا حروف ملتبسة (0/O و1/I) — يُملى صوتًا في مجموعة
  loop
    c := (select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
                 (floor(random()*32)+1)::int, 1), '') from generate_series(1,6));
    exit when not exists (select 1 from qbank.challenges ch where ch.code = c);
  end loop;

  insert into qbank.challenges (subject_id, owner_id, title, code, ends_at)
  values (p_subject, uid, coalesce(left(p_title, 80), ''), c, now() + (hrs || ' hours')::interval)
  returning challenges.id into new_id;

  return jsonb_build_object('ok', true, 'id', new_id, 'code', c);
end $$;
revoke all on function qbank.create_challenge(uuid, text, int) from public;
grant execute on function qbank.create_challenge(uuid, text, int) to authenticated;

/*
  تسجيل النتيجة: أفضل نتيجة تبقى، ولا تُقبل بعد انتهاء الموعد.
  «أفضل نتيجة تبقى» لا «الأخيرة» — كي لا يخاف الطالب من محاولة ثانية.
*/
create or replace function qbank.submit_challenge(p_code text, p_score int, p_correct int default 0)
returns jsonb language plpgsql security definer set search_path = qbank, public as $$
declare
  uid uuid := auth.uid();
  ch  qbank.challenges%rowtype;
  sc  int := least(greatest(coalesce(p_score, 0), 0), 100);
begin
  if uid is null then return jsonb_build_object('ok', false, 'reason','auth'); end if;
  select * into ch from qbank.challenges where code = upper(btrim(coalesce(p_code,'')));
  if ch.id is null then return jsonb_build_object('ok', false, 'reason','not_found'); end if;
  if ch.ends_at < now() then return jsonb_build_object('ok', false, 'reason','ended'); end if;

  insert into qbank.challenge_entries (challenge_id, user_id, score, correct)
  values (ch.id, uid, sc, greatest(coalesce(p_correct,0), 0))
  on conflict (challenge_id, user_id) do update
    set score = greatest(qbank.challenge_entries.score, excluded.score),
        correct = greatest(qbank.challenge_entries.correct, excluded.correct),
        updated_at = now();

  return jsonb_build_object('ok', true);
end $$;
revoke all on function qbank.submit_challenge(text, int, int) from public;
grant execute on function qbank.submit_challenge(text, int, int) to authenticated;

create or replace function qbank.challenge_board(p_code text)
returns jsonb language plpgsql stable security definer set search_path = qbank, public as $$
declare
  ch qbank.challenges%rowtype;
  me uuid := auth.uid();
begin
  select * into ch from qbank.challenges where code = upper(btrim(coalesce(p_code,'')));
  if ch.id is null then return jsonb_build_object('ok', false, 'reason','not_found'); end if;

  return jsonb_build_object(
    'ok', true,
    'code', ch.code, 'title', ch.title, 'subject_id', ch.subject_id,
    'ends_at', ch.ends_at, 'ended', ch.ends_at < now(),
    'subject', (select s.name from qbank.subjects s where s.id = ch.subject_id),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'rank', t.rn, 'name', nullif(btrim(t.name), ''), 'avatar', t.avatar,
               'score', t.score, 'me', t.uid = me) order by t.rn)
        from (
          select e.user_id uid, p.name, p.avatar, e.score,
                 row_number() over (order by e.score desc, e.updated_at asc) rn
            from qbank.challenge_entries e
            join qbank.profiles p on p.id = e.user_id
           where e.challenge_id = ch.id
           limit 50
        ) t), '[]'::jsonb));
end $$;
revoke all on function qbank.challenge_board(text) from public;
grant execute on function qbank.challenge_board(text) to authenticated;

-- ═══ ٥ · الحماية ═══
alter table qbank.challenges        enable row level security;
alter table qbank.challenge_entries enable row level security;

drop policy if exists ch_read on qbank.challenges;
create policy ch_read on qbank.challenges for select using (true);   -- الرمز يُشارَك عمدًا

drop policy if exists ch_own on qbank.challenges;
create policy ch_own on qbank.challenges for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists che_read on qbank.challenge_entries;
create policy che_read on qbank.challenge_entries for select using (true);

drop policy if exists che_own on qbank.challenge_entries;
create policy che_own on qbank.challenge_entries for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

notify pgrst, 'reload schema';
