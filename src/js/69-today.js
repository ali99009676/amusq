/*
  ═══════════════════════════════════════════════════════════════════
  «ورقة اليوم» — بطل الرئيسية
  ═══════════════════════════════════════════════════════════════════
  كانت الرئيسية تبدأ بثلاثة شرائط رمادية متراكمة (جامعتي، راجع اليوم،
  الجوال…) ثم بطاقات المواد — كلّها بالوزن نفسه، فلا يعرف الطالب ما
  الأهمّ. البطلُ يجيب عن ثلاثة أسئلة يفتح الطالبُ المنصةَ لأجلها:
  كم عليّ اليوم؟ متى اختباري؟ أين وصلت؟ — ثم زرٌّ واحد.

  ★ التوقيع: صفّ فقاعات ورقة الإجابة (OMR).
  عشر فقاعات، تمتلئ بقدر ما مرّ عليه من بنكه — الرمزُ نفسه الذي يظلّل
  الطالب فقاعاته في قاعة الاختبار. لا شريط تقدّم عام، بل أداةُ المادّة.
*/

const Today = {
  /* التحية بساعة الجهاز: «صباح الخير» في المساء يفضح أن لا أحد هنا */
  greet(now){
    const h = (now || new Date()).getHours();
    if (h < 12) return 'صباح الخير';
    if (h < 18) return 'مساء الخير';
    return 'سهرة موفّقة';
  },
  /* اسمه الأول من الملف المخبَّأ — البطل لا ينتظر الشبكة ليقول مرحبًا */
  firstName(){
    const u = QBANK.api.user();
    const p = QBANK.store.get('profile', null);
    const n = (p && u && p.uid === u.id && p.name) ? String(p.name).trim() : '';
    return n.split(/\s+/)[0] || '';
  },
  dateLine(now){
    const d = now || new Date();
    try {
      return d.toLocaleDateString('ar-SA-u-ca-gregory-nu-arab', { weekday:'long', day:'numeric', month:'long' });
    } catch(e){ return ''; }
  },

  /*
    حال الطالب في كلمة: ما يُنجَز الآن. الترتيب هو الأولوية:
    اختبارٌ غدًا أهمّ من مستحقّ، والمستحقّ أهمّ من «ابدأ».
  */
  state(){
    const V = QBANK.views;
    const subs = (QBANK.data.pack().subjects || []);
    const mineIds = V.mySubjects();
    const mine = subs.filter(s => mineIds.indexOf(s.id) !== -1);
    const pool = mine.length ? mine : subs;
    if (!pool.length) return null;

    const due = QBANK.progress.dueAll().length;
    const next = QBANK.progress.nextDue();

    /* أقرب اختبارٍ لم يمضِ */
    let exam = null;
    pool.forEach(s => {
      const d = V.daysLeft(s.exam_date);
      if (d === null || d < 0) return;
      if (!exam || d < exam.days) exam = { name: s.name, days: d, id: s.id };
    });

    /* الإتقان: ما مرّ عليه من أسئلة مواده كلّها */
    let total = 0, seen = 0;
    pool.forEach(s => {
      const q = Number(s.q_count) || 0; total += q;
      seen += Math.round(QBANK.progress.pctDone(s.id, q) * q / 100);
    });
    const pct = total ? Math.round(seen / total * 100) : 0;

    const started = seen > 0 || due > 0 || next !== null;
    return { due, next, exam, pct, total, seen, started, first: pool[0] };
  },

  /* العنوان الكبير — رقمٌ واحد وفعلٌ واحد */
  headline(st){
    const N = QBANK.views.arNum;
    if (st.exam && st.exam.days <= 1)
      return { t: 'اختبار ' + st.exam.name + (st.exam.days === 0 ? ' اليوم' : ' غدًا'),
               s: st.due ? N(st.due) + ' سؤالًا تعثّرت فيها تنتظرك — راجعها قبل أن تدخل.' : 'راجع أصعب أسئلتك قبل أن تدخل.',
               href: st.due ? '#/review' : '#/subject/' + st.exam.id, btn: st.due ? 'راجع الآن' : 'افتح المادة' };
    if (st.due)
      return { t: N(st.due) + ' سؤالًا تنتظر مراجعتك', s: 'حان موعد استرجاعها — خمس دقائق تكفي قبل أن تنساها.',
               href: '#/review', btn: 'راجع اليوم' };
    if (st.next !== null)
      return { t: 'أنهيتَ مراجعة اليوم', s: st.next === 1 ? 'القادمة غدًا — والآن اختبر نفسك في مادة.' : 'القادمة بعد ' + N(st.next) + ' أيام — والآن اختبر نفسك في مادة.',
               href: '#/subject/' + st.first.id, btn: 'افتح ' + st.first.name };
    return { t: 'ابدأ بأول سؤال', s: 'كل ما تجيب عنه يدخل جدول مراجعتك، ونذكّرك به في وقته.',
             href: '#/subject/' + st.first.id, btn: 'ابدأ ' + st.first.name };
  }
};
QBANK.today = Today;

/* ═══ صفّ الفقاعات: عشر فقاعات، الممتلئة منها بقدر الإتقان ═══ */
function bubbleRow(pct){
  const filled = Math.round(pct / 10);
  const row = el('span', { class:'omr', role:'img', 'aria-label':'مرّ عليك ' + QBANK.views.arNum(pct) + '٪ من أسئلتك' });
  for (let i = 0; i < 10; i++)
    row.appendChild(el('i', { class:'omr__b' + (i < filled ? ' is-on' : ''), style:'--i:' + i }));
  return row;
}

function todayHero(){
  const st = Today.state();
  if (!st) return null;
  const N = QBANK.views.arNum;
  const h = Today.headline(st);
  const name = Today.firstName();

  const meta = el('div', { class:'today__meta' }, [
    el('span', { class:'today__hi', text: Today.greet() + (name ? '، ' + name : '') }),
    el('span', { class:'today__date', text: Today.dateLine() })
  ]);

  const facts = el('div', { class:'today__facts' }, [
    el('span', { class:'today__fact' }, [ bubbleRow(st.pct),
      el('span', { class:'today__fl', text: st.total ? N(st.pct) + '٪ من ' + N(st.total) + ' سؤالًا مرّت عليك' : 'لا أسئلة بعد' }) ]),
    st.exam ? el('a', { class:'today__fact today__exam', href:'#/subject/' + st.exam.id }, [
      el('span', { class:'today__fi', 'aria-hidden':'true', text:'◷' }),
      el('span', { class:'today__fl', text: 'أقرب اختبار: ' + st.exam.name + ' ' +
        (st.exam.days === 0 ? 'اليوم' : st.exam.days === 1 ? 'غدًا' : 'بعد ' + N(st.exam.days) + ' أيام') })
    ]) : null
  ]);

  return el('section', { class:'today', 'aria-label':'ورقة اليوم' }, [
    meta,
    el('h2', { class:'today__t', text: h.t }),
    el('p', { class:'today__s', text: h.s }),
    facts,
    el('div', { class:'today__act' }, [
      el('a', { class:'btn', href: h.href, text: h.btn + ' ←' }),
      el('a', { class:'btn btn--ghost btn--sm today__more', href:'#/account/activity', text:'نشاطي' })
    ])
  ]);
}
QBANK.views.todayHero = todayHero;
