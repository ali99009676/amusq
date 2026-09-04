-- ═══════════════════════════════════════════════════════════════════════════
--  عمولة الرافع — من كتب البنك يأخذ نصيبه من كل عملية بيع
--
--  هذه أعمق تغييرٍ في نموذج المشروع لا ميزةٌ تُضاف: المحتوى يصير يأتي إليك
--  بدل أن تصنعه، والرافع يسوّق مادته في دفعته بنفسه لأن له فيها نصيبًا.
--
--  ═══ الأرقام، وكيف تُعرض ═══
--  السعر ١٠٠٪ · التكاليف ٦٠٪ · صافي الربح ٤٠٪ · للرافع ٢٠٪ من السعر.
--  و٢٠ من ٤٠ نصفُها، فنصيب الرافع هو ٥٠٪ من صافي الربح.
--
--  ★ ونعرض الرقمين معًا لا أحدهما.
--  «٥٠٪ من صافي الربح» صحيحٌ ويُغري، و«٢٠٪ من سعر البيع» صحيحٌ ويُوضّح،
--  وعرضُ الأول وحده يجعل الرافع يحسب نصفَ ما دفعه الطالب فيطالب به بعد
--  شهر. والخلاف حينها لا يُحسم لأن كلينا يقرأ الجملة نفسها بمعنى مختلف.
--  فيُكتب النصيب ريالًا صريحًا لكل عملية إلى جانب النسبتين — والرقم
--  الصريح لا يُختلف عليه.
--
--  ═══ لماذا قادحٌ لا نداءٌ داخل دوال الدفع ═══
--  المال يصل من طريقين: بوابة Tap (settle_payment) ورمز تفعيل
--  (redeem_code)، وسيأتي ثالث. وحقنُ نداءٍ في كل دالةٍ منها يعني أن كل
--  إعادة تنفيذٍ لملفٍ قديم تمحو النداء بصمت — فيبيع الرافع ولا يُحتسب له
--  شيء ولا يعلم أحد. والمشترك بين الطرق كلها صفٌّ واحد في entitlements،
--  فالقادح عليه يمسك المال من عنقه لا من أطرافه.
--
--  آمن التكرار بالكامل.
-- ═══════════════════════════════════════════════════════════════════════════
set search_path = qbank, public;

-- ═══ ١ · النِّسب في الإعدادات ═══
/*
  ثلاثة أرقام يضبطها المشرف، ولكلٍّ معناه:
  · uploader_share_pct — نصيب الرافع من سعر البيع. هذا هو الرقم الذي يُحسب.
  · net_margin_pct     — صافي ربح المنصة من السعر. للعرض وحده لا للحساب،
                         وبه تُشتقّ «نصيبك ٥٠٪ من صافي الربح».
  · payout_min         — أقل مبلغ يُطلب تحويله. تحويلُ ثلاثة ريالات تكلفته
                         أكبر منه، والحدّ يحمي الطرفين لا المنصة وحدها.
*/
alter table qbank.settings
  add column if not exists uploader_share_pct int  not null default 20,
  add column if not exists net_margin_pct     int  not null default 40,
  add column if not exists payout_min_halalas int  not null default 10000,
  add column if not exists payouts_open       boolean not null default true;

-- ═══ ٢ · رصيد الأرباح على الملف ═══
alter table qbank.profiles
  add column if not exists earn_balance int not null default 0,   -- بالهللات
  add column if not exists earn_total   int not null default 0;

-- ═══ ٣ · سجلّ الأرباح ═══
/*
  صفٌّ لكل عملية بيع تخصّ الرافع. نحفظ السعر والنسبة المستعملة وقتها لا
  نستنبطهما لاحقًا: تغييرُ النسبة بعد شهر يجب ألّا يُعيد كتابة ما مضى،
  وإلا صار كشف الحساب يتبدّل تحت يد صاحبه.

  entitlement_id فريد: هو مصدر الحقيقة الوحيد لمنع الاحتساب مرتين مهما
  تكرر القادح أو أُعيدت التسوية.
*/
create table if not exists qbank.earnings (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,  -- الرافع
  subject_id     uuid references qbank.subjects(id) on delete set null,
  buyer_id       uuid references auth.users(id) on delete set null,
  entitlement_id uuid unique,
  source         text not null default 'web',      -- web | code
  gross_halalas  int  not null,                    -- سعر المادة وقتها
  share_pct      int  not null,                    -- النسبة وقتها
  share_halalas  int  not null,                    -- نصيب الرافع
  created_at     timestamptz not null default now()
);
create index if not exists earnings_user_idx    on qbank.earnings (user_id, created_at desc);
create index if not exists earnings_subject_idx on qbank.earnings (subject_id);

-- ═══ ٤ · طلبات التحويل ═══
/*
  ★ الرصيد يُخصم لحظةَ الطلب لا لحظةَ الدفع.
  لو بقي الرصيد قائمًا حتى يُحوّل المشرف يدويًا، لاستطاع الرافع أن يطلب
  المبلغ نفسه ثلاث مرات في ثلاث دقائق. والرفض يُعيد المبلغ كاملًا — فلا
  يضيع على صاحبه شيء.
*/
create table if not exists qbank.payouts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  amount_halalas int  not null,
  status         text not null default 'requested',  -- requested | paid | rejected
  method         text not null default '',           -- bank | stcpay
  handle         text not null default '',           -- الآيبان أو الرقم
  note           text not null default '',
  created_at     timestamptz not null default now(),
  settled_at     timestamptz
);
create index if not exists payouts_user_idx   on qbank.payouts (user_id, created_at desc);
create index if not exists payouts_status_idx on qbank.payouts (status, created_at desc);

alter table qbank.earnings enable row level security;
alter table qbank.payouts  enable row level security;
/*
  ★ بلا سياسة قراءة لأحد، ولا حتى لصاحب الصفّ.
  صفّ التحويل يحمل آيبان الرافع، وسياسةُ «صاحبه يقرؤه» كانت ستفتح الجدول
  لـPostgREST فيصير الترشيح على أمان العميل — وخطأٌ واحد في مرشّح يكشف
  آيبانات الناس. الدوال أدناه هي الباب، وهي تُرجع ما يلزم فقط.
*/
drop policy if exists earnings_none on qbank.earnings;
drop policy if exists payouts_none  on qbank.payouts;

-- ═══ ٥ · القيد: من يستحق وكم ═══
create or replace function qbank.credit_uploader()
returns trigger language plpgsql security definer set search_path = qbank, public as $$
declare
  sub   qbank.subjects%rowtype;
  cfg   qbank.settings%rowtype;
  gross int;
  pct   int;
  share int;
begin
  -- المنح الإدارية وفتحُ الرافع لمادته ليست بيعًا
  -- 'manual' = فتحٌ من لوحة المشرف بعد طلب شراء (ORDERS.sql) — بيعةٌ حقيقية أيضًا
  if new.kind <> 'subject' or new.source not in ('web', 'code', 'manual') then return new; end if;
  if new.subject_id is null then return new; end if;

  select * into sub from qbank.subjects where id = new.subject_id;
  if sub.id is null or sub.created_by is null then return new; end if;

  -- ★ لا يربح أحدٌ من نفسه: لو فعّل الرافع رمزًا على مادته لدار المال دورة
  --   كاملة وعاد إليه وقد صار «ربحًا» يُطالب المنصة بتحويله.
  if sub.created_by = new.user_id then return new; end if;

  gross := greatest(coalesce(sub.price, 0), 0) * 100;
  if gross <= 0 then return new; end if;         -- مادة بلا ثمن لا عمولة لها

  select * into cfg from qbank.settings limit 1;
  pct := least(greatest(coalesce(cfg.uploader_share_pct, 20), 0), 100);
  share := (gross * pct) / 100;
  if share <= 0 then return new; end if;

  /*
    on conflict do nothing: القادح قد يعمل مرتين على الصفّ نفسه إن أُعيدت
    التسوية، والفهرس الفريد يمنع القيد الثاني بلا أن يُسقط العملية كلها.
    وإسقاطُها هنا يعني أن الطالب يدفع ولا تُفتح له المادة — عطلٌ أكبر مما
    يمنع.
  */
  insert into qbank.earnings (user_id, subject_id, buyer_id, entitlement_id,
                              source, gross_halalas, share_pct, share_halalas)
  values (sub.created_by, sub.id, new.user_id, new.id,
          new.source, gross, pct, share)
  on conflict (entitlement_id) do nothing;

  if found then
    update qbank.profiles
       set earn_balance = earn_balance + share,
           earn_total   = earn_total   + share
     where id = sub.created_by;
  end if;

  return new;
end $$;

drop trigger if exists entitlements_credit_trg on qbank.entitlements;
create trigger entitlements_credit_trg
  after insert on qbank.entitlements
  for each row execute function qbank.credit_uploader();

-- ═══ ٦ · ما يراه الرافع ═══
/*
  ★ الرقمان معًا في مصدرٍ واحد.
  لو حسبت الواجهة «٥٠٪» بنفسها لاختلفت عن القاعدة يوم يُغيَّر الهامش،
  فيقرأ رافعان رقمين مختلفين لنفس الاتفاق. القاعدة تقول النسبتين والمثال
  الريالي، والواجهة تعرض ما قيل لها.
*/
create or replace function qbank.my_earnings(p_limit int default 20)
returns jsonb language plpgsql security definer set search_path = qbank, public as $$
declare
  uid uuid := auth.uid();
  cfg qbank.settings%rowtype;
  pr  qbank.profiles%rowtype;
  net int;
begin
  if uid is null then return jsonb_build_object('error','auth'); end if;
  select * into cfg from qbank.settings limit 1;
  select * into pr  from qbank.profiles where id = uid;

  net := greatest(coalesce(cfg.net_margin_pct, 40), 1);

  return jsonb_build_object(
    'balance',    coalesce(pr.earn_balance, 0),
    'total',      coalesce(pr.earn_total, 0),
    'share_pct',  coalesce(cfg.uploader_share_pct, 20),   -- من سعر البيع
    'net_pct',    net,                                    -- صافي ربح المنصة
    -- نصيبه من صافي الربح: ٢٠ من ٤٠ = ٥٠٪
    'of_net_pct', round(coalesce(cfg.uploader_share_pct, 20)::numeric * 100 / net),
    'min',        coalesce(cfg.payout_min_halalas, 10000),
    'open',       coalesce(cfg.payouts_open, true),
    'pending',    coalesce((select sum(amount_halalas) from qbank.payouts
                             where user_id = uid and status = 'requested'), 0),
    'by_subject', coalesce((
      select jsonb_agg(x order by x->>'name')
        from (select jsonb_build_object(
                       'subject_id', e.subject_id,
                       'name', coalesce(s.name, 'مادة محذوفة'),
                       'sales', count(*),
                       'halalas', sum(e.share_halalas)) as x
                from qbank.earnings e
                left join qbank.subjects s on s.id = e.subject_id
               where e.user_id = uid
               group by e.subject_id, s.name) t), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', coalesce(s.name, 'مادة محذوفة'),
               'halalas', e.share_halalas,
               'source', e.source,
               'at', e.created_at) order by e.created_at desc)
        from (select * from qbank.earnings where user_id = uid
               order by created_at desc
               limit least(greatest(coalesce(p_limit, 20), 1), 100)) e
        left join qbank.subjects s on s.id = e.subject_id), '[]'::jsonb),
    'payouts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'amount', p.amount_halalas, 'status', p.status,
               'note', p.note, 'at', p.created_at) order by p.created_at desc)
        from (select * from qbank.payouts where user_id = uid
               order by created_at desc limit 10) p), '[]'::jsonb)
  );
end $$;
revoke all on function qbank.my_earnings(int) from public;
grant execute on function qbank.my_earnings(int) to authenticated;

-- ═══ ٧ · طلب التحويل ═══
create or replace function qbank.request_payout(
  p_amount int, p_method text default 'bank', p_handle text default ''
) returns jsonb language plpgsql security definer set search_path = qbank, public as $$
declare
  uid uuid := auth.uid();
  cfg qbank.settings%rowtype;
  bal int;
  pid uuid;
begin
  if uid is null then return jsonb_build_object('ok', false, 'reason','auth'); end if;
  select * into cfg from qbank.settings limit 1;
  if not coalesce(cfg.payouts_open, true) then
    return jsonb_build_object('ok', false, 'reason','closed');
  end if;
  if btrim(coalesce(p_handle, '')) = '' then
    return jsonb_build_object('ok', false, 'reason','no_handle');
  end if;

  -- ★ القفل على صفّ الملف: طلبان في لحظة واحدة يقرآن الرصيد نفسه ويسحبانه مرتين
  select earn_balance into bal from qbank.profiles where id = uid for update;
  if coalesce(p_amount, 0) < coalesce(cfg.payout_min_halalas, 10000) then
    return jsonb_build_object('ok', false, 'reason','below_min',
                              'min', coalesce(cfg.payout_min_halalas, 10000));
  end if;
  if coalesce(p_amount, 0) > coalesce(bal, 0) then
    return jsonb_build_object('ok', false, 'reason','insufficient', 'balance', coalesce(bal, 0));
  end if;

  update qbank.profiles set earn_balance = earn_balance - p_amount where id = uid;

  insert into qbank.payouts (user_id, amount_halalas, method, handle)
  values (uid, p_amount,
          case when p_method = 'stcpay' then 'stcpay' else 'bank' end,
          left(btrim(p_handle), 60))
  returning payouts.id into pid;

  return jsonb_build_object('ok', true, 'payout_id', pid, 'balance', coalesce(bal, 0) - p_amount);
end $$;
revoke all on function qbank.request_payout(int, text, text) from public;
grant execute on function qbank.request_payout(int, text, text) to authenticated;

-- ═══ ٨ · المشرف: الطلبات وتسويتها ═══
create or replace function qbank.admin_payouts(p_status text default 'requested')
returns jsonb language plpgsql security definer set search_path = qbank, public as $$
declare out jsonb;
begin
  if not qbank.is_admin() then return jsonb_build_object('error','admin only'); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'amount', p.amount_halalas, 'status', p.status,
           'method', p.method, 'handle', p.handle, 'note', p.note,
           'at', p.created_at, 'settled_at', p.settled_at,
           'name', nullif(btrim(pr.name), ''), 'email', u.email
         ) order by p.created_at), '[]'::jsonb)
    into out
    from (select * from qbank.payouts
           where (nullif(p_status, '') is null or status = p_status)
           order by created_at
           limit 200) p
    join qbank.profiles pr on pr.id = p.user_id
    join auth.users     u  on u.id  = p.user_id;
  return out;
end $$;
revoke all on function qbank.admin_payouts(text) from public;
grant execute on function qbank.admin_payouts(text) to authenticated;

create or replace function qbank.admin_set_payout(
  p_id uuid, p_status text, p_note text default ''
) returns jsonb language plpgsql security definer set search_path = qbank, public as $$
declare p qbank.payouts%rowtype;
begin
  if not qbank.is_admin() then return jsonb_build_object('ok', false, 'reason','forbidden'); end if;
  select * into p from qbank.payouts where id = p_id for update;
  if p.id is null then return jsonb_build_object('ok', false, 'reason','not_found'); end if;
  if p.status <> 'requested' then
    return jsonb_build_object('ok', false, 'reason','already_settled', 'status', p.status);
  end if;

  if p_status = 'paid' then
    update qbank.payouts set status = 'paid', settled_at = now(),
           note = left(coalesce(p_note, ''), 200) where id = p.id;
  elsif p_status = 'rejected' then
    -- ★ الرفض يُعيد المال إلى رصيده كاملًا: خُصم عند الطلب لا عند الدفع
    update qbank.payouts set status = 'rejected', settled_at = now(),
           note = left(coalesce(p_note, ''), 200) where id = p.id;
    update qbank.profiles set earn_balance = earn_balance + p.amount_halalas
     where id = p.user_id;
  else
    return jsonb_build_object('ok', false, 'reason','bad_status');
  end if;

  perform qbank.log_admin('set_payout', p.user_id,
    jsonb_build_object('payout', p.id, 'status', p_status, 'amount', p.amount_halalas));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function qbank.admin_set_payout(uuid, text, text) from public;
grant execute on function qbank.admin_set_payout(uuid, text, text) to authenticated;

-- ═══ ٩ · موجز المال للمشرف ═══
create or replace function qbank.admin_earnings_summary()
returns jsonb language plpgsql security definer set search_path = qbank, public as $$
declare out jsonb;
begin
  if not qbank.is_admin() then return jsonb_build_object('error','admin only'); end if;
  select jsonb_build_object(
    'sales',        (select count(*) from qbank.earnings),
    'gross',        (select coalesce(sum(gross_halalas), 0) from qbank.earnings),
    'owed',         (select coalesce(sum(share_halalas), 0) from qbank.earnings),
    'balances',     (select coalesce(sum(earn_balance), 0) from qbank.profiles),
    'requested',    (select coalesce(sum(amount_halalas), 0) from qbank.payouts where status = 'requested'),
    'paid',         (select coalesce(sum(amount_halalas), 0) from qbank.payouts where status = 'paid'),
    'open_requests',(select count(*) from qbank.payouts where status = 'requested')
  ) into out;
  return out;
end $$;
revoke all on function qbank.admin_earnings_summary() from public;
grant execute on function qbank.admin_earnings_summary() to authenticated;

notify pgrst, 'reload schema';

-- ═══ تحقّق ═══
select (select uploader_share_pct from qbank.settings limit 1) as نسبة_الرافع,
       (select net_margin_pct     from qbank.settings limit 1) as صافي_الربح,
       (select count(*) from qbank.earnings)                   as قيود_أرباح,
       (select count(*) from qbank.payouts where status = 'requested') as طلبات_معلّقة;
