/*
  واجهة الاختبار التجريبي — المادة مثبّتة من مسار الدخول فلا خطوة اختيار.
  المحرك في 24-exam.js؛ هنا الشاشات الثلاث: الإعداد ← الأسئلة ← النتيجة.
*/
let examState = null;   // {exam, sub, timerId, secondsLeft}

function examSetup(sub, questions){
  const prog = QBANK.progress.forSubject(sub.id);
  const topics = Array.from(new Set(questions.map(q => q.topic || 'عام')));

  const scopeSel = el('select', { class:'input', id:'exScope', 'aria-label':'نطاق الاختبار' }, [
    el('option', { value:'all', text:'كل الأسئلة (' + questions.length + ')' }),
    el('option', { value:'important', text:'الأسئلة المهمة (' + questions.filter(q => q.important).length + ')' }),
    questions.some(q => q.exam_tag)
      ? el('option', { value:'exam_tag', text:'التي جاءت في اختبارات سابقة (' + questions.filter(q => q.exam_tag).length + ')' })
      : null,
    el('option', { value:'wrong', text:'أخطائي السابقة (' + Object.keys(prog.wrong).length + ')' })
  ].concat(topics.map(t => el('option', { value:'topic:' + t, text:'قسم: ' + t }))));

  const timerSel = el('select', { class:'input', id:'exTimer', 'aria-label':'المؤقت' }, [
    el('option', { value:'0', text:'بلا مؤقت' }),
    el('option', { value:'10', text:'١٠ دقائق' }),
    el('option', { value:'20', text:'٢٠ دقيقة' }),
    el('option', { value:'45', text:'٤٥ دقيقة' })
  ]);

  // التصحيح الفوري بعد كل سؤال هو الافتراضي
  const modeSel = el('select', { class:'input', id:'exMode', 'aria-label':'نمط التصحيح' }, [
    el('option', { value:'instant', text:'تصحيح فوري بعد كل سؤال (الافتراضي)' }),
    el('option', { value:'end', text:'التصحيح بعد الانتهاء' })
  ]);

  const start = el('button', { class:'btn btn--block', type:'button', text:'ابدأ الاختبار' });
  start.addEventListener('click', () => {
    const sv = scopeSel.value;
    const opts = {
      scope: sv.indexOf('topic:') === 0 ? 'topic' : sv,
      topic: sv.indexOf('topic:') === 0 ? sv.slice(6) : '',
      mode: modeSel.value,
      timerMin: parseInt(timerSel.value, 10),
      wrongMap: prog.wrong
    };
    const exam = QBANK.exam.create(questions, opts);
    if (!exam.items.length) { QBANK.toast('لا أسئلة في هذا النطاق'); return; }
    examState = { exam, sub, secondsLeft: opts.timerMin * 60, timerId: null };
    if (opts.timerMin) {
      examState.timerId = setInterval(() => {
        examState.secondsLeft--;
        const t = document.getElementById('exClock');
        if (t) {
          t.textContent = Math.floor(examState.secondsLeft / 60) + ':' + String(examState.secondsLeft % 60).padStart(2,'0');
          t.classList.toggle('is-low', examState.secondsLeft <= 60);
        }
        if (examState.secondsLeft <= 0) finishExam();   // انتهى الوقت: تسليم تلقائي
      }, 1000);
    }
    QBANK.router.render(location.hash);
  });

  return el('div', { class:'card stack' }, [
    el('h2', { text:'إعداد الاختبار' }),
    el('label', { class:'field', style:'margin:0' }, [ el('span', { class:'field__label', text:'النطاق' }), scopeSel ]),
    el('label', { class:'field', style:'margin:0' }, [ el('span', { class:'field__label', text:'المؤقت' }), timerSel ]),
    el('label', { class:'field', style:'margin:0' }, [ el('span', { class:'field__label', text:'التصحيح' }), modeSel ]),
    el('p', { class:'field__hint', text:'الأسئلة التي أخطأت فيها سابقًا لها أولوية الظهور، والخيارات تُخلط في كل مرة.' }),
    start
  ]);
}

function finishExam(){
  const st = examState;
  if (!st || st.exam.finished) return;
  if (st.timerId) clearInterval(st.timerId);
  st.result = QBANK.exam.finish(st.exam);
  // تسجيل المحاولة: محليًا فورًا، وللحساب في الخلفية
  QBANK.progress.recordExam(st.sub.id, st.result.pct);
  st.result.wrongIds.forEach(qid => QBANK.progress.markWrong(st.sub.id, qid));
  st.exam.items.forEach((it, i) => {
    if (st.exam.answers[i] && st.exam.answers[i].correct) QBANK.progress.clearWrong(st.sub.id, it.id);
  });
  /*
    ★ كل سؤال أُجيب عنه يدخل جدول المراجعة.
    هنا لا في لحظة الضغط: الطالب قد يرجع ويغيّر إجابته قبل التسليم،
    والنتيجة النهائية هي الحكم. والذي لم يُجب عنه لا يُجدوَل — عدم
    الإجابة ليس خطأً في الاسترجاع، هو نفاد وقت أو ملل.
  */
  st.exam.items.forEach((it, i) => {
    const a = st.exam.answers[i];
    if (a) QBANK.progress.review(st.sub.id, it.id, !!a.correct);
  });
  if (QBANK.api.user()) QBANK.api.rest('attempts', { method:'POST', body: JSON.stringify({
    user_id: QBANK.api.user().id, subject_id: st.sub.id, scope:'all', topic:'',
    correct: st.result.correct, total: st.result.total, pct: st.result.pct,
    duration_s: st.result.duration_s }) });
  QBANK.router.render(location.hash);
}

/*
  ═══ لوحة التغذية الراجعة بعد الإجابة ═══
  كان الشرح سطرَ تلميحٍ رمادي تحت الخيارات. الآن لوحة: حكمٌ واضح (أصبت /
  أخطأت — والصحيح هو ب)، ثم تبويبات لما وُجد: شرح عربي، English، ترجمة،
  بطاقة حفظ. لا تبويب لما لا محتوى له — والسؤال بلا شرح لا يُظهر لوحةً
  فارغة، بل الحكم وحده.
*/
function examFeedback(item, answered, st){
  const right = answered.choice === item.correct;
  const N = QBANK.views.arNum;
  /* داخل التطبيق: «أصبت» تُحسّ في اليد قبل أن تُقرأ — وفي المتصفح لا شيء يحدث */
  if (QBANK.native && QBANK.native.active) QBANK.native.haptic(right ? 'success' : 'error');
  const panes = [];
  if (item.expl_ar) panes.push(['شرح', el('p', { class:'exfb__p', text: item.expl_ar })]);
  if (item.expl_en) panes.push(['English', el('p', { class:'exfb__p ltr', text: item.expl_en })]);
  if (item.translation) panes.push(['ترجمة', el('p', { class:'exfb__p', text: item.translation })]);
  const m = item.mnemonic;
  if (m && (m.cue || m.key)) panes.push(['بطاقة حفظ', el('div', { class:'exfb__memo' }, [
    el('span', { class:'badge', text:'الكلمة الدالة' }), el('b', { class:'ltr', text: m.cue || '—' }),
    el('span', { 'aria-hidden':'true', text:'←' }),
    el('span', { class:'badge badge--ok', text:'المفتاح' }), el('b', { class:'ltr', text: m.key || '—' }),
    m.link ? el('p', { class:'exfb__p', text:'🔗 ' + m.link }) : null ])]);

  const box = el('section', { class:'exfb ' + (right ? 'exfb--ok' : 'exfb--bad'), 'aria-live':'polite' });
  box.appendChild(el('div', { class:'exfb__h' }, [
    el('span', { class:'exfb__ico', 'aria-hidden':'true', text: right ? '✓' : '✗' }),
    el('div', { class:'exfb__x' }, [
      el('b', { class:'exfb__t', text: right ? 'أصبت' : 'أخطأت' }),
      el('span', { class:'exfb__s', text: right
        ? 'إجابتك (' + QBANK.views.optLetter(item.correct) + ') صحيحة. أحسنت.'
        : 'الإجابة الصحيحة: (' + QBANK.views.optLetter(item.correct) + '). اقرأ لماذا كي لا يتكرّر.' })
    ])
  ]));
  if (panes.length){
    const tabs = el('div', { class:'exfb__tabs', role:'tablist' });
    const body = el('div', { class:'exfb__body' });
    panes.forEach((pn, i) => {
      const b = el('button', { class:'exfb__tab', type:'button', role:'tab', 'aria-selected': i === 0 ? 'true' : 'false', text: pn[0] });
      b.addEventListener('click', () => {
        tabs.querySelectorAll('.exfb__tab').forEach(x => x.setAttribute('aria-selected', 'false'));
        b.setAttribute('aria-selected', 'true');
        body.innerHTML = ''; body.appendChild(pn[1]);
      });
      tabs.appendChild(b);
    });
    body.appendChild(panes[0][1]);
    box.appendChild(tabs); box.appendChild(body);
  }
  const acts = el('div', { class:'exfb__acts' }, [
    (!right && QBANK.explain)
      ? QBANK.explain.button({ id:item.id, q:item.q, options:item.options, answer:item.correct, topic:item.topic }, answered.choice) : null,
    QBANK.shareCard ? QBANK.shareCard.button({ id:item.id, q:item.q, options:item.options, _sid: st.sub.id }) : null
  ]);
  if (acts.children.length) box.appendChild(acts);
  return box;
}

function examRunner(){
  const st = examState;
  const exam = st.exam;
  const item = exam.items[exam.i];
  const answered = exam.answers[exam.i];
  const N = QBANK.views.arNum;

  const opts = el('div', { class:'stack q__opts' }, item.options.map((opt, oi) => {
    let cls = 'opt', mark = '';
    if (answered && exam.mode === 'instant') {
      // فوري: اللون والأيقونة معًا — ✓ للصحيح و ✗ للاختيار الخاطئ
      if (oi === item.correct) { cls += ' is-answer'; mark = '✓'; }
      else if (oi === answered.choice) { cls += ' is-wrong'; mark = '✗'; }
    } else if (answered && answered.choice === oi) { cls += ' is-answer'; mark = '●'; }
    const b = el('button', { class: cls, type:'button', disabled: answered ? true : null }, [
      el('span', { class:'opt__l', 'aria-hidden':'true', text: QBANK.views.optLetter(oi) }),
      el('span', { class:'ltr opt__t', text: opt }),
      el('span', { class:'opt__mark', 'aria-hidden':'true', text: mark })
    ]);
    b.addEventListener('click', () => {
      QBANK.exam.answer(exam, oi);
      QBANK.router.render(location.hash);
    });
    return b;
  }));

  const answeredCount = exam.answers.filter(a => a !== null).length;
  const total = exam.items.length;
  /*
    ★ رأس الاختبار: شريط تقدّم بعرض البطاقة، ثم «سؤال ٣ من ٢٠» والمحور
    والمؤقّت في سطرٍ واحد. كانت هذه المعلومات مبعثرة في شريط التنقّل
    أسفل الصفحة — والطالب ينظر إلى أعلى السؤال لا إلى ما تحته.
  */
  const head = el('header', { class:'exam__top' }, [
    el('div', { class:'exam__bar', role:'progressbar', 'aria-valuemin':'0', 'aria-valuemax': String(total), 'aria-valuenow': String(answeredCount) }, [
      el('i', { style:'width:' + Math.round(answeredCount / total * 100) + '%' }) ]),
    el('div', { class:'exam__meta' }, [
      el('span', { class:'exam__n' }, [ el('b', { class:'num', text: N(exam.i + 1) }), el('span', { text:' من ' + N(total) }) ]),
      item.topic ? el('span', { class:'badge', text: item.topic }) : null,
      item.important ? el('span', { class:'badge badge--warn', text:'مهم' }) : null,
      el('span', { class:'spacer' }),
      st.secondsLeft ? el('span', { class:'timer badge num exam__clock', id:'exClock',
        text: Math.floor(st.secondsLeft / 60) + ':' + String(st.secondsLeft % 60).padStart(2,'0') }) : null
    ])
  ]);

  const nav = el('div', { class:'row exam__nav' }, [
    el('button', { class:'btn btn--ghost btn--sm', type:'button', id:'exPrev',
      disabled: exam.i === 0 ? true : null, text:'→ السابق' }),
    el('span', { class:'spacer' }),
    el('span', { class:'badge num', text: (exam.i + 1) + ' / ' + total }),
    el('span', { class:'spacer' }),
    exam.i < total - 1
      ? el('button', { class:'btn btn--sm', type:'button', id:'exNext', text:'التالي ←' })
      : el('button', { class:'btn btn--sm', type:'button', id:'exFinish',
          text:'أنهِ الاختبار (' + answeredCount + '/' + total + ')' })
  ]);
  nav.addEventListener('click', e => {
    if (e.target.id === 'exPrev') { QBANK.exam.prev(exam); QBANK.router.render(location.hash); }
    if (e.target.id === 'exNext') { QBANK.exam.next(exam); QBANK.router.render(location.hash); }
    if (e.target.id === 'exFinish') finishExam();
  });

  return el('div', { class:'stack exam' }, [
    head,
    el('div', { class:'card stack q exam__q' }, [
      el('p', { class:'ltr q__text', text: item.q }), opts,
      (answered && exam.mode === 'instant') ? examFeedback(item, answered, st) : null,
      (answered && exam.mode !== 'instant' && QBANK.shareCard)
        ? QBANK.shareCard.button({ id:item.id, q:item.q, options:item.options, _sid: st.sub.id }) : null
    ]),
    nav
  ]);
}

function examResult(){
  const st = examState, r = st.result;
  const topicRows = Object.keys(r.byTopic).map(t => {
    const d = r.byTopic[t];
    const pct = Math.round(d.correct / d.total * 100);
    return el('div', { class:'row' }, [
      el('span', { text: t }),
      el('span', { class:'spacer' }),
      el('span', { class:'badge num ' + (pct >= 70 ? 'badge--ok' : 'badge--bad'), text: d.correct + '/' + d.total })
    ]);
  });
  const retryWrong = el('button', { class:'btn btn--soft btn--block', type:'button',
    text:'أعد اختبار الأخطاء فقط (' + r.wrongIds.length + ')' , disabled: r.wrongIds.length ? null : true });
  retryWrong.addEventListener('click', async () => {
    const qs = (await QBANK.data.subjectQuestions(st.sub.id)).data;
    const wrongSet = {};
    r.wrongIds.forEach(id => wrongSet[id] = 1);
    const exam = QBANK.exam.create(qs, { scope:'wrong', wrongMap: wrongSet, mode: st.exam.mode });
    examState = { exam, sub: st.sub, secondsLeft: 0, timerId: null };
    QBANK.router.render(location.hash);
  });

  const review = el('details', { class:'fold' }, [
    el('summary', {}, ['مراجعة كاملة للأسئلة']),
    el('div', { class:'stack' }, r.review.map((rv, i) => el('div', { class:'card card--flat stack q' }, [
      el('div', { class:'row' }, [
        el('span', { class:'badge num', text:'س' + (i + 1) }),
        rv.ok ? el('span', { class:'badge badge--ok', text:'✓ صحيح' })
              : el('span', { class:'badge badge--bad', text:'✗ خطأ' })
      ]),
      el('p', { class:'ltr q__text', text: rv.q }),
      el('div', { class:'stack q__opts' }, rv.options.map((o, oi) =>
        el('div', { class:'opt' + (oi === rv.correct ? ' is-answer' : (oi === rv.chosen ? ' is-wrong' : '')) }, [
          el('span', { class:'opt__l', 'aria-hidden':'true', text: QBANK.views.optLetter(oi) }),
          el('span', { class:'ltr', text: o }),
          oi === rv.correct ? el('span', { class:'opt__tag', text:'الإجابة' }) : null,
          el('span', { class:'opt__mark', 'aria-hidden':'true', text: oi === rv.correct ? '✓' : (oi === rv.chosen ? '✗' : '') })
        ]))),
      rv.expl_ar ? el('p', { class:'field__hint', text: rv.expl_ar }) : null
    ])))
  ]);

  return el('div', { class:'stack' }, [
    el('div', { class:'card', style:'text-align:center' }, [
      el('div', { class:'result__pct num', text: r.pct + '٪' }),
      el('div', { class:'result__grade', text: r.grade }),
      el('p', { class:'page__sub num', text: r.correct + ' من ' + r.total + ' · ' + Math.round(r.duration_s / 60) + ' دقيقة' })
    ]),
    el('div', { class:'card stack' }, [ el('h2', { text:'حسب المحاور' }) ].concat(topicRows)),
    retryWrong, review,
    el('a', { class:'btn btn--ghost btn--block', href:'#/subject/' + st.sub.id, text:'عودة إلى المادة' })
  ]);
}

const ViewExam = {
  title:'اختبار تجريبي',
  view(route){
    const sid = route.rest[0];
    const sub = (QBANK.data.pack().subjects || []).filter(s => s.id === sid)[0];
    // ★ نفس العلاج: رابط اختبارٍ مباشر قد يسبق قائمةَ هذا الجهاز
    if (!sub) return refetchThenSubject(sid, 'اختبار');

    if (!QBANK.gate.localGuess(sub).allowed) {
      return QBANK.views.page(sub.name, null, [ QBANK.gate.paywallCard(sub) ]);
    }

    // مادة مثبّتة — لا خطوة اختيار مادة
    if (examState && examState.sub.id === sid) {
      if (examState.exam.finished) return QBANK.views.page('نتيجتك — ' + sub.name, null, [examResult()]);
      return QBANK.views.page('اختبار — ' + sub.name, null, [examRunner()]);
    }
    const body = el('div', { class:'stack' }, [ el('p', { class:'page__sub', text:'جارٍ التجهيز…' }) ]);
    QBANK.data.subjectQuestions(sid).then(r => {
      if (!body.isConnected) return;
      body.innerHTML = '';
      if (!r.data.length) { body.appendChild(QBANK.views.empty('⇣', 'لا أسئلة متاحة', 'افتح المادة أولًا بإنترنت.')); return; }
      body.appendChild(examSetup(sub, r.data));
    });
    return QBANK.views.page('اختبار — ' + sub.name, 'خلط عادل، وأولوية لأخطائك السابقة.', [body]);
  },
  _reset(){ if (examState && examState.timerId) clearInterval(examState.timerId); examState = null; },
  _state(){ return examState; },
  _set(s){ examState = s; },
  _finish: finishExam
};
QBANK.views.ViewExam = ViewExam;
QBANK.views.examFeedback = examFeedback;   /* للفحوص والمعاينة */
