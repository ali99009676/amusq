/*
  معالج رفع الأسئلة — أربع خطوات ظاهرة للمشرف:
  ١ اقرأ الملف · ٢ افهمه بالذكاء · ٣ راجِع · ٤ انشر.
  المنطق في QBANK.admin (قابل للفحص)؛ هنا الواجهة فقط.
*/
let wizard = null;   // حالة المعالج تعيش بين إعادة الرسم داخل الجلسة

function stepsBar(current){
  const names = ['اقرأ الملف','افهمه بالذكاء','راجِع','انشر'];
  return el('ol', { class:'steps' }, names.map((n, i) =>
    el('li', { class:'steps__item' + (i + 1 === current ? ' is-on' : '') + (i + 1 < current ? ' is-done' : ''),
      'aria-current': i + 1 === current ? 'step' : null }, [
      el('span', { class:'steps__num num', text: String(i + 1) }),
      el('span', { text: n })
    ])));
}

/* اسم المادة ونمط المعالجة — يُختاران قبل الرفع لأنهما يغيّران البرومبت نفسه */
function subjectMeta(){
  /*
    ★ الاسم مطلوب — وكان يُشتقّ من اسم الملف عند غيابه.
    فخرجت في المنصة موادُّ اسمها «Document1» و«نسخة نهائية 2» و«WhatsApp
    Image». الطالب لا يبحث بهذه الأسماء ولا يفتحها، فتُدفن مادةٌ نافعة
    بسبب حقلٍ تُرك فارغًا. والاسم هو أول ما يُرى وآخر ما يُتذكَّر.
  */
  const nameIn = el('input', { class:'input', id:'subjName', value: wizard.subjectName || '',
    required:'', 'aria-required':'true',
    placeholder:'مثال: فيزيولوجيا الجهاز التنفسي' });
  const nameMsg = el('p', { class:'field__hint', role:'status' });
  nameIn.addEventListener('input', () => {
    wizard.subjectName = nameIn.value;
    if (nameIn.value.trim()) nameMsg.textContent = '';
  });

  const modes = [
    { id:'strict',   t:'التزم بالنص الحرفي',
      d:'لا يُغيَّر حرف من السؤال ولا من الخيارات. الذكاء يضيف الشرح والترجمة وبطاقة الحفظ فقط. هذا الوضع الافتراضي.' },
    { id:'enhanced', t:'حسّن الصياغة بالذكاء',
      d:'يصحَّح الإملاء وتُوضَّح الصياغة دون تغيير المعنى ولا الإجابة. النص الأصلي يبقى محفوظًا ويمكن عرضه دائمًا.' }
  ];
  const wrap = el('div', { class:'stack', role:'radiogroup', 'aria-label':'نمط المعالجة' },
    modes.map(m => {
      const b = el('button', { class:'card modecard', type:'button', role:'radio', 'data-mode':m.id,
        'aria-checked': (wizard.mode || 'strict') === m.id ? 'true' : 'false' }, [
        el('span', { class:'modecard__t', text:m.t }),
        el('span', { class:'modecard__d', text:m.d })
      ]);
      b.addEventListener('click', () => {
        wizard.mode = m.id;
        wrap.querySelectorAll('[data-mode]').forEach(x =>
          x.setAttribute('aria-checked', x.getAttribute('data-mode') === m.id ? 'true' : 'false'));
      });
      return b;
    }));

  /* أين تُدرَّس؟ — بلا هذا تضيع المادة في بحر المنصة ولا يجدها من يحتاجها.
     نكتب الاسم ولا نختار من قائمة: الجامعات العربية أكثر من أن تُحصى سلفًا،
     والخادم يوحّد الإملاء فلا تنقسم الجامعة الواحدة إلى عشر. */
  /*
    ★ الملء التلقائي من انتماء الطالب.
    من حدّد جامعته في حسابه لا يعيد كتابتها مع كل مادة — وإعادة الكتابة
    ليست مجرد إزعاج: هي المصدر الأول لتهجئات مختلفة تفتّت الجامعة الواحدة.
    ولا نطمس ما كتبه بيده: نملأ الفارغ فقط.
  */
  const mine = QBANK.campus ? QBANK.campus.cached() : null;
  if (mine && mine.university_id){
    if (!wizard.country)    wizard.country    = mine.country || '';
    if (!wizard.university) wizard.university = mine.university || '';
    if (!wizard.college)    wizard.college    = mine.college || '';
  }

  const countryIn = el('select', { class:'input', 'aria-label':'الدولة' });
  countryIn.appendChild(el('option', { value:'', text:'— اختر الدولة —' }));
  Object.keys(QBANK.explore ? { SA:1,EG:1,JO:1,AE:1,KW:1,QA:1,BH:1,OM:1,IQ:1,MA:1,DZ:1,TN:1,SD:1,YE:1,LY:1,SY:1,LB:1,PS:1 } : {})
    .forEach(c => countryIn.appendChild(el('option', { value:c, text: QBANK.explore.countryName(c) })));
  countryIn.value = wizard.country || '';
  countryIn.addEventListener('change', () => { wizard.country = countryIn.value; });

  const uniIn = el('input', { class:'input', value: wizard.university || '',
    placeholder:'مثال: جامعة نجران', list:'uniList' });
  uniIn.addEventListener('input', () => { wizard.university = uniIn.value; });

  const colIn = el('input', { class:'input', value: wizard.college || '',
    placeholder:'مثال: كلية العلوم الطبية التطبيقية' });
  colIn.addEventListener('input', () => { wizard.college = colIn.value; });

  const codeIn = el('input', { class:'input', dir:'ltr', value: wizard.courseCode || '',
    placeholder:'EMS 301' });
  codeIn.addEventListener('input', () => { wizard.courseCode = codeIn.value; });

  /*
    ★ «رفعها» — للمشرف وحده.
    علي يرفع بنوكًا أرسلها له الطلاب، فيختار هنا اسم الطالب لتُكتب المادة
    باسمه من أول المسوّدة. «أنا» هو الافتراض فلا يتغيّر شيء لمن يرفع لنفسه.
  */
  let uploaderRow = null;
  if (QBANK.views.uploaderPick && QBANK.uploader && QBANK.uploader.isAdmin()){
    const u = QBANK.api.user() || {};
    uploaderRow = el('div', { class:'field', style:'margin:0;grid-column:1/-1' }, [
      el('span', { class:'field__label', text:'رفعها — تُنسب المادة إليه ويُحسب له عائدها' }),
      QBANK.views.uploaderPick({
        value: wizard.uploader || null, me: { id: u.id, name:'أنا (المشرف)' }, collapsed: true,
        onPick: v => { wizard.uploader = (v && v.id !== u.id) ? v : null; }
      })
    ]);
  }

  return el('div', { class:'card stack' }, [
    el('label', { class:'field', style:'margin:0' }, [
      el('span', { class:'field__label', text:'اسم المادة *' }), nameIn, nameMsg ]),
    el('div', { class:'ad-edit ad-edit--2' }, [
      el('label', { class:'field', style:'margin:0' }, [
        el('span', { class:'field__label', text:'الدولة' }), countryIn ]),
      el('label', { class:'field', style:'margin:0' }, [
        el('span', { class:'field__label', text:'الجامعة' }), uniIn ]),
      el('label', { class:'field', style:'margin:0' }, [
        el('span', { class:'field__label', text:'الكلية' }), colIn ]),
      el('label', { class:'field', style:'margin:0' }, [
        el('span', { class:'field__label', text:'رمز المقرر — اختياري' }), codeIn ]),
      uploaderRow
    ]),
    el('p', { class:'field__hint', style:'margin:0',
      text:'هذه البيانات هي ما يجعل زميلك في جامعتك يجد مادتك. اكتبها ولو تقريبية.' }),
    el('span', { class:'field__label', text:'كيف نعالج أسئلتك؟' }),
    wrap
  ]);
}

/* ═══ دليل التنسيق: قالبان جاهزان وفاحص فوري ═══
   الطالب اليوم يكتشف أن ملفه غير مفهوم بعد الرفع والانتظار. هنا يعرف قبلها. */
function formatGuide(){
  const box = el('details', { class:'fmt' });
  box.appendChild(el('summary', { class:'fmt__sum' }, [
    el('span', { text:'كيف أجهّز ملفي؟' }),
    el('span', { class:'fmt__hint', text:'قالبان جاهزان وفاحص فوري' })
  ]));

  const body = el('div', { class:'fmt__body' });

  // ما يحدث للملف — خطوات لا وعود
  body.appendChild(el('ol', { class:'fmt__pipe' }, QBANK.formats.pipeline.map((p, i) =>
    el('li', {}, [
      el('span', { class:'fmt__pn num', text: QBANK.views.arNum(i + 1) }),
      el('span', {}, [
        el('b', { text: p[0] }),
        el('span', { class:'fmt__pd', text: p[1] })
      ])
    ]))));

  // القالبان
  QBANK.formats.list.forEach(f => {
    const pre = el('pre', { class:'fmt__code', dir:'auto' }, [ el('code', { text: f.sample }) ]);
    const copy = el('button', { class:'btn btn--sm', type:'button', text:'انسخ القالب' });
    copy.addEventListener('click', () => {
      const done = (navigator.clipboard && navigator.clipboard.writeText)
        ? (navigator.clipboard.writeText(f.sample), true)
        : (function(){ try{
              const ta = document.createElement('textarea'); ta.value = f.sample;
              document.body.appendChild(ta); ta.select();
              const r = document.execCommand('copy'); ta.remove(); return r;
            } catch(e){ return false; } })();
      QBANK.toast(done ? 'نُسخ القالب — الصقه في ملفك' : 'حدّد النص وانسخه يدويًا');
    });
    body.appendChild(el('section', { class:'fmt__card', 'data-fmt': f.id }, [
      el('h3', { class:'fmt__t', text: f.title }),
      el('p', { class:'fmt__when', text: f.when }),
      el('ul', { class:'fmt__rules' }, f.rules.map(r => el('li', { text: r }))),
      pre,
      el('div', { class:'row' }, [ copy ])
    ]));
  });

  // الفاحص: يلصق الطالب جزءًا من ملفه فيرى النتيجة فورًا
  const ta = el('textarea', { class:'input', rows:'4',
    placeholder:'الصق هنا سؤالين أو ثلاثة من ملفك…', 'aria-label':'فاحص التنسيق' });
  const out = el('p', { class:'fmt__out', role:'status' });
  ta.addEventListener('input', () => {
    const v = ta.value.trim();
    if (!v){ out.textContent = ''; out.className = 'fmt__out'; return; }
    const r = QBANK.formats.check(v);
    if (!r.ok){
      out.className = 'fmt__out is-no';
      out.textContent = 'لم نتعرّف على سؤال واحد. تأكد أن كل سؤال يبدأ برقمه ثم نقطة، مثل ‎1.‎';
      return;
    }
    out.className = 'fmt__out is-ok';
    out.textContent = 'وجدنا ' + QBANK.views.arNum(r.questions) + ' سؤالًا · '
      + QBANK.views.arNum(r.withOptions) + ' بخيارات · '
      + QBANK.views.arNum(r.withAnswer) + ' بإجابة معروفة';
  });
  body.appendChild(el('section', { class:'fmt__card fmt__card--check' }, [
    el('h3', { class:'fmt__t', text:'افحص تنسيقك الآن' }),
    el('p', { class:'fmt__when', text:'الصق جزءًا من ملفك — لا يُرفع شيء، الفحص في جهازك.' }),
    ta, out
  ]));

  box.appendChild(body);
  return box;
}

/* الخطوة ١: سحب وإفلات أو اختيار ملف */
function stepRead(box, rerender){
  /*
    الكتابة اليدوية شاشةٌ قائمة بذاتها لا حقلٌ في الأسفل: من اختارها
    يريدها كاملة، ومزاحمتُها لمنطقة الرفع تُربك الاثنين.
  */
  if (wizard.manualMode) {
    box.appendChild(subjectMeta());
    box.appendChild(QBANK.views.manualComposer(
      (raw, dropped) => {
        if (!requireName()) return;
        wizard.raw = raw; wizard.total = raw.length;
        wizard.filename = 'كُتبت يدويًا';
        wizard.slug = '';                 // الخادم يولّده من الاسم عند النشر
        wizard.readBy = 'manual'; wizard.unverified = 0;
        wizard.manualMode = false;
        wizard.step = 2;
        if (dropped) QBANK.toast('استُبعد ' + QBANK.views.arNum(dropped) +
                                 ' سؤالًا ناقصًا — أكمله لاحقًا من المحرر');
        QBANK.manual.clear();
        rerender();
      },
      () => { wizard.manualMode = false; rerender(); }
    ));
    return;
  }

  /*
    ★ الطريق الثاني للطالب: يرسل ولا يرفع.
    من لا يريد أن يصير محرّرًا يكتب اسم المادة ويرفق ملفه، والمشرف يتولّى
    الباقي. الشاشة قائمة بذاتها كالكتابة اليدوية — مزاحمتها لمنطقة الرفع
    تُربك الاثنين.
  */
  if (wizard.requestMode && QBANK.views.requestForm){
    box.appendChild(QBANK.views.requestForm(() => { wizard.requestMode = false; rerender(); }));
    return;
  }

  /* ★ العودة قبل البداية: مسوّدةٌ لم تكتمل تُعرض أولًا كي لا يبدأ صاحبها من الصفر */
  if (QBANK.views.resumeBanner) box.appendChild(QBANK.views.resumeBanner());

  /*
    ★ طلبٌ من طالب: المشرف لا يعيد كتابة شيء.
    الاسم جاء مع الطلب، والرافع هو صاحبه، والملف في المخزن — فالضغطة
    الواحدة تقرؤه وتمضي إلى المراجعة. وحال الطلب تصير «قيد الرفع» لحظتها
    كي يرى صاحبه أن أحدًا بدأ، ولا يظنّ طلبه ضائعًا.
  */
  if (wizard.reqPath && !(wizard.raw || []).length){
    const goRead = el('button', { class:'btn btn--block', type:'button', text:'⇣ اقرأ ملف الطالب الآن' });
    goRead.addEventListener('click', () => { goRead.disabled = true; runStored(); });
    box.appendChild(el('div', { class:'card stack reqbanner' }, [
      el('h3', { style:'margin:0', text:'طلب رفع من ' + (wizard.reqStudent || 'طالب') }),
      el('p', { class:'field__hint', style:'margin:0', text:
        'المادة: ' + (wizard.subjectName || '—') +
        (wizard.reqFile ? ' · الملف: ' + wizard.reqFile : '') +
        ' — ستُنشر باسمه هو.' }),
      wizard.reqNote ? el('p', { class:'field__hint', style:'margin:0', text:'ملاحظته: ' + wizard.reqNote }) : null,
      goRead
    ]));
  }

  box.appendChild(subjectMeta());

  /*
    ★ الاسم يُطلب قبل الملف لا بعده.
    من رفع ملفًا ثم قيل له «الاسم مطلوب» يشعر أنه أضاع دقيقة انتظارٍ
    لسببٍ كان يمكن أن يُقال في أوله. والحقل فوق الصفحة أصلًا — فالطلب
    قبل الرفع تذكيرٌ، وبعده عقوبة.
  */
  function requireName(){
    const inp = box.querySelector('#subjName');
    if (wizard.subjectName && wizard.subjectName.trim()) return true;
    if (inp) {
      const m = inp.parentNode.querySelector('.field__hint');
      if (m) m.textContent = '⚠ اكتب اسم المادة أولًا — به يجدها زملاؤك.';
      inp.focus();
      try { inp.scrollIntoView({ block:'center', behavior:'smooth' }); } catch(e){}
    }
    return false;
  }

  box.appendChild(formatGuide());
  const drop = el('div', { class:'drop', tabindex:'0', role:'button', 'aria-label':'اختر ملف أسئلة' }, [
    el('span', { class:'empty__ico', 'aria-hidden':'true' }, [ QBANK.ico('upload', { size:40, weight:1.6 }) ]),
    el('p', { class:'empty__title', text:'أسقط ملف الأسئلة هنا أو اضغط للاختيار' }),
    /* ★ الصور مذكورةٌ أولَ السطر لا آخره: هي أكثر ما يملكه الطلاب، وكانت
       أول ما نردّه — والطالب الذي رُدّ مرةً لا يقرأ التذييل ليعرف أن الباب فُتح. */
    el('p', { class:'empty__text', text:'صور (لقطات شاشة أو تصوير ورقة — اختر عدّة صور معًا)، ' +
      'أو PDF أو Word أو PowerPoint أو نص. ارفعه كما هو: يقرؤه الذكاء مهما كان شكله.' })
  ]);
  const fileIn = el('input', { type:'file', style:'display:none', 'aria-hidden':'true', multiple:true,
    accept:'.pdf,.docx,.pptx,.txt,.text,.md,.csv,.tsv,.rtf,.html,.htm,.png,.jpg,.jpeg,.webp,.gif,.heic,image/*' });
  const msg = el('p', { class:'field__hint', role:'status' });

  /*
    ═══ شريط القراءة ═══
    ★ «جارٍ قراءة الملف…» سطرٌ جامد لا يقول شيئًا.
    قراءة ملفٍ من ٦٠ صفحة قد تبلغ دقيقتين: يُقرأ من الجهاز، ثم يُرفع، ثم
    يُستخرج نصّه، ثم يقرؤه الذكاء إن لزم. والطالب أمام سطرٍ لا يتحرّك
    يستنتج العطل ويُغلق الصفحة على عملٍ يجري.

    فأصبح: شريطٌ حقيقي لقراءة الجهاز (FileReader يعطي تقدّمًا فعليًا)، ثم
    شريطٌ متحرّك للمراحل التي لا يُعرف طولها، مع عدّاد ثوانٍ يُثبت أن
    شيئًا يجري، ونصٌّ يسمّي المرحلة الجارية بعينها.
  */
  const rdBar = el('div', { class:'meter', role:'progressbar',
    'aria-valuemin':'0', 'aria-valuemax':'100', 'aria-valuenow':'0' },
    [ el('div', { class:'meter__fill', style:'width:0%' }) ]);
  const rdCard = el('div', { class:'card stack', hidden:true }, [
    el('p', { class:'revcard__t', id:'rdT', text:'' }),
    rdBar,
    el('p', { class:'field__hint', id:'rdS', role:'status', text:'' })
  ]);
  const rdT = () => rdCard.querySelector('#rdT');
  const rdS = () => rdCard.querySelector('#rdS');

  function phase(title, note, pct){
    rdCard.hidden = false;
    rdT().textContent = title;
    rdS().textContent = note || '';
    if (typeof pct === 'number') {
      rdBar.classList.remove('meter--busy');
      rdBar.firstChild.style.width = pct + '%';
      rdBar.setAttribute('aria-valuenow', String(Math.round(pct)));
    } else {
      // مرحلةٌ لا يُعرف طولها: الشريط يمتلئ ويتحرّك — الحركة تقول «يعمل»
      rdBar.classList.add('meter--busy');
      rdBar.firstChild.style.width = '100%';
      rdBar.removeAttribute('aria-valuenow');
    }
  }

  const IMG_RE = /\.(png|jpe?g|webp|gif|heic|heif)$/i;
  const isImg = f => f && (IMG_RE.test(f.name) || /^image\//.test(f.type || ''));

  /*
    ★ الصورة تُصغَّر في الجهاز قبل الرفع.
    صورة الجوّال ٤–٦ ميغابايت، وثلاثٌ منها تفوق ما يقبله الخادم في طلبٍ
    واحد. والنموذج لا يحتاج أكثر من ~١٦٠٠ بكسل عرضًا ليقرأ سطرًا مطبوعًا.
    فنرسم الصورة على لوحةٍ بهذا العرض ونُصدّرها JPEG — فتنزل إلى بضع مئات
    من الكيلوبايتات بلا أن يضيع حرف. وإن فشل الرسم (صيغة لا يفهمها
    المتصفح مثل HEIC على غير آبل) أرسلناها كما هي وتركنا الحكم للخادم.
  */
  function shrinkImage(file){
    return new Promise(resolve => {
      const fallback = () => {
        const rd = new FileReader();
        rd.onload = () => resolve({ name: file.name, b64: String(rd.result).split(',')[1] || '' });
        rd.onerror = () => resolve({ name: file.name, b64: '' });
        rd.readAsDataURL(file);
      };
      try {
        const url = URL.createObjectURL(file);
        const im = new Image();
        im.onload = () => {
          try {
            const MAX = 1600;
            const k = Math.min(1, MAX / Math.max(im.naturalWidth, im.naturalHeight));
            const c = document.createElement('canvas');
            c.width = Math.max(1, Math.round(im.naturalWidth * k));
            c.height = Math.max(1, Math.round(im.naturalHeight * k));
            c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
            const out = c.toDataURL('image/jpeg', 0.82);
            URL.revokeObjectURL(url);
            resolve({ name: file.name.replace(/\.[^.]+$/, '') + '.jpg', b64: out.split(',')[1] || '' });
          } catch(e){ URL.revokeObjectURL(url); fallback(); }
        };
        im.onerror = () => { URL.revokeObjectURL(url); fallback(); };
        im.src = url;
      } catch(e){ fallback(); }
    });
  }

  async function handleImages(files){
    msg.textContent = '';
    const list = Array.prototype.slice.call(files).filter(isImg).slice(0, 20);
    if (!list.length) return;
    const imgs = [];
    for (let i = 0; i < list.length; i++){
      phase('تُجهَّز الصور من جهازك', 'الصورة ' + QBANK.views.arNum(i + 1) + ' من ' +
        QBANK.views.arNum(list.length), Math.round(i / list.length * 100));
      const r = await shrinkImage(list[i]);
      if (r.b64) imgs.push({ filename: r.name, content_base64: r.b64 });
    }
    if (!imgs.length){ rdCard.hidden = true; msg.textContent = '⚠ تعذّرت قراءة الصور من جهازك.'; return; }

    const t0 = Date.now();
    const tick = setInterval(() => {
      const sec = Math.round((Date.now() - t0) / 1000);
      phase('يقرأ الذكاءُ الصور', QBANK.views.arNum(imgs.length) + ' صورة — ' + sec +
        ' ثانية. القراءة من الصور أبطأ من النص وقد تأخذ دقيقة.');
    }, 1000);
    phase('تُرفع الصور', 'ثم يقرؤها الذكاء ويستخرج الأسئلة.');

    wizard = await QBANK.admin.wizardIngestImages(wizard, imgs);
    clearInterval(tick);
    rdCard.hidden = true;
    rdBar.classList.remove('meter--busy');
    if (wizard.error) { msg.textContent = '⚠ ' + wizard.error; return; }
    rerender();
  }

  /* قراءة ملفٍ في المخزن — طلبُ طالبٍ يرفعه المشرف. لا اختيار ملف ولا رفع ثانٍ */
  async function runStored(){
    msg.textContent = '';
    if (wizard.requestId && QBANK.requests)
      QBANK.requests.setStatus(wizard.requestId, 'doing').catch(() => {});
    const t0 = Date.now();
    let tick = setInterval(() => {
      phase('يُقرأ ملف الطالب على الخادم',
        'استخراج النص ثم التعرّف على الأسئلة — ' + Math.round((Date.now() - t0) / 1000) + ' ثانية.');
    }, 1000);
    phase('يُجلب الملف من المخزن', wizard.reqFile || '');
    /* الشريط أسفل الشاشة والزرّ أعلاها — نُنزل المشرف إليه كي لا يظنّ أن شيئًا لم يحدث */
    try { rdCard.scrollIntoView({ block:'center', behavior:'smooth' }); } catch(e){}
    wizard = await QBANK.admin.wizardIngest(wizard, wizard.reqFile || 'ملف الطالب', null, false, {
      storagePath: wizard.reqPath,
      onPart: (done, total) => { clearInterval(tick); tick = null;
        phase('يقرأ الذكاءُ الملف على أجزاء', 'قُرئ ' + QBANK.views.arNum(done) + ' من ' +
          QBANK.views.arNum(total) + ' أجزاء', Math.round(done / total * 100)); }
    });
    if (tick) clearInterval(tick);
    rdCard.hidden = true; rdBar.classList.remove('meter--busy');
    if (wizard.error) { msg.textContent = '⚠ ' + wizard.error; return; }
    rerender();
  }

  async function handle(file){
    if (!file) return;
    msg.textContent = '';
    const kb = Math.round(file.size / 1024);
    phase('يُقرأ «' + file.name + '» من جهازك', kb + ' ك.ب', 0);

    /*
      ★ الملف الكبير لا يمرّ بجسم الطلب: يُرفع إلى المخزن ويُرسل مساره.
      حدّ Vercel ٤٫٥ ميغابايت كان يُسقط ملفات الدكاترة بصمت.
    */
    let storagePath = null;
    if (file.size > QBANK.admin.BIG_FILE){
      phase('يُرفع «' + file.name + '» إلى المخزن', kb + ' ك.ب — الملفات الكبيرة تُرفع مباشرةً لا عبر الخادم.', 5);
      const up = await QBANK.admin.storageUpload(file);
      if (!up.ok){ rdCard.hidden = true; msg.textContent = '⚠ ' + up.error; return; }
      storagePath = up.path;
    }
    const b64 = storagePath ? 'stored' : await new Promise(resolve => {
      const rd = new FileReader();
      // تقدّمٌ حقيقي لا مُتخيَّل: المتصفح يقوله لنا فنقوله للطالب
      rd.onprogress = e => {
        if (e.lengthComputable) phase('يُقرأ «' + file.name + '» من جهازك',
          kb + ' ك.ب', Math.round(e.loaded / e.total * 100));
      };
      rd.onload = () => resolve(String(rd.result).split(',')[1] || '');
      rd.onerror = () => resolve('');
      rd.readAsDataURL(file);
    });
    if (!b64) { rdCard.hidden = true; msg.textContent = '⚠ تعذّرت قراءة الملف من جهازك.'; return; }

    // عدّاد الثواني: الرقم الذي يتقدّم يفرّق بين «بطيء» و«معطّل»
    const t0 = Date.now();
    let tick = setInterval(() => {
      const s = Math.round((Date.now() - t0) / 1000);
      phase('يُحلَّل ملفك على الخادم',
        'استخراج النص ثم التعرّف على الأسئلة — ' + s + ' ثانية. ' +
        'الملفات غير المرتّبة يقرؤها الذكاء وقد تأخذ دقيقة.');
    }, 1000);
    phase('يُرفع ملفك', 'ثم يُستخرج نصّه ويُقسَّم أسئلة.');

    wizard = await QBANK.admin.wizardIngest(wizard, file.name, storagePath ? null : b64, false, {
      storagePath,
      /* الأجزاء: الطالب يرى «قُرئ ٤ من ١٢» — عدّادٌ يتقدّم يفرّق بين بطيء ومعطّل */
      onPart: (done, total) => { clearInterval(tick); tick = null;
        phase('يقرأ الذكاءُ ملفك على أجزاء', 'قُرئ ' + QBANK.views.arNum(done) + ' من ' + QBANK.views.arNum(total) +
          ' أجزاء — ثلاثة معًا، وكل جزء بضع ثوانٍ.', Math.round(done / total * 100)); }
    });
    if (tick) clearInterval(tick);
    rdCard.hidden = true;
    rdBar.classList.remove('meter--busy');
    if (wizard.error) { msg.textContent = '⚠ ' + wizard.error; return; }
    rerender();
  }
  drop.addEventListener('click', () => { if (requireName()) fileIn.click(); });
  drop.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { if (requireName()) fileIn.click(); } });
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('is-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
  const route = files => {
    if (!files || !files.length) return;
    if (isImg(files[0])) handleImages(files); else handle(files[0]);
  };
  drop.addEventListener('drop', e => {
    e.preventDefault(); drop.classList.remove('is-over');
    if (requireName()) route(e.dataTransfer.files);
  });
  fileIn.addEventListener('change', () => route(fileIn.files));

  /*
    ★ الطريق الثاني: من لا ملف عنده.
    الرفع بملف يفترض أن للطالب ملفًا، وكثيرٌ منهم لا ملف عنده: أسئلةٌ
    سمعها في المحاضرة أو صوّرها زميله. كان هؤلاء خارج المنصة كلها — لا
    لأنهم بلا محتوى، بل لأننا طلبنا المحتوى بصيغةٍ واحدة.
  */
  const manualBtn = el('button', { class:'btn btn--ghost btn--block', type:'button',
    text:'✎ أو اكتب الأسئلة بنفسك' });
  manualBtn.addEventListener('click', () => {
    if (!requireName()) return;
    wizard.manualMode = true; rerender();
  });

  box.appendChild(drop); box.appendChild(fileIn); box.appendChild(rdCard); box.appendChild(msg);
  box.appendChild(el('p', { class:'field__hint', style:'text-align:center;margin:2px 0',
                            text:'— أو —' }));
  box.appendChild(manualBtn);

  /*
    ★ الخيار الثاني يُعرض هنا لا في صفحة أخرى.
    مكانه الطبيعي حيث يقف الطالب متردّدًا أمام معالجٍ من أربع خطوات. ولا
    يُعرض للمشرف (يرفع بنفسه أصلًا) ولا وهو ينفّذ طلبًا قائمًا.
  */
  const isAdmin = !!(QBANK.uploader && QBANK.uploader.isAdmin());
  if (!isAdmin && !wizard.reqPath && QBANK.views.requestInvite)
    box.appendChild(QBANK.views.requestInvite(() => { wizard.requestMode = true; rerender(); }));
}

/* الخطوة ٢: التقدير ثم التشغيل بدفعات مع شريط «٨٠ من ٣٠٠» */
function stepEnrich(box, rerender){
  const est = QBANK.admin.estimate(wizard);
  const bar = el('div', { class:'meter', role:'progressbar', 'aria-valuemin':'0',
    'aria-valuemax': String(wizard.total), 'aria-valuenow': String(wizard.done) }, [
    el('div', { class:'meter__fill', style:'width:' + (wizard.total ? wizard.done / wizard.total * 100 : 0) + '%' })
  ]);
  const label = el('p', { class:'page__sub num',
    text: wizard.done + ' من ' + wizard.total + ' · ' +
          (wizard.total ? Math.round(wizard.done / wizard.total * 100) : 0) + '٪' });
  /* سطرٌ ثانٍ يقول ماذا يجري الآن — الرقم الثابت وحده يُقرأ تعليقًا */
  const sub = el('p', { class:'field__hint', role:'status', text:'' });
  const msg = el('p', { class:'field__hint', role:'status' });
  const go = el('button', { class:'btn btn--block', type:'button',
    text: wizard.done ? 'أكمل من حيث توقفت (' + wizard.done + ')' : 'شغّل الذكاء الآن' });

  go.addEventListener('click', async () => {
    go.setAttribute('aria-disabled','true'); go.textContent = 'جارٍ المعالجة…';
    const t0 = Date.now();
    wizard = await QBANK.admin.wizardEnrich(wizard, (done, total, st) => {
      const pct = total ? Math.round(done / total * 100) : 0;
      label.textContent = done + ' من ' + total + ' · ' + pct + '٪';
      bar.setAttribute('aria-valuenow', String(done));
      bar.firstChild.style.width = pct + '%';
      /*
        ★ الحركة أثناء الدفعة لا بين الدفعتين.
        الدفعة أربعون سؤالًا تستغرق دقيقة أو دقيقتين، والشريط يقفز عند
        نهايتها فقط — فيرى الطالب شريطًا جامدًا ورقمًا لا يتحرّك دقيقتين،
        ويستنتج أن التطبيق علّق فيُغلقه. الخطوط المتحرّكة تقول «يعمل».
      */
      if (!st) return;
      bar.classList.toggle('meter--busy', !!st.running);
      if (st.running) {
        const mins = Math.max(1, Math.round((st.batches - st.batch + 1) * 1.2));
        sub.textContent = 'يعالج الذكاء الدفعة ' + st.batch + ' من ' + st.batches +
                          ' — يتبقّى ~' + mins + ' دقيقة. يمكنك إغلاق الصفحة، ' +
                          'وما اكتمل محفوظ ويُستأنف من حيث توقّف.';
      } else {
        const sec = Math.round((Date.now() - t0) / 1000);
        sub.textContent = 'اكتملت الدفعة ' + st.batch + ' من ' + st.batches +
                          ' (' + sec + ' ثانية حتى الآن).';
      }
    });
    bar.classList.remove('meter--busy');
    if (wizard.error) {
      msg.textContent = '⚠ ' + wizard.error;
      go.removeAttribute('aria-disabled'); go.textContent = 'أعد المحاولة';
      /*
        ★ بابٌ لا جدار.
        حين ينفد ما عند المزوّد لا حيلة للطالب في «أعد المحاولة» — وقد رفع
        ملفه قبل اختباره بساعات. فنعرض عليه ما نملكه فعلًا: أسئلته كما هي،
        منشورةً الآن، وله أن يثريها متى عاد الذكاء. مادةٌ ناقصة الليلةَ خيرٌ
        من مادةٍ كاملة بعد الاختبار.
      */
      const quota = wizard.errorKind === 'quota_day' || wizard.errorKind === 'quota_minute' ||
                    wizard.errorKind === 'overloaded';
      if (quota && !box.querySelector('.js-plainout')) {
        const out = el('button', { class:'btn btn--soft btn--block js-plainout', type:'button',
          text:'انشر أسئلتك الآن بلا إثراء' });
        out.addEventListener('click', () => {
          wizard.enrich = false; wizard.error = ''; wizard.errorKind = '';
          wizard = QBANK.admin.plainEnrich(wizard);
          QBANK.admin.saveDraft(wizard);
          rerender();
        });
        msg.parentNode.insertBefore(out, msg.nextSibling);
      }
      return;
    }
    rerender();
  });

  /*
    ★ كيف قُرئ ملفك — يُقال لا يُخبأ.
    الرافع يعرف ملفه أكثر منا: هو وحده يستطيع أن يقول «فيه ثمانون سؤالًا
    لا عشرون». فنُريه العدد ومصدره ونضع بيده زرًّا يأمر بإعادة القراءة
    بالذكاء. الشفافية هنا ليست أدبًا فقط — هي آليةُ تصحيحٍ لا نملك غيرها.
  */
  const N = QBANK.views.arNum;   // يُستعمل من هنا فصاعدًا — قبل استعماله لا بعده
  const readLine = el('p', { class:'field__hint', text:
    wizard.fromImages
      /* ★ من صورة: لا مصدرَ نصّي نقارن به، فالمراجعة بالعين هي التوثيق —
         ويُقال ذلك صراحةً لا بلغة «لم نجد نصّها» التي تصف ملفًا نصّيًا */
      ? '📷 قرأ الذكاءُ ' + N(wizard.fromImages) + (wizard.fromImages > 1 ? ' صور' : ' صورة') +
        ' واستخرج ' + N(wizard.total) + ' سؤالًا. النسخ من الصور قد يُخطئ في حرفٍ أو رقم — ' +
        'راجع كل سؤال في الخطوة التالية قبل النشر.'
      : (wizard.readBy === 'ai' ? '🧠 قرأ الذكاءُ ملفك واستخرج ' : '⚡ قُرئ ملفك بالقواعد واستُخرج ')
        + N(wizard.total) + ' سؤالًا.'
        + (wizard.unverified ? ' ومنها ' + N(wizard.unverified) +
            ' لم نجد نصّها حرفًا بحرف في الملف — راجعها في الخطوة التالية.' : '') });
  box.appendChild(readLine);
  box.appendChild(sub);

  if (wizard.fileB64){
    const again = el('button', { class:'btn btn--sm btn--ghost', type:'button',
      text: wizard.readBy === 'ai' ? '⟳ أعد القراءة بالذكاء' : '🧠 العدد أقل مما تتوقع؟ اقرأه بالذكاء' });
    again.addEventListener('click', async () => {
      const before = wizard.total;
      again.setAttribute('aria-disabled','true');
      /* عدّادٌ هنا أيضًا: قراءة الذكاء لملفٍ كبير دقيقة أو أكثر، والزرّ
         الصامت طوالها يُقرأ زرًّا معطّلًا لا زرًّا يعمل. */
      const t0 = Date.now();
      const tick = setInterval(() => {
        again.textContent = '… يقرأ الذكاء ملفك (' +
          Math.round((Date.now() - t0) / 1000) + ' ثانية)';
      }, 1000);
      again.textContent = '… يقرأ الذكاء ملفك';
      const w2 = await QBANK.admin.wizardIngest(wizard, wizard.filename, wizard.fileB64, true);
      clearInterval(tick);
      again.removeAttribute('aria-disabled');
      /*
        ★ لا شيء أسوأ من زرٍّ لا يقول ماذا فعل.
        ثلاث نتائج ممكنة، وكانت كلها تبدو واحدة: لا شيء. فإن عجز الذكاء
        قلنا لماذا، وإن لم يجد أكثر قلنا إن القواعد كانت أوفى، وإن وجد
        أكثر ظهر العدد الجديد وحده — والسكوت لا يُشرح شيئًا منها.
      */
      if (w2.error) {
        again.textContent = '🧠 أعد القراءة بالذكاء';
        sub.textContent = '⚠ ' + w2.error;
        return;
      }
      if (w2.total <= before) {
        again.textContent = '🧠 أعد القراءة بالذكاء';
        sub.textContent = 'قرأه الذكاء فلم يجد أكثر من ' + N(before) +
                          ' سؤالًا — قراءة القواعد كانت أوفى، وأبقيناها.';
        return;
      }
      wizard = w2;
      /* الإثراء يبدأ من الصفر بعد قراءة جديدة: الأسئلة تغيّرت، وعدّادٌ
         قديم على أسئلة جديدة يعني تخطّي أسئلة لم تُقرأ قط. */
      wizard.done = 0; wizard.enriched = [];
      QBANK.toast('قرأ الذكاء ' + N(w2.total) + ' سؤالًا');
      rerender();
    });
    box.appendChild(el('p', { class:'stack', style:'margin-bottom:12px' }, [again]));
  }

  /*
    مساران، والفرق بينهما معروض لا مخبوء.
    الطالب لا يعرف ما «الإثراء» حتى يرى ماذا ينقصه بدونه — فنقوله بالأسماء.
  */
  const withoutOpts = wizard.raw.filter(q => !q.has_options).length;
  const noAnswer = wizard.raw.filter(q =>
    !(q.has_options && typeof q.answer === 'number' && q.answer >= 0) && !q.answer_text).length;

  const paths = el('div', { class:'paths', role:'radiogroup', 'aria-label':'طريقة المعالجة' });
  const creditBox = el('div', { class:'costbox', hidden:true });

  function paint(credits){
    const cpq = QBANK.admin.costPerQ(credits);
    const cost = QBANK.admin.creditsNeeded(wizard, cpq);
    const bal = (credits && credits.balance) || 0;
    const enough = bal >= cost;          // وصفرٌ ≤ أي رصيد، فالمجاني كافٍ دائمًا
    wizard.costPerQ = cpq;

    /*
      ★ الافتراض الطموح يجب ألا يورّط الطالب.
      صار المسار الكامل هو المختار ابتداءً، فمن لا يكفيه رصيده كان يجد
      نفسه على مسارٍ محجوب وزرَّ «أثرِ وانشر» معطّلًا بلا سبب ظاهر — طريق
      مسدود عند أول خطوة. فنعيده إلى المجاني تلقائيًا، إلا أن يكون اختار
      المدفوع بيده: اختياره الصريح لا يُلغى، إنما يُصحَّح الافتراضُ وحده.
    */
    /* ورسمة ما قبل وصول الرصيد لا تحكم: رصيدها صفرٌ بحكم الجهل لا بحكم الواقع،
       فلو ارتددنا عندها لبقي الطالب على المجاني حتى لو كان رصيده وافرًا. */
    const known = !!credits;
    if (known && !enough && wizard.enrich && !wizard.pathChosen) wizard.enrich = false;

    paths.innerHTML = '';
    [
      /*
        ★ «الأسئلة كما هي» أولًا وهي الافتراض (بطلب علي: لا حشو، والنص كما
        رُفع). تنشر في ثوانٍ. والإثراء اختيارٌ صريح ثانٍ يأخذ وقته — يُقال
        زمنه بالأرقام كي يختاره من يريده على بيّنة.
      */
      { id:false, t:'الأسئلة والأجوبة كما هي — الآن', price:'مجانًا',
        d:'نصّ أسئلتك وخياراتك وإجاباتك حرفًا بحرف كما في ملفك، جاهزة للاختبار خلال ثوانٍ.',
        miss: 'بلا شرح ولا ترجمة — يمكن إضافتهما لاحقًا من محرّر المادة'
              + (noAnswer ? '. و' + N(noAnswer) + ' سؤالًا بلا إجابة معلنة تضبطها بيدك' : '') },
      /* ★ الثمن يُقال بلسانه: «مجانًا» لا «٠ كوين». */
      { id:true, t:'مع شرح بالذكاء (اختياري)',
        price: cost > 0 ? N(cost) + ' كوين' : 'مجانًا',
        d:'شرح لكل سؤال وترجمته وبطاقة حفظ وتصنيف بالمحاور — النص الأصلي لا يُمسّ. يستغرق نحو '
          + N(Math.max(1, Math.ceil(wizard.raw.length / 24))) + ' دقيقة لـ' + N(wizard.raw.length) + ' سؤالًا.',
        miss: noAnswer ? 'ويستنتج الذكاء إجابات ' + N(noAnswer) + ' سؤالًا لم تُعلَن في ملفك'
                       : 'وكل أسئلتك فيها إجاباتها أصلًا — فلن يُغيّر الذكاء إجابة واحدة' }
    ].forEach(o => {
      const on = wizard.enrich === o.id;
      const blocked = o.id && known && !enough;   // لا نحجب بناءً على جهلٍ بالرصيد
      const b = el('button', { class:'path' + (on ? ' is-on' : '') + (blocked ? ' is-blocked' : ''),
        type:'button', role:'radio', 'data-path': String(o.id),
        'aria-checked': on ? 'true' : 'false' }, [
        el('span', { class:'path__h' }, [
          el('span', { class:'path__t', text:o.t }),
          el('span', { class:'path__p num', text:o.price })
        ]),
        el('span', { class:'path__d', text:o.d }),
        el('span', { class:'path__m', text:o.miss })
      ]);
      b.addEventListener('click', () => {
        if (blocked) return;
        wizard.enrich = o.id;
        wizard.pathChosen = true;   // اختيار بيده — لا يعيده الافتراض بعد اليوم
        paint(credits);
      });
      paths.appendChild(b);
    });

    /* ★ صندوق الرصيد يظهر أيضًا حين يُحجب المدفوع لنقص الرصيد:
       الحجب بلا رقمٍ يشرحه لغزٌ، ومع «ينقصك كذا» يصير دعوةً للشحن. */
    // لا محفظة حيث لا ثمن: صندوق الرصيد يختفي كليًّا حين يكون الإثراء مجانيًا
    const showCost = cost > 0 && (wizard.enrich || (known && !enough));
    creditBox.hidden = !showCost;
    creditBox.innerHTML = '';
    if (showCost){
      creditBox.appendChild(el('span', { class:'costbox__l', text:'رصيدك' }));
      creditBox.appendChild(el('span', { class:'costbox__n num',
        text: N(bal) + ' كوين' + (enough ? '' : ' — لا يكفي') }));
      creditBox.appendChild(el('span', { class:'costbox__s',
        text: enough ? 'سيتبقى لك ' + N(bal - cost) + ' كوين بعد الإثراء.'
                     : 'ينقصك ' + N(cost - bal) + ' كوين لإثراء هذا الملف.' }));
      /* داخل التطبيق لا «اشحن»: الشحن شراء، والشراء في التطبيق لأبل وحدها (٣.١.١) */
      if (!enough && !(typeof window !== 'undefined' && window.QBANK_NATIVE_APP))
        creditBox.appendChild(el('a', { class:'btn btn--sm', href:'#/account', text:'اشحن رصيدك' }));
    }
    go.textContent = wizard.done ? 'أكمل من حيث توقفت (' + wizard.done + ')'
                    : (wizard.enrich ? 'أثرِ بالذكاء ثم راجع' : 'تابع للمراجعة والنشر');
    go.setAttribute('aria-disabled', (wizard.enrich && !enough) ? 'true' : 'false');
  }

  paint(null);
  QBANK.api.rpc('my_credits').then(r => {
    if (!paths.isConnected) return;
    if (r.ok && r.data && !r.data.error) paint(r.data);
  });

  box.appendChild(el('div', { class:'card stack' }, [
    el('h2', { text:'كيف ننشرها؟' }),
    el('div', { class:'row' }, [
      el('span', { class:'badge num', text: est.questions + ' سؤالًا' }),
      withoutOpts ? el('span', { class:'badge badge--warn num',
        text: N(withoutOpts) + ' بلا خيارات' }) : null,
      el('span', { class:'badge', text:'المسوّدة تُحفظ بعد كل دفعة' })
    ]),
    paths, creditBox, bar, label, go, msg
  ]));
}

/* الخطوة ٣: المراجعة — بطاقة لكل سؤال، تغيير الإجابة بضغطة، وسوم حمراء للمستنتَج */
function stepReview(box, rerender){
  /*
    ★ لا نشر بلا سؤال واحد.
    كانت الشاشة تُرسم فارغة ويبقى زر «تابع للنشر» تحتها، فيُنشر بنك خالٍ.
    والحارس هنا ليس تكرارًا لحارس الاستيراد: مسوّدة قديمة محفوظة قد تصل
    إلى هنا فارغة من طريق آخر — وكل باب إلى النشر يحتاج قفله.
  */
  if (!wizard.enriched || !wizard.enriched.length) {
    box.appendChild(QBANK.views.empty('⚠', 'لا أسئلة في هذه المسوّدة',
      'لم يصل شيء من خطوة القراءة. ارجع وارفع الملف مرة أخرى — وتأكد أن تنسيقه يطابق القالب.'));
    const back = el('button', { class:'btn btn--block', type:'button', text:'← ارجع وارفع ملفًا آخر' });
    back.addEventListener('click', () => {
      wizard.step = 1; wizard.raw = []; wizard.enriched = []; wizard.total = 0;
      wizard.error = ''; rerender();
    });
    box.appendChild(back);
    return;
  }

  const dups = QBANK.admin.findDuplicates(wizard.enriched);
  const dupSet = new Set(dups.map(d => d.index));
  if (dups.length) box.appendChild(el('p', { class:'row' }, [
    el('span', { class:'badge badge--warn num', text: 'تنبيه: ' + dups.length + ' سؤالًا مكررًا — موسوم لا محذوف' })
  ]));

  wizard.enriched.forEach((q, qi) => {
    const opts = el('div', { class:'stack q__opts' }, q.options.map((opt, oi) => {
      const b = el('button', { class:'opt' + (q.answer === oi ? ' is-answer' : ''), type:'button' }, [
        el('span', { class:'opt__mark', 'aria-hidden':'true', text: q.answer === oi ? '✓' : '' }),
        el('span', { class:'ltr', text: opt })
      ]);
      // المشرف يغيّر الإجابة بضغطة على أي خيار — والتغيير يمسح وسم «مستنتجة»
      b.addEventListener('click', () => { q.answer = oi; q.derived = false; rerender(); });
      return b;
    }));
    const badges = el('div', { class:'row' }, [
      el('span', { class:'badge num', text:'س' + (qi + 1) }),
      q.derived ? el('span', { class:'badge badge--bad', text:'⚠ إجابة مستنتجة' }) : null,
      q.opts_built ? el('span', { class:'badge badge--bad', text:'⚠ خيارات مبنية' }) : null,
      dupSet.has(qi) ? el('span', { class:'badge badge--warn', text:'مكرر' }) : null,
      q.topic ? el('span', { class:'badge', text: q.topic }) : null
    ]);
    const impBtn = el('button', { class:'btn btn--sm ' + (q.important ? 'btn--soft' : 'btn--ghost'), type:'button',
      text: q.important ? '★ مهم' : 'وسمه مهمًا' });
    impBtn.addEventListener('click', () => { q.important = !q.important; rerender(); });
    box.appendChild(el('article', { class:'card stack q' }, [
      badges,
      el('p', { class:'ltr q__text', text: q.q }),
      opts,
      el('div', { class:'row' }, [ impBtn ])
    ]));
  });

  const next = el('button', { class:'btn btn--block', type:'button', text:'راجعتُ الكل — تابع للنشر' });
  next.addEventListener('click', async () => { wizard.step = 4; await QBANK.admin.saveDraft(wizard); rerender(); });
  box.appendChild(next);
}

/* الخطوة ٤: زران — اعتماد ذرّي أو حفظ مخفي */
function stepPublish(box){
  // ★ آخر قفل قبل القاعدة — والقاعدة نفسها تحرس أيضًا (approve_draft)
  if (!wizard.enriched || !wizard.enriched.length) {
    box.appendChild(QBANK.views.empty('⚠', 'لا شيء يُنشر',
      'هذه المسوّدة بلا أسئلة. أعد رفع الملف من الخطوة الأولى.'));
    return;
  }
  const derived = wizard.enriched.filter(q => q.derived).length;

  /*
    لغة التحليل الشامل — الرافع يختار. العربية الافتراض (نمط AMSU: أسئلة
    إنجليزية وشرح عربي)، ومن يريد ماله كله بالإنجليزية فخياره محفوظ.
  */
  wizard.analysisLang = wizard.analysisLang || 'ar';
  const langRow = el('div', { class:'row', role:'group', 'aria-label':'لغة التحليل' }, [
    el('span', { class:'field__hint', text:'لغة الشرح والتحليل:' })
  ]);
  [['ar','عربي'],['en','English']].forEach(([v, label]) => {
    const b = el('button', { class:'btn btn--sm ' + (wizard.analysisLang === v ? 'btn--soft' : 'btn--ghost'),
      type:'button', 'data-lang': v, 'aria-pressed': String(wizard.analysisLang === v), text: label });
    b.addEventListener('click', () => {
      wizard.analysisLang = v;
      langRow.querySelectorAll('[data-lang]').forEach(x => {
        const on = x.getAttribute('data-lang') === v;
        x.className = 'btn btn--sm ' + (on ? 'btn--soft' : 'btn--ghost');
        x.setAttribute('aria-pressed', String(on));
      });
    });
    langRow.appendChild(b);
  });

  /* ومفتاحُه ظاهر: من رتّب أسئلته بقصدٍ (فصلًا فصلًا) له أن يُبقي ترتيبه */
  const shufWrap = el('label', { class:'row', style:'gap:8px;cursor:pointer;align-items:center' });
  const shufIn = el('input', { type:'checkbox' });
  shufIn.checked = wizard.shuffleOnPublish !== false;
  shufIn.addEventListener('change', () => { wizard.shuffleOnPublish = shufIn.checked; });
  shufWrap.appendChild(shufIn);
  shufWrap.appendChild(el('span', { class:'field__hint', style:'margin:0',
    text:'اخلط ترتيب الأسئلة عند النشر — كي لا يحفظ الطالب التسلسل بدل المحتوى' }));

  const pub = el('button', { class:'btn btn--block', type:'button', text:'اعتمد وانشر للطلاب' });
  const hide = el('button', { class:'btn btn--ghost btn--block', type:'button', text:'احفظ مخفية' });
  const msg = el('p', { class:'field__hint', role:'status' });
  /*
    ★ تحذيرٌ يسبق الضغط لا يتبعه.
    إن كانت المسوّدة لم تُحفظ على الخادم، الطالبُ يستحق أن يعرف الآن —
    قبل أن يضغط زرًّا سيفشل — وأن يعرف أن الأسئلة في متصفّحه لم تضِع.
  */
  if (wizard.draftError)
    msg.textContent = '⚠ لم تُحفظ مادتك على الخادم بعد (' + wizard.draftError +
                      '). أسئلتك محفوظة في هذا المتصفح، وسنحاول الحفظ مرة أخرى عند الضغط.';
  async function fire(publish){
    /*
      ★ الحارس الأخير للاسم.
      حارس الخطوة الأولى يكفي للمسار المعتاد، لكن المسوّدة تُستأنف بعد
      يوم، والحقل قد يُفرَّغ، والشاشة تُفتح بمسارها مباشرة. والاسم يُكتب
      في القاعدة هنا — فهنا يجب أن يُتحقّق منه، لا حيث كُتب أول مرة.
    */
    if (!wizard.subjectName || !wizard.subjectName.trim()) {
      msg.textContent = '⚠ اسم المادة مطلوب — ارجع إلى الخطوة الأولى واكتبه.';
      return;
    }
    /*
      ★ الخلط عند النشر.
      الترتيب الذي كتب به الرافعُ أسئلته يحمل معلومةً لا يقصدها: أسئلة
      المحاضرة الأولى أولًا، وما تذكّره أخيرًا في الآخر. فيحفظ الطالب
      التسلسل بدل المحتوى، ويصير ترتيبُه هو ما يُختبر لا فهمُه. والخلط
      مرةً عند النشر أصدق من خلطٍ في كل عرض: البنك ثابت، وترتيبه محايد.
    */
    if (wizard.shuffleOnPublish !== false && Array.isArray(wizard.enriched))
      wizard.enriched = QBANK.manual.shuffle(wizard.enriched);

    msg.textContent = '… يُعتمد';
    const r = await QBANK.admin.approve(wizard, publish);
    if (!r.ok)
      return void (msg.textContent = '⚠ ' + ((r.data && r.data.message) || 'تعذّر الاعتماد — لم يتغير شيء في قاعدة البيانات.'));
    // approve_draft تُرجع معرّف المادة — نختمها بهوية رافعها ونمطه ومساره
    const newId = (typeof r.data === 'string') ? r.data : (r.data && r.data.id) || null;
    const w = wizard;
    await QBANK.admin.stamp(newId, w, publish);
    /*
      ★ الطلب يُختم بمادته لا بكلمة «تمّ».
      صاحبه يفتح «طلباتي» فيجد رابط مادته — وهذه هي اللحظة التي يتأكد فيها
      أن إرساله لم يضِع. وفشل الختم لا يُبطل مادةً أُنشئت: نمضي ونترك
      الطلب في الطابور ليُغلق بيد المشرف.
    */
    if (w.requestId && QBANK.requests)
      await QBANK.requests.setStatus(w.requestId, publish ? 'done' : 'doing', newId).catch(() => {});
    /*
      ★ نُجدّد قائمة المواد قبل أن نُري الرابط.
      القائمة تُجلب مرة عند الإقلاع وتعيش في التخزين المحلي، فالمادة التي
      نُشرت قبل ثانية ليست فيها. وكنّا نعطي الرافع زر «افتح المادة» يقوده
      إلى «المادة غير موجودة» — وهي موجودة، وهو من أنشأها. لا شيء يُحبط
      الرافع مثل أن تختفي مادته لحظة نشرها.
    */
    if (publish) { try { await QBANK.data.refreshPack(); } catch(e){ /* الشاشة تُجدّد لاحقًا */ } }
    QBANK.toast(publish ? 'نُشرت المادة' : 'حُفظت مخفية');
    if (publish && newId){
      // رابط المشاركة يظهر فورًا: هذه هي اللحظة التي يشارك فيها الطالب مادته
      // ★ والمعرّف من الخادم لا من تخميننا — وإن غاب فُتحت المادة بمعرّفها
      const realSlug = await QBANK.admin.realSlug(newId);
      wizard = null;
      return void showShare(box, realSlug || w.slug, w.subjectName, newId, w.analysisLang || 'ar');
    }
    wizard = null;
    /* المخفية تُفتح في محرّرها مباشرة: من أخفاها يريد أن يكملها لا أن يبحث عنها —
       المشرف في محرّر اللوحة، والطالب في محرّر مادته (#/edit) */
    const adm = QBANK.store.get('is_admin_check', {}).ok;
    QBANK.router.go(newId ? (adm ? '#/admin/subject/' : '#/edit/') + newId
                  : adm ? '#/admin/content' : '#/account/uploads');
  }
  pub.addEventListener('click', () => fire(true));
  hide.addEventListener('click', () => fire(false));
  /*
    ★ كشف المكرر قبل النشر لا بعده.
    عشر نسخ من مقرّر واحد تُفتّت التقييمات وتشتّت الطالب: أيّها أكمل؟
    فنُري الرافع ما هو موجود في جامعته باسم قريب، ونتركه يقرّر — لا نمنعه،
    لأن «مبادئ الإدارة ١» قد لا تكون «مبادئ الإدارة ٢» رغم تشابه الاسم.
  */
  const dup = el('div', { hidden:true });
  box.appendChild(dup);
  if (QBANK.trust && wizard.subjectName)
    QBANK.trust.similar(wizard.subjectName, null).then(r => {
      if (!dup.isConnected) return;
      const rows = (r.ok && Array.isArray(r.data)) ? r.data : [];
      if (!rows.length) return;
      dup.hidden = false;
      dup.className = 'card stack dupwarn';
      dup.appendChild(el('h3', { style:'margin:0', text:'⚠ يوجد ما يشبهها في جامعتك' }));
      dup.appendChild(el('p', { class:'field__hint', style:'margin:0',
        text:'افتحها أولًا — إن كانت هي نفسها فأضف أسئلتك إليها بدل نسخة ثانية. وإن كانت مقرّرًا آخر فأكمل نشرك.' }));
      rows.forEach(x => dup.appendChild(el('a', { class:'dupwarn__row', href:'#s/' + (x.slug || '') }, [
        el('span', { class:'dupwarn__n', text: x.name }),
        el('span', { class:'badge num', text: (x.q_count || 0) + ' سؤالًا' }),
        x.verified ? el('span', { class:'badge badge--ok', text:'✓ موثّقة' }) : null,
        x.rating_n ? el('span', { class:'badge badge--star num',
          text: QBANK.trust.starsText(x.rating_avg, x.rating_n) }) : null
      ])));
    });

  box.appendChild(el('div', { class:'card stack' }, [
    el('h2', { text:'الاعتماد' }),
    el('p', { class:'page__sub num', text: wizard.total + ' سؤالًا جاهزًا' +
      (derived ? ' — منها ' + derived + ' بإجابة مستنتجة راجعتَها' : '') }),
    el('p', { class:'field__hint', text:'الاعتماد عملية ذرّية: إما تُنشأ المادة وكل أسئلتها أو لا يتغير شيء.' }),
    /* الإسناد يُقال قبل الضغط لا بعده: المشرف يرى باسم من ستُكتب */
    wizard.uploader ? el('p', { class:'field__hint uploader-note', text:
      'ستُنسب المادة إلى ' + (wizard.uploader.name || 'الطالب المختار') + ' — اسمه عليها ومدّة الرافع وعائدها له.' }) : null,
    langRow, shufWrap, pub, hide, msg
  ]));
}

/* شاشة ما بعد النشر: الرابط وزر النسخ — لا يُترك الطالب يبحث عن مادته */
function showShare(box, slug, name, newId, analysisLang){
  const u = QBANK.api.user() || {};
  box.innerHTML = '';

  /*
    ★ التحليل الشامل يبدأ هنا — بعد النشر لا قبله.
    لو حجزنا زرّ النشر حتى يكتمل التحليل (نصف دقيقة أحيانًا) لظنّ الرافع
    أن النشر علق. المادة تُنشر فورًا، والتحليل يلحقها، وسطرُ الحالة يصدُق
    معه: يجري ← اكتمل بمحاوره ← أو تعذّر مع «سيُعاد تلقائيًا عند فتح مادتك».
  */
  const aLine = el('p', { class:'field__hint', role:'status',
    text: QBANK.analysis ? '🧠 يجري تحليل مادتك: النظرة العامة وطريقة الحفظ والأخطاء الشائعة…' : '' });
  if (QBANK.analysis && newId)
    QBANK.analysis.generate(newId, analysisLang).then(r => {
      if (!aLine.isConnected) return;
      if (r.ok && r.data && r.data.ok){
        const n = (r.data.topics || []).length;
        aLine.textContent = '✓ اكتمل التحليل — ' + QBANK.views.arNum(n) +
          ' محاور وطريقة حفظ وأخطاء شائعة. كلها في صفحة مادتك.';
      } else {
        aLine.textContent = '⚠ تعذّر التحليل الآن — سيُعاد تلقائيًا أول ما تفتح صفحة مادتك.';
      }
    });

  /*
    ★ الخروج يتبع الباب الذي دخلتَ منه.
    كانت هذه الشاشة تعرض وجهتين للطالب وحده: صفحة المادة ومحفظته. فالمشرف
    الذي اعتمد مادةً من لوحته يُقذف بها إلى واجهة الطالب — يعود الشريط
    السفلي، وتضيع اللوحة، وعليه أن يكتب مسارها بيده ليعود إلى عمله.
    ولوحةٌ تُخرج صاحبها منها كلما أنجز شيئًا ليست لوحة.
  */
  let inAdmin = false;
  try { inAdmin = (QBANK.router.current || {}).path.indexOf('#/admin') === 0; } catch(e){}

  const exits = inAdmin
    ? [
        el('a', { class:'btn btn--block', href:'#/admin/content', text:'⚙ عد إلى لوحة المحتوى' }),
        newId ? el('a', { class:'btn btn--soft btn--block', href:'#/admin/subject/' + newId,
                          text:'✎ حرّر المادة' }) : null,
        el('a', { class:'btn btn--ghost btn--block', href:'#/admin/upload', text:'+ ارفع مادة أخرى' })
      ]
    : [
        el('a', { class:'btn btn--block', href:'#s/' + slug, text:'افتح صفحة المادة' }),
        el('a', { class:'btn btn--ghost btn--block', href:'#/account', text:'محفظتي' })
      ];

  box.appendChild(el('div', { class:'card stack', style:'text-align:center' }, [
    el('span', { class:'empty__ico', 'aria-hidden':'true', text:'✓' }),
    el('p', { class:'empty__title', text:'نُشرت «' + (name || 'مادتك') + '»' }),
    el('p', { class:'empty__text', text: inAdmin
      ? 'المادة منشورة للطلاب. وهذا رابطها للمشاركة.'
      : 'شاركها مع زملائك — كل شراء عبر رابطك يضيف كوينز لرصيدك.' }),
    aLine,
    QBANK.share.copyRow(QBANK.share.shareUrl(slug, u.id))
  ].concat(exits)));
}

const ViewUpload = {
  title:'رفع الأسئلة',
  view(route){
    // الرفع مفتوح لكل مسجَّل لا للمشرف وحده — هذه هي ميزة مواد الطلاب
    if (!QBANK.api.user()) return QBANK.views.ViewLogin.view();
    if (!wizard) wizard = QBANK.admin.newWizard();

    /*
      ★ تنفيذ طلبٍ من طالب: المعالج يبدأ ممتلئًا.
      الاسم من الطلب، والرافع صاحبه، والملف مساره في المخزن — فلا يُطلب من
      المشرف أن يكتب ما كُتب ولا أن يرفع ما رُفع. وهذا هو الفرق بين طابور
      يعمل وطابور يُهمَل.
    */
    if (route.query.req && wizard.requestId !== route.query.req && QBANK.requests) {
      wizard = QBANK.admin.newWizard();
      wizard.requestId = route.query.req;
      QBANK.requests.one(route.query.req).then(r => {
        const q = r.data;
        if (!q || !wizard || wizard.requestId !== route.query.req) return;
        wizard.subjectName = q.name || '';
        wizard.uploader    = { id: q.user_id, name: q.student || 'طالب' };
        wizard.reqPath     = q.storage_path;
        wizard.reqFile     = q.filename || 'ملف الطالب';
        wizard.reqNote     = q.note || '';
        wizard.reqStudent  = q.student || 'طالب';
        QBANK.router.render(location.hash);
      });
    }

    // استئناف مسوّدة من القائمة: نجلبها بحمولتها ونقفز للخطوة الصحيحة
    if (route.query.draft && wizard.draftId !== route.query.draft) {
      wizard = QBANK.admin.newWizard();
      wizard.draftId = route.query.draft;
      QBANK.api.rest('drafts?id=eq.' + encodeURIComponent(route.query.draft) + '&select=*').then(r => {
        if (r.ok && r.data && r.data[0]) {
          const d = r.data[0];
          wizard.filename = d.source_name; wizard.enriched = d.payload || [];
          /* ★ الاسم والرابط يُستعادان مع الأسئلة.
             كان الاستئناف يجلب الأسئلة وحدها، فيعود المشرف إلى معالجٍ
             بلا اسم مادة ولا رابط — ثم يُطلب منه الاسم من جديد، ويُمحى
             الرابط الذي ولّدته القاعدة عند النشر. */
          wizard.subjectName = wizard.subjectName || d.name || '';
          wizard.total = d.total; wizard.done = d.done;
          /* المسوّدة المُسندة إلى طالب تعود بإسنادها — وإلا أعادها الختم إلى المشرف عند النشر */
          const me = (QBANK.api.user() || {}).id;
          wizard.uploader = (d.created_by && d.created_by !== me) ? { id: d.created_by, name:'' } : null;
          wizard.step = d.done >= d.total ? 3 : 2;
          QBANK.router.render(location.hash);
        }
      });
    }
    const body = el('div', { class:'stack' });
    const rerender = () => QBANK.router.render(location.hash);
    [null, stepRead, stepEnrich, stepReview, stepPublish][wizard.step](body, rerender);
    /*
      ★ شرط العمولة يُقال في أول الخطوة الأولى لا في آخر الرابعة.
      من يعرف أن لمادته عائدًا يرفع بجدّية أكبر ويُتمّ ما بدأه، ومن يعرفه
      بعد النشر يشعر أنه اكتشف شيئًا كان مخفيًّا عنه. والوعد الذي يُقال
      قبل العمل وعدٌ، والذي يُقال بعده مفاجأة — ولو كانت سارّة.
    */
    return QBANK.views.page('رفع الأسئلة', 'من ملفك إلى مادة يذاكرها زملاؤك — بأربع خطوات.', [
      stepsBar(wizard.step),
      (wizard.step === 1 && QBANK.views.earnPromise) ? QBANK.views.earnPromise() : null,
      body
    ]);
  },
  _reset(){ wizard = null; },       // للفحوص
  _get(){ return wizard; },
  _set(w){ wizard = w; }
};
QBANK.views.ViewUpload = ViewUpload;
