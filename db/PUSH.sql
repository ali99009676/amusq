-- ═══════════════════════════════════════════════════════════════════════════
--  إشعارات المتصفح — ما يُعيد الطالب
--
--  الطالب يشتري قبل الاختبار بثلاثة أيام، ويذاكر، ويختفي. والتكرار المتباعد
--  يحسب «راجع اليوم» ولا أحد يخبره أن اليوم جاء. هذا الملف هو الأذن التي
--  كانت ناقصة: اشتراك دفعٍ لكل جهاز، ودالةٌ تحسب لكل مشترك ما يستحق أن
--  يُقال له صباحًا.
--
--  ═══ Web Push مجاني تمامًا ═══
--  لا مزوّد ولا رسائل مدفوعة: المتصفح نفسه (Chrome/Safari/Firefox) يحمل
--  الإشعار، وخادمنا يوقّع الطلب بمفتاح VAPID. المطلوب: مفتاحان في بيئة
--  Vercel، ودالة على جدول يومي.
--
--  ═══ حدود ما يُجمع ═══
--  عنوان الاشتراك ومفتاحاه — وهما ما يُعطيه المتصفح لهذا الغرض بعينه،
--  ولا يُستعملان في غيره. لا نُخزّن ما يُقرأ من الإشعار ولا متى فُتح.
--
--  آمن التكرار بالكامل.
-- ═══════════════════════════════════════════════════════════════════════════
set search_path = qbank, public;

create table if not exists qbank.push_subs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  ua         text not null default '',
  created_at timestamptz not null default now(),
  last_sent  timestamptz,
  fails      int  not null default 0
);
create index if not exists push_subs_user_idx on qbank.push_subs (user_id);

alter table qbank.push_subs enable row level security;
-- بلا سياسة قراءة: مفاتيح الاشتراك تُكتب عبر الدالة وتُقرأ بمفتاح الخدمة وحده
drop policy if exists push_subs_none on qbank.push_subs;

-- ═══ الطالب يشترك / يلغي ═══
create or replace function qbank.save_push_sub(
  p_endpoint text, p_p256dh text, p_auth text, p_ua text default ''
) returns jsonb language plpgsql security definer set search_path = qbank, public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return jsonb_build_object('ok', false, 'reason','auth'); end if;
  if coalesce(p_endpoint,'') = '' or coalesce(p_p256dh,'') = '' or coalesce(p_auth,'') = '' then
    return jsonb_build_object('ok', false, 'reason','bad_sub');
  end if;
  /* الاشتراك للجهاز، والجهاز قد يبدّل صاحبه (حاسوب مشترك): العنوان نفسه
     يُنسب لآخر من سجّل به، لا يُرفض. */
  insert into qbank.push_subs (user_id, endpoint, p256dh, auth, ua)
  values (uid, p_endpoint, p_p256dh, p_auth, left(coalesce(p_ua,''), 80))
  on conflict (endpoint) do update
     set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
         ua = excluded.ua, fails = 0;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function qbank.save_push_sub(text, text, text, text) from public;
grant execute on function qbank.save_push_sub(text, text, text, text) to authenticated;

create or replace function qbank.drop_push_sub(p_endpoint text)
returns jsonb language plpgsql security definer set search_path = qbank, public as $$
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'reason','auth'); end if;
  delete from qbank.push_subs where endpoint = p_endpoint and user_id = auth.uid();
  return jsonb_build_object('ok', true);
end $$;
revoke all on function qbank.drop_push_sub(text) from public;
grant execute on function qbank.drop_push_sub(text) to authenticated;

/* هل هذا الجهاز مشترك؟ — كي تعرف الشاشة ماذا تعرض بلا تخمين */
create or replace function qbank.my_push_state()
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select jsonb_build_object(
    'subs', (select count(*) from qbank.push_subs where user_id = auth.uid()))
$$;
revoke all on function qbank.my_push_state() from public;
grant execute on function qbank.my_push_state() to authenticated;

-- ═══ ما يُقال لكل مشترك — لمفتاح الخدمة وحده ═══
/*
  ★ الحساب هنا لا في الخادم: صفٌّ واحد لكل اشتراك يحمل عدد المستحقّ اليوم
  وأقرب اختبار. الخادم يوقّع ويُرسل فقط — ولا يجلب تقدّم ألف طالب ليعدّه.

  p_day: رقم اليوم منذ ١٩٧٠ كما تحسبه الواجهة (Progress.today) — يمرّره
  الخادم بتوقيت الرياض، فيتّفق العدّان.
*/
create or replace function qbank.push_targets(p_day int)
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth,
    'name', nullif(btrim(p.name), ''),
    'due', coalesce((
      select count(*)
        from jsonb_each(coalesce(pr.data, '{}'::jsonb)) subj,
             jsonb_each(coalesce(subj.value->'srs', '{}'::jsonb)) q
       where coalesce((q.value->>'d')::numeric, 0) <= p_day), 0),
    'exam', (
      select jsonb_build_object('name', sb.name,
               'days', (sb.exam_date::date - (now() at time zone 'Asia/Riyadh')::date))
        from qbank.enrollments en
        join qbank.subjects sb on sb.id = en.subject_id
       where en.user_id = s.user_id and sb.exam_date is not null
         and sb.exam_date::date >= (now() at time zone 'Asia/Riyadh')::date
       order by sb.exam_date limit 1)
  )), '[]'::jsonb)
  from qbank.push_subs s
  join qbank.profiles p on p.id = s.user_id
  left join qbank.progress pr on pr.user_id = s.user_id
  where s.fails < 3
    -- لا إشعارين في يومٍ واحد للجهاز الواحد
    and (s.last_sent is null or s.last_sent < (now() at time zone 'Asia/Riyadh')::date)
$$;
revoke all on function qbank.push_targets(int) from public;
grant execute on function qbank.push_targets(int) to service_role;

/* بعد الإرسال: نجاحٌ يُؤرَّخ، وفشلٌ يُعدّ — وثلاثةٌ تحذف الاشتراك الميت */
create or replace function qbank.push_mark(p_endpoint text, p_ok boolean)
returns void language plpgsql security definer set search_path = qbank, public as $$
begin
  if p_ok then
    update qbank.push_subs set last_sent = now(), fails = 0 where endpoint = p_endpoint;
  else
    update qbank.push_subs set fails = fails + 1 where endpoint = p_endpoint;
    delete from qbank.push_subs where endpoint = p_endpoint and fails >= 3;
  end if;
end $$;
revoke all on function qbank.push_mark(text, boolean) from public;
grant execute on function qbank.push_mark(text, boolean) to service_role;

notify pgrst, 'reload schema';

-- ═══ تحقّق ═══
select (select count(*) from qbank.push_subs) as اشتراكات,
       (select count(*) from qbank.push_subs where fails >= 3) as ميّتة;
