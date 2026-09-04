-- ═══════════════════════════════════════════════════════════════════════════
--  مراجعة · لوحة الإشراف الكاملة — إحصاء دقيق وتحكم كامل
--
--  ثلاثة مبادئ:
--
--  ١ · لقطة واحدة لا ستّ لقطات. admin_overview تُرجع كل ما تحتاجه الشاشة
--      في نداء واحد، فتكون كل الأرقام من اللحظة نفسها. ستّ نداءات تعني
--      ستّ لحظات مختلفة، ومجموعًا لا يساوي أجزاءه أمام عين المشرف.
--
--  ٢ · كل فعل إداري يُسجَّل. منح كوينز يدويًا وردّ دفعة وترقية مشرف
--      أفعالٌ لا رجعة فيها بالمال أو بالصلاحية — وسجلٌّ لا يُكتب يعني
--      «من فعل هذا؟» بلا جواب.
--
--  ٣ · التحكم يمرّ بدوال محروسة لا بجداول مفتوحة. لا سياسة RLS تسمح
--      للمشرف بتعديل رصيد مباشرة: يمرّ بدالة تسجّل وتتحقق.
--
--  آمن التكرار بالكامل: لا drop لجدول ولا لعمود.
-- ═══════════════════════════════════════════════════════════════════════════
set search_path = qbank, public;

-- ═══ ١ · سجل التدقيق ═══
create table if not exists qbank.admin_actions (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid references auth.users(id) on delete set null,
  action     text not null,          -- grant_coins | set_role | refund | merge_university …
  target_id  uuid,
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_actions_idx on qbank.admin_actions (created_at desc);

create or replace function qbank.log_admin(p_action text, p_target uuid, p_detail jsonb)
returns void language sql security definer set search_path = qbank, public as $$
  insert into qbank.admin_actions (actor_id, action, target_id, detail)
  values (auth.uid(), p_action, p_target, coalesce(p_detail, '{}'::jsonb));
$$;

-- ═══ ٢ · اللقطة الشاملة ═══
/*
  كل ما تعرضه الشاشة الأولى في نداء واحد.

  ★ القمع (funnel) هو أهم ما هنا: مسجَّل ← فعّل ← اشترك ← دفع.
  الأرقام المطلقة تُطمئن كذبًا؛ «١٠٠٠ مسجّل» عظيم حتى ترى أن ٤٠ منهم
  فتحوا مادة. القمع يقول أين يتسرّب الطلاب، وهو السؤال الوحيد الذي
  يُغيّر ما تفعله غدًا.
*/
create or replace function qbank.admin_overview(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = qbank, public as $$
declare
  d int := least(greatest(coalesce(p_days, 30), 1), 365);
  since timestamptz := now() - (d || ' days')::interval;
begin
  if not qbank.is_admin() then return jsonb_build_object('ok', false, 'reason','forbidden'); end if;

  return jsonb_build_object(
    'ok', true,
    'days', d,

    /* القمع — كل رقم شرطٌ للذي بعده */
    'funnel', jsonb_build_object(
      'signed_up',  (select count(*) from qbank.profiles),
      'has_campus', (select count(*) from qbank.profiles where university_id is not null),
      'enrolled',   (select count(distinct user_id) from qbank.enrollments),
      'examined',   (select count(distinct user_id) from qbank.attempts),
      'uploaded',   (select count(distinct created_by) from qbank.subjects where created_by is not null),
      'paid',       (select count(distinct user_id) from qbank.payments where status = 'paid')),

    /* النشاط */
    'activity', jsonb_build_object(
      'new_users',  (select count(*) from qbank.profiles where created_at >= since),
      'active',     (select count(distinct user_id) from qbank.attempts where created_at >= since),
      'attempts',   (select count(*) from qbank.attempts where created_at >= since),
      'avg_pct',    (select coalesce(round(avg(pct)), 0) from qbank.attempts where created_at >= since),
      'online',     (select count(*) from qbank.devices where last_seen >= now() - interval '4 hours')),

    /* المحتوى */
    'content', jsonb_build_object(
      'subjects',   (select count(*) from qbank.subjects),
      'published',  (select count(*) from qbank.subjects where published and status = 'published'),
      'verified',   (select count(*) from qbank.subjects where verified),
      'free',       (select count(*) from qbank.subjects where free),
      'questions',  (select count(*) from qbank.questions),
      'derived',    (select count(*) from qbank.questions where derived),
      'drafts',     (select count(*) from qbank.drafts where status = 'pending'),
      'orphan',     (select count(*) from qbank.subjects
                      where published and status='published' and university_id is null)),

    /* الجودة */
    'quality', jsonb_build_object(
      'reports_open', (select count(*) from qbank.reports where status = 'open'),
      'reports_all',  (select count(*) from qbank.reports),
      'ratings',      (select count(*) from qbank.subject_ratings),
      'avg_rating',   (select coalesce(round(avg(stars)::numeric, 2), 0) from qbank.subject_ratings),
      'low_rated',    (select count(*) from qbank.subjects where rating_n >= 3 and rating_avg < 3)),

    /* المال — بالهللات دائمًا، والواجهة تحوّل */
    'money', jsonb_build_object(
      'revenue',      (select coalesce(sum(amount_halalas),0) from qbank.payments
                        where status='paid' and paid_at >= since),
      'revenue_all',  (select coalesce(sum(amount_halalas),0) from qbank.payments where status='paid'),
      'paid_n',       (select count(*) from qbank.payments where status='paid' and paid_at >= since),
      'pending_n',    (select count(*) from qbank.payments where status='pending'),
      'failed_n',     (select count(*) from qbank.payments where status='failed'),
      -- ★ الالتزام القادم: كوينز في جيوب الطلاب لم تُنفَق بعد، وكلٌّ منها
      --   تكلفة ذكاء ستُدفع يومًا. رقمٌ يغيب عن أكثر اللوحات وهو دَين حقيقي.
      'coins_outstanding', (select coalesce(sum(coins_balance),0) from qbank.profiles),
      'coins_spent',       (select coalesce(sum(-amount),0) from qbank.coin_transactions where amount < 0)),

    /* المجتمع */
    'community', jsonb_build_object(
      'universities', (select count(distinct university_id) from qbank.subjects where university_id is not null),
      'colleges',     (select count(distinct college_id) from qbank.subjects where college_id is not null),
      'challenges',   (select count(*) from qbank.challenges where ends_at > now())),

    /* سلسلة يومية للرسم: التسجيل والاختبارات والدخل */
    'series', coalesce((
      select jsonb_agg(jsonb_build_object(
               'd', to_char(g.day, 'YYYY-MM-DD'),
               'users',    (select count(*) from qbank.profiles p where p.created_at::date = g.day),
               'attempts', (select count(*) from qbank.attempts a where a.created_at::date = g.day),
               'revenue',  (select coalesce(sum(pm.amount_halalas),0) from qbank.payments pm
                             where pm.status='paid' and pm.paid_at::date = g.day))
             order by g.day)
        from generate_series((now() - (d || ' days')::interval)::date, now()::date, interval '1 day') g(day)
    ), '[]'::jsonb));
end $$;
revoke all on function qbank.admin_overview(int) from public;
grant execute on function qbank.admin_overview(int) to authenticated;

-- ═══ ٣ · دفتر الكوينز: من أين تأتي وإلى أين تذهب ═══
/*
  ★ رقمان لا يكفيان: «مُنح» و«أُنفق». الكوين يدخل من ثلاثة أبواب ويخرج
  من بابين، وخلطها يجعل كل تحليل ربحية خاطئًا: منحة التسجيل تكلفة تسويق،
  والكوين المشترى إيراد، ومكافأة الإحالة تكلفة اكتساب. ثلاثة أشياء مختلفة
  لو جُمعت في «مُنح» لبدت المنصة رابحة وهي خاسرة.
*/
create or replace function qbank.admin_coins(p_days int default 30)
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select case when not qbank.is_admin() then jsonb_build_object('ok', false) else
    jsonb_build_object(
      'ok', true,
      'by_kind', coalesce((
        select jsonb_agg(jsonb_build_object('kind', t.kind, 'n', t.n, 'coins', t.coins))
          from (select kind, count(*) n, sum(amount) coins
                  from qbank.coin_transactions
                 where created_at >= now() - (least(greatest(coalesce(p_days,30),1),365) || ' days')::interval
                 group by kind) t), '[]'::jsonb),
      'outstanding', (select coalesce(sum(coins_balance),0) from qbank.profiles),
      'top_holders', coalesce((
        select jsonb_agg(jsonb_build_object('name', nullif(btrim(p.name),''), 'coins', p.coins_balance)
               order by p.coins_balance desc)
          from (select name, coins_balance from qbank.profiles
                 where coins_balance > 0 order by coins_balance desc limit 10) p), '[]'::jsonb))
  end
$$;
revoke all on function qbank.admin_coins(int) from public;
grant execute on function qbank.admin_coins(int) to authenticated;

-- ═══ ٤ · الأسئلة التي يخطئ فيها الطلاب ═══
/*
  ★ أنفع تقرير محتوى في المنصة كلها.
  سؤالٌ يخطئ فيه ٩٠٪ من الطلاب إمّا صعبٌ جدًا وإمّا إجابته المعلَّمة خاطئة.
  والثاني كارثة صامتة: يحفظ الطلاب الخطأ ولا يُبلّغ أحد لأن كلًّا يظن
  أنه هو المخطئ. هذا التقرير يكشفه بلا انتظار بلاغ.
*/
create or replace function qbank.admin_hard_questions(p_limit int default 30)
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  /*
    المصدر progress.data لا جدول إجابات: تقدّم كل طالب مخزَّن كـjsonb
    { subjectId: { seen:{qid:1}, wrong:{qid:n} } }. نفكّه بـjsonb_each.

    والمقياس «كم طالبًا أخطأ» لا «كم مرة أُخطئ»: طالبٌ يكرر السؤال عشر
    مرات لا يجعله أصعب على غيره، والعدّ بالمرات يجعل أكثر الأسئلة مراجعةً
    تبدو أصعبها.
  */
  with per as (
    select p.user_id, subj.value sdata
      from qbank.progress p, lateral jsonb_each(p.data) subj
  ), seen as (
    select s.key qid, count(distinct per.user_id) n
      from per, lateral jsonb_each(coalesce(per.sdata->'seen', '{}'::jsonb)) s
     group by s.key
  ), wrong as (
    select w.key qid, count(distinct per.user_id) n
      from per, lateral jsonb_each(coalesce(per.sdata->'wrong', '{}'::jsonb)) w
     group by w.key
  )
  select case when not qbank.is_admin() then '[]'::jsonb else coalesce((
    select jsonb_agg(x order by (x->>'wrong_pct')::numeric desc, (x->>'seen')::int desc)
      from (
        select jsonb_build_object(
                 'id', q.id, 'subject_id', q.subject_id, 'subject', s.name,
                 'q', left(q.q, 160), 'answer', q.answer, 'derived', q.derived,
                 'seen', sn.n, 'wrong', coalesce(wr.n, 0),
                 'wrong_pct', round(coalesce(wr.n,0) * 100.0 / nullif(sn.n, 0))) x
          from seen sn
          left join wrong wr on wr.qid = sn.qid
          join qbank.questions q on q.id::text = sn.qid
          join qbank.subjects  s on s.id = q.subject_id
         -- ★ خمسة طلاب على الأقل: نسبة من طالبين ضوضاء لا إشارة
         where sn.n >= 5
           and coalesce(wr.n,0) * 100.0 / nullif(sn.n, 0) >= 60
         limit least(greatest(coalesce(p_limit,30),1), 100)
      ) t), '[]'::jsonb) end
$$;
revoke all on function qbank.admin_hard_questions(int) from public;
grant execute on function qbank.admin_hard_questions(int) to authenticated;

-- ═══ ٥ · الجامعات والرافعون ═══
create or replace function qbank.admin_campus()
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select case when not qbank.is_admin() then jsonb_build_object('ok', false) else
    jsonb_build_object(
      'ok', true,
      'universities', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', u.id, 'name', u.name, 'country', u.country, 'verified', u.verified,
                 'subjects', (select count(*) from qbank.subjects s where s.university_id = u.id),
                 'students', (select count(*) from qbank.profiles p where p.university_id = u.id))
               order by (select count(*) from qbank.subjects s where s.university_id = u.id) desc)
          from qbank.universities u), '[]'::jsonb),
      'top_creators', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', p.id, 'name', nullif(btrim(p.name),''),
                 'subjects', c.n, 'questions', c.q)
               order by c.q desc)
          from (select created_by, count(*) n, sum(q_count) q
                  from qbank.subjects where created_by is not null
                 group by created_by order by sum(q_count) desc limit 10) c
          join qbank.profiles p on p.id = c.created_by), '[]'::jsonb))
  end
$$;
revoke all on function qbank.admin_campus() from public;
grant execute on function qbank.admin_campus() to authenticated;

-- ═══ ٦ · التحكم: الطلاب ═══
/*
  ★ منح الكوينز يدويًا فعلٌ ماليّ. يُسجَّل دائمًا، ويمرّ بدفتر المعاملات
  نفسه الذي يمرّ به الشراء — فلا يصير في المنصة رصيدٌ بلا أثر يُفسّره.
*/
create or replace function qbank.admin_grant_coins(p_user uuid, p_amount int, p_note text default '')
returns jsonb language plpgsql security definer set search_path = qbank, public as $$
declare bal int;
begin
  if not qbank.is_admin() then return jsonb_build_object('ok', false, 'reason','forbidden'); end if;
  if coalesce(p_amount,0) = 0 then return jsonb_build_object('ok', false, 'reason','zero'); end if;

  update qbank.profiles set coins_balance = greatest(coins_balance + p_amount, 0)
   where id = p_user returning coins_balance into bal;
  if bal is null then return jsonb_build_object('ok', false, 'reason','not_found'); end if;

  insert into qbank.coin_transactions (user_id, amount, reason, kind)
  values (p_user, p_amount, coalesce(nullif(p_note,''), 'تعديل من المشرف'), 'admin');

  perform qbank.log_admin('grant_coins', p_user,
    jsonb_build_object('amount', p_amount, 'note', p_note, 'balance', bal));
  return jsonb_build_object('ok', true, 'balance', bal);
end $$;
revoke all on function qbank.admin_grant_coins(uuid, int, text) from public;
grant execute on function qbank.admin_grant_coins(uuid, int, text) to authenticated;

/*
  ★ الترقية إلى مشرف أخطر فعل في المنصة، وفيه حارسان:
  لا يُنزّل المشرف نفسه (فتبقى المنصة بلا مشرف)، ولا يُترك آخر مشرف بلا خلف.
*/
create or replace function qbank.admin_set_role(p_user uuid, p_admin boolean)
returns jsonb language plpgsql security definer set search_path = qbank, public as $$
declare admins int;
begin
  if not qbank.is_admin() then return jsonb_build_object('ok', false, 'reason','forbidden'); end if;
  if p_user = auth.uid() and not p_admin then
    return jsonb_build_object('ok', false, 'reason','self_demote');
  end if;
  if not p_admin then
    select count(*) into admins from qbank.profiles where is_admin;
    if admins <= 1 then return jsonb_build_object('ok', false, 'reason','last_admin'); end if;
  end if;

  update qbank.profiles set is_admin = coalesce(p_admin, false) where id = p_user;
  perform qbank.log_admin('set_role', p_user, jsonb_build_object('is_admin', p_admin));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function qbank.admin_set_role(uuid, boolean) from public;
grant execute on function qbank.admin_set_role(uuid, boolean) to authenticated;

/* منح استحقاق مادة يدويًا — للدعم حين يدفع الطالب ولا تصله المادة */
create or replace function qbank.admin_grant_entitlement(p_user uuid, p_subject uuid, p_days int default 180)
returns jsonb language plpgsql security definer set search_path = qbank, public as $$
begin
  if not qbank.is_admin() then return jsonb_build_object('ok', false, 'reason','forbidden'); end if;
  insert into qbank.entitlements (user_id, subject_id, kind, source, expires_at)
  values (p_user, p_subject, 'subject', 'admin',
          now() + (least(greatest(coalesce(p_days,180),1), 3650) || ' days')::interval);
  perform qbank.log_admin('grant_entitlement', p_user,
    jsonb_build_object('subject', p_subject, 'days', p_days));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function qbank.admin_grant_entitlement(uuid, uuid, int) from public;
grant execute on function qbank.admin_grant_entitlement(uuid, uuid, int) to authenticated;

-- ═══ ٧ · التحكم: المحتوى ═══
create or replace function qbank.admin_set_subject(p_subject uuid, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = qbank, public as $$
begin
  if not qbank.is_admin() then return jsonb_build_object('ok', false, 'reason','forbidden'); end if;

  /*
    ★ قائمة بيضاء صريحة لا تحديث حر بـjsonb.
    لو مرّرنا p_patch كما هو لأمكن تعديل q_count أو created_by أو rating_avg
    — أعمدة تُحسب ولا تُكتب، وكتابتها تجعل كل إحصاء يكذب.
  */
  update qbank.subjects set
    published = coalesce((p_patch->>'published')::boolean, published),
    free      = coalesce((p_patch->>'free')::boolean, free),
    verified  = coalesce((p_patch->>'verified')::boolean, verified),
    price     = coalesce((p_patch->>'price')::int, price),
    ord       = coalesce((p_patch->>'ord')::int, ord),
    status    = coalesce(nullif(p_patch->>'status',''), status)
  where id = p_subject;

  perform qbank.log_admin('set_subject', p_subject, p_patch);
  return jsonb_build_object('ok', true);
end $$;
revoke all on function qbank.admin_set_subject(uuid, jsonb) from public;
grant execute on function qbank.admin_set_subject(uuid, jsonb) to authenticated;

/*
  ★ دمج جامعتين — الإصلاح الذي ستحتاجه حتمًا.
  توحيد الإملاء يمنع أكثر التكرار لا كلّه: «جامعة الملك سعود» و«KSU»
  اسمان مختلفان لجامعة واحدة، ولا خوارزمية تعرف ذلك. فيدمجهما إنسان.
*/
create or replace function qbank.admin_merge_university(p_from uuid, p_into uuid)
returns jsonb language plpgsql security definer set search_path = qbank, public as $$
declare moved int;
begin
  if not qbank.is_admin() then return jsonb_build_object('ok', false, 'reason','forbidden'); end if;
  if p_from = p_into then return jsonb_build_object('ok', false, 'reason','same'); end if;
  if not exists (select 1 from qbank.universities where id = p_into) then
    return jsonb_build_object('ok', false, 'reason','target_missing');
  end if;

  /*
    ★ الكليات المتشابهة اسمًا تُدمج لا تُنقل.
    جامعتان لكلٍّ منهما «كلية الطب»: نقل الكلية كما هي يكسر الفهرس الفريد
    (university_id, name) فتفشل عملية الدمج كلها بعد أن نقلت نصفها.
    فنُحوّل مواد الكلية المكرَّرة إلى نظيرتها في الهدف، ثم نحذف المكرَّرة.
  */
  update qbank.subjects s
     set college_id = t.id
    from qbank.colleges c
    join qbank.colleges t
      on t.university_id = p_into and qbank.ar_norm(t.name) = qbank.ar_norm(c.name)
   where c.university_id = p_from and s.college_id = c.id;

  delete from qbank.colleges c
   where c.university_id = p_from
     and exists (select 1 from qbank.colleges t
                  where t.university_id = p_into
                    and qbank.ar_norm(t.name) = qbank.ar_norm(c.name));

  -- ما بقي من كليات لا نظير لها ينتقل كما هو
  update qbank.colleges set university_id = p_into where university_id = p_from;
  update qbank.subjects  set university_id = p_into where university_id = p_from;
  get diagnostics moved = row_count;
  update qbank.profiles  set university_id = p_into where university_id = p_from;
  update qbank.profiles  set college_id = null
   where college_id is not null
     and not exists (select 1 from qbank.colleges c where c.id = profiles.college_id);
  delete from qbank.universities where id = p_from;

  perform qbank.log_admin('merge_university', p_into,
    jsonb_build_object('from', p_from, 'subjects_moved', moved));
  return jsonb_build_object('ok', true, 'moved', moved);
end $$;
revoke all on function qbank.admin_merge_university(uuid, uuid) from public;
grant execute on function qbank.admin_merge_university(uuid, uuid) to authenticated;

create or replace function qbank.admin_verify_university(p_uni uuid, p_on boolean)
returns jsonb language plpgsql security definer set search_path = qbank, public as $$
begin
  if not qbank.is_admin() then return jsonb_build_object('ok', false, 'reason','forbidden'); end if;
  update qbank.universities set verified = coalesce(p_on,false) where id = p_uni;
  perform qbank.log_admin('verify_university', p_uni, jsonb_build_object('verified', p_on));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function qbank.admin_verify_university(uuid, boolean) from public;
grant execute on function qbank.admin_verify_university(uuid, boolean) to authenticated;

-- ═══ ٨ · التحكم: المال ═══
/*
  ★ لا يُعيد المال إلى بطاقة الطالب — الردّ المالي يتم في لوحة البوابة.
  هذه تُسجّل الردّ عندنا وتسحب ما مُنح، كي لا يبقى الطالب برصيد دُفع ثمنه
  ثم استُرجع. الفصل مقصود: نحن لا نملك سحب مال من بطاقة، ولا ندّعي ذلك.
*/
create or replace function qbank.admin_refund(p_payment uuid, p_note text default '')
returns jsonb language plpgsql security definer set search_path = qbank, public as $$
declare pay qbank.payments%rowtype;
begin
  if not qbank.is_admin() then return jsonb_build_object('ok', false, 'reason','forbidden'); end if;
  select * into pay from qbank.payments where id = p_payment for update;
  if pay.id is null then return jsonb_build_object('ok', false, 'reason','not_found'); end if;
  if pay.status <> 'paid' then return jsonb_build_object('ok', false, 'reason','not_paid'); end if;

  update qbank.payments set status = 'failed',
         fail_reason = coalesce(nullif(p_note,''), 'رُدّت من المشرف')
   where id = pay.id;

  if pay.kind = 'coins' then
    update qbank.profiles set coins_balance = greatest(coins_balance - pay.coins, 0)
     where id = pay.user_id;
    insert into qbank.coin_transactions (user_id, amount, reason, kind)
    values (pay.user_id, -pay.coins, 'ردّ دفعة', 'admin');
  else
    delete from qbank.entitlements
     where user_id = pay.user_id and subject_id = pay.subject_id and source = 'web';
  end if;

  perform qbank.log_admin('refund', pay.id,
    jsonb_build_object('user', pay.user_id, 'kind', pay.kind, 'halalas', pay.amount_halalas));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function qbank.admin_refund(uuid, text) from public;
grant execute on function qbank.admin_refund(uuid, text) to authenticated;

create or replace function qbank.admin_payments(p_status text default '', p_limit int default 50)
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select case when not qbank.is_admin() then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id, 'kind', p.kind, 'coins', p.coins,
             'amount_halalas', p.amount_halalas, 'status', p.status,
             'created_at', p.created_at, 'paid_at', p.paid_at,
             'provider_ref', p.provider_ref, 'fail_reason', p.fail_reason,
             'student', nullif(btrim(pr.name),''), 'subject', s.name)
           order by p.created_at desc)
      from (select * from qbank.payments
             where (coalesce(p_status,'') = '' or status = p_status)
             order by created_at desc
             limit least(greatest(coalesce(p_limit,50),1), 200)) p
      left join qbank.profiles pr on pr.id = p.user_id
      left join qbank.subjects s  on s.id = p.subject_id), '[]'::jsonb) end
$$;
revoke all on function qbank.admin_payments(text, int) from public;
grant execute on function qbank.admin_payments(text, int) to authenticated;

-- ═══ ٩ · سجل التدقيق للقراءة ═══
create or replace function qbank.admin_audit(p_limit int default 100)
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select case when not qbank.is_admin() then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object(
             'action', a.action, 'detail', a.detail, 'created_at', a.created_at,
             'actor', nullif(btrim(p.name),''))
           order by a.created_at desc)
      from (select * from qbank.admin_actions order by created_at desc
             limit least(greatest(coalesce(p_limit,100),1), 300)) a
      left join qbank.profiles p on p.id = a.actor_id), '[]'::jsonb) end
$$;
revoke all on function qbank.admin_audit(int) from public;
grant execute on function qbank.admin_audit(int) to authenticated;

alter table qbank.admin_actions enable row level security;
drop policy if exists audit_read on qbank.admin_actions;
create policy audit_read on qbank.admin_actions for select using (qbank.is_admin());
-- ★ لا سياسة insert ولا update ولا delete: السجل يُكتب بالدالة ولا يُمحى.
--   سجلٌّ يستطيع صاحبه محوَه ليس سجلًّا.

-- ═══ ١٠ · قائمة الطلاب الموسَّعة ═══
/*
  admin_students الأصلية لا تُرجع الرصيد ولا الصلاحية ولا الجامعة — وبدونها
  لا تحكّم: المشرف يرى اسمًا ونتيجة ولا يعرف كم عند الطالب من كوين ولا هل
  هو مشرف. هذه تُضيفها بلا لمس الأصلية كي لا نكسر شاشة تعتمد عليها.
*/
create or replace function qbank.admin_students_pro(p_search text default '', p_limit int default 50)
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select case when not qbank.is_admin() then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id, 'name', nullif(btrim(p.name),''), 'avatar', p.avatar,
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
      from (select * from qbank.profiles
             where coalesce(p_search,'') = '' or name ilike '%' || p_search || '%'
             order by created_at desc
             limit least(greatest(coalesce(p_limit,50),1), 200)) p
      left join qbank.universities u on u.id = p.university_id
      left join qbank.colleges     c on c.id = p.college_id), '[]'::jsonb) end
$$;
revoke all on function qbank.admin_students_pro(text, int) from public;
grant execute on function qbank.admin_students_pro(text, int) to authenticated;

notify pgrst, 'reload schema';
