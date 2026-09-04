-- ═══════════════════════════════════════════════════════════════════
-- لوحة المتصدرين الموحَّدة: كل الجامعات · جامعة بعينها · مادة بعينها
-- ═══════════════════════════════════════════════════════════════════
-- المبدأ الحاكم: كل رقم يراه الطالب رقمٌ حقيقي. لا عدّاد مضخَّم ولا اسمٌ
-- وهمي؛ الرقم الصغير يُخفى في الواجهة ولا يُكبَّر هنا.
--
-- لماذا القاعدة لا Redis؟ المرجع (AMSU) بُني على Upstash لأنه بلا حسابات
-- ولا قاعدة. هنا كل شيء موجود أصلًا: المحاولات في attempts، والأسماء في
-- profiles بمعرّف user_id لا بالاسم (الأسماء تتكرّر)، والحضور في devices.
-- مخزنٌ ثانٍ يعني نسختين من الحقيقة تتباعدان، ومفتاحًا جديدًا في بيئة
-- الخادم. الدالة الواحدة هنا تقرأ المصدر نفسه الذي يُكتب عند كل اختبار.
--
-- ═══ ما يُحسب ═══
-- tries (المحاولات — الترتيب الافتراضي: التصدّر بكثرة التدريب يُنافَس عليه،
-- و«١٠٠٪ في اختبارٍ من سؤال» حظٌّ لا يُنافَس)، best (أفضل نسبة)، questions،
-- correct، accuracy = round(correct×100/questions) تُحسب ولا تُخزَّن (قيمتان
-- مخزّنتان تتناقضان يومًا)، seconds، last.
--
-- ═══ «المتصلون الآن» ═══
-- بطلب علي: العدد خلال ٤ ساعات، ويُقال للطالب أنه «الآن». الحضور من نبضة
-- الجهاز كل دقيقة (devices.last_seen)، ولكل مادة عدّادها: النبضة تحمل
-- معرّف المادة التي يذاكرها الطالب هذه اللحظة.

-- ═══ ١) المادة في نبضة الحضور ═══
alter table qbank.devices add column if not exists subject_id uuid references qbank.subjects(id) on delete set null;
create index if not exists devices_subject_seen_idx on qbank.devices (subject_id, last_seen desc);

/*
  ★ وسيطٌ خامس بقيمة افتراضية يُنشئ overload يُربك PostgREST عند النداء
  بأربعة وسائط (PGRST203)، فنُسقط التوقيع القديم أولًا. النداء القديم
  بأربعة وسائط مسمّاة يظل يعمل: الخامس يأخذ افتراضه.
*/
drop function if exists qbank.heartbeat(text, text, text, text);
create or replace function qbank.heartbeat(
  device_label text default '',
  p_place   text default '',
  p_kind    text default '',
  p_country text default '',
  p_subject uuid default null
) returns void language plpgsql security definer set search_path = qbank, public as $$
declare
  lbl text := left(coalesce(device_label, ''), 60);
begin
  if auth.uid() is null then return; end if;
  update qbank.devices
     set last_seen = now(),
         place   = left(coalesce(p_place, ''), 120),
         kind    = left(coalesce(p_kind, ''), 12),
         country = upper(left(coalesce(p_country, ''), 2)),
         subject_id = p_subject
   where user_id = auth.uid() and label = lbl;
  if not found then
    insert into qbank.devices (user_id, label, last_seen, place, kind, country, subject_id)
    values (auth.uid(), lbl, now(), left(coalesce(p_place,''), 120), left(coalesce(p_kind,''), 12),
            upper(left(coalesce(p_country,''), 2)), p_subject);
  end if;
  delete from qbank.devices d
   where d.user_id = auth.uid()
     and d.id not in (select id from qbank.devices where user_id = auth.uid()
                       order by last_seen desc limit 10);
end $$;
revoke all on function qbank.heartbeat(text, text, text, text, uuid) from public;
grant execute on function qbank.heartbeat(text, text, text, text, uuid) to authenticated;

-- ═══ ٢) مرشّح الأسماء — في الخادم لا في المتصفح وحده ═══
/*
  اللوحة عامة والاسم يظهر لكل الطلاب. الطالب قد يكتب اسمه في ملفه من
  المتصفح مباشرة متجاوزًا مرشّح الواجهة، فالحكم هنا: الاسم المحظور لا
  يغادر القاعدة أصلًا — يخرج مقنَّعًا «اسم محظور» ومعه blocked=true.

  ثلاث طبقات: تطبيعٌ يُبطل الحيل (تشكيل، تطويل، توحيد الحروف، طيّ التكرار،
  أرقام بدل حروف، إزالة الرموز والفراغات)، ثم قائمة استثناء تُفحص أولًا
  وتغلب (حجب اسم طالب حقيقي أسوأ من مرور مسيء واحد)، ثم جذور تُطابَق
  ولو داخل الاسم، ثم كلمات كاملة لا تُطابَق إلا وحدها.
*/
create table if not exists qbank.name_rules (
  word text primary key,
  kind text not null check (kind in ('allow','root','exact'))
);
insert into qbank.name_rules (word, kind) values
  ('عمر','allow'),('عمرو','allow'),('عمار','allow'),('معتز','allow'),('خوله','allow'),('زبير','allow'),
  ('زبيده','allow'),('حسان','allow'),('بسام','allow'),('قصي','allow'),('لوط','allow'),('شعيب','allow'),
  ('نعمه','allow'),('طعمه','allow'),('مكسيم','allow'),('كسري','allow'),('باكستان','allow'),('اسامه','allow'),
  ('حمزه','allow'),('معاذ','allow'),('سهيل','allow'),('منير','allow'),('شرمين','allow'),
  ('شرموط','root'),('شرمط','root'),('منيوك','root'),('منيك','root'),('عرص','root'),('خول','root'),
  ('زبي','root'),('كسم','root'),('كساخ','root'),('طيزك','root'),('قحب','root'),('عاهر','root'),
  ('fuck','root'),('fuk','root'),('shit','root'),('bitch','root'),('cunt','root'),('dick','root'),
  ('pussy','root'),('nigg','root'),('sex','root'),('porn','root'),('whore','root'),('slut','root'),
  ('كس','exact'),('زب','exact'),('طيز','exact'),('كلب','exact'),('حمار','exact'),('خنزير','exact'),
  ('admin','exact'),('مشرف','exact'),('الاداره','exact'),('root','exact'),('ass','exact'),('cock','exact'),
  ('gay','exact'),('nazi','exact'),('hitler','exact'),('isis','exact'),('داعش','exact')
on conflict (word) do nothing;

/* التطبيع: كل الحيل تُردّ إلى شكلٍ واحد يُقارَن */
create or replace function qbank.name_norm(t text)
returns text language sql immutable strict as $$
  select regexp_replace(                                   -- طيّ تكرار الحرف: كسسسس ← كس
    regexp_replace(
      translate(
        regexp_replace(lower(coalesce(t,'')), '[ً-ْـ]', '', 'g'),   -- تشكيل وتطويل
        'أإآٱىةؤئ٠١٢٣٤٥٦٧٨٩',
        'اااايهوي0123456789'
      ),
      '[^a-z0-9؀-ۿ]', '', 'g'),                  -- رموز وفراغات ونقاط بين الحروف
    '(.)\1+', '\1', 'g')
$$;

/*
  التطبيعان الثاني والثالث: أرقامٌ بدل حروف. قواعد العربية (3ع 7ح 5خ 9ق 2ا 8غ)
  تتضارب مع اللاتينية (1i 0o 4a 3e 5s 7t)، فيُجرَّب كلٌّ على حدة والمقارنة
  بالثلاثة معًا.
*/
create or replace function qbank.name_norm_ar(t text)
returns text language sql immutable strict as $$
  select translate(qbank.name_norm(t), '375928', 'عحخقاغ')
$$;
create or replace function qbank.name_norm_en(t text)
returns text language sql immutable strict as $$
  select translate(qbank.name_norm(t), '104357', 'ioaest')
$$;

/* stable لا immutable: يقرأ جدول القواعد */
create or replace function qbank.name_blocked(t text)
returns boolean language plpgsql stable as $$
declare
  n1 text := qbank.name_norm(t);
  n2 text := qbank.name_norm_ar(t);
  n3 text := qbank.name_norm_en(t);
  r record;
begin
  if n1 is null or n1 = '' then return false; end if;
  -- ★ الاستثناء أولًا ويغلب: «عمر» يحوي جذرًا و«خولة» أخرى و«مكسيم» ثالثًا
  if exists (select 1 from qbank.name_rules where kind = 'allow' and word in (n1, n2, n3)) then
    return false;
  end if;
  for r in select word, kind from qbank.name_rules where kind <> 'allow' loop
    if r.kind = 'root' then
      if position(r.word in n1) > 0 or position(r.word in n2) > 0 or position(r.word in n3) > 0 then return true; end if;
    else
      if r.word in (n1, n2, n3) then return true; end if;
    end if;
  end loop;
  return false;
end $$;
revoke all on function qbank.name_blocked(text) from public;
grant execute on function qbank.name_blocked(text) to anon, authenticated;

/* اسم العرض: مقنَّع إن حُجب، و«طالب» إن فرغ — النص المسيء لا يخرج */
create or replace function qbank.name_shown(t text)
returns text language sql stable as $$
  select case when qbank.name_blocked(t) then 'اسم محظور'
              else coalesce(nullif(btrim(t), ''), 'طالب') end
$$;

-- ═══ ٣) اللوحة الموحَّدة ═══
/*
  دالة واحدة لثلاثة نطاقات:
    p_scope = 'all'         → كل الجامعات
    p_scope = 'university'  → جامعة p_id (وإن غاب p_id: جامعة الطالب نفسه)
    p_scope = 'subject'     → مادة p_id
  الرد شكلٌ واحد كي تُبنى الشاشة مرة: board, me, summary, champions, feed,
  universities (للاختيار), subject (في نطاق المادة), online_window_h = 4.
*/
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
  delete from _rows;
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
         exists (select 1 from qbank.devices d where d.user_id = p.id and d.last_seen > now() - win)
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
revoke all on function qbank.board_full(text, uuid, int) from public;
grant execute on function qbank.board_full(text, uuid, int) to anon, authenticated;

-- ═══ ٤) «المتصلون الآن» في مادة — نداء خفيف لبطاقة المادة وصفحتها ═══
create or replace function qbank.subject_online(p_subject uuid)
returns int language sql stable security definer set search_path = qbank, public as $$
  select count(distinct d.user_id)::int from qbank.devices d
   where d.subject_id = p_subject and d.last_seen > now() - interval '4 hours'
$$;
revoke all on function qbank.subject_online(uuid) from public;
grant execute on function qbank.subject_online(uuid) to anon, authenticated;

/* وكلّ المواد دفعةً واحدة — بطاقات الرئيسية لا تنادي عشرين مرة */
create or replace function qbank.subjects_online()
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select coalesce(jsonb_object_agg(subject_id, n), '{}'::jsonb)
    from (select d.subject_id, count(distinct d.user_id) n from qbank.devices d
           where d.subject_id is not null and d.last_seen > now() - interval '4 hours'
           group by d.subject_id) t
$$;
revoke all on function qbank.subjects_online() from public;
grant execute on function qbank.subjects_online() to anon, authenticated;

notify pgrst, 'reload schema';

-- ═══ تحقّق ═══
select qbank.name_blocked('عمر') as عمر_يمر, qbank.name_blocked('خولة') as خولة_تمر,
       qbank.name_blocked('شرمووووط') as حيلة_تُحجب, qbank.name_blocked('ش ر م و ط') as فراغات_تُحجب,
       qbank.name_blocked('f.u.c.k') as نقاط_تُحجب, qbank.name_blocked('ADMIN') as admin_يُحجب,
       (qbank.board_full('all', null, 10))->'summary' as ملخص;
