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
