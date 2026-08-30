-- ═══════════════════════════════════════════════════════════════════════════
--  مراجعة · التصنيف والبحث — الطبقة التي تحوّلها من منصة جامعة إلى منصة عربية
--
--  المشكلة التي يحلّها هذا الملف:
--  قائمة مسطّحة تعمل مع خمس مواد وتنهار مع خمسة آلاف. وطالب في القاهرة
--  يرى بنك أسئلة من نجران فلا يعرف أنه لا يخصّه. الحلّ شجرة تصنيف وبحث
--  في الخادم بترقيم صفحات — لا جلب كل شيء ثم التصفية في المتصفح.
--
--  آمن التكرار بالكامل: لا drop لجدول ولا لعمود.
-- ═══════════════════════════════════════════════════════════════════════════
set search_path = qbank, public;

-- ═══ ١ · شجرة التصنيف ═══
-- الدولة عمود لا جدول: أسماء الدول ثابتة ولا تحتاج إدارة، ورمز ISO يكفي.
create table if not exists qbank.universities (
  id         uuid primary key default gen_random_uuid(),
  country    text not null,                    -- رمز ISO: SA، EG، JO…
  name       text not null,
  name_en    text not null default '',
  city       text not null default '',
  verified   boolean not null default false,   -- جامعة أضافها المشرف لا طالب
  created_at timestamptz not null default now()
);
create unique index if not exists universities_uidx on qbank.universities (country, name);
create index if not exists universities_country_idx on qbank.universities (country);

create table if not exists qbank.colleges (
  id            uuid primary key default gen_random_uuid(),
  university_id uuid not null references qbank.universities(id) on delete cascade,
  name          text not null,
  created_at    timestamptz not null default now()
);
create unique index if not exists colleges_uidx on qbank.colleges (university_id, name);

-- ═══ ٢ · ربط المادة بمكانها في الشجرة ═══
alter table qbank.subjects add column if not exists university_id uuid references qbank.universities(id) on delete set null;
alter table qbank.subjects add column if not exists college_id    uuid references qbank.colleges(id)    on delete set null;
alter table qbank.subjects add column if not exists course_code   text not null default '';   -- رمز المقرر: EMS 301
alter table qbank.subjects add column if not exists level         int;                        -- المستوى الدراسي
alter table qbank.subjects add column if not exists lang          text not null default 'ar'; -- لغة الأسئلة الغالبة

create index if not exists subjects_univ_idx    on qbank.subjects (university_id);
create index if not exists subjects_college_idx on qbank.subjects (college_id);

-- ═══ ٣ · البحث العربي ═══
/*
  تطبيع النص قبل البحث. السبب أن الطالب يكتب «الاسعاف» بلا همزة ويبحث عن
  «الإسعاف»، ويكتب «فيزيولوجيا» وقد كُتبت «فسيولوجيا». فنُسقط التشكيل،
  ونوحّد الألف والهمزات، والتاء المربوطة والهاء، والألف المقصورة والياء.
  بلا هذا لن يجد الطالب مادته إلا إن كتبها بحروفها بالضبط — وهو لن يفعل.
*/
create or replace function qbank.ar_norm(t text)
returns text language sql immutable strict as $$
  select btrim(regexp_replace(
    translate(
      regexp_replace(lower(coalesce(t,'')), '[ً-ْـ]', '', 'g'),  -- تشكيل وتطويل
      'أإآٱىةؤئ',
      'اااايهوي'
    ),
    '\s+', ' ', 'g'))
$$;

-- عمود محسوب للبحث: يُبنى مرة ويُفهرس، فلا نحسب التطبيع مع كل استعلام
alter table qbank.subjects add column if not exists search_txt text
  generated always as (
    qbank.ar_norm(coalesce(name,'') || ' ' || coalesce(descr,'') || ' ' || coalesce(course_code,''))
  ) stored;

create extension if not exists pg_trgm with schema extensions;
create index if not exists subjects_search_trgm on qbank.subjects
  using gin (search_txt extensions.gin_trgm_ops);

-- ═══ ٤ · الاستكشاف: بحث ومرشّحات وترقيم في الخادم ═══
/*
  نداء واحد يُرجع الصفحة وعدّها الكلي معًا.
  الترقيم بـ offset لا cursor لأن الطالب يقفز بين الصفحات ويرى «١٢٠ نتيجة»،
  والأعداد هنا بالآلاف لا الملايين فالفرق في الأداء غير محسوس.
*/
create or replace function qbank.browse_subjects(
  q            text default '',
  p_country    text default '',
  p_university uuid default null,
  p_college    uuid default null,
  p_sort       text default 'popular',     -- popular | newest | questions
  p_page       int  default 0,
  p_size       int  default 24
) returns jsonb language plpgsql stable security definer set search_path = qbank, public as $$
declare
  needle text := qbank.ar_norm(coalesce(q,''));
  lim int := least(greatest(coalesce(p_size,24), 1), 60);
  off int := greatest(coalesce(p_page,0), 0) * lim;
  total int;
  rows jsonb;
begin
  with base as (
    select s.*
      from qbank.subjects s
     where s.published = true
       and s.status = 'published'
       and (needle = '' or s.search_txt like '%' || needle || '%')
       and (coalesce(p_country,'') = '' or exists (
             select 1 from qbank.universities u
              where u.id = s.university_id and u.country = p_country))
       and (p_university is null or s.university_id = p_university)
       and (p_college    is null or s.college_id    = p_college)
  )
  select count(*)::int,
         coalesce(jsonb_agg(row_to_json(t)) filter (where t.rn > off and t.rn <= off + lim), '[]'::jsonb)
    into total, rows
    from (
      select b.id, b.name, b.descr, b.icon, b.color, b.q_count, b.price, b.free,
             b.slug, b.course_code, b.level, b.lang, b.created_at,
             u.name university, u.country, c.name college,
             (select count(*) from qbank.enrollments e where e.subject_id = b.id) students,
             row_number() over (order by
               case when p_sort = 'newest'    then extract(epoch from b.created_at) end desc,
               case when p_sort = 'questions' then b.q_count end desc,
               -- الافتراضي «الأكثر استخدامًا»: عدد المشتركين ثم عدد الأسئلة
               (select count(*) from qbank.enrollments e where e.subject_id = b.id) desc,
               b.q_count desc, b.created_at desc) rn
        from base b
        left join qbank.universities u on u.id = b.university_id
        left join qbank.colleges     c on c.id = b.college_id
    ) t;

  return jsonb_build_object(
    'total', total, 'page', greatest(coalesce(p_page,0),0), 'size', lim,
    'pages', case when total = 0 then 0 else ceil(total::numeric / lim)::int end,
    'rows', rows);
end $$;
revoke all on function qbank.browse_subjects(text, text, uuid, uuid, text, int, int) from public;
grant execute on function qbank.browse_subjects(text, text, uuid, uuid, text, int, int) to anon, authenticated;

-- ═══ ٥ · قوائم المرشّحات ═══
-- تُبنى من المواد المنشورة فعلًا: لا نعرض جامعة بلا مادة واحدة فيها
create or replace function qbank.catalog_filters(p_country text default '', p_university uuid default null)
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select jsonb_build_object(
    'countries', coalesce((
      select jsonb_agg(jsonb_build_object('code', country, 'n', n) order by n desc)
        from (select u.country, count(*) n
                from qbank.subjects s join qbank.universities u on u.id = s.university_id
               where s.published and s.status = 'published'
               group by u.country) x), '[]'::jsonb),
    'universities', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'country', country, 'n', n) order by n desc)
        from (select u.id, u.name, u.country, count(*) n
                from qbank.subjects s join qbank.universities u on u.id = s.university_id
               where s.published and s.status = 'published'
                 and (coalesce(p_country,'') = '' or u.country = p_country)
               group by u.id, u.name, u.country) x), '[]'::jsonb),
    'colleges', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'n', n) order by n desc)
        from (select c.id, c.name, count(*) n
                from qbank.subjects s join qbank.colleges c on c.id = s.college_id
               where s.published and s.status = 'published'
                 and (p_university is null or s.university_id = p_university)
               group by c.id, c.name) x), '[]'::jsonb)
  )
$$;
revoke all on function qbank.catalog_filters(text, uuid) from public;
grant execute on function qbank.catalog_filters(text, uuid) to anon, authenticated;

-- ═══ ٦ · إضافة جامعة أو كلية من شاشة الرفع ═══
/*
  الطالب يكتب اسم جامعته فتُنشأ إن لم تكن موجودة.
  بلا هذا لن يرفع أحد إلا من الجامعات التي أدخلتها يدويًا، وهي عقبة تقتل النمو.
  والتطبيع يمنع «جامعة الملك سعود» و«جامعه الملك سعود» من أن تصيرا جامعتين.
*/
create or replace function qbank.ensure_university(p_country text, p_name text)
returns uuid language plpgsql security definer set search_path = qbank, public as $$
declare v uuid; nm text := btrim(coalesce(p_name,'')); cc text := upper(btrim(coalesce(p_country,'')));
begin
  if auth.uid() is null then raise exception 'لا جلسة'; end if;
  if nm = '' or cc = '' then raise exception 'الدولة واسم الجامعة مطلوبان'; end if;
  select id into v from qbank.universities
   where country = cc and qbank.ar_norm(name) = qbank.ar_norm(nm) limit 1;
  if v is not null then return v; end if;
  insert into qbank.universities (country, name) values (cc, nm) returning id into v;
  return v;
end $$;
revoke all on function qbank.ensure_university(text, text) from public;
grant execute on function qbank.ensure_university(text, text) to authenticated;

create or replace function qbank.ensure_college(p_university uuid, p_name text)
returns uuid language plpgsql security definer set search_path = qbank, public as $$
declare v uuid; nm text := btrim(coalesce(p_name,''));
begin
  if auth.uid() is null then raise exception 'لا جلسة'; end if;
  if p_university is null or nm = '' then raise exception 'الجامعة واسم الكلية مطلوبان'; end if;
  select id into v from qbank.colleges
   where university_id = p_university and qbank.ar_norm(name) = qbank.ar_norm(nm) limit 1;
  if v is not null then return v; end if;
  insert into qbank.colleges (university_id, name) values (p_university, nm) returning id into v;
  return v;
end $$;
revoke all on function qbank.ensure_college(uuid, text) from public;
grant execute on function qbank.ensure_college(uuid, text) to authenticated;

-- ═══ ٧ · RLS ═══
alter table qbank.universities enable row level security;
alter table qbank.colleges     enable row level security;

drop policy if exists universities_select on qbank.universities;
create policy universities_select on qbank.universities for select using (true);
drop policy if exists universities_write on qbank.universities;
create policy universities_write on qbank.universities for all
  using (qbank.is_admin()) with check (qbank.is_admin());

drop policy if exists colleges_select on qbank.colleges;
create policy colleges_select on qbank.colleges for select using (true);
drop policy if exists colleges_write on qbank.colleges;
create policy colleges_write on qbank.colleges for all
  using (qbank.is_admin()) with check (qbank.is_admin());

grant select on qbank.universities, qbank.colleges to anon, authenticated;

-- ═══ ٨ · بذرة أولية: جامعات لها كليات صحية في المنطقة ═══
-- verified = true لأن المشرف أدخلها، فتظهر مميّزة عمّا يضيفه الطلاب
insert into qbank.universities (country, name, name_en, city, verified) values
  ('SA','جامعة نجران','Najran University','نجران',true),
  ('SA','جامعة الملك سعود','King Saud University','الرياض',true),
  ('SA','جامعة الملك عبدالعزيز','King Abdulaziz University','جدة',true),
  ('SA','جامعة الملك فيصل','King Faisal University','الأحساء',true),
  ('SA','جامعة الإمام عبدالرحمن بن فيصل','Imam Abdulrahman Bin Faisal University','الدمام',true),
  ('SA','جامعة الملك خالد','King Khalid University','أبها',true),
  ('SA','جامعة القصيم','Qassim University','بريدة',true),
  ('SA','جامعة الطائف','Taif University','الطائف',true),
  ('SA','جامعة جازان','Jazan University','جازان',true),
  ('SA','جامعة تبوك','University of Tabuk','تبوك',true),
  ('SA','جامعة حائل','University of Hail','حائل',true),
  ('SA','جامعة الملك سعود بن عبدالعزيز للعلوم الصحية','KSAU-HS','الرياض',true),
  ('EG','جامعة القاهرة','Cairo University','القاهرة',true),
  ('EG','جامعة عين شمس','Ain Shams University','القاهرة',true),
  ('EG','جامعة الإسكندرية','Alexandria University','الإسكندرية',true),
  ('EG','جامعة المنصورة','Mansoura University','المنصورة',true),
  ('EG','جامعة أسيوط','Assiut University','أسيوط',true),
  ('JO','الجامعة الأردنية','University of Jordan','عمّان',true),
  ('JO','جامعة العلوم والتكنولوجيا الأردنية','JUST','إربد',true),
  ('AE','جامعة الإمارات','UAE University','العين',true),
  ('AE','جامعة الشارقة','University of Sharjah','الشارقة',true),
  ('KW','جامعة الكويت','Kuwait University','الكويت',true),
  ('QA','جامعة قطر','Qatar University','الدوحة',true),
  ('BH','جامعة الخليج العربي','Arabian Gulf University','المنامة',true),
  ('OM','جامعة السلطان قابوس','Sultan Qaboos University','مسقط',true),
  ('IQ','جامعة بغداد','University of Baghdad','بغداد',true),
  ('MA','جامعة محمد الخامس','Mohammed V University','الرباط',true),
  ('DZ','جامعة الجزائر','University of Algiers','الجزائر',true),
  ('TN','جامعة تونس المنار','University of Tunis El Manar','تونس',true),
  ('SD','جامعة الخرطوم','University of Khartoum','الخرطوم',true),
  ('YE','جامعة صنعاء','Sanaa University','صنعاء',true),
  ('LY','جامعة طرابلس','University of Tripoli','طرابلس',true),
  ('SY','جامعة دمشق','Damascus University','دمشق',true),
  ('LB','الجامعة الأمريكية في بيروت','AUB','بيروت',true),
  ('PS','جامعة النجاح الوطنية','An-Najah National University','نابلس',true)
on conflict (country, name) do nothing;

-- كليات قياسية للجامعات الموثّقة
insert into qbank.colleges (university_id, name)
select u.id, c.name
  from qbank.universities u
 cross join (values
   -- كليات تغطّي ما يدرسه الطالب العربي فعلًا، لا التخصصات الصحية وحدها.
   -- الترتيب بالأكثر انتشارًا كي تظهر أولًا في قوائم الاختيار.
   ('كلية الطب'), ('كلية طب الأسنان'), ('كلية الصيدلة'),
   ('كلية التمريض'), ('كلية العلوم الطبية التطبيقية'), ('كلية الصحة العامة'),
   ('كلية الهندسة'), ('كلية علوم الحاسب والمعلومات'), ('كلية العلوم'),
   ('كلية إدارة الأعمال'), ('كلية الاقتصاد والعلوم الإدارية'),
   ('كلية الحقوق'), ('كلية الشريعة وأصول الدين'),
   ('كلية التربية'), ('كلية الآداب واللغات'), ('كلية اللغات والترجمة'),
   ('كلية العمارة والتخطيط'), ('كلية الزراعة والأغذية'),
   ('كلية الطب البيطري'), ('كلية الإعلام والاتصال'),
   ('كلية السياحة والآثار'), ('كلية المجتمع'), ('الدراسات العليا')
 ) as c(name)
 where u.verified
on conflict (university_id, name) do nothing;

-- المواد الحالية تُنسب إلى جامعة نجران — أول جامعة على المنصة
update qbank.subjects s
   set university_id = (select id from qbank.universities where country='SA' and name='جامعة نجران'),
       college_id    = (select c.id from qbank.colleges c
                         join qbank.universities u on u.id = c.university_id
                        where u.country='SA' and u.name='جامعة نجران'
                          and c.name='كلية العلوم الطبية التطبيقية')
 where s.university_id is null;

notify pgrst, 'reload schema';
