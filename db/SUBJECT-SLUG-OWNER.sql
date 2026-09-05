-- ═══════════════════════════════════════════════════════════════════
-- «المادة غير متاحة» بعد نشرها مباشرة — عطلان في موضعين
-- ═══════════════════════════════════════════════════════════════════
--
-- ما رآه الرافع: ينشر مادته بنجاح، ثم يفتح رابطها فيُقال له «المادة غير
-- متاحة — ربما أوقفها المشرف». وهي متاحة، وهو من أنشأها قبل ثانية.
--
-- السبب الأول: approve_draft تُنشئ الصف بلا slug إطلاقًا، والواجهة تبني
-- الرابط من slug حسبته في المتصفح ولم يُكتب في القاعدة قط. فالرابط يشير
-- إلى لا شيء.
--
-- السبب الثاني: كانت الواجهة تحاول كتابته بعد الاعتماد (PATCH على
-- subjects)، لكن سياسة الجدول «للمشرف وحده» — نفس خلل المسوّدات: فُتح
-- الرفع للطلاب ولم تُفتح الصلاحية معه.
--
-- والعلاج هنا لا يفتح المواد للطلاب على مصراعيها: المالك يعدّل مادته هو
-- وحدها، والـslug يُولَّد داخل الدالة نفسها فلا يعتمد على صلاحيةٍ خارجها.

-- ═══ ١) توليد slug عربي/لاتيني آمن ومضمون التفرّد ═══
create or replace function qbank.make_slug(p_name text, p_id uuid)
returns text language plpgsql stable as $$
declare
  base text;
begin
  -- نُبقي الحروف والأرقام (بما فيها العربية) ونحوّل ما عداها إلى شرطة
  base := lower(btrim(coalesce(p_name, ''), ' '));
  base := regexp_replace(base, '[^[:alnum:]ء-ي]+', '-', 'g');
  base := btrim(base, '-');
  base := left(nullif(base, ''), 40);
  -- ذيلٌ من المعرّف: يضمن التفرّد بلا حلقة محاولات، ويبقي الرابط مقروءًا
  return coalesce(base, 'subject') || '-' || left(replace(p_id::text, '-', ''), 6);
end $$;

-- ═══ ٢) الاعتماد يكتب الـslug بنفسه ═══
-- لا نعيد كتابة approve_draft كاملة: نضيف سطرًا واحدًا بعد إنشاء المادة.
-- وهذا أسلم من إعادة صياغة دالة معتمدة تعمل.
create or replace function qbank.fill_missing_slug()
returns trigger language plpgsql as $$
begin
  if new.slug is null or btrim(new.slug) = '' then
    new.slug := qbank.make_slug(new.name, new.id);
  end if;
  return new;
end $$;

/*
  ★ على الإدراج والتحديث معًا.
  كان على الإدراج وحده، فيملأ الرابط ثم يأتي تحديثٌ من الواجهة يكتب null
  فوقه فيمحوه — وتصير المادة «غير متاحة» وهي منشورة سليمة. وحارسٌ يحمي
  بابًا ويترك الآخر مفتوحًا ليس حارسًا.
*/
drop trigger if exists subjects_slug_trg on qbank.subjects;
create trigger subjects_slug_trg
  before insert or update on qbank.subjects
  for each row execute function qbank.fill_missing_slug();

-- والمواد القائمة بلا slug تُعالَج مرة واحدة
update qbank.subjects
   set slug = qbank.make_slug(name, id)
 where slug is null or btrim(slug) = '';

-- ═══ ٣) المالك يعدّل مادته — لا مواد الناس ═══
/*
  ★ ثلاث سياسات لا «for all» واحدة: الحذف له شرطه الخاص.
  مادةٌ اشتراها أحد لا يمحوها رافعها — الحذف يُسقط أسئلتها من تحت من
  دفع ثمنها (تدقيق H-07). المشرف وحده يحذف المبيع.
*/
drop policy if exists subjects_write  on qbank.subjects;
drop policy if exists subjects_insert on qbank.subjects;
drop policy if exists subjects_update on qbank.subjects;
drop policy if exists subjects_delete on qbank.subjects;
create policy subjects_insert on qbank.subjects for insert
  with check (qbank.is_admin() or created_by = auth.uid());
create policy subjects_update on qbank.subjects for update
  using      (qbank.is_admin() or created_by = auth.uid())
  with check (qbank.is_admin() or created_by = auth.uid());
create policy subjects_delete on qbank.subjects for delete
  using (qbank.is_admin() or (created_by = auth.uid()
         and not exists (select 1 from qbank.entitlements e
                          where e.subject_id = qbank.subjects.id and e.user_id <> auth.uid())));

-- ═══ تحقّق ═══
select count(*) filter (where slug is null or btrim(slug) = '') as بلا_رابط,
       count(*) as المجموع
  from qbank.subjects;
