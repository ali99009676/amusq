-- ═══════════════════════════════════════════════════════════════════
--  HARDEN-1 · إغلاق ثغرات التدقيق الأمني (٥ سبتمبر ٢٠٢٦)
-- ═══════════════════════════════════════════════════════════════════
--  يُقرأ كاملًا قبل التنفيذ. آمن التكرار: كل شيء drop … if exists /
--  create or replace / add column if not exists، ولا حذفَ لأي جدول في الملف.
--  لا يمسّ صفوف الطلاب إلا في ٦ (تبييض رابط صورة خارجي إن وُجد — والمفروض
--  ألّا يوجد، ويطبع ما بيّضه).
--
--  يغلق: C-03 C-04 C-05 H-02 H-06 H-07 M-02 M-06 M-08 M-10 L-09 (M-07 في ١١)
--  محرّر Supabase: https://supabase.com/dashboard/project/gbgjadqwqzxxyhydlgtj/sql/new
--
--  ★ بعد التنفيذ يعمل /api/ai الجديد (الخصم من الخادم). قبل التنفيذ يردّ
--    «الإثراء متوقف مؤقتًا — نفّذ db/HARDEN-1.sql» — مغلقٌ لا مفتوح.

-- ═══ ١ · C-03 · أعمدة profiles المالية وأعمدة الثقة لا يحرّرها صاحبها ═══
/*
  RLS تحرس الصفّ لا العمود: سياسة profiles_update تسمح لصاحب الصف بكل
  الأعمدة — فيكتب الطالب coins_balance وearn_balance (رصيد سحب حقيقي)
  وphone_verified وrating_avg بطلب PATCH واحد.
  الحلّ طبقتان: صلاحية على مستوى العمود (يقبل PostgREST بها 42501)،
  وقادحٌ يرفض تغيير الأعمدة المحمية من دور الواجهة. الدوال security
  definer (spend_credits_for، settle_payment، rate_student…) تعمل باسم
  مالكها فلا تتأثر — current_user فيها postgres لا authenticated.
*/
revoke update on qbank.profiles from anon, authenticated;
grant  update (name, avatar, avatar_url, bio, phone, university_id, college_id,
               show_on_board, layout, accent, cover_preset, cover_url)
       on qbank.profiles to authenticated;

create or replace function qbank.profiles_guard() returns trigger
language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and (
       new.coins_balance     is distinct from old.coins_balance     or
       new.earn_balance      is distinct from old.earn_balance      or
       new.earn_total        is distinct from old.earn_total        or
       new.phone_verified    is distinct from old.phone_verified    or
       new.phone_verified_at is distinct from old.phone_verified_at or
       new.rating_avg        is distinct from old.rating_avg        or
       new.rating_n          is distinct from old.rating_n          or
       new.is_admin          is distinct from old.is_admin          or
       new.id                is distinct from old.id) then
    raise exception 'عمود محمي — لا يُحرَّر من العميل' using errcode = '42501';
  end if;
  /* تغيير الرقم يُسقط توثيقه — التوثيق للرقم لا للحساب */
  if new.phone is distinct from old.phone and old.phone_verified then
    new.phone_verified := false; new.phone_verified_at := null;
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard_trg on qbank.profiles;
create trigger profiles_guard_trg before update on qbank.profiles
  for each row execute function qbank.profiles_guard();

-- ═══ ٢ · C-04 / H-02 · الكوينز: الخصم والردّ من الخادم وحده ═══
/*
  كان المتصفح يخصم (spend_credits) ثم ينادي /api/ai، وrefund_credits تضيف
  أي عدد بلا مرجع. الآن نسختان لا تُناديان إلا بمفتاح الخدمة:
  spend_credits_for تحسب الثمن من الإعدادات (لا من الطلب)، وrefund_credits
  محدودة بما خُصم فعلًا لهذه المسوّدة. والنسخ القديمة تُسحب من المتصفح.
*/
create or replace function qbank.spend_credits_for(p_user uuid, p_questions int, p_draft uuid default null)
returns jsonb language plpgsql security definer set search_path = qbank, public as $$
declare
  cpq  int := coalesce((select enrich_cost_per_q from qbank.settings where id = 1), 1);
  need int := greatest(coalesce(p_questions, 0), 0) * greatest(cpq, 0);
  bal  int;
  open_flag boolean := coalesce((select enrich_open from qbank.settings where id = 1), true);
begin
  if p_user is null then return jsonb_build_object('ok', false, 'reason','no_session'); end if;
  if not open_flag then return jsonb_build_object('ok', false, 'reason','closed'); end if;
  if need = 0 then return jsonb_build_object('ok', true, 'spent', 0,
       'balance', (select coalesce(coins_balance,0) from qbank.profiles where id = p_user)); end if;

  update qbank.profiles
     set coins_balance = coins_balance - need
   where id = p_user and coins_balance >= need
  returning coins_balance into bal;

  if bal is null then
    select coalesce(coins_balance, 0) into bal from qbank.profiles where id = p_user;
    return jsonb_build_object('ok', false, 'reason','insufficient',
                              'balance', coalesce(bal,0), 'needed', need);
  end if;

  insert into qbank.coin_transactions (user_id, amount, reason, kind, draft_id)
  values (p_user, -need, 'إثراء ' || p_questions || ' سؤالًا', 'enrich', p_draft);

  return jsonb_build_object('ok', true, 'spent', need, 'balance', bal);
end $$;
revoke all on function qbank.spend_credits_for(uuid, int, uuid) from public, anon, authenticated;
grant execute on function qbank.spend_credits_for(uuid, int, uuid) to service_role;

drop function if exists qbank.refund_credits(int, text, uuid);
create or replace function qbank.refund_credits(p_user uuid, n int, p_reason text default '', p_draft uuid default null)
returns jsonb language plpgsql security definer set search_path = qbank, public as $$
declare
  back int := greatest(coalesce(n, 0), 0);
  spent int; refunded int; bal int;
begin
  if p_user is null or back = 0 then return jsonb_build_object('ok', false); end if;
  /* لا يُردّ أكثر مما خُصم لهذه المسوّدة (وما بلا مسوّدة يُحسب على مثله) */
  select coalesce(-sum(amount), 0) into spent from qbank.coin_transactions
   where user_id = p_user and kind = 'enrich' and draft_id is not distinct from p_draft;
  select coalesce(sum(amount), 0) into refunded from qbank.coin_transactions
   where user_id = p_user and kind = 'refund' and draft_id is not distinct from p_draft;
  back := least(back, greatest(spent - refunded, 0));
  if back = 0 then return jsonb_build_object('ok', false, 'reason', 'nothing_to_refund'); end if;

  update qbank.profiles set coins_balance = coins_balance + back
   where id = p_user returning coins_balance into bal;
  insert into qbank.coin_transactions (user_id, amount, reason, kind, draft_id)
  values (p_user, back, coalesce(nullif(p_reason,''), 'ردّ رصيد — تعذّرت المعالجة'), 'refund', p_draft);
  return jsonb_build_object('ok', true, 'refunded', back, 'balance', bal);
end $$;
revoke all on function qbank.refund_credits(uuid, int, text, uuid) from public, anon, authenticated;
grant execute on function qbank.refund_credits(uuid, int, text, uuid) to service_role;

/* النسخة القديمة من الخصم لم يعد يناديها المتصفح — تبقى للخادم فقط */
revoke execute on function qbank.spend_credits(int, text, uuid) from anon, authenticated;

-- ═══ ٣ · C-05 · أسئلة المادة المدفوعة لمن اشتراها لا لكل من سأل ═══
/*
  كانت السياسة والدالة تشترطان «منشورة» فقط، فتُقرأ أسئلة كل مادة مدفوعة
  بمفتاح anon. البوابة الواحدة can_access: مشرف، أو مجانية منشورة، أو
  الرافع نفسه، أو استحقاق ساري. (نعيد تعريفها هنا لضمان أنها النسخة
  الكاملة أيًّا كان الملف الذي نُفّذ آخرًا.)
*/
create or replace function qbank.can_access(sid uuid)
returns boolean language sql stable security definer set search_path = qbank, public as $$
  select qbank.is_admin()
    or exists (select 1 from qbank.subjects s where s.id = sid and s.free and s.published)
    or exists (select 1 from qbank.subjects s where s.id = sid and s.created_by = auth.uid())
    or exists (select 1 from qbank.entitlements e
               where e.user_id = auth.uid() and e.expires_at > now()
                 and (e.subject_id = sid or e.kind = 'semester'))
$$;
revoke all on function qbank.can_access(uuid) from public;
grant execute on function qbank.can_access(uuid) to anon, authenticated;

drop policy if exists questions_select on qbank.questions;
create policy questions_select on qbank.questions for select
  using (
    qbank.is_admin()
    or exists (select 1 from qbank.subjects s
                where s.id = subject_id
                  and (s.created_by = auth.uid()
                       or (s.published = true and qbank.can_access(s.id))))
  );

create or replace function qbank.subject_questions(sid uuid)
returns setof qbank.questions language sql stable security definer set search_path = qbank, public as $$
  select q.* from qbank.questions q
  join qbank.subjects s on s.id = q.subject_id
  where q.subject_id = sid
    and (qbank.is_admin() or s.created_by = auth.uid()
         or (s.published = true and qbank.can_access(sid)))
  order by q.ord
$$;
revoke all on function qbank.subject_questions(uuid) from public;
grant execute on function qbank.subject_questions(uuid) to anon, authenticated;  -- المجانية للزائر أيضًا

-- ═══ ٤ · H-06 · جدول بلا RLS، وصلاحيات anon الافتراضية ═══
alter table qbank.name_rules enable row level security;
drop policy if exists name_rules_read on qbank.name_rules;
create policy name_rules_read on qbank.name_rules for select using (true);
revoke insert, update, delete on qbank.name_rules from anon, authenticated;

/*
  الافتراضي مغلق: جدولٌ أو دالةٌ جديدة لا تُمنح للزائر تلقائيًا.
  ★ PUBLIC أيضًا: Postgres يمنح EXECUTE لكل دالة جديدة لـPUBLIC (وanon
  عضوٌ فيه)، فسحبُ anon وحده لا يغيّر شيئًا. من الآن كل دالة جديدة تحتاج
  grant execute صريحًا — وهذا ما تفعله ملفات db كلها أصلًا.
*/
alter default privileges in schema qbank revoke all on tables    from anon;
alter default privileges in schema qbank revoke all on sequences from anon;
alter default privileges in schema qbank revoke all on functions from anon, public;

/* دوال تُستدعى من السياسات ومن الواجهة: تبقى للجميع صراحةً لا بالافتراضي */
revoke all on function qbank.is_admin()               from public;
revoke all on function qbank.name_shown(text)         from public;
revoke all on function qbank.name_norm(text)          from public;
revoke all on function qbank.name_norm_ar(text)       from public;
revoke all on function qbank.name_norm_en(text)       from public;
revoke all on function qbank.ar_norm(text)            from public;
revoke all on function qbank.make_slug(text, uuid)    from public;
revoke all on function qbank.norm_code(text)          from public;
revoke all on function qbank.norm_phone(text)         from public;
revoke all on function qbank.trial_cap()              from public;
revoke all on function qbank.coins_per_sale()         from public;
revoke all on function qbank.board(int)               from public;
revoke all on function qbank.content_pack()           from public;
grant execute on function qbank.is_admin()            to anon, authenticated;
grant execute on function qbank.name_shown(text)      to anon, authenticated;
grant execute on function qbank.name_norm(text)       to anon, authenticated;
grant execute on function qbank.name_norm_ar(text)    to anon, authenticated;
grant execute on function qbank.name_norm_en(text)    to anon, authenticated;
grant execute on function qbank.ar_norm(text)         to anon, authenticated;
grant execute on function qbank.make_slug(text, uuid) to anon, authenticated;
grant execute on function qbank.norm_code(text)       to anon, authenticated;
grant execute on function qbank.norm_phone(text)      to anon, authenticated;
grant execute on function qbank.trial_cap()           to anon, authenticated;
grant execute on function qbank.coins_per_sale()      to anon, authenticated;
grant execute on function qbank.board(int)            to anon, authenticated;
grant execute on function qbank.content_pack()        to anon, authenticated;

/* دوال داخلية (تناديها دوال security definer فقط) ورثت EXECUTE للجميع من الافتراضي القديم */
revoke all on function qbank.log_admin(text, uuid, jsonb)  from public, anon, authenticated;
revoke all on function qbank.refresh_rating(uuid)           from public, anon, authenticated;
revoke all on function qbank.refresh_student_rating(uuid)   from public, anon, authenticated;
revoke all on function qbank.refresh_reports_open(uuid)     from public, anon, authenticated;
revoke all on function qbank.gen_code(int)                  from public, anon, authenticated;
revoke all on function qbank.gen_phone_code(int)            from public, anon, authenticated;

/* دوال المشرف تتحقق من is_admin داخلها — تبقى للمسجَّلين لا للزائر */
revoke all on function qbank.admin_attempts(uuid)           from public, anon;
revoke all on function qbank.admin_dashboard(int)           from public, anon;
revoke all on function qbank.admin_duplicates(uuid)         from public, anon;
revoke all on function qbank.admin_stats()                  from public, anon;
revoke all on function qbank.admin_students(int, int, text) from public, anon;
revoke all on function qbank.admin_subject_stats(uuid)      from public, anon;
grant execute on function qbank.admin_attempts(uuid)           to authenticated;
grant execute on function qbank.admin_dashboard(int)           to authenticated;
grant execute on function qbank.admin_duplicates(uuid)         to authenticated;
grant execute on function qbank.admin_stats()                  to authenticated;
grant execute on function qbank.admin_students(int, int, text) to authenticated;
grant execute on function qbank.admin_subject_stats(uuid)      to authenticated;

-- ═══ ٥ · H-07 · المادة الجديدة تبدأ بلا ثقة، والمبيعة لا يمحوها رافعها ═══
create or replace function qbank.subjects_owner_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    /* ★ الصف الجديد يبدأ بلا ثقة ولا سمعة — يمنحها المشرف لاحقًا.
       كان الحارس يحمي التعديل وحده، فيُدرج الرافع مادةً «موثَّقة» بتقييم
       خمس نجوم من مئة تقييم لم تحدث (تدقيق H-07). */
    if auth.uid() is not null and not qbank.is_admin() then
      new.verified := false; new.rating_avg := 0; new.rating_n := 0;
      new.owner_edit := false; new.q_count := 0;
      if new.status = 'suspended' then new.status := 'published'; end if;
    end if;
    if not new.published and new.status = 'suspended' then new.status := 'published'; end if;
    return new;
  end if;
  if auth.uid() is null or qbank.is_admin() then return new; end if;

  new.created_by := old.created_by;
  new.verified   := old.verified;
  new.price      := old.price;
  new.free       := old.free;
  new.status     := old.status;
  new.owner_edit := old.owner_edit;
  /* العدّاد يكتبه قادح الأسئلة (عمق ٢) لا الطالب مباشرة (عمق ١) */
  if pg_trigger_depth() <= 1 then new.q_count := old.q_count; end if;

  if old.published and not coalesce(old.owner_edit, false) then
    if new.published is distinct from old.published
    or new.name      is distinct from old.name
    or new.descr     is distinct from old.descr
    or new.topics    is distinct from old.topics
    or new.overview  is distinct from old.overview
    or new.memorize  is distinct from old.memorize
    or new.mistakes  is distinct from old.mistakes then
      raise exception 'المادة منشورة — التعديل بعد النشر بإذن المشرف';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists subjects_owner_guard_trg on qbank.subjects;
create trigger subjects_owner_guard_trg
  before insert or update on qbank.subjects
  for each row execute function qbank.subjects_owner_guard();

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

-- ═══ ٦ · M-08 · الغلاف والصورة من مخزننا فقط — بادئة كاملة لا جزءًا ═══
/* أي رابط خارجي (يتتبّع من فتح الصفحة) يُبيَّض أولًا — والمفروض ألّا يوجد */
update qbank.profiles set cover_url = ''
 where cover_url <> ''
   and cover_url !~ ('^https://gbgjadqwqzxxyhydlgtj\.supabase\.co/storage/v1/object/public/avatars/' || id::text || '/');
update qbank.profiles set avatar_url = ''
 where avatar_url <> ''
   and avatar_url !~ ('^https://gbgjadqwqzxxyhydlgtj\.supabase\.co/storage/v1/object/public/avatars/' || id::text || '/');

alter table qbank.profiles drop constraint if exists profiles_cover_url_chk;
alter table qbank.profiles add constraint profiles_cover_url_chk
  check (cover_url = '' or cover_url ~ ('^https://gbgjadqwqzxxyhydlgtj\.supabase\.co/storage/v1/object/public/avatars/'
                                       || id::text || '/[a-z0-9_-]+\.(jpg|jpeg|png|webp)(\?v=[0-9]{1,16})?$'));
alter table qbank.profiles drop constraint if exists profiles_avatar_url_chk;
alter table qbank.profiles add constraint profiles_avatar_url_chk
  check (avatar_url = '' or avatar_url ~ ('^https://gbgjadqwqzxxyhydlgtj\.supabase\.co/storage/v1/object/public/avatars/'
                                         || id::text || '/[a-z0-9_-]+\.(jpg|jpeg|png|webp)(\?v=[0-9]{1,16})?$'));

-- ═══ ٧ · M-06 · حضور الطلاب («متصل الآن») للمسجَّلين لا للزائر ═══
create or replace function qbank.board_full(p_scope text default 'all', p_id uuid default null, p_limit int default 200)
returns jsonb language plpgsql security definer set search_path = qbank, public as $$
-- ★ volatile لا stable: تستعمل جدولًا مؤقتًا (إنشاء وإدراج) ودالة stable لا تُنشئ.
--   PostgREST ينادي RPC بـPOST فلا فرق على الطالب.
declare
  me  uuid := auth.uid();
  uni uuid := p_id;
  lim int := greatest(10, least(coalesce(p_limit, 200), 500));
  win interval := interval '4 hours';       -- «الآن» = خلال أربع ساعات، بطلب علي
  out_board jsonb; out_me jsonb; out_sum jsonb; out_ch jsonb; out_feed jsonb; out_unis jsonb; out_sub jsonb;
begin
  if not coalesce((select board_enabled from qbank.settings where id = 1), true) then
    return jsonb_build_object('ok', false, 'disabled', true);
  end if;
  if p_scope not in ('all','university','subject') then p_scope := 'all'; end if;
  if p_scope = 'university' and uni is null and me is not null then
    select university_id into uni from qbank.profiles where id = me;
  end if;
  if p_scope = 'university' and uni is null then
    return jsonb_build_object('ok', false, 'reason', 'no-university');
  end if;
  if p_scope = 'subject' and p_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no-subject');
  end if;

  /* ── الصفوف: تجميعة المحاولات لكل طالب داخل النطاق ── */
  create temp table if not exists _rows (
    id uuid, name text, avatar text, avatar_url text, university text, university_id uuid,
    tries int, best int, questions int, correct int, accuracy int, seconds int, last timestamptz,
    blocked boolean, online boolean
  ) on commit drop;
  /* ★ «where true» ليس زينة: امتداد pg-safeupdate في Supabase يرفض DELETE بلا WHERE
     من أدوار الواجهة (anon/authenticated) — فتفشل الدالة كلها بـ21000 وتعمل في المحرّر وحده */
  delete from _rows where true;
  insert into _rows
  select p.id,
         qbank.name_shown(p.name),
         coalesce(p.avatar, ''), coalesce(p.avatar_url, ''),
         coalesce(u.name, ''), p.university_id,
         count(a.id)::int,
         coalesce(round(max(a.pct))::int, 0),
         coalesce(sum(a.total), 0)::int,
         coalesce(sum(a.correct), 0)::int,
         case when coalesce(sum(a.total),0) > 0 then round(sum(a.correct) * 100.0 / sum(a.total))::int else 0 end,
         coalesce(sum(a.duration_s), 0)::int,
         max(a.created_at),
         qbank.name_blocked(p.name),
         /* ★ الحضور للمسجَّلين فقط: الزائر يرى الترتيب لا من يجلس أمام الشاشة الآن (تدقيق M-06) */
         case when me is null then null
              else exists (select 1 from qbank.devices d where d.user_id = p.id and d.last_seen > now() - win) end
    from qbank.attempts a
    join qbank.profiles p on p.id = a.user_id
    left join qbank.universities u on u.id = p.university_id
   where ((p_scope = 'all')
      or (p_scope = 'university' and p.university_id = uni)
      or (p_scope = 'subject' and a.subject_id = p_id))
     -- ★ من أخفى نفسه من اللوحة (show_on_board=false في ملفه) لا يظهر باسمه في أي نطاق
     and coalesce(p.show_on_board, true)
   group by p.id, p.name, p.avatar, p.avatar_url, u.name, p.university_id;

  select coalesce(jsonb_agg(to_jsonb(r) - 'university_id' order by r.tries desc, r.best desc, r.questions desc), '[]'::jsonb)
    into out_board
    from (select * from _rows order by tries desc, best desc, questions desc limit lim) r;

  /* ── بطاقتي: ترتيبي بين الكل لا بين أول lim ── */
  select case when me is null then null else (
    select jsonb_build_object('id', r.id, 'name', r.name, 'rank', x.rk, 'of', (select count(*) from _rows),
                              'tries', r.tries, 'best', r.best, 'accuracy', r.accuracy, 'seconds', r.seconds,
                              'questions', r.questions)
      from _rows r
      join (select id, row_number() over (order by tries desc, best desc, questions desc) rk from _rows) x on x.id = r.id
     where r.id = me) end
    into out_me;

  /* ── الملخّص: تراكمي أولًا لأنه يكبر بسرعة ── */
  select jsonb_build_object(
      'students', (select count(*) from _rows),
      'active7d', (select count(*) from _rows where last > now() - interval '7 days'),
      'online_now', (
        select count(distinct d.user_id) from qbank.devices d
         where d.last_seen > now() - win
           and (p_scope = 'all'
             or (p_scope = 'university' and exists (select 1 from qbank.profiles p where p.id = d.user_id and p.university_id = uni))
             or (p_scope = 'subject' and d.subject_id = p_id))),
      'exams', (select coalesce(sum(tries),0) from _rows),
      'questions', (select coalesce(sum(questions),0) from _rows),
      'correct', (select coalesce(sum(correct),0) from _rows),
      'accuracy', (select case when coalesce(sum(questions),0) > 0 then round(sum(correct)*100.0/sum(questions))::int else 0 end from _rows),
      'hours', (select round(coalesce(sum(seconds),0) / 3600.0, 1) from _rows),
      'topAccuracy', (select jsonb_build_object('name', name, 'accuracy', accuracy) from _rows where questions >= 20 order by accuracy desc, questions desc limit 1),
      'topQuestions', (select jsonb_build_object('name', name, 'questions', questions) from _rows order by questions desc limit 1)
    ) into out_sum;

  /* ── أبطال المواد + «المتصلون الآن» في كل مادة ── */
  select coalesce(jsonb_agg(c order by c->>'subject'), '[]'::jsonb) into out_ch
    from (
      select jsonb_build_object(
          'subject_id', s.id, 'subject', s.name, 'color', s.color, 'icon', s.icon,
          'name', (select qbank.name_shown(p.name) from qbank.attempts a2 join qbank.profiles p on p.id = a2.user_id
                    where a2.subject_id = s.id
                      and (p_scope <> 'university' or p.university_id = uni)
                      and coalesce(p.show_on_board, true)
                    order by a2.pct desc, a2.total desc, a2.created_at asc limit 1),
          'pct', (select round(max(a3.pct))::int from qbank.attempts a3 join qbank.profiles p3 on p3.id = a3.user_id
                   where a3.subject_id = s.id and (p_scope <> 'university' or p3.university_id = uni)),
          'blocked', (select qbank.name_blocked(p.name) from qbank.attempts a2 join qbank.profiles p on p.id = a2.user_id
                       where a2.subject_id = s.id and (p_scope <> 'university' or p.university_id = uni)
                         and coalesce(p.show_on_board, true)
                       order by a2.pct desc, a2.total desc, a2.created_at asc limit 1),
          'exams', (select count(*) from qbank.attempts a4 join qbank.profiles p4 on p4.id = a4.user_id
                     where a4.subject_id = s.id and (p_scope <> 'university' or p4.university_id = uni)),
          'online_now', (select count(distinct d.user_id) from qbank.devices d
                          where d.subject_id = s.id and d.last_seen > now() - win)
        ) c
      from qbank.subjects s
     where s.published = true
       and exists (select 1 from qbank.attempts a5 join qbank.profiles p5 on p5.id = a5.user_id
                    where a5.subject_id = s.id and (p_scope <> 'university' or p5.university_id = uni))
       and (p_scope <> 'subject' or s.id = p_id)
    ) t;

  /* ── شريط الحركة: آخر ٢٠ محاولة — بالاسم المقنَّع، ولا محتوى مدفوع ── */
  select coalesce(jsonb_agg(f), '[]'::jsonb) into out_feed
    from (
      select jsonb_build_object(
          'uid', a.user_id, 'n', qbank.name_shown(p.name), 'blocked', qbank.name_blocked(p.name),
          's', a.subject_id, 'subject', s.name, 'color', s.color,
          'p', round(a.pct)::int, 'q', a.total, 't', extract(epoch from a.created_at)::bigint
        ) f
      from qbank.attempts a
      join qbank.profiles p on p.id = a.user_id
      join qbank.subjects s on s.id = a.subject_id
     where ((p_scope = 'all')
        or (p_scope = 'university' and p.university_id = uni)
        or (p_scope = 'subject' and a.subject_id = p_id))
       and coalesce(p.show_on_board, true)
     order by a.created_at desc limit 20
    ) t;

  /* ── الجامعات التي فيها متصدّرون — لاختيار جامعةٍ بعينها ── */
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name, 'country', u.country,
                                               'students', x.n, 'exams', x.e) order by x.e desc), '[]'::jsonb)
    into out_unis
    from (select p.university_id, count(distinct p.id) n, count(a.id) e
            from qbank.attempts a join qbank.profiles p on p.id = a.user_id
           where p.university_id is not null group by p.university_id) x
    join qbank.universities u on u.id = x.university_id;

  if p_scope = 'subject' then
    select jsonb_build_object('id', s.id, 'name', s.name, 'color', s.color, 'icon', s.icon,
                              'online_now', (select count(distinct d.user_id) from qbank.devices d
                                              where d.subject_id = s.id and d.last_seen > now() - win))
      into out_sub from qbank.subjects s where s.id = p_id;
  elsif p_scope = 'university' then
    select jsonb_build_object('id', u.id, 'name', u.name, 'country', u.country) into out_sub
      from qbank.universities u where u.id = uni;
  end if;

  return jsonb_build_object(
    'ok', true, 'scope', p_scope, 'online_window_h', 4,
    'board', out_board, 'me', out_me, 'summary', out_sum, 'champions', out_ch,
    'feed', out_feed, 'universities', out_unis, 'target', out_sub
  );
end $$;

-- ═══ ٨ · M-02 · عدّاد الحدّ للخادم (Vercel بلا ذاكرة بين النداءات) ═══
create table if not exists qbank.rate_limits (
  k   text primary key,
  n   int not null default 0,
  win timestamptz not null default now()
);
alter table qbank.rate_limits enable row level security;   -- لا سياسات: لا يقرؤه ولا يكتبه إلا الخادم
revoke all on qbank.rate_limits from anon, authenticated;

create or replace function qbank.rate_hit(p_key text, p_max int, p_window_s int)
returns boolean language plpgsql security definer set search_path = qbank, public as $$
declare cur int;
begin
  insert into qbank.rate_limits (k, n, win) values (p_key, 1, now())
  on conflict (k) do update
    set n   = case when qbank.rate_limits.win < now() - make_interval(secs => p_window_s) then 1 else qbank.rate_limits.n + 1 end,
        win = case when qbank.rate_limits.win < now() - make_interval(secs => p_window_s) then now() else qbank.rate_limits.win end
  returning n into cur;
  /* تنظيف عرضي: مفاتيح انتهت نافذتها منذ يوم */
  if random() < 0.01 then delete from qbank.rate_limits where win < now() - interval '1 day'; end if;
  return cur <= p_max;
end $$;
revoke all on function qbank.rate_hit(text, int, int) from public, anon, authenticated;
grant execute on function qbank.rate_hit(text, int, int) to service_role;

-- ═══ ٩ · M-10 · نزاهة المحاولات والتقييمات ═══
/* المحاولة تُكتب من المتصفح (نتيجة اختبار) — نحدّها بالمعقول: نتيجة ممكنة، وعشرٌ في الدقيقة */
create or replace function qbank.attempts_guard() returns trigger language plpgsql as $$
begin
  if new.total < 1 or new.total > 1000 or new.correct < 0 or new.correct > new.total
     or new.pct < 0 or new.pct > 100 or new.duration_s < 0 or new.duration_s > 86400 then
    raise exception 'نتيجة غير ممكنة' using errcode = '23514';
  end if;
  if (select count(*) from qbank.attempts a
       where a.user_id = new.user_id and a.created_at > now() - interval '1 minute') >= 10 then
    raise exception 'محاولات كثيرة في دقيقة واحدة' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists attempts_guard_trg on qbank.attempts;
create trigger attempts_guard_trg before insert on qbank.attempts
  for each row execute function qbank.attempts_guard();

/* التقييم عبر الدوال (rate_student / rate_subject) التي تتحقق من الشروط — لا إدراجًا مباشرًا */
drop policy if exists sratings_write  on qbank.student_ratings;
drop policy if exists sratings_delete on qbank.student_ratings;
create policy sratings_delete on qbank.student_ratings for delete using (rater_id = auth.uid());
drop policy if exists ratings_write  on qbank.subject_ratings;
drop policy if exists ratings_delete on qbank.subject_ratings;
create policy ratings_delete on qbank.subject_ratings for delete using (user_id = auth.uid());

-- ═══ ١٠ · L-09 · حذف الحساب يمسح صوره وملفاته من المخزن ═══
create or replace function qbank.delete_me()
returns void language plpgsql security definer set search_path = qbank, public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'لا جلسة'; end if;
  /* ملفاته في المخزن أولًا — ولا يفشل الحذف إن تعذّر التنظيف */
  begin
    delete from storage.objects
     where bucket_id in ('avatars', 'uploads') and (storage.foldername(name))[1] = uid::text;
  exception when others then null;
  end;
  delete from auth.users where id = uid;
end $$;
revoke all on function qbank.delete_me() from public, anon;
grant execute on function qbank.delete_me() to authenticated;

-- ═══ ١١ · M-07 · PostgREST يرى مخطط qbank وحده ═══
/*
  «qbank, public» تعيد كشف مخطط public كله عبر /rest/v1. المتصفح والخادم
  يرسلان Accept-Profile: qbank دائمًا فلا حاجة لـpublic. إن ظهر بعد التنفيذ
  خطأ PGRST106 في شيءٍ ما فأعد السطر إلى 'qbank, public' وأخبرني.
*/
alter role authenticator set pgrst.db_schemas = 'qbank';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';

-- ═══ تحقّق ═══
select
  (select count(*) from information_schema.column_privileges
    where table_schema = 'qbank' and table_name = 'profiles' and grantee = 'authenticated' and privilege_type = 'UPDATE') as أعمدة_قابلة_للتعديل,
  (select has_function_privilege('anon', 'qbank.refund_credits(uuid,int,text,uuid)', 'execute')) as anon_refund_يجب_false,
  (select has_function_privilege('authenticated', 'qbank.spend_credits(int,text,uuid)', 'execute')) as spend_قديم_يجب_false,
  (select relrowsecurity from pg_class where oid = 'qbank.name_rules'::regclass) as name_rules_rls,
  (select count(*) from pg_policies where schemaname = 'qbank' and tablename = 'subjects') as سياسات_المواد_يجب_4,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'qbank' and p.proname = 'rate_hit') as rate_hit;
