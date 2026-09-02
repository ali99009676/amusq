/*
  ═══════════════════════════════════════════════════════════════════
  «راجع اليوم» — الشاشة التي تعطي المنصةَ سببًا للفتح كل صباح
  ═══════════════════════════════════════════════════════════════════
  كل ما قبلها يفترض أن الطالب يعرف متى يذاكر وماذا: يفتح مادة، يختار
  اختبارًا، يضبط عددًا. وهذا افتراضٌ خاطئ — الطالب يعرف أن عليه المذاكرة
  ولا يعرف من أين يبدأ، فيؤجّل. هذه الشاشة تُجيب عن السؤال نيابةً عنه:
  «راجع اليوم: ٢٣ سؤالًا» — رقمٌ واحد، وزرٌّ واحد، وينتهي التردّد.

  والمستحقّ يُجمع من كل المواد لا من مادة: النسيان لا يحترم حدود المقرّرات.
*/

const Review = {
  /*
    بناء جلسة المراجعة: نجمع المستحقّ، ثم نجلب أسئلته من مواده.
    الجلب متوازٍ لا متسلسل — عشر مواد بالتسلسل تعني عشر رحلات متتابعة
    يراها الطالب انتظارًا، وبالتوازي رحلةً واحدة بعرضٍ أوسع.
  */
  async session(limit, now){
    const due = QBANK.progress.dueAll(now);
    if (!due.length) return { items: [], subjects: [], total: 0 };

    const cap = limit || 40;
    const take = due.slice(0, cap);
    const bySub = {};
    take.forEach(d => { (bySub[d.sid] = bySub[d.sid] || []).push(d.qid); });

    const sids = Object.keys(bySub);
    const packs = await Promise.all(sids.map(sid => QBANK.data.subjectQuestions(sid)));

    const items = [];
    const subjects = [];
    const all = QBANK.data.pack().subjects || [];
    sids.forEach((sid, i) => {
      const qs = (packs[i] && packs[i].data) || [];
      const want = {};
      bySub[sid].forEach(q => { want[q] = 1; });
      const found = qs.filter(q => want[q.id]);
      if (!found.length) return;
      const meta = all.filter(x => x.id === sid)[0];
      subjects.push({ id: sid, name: (meta && meta.name) || 'مادة', n: found.length });
      found.forEach(q => items.push(Object.assign({ _sid: sid }, q)));
    });
    return { items, subjects, total: due.length };
  },

  /*
    ★ المراجعة تُسجَّل سؤالًا سؤالًا لا في آخر الجلسة.
    جلسة المراجعة تُقطع كثيرًا — محاضرة تبدأ، مكالمة، بطارية تنفد. ولو
    انتظرنا النهاية لضاع عمل عشر دقائق وعاد السؤال نفسه غدًا كأن شيئًا
    لم يكن. الاختبار الكامل غير ذلك: له نهاية معلنة ونتيجة تُحسب.
  */
  answer(sid, qid, ok){
    QBANK.progress.review(sid, qid, ok);
    if (ok) QBANK.progress.clearWrong(sid, qid); else QBANK.progress.markWrong(sid, qid);
    QBANK.progress.markSeen(sid, qid);
  }
};
QBANK.review = Review;

/* ═══ بطاقة الرئيسية: الرقم الذي يُعيد الطالب كل يوم ═══ */
function reviewCard(){
  const due = QBANK.progress.dueAll();
  const N = QBANK.views.arNum;

  if (!due.length) {
    const after = QBANK.progress.nextDue();
    /* لا مستحقّ: لا نُخفي البطاقة بل نقول متى يعود. الفراغ يُقرأ عطلًا،
       و«عد بعد يومين» يُقرأ نظامًا يعمل لأجله في غيابه. */
    if (after === null) return null;      // لم يذاكر شيئًا بعد — لا معنى للبطاقة
    return el('div', { class:'card revcard revcard--done' }, [
      el('span', { class:'revcard__ico', 'aria-hidden':'true', text:'✓' }),
      el('div', { class:'revcard__x' }, [
        el('p', { class:'revcard__t', text:'أنهيتَ مراجعة اليوم' }),
        el('p', { class:'revcard__s', text: after === 1
          ? 'المراجعة القادمة غدًا.'
          : 'المراجعة القادمة بعد ' + N(after) + ' أيام.' })
      ])
    ]);
  }

  return el('a', { class:'card revcard', href:'#/review' }, [
    el('span', { class:'revcard__ico', 'aria-hidden':'true', text:'↻' }),
    el('div', { class:'revcard__x' }, [
      el('p', { class:'revcard__t', text:'راجع اليوم: ' + N(due.length) + ' سؤالًا' }),
      el('p', { class:'revcard__s', text:'أسئلة حان موعد استرجاعها — قبل أن تنساها.' })
    ]),
    el('span', { class:'revcard__go', 'aria-hidden':'true', text:'←' })
  ]);
}

/* ═══ الشاشة ═══ */
let revState = null;   // { items, i, done, right }

function revRunner(rerender){
  const st = revState;
  const item = st.items[st.i];

  if (!item) {
    /* النهاية: نقول ما أُنجز ومتى يعود. ولا نعرض «أعد» — إعادة ما
       راجعتَه الآن تُفسد التباعد نفسه، وهو كل الفكرة. */
    const N = QBANK.views.arNum;
    const after = QBANK.progress.nextDue();
    return el('div', { class:'card stack', style:'text-align:center' }, [
      el('span', { class:'empty__ico', 'aria-hidden':'true', text:'✓' }),
      el('p', { class:'empty__title', text:'اكتملت مراجعة اليوم' }),
      el('p', { class:'empty__text', text:
        'راجعتَ ' + N(st.done) + ' سؤالًا، أصبتَ ' + N(st.right) + '.' +
        (after !== null ? ' والقادمة بعد ' + N(after) + (after === 1 ? ' يوم.' : ' أيام.') : '') }),
      el('a', { class:'btn btn--block', href:'#/', text:'الرئيسية' })
    ]);
  }

  const answered = st.answers[st.i];
  const opts = el('div', { class:'stack q__opts' }, (item.options || []).map((opt, oi) => {
    let cls = 'opt', mark = '';
    if (answered !== undefined && answered !== null) {
      if (oi === item.answer) { cls += ' is-answer'; mark = '✓'; }
      else if (oi === answered) { cls += ' is-wrong'; mark = '✗'; }
    }
    const b = el('button', { class:cls, type:'button',
      disabled: (answered !== undefined && answered !== null) ? true : null }, [
      el('span', { class:'opt__l', 'aria-hidden':'true', text: QBANK.views.optLetter(oi) }),
      el('span', { class:'ltr', text: opt }),
      el('span', { class:'opt__mark', 'aria-hidden':'true', text: mark })
    ]);
    b.addEventListener('click', () => {
      if (st.answers[st.i] !== null && st.answers[st.i] !== undefined) return;
      const ok = oi === item.answer;
      st.answers[st.i] = oi;
      st.done += 1; if (ok) st.right += 1;
      QBANK.review.answer(item._sid, item.id, ok);
      rerender();
    });
    return b;
  }));

  const next = el('button', { class:'btn btn--block', type:'button', text:'التالي ←' });
  next.addEventListener('click', () => { st.i += 1; rerender(); });

  const N = QBANK.views.arNum;
  return el('div', { class:'stack' }, [
    el('div', { class:'row' }, [
      el('span', { class:'badge num', text: N(st.i + 1) + ' / ' + N(st.items.length) }),
      el('span', { class:'spacer' }),
      el('span', { class:'badge badge--ok num', text:'✓ ' + N(st.right) })
    ]),
    el('div', { class:'card stack q' }, [
      el('p', { class:'ltr q__text', text: item.q }),
      opts,
      (answered !== undefined && answered !== null && item.expl_ar)
        ? el('p', { class:'field__hint', text: item.expl_ar }) : null,
      (answered !== undefined && answered !== null && QBANK.explain)
        ? QBANK.explain.button(item, answered) : null,
      (answered !== undefined && answered !== null && QBANK.shareCard)
        ? QBANK.shareCard.button(item) : null
    ]),
    (answered !== undefined && answered !== null) ? next : null
  ]);
}

const ViewReview = {
  title:'راجع اليوم',
  view(){
    const box = el('div', { class:'stack' });
    const rerender = () => { box.innerHTML = ''; box.appendChild(revRunner(rerender)); };

    if (revState && revState.items.length) {
      rerender();
      return QBANK.views.page('راجع اليوم', null, [box]);
    }

    const due = QBANK.progress.dueAll();
    if (!due.length) {
      const after = QBANK.progress.nextDue();
      return QBANK.views.page('راجع اليوم', null, [
        QBANK.views.empty('✓', 'لا مراجعة اليوم',
          after === null
            ? 'ابدأ اختبارًا في أي مادة، وسيبني لك النظام جدول مراجعتك تلقائيًا.'
            : 'عد بعد ' + QBANK.views.arNum(after) + (after === 1 ? ' يوم.' : ' أيام.'))
      ]);
    }

    box.appendChild(el('p', { class:'page__sub', text:'جارٍ تجهيز مراجعتك…' }));
    QBANK.review.session(40).then(sess => {
      if (!box.isConnected) return;
      if (!sess.items.length) {
        box.innerHTML = '';
        box.appendChild(QBANK.views.empty('⇣', 'تعذّر جلب أسئلة المراجعة',
          'افتح المواد مرة بإنترنت ثم عد — المستحقّ محفوظ ولا يضيع.'));
        return;
      }
      revState = { items: sess.items, i: 0, done: 0, right: 0,
                   answers: new Array(sess.items.length).fill(null) };
      rerender();
    });

    return QBANK.views.page('راجع اليوم',
      'أسئلة حان موعد استرجاعها — من كل موادك.', [box]);
  },
  _reset(){ revState = null; },
  _get(){ return revState; }
};
QBANK.views.ViewReview = ViewReview;
QBANK.views.reviewCard = reviewCard;
