/* ============ ٥٨ · القوالب تُمرَّر على المقسّم الحقيقي ============ */
describe('٥٨ · قوالب التنسيق');
{
  const parser = require('../api/_lib/parser.js');
  const A = makeDom().window.QBANK;

  // ★ التعابير في المتصفح نسخة حرفية من الخادم — لو انفصلا كذب الفاحص على الطالب
  eq(A.formats.re.q.source,   parser.Q_START.source,   'تعبير بداية السؤال مطابق للخادم');
  eq(A.formats.re.opt.source, parser.OPT_START.source, 'وتعبير الخيار');
  eq(A.formats.re.ans.source, parser.ANS_LINE.source,  'وتعبير سطر الإجابة');
  eq(A.formats.re.q.flags,    parser.Q_START.flags,    'وحتى الرايات متطابقة');

  eq(A.formats.list.length, 2, 'قالبان — بعدد ما يفهمه المقسّم لا أكثر');

  // ═══ القالب الأول: أسئلة بخيارات ═══
  const mcq = A.formats.list.filter(f => f.id === 'mcq')[0];
  const p1 = parser.parse(mcq.sample);
  eq(p1.length, 2, 'القالب الأول يُنتج سؤالين فعلًا');
  eq(p1[0].has_options, true, 'وأولهما بخيارات');
  eq(p1[0].options.length, 4, 'أربعة خيارات');
  eq(p1[0].answer, 0, 'وإجابته المعلنة A تُترجم إلى الموضع ٠');
  eq(p1[0].options[p1[0].answer], 'N-acetylcysteine', 'والموضع يشير إلى الإجابة الصحيحة');
  // القالب فيه سؤال عربي — يثبت للطالب أن العربية تعمل
  eq(p1[1].options[p1[1].answer], 'الأوم', 'والسؤال العربي في القالب يعمل وإجابته سليمة');
  has(p1[0].q, 'Which antidote', 'ونصّ السؤال بلا رقمه');
  ok(p1[0].q.indexOf('1.') === -1, 'الرقم لا يبقى داخل النص');

  // ═══ القالب الثاني: سؤال ثم إجابته ═══
  const qa = A.formats.list.filter(f => f.id === 'qa')[0];
  const p2 = parser.parse(qa.sample);
  eq(p2.length, 3, 'القالب الثاني يُنتج ثلاثة أسئلة');
  eq(p2[0].has_options, false, 'بلا خيارات');
  eq(p2[0].answer_text, 'N-acetylcysteine', 'وإجابة السؤال الأول تُلتقط');
  eq(p2[1].answer_text, 'الجهد يساوي التيار مضروبًا في المقاومة.', 'والإجابة العربية كذلك');
  eq(p2[2].answer_text, 'O(log n)', 'وإجابة فيها رموز لا تنكسر');

  // كل قالب يشرح نفسه
  A.formats.list.forEach(f => {
    ok(!!f.title && !!f.when, 'القالب «' + f.id + '» له عنوان ومتى يُستعمل');
    ok(f.rules.length >= 3, 'وثلاث قواعد على الأقل');
    ok(f.sample.split('\n').length >= 5, 'وعيّنة حقيقية لا سطرًا واحدًا');
  });

  // خطوات ما يحدث للملف
  eq(A.formats.pipeline.length, 4, 'أربع خطوات معلنة للطالب');
  has(JSON.stringify(A.formats.pipeline), 'لا نحتفظ بملفك', 'وتقول له صراحةً ما يحدث لملفه');
}

/* ============ ٥٩ · الفاحص الفوري ============ */
describe('٥٩ · فاحص التنسيق');
{
  const parser = require('../api/_lib/parser.js');
  const A = makeDom().window.QBANK;
  const check = A.formats.check;

  // ★ الفاحص يجب أن يوافق المقسّم في العدد — وإلا وعدنا الطالب بما لن يحدث
  A.formats.list.forEach(f => {
    eq(check(f.sample).questions, parser.parse(f.sample).length,
       'الفاحص يوافق المقسّم في عدد أسئلة قالب «' + f.id + '»');
  });

  const mixed = [
    '1. Question with options?', 'A) one', 'B) two', 'ANSWER: A',
    '2. سؤال بلا خيارات؟', 'إجابته هنا',
    '3. Another with options?', 'A) x', 'B) y', 'C) z'
  ].join('\n');
  const r = check(mixed);
  eq(r.questions, parser.parse(mixed).length, 'وفي ملف مختلط الشكلين');
  eq(r.questions, 3, 'ثلاثة أسئلة');
  eq(r.withOptions, 2, 'اثنان بخيارات');
  eq(r.withAnswer, 2, 'واثنان بإجابة معروفة — والثالث يستنتجه الذكاء');

  // الحالات التي يقع فيها الطالب فعلًا
  eq(check('').ok, false, 'نص فارغ: لا ادّعاء بالنجاح');
  eq(check('نص عادي بلا ترقيم إطلاقًا').ok, false, 'نص بلا ترقيم يُرفض بوضوح');
  eq(check(null).questions, 0, 'وقيمة معدومة لا تُسقط الفاحص');
  eq(check('1) سؤال بقوس؟\nإجابته').questions, 1, 'الترقيم بقوس مقبول كالنقطة');
  eq(check('Q1. سؤال؟\nإجابته').questions, 1, 'وبادئة Q مقبولة');
  eq(check('1. س؟\r\nA) أ\r\nB) ب').questions, 1, 'وأسطر ويندوز لا تكسر العدّ');
}

/* ============ ٦٠ · دليل التنسيق في شاشة الرفع ============ */
describe('٦٠ · شاشة الرفع');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  const pl = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'s9', email:'a@a.a' }))));
  A.api.auth.captureFromHash('#access_token=h.' + pl + '.s&refresh_token=r&expires_in=9999');

  pending.push((async () => {
    A.views.ViewUpload._reset();
    await nav(W, '#/upload');
    const main = doc.getElementById('main');

    // الدليل مطوي افتراضيًا — لا يزاحم من يعرف التنسيق أصلًا
    const guide = doc.querySelector('.fmt');
    ok(!!guide, 'دليل التنسيق موجود في شاشة الرفع');
    ok(!guide.open, 'ومطوي افتراضيًا فلا يزاحم من يعرف');
    has(guide.textContent, 'كيف أجهّز ملفي؟', 'وعنوانه سؤال الطالب نفسه');

    eq(doc.querySelectorAll('.fmt__card[data-fmt]').length, 2, 'بطاقة لكل قالب');
    ok(!!doc.querySelector('[data-fmt="mcq"]'), 'قالب الخيارات');
    ok(!!doc.querySelector('[data-fmt="qa"]'), 'وقالب سؤال-ثم-إجابة');
    eq(doc.querySelectorAll('.fmt__code').length, 2, 'ونصّ كل قالب معروض للنسخ');
    has(main.textContent, 'انسخ القالب', 'وزر نسخ');

    // خطوات المعالجة معلنة
    eq(doc.querySelectorAll('.fmt__pipe li').length, 4, 'أربع خطوات معلنة');
    has(main.textContent, 'لا نحتفظ بملفك', 'ومصير الملف مذكور صراحةً');

    // الفاحص الفوري
    const ta = doc.querySelector('.fmt__card--check textarea');
    ok(!!ta, 'فاحص التنسيق حاضر');
    has(doc.querySelector('.fmt__card--check').textContent, 'الفحص في جهازك',
        'ويطمئن الطالب أن شيئًا لا يُرفع');

    ta.value = '1. سؤال؟\nA) أ\nB) ب\nANSWER: A';
    ta.dispatchEvent(new W.Event('input', { bubbles:true }));
    const out = doc.querySelector('.fmt__out');
    has(out.textContent, 'وجدنا', 'الفاحص يردّ فورًا');
    has(out.textContent, '١', 'بعدد الأسئلة بالأرقام العربية');
    eq(out.className, 'fmt__out is-ok', 'وبحالة نجاح');

    ta.value = 'كلام بلا ترقيم';
    ta.dispatchEvent(new W.Event('input', { bubbles:true }));
    eq(doc.querySelector('.fmt__out').className, 'fmt__out is-no', 'ونصّ غير مفهوم يُرفض');
    has(doc.querySelector('.fmt__out').textContent, 'يبدأ برقمه',
        'ويقول كيف يُصلحه لا «خطأ» فقط');

    ta.value = '';
    ta.dispatchEvent(new W.Event('input', { bubbles:true }));
    eq(doc.querySelector('.fmt__out').textContent, '', 'وإفراغ الحقل يمسح الرسالة');
    W.close();
  })());
}
