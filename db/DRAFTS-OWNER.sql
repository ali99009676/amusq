-- ═══════════════════════════════════════════════════════════════════
-- المسوّدات: صاحبها يكتبها — لا المشرف وحده
-- ═══════════════════════════════════════════════════════════════════
-- العطل: سياسة الجدول بقيت من زمنٍ كانت المنصة فيه للمشرف وحده يرفع:
--
--     create policy drafts_all on qbank.drafts for all
--       using (qbank.is_admin()) with check (qbank.is_admin());
--
-- ثم فُتح الرفع للطلاب، وعُدّلت دالة approve_draft لتقبل صاحب المسوّدة
-- («mine := d.created_by = auth.uid()») — لكن سياسةَ الجدول لم تُعدَّل معها.
-- فصار الطالب يُسمح له بـ«اعتماد» مسوّدةٍ لا يُسمح له بإنشائها أصلًا.
--
-- وأثره في الشاشة مضلّل تمامًا: الرفع يعمل، والذكاء يشتغل، وتظهر «١٩ سؤالًا
-- جاهزًا»… لأن كل ذلك يجري في متصفّحه. والإدراج وحده هو ما تُسقطه السياسة،
-- بصمت. ثم يضغط «انشر» فيُقال له «المسوّدة غير موجودة» — وهي جملة صادقة
-- تصف النتيجة ولا تدلّ على السبب أبدًا.
--
-- والقاعدة العامة التي يُخالفها هذا: الصلاحية تُمنح للجدول والدالة معًا،
-- ومن يملك أن يعتمد شيئًا يملك أن يُنشئه.

drop policy if exists drafts_all on qbank.drafts;

-- القراءة والكتابة: لصاحب المسوّدة أو المشرف
create policy drafts_own on qbank.drafts for all
  using      (created_by = auth.uid() or qbank.is_admin())
  with check (created_by = auth.uid() or qbank.is_admin());

-- ═══ تحقّق ═══
select polname, pg_get_expr(polqual, polrelid) as using_expr
  from pg_policy
 where polrelid = 'qbank.drafts'::regclass;
