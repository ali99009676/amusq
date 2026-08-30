-- AMUSQ · صلاحيات RLS — تُنفَّذ بعد schema.sql
-- القاعدة: الطالب لا يقرأ ولا يكتب إلا صفوفه، والمشرف يقرأ الجميع عبر is_admin()،
-- والأسئلة لا تُقرأ إلا لمادة منشورة، والمسوّدات لا يراها إلا المشرف.

-- security definer كي تعمل داخل السياسات دون اصطدام RLS نفسه بجدول profiles
create or replace function amusq.is_admin()
returns boolean language sql security definer stable set search_path = amusq, public as $$
  select coalesce((select is_admin from amusq.profiles where id = auth.uid()), false)
$$;

alter table amusq.profiles     enable row level security;
alter table amusq.subjects     enable row level security;
alter table amusq.questions    enable row level security;
alter table amusq.drafts       enable row level security;
alter table amusq.enrollments  enable row level security;
alter table amusq.progress     enable row level security;
alter table amusq.attempts     enable row level security;
alter table amusq.devices      enable row level security;
alter table amusq.entitlements enable row level security;
alter table amusq.settings     enable row level security;

-- profiles: كلٌّ يرى ويحرّر ملفه، والمشرف يرى الجميع. لا أحد يرفع نفسه مشرفًا من العميل.
drop policy if exists profiles_select on amusq.profiles;
create policy profiles_select on amusq.profiles for select
  using (id = auth.uid() or amusq.is_admin());
drop policy if exists profiles_update on amusq.profiles;
create policy profiles_update on amusq.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid() and is_admin = (select p.is_admin from amusq.profiles p where p.id = auth.uid()));

-- subjects: المنشور للجميع (حتى الزائر يرى المادة المجانية)، وكلها للمشرف، والكتابة للمشرف فقط
drop policy if exists subjects_select on amusq.subjects;
create policy subjects_select on amusq.subjects for select
  using (published = true or amusq.is_admin());
drop policy if exists subjects_write on amusq.subjects;
create policy subjects_write on amusq.subjects for all
  using (amusq.is_admin()) with check (amusq.is_admin());

-- questions: لا تُقرأ إلا لمادة منشورة — هذه هي طبقة «لا يصل الطالب سؤالًا غير معتمد» في القاعدة
drop policy if exists questions_select on amusq.questions;
create policy questions_select on amusq.questions for select
  using (amusq.is_admin() or exists
    (select 1 from amusq.subjects s where s.id = subject_id and s.published = true));
drop policy if exists questions_write on amusq.questions;
create policy questions_write on amusq.questions for all
  using (amusq.is_admin()) with check (amusq.is_admin());

-- drafts: للمشرف حصرًا — قراءةً وكتابة
drop policy if exists drafts_all on amusq.drafts;
create policy drafts_all on amusq.drafts for all
  using (amusq.is_admin()) with check (amusq.is_admin());

-- enrollments / progress / attempts / devices / entitlements: صفوف صاحبها فقط + قراءة المشرف
drop policy if exists enroll_own on amusq.enrollments;
create policy enroll_own on amusq.enrollments for all
  using (user_id = auth.uid() or amusq.is_admin())
  with check (user_id = auth.uid());

drop policy if exists progress_own on amusq.progress;
create policy progress_own on amusq.progress for all
  using (user_id = auth.uid() or amusq.is_admin())
  with check (user_id = auth.uid());

drop policy if exists attempts_own on amusq.attempts;
create policy attempts_own on amusq.attempts for all
  using (user_id = auth.uid() or amusq.is_admin())
  with check (user_id = auth.uid());

drop policy if exists devices_own on amusq.devices;
create policy devices_own on amusq.devices for all
  using (user_id = auth.uid() or amusq.is_admin())
  with check (user_id = auth.uid());

-- الاستحقاقات: يقرؤها صاحبها، ولا يكتبها إلا الخادم (service role يتجاوز RLS) أو المشرف
drop policy if exists entitlements_select on amusq.entitlements;
create policy entitlements_select on amusq.entitlements for select
  using (user_id = auth.uid() or amusq.is_admin());
drop policy if exists entitlements_admin on amusq.entitlements;
create policy entitlements_admin on amusq.entitlements for all
  using (amusq.is_admin()) with check (amusq.is_admin());

-- settings: قراءة للجميع (نص الترحيب يظهر للزائر)، كتابة للمشرف
drop policy if exists settings_select on amusq.settings;
create policy settings_select on amusq.settings for select using (true);
drop policy if exists settings_write on amusq.settings;
create policy settings_write on amusq.settings for update
  using (amusq.is_admin()) with check (amusq.is_admin());
