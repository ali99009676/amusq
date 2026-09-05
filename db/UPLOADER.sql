-- ═══════════════════════════════════════════════════════════════════════════
--  مراجعة · الرافع والتعديل قبل النشر
--
--  ما طلبه علي: يرفع هو بنكًا أرسله له طالب، ويُسنده إلى ذلك الطالب على أنه
--  هو من رفعه — اسمه على المادة، ومدّة الرافع له، وعائده له. وللرافع، طالبًا
--  كان أو مشرفًا، أن يعود إلى ما رفعه ويعدّله قبل النشر. وبعد النشر يملك
--  المشرف القرار: يقفل التعديل على الرافع أو يفتحه له.
--
--  أربعة أشياء، كلٌّ في مكانه:
--  ١ · owner_edit: مفتاح المشرف «الرافع يعدّل بعد النشر». مقفل افتراضًا.
--  ٢ · الأسئلة: صاحب المادة يقرأ أسئلة مادته المخفية ويعدّلها ويحذف ويضيف
--      ما دامت غير منشورة (أو ما دام المفتاح مفتوحًا). السياسة القديمة كانت
--      تمنعه من قراءة أسئلته هو قبل النشر — فلا مراجعة ممكنة أصلًا.
--  ٣ · حارسان: غير المشرف لا يغيّر الرافع ولا التوثيق ولا السعر ولا الحالة
--      من أي شاشة (تُعاد قيمها بصمت كي لا يسقط حفظٌ سليم بسببها)، وبعد
--      النشر لا يمسّ الاسم والوصف والمحاور والتحليل والأسئلة ولا يُخفي
--      المادة — إلا بإذن.
--  ٤ · إسناد مادة لرافع: admin_set_uploader — للمشرف وحده، يكتب المالك
--      ويمنحه مدّة الرافع كما لو رفعها بيده.
--
--  ★ اقرأه قبل تنفيذه: يبدّل سياسة قراءة الأسئلة ويضيف قادحين على المواد
--    والأسئلة، ويصحّح حالة المواد المخفية (تحديث صفوف — لا حذف).
--  آمن التكرار: لا drop لجدول ولا لعمود ولا حذف لصفّ.
-- ═══════════════════════════════════════════════════════════════════════════
set search_path = qbank, public;

-- ═══ ١ · مفتاح المشرف ═══
alter table qbank.subjects add column if not exists owner_edit boolean not null default false;

-- ═══ ٢ · أسئلة المالك ═══
-- القراءة: المنشور للجميع، والمخفيّ لصاحبه والمشرف. كانت «المنشور أو المشرف»
-- فقط — فالطالب الذي ضغط «احفظ مخفية» لم يكن يرى أسئلته هو.
drop policy if exists questions_select on qbank.questions;
create policy questions_select on qbank.questions for select
  using (
    qbank.is_admin()
    or exists (select 1 from qbank.subjects s
                where s.id = subject_id
                  and (s.published = true or s.created_by = auth.uid()))
  );

-- الكتابة (إضافة، تعديل، حذف): للمالك ما دامت المادة غير منشورة، أو ما دام
-- المشرف فتح له التعديل بعد النشر. سياسة questions_owner_tag القديمة تبقى
-- (وسم «اختبار سابق» بعد النشر) — والقادح أدناه يحصرها في الوسم وحده.
drop policy if exists questions_owner_edit on qbank.questions;
create policy questions_owner_edit on qbank.questions for all
  using (exists (select 1 from qbank.subjects s
                  where s.id = subject_id and s.created_by = auth.uid()
                    and (s.published = false or s.owner_edit)))
  with check (exists (select 1 from qbank.subjects s
                  where s.id = subject_id and s.created_by = auth.uid()
                    and (s.published = false or s.owner_edit)));

-- ═══ ٣أ · حارس الأسئلة: بعد النشر لا يتغيّر إلا الوسم ═══
/*
  ★ الحارس في القاعدة لا في الواجهة.
  الواجهة تُخفي الأزرار، لكن PATCH مباشرًا لا يرى أزرارًا. وسياسة الوسم
  (questions_owner_tag) تسمح بالتحديث كلّه، فلولا هذا القادح لعدّل المالك
  نصّ سؤالٍ منشور من أداة المطوّر. الخادم (بلا جلسة مستخدم) والمشرف يمرّان.
*/
create or replace function qbank.questions_owner_guard()
returns trigger language plpgsql as $$
declare s record;
begin
  if auth.uid() is null or qbank.is_admin() then return new; end if;
  select published, owner_edit into s from qbank.subjects where id = new.subject_id;
  if s.published and not coalesce(s.owner_edit, false) then
    if new.q           is distinct from old.q
    or new.options     is distinct from old.options
    or new.answer      is distinct from old.answer
    or new.expl_ar     is distinct from old.expl_ar
    or new.expl_en     is distinct from old.expl_en
    or new.translation is distinct from old.translation
    or new.mnemonic    is distinct from old.mnemonic
    or new.topic       is distinct from old.topic
    or new.ord         is distinct from old.ord
    or new.subject_id  is distinct from old.subject_id then
      raise exception 'المادة منشورة — التعديل بعد النشر بإذن المشرف';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists questions_owner_guard_trg on qbank.questions;
create trigger questions_owner_guard_trg
  before update on qbank.questions
  for each row execute function qbank.questions_owner_guard();

-- ═══ ٣ب · حارس المادة ═══
/*
  ★ «مخفية» ليست «موقوفة».
  الإخفاء قرار الرافع (published=false) والإيقاف قرار المشرف (status). كانت
  approve_draft تكتب suspended للمخفية، فمن نشرها لاحقًا من المحرّر وجد
  status باقيةً على الإيقاف: البوّابة ترفض الجميع ورابط المشاركة يقول «غير
  متاحة» — وهي منشورة. الإدراج يُصحَّح هنا، والصفوف القديمة أسفل الملف.

  ★ وما لا يملكه غير المشرف يُعاد بصمت لا برفض: الختم بعد النشر يرسل
  status وcreated_by مع الجامعة والرمز في PATCH واحد؛ لو رفضنا الصفّ كله
  لسقطت الجامعة معه وصارت المادة بلا قسم.
*/
create or replace function qbank.subjects_owner_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    /* ★ الصف الجديد يبدأ بلا ثقة ولا سمعة — يمنحها المشرف لاحقًا.
       كان الحارس يحمي التعديل وحده، فيُدرج الرافع مادةً «موثَّقة» بتقييم
       خمس نجوم من مئة تقييم لم تحدث (تدقيق H-07). */
    if auth.uid() is not null and not qbank.is_admin() then
      new.verified := false; new.rating_avg := 0; new.rating_n := 0;
      new.owner_edit := false; new.q_count := 0;
      if new.status = 'suspended' then new.status := 'published'; end if;
    end if;
    if not new.published and new.status = 'suspended' then new.status := 'published'; end if;
    return new;
  end if;
  if auth.uid() is null or qbank.is_admin() then return new; end if;

  new.created_by := old.created_by;
  new.verified   := old.verified;
  new.price      := old.price;
  new.free       := old.free;
  new.status     := old.status;
  new.owner_edit := old.owner_edit;
  /* العدّاد يكتبه قادح الأسئلة (عمق ٢) لا الطالب مباشرة (عمق ١) */
  if pg_trigger_depth() <= 1 then new.q_count := old.q_count; end if;

  if old.published and not coalesce(old.owner_edit, false) then
    if new.published is distinct from old.published
    or new.name      is distinct from old.name
    or new.descr     is distinct from old.descr
    or new.topics    is distinct from old.topics
    or new.overview  is distinct from old.overview
    or new.memorize  is distinct from old.memorize
    or new.mistakes  is distinct from old.mistakes then
      raise exception 'المادة منشورة — التعديل بعد النشر بإذن المشرف';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists subjects_owner_guard_trg on qbank.subjects;
create trigger subjects_owner_guard_trg
  before insert or update on qbank.subjects
  for each row execute function qbank.subjects_owner_guard();

-- المواد التي حُفظت مخفيةً قبل اليوم: كانت «موقوفة» بلا قصد — نُعيدها فعّالة.
-- (الموقوفة بقرار المشرف تبقى published=true فلا يمسّها هذا السطر.)
update qbank.subjects set status = 'published'
 where published = false and status = 'suspended';

-- ═══ ٤ · إسناد مادة لرافع ═══
/*
  ★ الإسناد يمنح ما يمنحه الرفع.
  لو كُتب created_by وحده لظهر اسم الطالب على المادة ثم وجد جدار الدفع أمام
  «مادته»: المدّة التي يمنحها approve_draft للرافع لا تأتي مع تغيير عمود.
  فالدالة تكتب المالك وتمنحه المدّة معًا — بالرقم نفسه من الإعدادات.
*/
create or replace function qbank.admin_set_uploader(p_subject uuid, p_user uuid)
returns jsonb language plpgsql security definer set search_path = qbank, public as $$
declare
  days int;
  nm   text;
begin
  if not qbank.is_admin() then raise exception 'للمشرف وحده'; end if;
  select name into nm from qbank.profiles where id = p_user;
  if not found then raise exception 'الطالب غير موجود'; end if;
  update qbank.subjects set created_by = p_user where id = p_subject;
  if not found then raise exception 'المادة غير موجودة'; end if;

  select coalesce(uploader_days, 1) into days from qbank.settings where id = 1;
  insert into qbank.entitlements (user_id, subject_id, kind, source, expires_at)
  values (p_user, p_subject, 'subject', 'upload',
          case when coalesce(days, 1) <= 0 then now() + interval '100 years'
               else now() + make_interval(days => coalesce(days, 1)) end);
  return jsonb_build_object('ok', true, 'name', nullif(btrim(coalesce(nm, '')), ''));
end $$;
revoke all on function qbank.admin_set_uploader(uuid, uuid) from public;
grant execute on function qbank.admin_set_uploader(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';

-- ═══ تحقّق ═══
select
  (select count(*) from pg_policy where polrelid = 'qbank.questions'::regclass
     and polname in ('questions_select', 'questions_owner_edit'))                    as سياسات_الأسئلة,
  (select count(*) from pg_trigger where tgname in ('subjects_owner_guard_trg',
                                                    'questions_owner_guard_trg'))    as القادحان,
  (select count(*) from qbank.subjects where published = false and status = 'suspended') as مخفية_موقوفة_بقيت,
  (select count(*) from pg_proc where proname = 'admin_set_uploader')                as دالة_الإسناد;
