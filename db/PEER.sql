-- تقييم الطلاب بعضهم بعضًا + الملف العام
-- الفكرة: من يرفع بنكًا نافعًا يستحق سمعة تُرى، ومن يرفع سيئًا تُرى كذلك.
-- والسمعة تُبنى على من رفع فعلًا: من لم يرفع مادة لا يُقيَّم — فالتقييم
-- عن العطاء لا عن الأشخاص، وهذا يقطع الطريق على تصفية الحسابات.

-- ═══ ١) عمودا السمعة على الملف ═══
alter table qbank.profiles
  add column if not exists rating_avg numeric(3,2) not null default 0,
  add column if not exists rating_n   int          not null default 0;

-- ═══ ٢) جدول التقييمات ═══
create table if not exists qbank.student_ratings (
  target_id  uuid not null references qbank.profiles(id) on delete cascade,
  rater_id   uuid not null references qbank.profiles(id) on delete cascade,
  stars      int  not null check (stars between 1 and 5),
  note       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (target_id, rater_id),
  -- لا أحد يقيّم نفسه: أرخص طريق لسمعة مزيفة
  constraint no_self_rating check (target_id <> rater_id)
);
create index if not exists student_ratings_target_idx on qbank.student_ratings (target_id);

alter table qbank.student_ratings enable row level security;
drop policy if exists sratings_read  on qbank.student_ratings;
drop policy if exists sratings_write on qbank.student_ratings;
-- التقييمات معلنة بطبيعتها، والكتابة لصاحبها وحده
create policy sratings_read  on qbank.student_ratings for select using (true);
create policy sratings_write on qbank.student_ratings for all
  using (rater_id = auth.uid()) with check (rater_id = auth.uid());

-- ═══ ٣) تحديث المتوسط الثابت ═══
create or replace function qbank.refresh_student_rating(p_user uuid)
returns void language sql security definer set search_path = qbank, public as $$
  update qbank.profiles p
     set rating_avg = coalesce((select round(avg(r.stars)::numeric, 2)
                                  from qbank.student_ratings r where r.target_id = p_user), 0),
         rating_n   = (select count(*) from qbank.student_ratings r where r.target_id = p_user)
   where p.id = p_user
$$;

-- ═══ ٤) تقييم طالب ═══
create or replace function qbank.rate_student(p_target uuid, p_stars int, p_note text default '')
returns jsonb language plpgsql security definer set search_path = qbank, public as $$
declare
  uid uuid := auth.uid();
  st  int  := least(greatest(coalesce(p_stars, 0), 1), 5);
begin
  if uid is null then return jsonb_build_object('ok', false, 'reason','auth'); end if;
  if uid = p_target then return jsonb_build_object('ok', false, 'reason','self'); end if;

  -- لا يُقيَّم إلا من أعطى المنصة شيئًا: التقييم على العطاء لا على الشخص
  if not exists (select 1 from qbank.subjects s where s.created_by = p_target) then
    return jsonb_build_object('ok', false, 'reason','no_uploads');
  end if;

  insert into qbank.student_ratings (target_id, rater_id, stars, note)
  values (p_target, uid, st, coalesce(left(p_note, 400), ''))
  on conflict (target_id, rater_id)
  do update set stars = excluded.stars, note = excluded.note, updated_at = now();

  perform qbank.refresh_student_rating(p_target);
  return (select jsonb_build_object('ok', true, 'avg', p.rating_avg, 'n', p.rating_n, 'mine', st)
            from qbank.profiles p where p.id = p_target);
end $$;
revoke all on function qbank.rate_student(uuid, int, text) from public;
grant execute on function qbank.rate_student(uuid, int, text) to authenticated;

-- ═══ ٥) الملف العام ═══
-- ما يراه أي طالب عن زميله: الاسم والصورة والنبذة والجامعة وعطاؤه وسمعته.
-- ولا شيء من الخاص: لا إيميل ولا جوال — الخصوصية في الدالة لا في الواجهة.
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
      'uploads', (select count(*) from qbank.subjects s
                   where s.created_by = p.id and s.published = true),
      'questions', (select coalesce(sum(s.q_count),0) from qbank.subjects s
                     where s.created_by = p.id and s.published = true),
      'subjects', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', s.id, 'name', s.name, 'icon', s.icon, 'color', s.color,
                 'q_count', s.q_count, 'free', s.free, 'price', s.price,
                 'rating_avg', s.rating_avg, 'rating_n', s.rating_n,
                 'verified', s.verified, 'name_en', s.name_en)
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

-- ═══ ٦) اسم رافع المادة — سطر واحد رخيص لصفحة المادة ═══
create or replace function qbank.uploader_of(p_subject uuid)
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select coalesce((
    select jsonb_build_object('id', p.id, 'name', nullif(btrim(p.name),''),
                              'avatar', p.avatar, 'avatar_url', p.avatar_url,
                              'rating_avg', p.rating_avg, 'rating_n', p.rating_n)
      from qbank.subjects s join qbank.profiles p on p.id = s.created_by
     where s.id = p_subject), '{}'::jsonb)
$$;
revoke all on function qbank.uploader_of(uuid) from public;
grant execute on function qbank.uploader_of(uuid) to authenticated, anon;

notify pgrst, 'reload schema';
