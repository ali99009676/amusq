-- ═══════════════════════════════════════════════════════════════════════════
--  طلب الشراء داخل المنصة + صندوق الوارد
--
--  ═══ ما الذي يُحذف ═══
--  كانت البيعة الواحدة خمس خطوات: يحوّل الطالب ← يراسل المشرف ← يولّد المشرف
--  رمزًا ← يرسله ← يُدخله الطالب. ورمزٌ في محادثة واتساب يضيع، ويُرسل
--  للشخص الخطأ، ويُكتب بحرفٍ ناقص. وكلُّ ذلك لأن المنصة لم تكن تعرف أن
--  الطالب دفع.
--
--  الآن: زرّ «حوّلتُ» يُنشئ طلبَ شراءٍ في القاعدة قبل أن يفتح واتساب.
--  فيرى المشرف الطلب في لوحته — باسم الطالب ومادته ومبلغه — ويضغط
--  «افتح له» فيُمنح الاستحقاق مباشرة. خطوتان بدل خمس، ولا رمز.
--  والأكواد تبقى لما خُلقت له: البيع بالجملة لدفعةٍ كاملة، أو بلا إنترنت.
--
--  ═══ ولماذا صندوق وارد ═══
--  أربعة طوابير تنتظر قرار المشرف: طلبات شراء، توثيقات جوال، تحويلات
--  أرباح، مسوّدات. وكانت موزّعةً على تبويبات لا يعرف ما فيها حتى يفتحها.
--  ودالةٌ واحدة تُعيد الأعداد كلها تجعل أول ما يراه: «ماذا ينتظرني».
--
--  آمن التكرار بالكامل.
-- ═══════════════════════════════════════════════════════════════════════════
set search_path = qbank, public;

-- ═══ ١ · المدة المعلنة ═══
/*
  ★ الانتظار المعلوم يُحتمل والمجهول يُشتكى منه.
  الطالب الذي دفع ونام ينتظر لا يعرف إن كان المشرف نائمًا أو رافضًا.
  سطرٌ واحد يكتبه المشرف بنفسه — لأنه وحده يعرف متى يفتح لوحته.
*/
alter table qbank.settings
  add column if not exists review_eta text not null default 'عادةً خلال ٣٠ دقيقة، وفي كل الأحوال قبل صباح الغد';

-- ═══ ٢ · الطلبات ═══
create table if not exists qbank.purchase_requests (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  subject_id     uuid not null references qbank.subjects(id) on delete cascade,
  amount_halalas int  not null,                       -- السعر لحظة الطلب
  status         text not null default 'pending',    -- pending | approved | rejected
  note           text not null default '',
  created_at     timestamptz not null default now(),
  settled_at     timestamptz,
  settled_by     uuid references auth.users(id) on delete set null
);
create index if not exists purchase_requests_status_idx on qbank.purchase_requests (status, created_at);
create index if not exists purchase_requests_user_idx   on qbank.purchase_requests (user_id, created_at desc);
/* طلبٌ معلّق واحد للمادة الواحدة: الطالب يضغط الزرّ مرتين من القلق،
   وطلبان لمادةٍ واحدة يجعلان المشرف يفتحها له مرتين. */
create unique index if not exists purchase_requests_one_pending
  on qbank.purchase_requests (user_id, subject_id) where status = 'pending';

alter table qbank.purchase_requests enable row level security;
drop policy if exists purchase_requests_none on qbank.purchase_requests;

-- ═══ ٣ · الطالب يطلب ═══
create or replace function qbank.request_purchase(p_subject uuid)
returns jsonb language plpgsql security definer set search_path = qbank, public as $$
declare
  uid uuid := auth.uid();
  sub qbank.subjects%rowtype;
  amt int;
  pid uuid;
begin
  if uid is null then return jsonb_build_object('ok', false, 'reason','auth'); end if;
  select * into sub from qbank.subjects
   where id = p_subject and published and status = 'published';
  if sub.id is null then return jsonb_build_object('ok', false, 'reason','not_found'); end if;
  if sub.free then return jsonb_build_object('ok', false, 'reason','already_free'); end if;
  if exists (select 1 from qbank.entitlements e
              where e.user_id = uid and e.subject_id = sub.id and e.expires_at > now()) then
    return jsonb_build_object('ok', false, 'reason','already_owned');
  end if;
  amt := greatest(coalesce(sub.price, 0), 0) * 100;
  if amt <= 0 then return jsonb_build_object('ok', false, 'reason','no_price'); end if;

  /* طلبٌ معلّق قائم: نُعيده هو، لا خطأً. الضغطة الثانية من القلق لا من
     نيّة الشراء مرتين. */
  select id into pid from qbank.purchase_requests
   where user_id = uid and subject_id = sub.id and status = 'pending';
  if pid is not null then
    return jsonb_build_object('ok', true, 'id', pid, 'existing', true);
  end if;

  insert into qbank.purchase_requests (user_id, subject_id, amount_halalas)
  values (uid, sub.id, amt) returning purchase_requests.id into pid;
  return jsonb_build_object('ok', true, 'id', pid, 'amount_halalas', amt);
end $$;
revoke all on function qbank.request_purchase(uuid) from public;
grant execute on function qbank.request_purchase(uuid) to authenticated;

-- ═══ ٤ · طلباتي — لتعرف بطاقة القفل أنها تنتظر ═══
create or replace function qbank.my_purchase_requests()
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', r.id, 'subject_id', r.subject_id, 'status', r.status,
             'amount_halalas', r.amount_halalas, 'note', r.note,
             'at', r.created_at, 'settled_at', r.settled_at) order by r.created_at desc)
      from (select * from qbank.purchase_requests
             where user_id = auth.uid()
             order by created_at desc limit 30) r), '[]'::jsonb)
$$;
revoke all on function qbank.my_purchase_requests() from public;
grant execute on function qbank.my_purchase_requests() to authenticated;

-- ═══ ٥ · المشرف يرى ويفتح ═══
/*
  ★ مع كل طلب: هل رقم الطالب موثَّق؟
  المشرف يطابق إيصالًا وصله على واتساب برقمٍ ما مع طلبٍ في اللوحة. ورقمٌ
  موثَّق يجعل المطابقة يقينًا: الرسالة من هذا الرقم = هذا الحساب. وغير
  الموثَّق يُطابَق بالاسم والبريد — وهو أضعف، فيُقال ذلك بعلامة.
*/
create or replace function qbank.admin_purchase_requests(p_status text default 'pending')
returns jsonb language plpgsql security definer set search_path = qbank, public as $$
declare out jsonb;
begin
  if not qbank.is_admin() then return jsonb_build_object('error','admin only'); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'status', r.status, 'amount_halalas', r.amount_halalas,
           'note', r.note, 'at', r.created_at, 'settled_at', r.settled_at,
           'subject', s.name, 'subject_id', r.subject_id,
           'user_id', r.user_id, 'name', nullif(btrim(p.name), ''), 'email', u.email,
           'phone', p.phone, 'phone_verified', coalesce(p.phone_verified, false)
         ) order by r.created_at), '[]'::jsonb)
    into out
    from (select * from qbank.purchase_requests
           where (nullif(p_status, '') is null or status = p_status)
           order by created_at limit 200) r
    join qbank.subjects s on s.id = r.subject_id
    join qbank.profiles p on p.id = r.user_id
    join auth.users     u on u.id = r.user_id;
  return out;
end $$;
revoke all on function qbank.admin_purchase_requests(text) from public;
grant execute on function qbank.admin_purchase_requests(text) to authenticated;

create or replace function qbank.admin_settle_purchase(
  p_id uuid, p_ok boolean, p_note text default ''
) returns jsonb language plpgsql security definer set search_path = qbank, public as $$
declare
  r   qbank.purchase_requests%rowtype;
  cfg qbank.settings%rowtype;
begin
  if not qbank.is_admin() then return jsonb_build_object('ok', false, 'reason','forbidden'); end if;
  select * into r from qbank.purchase_requests where id = p_id for update;
  if r.id is null then return jsonb_build_object('ok', false, 'reason','not_found'); end if;
  if r.status <> 'pending' then
    return jsonb_build_object('ok', false, 'reason','already_settled', 'status', r.status);
  end if;

  if not coalesce(p_ok, false) then
    update qbank.purchase_requests
       set status = 'rejected', settled_at = now(), settled_by = auth.uid(),
           note = left(coalesce(p_note, ''), 200)
     where id = r.id;
    perform qbank.log_admin('purchase_reject', r.user_id,
      jsonb_build_object('request', r.id, 'subject', r.subject_id));
    return jsonb_build_object('ok', true, 'status','rejected');
  end if;

  select * into cfg from qbank.settings limit 1;

  /*
    ★ الاستحقاق بمصدر 'manual' — وقادح العمولة يقرؤه.
    هذه بيعةٌ حقيقية دفع ثمنها الطالب، فللرافع نصيبه منها كأي بيعة.
    والمصدر مميَّز عن 'web' و'code' كي يُعرف في التقارير كم بيع عبر كل باب.
  */
  insert into qbank.entitlements (user_id, subject_id, kind, source, expires_at)
  values (r.user_id, r.subject_id, 'subject', 'manual',
          now() + (coalesce(cfg.entitlement_days, 180) || ' days')::interval);

  update qbank.purchase_requests
     set status = 'approved', settled_at = now(), settled_by = auth.uid(),
         note = left(coalesce(p_note, ''), 200)
   where id = r.id;

  perform qbank.log_admin('purchase_approve', r.user_id,
    jsonb_build_object('request', r.id, 'subject', r.subject_id, 'amount', r.amount_halalas));
  return jsonb_build_object('ok', true, 'status','approved');
end $$;
revoke all on function qbank.admin_settle_purchase(uuid, boolean, text) from public;
grant execute on function qbank.admin_settle_purchase(uuid, boolean, text) to authenticated;

-- ═══ ٦ · قادح العمولة يشمل الفتح اليدوي ═══
/*
  نُعيد تعريف الدالة نفسها التي في PAYOUT.sql بسطرٍ واحد مختلف: المصادر
  ('web','code','manual'). وPAYOUT.sql حُدِّث بالمثل كي لا يتراجع أيُّهما
  نُفِّذ آخرًا.
*/
create or replace function qbank.credit_uploader()
returns trigger language plpgsql security definer set search_path = qbank, public as $$
declare
  sub   qbank.subjects%rowtype;
  cfg   qbank.settings%rowtype;
  gross int;
  pct   int;
  share int;
begin
  if new.kind <> 'subject' or new.source not in ('web', 'code', 'manual') then return new; end if;
  if new.subject_id is null then return new; end if;
  select * into sub from qbank.subjects where id = new.subject_id;
  if sub.id is null or sub.created_by is null then return new; end if;
  if sub.created_by = new.user_id then return new; end if;
  gross := greatest(coalesce(sub.price, 0), 0) * 100;
  if gross <= 0 then return new; end if;
  select * into cfg from qbank.settings limit 1;
  pct := least(greatest(coalesce(cfg.uploader_share_pct, 20), 0), 100);
  share := (gross * pct) / 100;
  if share <= 0 then return new; end if;
  insert into qbank.earnings (user_id, subject_id, buyer_id, entitlement_id,
                              source, gross_halalas, share_pct, share_halalas)
  values (sub.created_by, sub.id, new.user_id, new.id, new.source, gross, pct, share)
  on conflict (entitlement_id) do nothing;
  if found then
    update qbank.profiles
       set earn_balance = earn_balance + share, earn_total = earn_total + share
     where id = sub.created_by;
  end if;
  return new;
end $$;

-- ═══ ٧ · صندوق الوارد ═══
create or replace function qbank.admin_inbox()
returns jsonb language plpgsql security definer set search_path = qbank, public as $$
declare out jsonb;
begin
  if not qbank.is_admin() then return jsonb_build_object('error','admin only'); end if;
  select jsonb_build_object(
    'purchases', (select count(*) from qbank.purchase_requests where status = 'pending'),
    'phones',    (select count(*) from qbank.phone_claims
                   where status = 'pending' and expires_at > now()),
    'payouts',   (select count(*) from qbank.payouts where status = 'requested'),
    'drafts',    (select count(*) from qbank.drafts where status = 'reviewing'),
    'reports',   (select count(*) from qbank.reports where status = 'open'),
    /* أقدم طلب شراء معلّق: «منذ كم ينتظر أحدهم» أهمّ من «كم ينتظرون» */
    'oldest_purchase', (select min(created_at) from qbank.purchase_requests where status = 'pending'),
    'review_eta', (select review_eta from qbank.settings limit 1)
  ) into out;
  return out;
end $$;
revoke all on function qbank.admin_inbox() from public;
grant execute on function qbank.admin_inbox() to authenticated;

-- ═══ ٨ · المدة المعلنة تصل الطالب ═══
create or replace function qbank.content_pack()
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select jsonb_build_object(
    'subjects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'color', s.color, 'icon', s.icon,
        'descr', s.descr, 'topics', s.topics, 'exam_date', s.exam_date,
        'free', s.free, 'ord', s.ord, 'q_count', s.q_count,
        'created_by', s.created_by, 'slug', s.slug,
        'price', s.price, 'status', s.status,
        'name_en', s.name_en,
        'verified', s.verified, 'rating_avg', s.rating_avg, 'rating_n', s.rating_n
      ) order by s.ord, s.created_at)
      from qbank.subjects s where s.published = true
    ), '[]'::jsonb),
    'settings', (select jsonb_build_object(
      'welcome_text', welcome_text, 'board_enabled', board_enabled,
      'whatsapp', whatsapp, 'pay_note', pay_note, 'review_eta', review_eta
    ) from qbank.settings where id = 1),
    'fetched_at', now()
  )
$$;

notify pgrst, 'reload schema';

-- ═══ تحقّق ═══
select (select count(*) from qbank.purchase_requests where status = 'pending') as طلبات_معلّقة,
       (select review_eta from qbank.settings limit 1) as المدة_المعلنة;
