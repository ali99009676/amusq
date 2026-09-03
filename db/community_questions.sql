-- عزل الأسئلة المولّدة من رفع الطلاب عن بنك الدكتور.
--
-- لماذا جدول منفصل لا عمودًا في `questions`:
-- العزل الذي طلبه علي يجب أن يكون بنيويًا لا مرئيًا فقط. عمود `is_ai`
-- في الجدول نفسه يعني أن أي استعلام يَنسى شرط التصفية يسرّب المولَّد
-- إلى بنك الدكتور. جدولان لا يختلطان يجعل التسريب مستحيلًا لا مستبعدًا.

create table if not exists community_questions (
  id            uuid primary key default gen_random_uuid(),
  subject_id    uuid not null references subjects(id) on delete cascade,

  -- النصّ كما خرج من الاستخراج. لا يُحرَّر بعد الحفظ.
  text          text not null,
  options       jsonb not null,
  answer        text,                       -- null = لم يُطابَق بجدول إجابات

  -- من أين جاءت الإجابة. false يعني: من المصدر نفسه لا من النموذج.
  derived       boolean not null default true,
  source_kind   text not null check (source_kind in ('extract','generate')),

  -- من رفع، وأي ملف، وأي صفحة — لتتبّع أي بلاغ إلى أصله
  uploader_id   uuid not null references auth.users(id) on delete cascade,
  source_label  text,                       -- اسم الملف كما سمّاه الطالب
  source_page   int,
  model_id      text,                       -- أي نموذج أنتجها

  -- الإشراف: الحالة الافتراضية منشورة، والبلاغان يخفيانها تلقائيًا
  status        text not null default 'live'
                check (status in ('live','hidden','promoted','rejected')),
  reports       int  not null default 0,
  promoted_to   uuid references questions(id),  -- إن اعتمدها المشرف

  created_at    timestamptz not null default now()
);

create index if not exists cq_subject_status on community_questions (subject_id, status);
create index if not exists cq_uploader       on community_questions (uploader_id);

-- بلاغ واحد لكل طالب على كل سؤال — يمنع إخفاء سؤال سليم بتكرار البلاغ
create table if not exists community_reports (
  question_id uuid not null references community_questions(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  reason      text,
  created_at  timestamptz not null default now(),
  primary key (question_id, user_id)
);

-- الإخفاء التلقائي عند بلاغين: قرار سياسة يُنفَّذ في القاعدة لا في الواجهة،
-- كي لا يعتمد على نداء قد يُنسى من أي مسار جديد.
create or replace function bump_report_count() returns trigger
language plpgsql security definer as $$
begin
  update community_questions
     set reports = reports + 1,
         status  = case when reports + 1 >= 2 and status = 'live' then 'hidden' else status end
   where id = new.question_id;
  return new;
end $$;

drop trigger if exists on_community_report on community_reports;
create trigger on_community_report after insert on community_reports
  for each row execute function bump_report_count();

-- ————— RLS —————
alter table community_questions enable row level security;
alter table community_reports   enable row level security;

-- الطالب يرى المنشور، ويرى ما رفعه هو ولو أُخفي
create policy cq_read on community_questions for select
  using (status = 'live' or uploader_id = auth.uid());

create policy cq_insert on community_questions for insert
  with check (uploader_id = auth.uid());

-- لا تعديل ولا حذف من الطالب: النصّ بعد الحفظ لا يُمسّ.
-- الحذف الوحيد المسموح هو الشلّالي عند حذف الحساب (on delete cascade أعلاه)،
-- وهو شرط متجر آبل في معيار القبول الثامن.

create policy cr_insert on community_reports for insert
  with check (user_id = auth.uid());
create policy cr_read on community_reports for select
  using (user_id = auth.uid());

-- حصّة الرفع: تمنع طالبًا واحدًا من استنزاف رصيد الذكاء للجميع
create table if not exists upload_quota (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  pages     int not null default 0,
  period    date not null default current_date
);
