-- ═══════════════════════════════════════════════════════════════════════════
--  مراجعة · الرافع يملك ما رفع
--
--  ثلاثة أعطال متشابكة، عرضُها واحد: الطالب يرفع مادته ثم لا يستطيع فتحها.
--
--  ١ · approve_draft كانت تشترط is_admin() — فالطالب لا ينشر أصلًا، وطابور
--      اعتمادٍ يدويّ يعني أن رفع الساعة الثالثة فجرًا ينتظرني حتى أصحو.
--  ٢ · الإدراج لم يكتب created_by — كان يُختم بنداءٍ منفصل بعده، وفشلُ ذلك
--      النداء يترك مادة بلا مالك. المالك يُكتب في المعاملة نفسها أو لا يُكتب.
--  ٣ · content_pack لم تُرجع created_by — فبوّابة المتصفح تفحص «أهي مادته؟»
--      على حقلٍ غير موجود، والجواب دائمًا لا. فالرافع يرى جدار الدفع أمام
--      مادته هو.
--
--  والقاعدة الحاكمة: من رفع بنكًا فتحه — يومًا كاملًا افتراضًا، والمدة رقم
--  واحد في الإعدادات (٠ = بلا نهاية).
--
--  آمن التكرار: لا drop لجدول ولا لعمود.
-- ═══════════════════════════════════════════════════════════════════════════
set search_path = qbank, public;

-- مدّة وصول الرافع إلى مادته. ٠ = دائم.
alter table qbank.settings
  add column if not exists uploader_days int not null default 1;

-- ═══ ١ · الاعتماد: صاحب المسوّدة ينشرها بنفسه ═══
create or replace function qbank.approve_draft(draft_id uuid, publish boolean)
returns uuid language plpgsql security definer set search_path = qbank, public as $$
declare
  d    qbank.drafts%rowtype;
  sid  uuid;
  q    jsonb;
  i    int := 0;
  n    int;
  days int;
  mine boolean;
begin
  select * into d from qbank.drafts where id = draft_id;
  if not found then raise exception 'المسوّدة غير موجودة'; end if;

  /*
    ★ لا طابور اعتماد.
    المشرف واحد والطلاب كثير، فالطابور يجعل المنصة تسير بسرعة نومي أنا.
    ومن رفع ملفه ليراجع منه ليلة امتحانه لا يحتمل انتظارًا.
    الحماية لا تُلغى — تنتقل: بلاغٌ من الطلاب، وتقييمٌ يُنزل الرديء،
    ووسمُ «موثّقة» يرفع الجيّد، وقدرةُ المشرف على الإيقاف في أي لحظة.
    نمنع الضرر بعد وقوعه بدل أن نمنع النفع قبل وقوعه.
  */
  mine := (d.created_by = auth.uid());
  if not (mine or qbank.is_admin()) then
    raise exception 'هذه ليست مسوّدتك';
  end if;

  -- ★ الحارس الباقي: مادة بلا سؤال واحد ليست مادة
  n := jsonb_array_length(coalesce(d.payload, '[]'::jsonb));
  if n = 0 then
    raise exception 'هذه المسوّدة بلا أسئلة — لا يمكن نشر بنك فارغ';
  end if;

  -- ★ المالك يُكتب هنا لا في نداءٍ لاحق قد يفشل
  insert into qbank.subjects (name, published, q_count, created_by, status)
  values (coalesce(nullif(d.name,''), d.source_name), publish, n, d.created_by,
          case when publish then 'published' else 'suspended' end)
  returning id into sid;

  for q in select * from jsonb_array_elements(d.payload) loop
    i := i + 1;
    insert into qbank.questions
      (subject_id, ord, q, options, answer, expl_ar, expl_en, translation,
       mnemonic, topic, derived, opts_built, important)
    values (
      sid, i,
      q->>'q',
      coalesce(q->'options','[]'::jsonb),
      coalesce((q->>'answer')::int, 0),
      coalesce(q->>'expl_ar',''), coalesce(q->>'expl_en',''),
      coalesce(q->>'translation',''),
      coalesce(q->'mnemonic','{}'::jsonb),
      coalesce(q->>'topic',''),
      coalesce((q->>'derived')::boolean, false),
      coalesce((q->>'opts_built')::boolean, false),
      coalesce((q->>'important')::boolean, false)
    );
  end loop;

  -- العدّاد من الواقع لا من النية: عدد الصفوف المُدرَجة فعلًا
  update qbank.subjects set q_count = i where id = sid;

  /*
    ★ ومفتاح مادته في يده قبل أن يغادر الشاشة.
    الاستحقاق يُكتب هنا لا في الواجهة: من كتب البنك بيده لا يليق أن يُطلب
    منه ثمنُ فتحه. والمدّة رقم في الإعدادات — ٠ تعني «ما دامت المنصة».
  */
  if d.created_by is not null then
    select coalesce(uploader_days, 1) into days from qbank.settings where id = 1;
    insert into qbank.entitlements (user_id, subject_id, kind, source, expires_at)
    values (d.created_by, sid, 'subject', 'upload',
            case when coalesce(days,1) <= 0 then now() + interval '100 years'
                 else now() + make_interval(days => days) end);
  end if;

  update qbank.drafts set status = case when publish then 'approved' else 'hidden' end,
    updated_at = now() where id = draft_id;
  return sid;
end $$;

revoke all on function qbank.approve_draft(uuid, boolean) from public;
grant execute on function qbank.approve_draft(uuid, boolean) to authenticated;

-- ═══ ٢ · قائمة المواد تحمل ما تحتاجه البوّابة ═══
/*
  ★ created_by و slug و price و free و status.
  بوّابة المتصفح تسأل «أهي مادته؟» — وكانت تسأل حقلًا لا يصل، فيكون
  الجواب «لا» دائمًا. والرابط القصير يحتاج slug، وبطاقة الشراء تحتاج price.
  حقلٌ ناقص في الحمولة يصير عطلًا في شاشة بعيدة عنه.
*/
create or replace function qbank.content_pack()
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select jsonb_build_object(
    'subjects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'color', s.color, 'icon', s.icon,
        'descr', s.descr, 'topics', s.topics, 'exam_date', s.exam_date,
        'free', s.free, 'ord', s.ord, 'q_count', s.q_count,
        'created_by', s.created_by, 'slug', s.slug,
        'price', s.price, 'status', s.status,
        'verified', s.verified, 'rating_avg', s.rating_avg, 'rating_n', s.rating_n
      ) order by s.ord, s.created_at)
      from qbank.subjects s where s.published = true
    ), '[]'::jsonb),
    'settings', (select jsonb_build_object(
      'welcome_text', welcome_text, 'board_enabled', board_enabled
    ) from qbank.settings where id = 1),
    'fetched_at', now()
  )
$$;

-- ═══ ٣ · البوّابة الخادمية توافق البوّابة المتصفّحية ═══
/*
  ★ حكمان لا بد أن يتطابقا: المتصفح يقرّر ما يُعرض، والقاعدة تقرّر ما يُسلَّم.
  اختلافهما إما ثغرة (المتصفح يسمح والقاعدة تمنع → شاشة فارغة) أو حبسٌ
  للمالك (المتصفح يمنع والقاعدة تسمح). فنكتب ملكية الرافع في الاثنين.
*/
create or replace function qbank.can_access(sid uuid)
returns boolean language sql stable security definer set search_path = qbank, public as $$
  select qbank.is_admin()
    or exists (select 1 from qbank.subjects s where s.id = sid and s.free and s.published)
    or exists (select 1 from qbank.subjects s where s.id = sid and s.created_by = auth.uid())
    or exists (select 1 from qbank.entitlements e
               where e.user_id = auth.uid() and e.expires_at > now()
                 and (e.subject_id = sid or e.kind = 'semester'))
$$;

-- ═══ ٣ب · قرار البوّابة يقول متى ينتهي، لا «مسموح» فقط ═══
/*
  ★ «مسموح» بلا موعد انتهاء تُفاجئ صاحبها.
  الرافع يفتح مادته اليوم فيظنّها ملكه أبدًا، ثم تُقفل غدًا فجأة فيشعر
  أنه خُدع. الرقم المعروض («يومك ينتهي بعد ١٤ ساعة») يجعل الإقفال
  اتفاقًا سابقًا لا مفاجأة.
*/
create or replace function qbank.subject_access(sid uuid)
returns jsonb language plpgsql security definer set search_path = qbank, public as $$
declare
  uid  uuid := auth.uid();
  s    record;
  used int := 0;
  cap  int := qbank.trial_cap();
  ent  timestamptz;
begin
  select * into s from qbank.subjects where id = sid;
  if s is null then return jsonb_build_object('allowed', false, 'reason','missing'); end if;
  if s.status <> 'published' then
    return jsonb_build_object('allowed', false, 'reason','suspended', 'price', s.price);
  end if;
  if qbank.is_admin() then return jsonb_build_object('allowed', true, 'reason','admin'); end if;
  if s.free then return jsonb_build_object('allowed', true, 'reason','free'); end if;
  if uid is null then return jsonb_build_object('allowed', false, 'reason','anon', 'price', s.price); end if;

  select max(e.expires_at) into ent from qbank.entitlements e
   where e.user_id = uid and e.expires_at > now()
     and (e.kind = 'semester' or e.subject_id = sid);
  if ent is not null then
    return jsonb_build_object('allowed', true, 'reason','entitled',
      'owner', (s.created_by = uid), 'until', ent,
      'hours_left', greatest(0, ceil(extract(epoch from (ent - now())) / 3600)::int));
  end if;

  -- انتهت مدّة الرافع: تبقى له تجربة قصيرة قبل جدار الدفع
  if s.created_by = uid then
    select coalesce(t.seconds_used, 0) into used
      from qbank.subject_trials t where t.user_id = uid and t.subject_id = sid;
    if coalesce(used, 0) < cap then
      return jsonb_build_object('allowed', true, 'reason','trial', 'owner', true,
        'seconds_used', coalesce(used,0), 'seconds_left', cap - coalesce(used,0), 'cap', cap);
    end if;
    return jsonb_build_object('allowed', false, 'reason','trial_expired', 'owner', true,
      'seconds_used', cap, 'seconds_left', 0, 'cap', cap, 'price', s.price);
  end if;

  return jsonb_build_object('allowed', false, 'reason','paywall', 'price', s.price);
end $$;
revoke all on function qbank.subject_access(uuid) from public;
grant execute on function qbank.subject_access(uuid) to authenticated, anon;

-- ═══ ٤ · علاج ما مضى: كل مادة قائمة يملكها رافعها ═══
/*
  المواد التي نُشرت قبل هذا الإصلاح لا استحقاق لرافعيها. نمنحه الآن —
  بالمدّة نفسها، ومن تاريخ اليوم لا من تاريخ الرفع: العدل ألا يخسر أحد
  يومه لأن العطل كان عندي.
*/
insert into qbank.entitlements (user_id, subject_id, kind, source, expires_at)
select s.created_by, s.id, 'subject', 'upload',
       case when coalesce((select uploader_days from qbank.settings where id = 1), 1) <= 0
            then now() + interval '100 years'
            else now() + make_interval(
              days => coalesce((select uploader_days from qbank.settings where id = 1), 1)) end
  from qbank.subjects s
 where s.created_by is not null
   and not exists (select 1 from qbank.entitlements e
                    where e.user_id = s.created_by and e.subject_id = s.id
                      and e.source = 'upload');

-- تقرير موجز
select (select count(*) from qbank.subjects where created_by is not null) as "مواد_لها_مالك",
       (select count(*) from qbank.subjects where created_by is null)     as "مواد_بلا_مالك",
       (select count(*) from qbank.entitlements where source = 'upload')  as "استحقاقات_رفع",
       (select uploader_days from qbank.settings where id = 1)            as "أيام_الرافع";
