-- بنك الأسئلة · دوال لوحة التحكم الشاملة
-- كلها security definer وتتحقق من is_admin() داخلها — لا يكفي RLS في دوال تجمع بيانات الجميع.

/* لوحة النظرة العامة: كل ما تحتاجه الشاشة في نداء واحد لا عشرة */
create or replace function qbank.admin_dashboard(days int default 14)
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select case when not qbank.is_admin() then jsonb_build_object('error','غير مخوّل')
  else jsonb_build_object(
    -- أرقام سريعة
    'kpi', jsonb_build_object(
      'students',   (select count(*) from qbank.profiles where not is_admin),
      'active_7d',  (select count(distinct user_id) from qbank.devices where last_seen > now() - interval '7 days'),
      'online',     (select count(distinct user_id) from qbank.devices where last_seen > now() - interval '4 hours'),
      'attempts',   (select count(*) from qbank.attempts),
      'avg_pct',    (select coalesce(round(avg(pct),1),0) from qbank.attempts),
      'subjects',   (select count(*) from qbank.subjects),
      'published',  (select count(*) from qbank.subjects where published),
      'questions',  (select count(*) from qbank.questions),
      'derived',    (select count(*) from qbank.questions where derived),
      'drafts',     (select count(*) from qbank.drafts where status <> 'approved'),
      'enrollments',(select count(*) from qbank.enrollments)
    ),
    -- سلسلة زمنية: اختبارات كل يوم — يوم بلا نشاط يظهر صفرًا لا يُحذف
    'series', coalesce((
      select jsonb_agg(jsonb_build_object('d', d::date, 'n', n, 'avg', a) order by d)
      from (
        select g.d,
          (select count(*) from qbank.attempts t where t.created_at::date = g.d) n,
          (select coalesce(round(avg(t.pct),1),0) from qbank.attempts t where t.created_at::date = g.d) a
        from generate_series(current_date - (days - 1), current_date, interval '1 day') g(d)
      ) x
    ), '[]'::jsonb),
    -- توزيع النتائج على خمس شرائح
    'buckets', coalesce((
      select jsonb_agg(jsonb_build_object('label', lbl, 'n', c) order by ord)
      from (
        select '٠–٤٩' lbl, 1 ord, count(*) c from qbank.attempts where pct < 50
        union all select '٥٠–٥٩', 2, count(*) from qbank.attempts where pct >= 50 and pct < 60
        union all select '٦٠–٦٩', 3, count(*) from qbank.attempts where pct >= 60 and pct < 70
        union all select '٧٠–٨٩', 4, count(*) from qbank.attempts where pct >= 70 and pct < 90
        union all select '٩٠–١٠٠', 5, count(*) from qbank.attempts where pct >= 90
      ) b
    ), '[]'::jsonb),
    -- أداء كل مادة: أين يتعثّر الطلاب فعلًا
    'subjects', coalesce((
      select jsonb_agg(row_to_json(t)) from (
        select s.id, s.name, s.icon, s.color, s.q_count, s.published, s.free, s.exam_date, s.ord,
          (select count(*) from qbank.attempts a where a.subject_id = s.id) attempts,
          (select coalesce(round(avg(a.pct),1),0) from qbank.attempts a where a.subject_id = s.id) avg_pct,
          (select count(*) from qbank.enrollments e where e.subject_id = s.id) students
        from qbank.subjects s order by s.ord, s.created_at
      ) t
    ), '[]'::jsonb),
    -- آخر النشاط: من فعل ماذا ومتى
    'recent', coalesce((
      select jsonb_agg(row_to_json(t)) from (
        select coalesce(nullif(p.name,''),'طالب') student, p.avatar, s.name subject,
               round(a.pct,1) pct, a.correct, a.total, a.created_at
        from qbank.attempts a
        join qbank.profiles p on p.id = a.user_id
        join qbank.subjects s on s.id = a.subject_id
        order by a.created_at desc limit 12
      ) t
    ), '[]'::jsonb)
  ) end
$$;

/* تفصيل مادة واحدة: توزيع أسئلتها على المحاور وما يحتاج مراجعة */
create or replace function qbank.admin_subject_stats(sid uuid)
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select case when not qbank.is_admin() then jsonb_build_object('error','غير مخوّل')
  else jsonb_build_object(
    'total',      (select count(*) from qbank.questions where subject_id = sid),
    'derived',    (select count(*) from qbank.questions where subject_id = sid and derived),
    'opts_built', (select count(*) from qbank.questions where subject_id = sid and opts_built),
    'important',  (select count(*) from qbank.questions where subject_id = sid and important),
    'no_expl',    (select count(*) from qbank.questions where subject_id = sid and expl_ar = ''),
    'topics', coalesce((
      select jsonb_agg(jsonb_build_object('topic', topic, 'n', c) order by c desc)
      from (select coalesce(nullif(topic,''),'بلا محور') topic, count(*) c
            from qbank.questions where subject_id = sid group by 1) t
    ), '[]'::jsonb)
  ) end
$$;

/* كشف المكرّر داخل مادة — يوسم ولا يحذف، والقرار للمشرف */
create or replace function qbank.admin_duplicates(sid uuid)
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select case when not qbank.is_admin() then jsonb_build_object('error','غير مخوّل')
  else coalesce((
    select jsonb_agg(jsonb_build_object('key', k, 'n', c, 'ords', ords))
    from (
      select lower(regexp_replace(q, '\s+', ' ', 'g')) k, count(*) c,
             jsonb_agg(ord order by ord) ords
      from qbank.questions where subject_id = sid
      group by 1 having count(*) > 1
    ) d
  ), '[]'::jsonb) end
$$;

notify pgrst, 'reload schema';
