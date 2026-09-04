/*
  محرك الاختبار التجريبي — منطق نقي بلا DOM كي يُفحص بمعزل عن الواجهة.
  المبدآن الثابتان:
  ١) خلط فيشر-ييتس للأسئلة ولمواضع الخيارات — عادل رياضيًا.
  ٢) تتبّع الإجابة الصحيحة بالموضع الرقمي لا بالحرف — الحروف تنكسر عند الخلط.
*/
const Exam = {
  // rng قابل للحقن: الفحوص تمرّر مولّدًا حتميًا فتصير النتائج قابلة للتكرار
  shuffle(arr, rng){
    const r = rng || Math.random;
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  },

  /* اختيار الأسئلة: النطاق ثم أولوية ما أُخطئ فيه سابقًا */
  select(questions, opts){
    opts = opts || {};
    let pool = questions.slice();
    if (opts.scope === 'topic' && opts.topic) pool = pool.filter(q => q.topic === opts.topic);
    if (opts.scope === 'important') pool = pool.filter(q => q.important);
    if (opts.scope === 'exam_tag')  pool = pool.filter(q => q.exam_tag);
    if (opts.scope === 'wrong') pool = pool.filter(q => (opts.wrongMap || {})[q.id]);

    const wrongMap = opts.wrongMap || {};
    // الأسئلة الخاطئة سابقًا تتقدّم: نخلط كل فئة على حدة ثم نقدّم الخاطئة
    const wrong = Exam.shuffle(pool.filter(q => wrongMap[q.id]), opts.rng);
    const rest  = Exam.shuffle(pool.filter(q => !wrongMap[q.id]), opts.rng);
    let picked = wrong.concat(rest);
    if (opts.count && opts.count < picked.length) picked = picked.slice(0, opts.count);
    return picked;
  },

  create(questions, opts){
    opts = opts || {};
    const picked = Exam.select(questions, opts);
    const items = picked.map(q => {
      // خلط مواضع الخيارات مع تتبّع موضع الصحيح رقميًا
      const order = Exam.shuffle(q.options.map((_, i) => i), opts.rng);
      return {
        id: q.id, q: q.q, topic: q.topic || '',
        options: order.map(i => q.options[i]),
        correct: order.indexOf(q.answer),   // الموضع الجديد للإجابة الصحيحة
        translation: q.translation || '', expl_ar: q.expl_ar || '',
        /* الشرح الإنجليزي وبطاقة الحفظ يرافقان السؤال: لوحة التغذية الراجعة تعرضهما تبويبات */
        expl_en: q.expl_en || '', mnemonic: (q.mnemonic && typeof q.mnemonic === 'object') ? q.mnemonic : null,
        important: !!q.important
      };
    });
    return {
      items,
      i: 0,
      answers: new Array(items.length).fill(null),
      mode: opts.mode || 'instant',        // فوري (افتراضي) أو بعد الانتهاء
      timerMin: opts.timerMin || 0,
      startedAt: opts.now || Date.now(),
      finished: false
    };
  },

  answer(exam, choice){
    if (exam.finished || exam.answers[exam.i] !== null) return null;
    const item = exam.items[exam.i];
    const correct = choice === item.correct;
    exam.answers[exam.i] = { choice, correct };
    return { correct, correctIndex: item.correct };
  },

  next(exam){ if (exam.i < exam.items.length - 1) exam.i++; return exam.i; },
  prev(exam){ if (exam.i > 0) exam.i--; return exam.i; },

  grade(pct){
    if (pct >= 90) return 'ممتاز';
    if (pct >= 80) return 'جيد جدًا';
    if (pct >= 70) return 'جيد';
    if (pct >= 60) return 'مقبول';
    return 'يحتاج مراجعة';
  },

  finish(exam, now){
    exam.finished = true;
    const total = exam.items.length;
    const correct = exam.answers.filter(a => a && a.correct).length;
    const pct = total ? Math.round(correct / total * 1000) / 10 : 0;

    // تحليل حسب المحاور: أين القوة وأين الخلل
    const byTopic = {};
    exam.items.forEach((item, idx) => {
      const t = item.topic || 'عام';
      byTopic[t] = byTopic[t] || { total:0, correct:0 };
      byTopic[t].total++;
      if (exam.answers[idx] && exam.answers[idx].correct) byTopic[t].correct++;
    });

    return {
      total, correct, pct,
      grade: Exam.grade(pct),
      duration_s: Math.round(((now || Date.now()) - exam.startedAt) / 1000),
      byTopic,
      wrongIds: exam.items.filter((it, idx) => !exam.answers[idx] || !exam.answers[idx].correct).map(it => it.id),
      review: exam.items.map((it, idx) => ({
        q: it.q, options: it.options, correct: it.correct,
        chosen: exam.answers[idx] ? exam.answers[idx].choice : null,
        ok: !!(exam.answers[idx] && exam.answers[idx].correct),
        expl_ar: it.expl_ar
      }))
    };
  }
};
QBANK.exam = Exam;
