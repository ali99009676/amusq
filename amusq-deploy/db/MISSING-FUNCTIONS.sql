-- AMUSQ · الدوال الناقصة — الصقه كاملًا في SQL Editor واضغط Run
-- (الجداول وRLS وis_admin منفّذة سلفًا؛ هذا يكمل دوال RPC)

create or replace function amusq.content_pack()
returns jsonb language sql stable security definer set search_path = amusq, public as $$
  select jsonb_build_object(
    'subjects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'color', s.color, 'icon', s.icon,
        'descr', s.descr, 'topics', s.topics, 'exam_date', s.exam_date,
        'free', s.free, 'ord', s.ord, 'q_count', s.q_count
      ) order by s.ord, s.created_at)
      from amusq.subjects s where s.published = true
    ), '[]'::jsonb),
    'settings', (select jsonb_build_object(
      'welcome_text', welcome_text, 'board_enabled', board_enabled
    ) from amusq.settings where id = 1),
    'fetched_at', now()
  )
$$;

-- أسئلة مادة واحدة — تُنادى عند أول فتح للمادة ثم تُخزَّن في جهاز الطالب (IndexedDB)
create or replace function amusq.subject_questions(sid uuid)
returns setof amusq.questions language sql stable security definer set search_path = amusq, public as $$
  select q.* from amusq.questions q
  join amusq.subjects s on s.id = q.subject_id
  where q.subject_id = sid and (s.published = true or amusq.is_admin())
  order by q.ord
$$;

-- الاعتماد: عملية ذرّية واحدة — إما أن تُنشأ المادة وكل أسئلتها أو لا يتغيّر شيء
-- (جسم الدالة معاملة واحدة في Postgres، وأي خطأ يُرجع كل شيء)
create or replace function amusq.approve_draft(draft_id uuid, publish boolean)
returns uuid language plpgsql security definer set search_path = amusq, public as $$
declare
  d   amusq.drafts%rowtype;
  sid uuid;
  q   jsonb;
  i   int := 0;
begin
  if not amusq.is_admin() then raise exception 'غير مخوّل'; end if;

  select * into d from amusq.drafts where id = draft_id;
  if not found then raise exception 'المسوّدة غير موجودة'; end if;

  insert into amusq.subjects (name, published)
  values (coalesce(nullif(d.name,''), d.source_name), publish)
  returning id into sid;

  for q in select * from jsonb_array_elements(d.payload) loop
    i := i + 1;
    insert into amusq.questions
      (subject_id, ord, q, options, answer, expl_ar, expl_en, translation,
       mnemonic, topic, derived, opts_built, important)
    values (
      sid, i,
      q->>'q',
      coalesce(q->'options','[]'::jsonb),
      coalesce((q->>'answer')::int, 0),
      coalesce(q->>'expl_ar',''), coalesce(q->>'expl_en',''),
      coalesce(q->>'translation',''),
      coalesce(q->'mnemonic','{}'::jsonb),
      coalesce(q->>'topic',''),
      coalesce((q->>'derived')::boolean, false),
      coalesce((q->>'opts_built')::boolean, false),
      coalesce((q->>'important')::boolean, false)
    );
  end loop;

  update amusq.drafts set status = case when publish then 'approved' else 'hidden' end,
    updated_at = now() where id = draft_id;
  return sid;
end $$;

-- جدول الطلاب في اللوحة: مرقّم صفحات كي لا ينهار مع مئات الطلاب
create or replace function amusq.admin_students(page int default 0, page_size int default 50, search text default '')
returns jsonb language sql stable security definer set search_path = amusq, public as $$
  select case when not amusq.is_admin() then jsonb_build_object('error','غير مخوّل')
  else jsonb_build_object(
    'total', (select count(*) from amusq.profiles p
              where search = '' or p.name ilike '%'||search||'%'),
    'rows', coalesce((
      select jsonb_agg(row_to_json(t)) from (
        select p.id, p.name, p.avatar, p.created_at,
          (select count(*) from amusq.enrollments e where e.user_id = p.id) as subjects,
          (select count(*) from amusq.attempts a where a.user_id = p.id) as attempts,
          (select coalesce(max(a.pct),0) from amusq.attempts a where a.user_id = p.id) as best,
          (select max(d.last_seen) from amusq.devices d where d.user_id = p.id) as last_seen
        from amusq.profiles p
        where search = '' or p.name ilike '%'||search||'%'
        order by last_seen desc nulls last
        limit page_size offset page * page_size
      ) t), '[]'::jsonb)
  ) end
$$;

-- سجلّ طالب واحد: كل محاولاته
create or replace function amusq.admin_attempts(uid uuid)
returns jsonb language sql stable security definer set search_path = amusq, public as $$
  select case when not amusq.is_admin() then jsonb_build_object('error','غير مخوّل')
  else coalesce((
    select jsonb_agg(jsonb_build_object(
      'subject', s.name, 'scope', a.scope, 'topic', a.topic,
      'correct', a.correct, 'total', a.total, 'pct', a.pct,
      'duration_s', a.duration_s, 'created_at', a.created_at
    ) order by a.created_at desc)
    from amusq.attempts a join amusq.subjects s on s.id = a.subject_id
    where a.user_id = uid
  ), '[]'::jsonb) end
$$;

-- الأرقام السريعة أعلى اللوحة
create or replace function amusq.admin_stats()
returns jsonb language sql stable security definer set search_path = amusq, public as $$
  select case when not amusq.is_admin() then jsonb_build_object('error','غير مخوّل')
  else jsonb_build_object(
    'students', (select count(*) from amusq.profiles where not is_admin),
    'active_7d', (select count(distinct user_id) from amusq.devices where last_seen > now() - interval '7 days'),
    'attempts', (select count(*) from amusq.attempts),
    'avg_pct',  (select coalesce(round(avg(pct),1),0) from amusq.attempts)
  ) end
$$;

-- لوحة المتصدرين: تجميع فقط — لا أسماء طلاب آخرين ولا تفاصيل، حفاظًا على الخصوصية
create or replace function amusq.board(lim int default 10)
returns jsonb language sql stable security definer set search_path = amusq, public as $$
  select case when not (select board_enabled from amusq.settings where id = 1)
    then jsonb_build_object('disabled', true)
  else jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(row_to_json(t)) from (
        select coalesce(nullif(p.name,''),'طالب') as name, p.avatar,
               round(max(a.pct),1) as best, count(a.id) as attempts
        from amusq.attempts a join amusq.profiles p on p.id = a.user_id
        group by p.id, p.name, p.avatar
        order by best desc, attempts desc
        limit lim
      ) t), '[]'::jsonb),
    'online', (select count(distinct user_id) from amusq.devices
               where last_seen > now() - interval '4 hours')
  ) end
$$;

-- نبضة حضور: تُنادى عند فتح المنصة — تُغذّي «المتواجدين الآن» وحدّ الأجهزة لاحقًا
create or replace function amusq.heartbeat(device_label text default '')
returns void language plpgsql security definer set search_path = amusq, public as $$
begin
  if auth.uid() is null then return; end if;
  insert into amusq.devices (user_id, label, last_seen)
  values (auth.uid(), device_label, now())
  on conflict (id) do nothing;
  -- جهاز واحد لكل (مستخدم، تسمية): نحدّث آخر ظهور بدل تكديس صفوف
  update amusq.devices set last_seen = now()
  where user_id = auth.uid() and label = device_label;
  delete from amusq.devices d where d.user_id = auth.uid()
    and d.id not in (select id from amusq.devices where user_id = auth.uid()
                     order by last_seen desc limit 10);
end $$;

-- حذف الحساب نهائيًا — شرط متجر آبل. cascade في المخطط يمسح كل بيانات صاحبه.
create or replace function amusq.delete_me()
returns void language plpgsql security definer set search_path = amusq, public as $$
begin
  if auth.uid() is null then raise exception 'لا جلسة'; end if;
  delete from auth.users where id = auth.uid();
end $$;

-- بوابة المحتوى (المرحلة ٥): هل يحق للطالب فتح هذه المادة؟
create or replace function amusq.can_access(sid uuid)
returns boolean language sql stable security definer set search_path = amusq, public as $$
  select amusq.is_admin()
    or exists (select 1 from amusq.subjects s where s.id = sid and s.free and s.published)
    or exists (select 1 from amusq.entitlements e
               where e.user_id = auth.uid() and e.expires_at > now()
                 and (e.subject_id = sid or e.kind = 'semester'))
$$;


-- إعادة تحميل ذاكرة واجهة REST كي تظهر الدوال فورًا
notify pgrst, 'reload schema';
