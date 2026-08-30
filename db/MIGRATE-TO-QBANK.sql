-- ═══════════════════════════════════════════════════════════════════════════
--  هجرة المخطط: amusq  ←  qbank      (منصة «مراجعة — بنك الأسئلة»)
--
--  ألصق هذا الملف كاملًا مرة واحدة في SQL Editor واضغط Run.
--
--  كيف يعمل: alter schema rename عملية ذرّية في الفهرس لا نسخ فيها للبيانات.
--  الجداول والصفوف والفهارس والقيود تبقى كما هي في مكانها بالضبط — لا يُنقل
--  بايت واحد، ولا تفقد ٢٥٢ سؤالًا ولا مشتريات طالب. ما يُعاد بناؤه هو الدوال
--  والسياسات فقط، لأن أجسامها تحمل اسم المخطط نصًّا.
--
--  آمن التكرار: لو شُغّل مرتين فالشرط أدناه يتخطى إعادة التسمية بصمت.
--
--  ★ بعده مباشرة: Integrations ← Data API ← Settings ← Exposed schemas
--    غيّر amusq إلى qbank ثم Reload schema. بدونها لن يرى الموقع القاعدة.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'amusq')
     and not exists (select 1 from information_schema.schemata where schema_name = 'qbank')
  then
    execute 'alter schema amusq rename to qbank';
    raise notice 'أُعيدت تسمية المخطط amusq ← qbank';
  else
    raise notice 'لا حاجة لإعادة التسمية — المخطط qbank موجود مسبقًا';
  end if;
end $$;

set search_path = qbank, public;


-- ═══ إعادة بناء الجداول الناقصة (آمنة: if not exists) ═══

-- ═══ إعادة بناء الجداول الناقصة (آمنة: if not exists) ═══
-- بنك الأسئلة · مخطط قاعدة البيانات — يُنفَّذ في Supabase SQL Editor بالترتيب: schema.sql ثم policies.sql ثم functions.sql
-- كل جدول هنا يقابله RLS في policies.sql — لا جدول بلا صلاحيات.

create extension if not exists pgcrypto;

-- بنك الأسئلة يعيش في مخطط مستقل عن public:
-- المشروع مشترك مع نظام آخر أوقف كشف public عبر REST عمدًا،
-- فنكشف مخطط qbank وحده ولا نغيّر وضع أحد.
create schema if not exists qbank;
grant usage on schema qbank to anon, authenticated, service_role;
alter default privileges in schema qbank grant all on tables to anon, authenticated, service_role;
alter default privileges in schema qbank grant all on functions to anon, authenticated, service_role;
alter default privileges in schema qbank grant all on sequences to anon, authenticated, service_role;


-- الملف الشخصي: صف واحد لكل مستخدم، يُنشأ تلقائيًا عند التسجيل (trigger أدناه)
create table if not exists qbank.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text not null default '',
  avatar     text not null default '',          -- معرّف صورة رمزية من مجموعة المنصة، لا رابط خارجي
  is_admin   boolean not null default false,
  created_at timestamptz not null default now()
);

-- المواد: المحتوى المنشور فقط يصل الطالب (تفرضه السياسات لا الواجهة)
create table if not exists qbank.subjects (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  color      text not null default 'subject-1', -- اسم متغيّر لون من نظام التصميم، لا hex حر
  icon       text not null default '▤',
  descr      text not null default '',
  topics     jsonb not null default '[]',       -- ["محور ١","محور ٢"...]
  exam_date  timestamptz,
  published  boolean not null default false,
  free       boolean not null default false,    -- المادة المجانية للتجربة
  ord        int not null default 0,
  q_count    int not null default 0,            -- عدّاد منزوع التطبيع كي لا نعدّ الأسئلة مع كل جلب قائمة
  created_at timestamptz not null default now()
);
create index if not exists subjects_ord_idx on qbank.subjects (ord);

-- الأسئلة: النص المقدّس — يُخزَّن كما وصل من ملف الدكتور حرفًا بحرف
create table if not exists qbank.questions (
  id          uuid primary key default gen_random_uuid(),
  subject_id  uuid not null references qbank.subjects(id) on delete cascade,
  ord         int not null default 0,
  q           text not null,                    -- نص السؤال الأصلي — لا يُعدَّل أبدًا
  options     jsonb not null,                   -- ["نص الخيار كما وصل", ...]
  answer      int not null,                     -- موضع رقمي (0-based) لا حرف — الحروف تنكسر عند الخلط
  expl_ar     text not null default '',
  expl_en     text not null default '',
  translation text not null default '',
  mnemonic    jsonb not null default '{}',      -- {cue, key, link, strike} بطاقة الحفظ
  topic       text not null default '',
  derived     boolean not null default false,   -- الإجابة استنتجها الذكاء لا الملف
  opts_built  boolean not null default false,   -- الخيارات بناها الذكاء (سؤال ثم إجابة بلا خيارات)
  important   boolean not null default false,
  created_at  timestamptz not null default now()
);
-- الفهرسان المطلوبان في قواعد المشروع نصًا: subject_id و ord
create index if not exists questions_subject_idx on qbank.questions (subject_id);
create index if not exists questions_subject_ord_idx on qbank.questions (subject_id, ord);

-- المسوّدات: ما يخرج من ملف مرفوع قبل الاعتماد — لا يراها إلا المشرف
create table if not exists qbank.drafts (
  id           uuid primary key default gen_random_uuid(),
  name         text not null default '',
  status       text not null default 'processing', -- processing | reviewing | approved | hidden
  payload      jsonb not null default '[]',        -- الأسئلة المستخرجة — لا يُجلب في القوائم (كبير)
  total        int not null default 0,
  done         int not null default 0,             -- كم سؤالًا عالجه الذكاء — لشريط «٨٠ من ٣٠٠»
  source_name  text not null default '',
  created_by   uuid not null references auth.users(id) on delete cascade,
  updated_at   timestamptz not null default now()
);

-- مواد الطالب المختارة
create table if not exists qbank.enrollments (
  user_id    uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references qbank.subjects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, subject_id)
);

-- التقدّم: صف واحد لكل طالب — JSONB واحد يكفي لأن القراءة دائمًا كاملة والدمج في العميل
create table if not exists qbank.progress (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}',       -- {subjectId: {seen:{}, wrong:{}, star:{}, exams:n, best:n}}
  updated_at timestamptz not null default now()
);

-- المحاولات: صف لكل اختبار تجريبي — تُغذّي لوحة المشرف والمتصدرين
create table if not exists qbank.attempts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references qbank.subjects(id) on delete cascade,
  scope      text not null default 'all',       -- all | topic | important | wrong
  topic      text not null default '',
  correct    int not null default 0,
  total      int not null default 0,
  pct        numeric not null default 0,
  duration_s int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists attempts_user_idx on qbank.attempts (user_id, created_at desc);
create index if not exists attempts_subject_idx on qbank.attempts (subject_id);

-- الأجهزة: تمهيد لحدّ الأجهزة عند الاشتراك + عدّاد المتواجدين (نافذة ٤ ساعات على last_seen)
create table if not exists qbank.devices (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  label      text not null default '',
  last_seen  timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists devices_user_idx on qbank.devices (user_id);
create index if not exists devices_seen_idx on qbank.devices (last_seen);

-- الاستحقاقات (المرحلة ٥): مادة مفردة أو حزمة فصل تنتهي بنهاية الفصل — لا اشتراك شهري
create table if not exists qbank.entitlements (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  subject_id uuid references qbank.subjects(id) on delete cascade,  -- null = حزمة الفصل كاملة
  kind       text not null default 'subject',   -- subject | semester
  source     text not null default 'web',       -- web | apple | google
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists entitlements_user_idx on qbank.entitlements (user_id, expires_at);

-- إعدادات المنصة: صف واحد يحرّره المشرف
create table if not exists qbank.settings (
  id            int primary key default 1 check (id = 1),
  welcome_text  text not null default '',
  board_enabled boolean not null default true,
  device_limit  int not null default 3
);
insert into qbank.settings (id) values (1) on conflict do nothing;

-- إنشاء الملف الشخصي تلقائيًا عند تسجيل مستخدم جديد
create or replace function qbank.handle_new_user()
returns trigger language plpgsql security definer set search_path = qbank, public as $$
begin
  -- بريد المشرف المالك يُرقّى تلقائيًا عند أول تسجيل — لا خطوة يدوية تُنسى
  insert into qbank.profiles (id, name, is_admin)
  values (new.id, coalesce(new.raw_user_meta_data->>'name',''),
          new.email = 'stop.shankl@gmail.com')
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function qbank.handle_new_user();

-- تحديث عدّاد الأسئلة تلقائيًا كي تبقى قائمة المواد خفيفة الجلب
create or replace function qbank.sync_q_count()
returns trigger language plpgsql security definer set search_path = qbank, public as $$
begin
  update qbank.subjects s set q_count =
    (select count(*) from qbank.questions q where q.subject_id = s.id)
  where s.id = coalesce(new.subject_id, old.subject_id);
  return null;
end $$;
drop trigger if exists questions_count_trg on qbank.questions;
create trigger questions_count_trg
  after insert or delete on qbank.questions
  for each row execute function qbank.sync_q_count();

-- ═══ إعادة بناء السياسات بالاسم الجديد ═══
-- بنك الأسئلة · صلاحيات RLS — تُنفَّذ بعد schema.sql
-- القاعدة: الطالب لا يقرأ ولا يكتب إلا صفوفه، والمشرف يقرأ الجميع عبر is_admin()،
-- والأسئلة لا تُقرأ إلا لمادة منشورة، والمسوّدات لا يراها إلا المشرف.

-- security definer كي تعمل داخل السياسات دون اصطدام RLS نفسه بجدول profiles
create or replace function qbank.is_admin()
returns boolean language sql security definer stable set search_path = qbank, public as $$
  select coalesce((select is_admin from qbank.profiles where id = auth.uid()), false)
$$;

alter table qbank.profiles     enable row level security;
alter table qbank.subjects     enable row level security;
alter table qbank.questions    enable row level security;
alter table qbank.drafts       enable row level security;
alter table qbank.enrollments  enable row level security;
alter table qbank.progress     enable row level security;
alter table qbank.attempts     enable row level security;
alter table qbank.devices      enable row level security;
alter table qbank.entitlements enable row level security;
alter table qbank.settings     enable row level security;

-- profiles: كلٌّ يرى ويحرّر ملفه، والمشرف يرى الجميع. لا أحد يرفع نفسه مشرفًا من العميل.
drop policy if exists profiles_select on qbank.profiles;
create policy profiles_select on qbank.profiles for select
  using (id = auth.uid() or qbank.is_admin());
drop policy if exists profiles_update on qbank.profiles;
create policy profiles_update on qbank.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid() and is_admin = (select p.is_admin from qbank.profiles p where p.id = auth.uid()));

-- subjects: المنشور للجميع (حتى الزائر يرى المادة المجانية)، وكلها للمشرف، والكتابة للمشرف فقط
drop policy if exists subjects_select on qbank.subjects;
create policy subjects_select on qbank.subjects for select
  using (published = true or qbank.is_admin());
drop policy if exists subjects_write on qbank.subjects;
create policy subjects_write on qbank.subjects for all
  using (qbank.is_admin()) with check (qbank.is_admin());

-- questions: لا تُقرأ إلا لمادة منشورة — هذه هي طبقة «لا يصل الطالب سؤالًا غير معتمد» في القاعدة
drop policy if exists questions_select on qbank.questions;
create policy questions_select on qbank.questions for select
  using (qbank.is_admin() or exists
    (select 1 from qbank.subjects s where s.id = subject_id and s.published = true));
drop policy if exists questions_write on qbank.questions;
create policy questions_write on qbank.questions for all
  using (qbank.is_admin()) with check (qbank.is_admin());

-- drafts: للمشرف حصرًا — قراءةً وكتابة
drop policy if exists drafts_all on qbank.drafts;
create policy drafts_all on qbank.drafts for all
  using (qbank.is_admin()) with check (qbank.is_admin());

-- enrollments / progress / attempts / devices / entitlements: صفوف صاحبها فقط + قراءة المشرف
drop policy if exists enroll_own on qbank.enrollments;
create policy enroll_own on qbank.enrollments for all
  using (user_id = auth.uid() or qbank.is_admin())
  with check (user_id = auth.uid());

drop policy if exists progress_own on qbank.progress;
create policy progress_own on qbank.progress for all
  using (user_id = auth.uid() or qbank.is_admin())
  with check (user_id = auth.uid());

drop policy if exists attempts_own on qbank.attempts;
create policy attempts_own on qbank.attempts for all
  using (user_id = auth.uid() or qbank.is_admin())
  with check (user_id = auth.uid());

drop policy if exists devices_own on qbank.devices;
create policy devices_own on qbank.devices for all
  using (user_id = auth.uid() or qbank.is_admin())
  with check (user_id = auth.uid());

-- الاستحقاقات: يقرؤها صاحبها، ولا يكتبها إلا الخادم (service role يتجاوز RLS) أو المشرف
drop policy if exists entitlements_select on qbank.entitlements;
create policy entitlements_select on qbank.entitlements for select
  using (user_id = auth.uid() or qbank.is_admin());
drop policy if exists entitlements_admin on qbank.entitlements;
create policy entitlements_admin on qbank.entitlements for all
  using (qbank.is_admin()) with check (qbank.is_admin());

-- settings: قراءة للجميع (نص الترحيب يظهر للزائر)، كتابة للمشرف
drop policy if exists settings_select on qbank.settings;
create policy settings_select on qbank.settings for select using (true);
drop policy if exists settings_write on qbank.settings;
create policy settings_write on qbank.settings for update
  using (qbank.is_admin()) with check (qbank.is_admin());

-- ═══ إعادة بناء الدوال بالاسم الجديد ═══
-- بنك الأسئلة · دوال قاعدة البيانات — تُنفَّذ بعد policies.sql
-- كل دوال المشرف تتحقق من is_admin() داخلها ثم تعمل بـ security definer،
-- لأن الاعتماد على RLS وحده لا يكفي في دوال تجمع بيانات مستخدمين كثيرين.

-- حزمة المحتوى الخفيفة: قائمة المواد فقط بلا أسئلة — الأسئلة تُجلب عند فتح المادة
create or replace function qbank.content_pack()
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select jsonb_build_object(
    'subjects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'color', s.color, 'icon', s.icon,
        'descr', s.descr, 'topics', s.topics, 'exam_date', s.exam_date,
        'free', s.free, 'ord', s.ord, 'q_count', s.q_count
      ) order by s.ord, s.created_at)
      from qbank.subjects s where s.published = true
    ), '[]'::jsonb),
    'settings', (select jsonb_build_object(
      'welcome_text', welcome_text, 'board_enabled', board_enabled
    ) from qbank.settings where id = 1),
    'fetched_at', now()
  )
$$;

-- أسئلة مادة واحدة — تُنادى عند أول فتح للمادة ثم تُخزَّن في جهاز الطالب (IndexedDB)
create or replace function qbank.subject_questions(sid uuid)
returns setof qbank.questions language sql stable security definer set search_path = qbank, public as $$
  select q.* from qbank.questions q
  join qbank.subjects s on s.id = q.subject_id
  where q.subject_id = sid and (s.published = true or qbank.is_admin())
  order by q.ord
$$;

-- الاعتماد: عملية ذرّية واحدة — إما أن تُنشأ المادة وكل أسئلتها أو لا يتغيّر شيء
-- (جسم الدالة معاملة واحدة في Postgres، وأي خطأ يُرجع كل شيء)
create or replace function qbank.approve_draft(draft_id uuid, publish boolean)
returns uuid language plpgsql security definer set search_path = qbank, public as $$
declare
  d   qbank.drafts%rowtype;
  sid uuid;
  q   jsonb;
  i   int := 0;
begin
  if not qbank.is_admin() then raise exception 'غير مخوّل'; end if;

  select * into d from qbank.drafts where id = draft_id;
  if not found then raise exception 'المسوّدة غير موجودة'; end if;

  insert into qbank.subjects (name, published)
  values (coalesce(nullif(d.name,''), d.source_name), publish)
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

  update qbank.drafts set status = case when publish then 'approved' else 'hidden' end,
    updated_at = now() where id = draft_id;
  return sid;
end $$;

-- جدول الطلاب في اللوحة: مرقّم صفحات كي لا ينهار مع مئات الطلاب
create or replace function qbank.admin_students(page int default 0, page_size int default 50, search text default '')
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select case when not qbank.is_admin() then jsonb_build_object('error','غير مخوّل')
  else jsonb_build_object(
    'total', (select count(*) from qbank.profiles p
              where search = '' or p.name ilike '%'||search||'%'),
    'rows', coalesce((
      select jsonb_agg(row_to_json(t)) from (
        select p.id, p.name, p.avatar, p.created_at,
          (select count(*) from qbank.enrollments e where e.user_id = p.id) as subjects,
          (select count(*) from qbank.attempts a where a.user_id = p.id) as attempts,
          (select coalesce(max(a.pct),0) from qbank.attempts a where a.user_id = p.id) as best,
          (select max(d.last_seen) from qbank.devices d where d.user_id = p.id) as last_seen
        from qbank.profiles p
        where search = '' or p.name ilike '%'||search||'%'
        order by last_seen desc nulls last
        limit page_size offset page * page_size
      ) t), '[]'::jsonb)
  ) end
$$;

-- سجلّ طالب واحد: كل محاولاته
create or replace function qbank.admin_attempts(uid uuid)
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select case when not qbank.is_admin() then jsonb_build_object('error','غير مخوّل')
  else coalesce((
    select jsonb_agg(jsonb_build_object(
      'subject', s.name, 'scope', a.scope, 'topic', a.topic,
      'correct', a.correct, 'total', a.total, 'pct', a.pct,
      'duration_s', a.duration_s, 'created_at', a.created_at
    ) order by a.created_at desc)
    from qbank.attempts a join qbank.subjects s on s.id = a.subject_id
    where a.user_id = uid
  ), '[]'::jsonb) end
$$;

-- الأرقام السريعة أعلى اللوحة
create or replace function qbank.admin_stats()
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select case when not qbank.is_admin() then jsonb_build_object('error','غير مخوّل')
  else jsonb_build_object(
    'students', (select count(*) from qbank.profiles where not is_admin),
    'active_7d', (select count(distinct user_id) from qbank.devices where last_seen > now() - interval '7 days'),
    'attempts', (select count(*) from qbank.attempts),
    'avg_pct',  (select coalesce(round(avg(pct),1),0) from qbank.attempts)
  ) end
$$;

-- لوحة المتصدرين: تجميع فقط — لا أسماء طلاب آخرين ولا تفاصيل، حفاظًا على الخصوصية
create or replace function qbank.board(lim int default 10)
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select case when not (select board_enabled from qbank.settings where id = 1)
    then jsonb_build_object('disabled', true)
  else jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(row_to_json(t)) from (
        select coalesce(nullif(p.name,''),'طالب') as name, p.avatar,
               round(max(a.pct),1) as best, count(a.id) as attempts
        from qbank.attempts a join qbank.profiles p on p.id = a.user_id
        group by p.id, p.name, p.avatar
        order by best desc, attempts desc
        limit lim
      ) t), '[]'::jsonb),
    'online', (select count(distinct user_id) from qbank.devices
               where last_seen > now() - interval '4 hours')
  ) end
$$;

-- نبضة حضور: تُنادى عند فتح المنصة — تُغذّي «المتواجدين الآن» وحدّ الأجهزة لاحقًا
create or replace function qbank.heartbeat(device_label text default '')
returns void language plpgsql security definer set search_path = qbank, public as $$
begin
  if auth.uid() is null then return; end if;
  insert into qbank.devices (user_id, label, last_seen)
  values (auth.uid(), device_label, now())
  on conflict (id) do nothing;
  -- جهاز واحد لكل (مستخدم، تسمية): نحدّث آخر ظهور بدل تكديس صفوف
  update qbank.devices set last_seen = now()
  where user_id = auth.uid() and label = device_label;
  delete from qbank.devices d where d.user_id = auth.uid()
    and d.id not in (select id from qbank.devices where user_id = auth.uid()
                     order by last_seen desc limit 10);
end $$;

-- حذف الحساب نهائيًا — شرط متجر آبل. cascade في المخطط يمسح كل بيانات صاحبه.
create or replace function qbank.delete_me()
returns void language plpgsql security definer set search_path = qbank, public as $$
begin
  if auth.uid() is null then raise exception 'لا جلسة'; end if;
  delete from auth.users where id = auth.uid();
end $$;

-- بوابة المحتوى (المرحلة ٥): هل يحق للطالب فتح هذه المادة؟
create or replace function qbank.can_access(sid uuid)
returns boolean language sql stable security definer set search_path = qbank, public as $$
  select qbank.is_admin()
    or exists (select 1 from qbank.subjects s where s.id = sid and s.free and s.published)
    or exists (select 1 from qbank.entitlements e
               where e.user_id = auth.uid() and e.expires_at > now()
                 and (e.subject_id = sid or e.kind = 'semester'))
$$;

-- بنك الأسئلة · دوال لوحة التحكم الشاملة
-- كلها security definer وتتحقق من is_admin() داخلها — لا يكفي RLS في دوال تجمع بيانات الجميع.

/* لوحة النظرة العامة: كل ما تحتاجه الشاشة في نداء واحد لا عشرة */
create or replace function qbank.admin_dashboard(days int default 14)
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select case when not qbank.is_admin() then jsonb_build_object('error','غير مخوّل')
  else jsonb_build_object(
    -- أرقام سريعة
    'kpi', jsonb_build_object(
      'students',   (select count(*) from qbank.profiles where not is_admin),
      'active_7d',  (select count(distinct user_id) from qbank.devices where last_seen > now() - interval '7 days'),
      'online',     (select count(distinct user_id) from qbank.devices where last_seen > now() - interval '4 hours'),
      'attempts',   (select count(*) from qbank.attempts),
      'avg_pct',    (select coalesce(round(avg(pct),1),0) from qbank.attempts),
      'subjects',   (select count(*) from qbank.subjects),
      'published',  (select count(*) from qbank.subjects where published),
      'questions',  (select count(*) from qbank.questions),
      'derived',    (select count(*) from qbank.questions where derived),
      'drafts',     (select count(*) from qbank.drafts where status <> 'approved'),
      'enrollments',(select count(*) from qbank.enrollments)
    ),
    -- سلسلة زمنية: اختبارات كل يوم — يوم بلا نشاط يظهر صفرًا لا يُحذف
    'series', coalesce((
      select jsonb_agg(jsonb_build_object('d', d::date, 'n', n, 'avg', a) order by d)
      from (
        select g.d,
          (select count(*) from qbank.attempts t where t.created_at::date = g.d) n,
          (select coalesce(round(avg(t.pct),1),0) from qbank.attempts t where t.created_at::date = g.d) a
        from generate_series(current_date - (days - 1), current_date, interval '1 day') g(d)
      ) x
    ), '[]'::jsonb),
    -- توزيع النتائج على خمس شرائح
    'buckets', coalesce((
      select jsonb_agg(jsonb_build_object('label', lbl, 'n', c) order by ord)
      from (
        select '٠–٤٩' lbl, 1 ord, count(*) c from qbank.attempts where pct < 50
        union all select '٥٠–٥٩', 2, count(*) from qbank.attempts where pct >= 50 and pct < 60
        union all select '٦٠–٦٩', 3, count(*) from qbank.attempts where pct >= 60 and pct < 70
        union all select '٧٠–٨٩', 4, count(*) from qbank.attempts where pct >= 70 and pct < 90
        union all select '٩٠–١٠٠', 5, count(*) from qbank.attempts where pct >= 90
      ) b
    ), '[]'::jsonb),
    -- أداء كل مادة: أين يتعثّر الطلاب فعلًا
    'subjects', coalesce((
      select jsonb_agg(row_to_json(t)) from (
        select s.id, s.name, s.icon, s.color, s.q_count, s.published, s.free, s.exam_date, s.ord,
          (select count(*) from qbank.attempts a where a.subject_id = s.id) attempts,
          (select coalesce(round(avg(a.pct),1),0) from qbank.attempts a where a.subject_id = s.id) avg_pct,
          (select count(*) from qbank.enrollments e where e.subject_id = s.id) students
        from qbank.subjects s order by s.ord, s.created_at
      ) t
    ), '[]'::jsonb),
    -- آخر النشاط: من فعل ماذا ومتى
    'recent', coalesce((
      select jsonb_agg(row_to_json(t)) from (
        select coalesce(nullif(p.name,''),'طالب') student, p.avatar, s.name subject,
               round(a.pct,1) pct, a.correct, a.total, a.created_at
        from qbank.attempts a
        join qbank.profiles p on p.id = a.user_id
        join qbank.subjects s on s.id = a.subject_id
        order by a.created_at desc limit 12
      ) t
    ), '[]'::jsonb)
  ) end
$$;

/* تفصيل مادة واحدة: توزيع أسئلتها على المحاور وما يحتاج مراجعة */
create or replace function qbank.admin_subject_stats(sid uuid)
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select case when not qbank.is_admin() then jsonb_build_object('error','غير مخوّل')
  else jsonb_build_object(
    'total',      (select count(*) from qbank.questions where subject_id = sid),
    'derived',    (select count(*) from qbank.questions where subject_id = sid and derived),
    'opts_built', (select count(*) from qbank.questions where subject_id = sid and opts_built),
    'important',  (select count(*) from qbank.questions where subject_id = sid and important),
    'no_expl',    (select count(*) from qbank.questions where subject_id = sid and expl_ar = ''),
    'topics', coalesce((
      select jsonb_agg(jsonb_build_object('topic', topic, 'n', c) order by c desc)
      from (select coalesce(nullif(topic,''),'بلا محور') topic, count(*) c
            from qbank.questions where subject_id = sid group by 1) t
    ), '[]'::jsonb)
  ) end
$$;

/* كشف المكرّر داخل مادة — يوسم ولا يحذف، والقرار للمشرف */
create or replace function qbank.admin_duplicates(sid uuid)
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select case when not qbank.is_admin() then jsonb_build_object('error','غير مخوّل')
  else coalesce((
    select jsonb_agg(jsonb_build_object('key', k, 'n', c, 'ords', ords))
    from (
      select lower(regexp_replace(q, '\s+', ' ', 'g')) k, count(*) c,
             jsonb_agg(ord order by ord) ords
      from qbank.questions where subject_id = sid
      group by 1 having count(*) > 1
    ) d
  ), '[]'::jsonb) end
$$;

notify pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════
--  بنك الأسئلة · توسعة الإعدادات — كل ما يتحكّم به المشرف في مكان واحد
--  آمن التكرار: add column if not exists لا يمسّ قيمة موجودة.
-- ═══════════════════════════════════════════════════════════════
set search_path = qbank, public;

-- هوية المنصة
alter table qbank.settings add column if not exists platform_name text    not null default 'مراجعة';
alter table qbank.settings add column if not exists tagline       text    not null default '';
alter table qbank.settings add column if not exists support_email text    not null default '';
alter table qbank.settings add column if not exists whatsapp      text    not null default '';

-- افتراضات الاختبار — يبدأ بها الطالب ما لم يغيّرها
alter table qbank.settings add column if not exists exam_count    int     not null default 25;
alter table qbank.settings add column if not exists exam_minutes  int     not null default 30;
alter table qbank.settings add column if not exists pass_mark     int     not null default 60;
alter table qbank.settings add column if not exists shuffle_q     boolean not null default true;
alter table qbank.settings add column if not exists shuffle_opts  boolean not null default true;
alter table qbank.settings add column if not exists instant_feedback boolean not null default true;

-- بوابات التسجيل والصيانة
alter table qbank.settings add column if not exists signup_open   boolean not null default true;
alter table qbank.settings add column if not exists maintenance   boolean not null default false;
alter table qbank.settings add column if not exists maint_msg     text    not null default 'المنصة تحت الصيانة، نعود قريبًا.';
alter table qbank.settings add column if not exists trial_days    int     not null default 0;

-- حدود عاقلة: القاعدة تحرس نفسها ولو أخطأت الواجهة
do $$ begin
  alter table qbank.settings add constraint settings_sane check (
    exam_count between 1 and 200 and exam_minutes between 1 and 300
    and pass_mark between 0 and 100 and device_limit between 1 and 10
    and trial_days between 0 and 365);
exception when duplicate_object then null; end $$;

-- الإعدادات العامة يقرأها الجميع (اسم المنصة ووضع الصيانة يلزمان قبل الدخول)،
-- والكتابة للمشرف وحده — الحارس في القاعدة لا في المتصفح.
drop policy if exists settings_select on qbank.settings;
create policy settings_select on qbank.settings for select using (true);
drop policy if exists settings_write on qbank.settings;
create policy settings_write on qbank.settings for all
  using (qbank.is_admin()) with check (qbank.is_admin());

-- تصدير كامل للمحتوى: نسخة احتياطية يملكها المشرف بيده
create or replace function qbank.admin_export()
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select case when not qbank.is_admin() then jsonb_build_object('error','غير مخوّل')
  else jsonb_build_object(
    'exported_at', now(),
    'settings', (select row_to_json(s) from qbank.settings s where s.id = 1),
    'subjects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', s.name, 'color', s.color, 'icon', s.icon, 'descr', s.descr,
        'topics', s.topics, 'published', s.published, 'free', s.free, 'ord', s.ord,
        'questions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'ord', q.ord, 'q', q.q, 'options', q.options, 'answer', q.answer,
            'expl_ar', q.expl_ar, 'expl_en', q.expl_en, 'translation', q.translation,
            'mnemonic', q.mnemonic, 'topic', q.topic, 'derived', q.derived,
            'opts_built', q.opts_built, 'important', q.important) order by q.ord)
          from qbank.questions q where q.subject_id = s.id), '[]'::jsonb)
      ) order by s.ord)
      from qbank.subjects s), '[]'::jsonb)
  ) end
$$;
revoke all on function qbank.admin_export() from public;
grant execute on function qbank.admin_export() to authenticated;

-- صحة المحتوى: ما ينقص قبل أن يراه الطالب
create or replace function qbank.admin_health()
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select case when not qbank.is_admin() then jsonb_build_object('error','غير مخوّل')
  else jsonb_build_object(
    'no_expl',    (select count(*) from qbank.questions where expl_ar = ''),
    'derived',    (select count(*) from qbank.questions where derived),
    'opts_built', (select count(*) from qbank.questions where opts_built),
    'no_topic',   (select count(*) from qbank.questions where topic = ''),
    'empty_subj', (select count(*) from qbank.subjects s
                   where not exists (select 1 from qbank.questions q where q.subject_id = s.id)),
    -- سؤال موضع إجابته خارج عدد خياراته: فساد بيانات صريح يجب أن يُصرخ به
    'bad_answer', (select count(*) from qbank.questions
                   where answer < 0 or answer >= jsonb_array_length(options)),
    'unpublished',(select count(*) from qbank.subjects where not published)
  ) end
$$;
revoke all on function qbank.admin_health() from public;
grant execute on function qbank.admin_health() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════
--  بنك الأسئلة · مواد الطلاب (UGC) + محفظة الكوينز + تجربة العشر دقائق
--  آمن التكرار بالكامل: كل إضافة if not exists، ولا drop لعمود أو جدول.
-- ═══════════════════════════════════════════════════════════════════════
set search_path = qbank, public;

-- ═══ ١ · توسعة الجداول ═══
alter table qbank.subjects add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table qbank.subjects add column if not exists status     text not null default 'published';  -- published | suspended | removed
alter table qbank.subjects add column if not exists price      int  not null default 0;            -- بالريال؛ ٠ = يحدّده المشرف لاحقًا
alter table qbank.subjects add column if not exists slug       text;
-- نمط المعالجة: strict = حرفًا بحرف (الافتراضي وقاعدة المشروع)، enhanced = يسمح للذكاء بتحسين الصياغة
alter table qbank.subjects add column if not exists sanctity_mode text not null default 'strict';

do $$ begin
  alter table qbank.subjects add constraint subjects_status_ck check (status in ('published','suspended','removed'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table qbank.subjects add constraint subjects_mode_ck check (sanctity_mode in ('strict','enhanced'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table qbank.subjects add constraint subjects_price_ck check (price >= 0 and price <= 5000);
exception when duplicate_object then null; end $$;

create unique index if not exists subjects_slug_uidx on qbank.subjects (slug) where slug is not null;
create index if not exists subjects_creator_idx on qbank.subjects (created_by);

-- الأصل محفوظ دائمًا مهما كان النمط: enhanced يحسّن المعروض ولا يمحو ما وصل.
-- هكذا يبقى الفحص النصّي الآلي ذا معنى، ويظل بوسع الطالب رؤية نص الدكتور.
alter table qbank.questions add column if not exists q_original       text;
alter table qbank.questions add column if not exists options_original jsonb;

alter table qbank.profiles add column if not exists coins_balance int not null default 0;
do $$ begin
  alter table qbank.profiles add constraint profiles_coins_ck check (coins_balance >= 0);
exception when duplicate_object then null; end $$;

-- ═══ ٢ · جداول جديدة ═══
create table if not exists qbank.subject_trials (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  subject_id   uuid not null references qbank.subjects(id) on delete cascade,
  started_at   timestamptz not null default now(),
  seconds_used int not null default 0,
  unique (user_id, subject_id)
);
create index if not exists trials_user_idx on qbank.subject_trials (user_id);

create table if not exists qbank.coin_transactions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  amount     int not null,
  reason     text not null default '',
  subject_id uuid references qbank.subjects(id) on delete set null,
  buyer_id   uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists coins_user_idx on qbank.coin_transactions (user_id, created_at desc);
-- مكافأة واحدة لكل مشترٍ في كل مادة: الشراء المكرر لا يُكرّر الكوينز
create unique index if not exists coins_once_uidx on qbank.coin_transactions (user_id, subject_id, buyer_id)
  where buyer_id is not null;

alter table qbank.subject_trials    enable row level security;
alter table qbank.coin_transactions enable row level security;

-- ═══ ٣ · سياسات RLS ═══
-- التجربة والمحفظة: كل طالب يرى سطوره وحده. الكتابة عبر الدوال لا مباشرة،
-- كي لا يكتب أحد seconds_used = 0 كل ثانية ويجعل التجربة أبدية.
drop policy if exists trials_select on qbank.subject_trials;
create policy trials_select on qbank.subject_trials for select using (user_id = auth.uid() or qbank.is_admin());

drop policy if exists coins_select on qbank.coin_transactions;
create policy coins_select on qbank.coin_transactions for select using (user_id = auth.uid() or qbank.is_admin());

-- المواد: المنشورة تُرى، والموقوفة لا يراها إلا صاحبها والمشرف
drop policy if exists subjects_select on qbank.subjects;
create policy subjects_select on qbank.subjects for select
  using (
    (published = true and status = 'published')
    or qbank.is_admin()
    or created_by = auth.uid()
  );

-- ═══ ٤ · دوال الوصول ═══
-- سقف التجربة بالثواني — مصدر واحد للرقم لا يتكرر في الواجهة والخادم
create or replace function qbank.trial_cap() returns int language sql immutable as $$ select 600 $$;

/*
  نبضة التجربة: تُستدعى كل ٣٠ ثانية من المتصفح.
  الزيادة تُقصّ في الخادم (٦٠ ثانية سقفًا للنبضة الواحدة) كي لا يُحقن رقم كبير،
  والمجموع لا يتجاوز السقف مهما تكرّرت النداءات.
  ولا تُفتح التجربة إلا لمنشئ المادة — الزميل يشتري مباشرة.
*/
create or replace function qbank.rpc_record_trial_heartbeat(subject_id uuid, interval_seconds int default 30)
returns jsonb language plpgsql security definer set search_path = qbank, public as $$
declare
  uid uuid := auth.uid();
  creator uuid;
  inc int := least(greatest(coalesce(interval_seconds, 30), 0), 60);
  used int;
  cap int := qbank.trial_cap();
  sid uuid := subject_id;   -- نسخة محلية: اسم المعامل يطابق اسم عمود، وPostgres يعتبره ملتبسًا
begin
  if uid is null then return jsonb_build_object('error','لا جلسة'); end if;
  select s.created_by into creator from qbank.subjects s where s.id = sid;
  if creator is null or creator <> uid then
    -- ليست مادته: لا تجربة أصلًا، ولا نُنشئ له سجلًا
    return jsonb_build_object('eligible', false, 'seconds_used', 0, 'seconds_left', 0, 'cap', cap);
  end if;

  -- تحديث ثم إدراج بدل on conflict: اسم المعامل يطابق اسم عمود،
  -- واستنتاج الفهرس في on conflict يصير ملتبسًا عند Postgres
  update qbank.subject_trials t
     set seconds_used = least(t.seconds_used + inc, cap)
   where t.user_id = uid and t.subject_id = sid
  returning t.seconds_used into used;

  if used is null then
    insert into qbank.subject_trials (user_id, subject_id, seconds_used)
    values (uid, sid, least(inc, cap))
    returning seconds_used into used;
  end if;

  return jsonb_build_object(
    'eligible', true, 'seconds_used', used,
    'seconds_left', greatest(cap - used, 0), 'cap', cap,
    'expired', used >= cap);
end $$;
revoke all on function qbank.rpc_record_trial_heartbeat(uuid, int) from public;
grant execute on function qbank.rpc_record_trial_heartbeat(uuid, int) to authenticated;

/*
  قرار الوصول الوحيد المعتمد. الواجهة تعرض، وهذه تحكم.
  الترتيب مقصود: الاستحقاق المدفوع أولًا كي لا يُستهلك رصيد تجربة من اشترى فعلًا.
*/
create or replace function qbank.subject_access(sid uuid)
returns jsonb language plpgsql stable security definer set search_path = qbank, public as $$
declare
  uid uuid := auth.uid();
  s record;
  used int := 0;
  cap int := qbank.trial_cap();
begin
  select * into s from qbank.subjects where id = sid;
  if s is null then return jsonb_build_object('allowed', false, 'reason','missing'); end if;
  if s.status <> 'published' then
    return jsonb_build_object('allowed', false, 'reason','suspended', 'price', s.price);
  end if;
  if qbank.is_admin() then return jsonb_build_object('allowed', true, 'reason','admin'); end if;
  if s.free then return jsonb_build_object('allowed', true, 'reason','free'); end if;
  if uid is null then return jsonb_build_object('allowed', false, 'reason','anon', 'price', s.price); end if;

  if exists (select 1 from qbank.entitlements e
             where e.user_id = uid and e.expires_at > now()
               and (e.kind = 'semester' or e.subject_id = sid)) then
    return jsonb_build_object('allowed', true, 'reason','entitled');
  end if;

  -- التجربة حكرٌ على المنشئ: هي مكافأته على الرفع، لا عيّنة مجانية للجميع
  if s.created_by = uid then
    select coalesce(t.seconds_used, 0) into used
      from qbank.subject_trials t where t.user_id = uid and t.subject_id = sid;
    if coalesce(used, 0) < cap then
      return jsonb_build_object('allowed', true, 'reason','trial',
        'seconds_used', coalesce(used,0), 'seconds_left', cap - coalesce(used,0), 'cap', cap);
    end if;
    return jsonb_build_object('allowed', false, 'reason','trial_expired',
      'seconds_used', cap, 'seconds_left', 0, 'cap', cap, 'price', s.price);
  end if;

  return jsonb_build_object('allowed', false, 'reason','paywall', 'price', s.price);
end $$;
revoke all on function qbank.subject_access(uuid) from public;
grant execute on function qbank.subject_access(uuid) to authenticated, anon;

-- ═══ ٥ · الكوينز ═══
create or replace function qbank.coins_per_sale() returns int language sql immutable as $$ select 50 $$;

/*
  تُستدعى من الخادم الموثوق بعد تأكيد الدفع (service_role) لا من المتصفح.
  ذرّية: السجل والرصيد في معاملة واحدة، والفهرس الفريد يمنع تكرار المكافأة.
*/
create or replace function qbank.award_referral_coins(sid uuid, buyer uuid, ref uuid)
returns jsonb language plpgsql security definer set search_path = qbank, public as $$
declare
  creator uuid;
  amt int := qbank.coins_per_sale();
  bal int;
begin
  select created_by into creator from qbank.subjects where id = sid;
  if creator is null then return jsonb_build_object('ok', false, 'reason','no_creator'); end if;
  -- الإحالة تُحترم فقط إن طابقت منشئ المادة: رابط مزوّر لا يحوّل المكافأة لغريب
  if ref is not null and ref <> creator then return jsonb_build_object('ok', false, 'reason','ref_mismatch'); end if;
  if buyer = creator then return jsonb_build_object('ok', false, 'reason','self_purchase'); end if;

  begin
    insert into qbank.coin_transactions (user_id, amount, reason, subject_id, buyer_id)
    values (creator, amt, 'بيع مادة عبر رابطك', sid, buyer);
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason','already_awarded');
  end;

  update qbank.profiles set coins_balance = coins_balance + amt
   where id = creator returning coins_balance into bal;
  return jsonb_build_object('ok', true, 'amount', amt, 'creator', creator, 'balance', bal);
end $$;
revoke all on function qbank.award_referral_coins(uuid, uuid, uuid) from public;
grant execute on function qbank.award_referral_coins(uuid, uuid, uuid) to service_role;

-- محفظتي: الرصيد والمبيعات — نداء واحد لشاشة الحساب
create or replace function qbank.my_wallet()
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select case when auth.uid() is null then jsonb_build_object('error','لا جلسة')
  else jsonb_build_object(
    'balance', (select coalesce(coins_balance,0) from qbank.profiles where id = auth.uid()),
    'sales',   (select count(*) from qbank.coin_transactions where user_id = auth.uid() and buyer_id is not null),
    'earned',  (select coalesce(sum(amount),0) from qbank.coin_transactions where user_id = auth.uid() and amount > 0),
    'subjects',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'slug', s.slug, 'status', s.status,
        'price', s.price, 'q_count', s.q_count, 'published', s.published,
        'sales', (select count(*) from qbank.coin_transactions c
                  where c.subject_id = s.id and c.buyer_id is not null)) order by s.created_at desc)
      from qbank.subjects s where s.created_by = auth.uid()), '[]'::jsonb),
    'ledger', coalesce((
      select jsonb_agg(row_to_json(t)) from (
        select amount, reason, created_at from qbank.coin_transactions
        where user_id = auth.uid() order by created_at desc limit 20) t), '[]'::jsonb)
  ) end
$$;
revoke all on function qbank.my_wallet() from public;
grant execute on function qbank.my_wallet() to authenticated;

-- لوحة المشرف: مواد الطلاب وإحصاءاتها
create or replace function qbank.admin_ugc()
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select case when not qbank.is_admin() then jsonb_build_object('error','غير مخوّل')
  else coalesce((
    select jsonb_agg(row_to_json(t) order by t.created_at desc) from (
      select s.id, s.name, s.slug, s.status, s.price, s.published, s.q_count,
             s.sanctity_mode, s.created_at, s.created_by,
             coalesce(nullif(p.name,''),'طالب') creator_name,
             (select count(*) from qbank.coin_transactions c where c.subject_id = s.id and c.buyer_id is not null) sales,
             (select coalesce(sum(c.amount),0) from qbank.coin_transactions c where c.subject_id = s.id) coins,
             (select count(*) from qbank.attempts a where a.subject_id = s.id) attempts
      from qbank.subjects s left join qbank.profiles p on p.id = s.created_by
      where s.created_by is not null) t), '[]'::jsonb) end
$$;
revoke all on function qbank.admin_ugc() from public;
grant execute on function qbank.admin_ugc() to authenticated;

-- ═══ توجيه PostgREST إلى الاسم الجديد ═══
-- هذه الخطوة كانت ناقصة وأسقطت الموقع: إعادة تسمية المخطط لا تُخبر PostgREST،
-- فيبقى يبحث عن amusq المعدوم ويفشل في بناء ذاكرة المخطط (PGRST002) إلى الأبد.
grant usage on schema qbank to authenticator, anon, authenticated, service_role;
alter role authenticator set pgrst.db_schemas = 'qbank, public';
alter role authenticator set pgrst.db_extra_search_path = 'public, extensions';

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
