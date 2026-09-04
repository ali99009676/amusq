-- ═══════════════════════════════════════════════════════════════════════════
--  أكواد التفعيل — طريق للشراء لا يمرّ ببوابة دفع
--
--  المشكلة التي يحلّها هذا الملف: زرّ «اشترِ المادة» يقود إلى /api/pay،
--  و/api/pay يشترط TAP_SECRET_KEY، وTap تشترط سجلًا تجاريًا وأيامًا من
--  المراجعة. فالطالب يضغط الزر اليوم فيُقال له «الدفع غير مفعَّل بعد» —
--  طريقٌ مسدود في اللحظة الوحيدة التي قرّر فيها أن يدفع.
--
--  والحلّ ليس تعطيل السعر ولا انتظار البوابة: رمزٌ يبيعه المشرف بأي وسيلة
--  يقبضها فعلًا (تحويل، STC Pay، نقدًا في الكلية)، ويُدخله الطالب فتُفتح
--  المادة في ثانية. البوابة حين تجهز تعمل بجانبه لا بدلًا منه.
--
--  ═══ ثلاث قواعد تحكم كل سطر هنا ═══
--
--  ١ · الرمز يُستهلك مرة واحدة لكل طالب، والعدّاد ذرّي.
--      طالبان يُدخلان الرمز نفسه في اللحظة نفسها حالةٌ تقع فعلًا في
--      مجموعة واتساب. `for update` وفهرس فريد يمنعان منح ما لا يُملك.
--
--  ٢ · الأبجدية بلا حروف ملتبسة.
--      رمزٌ فيه 0 وO معًا يُقرأ خطأً في صورة واتساب، فيعود الطالب يشكو
--      أن «الرمز لا يعمل» وهو يعمل. الالتباس عيب تصميم لا خطأ مستخدم.
--
--  ٣ · لا يُقرأ جدول الأكواد من المتصفح إطلاقًا.
--      RLS بلا سياسة قراءة لأحد، وكل وصول عبر دوال security definer.
--      جدولٌ يُقرأ يعني أن أي طالب يسحب كل الأكواد بنداء واحد.
--
--  آمن التكرار بالكامل: لا drop لجدول ولا لعمود.
-- ═══════════════════════════════════════════════════════════════════════════
set search_path = qbank, public;

-- ═══ ١ · الجداول ═══
create table if not exists qbank.codes (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,          -- مُطبَّع: حروف كبيرة بلا فواصل
  kind        text not null default 'subject',  -- subject | semester
  subject_id  uuid references qbank.subjects(id) on delete cascade,
  days        int  not null default 180,     -- مدة الاستحقاق الممنوح
  max_uses    int  not null default 1,
  used_count  int  not null default 0,
  active      boolean not null default true,
  expires_at  timestamptz,                   -- صلاحية الرمز نفسه (لا الاستحقاق)
  note        text not null default '',      -- «دفعة ٢٠٤٦ · تحويل بنكي»
  batch       text not null default '',      -- لتجميع دفعة توليد واحدة
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists codes_batch_idx   on qbank.codes (batch, created_at desc);
create index if not exists codes_subject_idx on qbank.codes (subject_id);

/*
  سجلّ الاستخدام. الفهرس الفريد (code_id, user_id) هو ما يمنع طالبًا واحدًا
  من استهلاك رمزٍ متعدّد الاستخدامات وحده — وهو أشيع سوء استعمال متوقَّع:
  رمز «للدفعة كلها» يستهلكه أولُ من رآه بعشرين ضغطة.
*/
create table if not exists qbank.code_uses (
  id       uuid primary key default gen_random_uuid(),
  code_id  uuid not null references qbank.codes(id) on delete cascade,
  user_id  uuid not null references auth.users(id) on delete cascade,
  used_at  timestamptz not null default now()
);
create unique index if not exists code_uses_once on qbank.code_uses (code_id, user_id);
create index if not exists code_uses_user_idx on qbank.code_uses (user_id, used_at desc);

alter table qbank.codes     enable row level security;
alter table qbank.code_uses enable row level security;
-- ★ بلا سياسة قراءة: لا أحد يقرأ هذين الجدولين مباشرة، والدوال أدناه هي الباب.
drop policy if exists codes_none     on qbank.codes;
drop policy if exists code_uses_none on qbank.code_uses;

-- ═══ ٢ · تطبيع الرمز ═══
/*
  ما يكتبه الطالب: «amsq-7k4d 9f2h» أو «AMSQ7K4D9F2H» أو بمسافة زائدة من
  اللصق. وكلّها الرمز نفسه. التطبيع هنا لا في المتصفح وحده، لأن المتصفح
  يُتجاوَز والقاعدة لا تُتجاوَز.
*/
create or replace function qbank.norm_code(p text)
returns text language sql immutable as $$
  select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g'))
$$;

-- ═══ ٣ · توليد رمز عشوائي مقروء ═══
/*
  الأبجدية بلا 0 O I 1 L — الأحرف التي تتبادل في القراءة والكتابة اليدوية.

  ★ ولا `gen_random_bytes` هنا، وهذا ليس تفضيلًا.
  تلك الدالة من امتداد pgcrypto، وSupabase تُركّب الامتدادات في مخطط
  `extensions` لا في `public`. ودوالُّنا تُثبّت `search_path = qbank, public`
  حمايةً من اختطاف المسار — فلا ترى `extensions`، فتسقط الدالة كلها بـ
  «function gen_random_bytes does not exist»، ويقرأ المشرف «تعذّر التوليد»
  بلا سبب. أي أن حارسًا صحيحًا كسر ميزة لأنها اتّكأت على جارٍ خارج سوره.

  والبديل من نواة بوستجرس نفسها: `gen_random_uuid()` مصدرُ عشوائيةٍ
  معمّاة، و`md5` و`decode` و`get_byte` كلها أساسية بلا امتداد. فلا نخسر
  جودة العشوائية ولا نتعلّق بامتدادٍ قد لا يكون مركّبًا.
*/
create or replace function qbank.gen_code(n int default 10)
returns text language plpgsql volatile set search_path = qbank, public as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea;
  out text := '';
  need int := greatest(coalesce(n, 10), 6);
  i int;
begin
  for i in 0..need - 1 loop
    -- ستة عشر بايتًا لكل دفعة، ونُجدّدها إن طال الرمز عنها
    if i % 16 = 0 then
      bytes := decode(md5(gen_random_uuid()::text || clock_timestamp()::text), 'hex');
    end if;
    out := out || substr(alphabet, 1 + (get_byte(bytes, i % 16) % length(alphabet)), 1);
  end loop;
  return out;
end $$;

-- ═══ ٤ · الطالب يُفعّل ═══
/*
  ★ كل رفضٍ له سبب مسمّى.
  «الرمز غير صحيح» جوابٌ واحد لسبعة أحوال مختلفة، ويُنتج سبع رسائل واتساب
  إلى المشرف لا يستطيع أن يجيب عن واحدة منها. فنُفرّق: منتهٍ، مستهلَك،
  استعملتَه من قبل، عندك المادة أصلًا — ولكلٍّ نصٌّ يقول للطالب ما يفعل.
*/
create or replace function qbank.redeem_code(p_code text)
returns jsonb language plpgsql security definer set search_path = qbank, public as $$
declare
  uid uuid := auth.uid();
  c   qbank.codes%rowtype;
  cfg qbank.settings%rowtype;
  sub qbank.subjects%rowtype;
  d   int;
  exp timestamptz;
begin
  if uid is null then return jsonb_build_object('ok', false, 'reason','auth'); end if;

  /* ★ القفل قبل الفحص لا بعده: بين قراءة العدّاد وزيادته تسع مللي ثانية
     يكفيان لأن يمرّ نداءٌ ثانٍ بالرمز نفسه. */
  select * into c from qbank.codes
   where code = qbank.norm_code(p_code) for update;

  if c.id is null      then return jsonb_build_object('ok', false, 'reason','not_found'); end if;
  if not c.active      then return jsonb_build_object('ok', false, 'reason','disabled');  end if;
  if c.expires_at is not null and c.expires_at <= now()
                       then return jsonb_build_object('ok', false, 'reason','expired');   end if;
  if c.used_count >= c.max_uses
                       then return jsonb_build_object('ok', false, 'reason','used_up');   end if;

  if exists (select 1 from qbank.code_uses u where u.code_id = c.id and u.user_id = uid) then
    return jsonb_build_object('ok', false, 'reason','already_used_by_you');
  end if;

  select * into cfg from qbank.settings limit 1;
  d := least(greatest(coalesce(nullif(c.days, 0), coalesce(cfg.entitlement_days, 180)), 1), 3650);
  exp := now() + (d || ' days')::interval;

  if c.kind = 'subject' then
    select * into sub from qbank.subjects where id = c.subject_id;
    if sub.id is null then return jsonb_build_object('ok', false, 'reason','subject_gone'); end if;
    if sub.free then return jsonb_build_object('ok', false, 'reason','already_free'); end if;
    /* ★ لا نستهلك رمزًا على مادة يملكها: الاستهلاك بلا مقابل خسارةٌ
       يدفعها الطالب ولا يفهم سببها. */
    if exists (select 1 from qbank.entitlements e
                where e.user_id = uid and e.subject_id = sub.id and e.expires_at > now()) then
      return jsonb_build_object('ok', false, 'reason','already_owned');
    end if;
    insert into qbank.entitlements (user_id, subject_id, kind, source, expires_at)
    values (uid, sub.id, 'subject', 'code', exp);
  else
    -- حزمة فصل: استحقاق بلا مادة بعينها — البوابة تقرأ kind = 'semester'
    if exists (select 1 from qbank.entitlements e
                where e.user_id = uid and e.kind = 'semester' and e.expires_at > exp) then
      return jsonb_build_object('ok', false, 'reason','already_owned');
    end if;
    insert into qbank.entitlements (user_id, subject_id, kind, source, expires_at)
    values (uid, null, 'semester', 'code', exp);
  end if;

  insert into qbank.code_uses (code_id, user_id) values (c.id, uid);
  update qbank.codes set used_count = used_count + 1 where id = c.id;

  return jsonb_build_object(
    'ok', true, 'kind', c.kind, 'days', d, 'expires_at', exp,
    'subject_id', c.subject_id,
    'subject', case when c.kind = 'subject' then sub.name else null end);
end $$;
revoke all on function qbank.redeem_code(text) from public;
grant execute on function qbank.redeem_code(text) to authenticated;

-- ═══ ٥ · المشرف يولّد دفعة ═══
/*
  دفعةٌ لا رمزًا: بيع خمسة وعشرين رمزًا لدفعةٍ جامعية عملٌ واحد، وتوليدها
  واحدًا واحدًا خمسة وعشرون نداءً وخمسة وعشرون فرصةً للخطأ. و`batch`
  يجمعها فيُعرف بعد شهر من أين جاء كل رمز.
*/
create or replace function qbank.admin_make_codes(
  p_kind text default 'subject',
  p_subject uuid default null,
  p_count int default 1,
  p_days int default 180,
  p_max_uses int default 1,
  p_note text default '',
  p_valid_days int default 0        -- صلاحية الرمز نفسه؛ صفر = بلا انتهاء
) returns jsonb language plpgsql security definer set search_path = qbank, public as $$
declare
  n     int := least(greatest(coalesce(p_count, 1), 1), 200);
  kind  text := case when p_kind = 'semester' then 'semester' else 'subject' end;
  b     text := to_char(now(), 'YYMMDD-HH24MI') || '-' || substr(qbank.gen_code(3), 1, 3);
  made  text[] := '{}';
  fresh text;
  i int;
  tries int;
begin
  if not qbank.is_admin() then return jsonb_build_object('ok', false, 'reason','forbidden'); end if;
  if kind = 'subject' then
    if p_subject is null then return jsonb_build_object('ok', false, 'reason','no_subject'); end if;
    if not exists (select 1 from qbank.subjects where id = p_subject) then
      return jsonb_build_object('ok', false, 'reason','not_found');
    end if;
  end if;

  for i in 1..n loop
    /* ★ التصادم نادرٌ لا مستحيل، ولو وقع لسقط التوليد كلّه على قيد
       التفرّد. فنُعيد المحاولة بضع مرات بدل أن نُفشل دفعة كاملة. */
    tries := 0;
    loop
      fresh := qbank.gen_code(10);
      exit when not exists (select 1 from qbank.codes where code = fresh);
      tries := tries + 1;
      exit when tries > 8;
    end loop;

    insert into qbank.codes (code, kind, subject_id, days, max_uses, note, batch,
                             created_by, expires_at)
    values (fresh, kind,
            case when kind = 'subject' then p_subject else null end,
            least(greatest(coalesce(p_days, 180), 1), 3650),
            least(greatest(coalesce(p_max_uses, 1), 1), 5000),
            left(coalesce(p_note, ''), 120), b, auth.uid(),
            case when coalesce(p_valid_days, 0) > 0
                 then now() + (p_valid_days || ' days')::interval else null end);
    made := made || fresh;
  end loop;

  perform qbank.log_admin('make_codes', null::uuid,
    jsonb_build_object('kind', kind, 'subject', p_subject, 'count', n, 'batch', b));
  return jsonb_build_object('ok', true, 'batch', b, 'codes', to_jsonb(made));
end $$;
revoke all on function qbank.admin_make_codes(text, uuid, int, int, int, text, int) from public;
grant execute on function qbank.admin_make_codes(text, uuid, int, int, int, text, int) to authenticated;

-- ═══ ٦ · المشرف يرى ويُعطّل ═══
/*
  ★ الرمز وحده نصفُ الخبر — ومن فعّله هو النصف الآخر.
  «استُعمل ٣ من ٥» رقمٌ لا يُجيب عن السؤال الذي يُسأل فعلًا: طالبٌ يقول
  «دفعتُ ولم تُفتح لي المادة»، فيحتاج المشرف أن يرى بعينه أن رمزه فُعِّل
  ومن أي حساب ومتى. وبلا ذلك لا سبيل إلى الفصل بين من دفع ولم يُفعّل، ومن
  فعّل بحسابٍ آخر ونسي، ومن أعطى رمزه لغيره.

  ولذلك يعود مع كل رمز صفُّ استخدامه: الاسم والبريد ووقت التفعيل.
  ★ وهذه بيانات حسابٍ لا تُعرض إلا للمشرف — الدالة تسأل is_admin أولًا،
  وجدول code_uses لا سياسة قراءة له أصلًا فلا طريق إليه غير هذه.
*/
create or replace function qbank.admin_codes(
  p_limit int default 100,
  p_batch text default '',
  p_state text default ''      -- '' | unused | used | off
) returns jsonb language plpgsql security definer set search_path = qbank, public as $$
declare out jsonb;
begin
  if not qbank.is_admin() then return jsonb_build_object('error','admin only'); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'code', c.code, 'kind', c.kind,
           'subject', s.name, 'subject_id', c.subject_id,
           'days', c.days, 'max_uses', c.max_uses, 'used_count', c.used_count,
           'active', c.active, 'expires_at', c.expires_at,
           'note', c.note, 'batch', c.batch, 'created_at', c.created_at,
           'uses', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'user_id', u.user_id,
                      'name', nullif(btrim(p.name), ''),
                      'email', au.email,
                      'used_at', u.used_at) order by u.used_at)
               from qbank.code_uses u
               left join qbank.profiles p  on p.id  = u.user_id
               left join auth.users    au on au.id = u.user_id
              where u.code_id = c.id), '[]'::jsonb)
         ) order by c.created_at desc), '[]'::jsonb)
    into out
    from (select * from qbank.codes
           where (nullif(p_batch, '') is null or batch = p_batch)
             and case coalesce(p_state, '')
                   when 'unused' then used_count = 0 and active
                   when 'used'   then used_count > 0
                   when 'off'    then not active
                   else true
                 end
           order by created_at desc
           limit least(greatest(coalesce(p_limit, 100), 1), 500)) c
    left join qbank.subjects s on s.id = c.subject_id;
  return out;
end $$;
/*
  ★ التوقيع القديم يُسقَط صراحةً.
  إضافة وسيطٍ بقيمة افتراضية تُنشئ دالةً ثانية بجوار الأولى لا تستبدلها،
  فتصير في القاعدة نسختان، ويردّ PostgREST «could not choose the best
  candidate function» على كل نداء. حذفُ القديمة هو ما يجعل الترقية ترقيةً.
*/
drop function if exists qbank.admin_codes(int, text);
revoke all on function qbank.admin_codes(int, text, text) from public;
grant execute on function qbank.admin_codes(int, text, text) to authenticated;

-- ═══ ٦ب · لوحة موجزة: كم رمزًا بقي وكم فُعِّل ═══
/*
  رقمٌ واحد يُغني عن عدّ صفوفٍ بالعين: كم رمزًا ما زال صالحًا للبيع.
  وهو السؤال الذي يُسأل قبل كل دفعة جديدة — «هل أطبع المزيد؟».
*/
create or replace function qbank.admin_codes_summary()
returns jsonb language plpgsql security definer set search_path = qbank, public as $$
declare out jsonb;
begin
  if not qbank.is_admin() then return jsonb_build_object('error','admin only'); end if;
  select jsonb_build_object(
           'total',    count(*),
           'unused',   count(*) filter (where used_count = 0 and active),
           'used',     count(*) filter (where used_count > 0),
           'off',      count(*) filter (where not active),
           'redeemed', (select count(*) from qbank.code_uses))
    into out from qbank.codes;
  return out;
end $$;
revoke all on function qbank.admin_codes_summary() from public;
grant execute on function qbank.admin_codes_summary() to authenticated;

create or replace function qbank.admin_set_code(p_id uuid, p_active boolean)
returns jsonb language plpgsql security definer set search_path = qbank, public as $$
begin
  if not qbank.is_admin() then return jsonb_build_object('ok', false, 'reason','forbidden'); end if;
  update qbank.codes set active = coalesce(p_active, false) where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'reason','not_found'); end if;
  perform qbank.log_admin('set_code', null::uuid,
    jsonb_build_object('code', p_id, 'active', p_active));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function qbank.admin_set_code(uuid, boolean) from public;
grant execute on function qbank.admin_set_code(uuid, boolean) to authenticated;

-- ═══ ٧ · رقم التواصل يصل المتصفح ═══
/*
  الطالب الذي لا يملك رمزًا يحتاج أن يعرف من يطلبه منه. والرقم مكتوب في
  الإعدادات منذ البداية ولم يكن يغادر لوحة المشرف قط — فكان زر «اشترِ»
  ينتهي بلا شيء يليه. نُضيفه إلى الحزمة العامة (وهو رقمُ عملٍ معلن، لا
  بيانات طالب)، ونُضيف معه سطر تعليمات الدفع كي يكتب المشرف طريقته بنفسه.
*/
alter table qbank.settings add column if not exists pay_note text not null default '';

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
      'whatsapp', whatsapp, 'pay_note', pay_note
    ) from qbank.settings where id = 1),
    'fetched_at', now()
  )
$$;

/*
  ★ إيقاظ ذاكرة PostgREST.
  دالةٌ جديدة لا تُرى من الويب حتى تُعاد قراءة المخطط، وقد تتأخر دقائق.
  فتُنفَّذ SQL بنجاح ويبقى الزرّ يقول «تعذّر التوليد» — والمشرف يظنّ أن
  الملف لم يعمل ويعيده مرارًا. سطرٌ واحد يمنع ذلك كله.
*/
notify pgrst, 'reload schema';

-- ═══ تحقّق ═══
-- ★ نُولّد رمزًا فعلًا هنا: «الدالة أُنشئت» لا تعني «الدالة تعمل»، وهذا
--   بالضبط ما أخفى عطل pgcrypto — الملف نجح والزرّ فشل.
select (select count(*) from qbank.codes)     as أكواد,
       (select count(*) from qbank.code_uses) as استخدامات,
       qbank.norm_code('amsq-7k4d 9f2h')      as مثال_تطبيع,
       qbank.gen_code(10)                     as رمز_تجريبي;
