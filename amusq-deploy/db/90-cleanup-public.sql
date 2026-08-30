-- تنظيف: إزالة كائنات AMUSQ التي أُنشئت سابقًا في public (كائناتنا حصرًا)
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.sync_q_count() cascade;
drop function if exists public.is_admin() cascade;
drop function if exists public.content_pack() cascade;
drop function if exists public.subject_questions(uuid) cascade;
drop function if exists public.approve_draft(uuid, boolean) cascade;
drop function if exists public.admin_students(int, int, text) cascade;
drop function if exists public.admin_attempts(uuid) cascade;
drop function if exists public.admin_stats() cascade;
drop function if exists public.board(int) cascade;
drop function if exists public.heartbeat(text) cascade;
drop function if exists public.delete_me() cascade;
drop function if exists public.can_access(uuid) cascade;
drop table if exists public.entitlements, public.devices, public.attempts, public.progress,
  public.enrollments, public.drafts, public.questions, public.subjects, public.profiles,
  public.settings cascade;
