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
