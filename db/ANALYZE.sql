-- ═══════════════════════════════════════════════════════════════════════════
--  مراجعة · التحليل الشامل للمادة
--
--  الطبقة التي كانت يدوية: بعد اكتمال الأسئلة تُقرأ المادة كلها قراءةً
--  واحدة فتخرج «عن المادة» و«طريقة الحفظ» و«الأخطاء الشائعة» — كمواد AMSU.
--  التوليد في /api/analyze (الخادم)، وهنا: الأعمدة، وقادح البُطلان،
--  ودالة القراءة.
--
--  آمن التكرار: لا drop لجدول ولا لعمود.
-- ═══════════════════════════════════════════════════════════════════════════
set search_path = qbank, public;

-- ═══ ١ · الأعمدة ═══
alter table qbank.subjects add column if not exists overview       text not null default '';
alter table qbank.subjects add column if not exists memorize       text not null default '';
alter table qbank.subjects add column if not exists mistakes       text not null default '';
alter table qbank.subjects add column if not exists name_en        text not null default '';
alter table qbank.subjects add column if not exists analysis_lang  text not null default 'ar';
alter table qbank.subjects add column if not exists analysis_notes text not null default '';
alter table qbank.subjects add column if not exists analyzed_at    timestamptz;

-- ═══ ٢ · البُطلان التلقائي ═══
/*
  ★ تحليلٌ أقدم من أسئلته يكذب على الطالب.
  «تكرر السؤال عن X في ٤ أسئلة» وقد صارت ٧، ومحور بعدّاد قديم. أي تغيير
  في أسئلة المادة يمسح analyzed_at، والواجهة ترى غيابه فتطلب التوليد من
  جديد — تلقائيًا كما اختار علي، لا بزرّ يُنسى.
*/
create or replace function qbank.invalidate_analysis()
returns trigger language plpgsql as $$
begin
  update qbank.subjects set analyzed_at = null
   where id = coalesce(new.subject_id, old.subject_id);
  return coalesce(new, old);
end $$;

drop trigger if exists questions_invalidate_analysis on qbank.questions;
create trigger questions_invalidate_analysis
  after insert or update of q, options, answer or delete on qbank.questions
  for each row execute function qbank.invalidate_analysis();

/*
  ★ لكن كتابة التحليل نفسها تُحدّث topic في الأسئلة — ولو مرّت بالقادح
  لمسحت analyzed_at الذي كُتب للتوّ، فدار التوليد بلا نهاية.
  القادح أعلاه يراقب q/options/answer فقط: تغيير المحتوى يُبطل، وتغيير
  التصنيف لا يُبطل — التصنيف جزء من التحليل لا من المادة.
*/

-- ═══ ٣ · القراءة ═══
/*
  التحليل ثقيل (جداول HTML) فلا يُحمَّل مع قائمة المواد — دالة مستقلة
  تُنادى عند فتح صفحة المادة. للجميع بلا بوابة، كما اختار علي:
  المحتوى المفتوح يجذب الطلاب أكثر مما يحمي الدفع.
*/
create or replace function qbank.subject_analysis(sid uuid)
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select jsonb_build_object(
    'overview', s.overview, 'memorize', s.memorize, 'mistakes', s.mistakes,
    'name_en', s.name_en, 'lang', s.analysis_lang,
    'analyzed_at', s.analyzed_at,
    'stale', (s.analyzed_at is null and s.q_count > 0),
    'topics', coalesce((
      select jsonb_agg(jsonb_build_object('name', t.topic, 'n', t.n) order by t.mn)
      from (select q.topic, count(*) n, min(q.ord) mn
              from qbank.questions q
             where q.subject_id = sid and q.topic <> ''
             group by q.topic) t
    ), '[]'::jsonb)
  )
  from qbank.subjects s
  where s.id = sid and (s.published = true or s.created_by = auth.uid() or qbank.is_admin())
$$;
revoke all on function qbank.subject_analysis(uuid) from public;
grant execute on function qbank.subject_analysis(uuid) to authenticated, anon;

-- تقرير موجز
select count(*) filter (where analyzed_at is not null) as "مواد_محلَّلة",
       count(*) filter (where analyzed_at is null and published) as "منشورة_بلا_تحليل"
  from qbank.subjects;
