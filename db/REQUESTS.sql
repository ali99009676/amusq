-- ═══════════════════════════════════════════════════════════════════════════
--  مراجعة · «ارفعها عنّي» — طلب رفع مادة
--
--  الطريق الثاني إلى المنصة. الأول أن يرفع الطالب بنفسه: يقرأ القالب،
--  يراجع الأسئلة، يختار الإثراء، ينشر. وهو طريقٌ يجيده قليلون، وكل خطأ
--  فيه يصير مادةً معطوبة يذاكر منها غيره — وكل ضغطة «أثرِ بالذكاء» فاتورةٌ
--  تُدفع من جيب المنصة لا من جيبه.
--
--  فالثاني: يكتب اسم المادة، ويرفع ملفه، وينتهي دوره. المشرف يرفعها بيده
--  ويراجعها ويقرّر متى يستدعي الذكاء. والمادة تُنشر باسم صاحبها — الطالب
--  الذي جمع الأسئلة هو رافعها في كل شاشة، وله مدّتها وعائدها.
--
--  ما في هذا الملف:
--  ١ · جدول upload_requests: اسم المادة، ومسار الملف في المخزن، وحاله.
--  ٢ · سياساته: الطالب يرى طلباته هو ويلغي ما لم يُبدأ فيه، والمشرف يرى الكل.
--  ٣ · دوال المشرف: القائمة بأسماء أصحابها، وتغيير الحال.
--  ٤ · can_read_upload: هل يحقّ لهذا المستخدم قراءة هذا الملف؟ — الخادم
--      يسألها قبل أن يجلب ملفًا ليس في مجلد صاحب الجلسة.
--  ٥ · admin_inbox تحمل عدّاد الطلبات (وباقي مفاتيحها كما هي).
--
--  ★ اقرأه قبل تنفيذه: يُنشئ جدولًا جديدًا ويُعيد تعريف admin_inbox.
--  آمن التكرار: لا drop لجدول ولا لعمود ولا حذف لصفّ.
-- ═══════════════════════════════════════════════════════════════════════════
set search_path = qbank, public;

-- ═══ ١ · الجدول ═══
create table if not exists qbank.upload_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,                    -- اسم المادة كما كتبه صاحبها
  note         text not null default '',         -- ملاحظته للمشرف — اختيارية
  storage_path text not null,                    -- uploads/<uid>/… — يبدأ بمجلده هو
  filename     text not null default '',
  size_bytes   bigint not null default 0,
  status       text not null default 'new',      -- new | doing | done | rejected
  subject_id   uuid references qbank.subjects(id) on delete set null,
  admin_note   text not null default '',         -- سبب الرفض أو ملاحظة تُعرض لصاحبه
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
do $$ begin
  alter table qbank.upload_requests
    add constraint upload_requests_status_ck check (status in ('new','doing','done','rejected'));
exception when duplicate_object then null; end $$;

create index if not exists upload_requests_status_idx on qbank.upload_requests (status, created_at);
create index if not exists upload_requests_user_idx   on qbank.upload_requests (user_id, created_at desc);

alter table qbank.upload_requests enable row level security;

-- ═══ ٢ · السياسات ═══
/*
  ★ المسار يُفحص في القاعدة لا في المتصفح.
  الطلب يحمل مسار ملفٍ سيجلبه الخادم بمفتاح الخدمة — أي أنه يتجاوز RLS
  المخزن. فلو قبلنا مسارًا يكتبه العميل بحرّية لصار الطلبُ بابًا لقراءة
  ملفات الآخرين. الشرط: المسار يبدأ بمعرّف صاحب الطلب، وهو المجلد الوحيد
  الذي تسمح له سياسة المخزن بالكتابة فيه أصلًا.
*/
drop policy if exists upload_requests_own on qbank.upload_requests;
create policy upload_requests_own on qbank.upload_requests for select
  using (user_id = auth.uid() or qbank.is_admin());

drop policy if exists upload_requests_insert on qbank.upload_requests;
create policy upload_requests_insert on qbank.upload_requests for insert
  with check (
    user_id = auth.uid()
    and btrim(name) <> ''
    and position(auth.uid()::text || '/' in storage_path) = 1
    and status = 'new'
  );

/* الإلغاء لصاحبه ما دام لم يُبدأ فيه — وبعد أن يبدأ المشرف يصير الحذف تضييعًا لعمله */
drop policy if exists upload_requests_del on qbank.upload_requests;
create policy upload_requests_del on qbank.upload_requests for delete
  using ((user_id = auth.uid() and status = 'new') or qbank.is_admin());

/* التحديث للمشرف وحده — الحال يقرّرها من ينفّذ الطلب لا من طلبه */
drop policy if exists upload_requests_upd on qbank.upload_requests;
create policy upload_requests_upd on qbank.upload_requests for update
  using (qbank.is_admin()) with check (qbank.is_admin());

-- ═══ ٣ · دوال المشرف ═══
create or replace function qbank.admin_upload_requests(p_status text default '')
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select case when not qbank.is_admin() then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', r.id, 'name', r.name, 'note', r.note,
             'storage_path', r.storage_path, 'filename', r.filename, 'size_bytes', r.size_bytes,
             'status', r.status, 'subject_id', r.subject_id, 'admin_note', r.admin_note,
             'created_at', r.created_at, 'updated_at', r.updated_at,
             'user_id', r.user_id,
             'student', nullif(btrim(coalesce(p.name, '')), ''),
             'email', u.email,
             'avatar', p.avatar,
             'university', un.name,
             'uploads', (select count(*) from qbank.subjects s
                          where s.created_by = r.user_id and s.published = true))
           order by r.created_at)
      from qbank.upload_requests r
      left join qbank.profiles     p  on p.id  = r.user_id
      left join auth.users         u  on u.id  = r.user_id
      left join qbank.universities un on un.id = p.university_id
     where coalesce(p_status, '') = '' or r.status = p_status), '[]'::jsonb) end
$$;
revoke all on function qbank.admin_upload_requests(text) from public;
grant execute on function qbank.admin_upload_requests(text) to authenticated;

/*
  تغيير الحال. والمادة تُربط بالطلب عند الإنجاز كي يرى صاحبه رابطها —
  «رُفعت مادتك» أصدق من «تمّ» بلا شيء يُفتح.
*/
create or replace function qbank.admin_request_status(
  p_id uuid, p_status text, p_subject uuid default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = qbank, public as $$
declare r qbank.upload_requests%rowtype;
begin
  if not qbank.is_admin() then raise exception 'للمشرف وحده'; end if;
  if p_status not in ('new','doing','done','rejected') then raise exception 'حال غير معروفة'; end if;
  update qbank.upload_requests
     set status     = p_status,
         subject_id = coalesce(p_subject, subject_id),
         admin_note = coalesce(p_note, admin_note),
         updated_at = now()
   where id = p_id
   returning * into r;
  if not found then raise exception 'الطلب غير موجود'; end if;
  return jsonb_build_object('ok', true, 'status', r.status);
end $$;
revoke all on function qbank.admin_request_status(uuid, text, uuid, text) from public;
grant execute on function qbank.admin_request_status(uuid, text, uuid, text) to authenticated;

-- ═══ ٤ · هل يحقّ لهذا المستخدم قراءة هذا الملف؟ ═══
/*
  ★ الخادم يسأل ولا يفترض.
  كان يجلب من المخزن بشرطٍ واحد: أن يبدأ المسار بمعرّف صاحب الجلسة. وهذا
  يمنع المشرف من قراءة الملف الذي أرسله الطالب — وهو جوهر «ارفعها عنّي».
  فالسؤال ينتقل إلى القاعدة: مجلدك، أو مشرف، أو ملفٌ في طلبٍ قائم. ولا
  يُوسَّع الإذن إلى ملفات لا طلب عليها.
*/
create or replace function qbank.can_read_upload(p_path text)
returns boolean language sql stable security definer set search_path = qbank, public as $$
  select coalesce(
    position(auth.uid()::text || '/' in coalesce(p_path, '')) = 1
    or qbank.is_admin(), false)
$$;
revoke all on function qbank.can_read_upload(text) from public;
grant execute on function qbank.can_read_upload(text) to authenticated;

-- ═══ ٥ · عدّاد الوارد ═══
-- (المفاتيح القديمة كما هي — أُضيف إليها الطلبات وأقدمُها)
create or replace function qbank.admin_inbox()
returns jsonb language plpgsql security definer set search_path = qbank, public as $$
declare out jsonb;
begin
  if not qbank.is_admin() then return jsonb_build_object('error','admin only'); end if;
  select jsonb_build_object(
    'purchases', (select count(*) from qbank.purchase_requests where status = 'pending'),
    'phones',    (select count(*) from qbank.phone_claims
                   where status = 'pending' and expires_at > now()),
    'payouts',   (select count(*) from qbank.payouts where status = 'requested'),
    'drafts',    (select count(*) from qbank.drafts where status = 'reviewing'),
    'reports',   (select count(*) from qbank.reports where status = 'open'),
    'requests',  (select count(*) from qbank.upload_requests where status in ('new','doing')),
    'oldest_request', (select min(created_at) from qbank.upload_requests where status = 'new'),
    'oldest_purchase', (select min(created_at) from qbank.purchase_requests where status = 'pending'),
    'review_eta', (select review_eta from qbank.settings limit 1)
  ) into out;
  return out;
end $$;
revoke all on function qbank.admin_inbox() from public;
grant execute on function qbank.admin_inbox() to authenticated;

notify pgrst, 'reload schema';

-- ═══ تحقّق ═══
select
  (select count(*) from information_schema.tables
    where table_schema = 'qbank' and table_name = 'upload_requests')          as الجدول,
  (select count(*) from pg_policy where polrelid = 'qbank.upload_requests'::regclass) as السياسات,
  (select count(*) from pg_proc
    where proname in ('admin_upload_requests','admin_request_status','can_read_upload')) as الدوال,
  /* الوارد يُفحص بنصّه لا بندائه: النداء من المحرّر بلا auth.uid() يردّ «للمشرف وحده» */
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'qbank' and p.proname = 'admin_inbox'
      and p.prosrc like '%upload_requests%')                                  as الوارد_فيه_الطلبات;
