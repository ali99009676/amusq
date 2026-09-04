/*
  صفحة الهبوط التعريفية — تُعرض للزائر غير المسجَّل فقط.
  الطالب المسجَّل يرى بطاقات مواده مباشرة كما كان، فلا نضيف له خطوة.

  ★ قاعدة هذه الصفحة: شرحُ عمل المنصة فقط — ولا مادة واحدة بعينها.

  السبب أن المقررات تختلف من جامعة إلى جامعة ومن كلية إلى كلية. فزائر من
  القاهرة يرى هنا مواد جامعة نجران فيظن أن المنصة لا تخصّه، أو أسوأ: يظن
  أن هذه هي كل موادها. المكان الصحيح للمواد هو «استكشف» حيث يبحث الطالب
  عن جامعته ويرى ما يخصّه هو. أما الصفحة الأولى فتُجيب عن سؤال واحد:
  ما هذه المنصة وكيف تعمل؟
*/
/*
  رفّ الكتب — التوقيع البصري للمنصة.

  رفّ مجرَّد لا يُبنى من مواد حقيقية: هو صورة لفكرة «بنك الأسئلة» لا عرضٌ
  لمخزون. تفاوت سُمك الكعوب وأطوالها ثابت مقصود، كي تبقى الصورة نفسها لكل
  زائر مهما اختلف ما في القاعدة.
*/
function shelfSvg(){
  const NS = 'http://www.w3.org/2000/svg';
  const W = 640, H = 116, FLOOR = 96;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'lp-shelf');
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'رفّ كتب — صورة تعبيرية لبنوك الأسئلة');

  // أوزان ثابتة: الصورة واحدة لكل زائر، ولا تُفسَّر كإحصاء
  const WEIGHTS = [46, 30, 58, 38, 52, 34, 44, 60, 36];

  let x = 12;
  WEIGHTS.forEach((w, i) => {
    const bw = 26 + Math.round(w / 60 * 34);
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

function lpSection(kicker, title, sub, body){
  return el('section', { class:'lp-sec' }, [
    el('div', { class:'lp-sec__head' }, [
      kicker ? el('span', { class:'lp-sec__kicker', text: kicker }) : null,
      el('h2', { class:'lp-sec__title', text: title }),
      sub ? el('p', { class:'lp-sec__sub', text: sub }) : null
    ])
  ].concat(body || []));
}

/*
  نموذجا مادة — يشرحان شكل البنك لا يعرضان مخزون جامعة.

  مادتان من تخصصين متباعدين عمدًا: طالب الهندسة يرى مادة حاسب فيعرف أن
  المنصة له، وطالب الطب يرى مادته. ولو عرضنا هنا مواد جامعة حقيقية لعاد
  العطل الذي أزلناه: زائر من القاهرة يظنّ المنصة لجامعة واحدة.

  ولا أرقام أسئلة في البطاقتين — لأنها ستُقرأ كمخزون حقيقي وهي ليست كذلك.
  المحاور تكفي لتوضيح ما يجده الطالب داخل المادة.
*/
const LP_SAMPLES = [
  {
    icon: '🫀', tag: 'طب', color: 'var(--subject-1)',
    name: 'فسيولوجيا القلب والدورة الدموية',
    descr: 'أسئلة الدكتور كما وردت — إنجليزية أو عربية — ومعها شرح عربي لكل خيار: لماذا هذا صحيح، ولماذا ذاك مشتِّت مصمَّم ليخدعك.',
    topics: ['الدورة القلبية', 'الناتج القلبي', 'تنظيم ضغط الدم', 'تخطيط القلب']
  },
  {
    icon: '⌨', tag: 'حاسب', color: 'var(--subject-6)',
    name: 'هياكل البيانات والخوارزميات',
    descr: 'الرموز والمعادلات تبقى كما كتبها دكتورك حرفًا بحرف، وبطاقة الحفظ تربط الكلمة الدالة في السؤال بمفتاح الإجابة.',
    topics: ['التعقيد الزمني', 'الأشجار', 'الفرز والبحث', 'جداول التوزيع']
  }
];

function lpSampleCard(s){
  return el('article', { class:'lp-card lp-card--sample' }, [
    el('span', { class:'lp-card__top', style:'background:' + s.color, 'aria-hidden':'true' }),
    el('div', { class:'lp-card__row' }, [
      el('span', { class:'lp-card__ico', 'aria-hidden':'true' }, [ QBANK.subjIcon(s.icon, 26) ]),
      el('span', { class:'badge lp-card__stamp', text:'نموذج' })
    ]),
    el('h3', { class:'lp-card__title', text: s.name }),
    el('span', { class:'lp-card__tag', text: s.tag }),
    el('p', { class:'lp-card__text', text: s.descr }),
    el('div', { class:'lp-topics', role:'list', 'aria-label':'محاور المادة' },
      s.topics.map(t => el('span', { class:'lp-topic', role:'listitem', text: t })))
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
  const root = el('div', { class:'lp' });
  // عيّنة واحدة للسؤال ولبطاقة الحفظ معًا — لو اختلفتا لبدتا غير مترابطتين
  const demo = QBANK.demos.at(QBANK.demos.next());

  /* ١ · البطل — ما هي المنصة، وإلى أين يذهب الزائر */
  const goSignup = el('a', { class:'btn btn--lg', href:'#/login', text:'ابدأ المراجعة مجانًا' });
  // ★ الوجهة «استكشف» لا قائمة مواد ثابتة: هناك يبحث الطالب عن جامعته هو
  const goExplore = el('a', { class:'btn btn--ghost btn--lg', href:'#/explore',
    text:'ابحث عن جامعتك' });
  root.appendChild(el('header', { class:'lp-hero' }, [
    el('span', { class:'lp-hero__badge' }, [
      el('span', { class:'dot', 'aria-hidden':'true' }),
      'بنك أسئلة لطلاب الجامعات العربية'
    ]),
    el('h1', { class:'lp-hero__title' }, [
      'كل أسئلة موادك ',
      el('em', { text:'في مكان واحد' })
    ]),
    el('p', { class:'lp-hero__sub', text:
      (pack.settings && pack.settings.welcome_text) ||
      'أيًّا كان تخصصك — طب أو هندسة أو حاسب أو قانون أو إدارة — تحوّل ملفات أسئلة دكاترتك إلى بنك مراجعة كامل: النص كما ورد حرفًا بحرف، وشرح لكل إجابة، وبطاقات حفظ، واختبار يحاكي الامتحان. ويعمل بلا إنترنت.' }),
    // ★ توقّع صريح: المقررات تختلف بين الجامعات، فلا نعرض قائمة واحدة للجميع
    el('p', { class:'lp-hero__note', text:
      'وكل جامعة موادها تخصّها. ابحث عن جامعتك في «استكشف» — وإن لم تجدها فأضفها أنت، وإن لم تجد مادتك فارفعها. الطلاب هم من يبنون المنصة.' }),
    el('div', { class:'lp-cta' }, [goSignup, goExplore]),
    shelfSvg()
  ]));

  /* ٢ · كيف تعمل — أول ما يحتاجه الزائر: الآلية لا المزايا */
  root.appendChild(lpSection('كيف تعمل', 'من ملف الأسئلة إلى بنك مراجعة',
    'أربع خطوات هي كل ما تفعله المنصة. لا شيء غامضًا فيها.', [
    el('div', { class:'lp-steps' }, [
      lpStep(1, 'يُرفع ملف الأسئلة', 'PDF أو Word أو نص. تقرؤه المنصة وتفصل كل سؤال عن خياراته وإجابته.'),
      lpStep(2, 'يبقى النص كما هو', 'لا إعادة صياغة ولا تصحيح إملاء ولا تغيير ترتيب — تراجع ما ستُمتحن فيه بالضبط.'),
      lpStep(3, 'يُضاف الشرح والحفظ', 'لكل إجابة شرح لماذا هي صحيحة ولماذا غيرها خاطئ، وبطاقة حفظ تربط الكلمة الدالة بالمفتاحية.'),
      lpStep(4, 'تراجع وتختبر نفسك', 'بنك للمراجعة، واختبار مؤقّت بتصحيح فوري وتحليل حسب المحاور — ويعمل بلا إنترنت.')
    ])
  ]));


  /*
    ★ القسم الذي يقلب فهم الزائر للمنصة.

    قبله يظنّ الزائر أنه يتصفّح مخزونًا جاهزًا فيغادر إن لم يجد جامعته.
    وهذا أكثر ما يخسر منصةً محتواها من مستخدميها: من لا يعرف أنه يستطيع
    الإضافة لا يضيف. فنقولها بأصرح ما يمكن، وفي بطاقتين لا فقرة —
    لأن الفقرة تُقرأ والبطاقتين تُريان.
  */
  root.appendChild(lpSection('أنت تبنيها', 'جامعتك ومقرّراتك — تضيفها أنت',
    'لا تنتظر أحدًا يضيفها لك. المنصة تبدأ فارغة في كل جامعة، وأول طالب فيها هو من يفتحها لدفعته.', [
    el('div', { class:'lp-grid' }, [
      el('article', { class:'lp-card lp-add' }, [
        el('span', { class:'lp-card__ico', 'aria-hidden':'true' }, [ QBANK.ico('school', { size:26 }) ]),
        el('h3', { class:'lp-card__title', text:'أضف جامعتك وكليتك' }),
        el('p', { class:'lp-card__text', text:
          'لم تجدها في القائمة؟ اكتب اسمها فتُنشأ في الحال. ويصير لجامعتك قسم برابط واحد ترسله في مجموعة دفعتك — يجتمع فيه كل ما يرفعه زملاؤك.' }),
        el('p', { class:'lp-card__text lp-card__text--dim', text:
          'ونوحّد الإملاء تلقائيًا، فلا تنقسم جامعتك إلى عشر تهجئات.' })
      ]),
      el('article', { class:'lp-card lp-add' }, [
        el('span', { class:'lp-card__ico', 'aria-hidden':'true' }, [ QBANK.ico('upload', { size:26 }) ]),
        el('h3', { class:'lp-card__title', text:'أضف موادك ومقرّراتك' }),
        el('p', { class:'lp-card__text', text:
          'ارفع ملف أسئلة دكتورك — PDF أو Word أو نص — فيصير بنك مراجعة كاملًا في دقائق، ويظهر في قسم جامعتك لكل من يبحث عنه.' }),
        el('p', { class:'lp-card__text lp-card__text--dim', text:
          'والنشر مجاني بلا حدود. والإثراء بالشرح وبطاقات الحفظ اختيار لك.' })
      ])
    ]),
    el('div', { class:'lp-cta', style:'margin-top:22px' }, [
      el('a', { class:'btn', href:'#/login', text:'أضف جامعتك ومادتك' }),
      el('a', { class:'btn btn--ghost', href:'#/explore', text:'ابحث أولًا في «استكشف»' })
    ])
  ]));

  /* ٣ · ماذا ستراجع — نموذجان يوضّحان شكل المادة */
  root.appendChild(lpSection('المواد', 'ماذا ستراجع؟',
    'كل مادة بنك أسئلة كامل: نص السؤال كما ورد من الدكتور، وشرح يوضّح لماذا الإجابة صحيحة ولماذا غيرها خاطئ.', [
    el('div', { class:'lp-grid' }, LP_SAMPLES.map(lpSampleCard)),
    // ★ السطر الذي يمنع قراءة النموذجين كقائمة مواد المنصة
    el('p', { class:'lp-note' }, [
      'هذان نموذجان توضيحيان لا مادّتان معروضتان. المواد الحقيقية يرفعها الطلاب وتختلف بين الجامعات — ',
      el('a', { href:'#/explore', text:'ابحث عن جامعتك في «استكشف»' }),
      '.'
    ])
  ]));

  /* ٤ · جرّب سؤالًا الآن — الشرح بالتجربة لا بالكلام */
  /* ★ المتصدرون — الزائر يرى أن المنصة حيّة بأسماءٍ حقيقية قبل أن يسجّل */
  if (QBANK.views.boardMini)
    root.appendChild(lpSection('المتصدرون', 'من يراجع الآن؟',
      'لوحة حقيقية من اختبارات الطلاب — وعدّاد من هم على المنصة هذه الساعات.',
      [ QBANK.views.boardMini({ title:'الأوائل على كل الجامعات' }) ]));

  root.appendChild(lpSection('جرّبها الآن', 'أجب عن سؤال واحد',
    'هكذا يبدو كل سؤال في «مراجعة»: النص كما ورد، وشرح يوضّح لماذا الإجابة صحيحة ولماذا غيرها خاطئ.',
    [QBANK.views.lpParts.lpTryQuestion(demo)]));

  /* ٥ · بطاقة حفظ حيّة */
  root.appendChild(lpSection('طريقة الحفظ', 'بطاقة لكل سؤال',
    'الكلمة الدالة في السؤال ← الكلمة المفتاحية في الإجابة، ورابط ذهني يثبّتها. اقلب البطاقة لترى.',
    [QBANK.views.lpParts.lpMemoCard(demo)]));

  /* ٦ · المزايا */
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

  /* ٧ · مواد الطلاب — الميزة التي تجعل المنصة تنمو بلا مشرف */
  root.appendChild(lpSection('لطلاب المواد الناقصة', 'مادتك ليست هنا؟ ارفعها أنت',
    'لا تنتظر أحدًا. حوّل ملف أسئلة دكتورك إلى بنك كامل بالشرح وبطاقات الحفظ في دقائق، وجرّبه مجانًا قبل أي التزام.', [
    el('div', { class:'lp-steps' }, [
      lpStep(1, 'ارفع ملفك', 'PDF أو Word أو نص. واختر: انشره كما هو مجانًا، أو أضف الشرح وبطاقات الحفظ برصيد الإثراء — والنص الأصلي يبقى محفوظًا في الحالتين.'),
      lpStep(2, 'جرّبه عشر دقائق', 'مجانًا وبالكامل. عدّاد ظاهر أمامك، فتعرف ما أخذت وما بقي قبل أن تقرّر.'),
      lpStep(3, 'شاركه بزملائك', 'يصلك رابط خاص بك جاهز للنسخ — أرسله في مجموعة دفعتك.'),
      lpStep(4, 'اكسب على كل بيعة', 'كل زميل يشتري عبر رابطك يضيف كوينز إلى رصيدك، وتراها في محفظتك لحظة بلحظة.')
    ]),
    el('div', { class:'lp-cta' }, [
      el('a', { class:'btn btn--lg', href:'#/login', text:'ارفع مادتك الأولى' })
    ])
  ]));

  /* ٨ · نصائح مراجعة — قيمة يأخذها الزائر حتى لو لم يسجّل */
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

  /* ٩ · الأسعار — نموذج الفصل لا اشتراك شهري */
  root.appendChild(lpSection('الاشتراك', 'ادفع لفصلك، لا لشهر لن تذاكر فيه',
    'الطلب موسمي حول الامتحانات، فالاشتراك موسمي مثله.', [
    el('div', { class:'lp-grid lp-grid--3' }, [
      el('div', { class:'lp-price' }, [
        el('span', { class:'lp-price__n', text:'المجانية' }),
        el('span', { class:'lp-price__v', text:'٠ ﷼' }),
        el('ul', {}, [
          el('li', { text:'مواد مجانية كاملة — بلا حدود' }),
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

  /* ١٠ · الأسئلة الشائعة — تُزيل التردد قبل التسجيل */
  root.appendChild(lpSection('أسئلة شائعة', 'ما يسأل عنه الطلاب عادة', null, [
    el('div', { class:'lp-faq' }, QBANK.views.lpParts.LP_FAQ.map(f =>
      el('details', {}, [
        el('summary', { text: f[0] }),
        el('p', { text: f[1] })
      ])
    ))
  ]));

  /* ١١ · الدعوة الأخيرة */
  root.appendChild(el('section', { class:'lp-final' }, [
    el('h2', { text:'امتحانك القادم أقرب مما تظن' }),
    el('p', { text:'ابحث عن جامعتك، أو ارفع مادتك الأولى اليوم.' }),
    el('div', { class:'lp-cta' }, [
      el('a', { class:'btn btn--lg', href:'#/login', text:'أنشئ حسابك مجانًا' }),
      el('a', { class:'btn btn--ghost btn--lg', href:'#/explore', text:'استكشف بنوك الأسئلة' })
    ])
  ]));

  return root;
}

QBANK.views.landingView = landingView;
