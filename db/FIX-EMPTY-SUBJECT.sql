-- ═══════════════════════════════════════════════════════════════════════════
--  مراجعة · إصلاح: لا تُنشر مادة بلا أسئلة
--
--  ما حدث فعلًا:
--  رُفع ملف لم يتعرّف المحلّل على سؤال واحد فيه. تقدّم المعالج صامتًا إلى
--  «راجع» فبدت الشاشة فارغة، ثم قَبِل «انشر» — فأُنشئت مادة منشورة بصفر
--  أسئلة، ظهرت في «استكشف» ولا شيء فيها.
--
--  أُصلحت الواجهة بأربعة حرّاس، وهذا الخامس في القاعدة: الواجهة تُخدع
--  (تبويب قديم، مسوّدة محفوظة، نداء مباشر) والقاعدة لا تُخدع.
--
--  آمن التكرار: لا drop لجدول ولا لعمود.
-- ═══════════════════════════════════════════════════════════════════════════
set search_path = qbank, public;

create or replace function qbank.approve_draft(draft_id uuid, publish boolean)
returns uuid language plpgsql security definer set search_path = qbank, public as $$
declare
  d   qbank.drafts%rowtype;
  sid uuid;
  q   jsonb;
  i   int := 0;
  n   int;
begin
  if not qbank.is_admin() then raise exception 'غير مخوّل'; end if;

  select * into d from qbank.drafts where id = draft_id;
  if not found then raise exception 'المسوّدة غير موجودة'; end if;

  -- ★ الحارس: مادة بلا سؤال واحد ليست مادة
  n := jsonb_array_length(coalesce(d.payload, '[]'::jsonb));
  if n = 0 then
    raise exception 'هذه المسوّدة بلا أسئلة — لا يمكن نشر بنك فارغ';
  end if;

  insert into qbank.subjects (name, published, q_count)
  values (coalesce(nullif(d.name,''), d.source_name), publish, n)
  returning id into sid;

  for q in select * from jsonb_array_elements(d.payload) loop
    i := i + 1;
    insert into qbank.questions
      (subject_id, ord, q, options, answer, expl_ar, expl_en, translation,
       mnemonic, topic, derived, opts_built, important)
    values (
      sid, i,
      q->>'q',
      coalesce(q->'options','[]'::jsonb),
      coalesce((q->>'answer')::int, 0),
      coalesce(q->>'expl_ar',''), coalesce(q->>'expl_en',''),
      coalesce(q->>'translation',''),
      coalesce(q->'mnemonic','{}'::jsonb),
      coalesce(q->>'topic',''),
      coalesce((q->>'derived')::boolean, false),
      coalesce((q->>'opts_built')::boolean, false),
      coalesce((q->>'important')::boolean, false)
    );
  end loop;

  /*
    ★ العدّاد من الواقع لا من النية.
    كان q_count يُترك على صفره ويُحدَّث لاحقًا من مكان آخر — فمادةٌ نُشرت
    بخطأ بقيت تقول «٠ سؤالًا» وهي مليئة، أو العكس. نضبطه هنا من عدد
    الصفوف المُدرَجة فعلًا: الرقم الوحيد الذي لا يكذب.
  */
  update qbank.subjects set q_count = i where id = sid;

  update qbank.drafts set status = case when publish then 'approved' else 'hidden' end,
    updated_at = now() where id = draft_id;
  return sid;
end $$;

/*
  تنظيف ما نتج عن العطل: كل مادة منشورة بلا سؤال واحد تُخفى لا تُحذف.
  ★ الإخفاء لا الحذف: قد تكون لمادة رفعها طالب وينتظرها، وحذفها يفقده
  اسمه وتاريخه. الإخفاء يوقف الضرر ويُبقي القرار لصاحبه.
*/
/*
  ★ 'suspended' لا 'hidden'.
  قيد subjects_status_ck يقبل ثلاث قيم فقط: published | suspended | removed.
  كتبتُ 'hidden' فرفضتها القاعدة — وهذا هو الصواب من القيد: حالةٌ لا يعرفها
  النظام لا يجوز أن تدخله. و«موقوفة» هي ما تعرضه الواجهة للطالب فعلًا.
*/
update qbank.subjects s
   set published = false, status = 'suspended'
 where s.published
   and not exists (select 1 from qbank.questions q where q.subject_id = s.id);

-- وتصحيح كل عدّاد لا يطابق الواقع
update qbank.subjects s
   set q_count = (select count(*) from qbank.questions q where q.subject_id = s.id)
 where s.q_count <> (select count(*) from qbank.questions q where q.subject_id = s.id);

notify pgrst, 'reload schema';
