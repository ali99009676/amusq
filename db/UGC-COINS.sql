-- ═══════════════════════════════════════════════════════════════════════
--  بنك الأسئلة · مواد الطلاب (UGC) + محفظة الكوينز + تجربة العشر دقائق
--  آمن التكرار بالكامل: كل إضافة if not exists، ولا drop لعمود أو جدول.
-- ═══════════════════════════════════════════════════════════════════════
set search_path = qbank, public;

-- ═══ ١ · توسعة الجداول ═══
alter table qbank.subjects add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table qbank.subjects add column if not exists status     text not null default 'published';  -- published | suspended | removed
alter table qbank.subjects add column if not exists price      int  not null default 0;            -- بالريال؛ ٠ = يحدّده المشرف لاحقًا
alter table qbank.subjects add column if not exists slug       text;
-- نمط المعالجة: strict = حرفًا بحرف (الافتراضي وقاعدة المشروع)، enhanced = يسمح للذكاء بتحسين الصياغة
alter table qbank.subjects add column if not exists sanctity_mode text not null default 'strict';

do $$ begin
  alter table qbank.subjects add constraint subjects_status_ck check (status in ('published','suspended','removed'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table qbank.subjects add constraint subjects_mode_ck check (sanctity_mode in ('strict','enhanced'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table qbank.subjects add constraint subjects_price_ck check (price >= 0 and price <= 5000);
exception when duplicate_object then null; end $$;

create unique index if not exists subjects_slug_uidx on qbank.subjects (slug) where slug is not null;
create index if not exists subjects_creator_idx on qbank.subjects (created_by);

-- الأصل محفوظ دائمًا مهما كان النمط: enhanced يحسّن المعروض ولا يمحو ما وصل.
-- هكذا يبقى الفحص النصّي الآلي ذا معنى، ويظل بوسع الطالب رؤية نص الدكتور.
alter table qbank.questions add column if not exists q_original       text;
alter table qbank.questions add column if not exists options_original jsonb;

alter table qbank.profiles add column if not exists coins_balance int not null default 0;
do $$ begin
  alter table qbank.profiles add constraint profiles_coins_ck check (coins_balance >= 0);
exception when duplicate_object then null; end $$;

-- ═══ ٢ · جداول جديدة ═══
create table if not exists qbank.subject_trials (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  subject_id   uuid not null references qbank.subjects(id) on delete cascade,
  started_at   timestamptz not null default now(),
  seconds_used int not null default 0,
  unique (user_id, subject_id)
);
create index if not exists trials_user_idx on qbank.subject_trials (user_id);

create table if not exists qbank.coin_transactions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  amount     int not null,
  reason     text not null default '',
  subject_id uuid references qbank.subjects(id) on delete set null,
  buyer_id   uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists coins_user_idx on qbank.coin_transactions (user_id, created_at desc);
-- مكافأة واحدة لكل مشترٍ في كل مادة: الشراء المكرر لا يُكرّر الكوينز
create unique index if not exists coins_once_uidx on qbank.coin_transactions (user_id, subject_id, buyer_id)
  where buyer_id is not null;

alter table qbank.subject_trials    enable row level security;
alter table qbank.coin_transactions enable row level security;

-- ═══ ٣ · سياسات RLS ═══
-- التجربة والمحفظة: كل طالب يرى سطوره وحده. الكتابة عبر الدوال لا مباشرة،
-- كي لا يكتب أحد seconds_used = 0 كل ثانية ويجعل التجربة أبدية.
drop policy if exists trials_select on qbank.subject_trials;
create policy trials_select on qbank.subject_trials for select using (user_id = auth.uid() or qbank.is_admin());

drop policy if exists coins_select on qbank.coin_transactions;
create policy coins_select on qbank.coin_transactions for select using (user_id = auth.uid() or qbank.is_admin());

-- المواد: المنشورة تُرى، والموقوفة لا يراها إلا صاحبها والمشرف
drop policy if exists subjects_select on qbank.subjects;
create policy subjects_select on qbank.subjects for select
  using (
    (published = true and status = 'published')
    or qbank.is_admin()
    or created_by = auth.uid()
  );

-- ═══ ٤ · دوال الوصول ═══
-- سقف التجربة بالثواني — مصدر واحد للرقم لا يتكرر في الواجهة والخادم
create or replace function qbank.trial_cap() returns int language sql immutable as $$ select 600 $$;

/*
  نبضة التجربة: تُستدعى كل ٣٠ ثانية من المتصفح.
  الزيادة تُقصّ في الخادم (٦٠ ثانية سقفًا للنبضة الواحدة) كي لا يُحقن رقم كبير،
  والمجموع لا يتجاوز السقف مهما تكرّرت النداءات.
  ولا تُفتح التجربة إلا لمنشئ المادة — الزميل يشتري مباشرة.
*/
create or replace function qbank.rpc_record_trial_heartbeat(subject_id uuid, interval_seconds int default 30)
returns jsonb language plpgsql security definer set search_path = qbank, public as $$
declare
  uid uuid := auth.uid();
  creator uuid;
  inc int := least(greatest(coalesce(interval_seconds, 30), 0), 60);
  used int;
  cap int := qbank.trial_cap();
  sid uuid := subject_id;   -- نسخة محلية: اسم المعامل يطابق اسم عمود، وPostgres يعتبره ملتبسًا
begin
  if uid is null then return jsonb_build_object('error','لا جلسة'); end if;
  select s.created_by into creator from qbank.subjects s where s.id = sid;
  if creator is null or creator <> uid then
    -- ليست مادته: لا تجربة أصلًا، ولا نُنشئ له سجلًا
    return jsonb_build_object('eligible', false, 'seconds_used', 0, 'seconds_left', 0, 'cap', cap);
  end if;

  -- تحديث ثم إدراج بدل on conflict: اسم المعامل يطابق اسم عمود،
  -- واستنتاج الفهرس في on conflict يصير ملتبسًا عند Postgres
  update qbank.subject_trials t
     set seconds_used = least(t.seconds_used + inc, cap)
   where t.user_id = uid and t.subject_id = sid
  returning t.seconds_used into used;

  if used is null then
    insert into qbank.subject_trials (user_id, subject_id, seconds_used)
    values (uid, sid, least(inc, cap))
    returning seconds_used into used;
  end if;

  return jsonb_build_object(
    'eligible', true, 'seconds_used', used,
    'seconds_left', greatest(cap - used, 0), 'cap', cap,
    'expired', used >= cap);
end $$;
revoke all on function qbank.rpc_record_trial_heartbeat(uuid, int) from public;
grant execute on function qbank.rpc_record_trial_heartbeat(uuid, int) to authenticated;

/*
  قرار الوصول الوحيد المعتمد. الواجهة تعرض، وهذه تحكم.
  الترتيب مقصود: الاستحقاق المدفوع أولًا كي لا يُستهلك رصيد تجربة من اشترى فعلًا.
*/
create or replace function qbank.subject_access(sid uuid)
returns jsonb language plpgsql stable security definer set search_path = qbank, public as $$
declare
  uid uuid := auth.uid();
  s record;
  used int := 0;
  cap int := qbank.trial_cap();
begin
  select * into s from qbank.subjects where id = sid;
  if s is null then return jsonb_build_object('allowed', false, 'reason','missing'); end if;
  if s.status <> 'published' then
    return jsonb_build_object('allowed', false, 'reason','suspended', 'price', s.price);
  end if;
  if qbank.is_admin() then return jsonb_build_object('allowed', true, 'reason','admin'); end if;
  if s.free then return jsonb_build_object('allowed', true, 'reason','free'); end if;
  if uid is null then return jsonb_build_object('allowed', false, 'reason','anon', 'price', s.price); end if;

  if exists (select 1 from qbank.entitlements e
             where e.user_id = uid and e.expires_at > now()
               and (e.kind = 'semester' or e.subject_id = sid)) then
    return jsonb_build_object('allowed', true, 'reason','entitled');
  end if;

  -- التجربة حكرٌ على المنشئ: هي مكافأته على الرفع، لا عيّنة مجانية للجميع
  if s.created_by = uid then
    select coalesce(t.seconds_used, 0) into used
      from qbank.subject_trials t where t.user_id = uid and t.subject_id = sid;
    if coalesce(used, 0) < cap then
      return jsonb_build_object('allowed', true, 'reason','trial',
        'seconds_used', coalesce(used,0), 'seconds_left', cap - coalesce(used,0), 'cap', cap);
    end if;
    return jsonb_build_object('allowed', false, 'reason','trial_expired',
      'seconds_used', cap, 'seconds_left', 0, 'cap', cap, 'price', s.price);
  end if;

  return jsonb_build_object('allowed', false, 'reason','paywall', 'price', s.price);
end $$;
revoke all on function qbank.subject_access(uuid) from public;
grant execute on function qbank.subject_access(uuid) to authenticated, anon;

-- ═══ ٥ · الكوينز ═══
create or replace function qbank.coins_per_sale() returns int language sql immutable as $$ select 50 $$;

/*
  تُستدعى من الخادم الموثوق بعد تأكيد الدفع (service_role) لا من المتصفح.
  ذرّية: السجل والرصيد في معاملة واحدة، والفهرس الفريد يمنع تكرار المكافأة.
*/
create or replace function qbank.award_referral_coins(sid uuid, buyer uuid, ref uuid)
returns jsonb language plpgsql security definer set search_path = qbank, public as $$
declare
  creator uuid;
  amt int := qbank.coins_per_sale();
  bal int;
begin
  select created_by into creator from qbank.subjects where id = sid;
  if creator is null then return jsonb_build_object('ok', false, 'reason','no_creator'); end if;
  -- الإحالة تُحترم فقط إن طابقت منشئ المادة: رابط مزوّر لا يحوّل المكافأة لغريب
  if ref is not null and ref <> creator then return jsonb_build_object('ok', false, 'reason','ref_mismatch'); end if;
  if buyer = creator then return jsonb_build_object('ok', false, 'reason','self_purchase'); end if;

  begin
    insert into qbank.coin_transactions (user_id, amount, reason, subject_id, buyer_id)
    values (creator, amt, 'بيع مادة عبر رابطك', sid, buyer);
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason','already_awarded');
  end;

  update qbank.profiles set coins_balance = coins_balance + amt
   where id = creator returning coins_balance into bal;
  return jsonb_build_object('ok', true, 'amount', amt, 'creator', creator, 'balance', bal);
end $$;
revoke all on function qbank.award_referral_coins(uuid, uuid, uuid) from public;
grant execute on function qbank.award_referral_coins(uuid, uuid, uuid) to service_role;

-- محفظتي: الرصيد والمبيعات — نداء واحد لشاشة الحساب
create or replace function qbank.my_wallet()
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select case when auth.uid() is null then jsonb_build_object('error','لا جلسة')
  else jsonb_build_object(
    'balance', (select coalesce(coins_balance,0) from qbank.profiles where id = auth.uid()),
    'sales',   (select count(*) from qbank.coin_transactions where user_id = auth.uid() and buyer_id is not null),
    'earned',  (select coalesce(sum(amount),0) from qbank.coin_transactions where user_id = auth.uid() and amount > 0),
    'subjects',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'slug', s.slug, 'status', s.status,
        'price', s.price, 'q_count', s.q_count, 'published', s.published,
        'sales', (select count(*) from qbank.coin_transactions c
                  where c.subject_id = s.id and c.buyer_id is not null)) order by s.created_at desc)
      from qbank.subjects s where s.created_by = auth.uid()), '[]'::jsonb),
    'ledger', coalesce((
      select jsonb_agg(row_to_json(t)) from (
        select amount, reason, created_at from qbank.coin_transactions
        where user_id = auth.uid() order by created_at desc limit 20) t), '[]'::jsonb)
  ) end
$$;
revoke all on function qbank.my_wallet() from public;
grant execute on function qbank.my_wallet() to authenticated;

-- لوحة المشرف: مواد الطلاب وإحصاءاتها
create or replace function qbank.admin_ugc()
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select case when not qbank.is_admin() then jsonb_build_object('error','غير مخوّل')
  else coalesce((
    select jsonb_agg(row_to_json(t) order by t.created_at desc) from (
      select s.id, s.name, s.slug, s.status, s.price, s.published, s.q_count,
             s.sanctity_mode, s.created_at, s.created_by,
             coalesce(nullif(p.name,''),'طالب') creator_name,
             (select count(*) from qbank.coin_transactions c where c.subject_id = s.id and c.buyer_id is not null) sales,
             (select coalesce(sum(c.amount),0) from qbank.coin_transactions c where c.subject_id = s.id) coins,
             (select count(*) from qbank.attempts a where a.subject_id = s.id) attempts
      from qbank.subjects s left join qbank.profiles p on p.id = s.created_by
      where s.created_by is not null) t), '[]'::jsonb) end
$$;
revoke all on function qbank.admin_ugc() from public;
grant execute on function qbank.admin_ugc() to authenticated;
