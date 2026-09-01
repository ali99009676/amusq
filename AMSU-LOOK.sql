-- هوية AMSU: بطاقة المادة تعرض الاسم الإنجليزي تحت العربي (كما في AMSU).
-- name_en يكتبه المحلّل تلقائيًا، وcontent_pack لم يكن يرجعه — هذا كل ما يضيفه هذا الملف.

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
      'welcome_text', welcome_text, 'board_enabled', board_enabled
    ) from qbank.settings where id = 1),
    'fetched_at', now()
  )
$$;
