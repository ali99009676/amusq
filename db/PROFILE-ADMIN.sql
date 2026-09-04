-- ملف الطالب الكامل + عين المشرف: حقول التعريف، المتصلون الآن بالإيميل،
-- الإيميل في بحث المشرف، وحاوية الصور الشخصية بسياساتها.

-- ═══ ١) حقول الملف الشخصي ═══
alter table qbank.profiles
  add column if not exists phone      text not null default '',
  add column if not exists avatar_url text not null default '',
  add column if not exists bio        text not null default '';

-- ═══ ٢) المتصلون الآن — قائمة حية بالاسم والإيميل ═══
-- «الآن» = نبضة جهاز خلال آخر ١٥ دقيقة. الإيميل من auth.users ولا يصل
-- إلا لمشرف (الحارس داخل الدالة نفسها لا في الواجهة).
create or replace function qbank.admin_online()
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select case when not qbank.is_admin() then jsonb_build_object('error','admin only') else
  coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', nullif(btrim(p.name),''),
        'avatar', p.avatar, 'avatar_url', p.avatar_url,
        'email', u.email, 'last_seen', d.last_seen
      ) order by d.last_seen desc)
    from (select user_id, max(last_seen) as last_seen
            from qbank.devices
           where last_seen > now() - interval '15 minutes'
           group by user_id) d
    join qbank.profiles p on p.id = d.user_id
    join auth.users     u on u.id = d.user_id
  ), '[]'::jsonb) end
$$;
revoke all on function qbank.admin_online() from public;
grant execute on function qbank.admin_online() to authenticated;

-- ═══ ٣) الإيميل في بحث المشرف — والبحث به أيضًا ═══
create or replace function qbank.admin_students_pro(p_search text default '', p_limit int default 50)
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select case when not qbank.is_admin() then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id, 'name', nullif(btrim(p.name),''), 'avatar', p.avatar,
             'avatar_url', p.avatar_url, 'phone', p.phone,
             'email', au.email,
             'is_admin', p.is_admin, 'coins', p.coins_balance,
             'university', u.name, 'college', c.name,
             'created_at', p.created_at,
             'subjects', (select count(*) from qbank.enrollments e where e.user_id = p.id),
             'attempts', (select count(*) from qbank.attempts a where a.user_id = p.id),
             'best',     (select coalesce(max(a.pct),0) from qbank.attempts a where a.user_id = p.id),
             'uploaded', (select count(*) from qbank.subjects s where s.created_by = p.id),
             'paid',     (select coalesce(sum(pm.amount_halalas),0) from qbank.payments pm
                           where pm.user_id = p.id and pm.status = 'paid'),
             'last_seen',(select max(d.last_seen) from qbank.devices d where d.user_id = p.id))
           order by p.created_at desc)
      from (select pr.* from qbank.profiles pr
             left join auth.users au0 on au0.id = pr.id
             where coalesce(p_search,'') = ''
                or pr.name ilike '%' || p_search || '%'
                or au0.email ilike '%' || p_search || '%'
             order by pr.created_at desc
             limit least(greatest(coalesce(p_limit,50),1), 200)) p
      join auth.users au on au.id = p.id
      left join qbank.universities u on u.id = p.university_id
      left join qbank.colleges     c on c.id = p.college_id), '[]'::jsonb) end
$$;
revoke all on function qbank.admin_students_pro(text, int) from public;
grant execute on function qbank.admin_students_pro(text, int) to authenticated;

-- ═══ ٤) حاوية الصور الشخصية ═══
-- عامة القراءة (الصورة تظهر للجميع)، والكتابة لصاحبها فقط داخل مجلده id/
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "avatar read"   on storage.objects;
drop policy if exists "avatar write"  on storage.objects;
drop policy if exists "avatar update" on storage.objects;
drop policy if exists "avatar delete" on storage.objects;

create policy "avatar read" on storage.objects
  for select using (bucket_id = 'avatars');
create policy "avatar write" on storage.objects
  for insert with check (
    bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "avatar update" on storage.objects
  for update using (
    bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "avatar delete" on storage.objects
  for delete using (
    bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

notify pgrst, 'reload schema';
