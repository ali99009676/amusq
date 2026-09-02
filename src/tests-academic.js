/* ============ ٥٣ · لغة ورقة الامتحان ============ */
describe('٥٣ · التصميم الأكاديمي');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;

  // الأحرف بالعربية — لغة الورقة التي يعرفها الطالب، لا A B C D
  eq(A.views.optLetter(0), 'أ', 'الخيار الأول: أ');
  eq(A.views.optLetter(3), 'د', 'والرابع: د');
  eq(A.views.optLetter(4), 'هـ', 'والخامس بالهاء المفصولة كما تُكتب في الورقة');
  eq(A.views.optLetter(99), '100', 'وما تجاوز الحروف يعود رقمًا بلا انهيار');

  // الأرقام العربية الهندية
  eq(A.views.arNum(47), '٤٧', 'الأرقام عربية هندية كالكتاب المدرسي');
  eq(A.views.arNum(0), '٠', 'والصفر كذلك');
  eq(A.views.arNum('12 من 30'), '١٢ من ٣٠', 'والنص المختلط يُحوَّل رقمه فقط');

  const css = html.split('<style>')[1].split('</style>')[0];
  has(css, '.qitem', 'كتلة السؤال معرّفة كعنصر ورقة');
  has(css, 'border-inline-start:2px solid var(--rule)', 'خط الهامش على جهة القراءة');
  has(css, '.qitem__n', 'رقم السؤال في الهامش');
  has(css, 'max-width:var(--measure)', 'عرض السطر مقيَّد — العين لا تضيع في سطر طويل');
  has(css, '--measure: 64ch', 'والقياس ٦٤ محرفًا');
  has(css, '--read-lh: 2', 'وارتفاع السطر ٢ لنص إنجليزي داخل واجهة عربية');

  // مفتاح الإجابة: ثلاث إشارات لا لون وحده — قاعدة إمكانية الوصول
  has(css, '.opt.is-answer .opt__l{', 'حرف الإجابة الصحيحة يُملأ');
  has(css, '.opt__tag', 'ووسم «الإجابة» نصًّا');
  has(css, '.opt__mark', 'وعلامة ✓');

  // ولا لون صريح تسرّب مع التصميم الجديد
  ['40-screens.css','30-components.css'].forEach(f => {
    const t = fs.readFileSync(path.join(__dirname,'css',f), 'utf8');
    ok(!/#[0-9a-fA-F]{3,6}\b/.test(t), f + ' بلا لون صريح');
  });
}

/* ============ ٥٤ · السؤال كما يراه الطالب ============ */
describe('٥٤ · بنك الأسئلة');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  const pl = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'u1', email:'a@a.a' }))));
  A.api.auth.captureFromHash('#access_token=h.' + pl + '.s&refresh_token=r&expires_in=9999');

  const SUB = { id:'s1', name:'السموم', q_count:2, color:'subject-1', icon:'☤',
                topics:['الترياق'], free:true, course_code:'EMS 301' };
  A.data.savePack({ subjects:[SUB], settings:{} });
  A.data.saveQuestions = A.data.saveQuestions || (() => Promise.resolve(true));
  A.data.subjectQuestions = () => Promise.resolve({ ok:true, data:[
    { id:'q1', subject_id:'s1', ord:46, q:'Which antidote is used for paracetamol overdose?',
      options:['N-acetylcysteine','Naloxone','Atropine','Flumazenil'], answer:0,
      expl_ar:'شرح', translation:'ما ترياق الباراسيتامول؟', mnemonic:{}, topic:'الترياق', important:true },
    { id:'q2', subject_id:'s1', ord:47, q:'Opioid antidote?',
      options:['Naloxone','Atropine'], answer:0, expl_ar:'', translation:'', mnemonic:{}, topic:'الترياق' }
  ] });

  pending.push((async () => {
    await nav(W, '#/subject/s1/bank');
    await until(W, () => doc.querySelector('.qitem'));
    const main = doc.getElementById('main');

    eq(doc.querySelectorAll('.qitem').length, 2, 'كل سؤال كتلة ورقة مستقلة');
    // الترقيم من ord + 1 بالأرقام العربية — الطالب يقول «سؤال ٤٧»
    eq(doc.querySelector('.qitem__n').textContent, '٤٧', 'رقم السؤال في الهامش بالعربية');
    eq(doc.querySelectorAll('.qitem')[1].querySelector('.qitem__n').textContent, '٤٨', 'والتالي يليه');
    ok(doc.querySelector('.qitem__n').getAttribute('aria-hidden') === 'true',
       'والرقم مخفي عن قارئ الشاشة — زخرفة مرجعية لا محتوى');

    // فتح السؤال يكشف الخيارات بأحرفها
    doc.querySelector('.rowbtn').dispatchEvent(new W.Event('click', { bubbles:true }));
    const q1 = doc.querySelector('[data-qid="q1"]');
    const letters = Array.prototype.map.call(q1.querySelectorAll('.opt__l'), x => x.textContent);
    eq(letters.join(' '), 'أ ب ج د', 'الخيارات بأحرف الورقة العربية');

    const right = q1.querySelector('.opt.is-answer');
    ok(!!right, 'الإجابة الصحيحة معلَّمة');
    has(right.textContent, 'N-acetylcysteine', 'وهي الخيار الصحيح فعلًا لا الأول دائمًا');
    has(right.textContent, 'الإجابة', 'ووسمها مكتوب نصًّا — يُقرأ بلا لون');
    has(right.textContent, '✓', 'ومعها أيقونة');
    eq(right.querySelector('.opt__l').textContent, 'أ', 'وحرفها ظاهر');
    eq(q1.querySelectorAll('.opt.is-answer').length, 1, 'إجابة واحدة لا أكثر');

    // النص المقدّس كما هو
    has(q1.querySelector('.q__text').textContent, 'Which antidote is used for paracetamol overdose?',
        'نص السؤال حرفًا بحرف');
    W.close();
  })());
}

/* ============ ٥٥ · بطاقة المادة كسطر خطة مقرّر ============ */
describe('٥٥ · بطاقة المادة');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  const pl = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'u2', email:'a@a.a' }))));
  A.api.auth.captureFromHash('#access_token=h.' + pl + '.s&refresh_token=r&expires_in=9999');

  const soon = new Date(Date.now() + 5 * 86400000).toISOString();
  const past = new Date(Date.now() - 3 * 86400000).toISOString();
  A.data.savePack({ subjects:[
    { id:'a', name:'السموم', q_count:120, color:'subject-1', icon:'☤',
      topics:['أ','ب','ج'], exam_date:soon, course_code:'EMS 301' },
    { id:'b', name:'مادة منتهية', q_count:30, color:'subject-2', icon:'▤', topics:[], exam_date:past }
  ], settings:{} });
  A.store.set('my_subjects', ['a','b']);
  A.router.render('#/');
  const t = doc.getElementById('main').textContent;

  has(t, 'EMS 301', 'رمز المقرر كما يُكتب في الجدول الدراسي');
  ok(!!doc.querySelector('.subj__code'), 'وله موضعه الخاص فوق الاسم');

  // الموعد عدّاد لا وسم
  const dl = doc.querySelector('.deadline');
  ok(!!dl, 'موعد الاختبار عدّاد مستقل');
  has(dl.textContent, '٥', 'رقمه بالعربية');
  has(dl.textContent, 'أيام', 'ووحدته تحته');

  // العدد المطلق قبل النسبة
  has(t, 'من ١٢٠ سؤالًا', 'العدد المطلق للأسئلة — لا النسبة وحدها');
  has(t, '٣ محاور', 'وعدد المحاور');
  ok(!!doc.querySelector('.subj__pct'), 'والنسبة إلى جانبه لا بدلًا منه');
  has(t, 'انتهى موعده', 'والمادة الماضية موسومة بلا عدّاد');
  eq(doc.querySelectorAll('.deadline').length, 1, 'لا عدّاد لمادة انتهى موعدها');
  W.close();
}
