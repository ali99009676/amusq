-- ═══════════════════════════════════════════════════════════════════════════
--  مراجعة · الدفع — الطبقة التي تحوّل المنصة من مشروع إلى عمل
--
--  ثلاث قواعد تحكم كل سطر هنا، وكلّها مكتوبة لأن كسرها يُكلّف مالًا حقيقيًا:
--
--  ١ · السعر يُحسب في القاعدة ويُجمَّد في صفّ قبل نداء البوابة.
--      المتصفح لا يُرسل مبلغًا أبدًا — ولو أرسله لاشترى مادة بريال واحد.
--
--  ٢ · لا يُمنح شيء إلا بعد أن يتحقق الخادم من البوابة مباشرة.
--      رسالة «تم الدفع» القادمة من المتصفح أو من webhook غير موقّع
--      يستطيع أي أحد تزويرها. الدليل الوحيد هو سؤال البوابة بنفسنا.
--
--  ٣ · التسوية ذرّية وغير قابلة للتكرار. البوابة قد تُرسل الإشعار مرتين،
--      والطالب قد يُحدّث صفحة العودة — ومرجع الدفعة فريد يمنع المنح مرتين.
--
--  آمن التكرار بالكامل: لا drop لجدول ولا لعمود.
-- ═══════════════════════════════════════════════════════════════════════════
set search_path = qbank, public;

-- ═══ ١ · إعدادات التسعير ═══
alter table qbank.settings add column if not exists coin_packages   jsonb not null default
  '[{"coins":300,"halalas":1500},{"coins":700,"halalas":3000},{"coins":1600,"halalas":6000}]'::jsonb;
alter table qbank.settings add column if not exists entitlement_days int not null default 180;
alter table qbank.settings add column if not exists pay_open        boolean not null default true;
alter table qbank.settings add column if not exists pay_currency    text not null default 'SAR';

-- ═══ ٢ · سجل الدفعات ═══
/*
  صفٌّ لكل نيّة شراء، يُنشأ قبل الذهاب إلى البوابة ويحمل المبلغ المجمَّد.
  status: pending → paid | failed.

  provider_ref فريد: هو ما يجعل التسوية غير قابلة للتكرار مهما تكرر
  الإشعار. وnullable لأن الصف يُولد قبل أن يكون للبوابة مرجع.
*/
create table if not exists qbank.payments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  kind          text not null,                      -- coins | subject
  subject_id    uuid references qbank.subjects(id) on delete set null,
  coins         int  not null default 0,
  amount_halalas int not null,
  currency      text not null default 'SAR',
  status        text not null default 'pending',    -- pending | paid | failed
  provider      text not null default 'tap',
  provider_ref  text,
  ref_user      uuid references auth.users(id) on delete set null,  -- صاحب رابط الإحالة
  fail_reason   text not null default '',
  created_at    timestamptz not null default now(),
  paid_at       timestamptz
);
create unique index if not exists payments_provider_ref
  on qbank.payments (provider, provider_ref) where provider_ref is not null;
create index if not exists payments_user_idx on qbank.payments (user_id, created_at desc);
create index if not exists payments_status_idx on qbank.payments (status, created_at desc);

-- ═══ ٣ · باقات الكوينز المعروضة ═══
create or replace function qbank.pay_options()
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select jsonb_build_object(
    'open',     coalesce((select s.pay_open from qbank.settings s limit 1), true),
    'currency', coalesce((select s.pay_currency from qbank.settings s limit 1), 'SAR'),
    'packages', coalesce((select s.coin_packages from qbank.settings s limit 1), '[]'::jsonb),
    'cost_per_q', coalesce((select s.enrich_cost_per_q from qbank.settings s limit 1), 1))
$$;
revoke all on function qbank.pay_options() from public;
grant execute on function qbank.pay_options() to anon, authenticated;

-- ═══ ٤ · إنشاء نيّة الشراء ═══
/*
  ★ هنا يُحسم السعر.
  للكوينز: يجب أن تطابق الباقةُ باقةً معلنة في الإعدادات — لا نقبل عددًا
  حرًّا، وإلا اشترى الطالب مليون كوين بريال. وللمادة: السعر من صف المادة
  نفسه لحظة الشراء.

  ولا نداء للبوابة من هنا: القاعدة تُجمّد المبلغ، والخادم يأخذه إلى البوابة.
*/
create or replace function qbank.create_payment(
  p_kind text, p_subject uuid default null, p_coins int default 0, p_ref uuid default null
) returns jsonb language plpgsql security definer set search_path = qbank, public as $$
declare
  uid uuid := auth.uid();
  cfg qbank.settings%rowtype;
  amt int;
  pid uuid;
  title text;
  sub qbank.subjects%rowtype;
  pkg jsonb;
begin
  if uid is null then return jsonb_build_object('ok', false, 'reason','auth'); end if;
  select * into cfg from qbank.settings limit 1;
  if not coalesce(cfg.pay_open, true) then
    return jsonb_build_object('ok', false, 'reason','closed');
  end if;

  if p_kind = 'coins' then
    -- ★ الباقة من قائمة معلنة لا من رقم يرسله المتصفح
    select x into pkg
      from jsonb_array_elements(coalesce(cfg.coin_packages, '[]'::jsonb)) x
     where (x->>'coins')::int = p_coins
     limit 1;
    if pkg is null then return jsonb_build_object('ok', false, 'reason','bad_package'); end if;
    amt := (pkg->>'halalas')::int;
    title := 'رصيد ' || p_coins || ' كوين';

  elsif p_kind = 'subject' then
    select * into sub from qbank.subjects
     where id = p_subject and published and status = 'published';
    if sub.id is null then return jsonb_build_object('ok', false, 'reason','not_found'); end if;
    if sub.free then return jsonb_build_object('ok', false, 'reason','already_free'); end if;
    if exists (select 1 from qbank.entitlements e
                where e.user_id = uid and e.subject_id = sub.id and e.expires_at > now()) then
      return jsonb_build_object('ok', false, 'reason','already_owned');
    end if;
    -- السعر بالريال في صف المادة → هللات
    amt := greatest(coalesce(sub.price, 0), 0) * 100;
    if amt <= 0 then return jsonb_build_object('ok', false, 'reason','no_price'); end if;
    title := sub.name;

  else
    return jsonb_build_object('ok', false, 'reason','bad_kind');
  end if;

  insert into qbank.payments (user_id, kind, subject_id, coins, amount_halalas, currency, ref_user)
  values (uid, p_kind, p_subject, greatest(coalesce(p_coins,0),0), amt,
          coalesce(cfg.pay_currency,'SAR'),
          -- ★ لا يُحيل الطالب نفسه: أرخص احتيال في أنظمة الإحالة
          case when p_ref = uid then null else p_ref end)
  returning payments.id into pid;

  return jsonb_build_object('ok', true, 'payment_id', pid, 'amount_halalas', amt,
                            'currency', coalesce(cfg.pay_currency,'SAR'), 'title', title);
end $$;
revoke all on function qbank.create_payment(text, uuid, int, uuid) from public;
grant execute on function qbank.create_payment(text, uuid, int, uuid) to authenticated;

-- ═══ ٥ · التسوية بعد تأكيد البوابة ═══
/*
  ★ لا تُنادى إلا من الخادم بمفتاح الخدمة، وبعد أن يسأل البوابةَ بنفسه.
  service_role وحده — ولو مُنحت لـauthenticated لصار كل طالب قادرًا على
  منح نفسه ما يشاء بنداء واحد.

  والتحقق من المبلغ هنا حزام ثانٍ: لو نجح أحد في دفع مبلغ أقل لدى البوابة
  فلن يُمنح شيئًا. ونسجّل السبب بدل الرفض الصامت.
*/
create or replace function qbank.settle_payment(
  p_payment uuid, p_provider_ref text, p_paid_halalas int, p_provider text default 'tap'
) returns jsonb language plpgsql security definer set search_path = qbank, public as $$
declare
  pay qbank.payments%rowtype;
  cfg qbank.settings%rowtype;
  bal int;
begin
  select * into pay from qbank.payments where id = p_payment for update;
  if pay.id is null then return jsonb_build_object('ok', false, 'reason','not_found'); end if;

  -- التكرار ليس خطأ: البوابة تُعيد الإشعار، والطالب يُحدّث صفحة العودة
  if pay.status = 'paid' then
    return jsonb_build_object('ok', true, 'already', true, 'kind', pay.kind);
  end if;

  if coalesce(p_paid_halalas, 0) < pay.amount_halalas then
    update qbank.payments
       set status = 'failed', fail_reason = 'المبلغ المدفوع أقل من المطلوب'
     where id = pay.id;
    return jsonb_build_object('ok', false, 'reason','amount_mismatch');
  end if;

  select * into cfg from qbank.settings limit 1;

  update qbank.payments
     set status = 'paid', provider = coalesce(nullif(p_provider,''),'tap'),
         provider_ref = p_provider_ref, paid_at = now()
   where id = pay.id;

  if pay.kind = 'coins' then
    update qbank.profiles set coins_balance = coins_balance + pay.coins
     where id = pay.user_id returning coins_balance into bal;
    insert into qbank.coin_transactions (user_id, amount, reason, kind)
    values (pay.user_id, pay.coins, 'شراء رصيد', 'purchase');
    return jsonb_build_object('ok', true, 'kind','coins', 'coins', pay.coins, 'balance', bal);
  end if;

  -- مادة: صلاحية تنتهي بنهاية المدة المعلنة، ثم مكافأة صاحب رابط الإحالة
  insert into qbank.entitlements (user_id, subject_id, kind, source, expires_at)
  values (pay.user_id, pay.subject_id, 'subject', 'web',
          now() + (coalesce(cfg.entitlement_days, 180) || ' days')::interval);

  if pay.ref_user is not null then
    begin
      perform qbank.award_referral_coins(pay.subject_id, pay.user_id, pay.ref_user);
    exception when others then
      -- ★ فشل المكافأة لا يُبطل شراءً دُفع ثمنه. الطالب دفع ومادته له،
      --   ومشكلة الإحالة تُعالَج لاحقًا ولا تُحوَّل إلى فشل دفعة.
      null;
    end;
  end if;

  return jsonb_build_object('ok', true, 'kind','subject', 'subject_id', pay.subject_id);
end $$;
revoke all on function qbank.settle_payment(uuid, text, int, text) from public;
grant execute on function qbank.settle_payment(uuid, text, int, text) to service_role;

-- ═══ ٦ · ما يحتاجه المتصفح ═══
create or replace function qbank.my_payments(p_limit int default 20)
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id, 'kind', p.kind, 'coins', p.coins,
             'amount_halalas', p.amount_halalas, 'currency', p.currency,
             'status', p.status, 'created_at', p.created_at, 'paid_at', p.paid_at,
             'subject', s.name) order by p.created_at desc)
      from (select * from qbank.payments
             where user_id = auth.uid()
             order by created_at desc
             limit least(greatest(coalesce(p_limit,20),1), 100)) p
      left join qbank.subjects s on s.id = p.subject_id), '[]'::jsonb)
$$;
revoke all on function qbank.my_payments(int) from public;
grant execute on function qbank.my_payments(int) to authenticated;

/* حالة دفعة بعينها — تسألها صفحة العودة حتى تتحول من pending إلى paid */
create or replace function qbank.payment_status(p_payment uuid)
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select coalesce((
    select jsonb_build_object('ok', true, 'status', p.status, 'kind', p.kind,
                              'coins', p.coins, 'subject_id', p.subject_id,
                              'reason', p.fail_reason)
      from qbank.payments p
     where p.id = p_payment and p.user_id = auth.uid()),
    jsonb_build_object('ok', false, 'reason','not_found'))
$$;
revoke all on function qbank.payment_status(uuid) from public;
grant execute on function qbank.payment_status(uuid) to authenticated;

/* دخل المنصة للمشرف */
create or replace function qbank.admin_revenue(p_days int default 30)
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select case when not qbank.is_admin() then jsonb_build_object('ok', false) else
    jsonb_build_object(
      'ok', true,
      'paid_n',    (select count(*) from qbank.payments p where p.status='paid'
                     and p.paid_at >= now() - (least(greatest(coalesce(p_days,30),1),365) || ' days')::interval),
      'halalas',   (select coalesce(sum(p.amount_halalas),0) from qbank.payments p where p.status='paid'
                     and p.paid_at >= now() - (least(greatest(coalesce(p_days,30),1),365) || ' days')::interval),
      'pending_n', (select count(*) from qbank.payments p where p.status='pending'),
      'failed_n',  (select count(*) from qbank.payments p where p.status='failed'))
  end
$$;
revoke all on function qbank.admin_revenue(int) from public;
grant execute on function qbank.admin_revenue(int) to authenticated;

-- ═══ ٧ · الحماية ═══
alter table qbank.payments enable row level security;

drop policy if exists payments_select on qbank.payments;
create policy payments_select on qbank.payments for select
  using (user_id = auth.uid() or qbank.is_admin());

/*
  ★ لا سياسة insert ولا update ولا delete للطالب — بأي حال.
  الإنشاء عبر create_payment (التي تحسب السعر)، والتسوية عبر settle_payment
  (المحصورة بمفتاح الخدمة). صفٌّ يستطيع الطالب كتابته هو رصيد مجاني.
*/
notify pgrst, 'reload schema';
