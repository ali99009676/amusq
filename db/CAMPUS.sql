-- ═══════════════════════════════════════════════════════════════════════════
--  مراجعة · قسم الجامعة — الطبقة التي تجعل لكل جامعة بيتًا
--
--  المشكلة التي يحلّها هذا الملف:
--  الطالب يرفع مادته فتذهب إلى قائمة عامة يختلط فيها مقرّر نجران بمقرّر
--  القاهرة. ولا مكان يجمع ما رفعه زملاؤه في جامعته هو. فيرفع كلٌّ وحده
--  ولا تتراكم فائدة. القسم يحلّها: صفحة لكل جامعة، رابط واحد يُشارَك في
--  مجموعة الدفعة، وكل مادة تصل إلى مكانها تلقائيًا من بيانات رافعها.
--
--  آمن التكرار بالكامل: لا drop لجدول ولا لعمود.
-- ═══════════════════════════════════════════════════════════════════════════
set search_path = qbank, public;

-- ═══ ١ · جامعة الطالب وكليته في ملفه الشخصي ═══
/*
  on delete set null لا cascade: لو حُذفت جامعة بالخطأ من لوحة المشرف
  فلا يُحذف معها حساب الطالب — يفقد انتماءه فقط ويعيد اختياره.
*/
alter table qbank.profiles add column if not exists university_id uuid references qbank.universities(id) on delete set null;
alter table qbank.profiles add column if not exists college_id    uuid references qbank.colleges(id)    on delete set null;

create index if not exists profiles_univ_idx on qbank.profiles (university_id);

-- ═══ ٢ · قائمة الجامعات للاختيار ═══
/*
  تختلف عن catalog_filters جوهريًا: تلك تعرض الجامعات التي فيها مواد
  منشورة فعلًا (للتصفية)، وهذه تعرض كل الجامعات المعروفة (للانتماء).
  أول طالب في جامعته يجب أن يجدها في القائمة قبل أن يرفع فيها شيئًا،
  وإلا كتب اسمها بيده فانقسمت الجامعة الواحدة إلى عشر تهجئات.
*/
create or replace function qbank.list_universities(q text default '', p_country text default '')
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select coalesce(jsonb_agg(x order by x->>'name'), '[]'::jsonb)
    from (
      select jsonb_build_object(
               'id', u.id, 'name', u.name, 'country', u.country,
               'city', u.city, 'verified', u.verified,
               'n', (select count(*) from qbank.subjects s
                      where s.university_id = u.id and s.published and s.status = 'published')
             ) x
        from qbank.universities u
       where (coalesce(p_country,'') = '' or u.country = p_country)
         and (coalesce(q,'') = '' or qbank.ar_norm(u.name) like '%' || qbank.ar_norm(q) || '%')
       order by u.name
       limit 300
    ) t
$$;
revoke all on function qbank.list_universities(text, text) from public;
grant execute on function qbank.list_universities(text, text) to anon, authenticated;

create or replace function qbank.list_colleges(p_university uuid)
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select coalesce(jsonb_agg(x order by x->>'name'), '[]'::jsonb)
    from (
      select jsonb_build_object(
               'id', c.id, 'name', c.name,
               'n', (select count(*) from qbank.subjects s
                      where s.college_id = c.id and s.published and s.status = 'published')
             ) x
        from qbank.colleges c
       where c.university_id = p_university
       order by c.name
       limit 200
    ) t
$$;
revoke all on function qbank.list_colleges(uuid) from public;
grant execute on function qbank.list_colleges(uuid) to anon, authenticated;

-- ═══ ٣ · صفحة القسم ═══
/*
  نداء واحد يُرجع كل ما تحتاجه الصفحة: الجامعة، وكلياتها بأعدادها،
  وموادها مرتّبة بالكلية ثم بالأكثر استخدامًا.

  لماذا نداء واحد لا ثلاثة؟ لأن الطالب يفتح الرابط على بيانات الجوال
  في ممر الكلية، وثلاثة نداءات متتابعة تعني ثلاث فرص للفشل وثلاثة انتظارات.

  security definer مع فلترة published داخل الدالة: القسم مفتوح للزائر
  غير المسجَّل — لأن الرابط يُشارَك في مجموعة الدفعة قبل أن يسجّل أحد.
*/
create or replace function qbank.university_page(p_uni uuid)
returns jsonb language plpgsql stable security definer set search_path = qbank, public as $$
declare
  uni jsonb;
  cols jsonb;
  subs jsonb;
  total int;
begin
  select jsonb_build_object(
           'id', u.id, 'name', u.name, 'name_en', u.name_en,
           'country', u.country, 'city', u.city, 'verified', u.verified)
    into uni
    from qbank.universities u
   where u.id = p_uni;

  if uni is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- الكليات التي فيها مادة منشورة واحدة على الأقل: كلية فارغة تُربك لا تُفيد
  select coalesce(jsonb_agg(x order by (x->>'n')::int desc, x->>'name'), '[]'::jsonb)
    into cols
    from (
      select jsonb_build_object('id', c.id, 'name', c.name, 'n', count(s.id)) x
        from qbank.colleges c
        join qbank.subjects s
          on s.college_id = c.id and s.published and s.status = 'published'
       where c.university_id = p_uni
       group by c.id, c.name
    ) t;

  select count(*)::int into total
    from qbank.subjects s
   where s.university_id = p_uni and s.published and s.status = 'published';

  /*
    سقف ٢٠٠ مادة: الصفحة تُعرض كاملة بلا ترقيم لأن جامعة واحدة لا تتجاوزه
    عمليًا. ولو تجاوزته يومًا فالعدد الكلي معروض ويقود الطالب إلى «استكشف»
    بمرشّح الجامعة — فلا يظنّ أن هذا كل ما فيها.
  */
  select coalesce(jsonb_agg(x order by (x->>'students')::int desc, (x->>'q_count')::int desc), '[]'::jsonb)
    into subs
    from (
      select jsonb_build_object(
               'id', s.id, 'name', s.name, 'descr', s.descr, 'icon', s.icon,
               'color', s.color, 'q_count', s.q_count, 'price', s.price,
               'free', s.free, 'slug', s.slug, 'course_code', s.course_code,
               'level', s.level, 'college_id', s.college_id,
               'college', c.name,
               'students', (select count(*) from qbank.enrollments e where e.subject_id = s.id)
             ) x
        from qbank.subjects s
        left join qbank.colleges c on c.id = s.college_id
       where s.university_id = p_uni and s.published and s.status = 'published'
       limit 200
    ) t;

  return jsonb_build_object(
    'ok', true, 'university', uni, 'colleges', cols,
    'subjects', subs, 'total', total);
end $$;
revoke all on function qbank.university_page(uuid) from public;
grant execute on function qbank.university_page(uuid) to anon, authenticated;

-- ═══ ٤ · انتماء الطالب: قراءة وكتابة ═══
create or replace function qbank.my_campus()
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select coalesce((
    select jsonb_build_object(
             'university_id', p.university_id,
             'university', u.name,
             'country', u.country,
             'college_id', p.college_id,
             'college', c.name)
      from qbank.profiles p
      left join qbank.universities u on u.id = p.university_id
      left join qbank.colleges     c on c.id = p.college_id
     where p.id = auth.uid()
  ), '{}'::jsonb)
$$;
revoke all on function qbank.my_campus() from public;
grant execute on function qbank.my_campus() to authenticated;

/*
  الحفظ يقبل الاسم نصًّا لا المعرّف فقط: الطالب الأول في جامعته لن يجدها
  في القائمة، ولو أجبرناه على الاختيار من موجود لما استطاع الانتماء أبدًا.
  ونمرّ على ensure_* فيتولّى الخادم توحيد الإملاء (ar_norm) — فلا تنقسم
  «جامعة الملك سعود» و«جامعه الملك سعود» إلى جامعتين.

  وتمرير اسم فارغ يمسح الانتماء: الطالب قد ينتقل أو يخطئ، فلا نحبسه فيه.
*/
create or replace function qbank.set_my_campus(
  p_country text default '', p_university text default '', p_college text default ''
) returns jsonb language plpgsql security definer set search_path = qbank, public as $$
declare
  uid uuid := auth.uid();
  uni uuid;
  col uuid;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;

  if btrim(coalesce(p_university,'')) <> '' and btrim(coalesce(p_country,'')) <> '' then
    uni := qbank.ensure_university(p_country, p_university);
    if btrim(coalesce(p_college,'')) <> '' and uni is not null then
      col := qbank.ensure_college(uni, p_college);
    end if;
  end if;

  update qbank.profiles
     set university_id = uni, college_id = col
   where id = uid;

  return qbank.my_campus();
end $$;
revoke all on function qbank.set_my_campus(text, text, text) from public;
grant execute on function qbank.set_my_campus(text, text, text) to authenticated;

notify pgrst, 'reload schema';
