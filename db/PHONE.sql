-- ═══════════════════════════════════════════════════════════════════════════
--  توثيق الجوال بالواتساب — التحقق المعكوس
--
--  ═══ لماذا معكوس ═══
--  الطريقة المعتادة أن ترسل المنصة رمزًا إلى الطالب، وهي تشترط WhatsApp
--  Business API: حسابًا تجاريًا موثَّقًا، وقالبًا معتمدًا، ورقمًا يخرج من
--  تطبيق واتساب العادي فلا تستطيع أن تستقبل عليه إيصالًا بعد اليوم —
--  وفاتورةً على كل رسالة.
--
--  والعكس يعطي الدليل نفسه بلا شيء من ذلك: المنصة تُولّد رمزًا وتفتح
--  محادثة ليرسله الطالب بنفسه، فتصل الرسالة من رقمه هو. ووصولُ الرمز
--  الصحيح من رقمٍ بعينه إثباتُ ملكية لا يقلّ عن OTP — بل هو OTP بالاتجاه
--  المعاكس.
--
--  ═══ وحدُّه معروف ═══
--  التأكيد بيد المشرف: يرى الرسالة في واتساب، ويطابق الرمز والرقم، ويضغط
--  «وثّق». يكفي لعشرات الطلبات في اليوم ولا يكفي لمئات — وحين يصير عبئًا
--  يُستبدَل هذا الملف بمزوّد، وتبقى الأعمدة والشاشات كما هي.
--
--  ═══ ما يحرسه هذا الملف ═══
--  ١ · رقمٌ واحد لحسابٍ واحد. توثيق الجوال بلا هذا القيد زينةٌ لا أمان:
--      لو صحّ لعشرة حسابات أن تتوثّق برقمٍ واحد لما أثبت التوثيق شيئًا.
--  ٢ · الرمز يُولَّد في القاعدة لا في المتصفح، وينتهي بعد ساعة.
--  ٣ · المشرف لا يوثّق إلا طلبًا قائمًا، ولا يوثّق مرتين.
--
--  آمن التكرار بالكامل.
-- ═══════════════════════════════════════════════════════════════════════════
set search_path = qbank, public;

-- ═══ ١ · أعمدة التوثيق ═══
-- عمود phone موجود منذ PROFILE-ADMIN.sql؛ نُضيف حالته لا نُعيد إنشاءه.
alter table qbank.profiles
  add column if not exists phone_verified    boolean not null default false,
  add column if not exists phone_verified_at timestamptz;

-- ═══ ٢ · تطبيع الرقم ═══
/*
  ما يكتبه الطالب: «0501234567» أو «+966 50 123 4567» أو «966501234567»
  أو «٥٠١٢٣٤٥٦٧» بأرقام عربية. وكلّها رقمٌ واحد — ولو خزّنّاها كما تُكتب
  لصار الرقم نفسه أربعة صفوف مختلفة، ولانهار قيد «رقمٌ واحد لحساب واحد»
  الذي بُني هذا الملف لأجله.

  والأرقام العربية تُحوَّل أولًا: طالبٌ لوحةُ مفاتيحه عربية يكتب ٠٥٠…
  فيصل نصٌّ لا رقم فيه بحسب regexp اللاتيني، فيُرفض رقمٌ صحيح.
*/
create or replace function qbank.norm_phone(p text)
returns text language plpgsql immutable as $$
declare
  s text := coalesce(p, '');
  d text;
begin
  -- أرقام عربية/فارسية ← لاتينية
  s := translate(s, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789');
  d := regexp_replace(s, '[^0-9]', '', 'g');

  if d = '' then return ''; end if;
  if left(d, 2) = '00' then d := substr(d, 3); end if;        -- 00966… → 966…
  if length(d) = 10 and left(d, 2) = '05' then                 -- 05xxxxxxxx
    d := '966' || substr(d, 2);
  elsif length(d) = 9 and left(d, 1) = '5' then                -- 5xxxxxxxx
    d := '966' || d;
  end if;
  -- رقمٌ قصير جدًا أو طويل جدًا ليس رقمًا
  if length(d) < 10 or length(d) > 15 then return ''; end if;
  return '+' || d;
end $$;

-- ═══ ٣ · رمز التحقق ═══
/*
  أبجدية بلا 0 O I 1 L: الرمز يُقرأ في رسالة واتساب ثم يُقارن بما في
  اللوحة، والتباسُ حرفٍ يجعل المشرف يرفض طلبًا صحيحًا.
  ★ ولا gen_random_bytes هنا — هي من pgcrypto، وSupabase تضعها في مخطط
  extensions خارج search_path المثبّت، فتسقط الدالة كلها. (وقع هذا فعلًا
  في ملف الأكواد.) والبديل من نواة بوستجرس نفسها.
*/
create or replace function qbank.gen_phone_code(n int default 6)
returns text language plpgsql volatile set search_path = qbank, public as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea;
  out text := '';
  need int := greatest(coalesce(n, 6), 4);
  i int;
begin
  for i in 0..need - 1 loop
    if i % 16 = 0 then
      bytes := decode(md5(gen_random_uuid()::text || clock_timestamp()::text), 'hex');
    end if;
    out := out || substr(alphabet, 1 + (get_byte(bytes, i % 16) % length(alphabet)), 1);
  end loop;
  return out;
end $$;

-- ═══ ٤ · جدول الطلبات ═══
create table if not exists qbank.phone_claims (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  phone       text not null,
  code        text not null,
  status      text not null default 'pending',   -- pending | verified | rejected
  note        text not null default '',
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '1 hour',
  settled_at  timestamptz,
  settled_by  uuid references auth.users(id) on delete set null
);
create index if not exists phone_claims_status_idx on qbank.phone_claims (status, created_at desc);
create index if not exists phone_claims_user_idx   on qbank.phone_claims (user_id, created_at desc);
/* طلبٌ معلّق واحد لكل حساب: عشرة طلبات من طالبٍ واحد تُغرق لوحة المشرف
   ولا تزيده علمًا. */
create unique index if not exists phone_claims_one_pending
  on qbank.phone_claims (user_id) where status = 'pending';

/*
  ★ القيد الذي يجعل التوثيق توثيقًا: رقمٌ موثَّق لا يتكرّر.
  بدونه يتوثّق عشرة حسابات برقمٍ واحد، فلا يعود التوثيق يُثبت شيئًا —
  ويصير حقلًا مزخرفًا في ملفٍ شخصي.
*/
create unique index if not exists profiles_phone_unique
  on qbank.profiles (phone) where phone_verified and btrim(phone) <> '';

alter table qbank.phone_claims enable row level security;
-- بلا سياسة قراءة: الطلبات تحمل أرقام الناس، والدوال أدناه هي الباب
drop policy if exists phone_claims_none on qbank.phone_claims;

-- ═══ ٥ · الطالب يطلب ═══
create or replace function qbank.request_phone_claim(p_phone text)
returns jsonb language plpgsql security definer set search_path = qbank, public as $$
declare
  uid uuid := auth.uid();
  ph  text;
  c   text;
  pid uuid;
begin
  if uid is null then return jsonb_build_object('ok', false, 'reason','auth'); end if;

  ph := qbank.norm_phone(p_phone);
  if ph = '' then return jsonb_build_object('ok', false, 'reason','bad_phone'); end if;

  -- رقمٌ وثّقه غيره: نقولها قبل أن ينتظر المشرف ويُرفض الطلب بعد يوم
  if exists (select 1 from qbank.profiles
              where phone_verified and qbank.norm_phone(phone) = ph and id <> uid) then
    return jsonb_build_object('ok', false, 'reason','taken');
  end if;

  if exists (select 1 from qbank.profiles
              where id = uid and phone_verified and qbank.norm_phone(phone) = ph) then
    return jsonb_build_object('ok', false, 'reason','already');
  end if;

  /* طلبٌ سابق معلّق: نُلغيه ونفتح غيره بالرقم الجديد. الطالب الذي أخطأ
     في رقمه لا يجوز أن يُحبس ساعةً حتى ينتهي طلبه الخاطئ. */
  update qbank.phone_claims
     set status = 'rejected', note = 'ألغاه صاحبه بطلبٍ جديد', settled_at = now()
   where user_id = uid and status = 'pending';

  insert into qbank.phone_claims (user_id, phone, code, expires_at)
  values (uid, ph, qbank.gen_phone_code(6), now() + interval '1 hour')
  returning phone_claims.id, phone_claims.code into pid, c;

  -- والرقم يُكتب في الملف الآن غير موثَّق: هو ما كتبه صاحبه على كل حال
  update qbank.profiles set phone = ph where id = uid and coalesce(btrim(phone),'') = '';

  return jsonb_build_object('ok', true, 'id', pid, 'code', c, 'phone', ph,
                            'expires_at', now() + interval '1 hour');
end $$;
revoke all on function qbank.request_phone_claim(text) from public;
grant execute on function qbank.request_phone_claim(text) to authenticated;

-- ═══ ٦ · حالتي ═══
create or replace function qbank.my_phone()
returns jsonb language plpgsql security definer set search_path = qbank, public as $$
declare
  uid uuid := auth.uid();
  pr  qbank.profiles%rowtype;
  cl  qbank.phone_claims%rowtype;
begin
  if uid is null then return jsonb_build_object('error','auth'); end if;
  select * into pr from qbank.profiles where id = uid;
  select * into cl from qbank.phone_claims
   where user_id = uid and status = 'pending' and expires_at > now()
   order by created_at desc limit 1;

  return jsonb_build_object(
    'phone', coalesce(pr.phone, ''),
    'verified', coalesce(pr.phone_verified, false),
    'verified_at', pr.phone_verified_at,
    'claim', case when cl.id is null then null else jsonb_build_object(
      'id', cl.id, 'phone', cl.phone, 'code', cl.code, 'expires_at', cl.expires_at) end);
end $$;
revoke all on function qbank.my_phone() from public;
grant execute on function qbank.my_phone() to authenticated;

-- ═══ ٧ · المشرف يرى ويوثّق ═══
create or replace function qbank.admin_phone_claims(p_status text default 'pending')
returns jsonb language plpgsql security definer set search_path = qbank, public as $$
declare out jsonb;
begin
  if not qbank.is_admin() then return jsonb_build_object('error','admin only'); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'phone', c.phone, 'code', c.code, 'status', c.status,
           'at', c.created_at, 'expires_at', c.expires_at, 'note', c.note,
           'expired', c.status = 'pending' and c.expires_at <= now(),
           'name', nullif(btrim(pr.name), ''), 'email', u.email,
           'user_id', c.user_id
         ) order by c.created_at), '[]'::jsonb)
    into out
    from (select * from qbank.phone_claims
           where (nullif(p_status, '') is null or status = p_status)
           order by created_at limit 200) c
    join qbank.profiles pr on pr.id = c.user_id
    join auth.users     u  on u.id  = c.user_id;
  return out;
end $$;
revoke all on function qbank.admin_phone_claims(text) from public;
grant execute on function qbank.admin_phone_claims(text) to authenticated;

create or replace function qbank.admin_verify_phone(
  p_id uuid, p_ok boolean, p_note text default ''
) returns jsonb language plpgsql security definer set search_path = qbank, public as $$
declare c qbank.phone_claims%rowtype;
begin
  if not qbank.is_admin() then return jsonb_build_object('ok', false, 'reason','forbidden'); end if;
  select * into c from qbank.phone_claims where id = p_id for update;
  if c.id is null then return jsonb_build_object('ok', false, 'reason','not_found'); end if;
  if c.status <> 'pending' then
    return jsonb_build_object('ok', false, 'reason','already_settled', 'status', c.status);
  end if;

  if not coalesce(p_ok, false) then
    update qbank.phone_claims
       set status = 'rejected', settled_at = now(), settled_by = auth.uid(),
           note = left(coalesce(p_note, ''), 200)
     where id = c.id;
    perform qbank.log_admin('phone_reject', c.user_id, jsonb_build_object('claim', c.id));
    return jsonb_build_object('ok', true, 'status','rejected');
  end if;

  /* ★ السباق الأخير: قد يكون الرقم وُثّق لحسابٍ آخر بين فتح اللوحة
     والضغط. نفحص قبل الكتابة لا نعتمد على ما رآه المشرف قبل دقيقتين. */
  if exists (select 1 from qbank.profiles
              where phone_verified and qbank.norm_phone(phone) = c.phone
                and id <> c.user_id) then
    update qbank.phone_claims
       set status = 'rejected', settled_at = now(), settled_by = auth.uid(),
           note = 'الرقم موثَّق لحسابٍ آخر'
     where id = c.id;
    return jsonb_build_object('ok', false, 'reason','taken');
  end if;

  update qbank.profiles
     set phone = c.phone, phone_verified = true, phone_verified_at = now()
   where id = c.user_id;

  update qbank.phone_claims
     set status = 'verified', settled_at = now(), settled_by = auth.uid(),
         note = left(coalesce(p_note, ''), 200)
   where id = c.id;

  perform qbank.log_admin('phone_verify', c.user_id,
    jsonb_build_object('claim', c.id, 'phone', c.phone));
  return jsonb_build_object('ok', true, 'status','verified');
end $$;
revoke all on function qbank.admin_verify_phone(uuid, boolean, text) from public;
grant execute on function qbank.admin_verify_phone(uuid, boolean, text) to authenticated;

/* سحب التوثيق — لمن غيّر رقمه أو ثبت أن الرقم ليس له */
create or replace function qbank.admin_unverify_phone(p_user uuid)
returns jsonb language plpgsql security definer set search_path = qbank, public as $$
begin
  if not qbank.is_admin() then return jsonb_build_object('ok', false, 'reason','forbidden'); end if;
  update qbank.profiles
     set phone_verified = false, phone_verified_at = null
   where id = p_user;
  perform qbank.log_admin('phone_unverify', p_user, '{}'::jsonb);
  return jsonb_build_object('ok', true);
end $$;
revoke all on function qbank.admin_unverify_phone(uuid) from public;
grant execute on function qbank.admin_unverify_phone(uuid) to authenticated;

notify pgrst, 'reload schema';

-- ═══ تحقّق ═══
select qbank.norm_phone('0501234567')     as من_صفر_خمسة,
       qbank.norm_phone('+966 50 123 4567') as من_دولي,
       qbank.norm_phone('٠٥٠١٢٣٤٥٦٧')    as من_عربي,
       qbank.gen_phone_code(6)            as رمز_تجريبي,
       (select count(*) from qbank.profiles where phone_verified) as موثَّقون;
