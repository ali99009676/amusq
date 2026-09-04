-- ═══════════════════════════════════════════════════════════════════
-- قسم الجامعة — النصف الخلفي
-- ═══════════════════════════════════════════════════════════════════
-- الواجهة كانت مبنيّة كاملة (51-campus.js وشاشة القسم وشريط الجامعة)
-- وتنادي أربع دوال لم تكن موجودة في القاعدة، فترجع ٤٠١ عند كل فتحة.
-- الفحص ٧٦ كان يمسك هذا منذ كُتب، لكنه توقّف عند غياب الملف فبدا عطلًا
-- في الفحص لا نقصًا في الميزة.
--
-- آمن للتكرار: لا يحذف جدولًا ولا عمودًا، وتشغيله مرتين لا يغيّر شيئًا.
-- يعتمد على CATALOG.sql (الجامعات والكليات و ar_norm و ensure_university)
-- فشغّله بعده.

-- ═══ ١ · انتماء الطالب ═══
-- في profiles لا في جدول جديد: الانتماء صفة للحساب لا كيان مستقل.
-- و on delete set null مقصود: حذف جامعة لا يحذف حساب طالب — يفقد
-- انتماءه فقط ويختاره من جديد. الأشدّ (cascade) يمحو طالبًا بريئًا.
alter table qbank.profiles add column if not exists university_id uuid
  references qbank.universities(id) on delete set null;
alter table qbank.profiles add column if not exists college_id uuid
  references qbank.colleges(id) on delete set null;

create index if not exists profiles_univ_idx on qbank.profiles (university_id);

-- ═══ ٢ · قراءة الانتماء ═══
-- ترجع الأسماء لا المعرّفات وحدها: الشريط يعرض «جامعة الملك سعود · طب»
-- فورًا بلا نداء ثانٍ لترجمة المعرّف إلى اسم.
create or replace function qbank.my_campus()
returns json language plpgsql security definer
set search_path = qbank, public as $$
declare r json;
begin
  if auth.uid() is null then return null; end if;
  select json_build_object(
           'university_id', u.id, 'university', u.name,
           'country', u.country, 'city', u.city, 'verified', u.verified,
           'college_id', c.id, 'college', c.name)
    into r
    from qbank.profiles p
    left join qbank.universities u on u.id = p.university_id
    left join qbank.colleges     c on c.id = p.college_id
   where p.id = auth.uid();
  return r;
end $$;
revoke all on function qbank.my_campus() from public;
grant execute on function qbank.my_campus() to authenticated;

-- ═══ ٣ · حفظ الانتماء ═══
-- الجامعة تُكتب بالاسم لا بالمعرّف: الطالب الأول في جامعته لن يجدها في
-- قائمة، فيكتبها. والمرور على ensure_university هو ما يمنع تفتّت الجامعة
-- الواحدة إلى تهجئات — «الملك سعود» و«الملك سُعود» جامعة واحدة.
-- واسم فارغ يعني المسح: من ترك جامعته يمحو انتماءه لا يعلق فيه.
create or replace function qbank.set_my_campus(
  p_country text, p_university text, p_college text)
returns json language plpgsql security definer
set search_path = qbank, public as $$
declare uid uuid := auth.uid(); v_uni uuid; v_col uuid;
begin
  if uid is null then raise exception 'لا جلسة'; end if;

  if btrim(coalesce(p_university,'')) = '' then
    update qbank.profiles set university_id = null, college_id = null where id = uid;
    return qbank.my_campus();
  end if;

  v_uni := qbank.ensure_university(p_country, p_university);
  if btrim(coalesce(p_college,'')) <> '' then
    v_col := qbank.ensure_college(v_uni, p_college);
  end if;

  -- الكتابة لصاحب الجلسة وحده — لا معرّف يُمرَّر من المتصفح
  update qbank.profiles set university_id = v_uni, college_id = v_col where id = uid;
  return qbank.my_campus();
end $$;
revoke all on function qbank.set_my_campus(text, text, text) from public;
grant execute on function qbank.set_my_campus(text, text, text) to authenticated;

-- ═══ ٤ · صفحة القسم ═══
-- مفتوحة للزائر عمدًا: الرابط هو الميزة، ويُشارَك في مجموعة الدفعة قبل
-- أن يسجّل أحد. ولا يتسرّب منها محتوى — أسماء المواد وأعدادها فقط،
-- والأسئلة خلف بوابتها كما هي.
create or replace function qbank.university_page(p_uni uuid)
returns json language plpgsql security definer
set search_path = qbank, public as $$
declare u record; total int; subs json; cols json;
begin
  select id, name, name_en, city, country, verified into u
    from qbank.universities where id = p_uni;
  if not found then return json_build_object('ok', false); end if;

  select count(*) into total from qbank.subjects s
   where s.university_id = p_uni and s.published and s.status = 'published';

  -- سقف ستين: القسم صفحة تصفّح لا تصدير. والبقية في «استكشف» بترقيم صفحات.
  select coalesce(json_agg(x), '[]'::json) into subs from (
    select s.id, s.name, s.slug, s.color, s.icon, s.descr, s.q_count,
           s.course_code, s.free, s.price, s.college_id,
           (select count(*) from qbank.enrollments e where e.subject_id = s.id) as students
      from qbank.subjects s
     where s.university_id = p_uni and s.published and s.status = 'published'
     order by s.q_count desc, s.name
     limit 60
  ) x;

  select coalesce(json_agg(json_build_object('id', c.id, 'name', c.name) order by c.name), '[]'::json)
    into cols from qbank.colleges c where c.university_id = p_uni;

  return json_build_object('ok', true, 'university', row_to_json(u),
                           'total', total, 'subjects', subs, 'colleges', cols);
end $$;
revoke all on function qbank.university_page(uuid) from public;
grant execute on function qbank.university_page(uuid) to anon, authenticated;

-- ═══ ٥ · قوائم الاقتراح ═══
-- حقل حر مع اقتراحات لا قائمة مغلقة. والاقتراحات تتبع دولة الطالب:
-- خمس وثلاثون جامعة تُربك، وجامعات دولته تُفيد.
create or replace function qbank.list_universities(q text, p_country text)
returns json language plpgsql security definer
set search_path = qbank, public as $$
declare r json; nq text := qbank.ar_norm(coalesce(q,'')); cc text := upper(btrim(coalesce(p_country,'')));
begin
  select coalesce(json_agg(json_build_object(
           'id', u.id, 'name', u.name, 'country', u.country,
           'city', u.city, 'verified', u.verified) order by u.verified desc, u.name), '[]'::json)
    into r from (
      select * from qbank.universities uu
       where (cc = '' or uu.country = cc)
         and (nq = '' or qbank.ar_norm(uu.name) like '%' || nq || '%')
       order by uu.verified desc, uu.name
       limit 40
    ) u;
  return r;
end $$;
revoke all on function qbank.list_universities(text, text) from public;
grant execute on function qbank.list_universities(text, text) to anon, authenticated;

create or replace function qbank.list_colleges(p_university uuid)
returns json language plpgsql security definer
set search_path = qbank, public as $$
declare r json;
begin
  select coalesce(json_agg(json_build_object('id', c.id, 'name', c.name) order by c.name), '[]'::json)
    into r from qbank.colleges c where c.university_id = p_university;
  return r;
end $$;
revoke all on function qbank.list_colleges(uuid) from public;
grant execute on function qbank.list_colleges(uuid) to anon, authenticated;

-- بعد التشغيل: Supabase ← Integrations ← Data API ← Reload schema
-- وإلا بقيت الدوال غير مرئية للواجهة رغم وجودها في القاعدة.
