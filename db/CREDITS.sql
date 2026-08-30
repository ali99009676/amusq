-- ═══════════════════════════════════════════════════════════════════════════
--  مراجعة · رصيد الإثراء — التكلفة تتبع الطلب
--
--  المشكلة: الإثراء بالذكاء يكلّف المنصة عند الرفع، والدخل يأتي عند الشراء —
--  وقد لا يلتقيان. طالب يرفع عشرين ملفًا ولا يبيع شيئًا يستنزف المنصة.
--
--  الحل: مساران للرفع. بلا إثراء = مجاني بلا حدّ (التقسيم لا يكلّف شيئًا).
--  وبالإثراء = يُحسم من رصيد الطالب. فلا تُنفَق قرشًا إلا وقد طُلب.
--
--  العملة واحدة: الكوين. يكسبها من بيع مواده أو يشتريها، وينفقها على الإثراء.
--  عملة واحدة أوضح من اثنتين، وتغلق الدائرة: من يرفع ويبيع يرفع مجانًا للأبد.
--
--  آمن التكرار بالكامل: لا drop لجدول ولا لعمود.
-- ═══════════════════════════════════════════════════════════════════════════
set search_path = qbank, public;

-- ═══ ١ · أسعار قابلة للضبط من لوحة المشرف لا من الكود ═══
/*
  الأرقام الافتراضية محسوبة على تكلفة فعلية ٢٫٦ ريال لكل ٣٠٠ سؤال
  (‎$0.60‎ من Anthropic + فرق عملة + إعادة محاولات)، وعلى أسوأ قناة دفع
  (عمولة المتاجر ٣٠٪). فيبقى الصافي ثلاثة أضعاف التكلفة في كل الأحوال.
*/
alter table qbank.settings add column if not exists enrich_cost_per_q int not null default 1;
  -- كم كوينًا يكلّف إثراء سؤال واحد
alter table qbank.settings add column if not exists signup_grant     int not null default 50;
  -- منحة المسجّل الجديد بالكوين — يجرّب بها قبل أن يدفع
alter table qbank.settings add column if not exists coin_price_halalas int not null default 5;
  -- سعر الكوين بالهللة: ٥ هللات = ٠٫٠٥ ريال للسؤال = ١٥ ريالًا لكل ٣٠٠
alter table qbank.settings add column if not exists enrich_open      boolean not null default true;
  -- مفتاح إيقاف عام: يوقف كل إثراء إن تجاوز الإنفاق حدّه

do $$ begin
  alter table qbank.settings add constraint settings_credit_ck check (
    enrich_cost_per_q between 0 and 100
    and signup_grant between 0 and 100000
    and coin_price_halalas between 1 and 10000);
exception when duplicate_object then null; end $$;

-- ═══ ٢ · سجل الحركات ═══
/*
  coin_transactions موجود من نظام الإحالة. نوسّعه ليحمل الإنفاق أيضًا:
  المبلغ الموجب كسب، والسالب إنفاق. سجل واحد أوضح من سجلّين، والطالب يرى
  دخله وخرجه في مكان واحد كما في أي محفظة.
*/
alter table qbank.coin_transactions add column if not exists kind text not null default 'referral';
  -- referral | signup | purchase | enrich | refund | admin
alter table qbank.coin_transactions add column if not exists draft_id uuid;

do $$ begin
  alter table qbank.coin_transactions add constraint coin_kind_ck
    check (kind in ('referral','signup','purchase','enrich','refund','admin'));
exception when duplicate_object then null; end $$;

create index if not exists coins_kind_idx on qbank.coin_transactions (user_id, kind, created_at desc);

-- ═══ ٣ · منحة المسجّل الجديد ═══
/*
  تُمنح مرة واحدة لكل حساب. الفهرس الفريد هو الحارس: حتى لو نودي التريجر
  مرتين، أو أعاد أحد إنشاء ملفه، لن تُمنح المنحة مرّتين.
*/
create unique index if not exists coins_signup_once on qbank.coin_transactions (user_id)
  where kind = 'signup';

create or replace function qbank.grant_signup_credits(uid uuid)
returns int language plpgsql security definer set search_path = qbank, public as $$
declare g int;
begin
  select coalesce(signup_grant, 0) into g from qbank.settings where id = 1;
  if coalesce(g, 0) <= 0 then return 0; end if;
  begin
    insert into qbank.coin_transactions (user_id, amount, reason, kind)
    values (uid, g, 'منحة ترحيب — جرّب الإثراء', 'signup');
  exception when unique_violation then
    return 0;                       -- مُنحت من قبل
  end;
  update qbank.profiles set coins_balance = coins_balance + g where id = uid;
  return g;
end $$;
revoke all on function qbank.grant_signup_credits(uuid) from public;
grant execute on function qbank.grant_signup_credits(uuid) to service_role, authenticated;

-- التريجر القائم يُنشئ الملف؛ نضيف المنحة بعده بتريجر مستقل
-- كي لا نمسّ دالة إنشاء المستخدم التي تعمل منذ الإطلاق
create or replace function qbank.after_profile_insert()
returns trigger language plpgsql security definer set search_path = qbank, public as $$
begin
  perform qbank.grant_signup_credits(new.id);
  return new;
end $$;

drop trigger if exists profiles_grant_trg on qbank.profiles;
create trigger profiles_grant_trg
  after insert on qbank.profiles
  for each row execute function qbank.after_profile_insert();

-- ═══ ٤ · الحسم الذرّي ═══
/*
  أخطر دالة في الملف. ثلاثة حرّاس:
  ١) القفل: update … where balance >= n يفشل ذرّيًا إن لم يكفِ الرصيد،
     فلا يستطيع طالب فتح لسانين ويُثري ضِعف ما يملك.
  ٢) القيد coins_balance >= 0 في الجدول — حزام أمان ثانٍ.
  ٣) الحسم قبل النداء لا بعده: لو تعطّل الخادم بعد الحسم رددنا الرصيد،
     أما الحسم بعد النداء فيعني إثراءً مجانيًا عند كل انقطاع.
*/
create or replace function qbank.spend_credits(n int, p_reason text default '', p_draft uuid default null)
returns jsonb language plpgsql security definer set search_path = qbank, public as $$
declare
  uid uuid := auth.uid();
  need int := greatest(coalesce(n, 0), 0);
  bal int;
  open_flag boolean;
begin
  if uid is null then return jsonb_build_object('ok', false, 'reason','no_session'); end if;
  if need = 0 then return jsonb_build_object('ok', true, 'spent', 0); end if;

  select enrich_open into open_flag from qbank.settings where id = 1;
  if not coalesce(open_flag, true) then
    return jsonb_build_object('ok', false, 'reason','closed');
  end if;

  update qbank.profiles
     set coins_balance = coins_balance - need
   where id = uid and coins_balance >= need
  returning coins_balance into bal;

  if bal is null then
    select coalesce(coins_balance, 0) into bal from qbank.profiles where id = uid;
    return jsonb_build_object('ok', false, 'reason','insufficient',
                              'balance', coalesce(bal,0), 'needed', need);
  end if;

  insert into qbank.coin_transactions (user_id, amount, reason, kind, draft_id)
  values (uid, -need, coalesce(nullif(p_reason,''), 'إثراء أسئلة'), 'enrich', p_draft);

  return jsonb_build_object('ok', true, 'spent', need, 'balance', bal);
end $$;
revoke all on function qbank.spend_credits(int, text, uuid) from public;
grant execute on function qbank.spend_credits(int, text, uuid) to authenticated;

/* الردّ عند فشل الدفعة — الطالب لا يدفع ثمن عطل عندنا */
create or replace function qbank.refund_credits(n int, p_reason text default '', p_draft uuid default null)
returns jsonb language plpgsql security definer set search_path = qbank, public as $$
declare uid uuid := auth.uid(); back int := greatest(coalesce(n,0), 0); bal int;
begin
  if uid is null or back = 0 then return jsonb_build_object('ok', false); end if;
  update qbank.profiles set coins_balance = coins_balance + back
   where id = uid returning coins_balance into bal;
  insert into qbank.coin_transactions (user_id, amount, reason, kind, draft_id)
  values (uid, back, coalesce(nullif(p_reason,''), 'ردّ رصيد — تعذّرت المعالجة'), 'refund', p_draft);
  return jsonb_build_object('ok', true, 'refunded', back, 'balance', bal);
end $$;
revoke all on function qbank.refund_credits(int, text, uuid) from public;
grant execute on function qbank.refund_credits(int, text, uuid) to authenticated;

-- ═══ ٥ · شراء الكوينز ═══
/*
  تُنادى من الخادم بمفتاح الخدمة بعد تأكيد الدفعة لدى البوابة —
  لا من المتصفح. ورقم العملية فريد فلا تُضاف الكوينز مرتين لدفعة واحدة.
*/
create table if not exists qbank.coin_purchases (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  coins       int not null check (coins > 0),
  halalas     int not null check (halalas >= 0),
  source      text not null default 'web',      -- web | apple | google
  payment_ref text not null,
  created_at  timestamptz not null default now()
);
create unique index if not exists coin_purchases_ref on qbank.coin_purchases (source, payment_ref);
alter table qbank.coin_purchases enable row level security;
drop policy if exists purchases_select on qbank.coin_purchases;
create policy purchases_select on qbank.coin_purchases for select
  using (user_id = auth.uid() or qbank.is_admin());

create or replace function qbank.credit_purchase(uid uuid, n int, paid_halalas int,
                                                 p_source text, p_ref text)
returns jsonb language plpgsql security definer set search_path = qbank, public as $$
declare bal int;
begin
  if n <= 0 then return jsonb_build_object('ok', false, 'reason','bad_amount'); end if;
  begin
    insert into qbank.coin_purchases (user_id, coins, halalas, source, payment_ref)
    values (uid, n, greatest(coalesce(paid_halalas,0),0), coalesce(nullif(p_source,''),'web'), p_ref);
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason','already_credited');
  end;
  update qbank.profiles set coins_balance = coins_balance + n
   where id = uid returning coins_balance into bal;
  insert into qbank.coin_transactions (user_id, amount, reason, kind)
  values (uid, n, 'شراء رصيد', 'purchase');
  return jsonb_build_object('ok', true, 'coins', n, 'balance', bal);
end $$;
revoke all on function qbank.credit_purchase(uuid, int, int, text, text) from public;
grant execute on function qbank.credit_purchase(uuid, int, int, text, text) to service_role;

-- ═══ ٦ · ما يحتاجه المتصفح ═══
create or replace function qbank.my_credits()
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select case when auth.uid() is null then jsonb_build_object('error','لا جلسة')
  else jsonb_build_object(
    'balance', (select coalesce(coins_balance,0) from qbank.profiles where id = auth.uid()),
    'cost_per_q', (select enrich_cost_per_q from qbank.settings where id = 1),
    'coin_halalas', (select coin_price_halalas from qbank.settings where id = 1),
    'open', (select enrich_open from qbank.settings where id = 1),
    'granted', exists (select 1 from qbank.coin_transactions
                        where user_id = auth.uid() and kind = 'signup'),
    'spent', (select coalesce(-sum(amount),0) from qbank.coin_transactions
               where user_id = auth.uid() and amount < 0),
    'earned', (select coalesce(sum(amount),0) from qbank.coin_transactions
                where user_id = auth.uid() and amount > 0)
  ) end
$$;
revoke all on function qbank.my_credits() from public;
grant execute on function qbank.my_credits() to authenticated;

-- إنفاق المنصة على الإثراء — يراه المشرف في لوحته
create or replace function qbank.admin_spend(days int default 30)
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select case when not qbank.is_admin() then jsonb_build_object('error','غير مخوّل')
  else jsonb_build_object(
    'enriched_q', (select coalesce(-sum(amount),0) from qbank.coin_transactions
                    where kind = 'enrich' and created_at > now() - (days || ' days')::interval),
    'granted', (select coalesce(sum(amount),0) from qbank.coin_transactions
                 where kind = 'signup' and created_at > now() - (days || ' days')::interval),
    'purchased_coins', (select coalesce(sum(coins),0) from qbank.coin_purchases
                         where created_at > now() - (days || ' days')::interval),
    'revenue_halalas', (select coalesce(sum(halalas),0) from qbank.coin_purchases
                         where created_at > now() - (days || ' days')::interval),
    'outstanding', (select coalesce(sum(coins_balance),0) from qbank.profiles),
    'open', (select enrich_open from qbank.settings where id = 1)
  ) end
$$;
revoke all on function qbank.admin_spend(int) from public;
grant execute on function qbank.admin_spend(int) to authenticated;

-- المسجَّلون قبل هذا الملف يأخذون منحتهم أيضًا — لا يُظلم السابق
select qbank.grant_signup_credits(id) from qbank.profiles where not is_admin;

notify pgrst, 'reload schema';
