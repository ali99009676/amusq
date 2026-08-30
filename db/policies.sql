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
