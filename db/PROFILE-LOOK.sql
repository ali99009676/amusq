-- ═══════════════════════════════════════════════════════════════════
--  شكل ملف الطالب: غلاف + لون + ستايل
-- ═══════════════════════════════════════════════════════════════════
--  بطلب علي: الطالب ينسّق صفحته العامة كما يريد — صورة غلاف أو تدرّج
--  جاهز، لون المحور، وواحد من خمسة ستايلات في طريقة العرض.
--
--  ★ القيم محصورة في القاعدة لا في الواجهة:
--  اللون اسمُ متغيّرٍ من نظام التصميم (subject-3، gold…) لا hex — فلا
--  يقدر أحد أن يحقن لونًا يجعل الاسم غير مقروء أو يكسر الوضع الفاتح.
--  والغلاف المرفوع لا يكون إلا من مخزننا وفي مجلد صاحبه — لا رابطًا
--  خارجيًا يتتبّع من فتح الصفحة.
--  آمن التكرار: add column if not exists، والقيود تُسقَط ثم تُعاد.

alter table qbank.profiles
  add column if not exists layout       text not null default 'classic',
  add column if not exists accent       text not null default '',
  add column if not exists cover_preset text not null default '',
  add column if not exists cover_url    text not null default '';

alter table qbank.profiles drop constraint if exists profiles_layout_chk;
alter table qbank.profiles add constraint profiles_layout_chk
  check (layout in ('classic','cover','stripe','magazine','glass'));

alter table qbank.profiles drop constraint if exists profiles_accent_chk;
alter table qbank.profiles add constraint profiles_accent_chk
  check (accent in ('', 'subject-1','subject-2','subject-3','subject-4','subject-5','subject-6','gold','brand'));

alter table qbank.profiles drop constraint if exists profiles_cover_preset_chk;
alter table qbank.profiles add constraint profiles_cover_preset_chk
  check (cover_preset in ('', 'g1','g2','g3','g4','g5','g6','g7','g8'));

/*
  الغلاف والصورة من مخزننا وفي مجلد صاحبهما فقط — بادئةٌ كاملة لا جزءًا:
  كان الشرط position(...) > 0 فيمرّ رابطٌ خارجي يحمل البادئة في استعلامه
  ويتتبّع كل من فتح الصفحة (تدقيق M-08). المسموح: أصل المشروع، المجلد،
  اسم ملف صورة، وكاسر ذاكرة ?v=أرقام لا غير.
*/
alter table qbank.profiles drop constraint if exists profiles_cover_url_chk;
alter table qbank.profiles add constraint profiles_cover_url_chk
  check (cover_url = '' or cover_url ~ ('^https://gbgjadqwqzxxyhydlgtj\.supabase\.co/storage/v1/object/public/avatars/'
                                       || id::text || '/[a-z0-9_-]+\.(jpg|jpeg|png|webp)(\?v=[0-9]{1,16})?$'));
alter table qbank.profiles drop constraint if exists profiles_avatar_url_chk;
alter table qbank.profiles add constraint profiles_avatar_url_chk
  check (avatar_url = '' or avatar_url ~ ('^https://gbgjadqwqzxxyhydlgtj\.supabase\.co/storage/v1/object/public/avatars/'
                                         || id::text || '/[a-z0-9_-]+\.(jpg|jpeg|png|webp)(\?v=[0-9]{1,16})?$'));

-- ═══ الملف العام يُرجع الشكل مع البيانات — الصفحة تُرسم بستايل صاحبها ═══
create or replace function qbank.public_profile(p_user uuid)
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select coalesce((
    select jsonb_build_object(
      'id', p.id,
      'name', nullif(btrim(p.name),''),
      'avatar', p.avatar, 'avatar_url', p.avatar_url,
      'bio', p.bio,
      'university', u.name, 'college', c.name,
      'created_at', p.created_at,
      'rating_avg', p.rating_avg, 'rating_n', p.rating_n,
      'phone_verified', coalesce(p.phone_verified, false),
      /* شكل الملف كما اختاره صاحبه */
      'layout', p.layout, 'accent', p.accent,
      'cover_preset', p.cover_preset, 'cover_url', p.cover_url,
      'uploads', (select count(*) from qbank.subjects s
                   where s.created_by = p.id and s.published = true),
      'questions', (select coalesce(sum(s.q_count),0) from qbank.subjects s
                     where s.created_by = p.id and s.published = true),
      'sales', (select count(*) from qbank.entitlements e
                 join qbank.subjects s on s.id = e.subject_id
                where s.created_by = p.id and e.source in ('web','code','manual')),
      'exam_tagged', (select count(*) from qbank.questions q
                       join qbank.subjects s on s.id = q.subject_id
                      where s.created_by = p.id and s.published and q.exam_tag <> ''),
      'subjects', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', s.id, 'name', s.name, 'icon', s.icon, 'color', s.color,
                 'q_count', s.q_count, 'free', s.free, 'price', s.price,
                 'rating_avg', s.rating_avg, 'rating_n', s.rating_n,
                 'verified', s.verified, 'name_en', s.name_en,
                 'slug', s.slug)
               order by s.created_at desc)
          from qbank.subjects s
         where s.created_by = p.id and s.published = true), '[]'::jsonb),
      'ratings', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'stars', r.stars, 'note', r.note, 'at', r.created_at,
                 'by', nullif(btrim(rp.name),''), 'by_avatar', rp.avatar,
                 'by_avatar_url', rp.avatar_url, 'by_id', rp.id)
               order by r.updated_at desc)
          from qbank.student_ratings r
          join qbank.profiles rp on rp.id = r.rater_id
         where r.target_id = p.id), '[]'::jsonb),
      'mine', coalesce((select jsonb_build_object('stars', r2.stars, 'note', r2.note)
                          from qbank.student_ratings r2
                         where r2.target_id = p.id and r2.rater_id = auth.uid()), '{}'::jsonb)
    )
    from qbank.profiles p
    left join qbank.universities u on u.id = p.university_id
    left join qbank.colleges     c on c.id = p.college_id
    where p.id = p_user
  ), jsonb_build_object('error','not_found'))
$$;
revoke all on function qbank.public_profile(uuid) from public;
grant execute on function qbank.public_profile(uuid) to authenticated, anon;

notify pgrst, 'reload schema';

-- تحقق: أربعة أعمدة جديدة
select column_name, column_default
  from information_schema.columns
 where table_schema = 'qbank' and table_name = 'profiles'
   and column_name in ('layout','accent','cover_preset','cover_url');
