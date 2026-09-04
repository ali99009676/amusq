-- ═══════════════════════════════════════════════════════════════════════════
--  «جاء في اختبار سابق» + أرقام الثقة في صفحة الرافع
--
--  الطلاب يدفعون لأجل هذا تحديدًا: سؤالٌ موسومٌ بأنه جاء في اختبار ٢٠٢٥
--  الفصل الأول يساوي عندهم عشرة أسئلة مؤلَّفة. حقلٌ واحد وشارة.
--
--  وصفحة الرافع كانت تقول «رفع ٣ مواد» — والطالب الذي يحوّل مالًا إلى غريب
--  يريد أن يعرف: كم اشترى منه غيري؟ وهل فتحوا ما اشتروه؟
--
--  آمن التكرار.
-- ═══════════════════════════════════════════════════════════════════════════
set search_path = qbank, public;

/* نصٌّ حرّ قصير: «٢٠٢٥ ف١» أو «فاينل ١٤٤٦» — كلٌّ يسمّي فصله بطريقته */
alter table qbank.questions add column if not exists exam_tag text not null default '';
create index if not exists questions_exam_tag_idx on qbank.questions (subject_id) where exam_tag <> '';

/* الرافع يوسم أسئلة مادته هو — الرافع لا المشرف وحده */
drop policy if exists questions_owner_tag on qbank.questions;
create policy questions_owner_tag on qbank.questions for update
  using (exists (select 1 from qbank.subjects s where s.id = subject_id
                  and (s.created_by = auth.uid() or qbank.is_admin())))
  with check (exists (select 1 from qbank.subjects s where s.id = subject_id
                  and (s.created_by = auth.uid() or qbank.is_admin())));

/* ═══ صفحة الرافع: المبيعات ونسبة الأسئلة الموسومة ═══ */
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
      'uploads', (select count(*) from qbank.subjects s
                   where s.created_by = p.id and s.published = true),
      'questions', (select coalesce(sum(s.q_count),0) from qbank.subjects s
                     where s.created_by = p.id and s.published = true),
      /* ★ كم اشترى منه غيري — العدد لا المبلغ: الثقة تُبنى بالعدد */
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

select (select count(*) from qbank.questions where exam_tag <> '') as موسومة;
