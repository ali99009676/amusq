/*
  صفحة الهبوط التعريفية — تُعرض للزائر غير المسجَّل فقط.
  الطالب المسجَّل يرى بطاقات مواده مباشرة كما كان، فلا نضيف له خطوة.
  لماذا؟ لأن الزائر يحتاج إقناعًا وشرحًا، والمسجَّل يحتاج مذاكرة فورية.
*/
/*
  خط تخطيط القلب: دورة PQRST كاملة تتكرر عبر عرض الشاشة.
  نبنيه برمجيًا لا كصورة، فيبقى الملف واحدًا ويتلوّن بمتغيّرات التصميم.
*/
/*
  رفّ الكتب — التوقيع البصري للمنصة.

  كان هنا خط تخطيط قلب حين كانت الهوية طبية. صار رفًّا لأن الاسم صار «بنك
  الأسئلة»: كل كعب كتاب مادة، وعرضه يتناسب مع عدد أسئلتها فعلًا. الصورة
  تقول ما تقوله الأرقام: كلما كبرت المكتبة طال الرفّ.
*/
function shelfSvg(subjects){
  const NS = 'http://www.w3.org/2000/svg';
  const W = 640, H = 116, FLOOR = 96;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'lp-shelf');
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'رفّ فيه ' + (subjects.length || 6) + ' مادة');

  // بلا مواد بعد: رفّ نموذجي كي لا يبدو الموقع فارغًا لأول زائر
  const books = (subjects.length ? subjects : [1,2,3,4,5,6].map(i => ({ q_count: 30 + i * 12 })))
    .slice(0, 9);
  const maxQ = Math.max(1, ...books.map(b => Number(b.q_count) || 1));

  let x = 12;
  books.forEach((b, i) => {
    const q = Number(b.q_count) || 1;
    const bw = 26 + Math.round(q / maxQ * 34);          // السُّمك من عدد الأسئلة
    const bh = 46 + ((i * 7) % 22);                     // تفاوت الطول: رفّ لا مسطرة
    const col = 'var(--subject-' + ((i % 6) + 1) + ')';
    const g = document.createElementNS(NS, 'g');

    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', x); r.setAttribute('y', FLOOR - bh);
    r.setAttribute('width', bw); r.setAttribute('height', bh);
    r.setAttribute('rx', 3); r.setAttribute('fill', col);
    r.setAttribute('class', 'lp-shelf__book');
    r.style.setProperty('--d', (i * 90) + 'ms');        // تتابع الظهور
    g.appendChild(r);

    // شريطان مذهّبان على الكعب — تفصيلة الكتاب المجلَّد
    [10, 18].forEach(off => {
      const ln = document.createElementNS(NS, 'rect');
      ln.setAttribute('x', x + 5); ln.setAttribute('y', FLOOR - bh + off);
      ln.setAttribute('width', Math.max(4, bw - 10)); ln.setAttribute('height', 2);
      ln.setAttribute('fill', 'var(--gold)'); ln.setAttribute('opacity', '.65');
      g.appendChild(ln);
    });
    svg.appendChild(g);
    x += bw + 5;
  });

  // لوح الرفّ
  const shelf = document.createElementNS(NS, 'rect');
  shelf.setAttribute('x', 0); shelf.setAttribute('y', FLOOR);
  shelf.setAttribute('width', Math.max(x + 8, 220)); shelf.setAttribute('height', 5);
  shelf.setAttribute('rx', 2.5); shelf.setAttribute('class', 'lp-shelf__plank');
  svg.appendChild(shelf);
  return svg;
}

function lpStat(n, label){
  return el('div', { class:'lp-stat' }, [
    el('span', { class:'lp-stat__n num', text: n }),
    el('span', { class:'lp-stat__l', text: label })
  ]);
}

function lpSection(kicker, title, sub, body){
  return el('section', { class:'lp-sec' }, [
    el('div', { class:'lp-sec__head' }, [
      kicker ? el('span', { class:'lp-sec__kicker', text: kicker }) : null,
      el('h2', { class:'lp-sec__title', text: title }),
      sub ? el('p', { class:'lp-sec__sub', text: sub }) : null
    ])
  ].concat(body || []));
}

/* بطاقة مادة في العرض التعريفي — تدعو للتسجيل لا للفتح المباشر */
function lpSubjectCard(sub){
  const color = QBANK.views.subjectColor(sub.color);
  const left = QBANK.views.daysLeft(sub.exam_date);
  return el('article', { class:'lp-card' }, [
    el('span', { class:'lp-card__top', style:'background:' + color, 'aria-hidden':'true' }),
    el('span', { class:'lp-card__ico', 'aria-hidden':'true', text: sub.icon || '▤' }),
    el('h3', { class:'lp-card__title', text: sub.name }),
    el('p', { class:'lp-card__text', text: sub.descr || 'بنك أسئلة كامل مع شرح وبطاقات حفظ واختبار تجريبي.' }),
    el('div', { class:'lp-card__meta' }, [
      el('span', { class:'badge num', text: (sub.q_count || 0) + ' سؤالًا' }),
      sub.free ? el('span', { class:'badge badge--ok', text:'مجانية بالكامل' }) : null,
      (left !== null && left >= 0) ? el('span', { class:'badge badge--warn num', text:'الاختبار بعد ' + left + ' يوم' }) : null,
      (sub.topics && sub.topics.length) ? el('span', { class:'badge num', text: sub.topics.length + ' محاور' }) : null
    ])
  ]);
}

/* بطاقة ميزة */
function lpFeature(ico, title, text){
  return el('article', { class:'lp-card' }, [
    el('span', { class:'lp-card__ico', 'aria-hidden':'true', text: ico }),
    el('h3', { class:'lp-card__title', text: title }),
    el('p', { class:'lp-card__text', text: text })
  ]);
}

function lpStep(n, title, desc){
  return el('div', { class:'lp-step' }, [
    el('div', { class:'lp-step__n num', text: String(n) }),
    el('p', { class:'lp-step__t', text: title }),
    el('p', { class:'lp-step__d', text: desc })
  ]);
}

function landingView(){
  const pack = QBANK.data.pack();
  const subjects = (pack.subjects || []).slice().sort((a,b) => (a.ord||0) - (b.ord||0));
  const totalQ = subjects.reduce((s, x) => s + (x.q_count || 0), 0);
  const freeCount = subjects.filter(s => s.free).length;

  const root = el('div', { class:'lp' });

  /* ١ · البطل */
  const goSignup = el('a', { class:'btn btn--lg', href:'#/login', text:'ابدأ المراجعة مجانًا' });
  const goSubjects = el('a', { class:'btn btn--ghost btn--lg', href:'#subjects', text:'تصفّح المواد' });
  root.appendChild(el('header', { class:'lp-hero' }, [
    el('span', { class:'lp-hero__badge' }, [
      el('span', { class:'dot', 'aria-hidden':'true' }),
      'بنك أسئلة لطلاب التخصصات الصحية'
    ]),
    el('h1', { class:'lp-hero__title' }, [
      'كل أسئلة موادك ',
      el('em', { text:'في مكان واحد' })
    ]),
    el('p', { class:'lp-hero__sub', text:
      (pack.settings && pack.settings.welcome_text) ||
      'بنك أسئلة منقّح من ملفات دكاترتك حرفًا بحرف، مع شرح لكل إجابة، وبطاقات حفظ ذكية، واختبارات تجريبية تحاكي الامتحان الحقيقي — وتعمل بلا إنترنت.' }),
    el('div', { class:'lp-cta' }, [goSignup, goSubjects]),
    shelfSvg(subjects)
  ]));

  /* ١-ب · عدّاد الامتحانات القادمة — أنفع ما يراه الطالب فورًا */
  const exams = QBANK.views.lpParts.lpExams(subjects);
  if (exams) root.appendChild(exams);

  /* ٢ · الأرقام — حقيقية من المحتوى المنشور لا مبالغات */
  root.appendChild(el('div', { class:'lp-stats' }, [
    lpStat(subjects.length || '—', 'مادة'),
    lpStat(totalQ || '—', 'سؤالًا'),
    lpStat(freeCount || '—', 'مجانية'),
    lpStat('٢٤/٧', 'بلا إنترنت')
  ]));

  /* ٢-ب · جرّب سؤالًا الآن — الإقناع بالتجربة لا بالكلام */
  root.appendChild(lpSection('جرّبها الآن', 'أجب عن سؤال واحد',
    'هكذا يبدو كل سؤال في «مراجعة»: النص كما ورد، وشرح يوضّح لماذا الإجابة صحيحة ولماذا غيرها خاطئ.',
    [QBANK.views.lpParts.lpTryQuestion()]));

  /* ٢-ج · بطاقة حفظ حيّة */
  root.appendChild(lpSection('طريقة الحفظ', 'بطاقة لكل سؤال',
    'الكلمة الدالة في السؤال ← الكلمة المفتاحية في الإجابة، ورابط ذهني يثبّتها. اقلب البطاقة لترى.',
    [QBANK.views.lpParts.lpMemoCard()]));

  /* ٣ · المواد */
  const subjectsBody = subjects.length
    ? [el('div', { class:'lp-grid lp-grid--3' }, subjects.map(lpSubjectCard))]
    : [QBANK.views.empty('▤', 'المواد في الطريق',
        'نعمل على تجهيز أول المواد. سجّل بريدك الآن ونخبرك فور نشر أول مادة.')];
  const secSubjects = lpSection('المواد', 'ماذا ستراجع؟',
    'كل مادة بنك أسئلة كامل: نص السؤال كما ورد من الدكتور، وشرح يوضّح لماذا الإجابة صحيحة ولماذا غيرها خاطئ.',
    subjectsBody);
  secSubjects.id = 'subjects';
  root.appendChild(secSubjects);

  /* ٤ · المزايا */
  root.appendChild(lpSection('لماذا مراجعة؟', 'أدوات مراجعة لا مجرد ملفات',
    'كل ميزة هنا وُلدت من حاجة حقيقية في ليالي الامتحانات.', [
    el('div', { class:'lp-grid lp-grid--3' }, [
      lpFeature('📄', 'نص السؤال كما هو',
        'لا نعيد صياغة سؤال الدكتور ولا نصحّح إملاءه — تراجع ما ستُمتحن فيه بالضبط، حرفًا بحرف.'),
      lpFeature('🧠', 'بطاقات حفظ ذكية',
        'لكل سؤال بطاقة: الكلمة الدالة ← الكلمة المفتاحية، ورابط ذهني، وكيف تشطب المشتتات في الورقة.'),
      lpFeature('📝', 'اختبار يشبه الامتحان',
        'خلط عادل للأسئلة والخيارات، مؤقّت، تصحيح فوري، وتحليل نتيجتك حسب المحاور.'),
      lpFeature('🎯', 'أخطاؤك أولًا',
        'ما أخطأت فيه يتقدّم في الاختبار القادم، وتستطيع إعادة اختبار أخطائك وحدها بضغطة.'),
      lpFeature('📶', 'يعمل بلا إنترنت',
        'افتح المادة مرة واحدة متصلًا، ثم راجع في الطائرة أو المستشفى أو أي مكان بلا شبكة.'),
      lpFeature('🖨', 'اطبع ورقتك',
        'اختر ما تطبعه ونطاقه وهل تظهر الإجابات — بتنسيق ورقي نظيف لا ينقسم فيه سؤال بين صفحتين.')
    ])
  ]));

  /* ٥ · الخطوات */
  root.appendChild(lpSection('البداية', 'ثلاث دقائق وتبدأ',
    null, [
    el('div', { class:'lp-steps' }, [
      lpStep(1, 'سجّل ببريدك', 'رابط دخول بلا كلمة مرور — أو بحساب جوجل أو آبل.'),
      lpStep(2, 'اختر موادك', 'أضف مواد فصلك، واضبط موعد كل اختبار ليظهر لك العدّ التنازلي.'),
      lpStep(3, 'راجع واحفظ', 'بنك الأسئلة والشرح وبطاقات الحفظ — وتقدّمك يُحفظ تلقائيًا.'),
      lpStep(4, 'اختبر نفسك', 'اختبار تجريبي بنتيجة وتحليل، وأعد اختبار أخطائك حتى تتقنها.')
    ])
  ]));

  /* ٥-ب · نصائح مراجعة — قيمة يأخذها الزائر حتى لو لم يسجّل */
  root.appendChild(lpSection('كيف تذاكر بذكاء', 'أربع قواعد تختصر عليك ساعات',
    'مبنية على ما تقوله أبحاث التعلّم عن الاسترجاع النشط والمراجعة الموزّعة.', [
    el('div', { class:'lp-grid' }, QBANK.views.lpParts.LP_TIPS.map(t =>
      el('div', { class:'lp-tip' }, [
        el('span', { class:'lp-tip__i', 'aria-hidden':'true', text: t[0] }),
        el('div', {}, [
          el('p', { class:'lp-tip__t', text: t[1] }),
          el('p', { class:'lp-tip__d', text: t[2] })
        ])
      ])
    ))
  ]));

  /* ٦ · الأسعار — نموذج الفصل لا اشتراك شهري */
  root.appendChild(lpSection('الاشتراك', 'ادفع لفصلك، لا لشهر لن تذاكر فيه',
    'الطلب موسمي حول الامتحانات، فالاشتراك موسمي مثله.', [
    el('div', { class:'lp-grid lp-grid--3' }, [
      el('div', { class:'lp-price' }, [
        el('span', { class:'lp-price__n', text:'المجانية' }),
        el('span', { class:'lp-price__v', text:'٠ ﷼' }),
        el('ul', {}, [
          el('li', { text:'مادة كاملة مجانًا — بلا حدود' }),
          el('li', { text:'كل الأدوات: بنك وشرح وحفظ واختبار' }),
          el('li', { text:'بلا بطاقة ولا التزام' })
        ]),
        el('a', { class:'btn btn--soft btn--block', href:'#/login', text:'ابدأ الآن' })
      ]),
      el('div', { class:'lp-price lp-price--hot' }, [
        el('span', { class:'lp-price__n', text:'حزمة الفصل' }),
        el('span', { class:'lp-price__v' }, ['قريبًا ', el('small', { text:'/ الفصل' })]),
        el('ul', {}, [
          el('li', { text:'كل مواد الفصل مفتوحة' }),
          el('li', { text:'تنتهي بنهاية الفصل — بلا تجديد تلقائي' }),
          el('li', { text:'الدفع بمدى أو Apple Pay' })
        ]),
        el('a', { class:'btn btn--block', href:'#/login', text:'أبلغني عند الإطلاق' })
      ]),
      el('div', { class:'lp-price' }, [
        el('span', { class:'lp-price__n', text:'مادة مفردة' }),
        el('span', { class:'lp-price__v' }, ['قريبًا ', el('small', { text:'/ مادة' })]),
        el('ul', {}, [
          el('li', { text:'ادفع لما تحتاجه فقط' }),
          el('li', { text:'صالحة حتى نهاية الفصل' }),
          el('li', { text:'ترقية لحزمة الفصل متى شئت' })
        ]),
        el('a', { class:'btn btn--ghost btn--block', href:'#/login', text:'أبلغني' })
      ])
    ])
  ]));

  /* ٦-ب · الأسئلة الشائعة — تُزيل التردد قبل التسجيل */
  root.appendChild(lpSection('أسئلة شائعة', 'ما يسأل عنه الطلاب عادة', null, [
    el('div', { class:'lp-faq' }, QBANK.views.lpParts.LP_FAQ.map(f =>
      el('details', {}, [
        el('summary', { text: f[0] }),
        el('p', { text: f[1] })
      ])
    ))
  ]));

  /* ٧ · الدعوة الأخيرة */
  root.appendChild(el('section', { class:'lp-final' }, [
    el('h2', { text:'امتحانك القادم أقرب مما تظن' }),
    el('p', { text:'ابدأ بالمادة المجانية اليوم، وقرّر بعدها إن كانت تستحق.' }),
    el('a', { class:'btn btn--lg', href:'#/login', text:'أنشئ حسابك مجانًا' })
  ]));

  return root;
}

QBANK.views.landingView = landingView;
