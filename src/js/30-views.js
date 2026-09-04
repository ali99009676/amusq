/*
  شاشات المرحلة ٠: فارغة عمدًا.
  لا مواد ولا أسئلة مكتوبة داخل الكود — المحتوى يأتي كلّه لاحقًا من قاعدة البيانات
  بعد أن يعتمده المشرف. هذه الشاشات تُثبت أن الهيكل والتنقّل والمظهر يعملون.
*/
// el و esc معرّفتان في 00-core.js داخل نفس النطاق، فلا نُعيد تعريفهما

function page(title, sub, body){
  const head = el('header', { class:'page__head' }, [
    el('h1', { class:'page__title', text:title }),
    sub ? el('p', { class:'page__sub', text:sub }) : null
  ]);
  return el('div', { class:'page' }, [head].concat(body || []));
}

function empty(ico, title, text, action){
  return el('div', { class:'card' }, [
    el('div', { class:'empty' }, [
      el('span', { class:'empty__ico', 'aria-hidden':'true', text:ico }),
      el('p', { class:'empty__title', text:title }),
      el('p', { class:'empty__text', text:text }),
      action || null
    ])
  ]);
}

function stageNote(){
  return el('p', { class:'row' }, [
    el('span', { class:'badge badge--warn', text:'المرحلة ٠ · الهيكل' }),
    el('span', { class:'badge', text:'المحتوى يُضاف من لوحة التحكم' })
  ]);
}

/* ١ · الرئيسية — بطاقات المواد: «موادي» ثم «مواد أخرى متاحة» */
/*
  أحرف الخيارات بالعربية: أ ب ج د — لا A B C D.
  هذه لغة ورقة الامتحان التي جلس عليها الطالب طوال دراسته، ويقول بها
  «الجواب ج» لزميله. والحرف عرضٌ فقط: موضع الإجابة يبقى رقمًا في القاعدة
  فلا ينكسر شيء عند خلط الخيارات.
*/
const OPT_LETTERS = ['أ','ب','ج','د','هـ','و','ز','ح','ط','ي'];
function optLetter(i){ return OPT_LETTERS[i] || String(i + 1); }

/* الأرقام العربية الهندية — كما تُطبع في الكتاب المدرسي العربي */
function arNum(n){
  return String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[+d]);
}

function subjectColor(c){
  // اللون اسم متغيّر من نظام التصميم — لا hex حر من قاعدة البيانات
  return /^subject-[1-6]$/.test(c || '') ? 'var(--' + c + ')' : 'var(--subject-1)';
}
function daysLeft(dateStr, now){
  if (!dateStr) return null;
  const d = new Date(dateStr).getTime() - (now || Date.now());
  return Math.ceil(d / 86400000);
}
function mySubjects(){ return QBANK.store.get('my_subjects', []); }

function subjectCard(sub){
  const mine = mySubjects().indexOf(sub.id) !== -1;
  const left = daysLeft(sub.exam_date);
  const past = left !== null && left < 0;
  const pct = QBANK.progress.pctDone(sub.id, sub.q_count);
  const color = subjectColor(sub.color);

  // العدد المطلق قبل النسبة: «٤٧ من ١٢٠» يقول للطالب ما بقي عليه فعلًا،
  // والنسبة وحدها تخفي أن ٩٠٪ من مادة صغيرة أقل عملًا من ٣٠٪ من مادة كبيرة.
  const done = Math.round((sub.q_count || 0) * pct / 100);
  const topics = (sub.topics && sub.topics.length) || 0;

  /*
    ★ البطاقة أُعيد تصميمها (بحكم علي: «طريقة عرض المواد سيئة»).
    كانت منطقةً فنية بتدرّجٍ باهت وأيقونةٍ صغيرة تطفو في فراغ، ثم اسمٌ
    وشريط وذيلٌ متزاحم. الآن: بلاطةٌ ملوّنة بلون المادة تحمل أيقونتها،
    والاسم وترجمته بجانبها، ثم شرائح الحقائق (الأسئلة، المحاور، السعر،
    المتصلون الآن)، ثم شريط التقدّم بجملته، ثم زرٌّ واحد صريح. اللون
    يُحقن مرة في --acc فتتلوّن البلاطة والزرّ والشريط من نظام التصميم.
  */
  const N = QBANK.views.arNum;
  const card = el('article', {
    class:'sub-card' + (past ? ' exam-done' : ''), tabindex:'0', role:'link', 'data-id': sub.id,
    style:'--acc:' + color, 'aria-label':'مادة ' + sub.name }, [
    past ? el('span', { class:'stamp', 'aria-hidden':'true', text:'تم الانتهاء' }) : null,
    el('div', { class:'sc-top' }, [
      el('span', { class:'sc-ico', 'aria-hidden':'true', text: sub.icon || '▤' }),
      el('div', { class:'sc-x' }, [
        el('h3', { text: sub.name }),
        sub.name_en ? el('span', { class:'qn ltr', text: sub.name_en })
          : (sub.course_code ? el('span', { class:'qn ltr', text: sub.course_code }) : null)
      ])
    ]),
    el('div', { class:'foot' }, [
      el('span', { class:'badge num', text: N(sub.q_count || 0) + ' سؤالًا' }),
      topics ? el('span', { class:'badge num', text: N(topics) + ' محاور' }) : null,
      sub.free ? el('span', { class:'badge badge--ok', text:'مجانية' })
               : (Number(sub.price) > 0 ? el('span', { class:'badge badge--gold num', text: N(sub.price) + ' ريال' }) : null)
    ]),
    left !== null ? el('div', { class:'examline' }, [
      el('span', { class:'when', text: past ? 'انتهى موعده' : 'موعد الاختبار' }),
      past ? null : el('b', { class: left <= 2 ? 'urgent' : '',
        text:'متبقٍ ' + N(left) + (left === 1 ? ' يوم' : ' أيام') })
    ]) : null,
    el('div', { class:'sc-prog' }, [
      el('div', { class:'prog', 'aria-label':'أنجزت ' + pct + '٪' }, [ el('i', { style:'width:' + pct + '%' }) ]),
      /* بلا num: الصنف يقلب الاتجاه فتقفز «٪» إلى أول الجملة العربية */
      el('span', { class:'sc-prog__l', text:'راجعت ' + N(done) + ' من ' + N(sub.q_count || 0) + ' · ' + N(pct) + '٪' })
    ]),
    el('div', { class:'sc-act' }, [
      el('span', { class:'btn btn--sm cta', text: pct > 0 ? 'أكمل المراجعة' : 'ابدأ المراجعة' })
    ])
  ]);
  card.addEventListener('click', () => QBANK.router.go('#/subject/' + sub.id));
  card.addEventListener('keydown', e => { if (e.key === 'Enter') QBANK.router.go('#/subject/' + sub.id); });
  return card;
}


/* شريط جامعتي على الشاشة الأولى — يُحدَّث فور وصول الخادم بلا وميض */
function campusBand(){
  const wrap = el('div');
  const draw = c => {
    wrap.innerHTML = '';
    if (c && c.university_id){
      wrap.appendChild(el('a', { class:'campus-band', href: QBANK.campus.href(c.university_id) }, [
        el('span', { class:'campus-band__ico', 'aria-hidden':'true', text:'⌂' }),
        el('span', { class:'campus-band__x' }, [
          el('span', { class:'campus-band__t', text: c.university }),
          el('span', { class:'campus-band__d', text: (c.college ? c.college + ' · ' : '') + 'افتح قسم جامعتك وشاركه بدفعتك' })
        ]),
        el('span', { class:'campus-band__go', 'aria-hidden':'true', text:'←' })
      ]));
    } else {
      wrap.appendChild(el('a', { class:'campus-band campus-band--ask', href:'#/account' }, [
        el('span', { class:'campus-band__ico', 'aria-hidden':'true', text:'⌕' }),
        el('span', { class:'campus-band__x' }, [
          el('span', { class:'campus-band__t', text:'حدّد جامعتك' }),
          el('span', { class:'campus-band__d', text:'مرة واحدة — فتفتح المنصة على بنوك جامعتك، وتُملأ خاناتها عند رفع أي مادة.' })
        ]),
        el('span', { class:'campus-band__go', 'aria-hidden':'true', text:'←' })
      ]));
    }
  };
  draw(QBANK.campus ? QBANK.campus.cached() : null);
  if (QBANK.campus) QBANK.campus.load().then(c => { if (wrap.isConnected) draw(c); });
  return wrap;
}

const ViewHome = {
  title:'الرئيسية',
  view(){
    // الزائر يرى صفحة تعريفية تشرح وتُقنع؛ والطالب المسجَّل يرى مواده فورًا.
    // السبب: لكلٍّ حاجة مختلفة — إقناع أولًا، ومذاكرة سريعة ثانيًا.
    if (!QBANK.api.user()) return QBANK.views.landingView();

    const pack = QBANK.data.pack();
    const subjects = (pack.subjects || []).slice();
    const body = [];

    /*
      شريط جامعتي أعلى كل شيء — أو دعوة لاختيارها.

      الطالب الذي حدّد جامعته يفتح المنصة فيرى بابها لا قائمة عامة، ومن لم
      يحدّدها يرى سببًا واضحًا ليفعل. وضعناه فوق دعوة الرفع لأن الانتماء
      يسبق المساهمة: من لا يعرف أين يرفع لا يرفع.
    */
    /*
      ★ «ورقة اليوم» أولًا (69-today.js): كم عليّ، متى اختباري، أين وصلت،
      وزرٌّ واحد. ثم الشرائط الثلاثة (جامعتي، الجوال، الإشعارات) في صفٍّ
      واحد مضغوط تحتها — كانت متراكمةً بوزن البطل فتُغرقه.
    */
    const hero = QBANK.views.todayHero ? QBANK.views.todayHero() : null;
    if (hero) body.push(hero);
    const nudges = el('div', { class:'nudges' });
    body.push(nudges);
    nudges.appendChild(campusBand());

    /*
      ★ «راجع اليوم» أعلى الرئيسية.
      كل ما تحتها يفترض أن الطالب يعرف من أين يبدأ، وهو لا يعرف — فيؤجّل.
      رقمٌ واحد وزرٌّ واحد يُنهيان التردّد، ويُعطيان المنصة سببًا للفتح كل
      صباح لا عند الاختبار وحده. ومن لم يبدأ بعد لا يرى شيئًا: بطاقةٌ
      فارغة تعليمٌ ناقص، وغيابُها أصدق.
    */
    /* البطل يقولها بصوتٍ أعلى؛ البطاقة تبقى لمن لا بطل له (لا مواد بعد) */
    if (!hero && QBANK.views.reviewCard) {
      const rc = QBANK.views.reviewCard();
      if (rc) body.push(rc);
    }

    /*
      ★ تذكير الجوال — إلزامٌ يُذكَّر به لا يُحاصَر.
      الحقل مطلوب في الملف، لكن من سجّل قبل اليوم لن يفتح ملفه من تلقائه.
      شريط واحد يظهر لمن جواله فارغ ويختفي أبدًا بعد الحفظ — ولا يحجب
      المذاكرة: الطالب جاء ليراجع، ونحن نطلب لا نبتزّ.
    */
    const phoneNudge = el('div', { class:'nudges__slot' });
    nudges.appendChild(phoneNudge);
    QBANK.api.myProfile().then(r => {
      if (!phoneNudge.isConnected) return;
      const p = (r.ok && r.data) ? r.data : null;
      if (!p || String(p.phone || '').replace(/\D/g,'').length >= 9) return;
      phoneNudge.appendChild(el('a', { class:'campus-band campus-band--ask', href:'#/login' }, [
        el('span', { class:'campus-band__ico', 'aria-hidden':'true', text:'☎' }),
        el('span', { class:'campus-band__x' }, [
          el('span', { class:'campus-band__t', text:'أكمل ملفك: رقم جوالك' }),
          el('span', { class:'campus-band__d', text:'حقل مطلوب في ملفك — دقيقة واحدة ويختفي هذا التنبيه.' })
        ]),
        el('span', { class:'campus-band__go', 'aria-hidden':'true', text:'←' })
      ]));
    });

    /* ★ دعوة الإشعارات — حين يكون لها سبب (مستحقّ اليوم أو اختبار قريب)،
       وبزرٍّ يضغطه هو لا بنافذةٍ تقفز فتُرفض بلا قراءة. */
    if (QBANK.views.notifyBanner){ const nb = QBANK.views.notifyBanner(); if (nb) nudges.appendChild(nb); }

    /* ★ المتصدرون في أول شاشة: اللوحة كانت بلا باب — ما لا يُرى لا يوجد */
    if (QBANK.views.boardMini) body.push(QBANK.views.boardMini());

    // دعوة الرفع: الطالب لا يبحث عن ميزة لا يعرف بوجودها
    body.push(el('a', { class:'upsell', href:'#/upload' }, [
      el('span', { class:'upsell__ico', 'aria-hidden':'true', text:'⇪' }),
      el('span', { class:'upsell__x' }, [
        el('span', { class:'upsell__t', text:'عندك بنك أسئلة لمادة ناقصة؟' }),
        el('span', { class:'upsell__d', text:'ارفعه، وجرّبه عشر دقائق مجانًا، وشاركه مع زملائك بكوينز لك على كل بيعة.' })
      ]),
      el('span', { class:'upsell__go', 'aria-hidden':'true', text:'←' })
    ]));

    if (pack.settings && pack.settings.welcome_text)
      body.push(el('div', { class:'card' }, [ el('p', { style:'margin:0', text: pack.settings.welcome_text }) ]));

    if (!subjects.length) {
      body.push(empty('▤', 'لا مواد بعد',
        QBANK.config.ready()
          ? 'لم تُنشر مواد حتى الآن — عد قريبًا، أو تأكد من الاتصال لمزامنة الجديد.'
          : 'المنصة تبدأ فارغة عن قصد. يضيف المشرف المواد من لوحة التحكم وستظهر هنا فور نشرها.',
        el('div', { class:'row', style:'justify-content:center;margin-top:16px' }, [
          el('a', { class:'btn', href:'#/admin', text:'افتح لوحة التحكم' })
        ])));
      body.push(el('div', { class:'grid', id:'subjectsGrid' }));
      return page('موادي', 'اختر مادة لتبدأ المراجعة.', body);
    }

    // المنتهية تنزل آخر القائمة تلقائيًا
    const order = arr => arr.slice().sort((x, y) => {
      const px = (daysLeft(x.exam_date) ?? 1) < 0 ? 1 : 0;
      const py = (daysLeft(y.exam_date) ?? 1) < 0 ? 1 : 0;
      return px - py || (x.ord || 0) - (y.ord || 0);
    });
    const mineIds = mySubjects();
    const mine = order(subjects.filter(su => mineIds.indexOf(su.id) !== -1));
    const other = order(subjects.filter(su => mineIds.indexOf(su.id) === -1));

    if (mine.length) {
      body.push(el('h2', { text:'موادي' }));
      body.push(el('div', { class:'grid', id:'subjectsGrid' }, mine.map(subjectCard)));
    }
    if (other.length) {
      body.push(el('h2', { text: mine.length ? 'مواد أخرى متاحة' : 'المواد المتاحة' }));
      body.push(el('div', { class:'grid', id: mine.length ? null : 'subjectsGrid' }, other.map(su => {
        const c = subjectCard(su);
        const add = el('button', { class:'btn btn--sm btn--soft', type:'button',
          'aria-label':'أضف ' + su.name + ' إلى موادي', text:'+ أضف إلى موادي' });
        add.addEventListener('click', e => {
          e.stopPropagation();
          const list = mySubjects();
          if (list.indexOf(su.id) === -1) { list.push(su.id); QBANK.store.set('my_subjects', list); }
          QBANK.api.rest('enrollments', { method:'POST', body: JSON.stringify({
            user_id: (QBANK.api.user() || {}).id, subject_id: su.id }) });
          QBANK.toast('أُضيفت «' + su.name + '» إلى موادك');
          QBANK.router.render('#/');
        });
        /* زرّ الإضافة في صفّ الأفعال بجانب زرّ البدء — لا صفًّا ثانيًا معلَّقًا تحت البطاقة */
        (c.querySelector('.sc-act') || c).appendChild(add);
        return c;
      })));
    }
    const pg = page('موادي', 'اختر مادة لتبدأ المراجعة.', body);
    if (hero) pg.classList.add('page--hero');   // البطل هو الرأس؛ العنوان يبقى للقارئ الآلي
    /* «متصل الآن» على بطاقات المواد — بعد إدراجها في الصفحة، بنداء واحد للكل */
    if (QBANK.board && QBANK.board.decorateCards) setTimeout(() => QBANK.board.decorateCards(), 0);
    return pg;
  }
};

/* ٢ · دخول الطالب — رابط سحري + جوجل + آبل */
function loginCard(opts){
  // بطاقة دخول واحدة للطالب والمشرف — الفرق في العنوان والوجهة بعد النجاح فقط
  const email = el('input', { class:'input', type:'email', id:opts.emailId,
    placeholder:'name@example.com', dir:'ltr', autocomplete:'email' });
  const btn = el('button', { class:'btn btn--block', type:'button', text:'أرسل رابط الدخول' });
  const msg = el('p', { class:'field__hint', role:'status' });

  async function send(){
    const val = (email.value || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val)) { msg.textContent = 'اكتب بريدًا صحيحًا أولًا.'; email.focus(); return; }
    if (!QBANK.config.ready()) { msg.textContent = 'المنصة غير موصولة بالخادم بعد — يضبطها المشرف من الإعدادات.'; return; }
    btn.setAttribute('aria-disabled','true'); btn.textContent = 'جارٍ الإرسال…';
    const r = await QBANK.api.auth.magic(val);
    btn.removeAttribute('aria-disabled'); btn.textContent = 'أرسل رابط الدخول';
    if (r.ok) {
      msg.textContent = 'تم! افتح بريدك: اضغط رابط الدخول، أو اكتب الرمز هنا.';
      QBANK.toast('أُرسل بريد الدخول');
      rememberAfter();                  // رابط البريد يعود للأصل — الوجهة تنتظره هنا
      otpBox.hidden = false;            // ★ داخل التطبيق المغلّف الرمز هو الطريق
      otp.focus();
    }
    else if (r.offline) msg.textContent = 'لا اتصال بالإنترنت — الدخول يحتاج اتصالًا مرة واحدة فقط.';
    /* ★ ٤٢٩ يُسمّى باسمه: «تعذّر الإرسال» العامة أوهمت أن المنصة معطوبة،
       والحقيقة أن حصة البريد نفدت مؤقتًا — والفرق يغيّر تصرف الطالب كليًا */
    else if (r.status === 429) msg.textContent =
      'طلبت الدخول مرات كثيرة خلال ساعة — انتظر قليلًا ثم حاول، أو ادخل بحساب جوجل الآن.';
    else msg.textContent = 'تعذّر الإرسال. تحقق من البريد وحاول ثانية.';
  }
  btn.addEventListener('click', send);
  email.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });

  /*
    ★ الدخول بالرمز — للتطبيق المثبّت خاصة.
    رابط البريد يفتح في متصفح الجوال لا داخل التطبيق فيبقى التطبيق زائرًا،
    أما الرمز فيُكتب هنا فتولد الجلسة هنا. الحقل يظهر بعد الإرسال فقط —
    لا معنى لرمز قبل أن يوجد بريد يحمله.
  */
  const otp = el('input', { class:'input', type:'text', inputmode:'numeric',
    autocomplete:'one-time-code', maxlength:'6', placeholder:'••••••',
    'aria-label':'رمز الدخول من البريد', dir:'ltr',
    style:'text-align:center; letter-spacing:.45em; font-weight:800; font-size:1.15rem' });
  const otpBtn = el('button', { class:'btn btn--block', type:'button', text:'ادخل بالرمز' });
  const otpBox = el('div', { class:'stack', hidden:true }, [
    el('span', { class:'field__hint', text:'وصلك في نفس الرسالة رمز من ٦ أرقام — اكتبه هنا وادخل مباشرة:' }),
    otp, otpBtn
  ]);
  async function verify(){
    const code = (otp.value || '').replace(/\D/g, '');
    if (code.length < 6) { msg.textContent = 'الرمز ٦ أرقام — انسخه من رسالة البريد.'; otp.focus(); return; }
    otpBtn.setAttribute('aria-disabled','true'); otpBtn.textContent = 'جارٍ التحقق…';
    const r = await QBANK.api.auth.verifyOtp((email.value || '').trim(), code);
    otpBtn.removeAttribute('aria-disabled'); otpBtn.textContent = 'ادخل بالرمز';
    if (r.ok && QBANK.api.user()){
      QBANK.toast('تم الدخول');
      QBANK.data.refreshPack().finally(() => QBANK.router.go(opts.after || '#/'));
    } else {
      msg.textContent = 'الرمز غير صحيح أو انتهت مدته — أرسل بريدًا جديدًا وحاول خلال دقائق.';
    }
  }
  otpBtn.addEventListener('click', verify);
  otp.addEventListener('keydown', e => { if (e.key === 'Enter') verify(); });

  /*
    ★ جوجل مفعّل (OAuth «In production» منذ ٢٠٢٦/٩) — زرّه ظاهر.
    آبل مطفأ لا محذوف: يشترط حساب Apple Developer المدفوع، والزر الظاهر
    المعطوب أسوأ من الغائب. يوم يُفعَّل يُعاد aBtn إلى القائمة أدناه.
  */
  /* ★ الوجهة تُحفظ قبل مغادرة الصفحة: جوجل والرابط البريدي يعودان إلى
     أصل الموقع (الهاش يحمله رمز الجلسة)، فمن أين نعرف أن القاصد كان
     اللوحة؟ من هذا المفتاح — يقرؤه الإقلاع بعد التقاط الجلسة ثم يمحوه. */
  const rememberAfter = () => { if (opts.after) QBANK.store.set('after_login', opts.after); };
  const gBtn = el('button', { class:'btn btn--ghost btn--block', type:'button', text:'الدخول بحساب جوجل' });
  const aBtn = el('button', { class:'btn btn--ghost btn--block', type:'button', text:'الدخول بحساب آبل' });
  gBtn.addEventListener('click', () => { const u = QBANK.api.auth.oauthUrl('google'); if (u) { rememberAfter(); location.href = u; } else QBANK.toast('المنصة غير موصولة بالخادم بعد'); });
  aBtn.addEventListener('click', () => { const u = QBANK.api.auth.oauthUrl('apple');  if (u) { rememberAfter(); location.href = u; } else QBANK.toast('المنصة غير موصولة بالخادم بعد'); });
  void aBtn;   // يبقى جاهزًا ليوم حساب المطوّر

  return el('div', { class:'card stack' }, [
    el('label', { class:'field', style:'margin:0' }, [
      el('span', { class:'field__label', text: opts.label }),
      email,
      el('span', { class:'field__hint', text:'يصلك رابط دخول ورمز — بلا كلمة مرور.' })
    ]),
    btn, msg, otpBox,
    el('hr', { class:'divider', style:'margin:0' }),
    gBtn
  ]);
}

const ViewLogin = {
  title:'دخول الطالب',
  view(){
    if (QBANK.api.user()) { return page('حسابي', null, [ QBANK.views.accountBody() ]); }
    return page('دخول الطالب', 'سجّل ليُحفظ تقدّمك في حسابك ويتزامن بين أجهزتك.', [
      loginCard({ emailId:'loginEmail', label:'البريد الإلكتروني' }),
      el('div', { class:'card' }, [
        el('p', { class:'page__sub', text:'ليس لديك حساب؟ جرّب المادة المجانية أولًا بلا تسجيل.' }),
        el('a', { class:'btn btn--soft btn--block', href:'#/', text:'تصفّح كزائر' })
      ])
    ]);
  }
};

/* ٣ · دخول المشرف — نفس آلية الدخول بواجهة مستقلة، والتخويل في قاعدة البيانات */
const ViewAdminLogin = {
  title:'دخول المشرف',
  view(){
    /* ★ after:'#/admin' — علي دخل من بوابة المشرف فهبط على واجهة الطالب.
       من قصد اللوحة يعود إلى اللوحة، بأي طريق دخل: رمزًا أو رابطًا أو جوجل. */
    return page('دخول المشرف', 'واجهة منفصلة، والتحقق من الصلاحية في قاعدة البيانات عبر is_admin() لا في المتصفح.', [
      loginCard({ emailId:'adminEmail', label:'بريد المشرف', after:'#/admin' })
    ]);
  }
};

/* ٥ · الإعدادات */
const ViewSettings = {
  title:'الإعدادات',
  view(){
    const themeRow = el('div', { class:'row' }, [
      el('span', { text:'الوضع الليلي' }),
      el('span', { class:'spacer' }),
      el('button', { class:'btn btn--soft btn--sm', type:'button', id:'setThemeBtn', text:'تبديل' })
    ]);
    themeRow.querySelector('#setThemeBtn').addEventListener('click', () => {
      const mode = QBANK.theme.toggle();
      QBANK.toast(mode === 'dark' ? 'الوضع الليلي مُفعَّل' : 'الوضع الفاتح مُفعَّل');
    });

    const resetRow = el('div', { class:'row' }, [
      el('span', { text:'تصفير بيانات هذا الجهاز' }),
      el('span', { class:'spacer' }),
      el('button', { class:'btn btn--ghost btn--sm', type:'button', id:'resetBtn', text:'تصفير' })
    ]);
    resetRow.querySelector('#resetBtn').addEventListener('click', () => {
      QBANK.store.clearAll();
      QBANK.theme.apply('auto');
      QBANK.toast('حُذفت بيانات هذا الجهاز');
    });

    return page('الإعدادات', 'تخصّ هذا الجهاز، ولا تُغيّر حسابك.', [
      el('div', { class:'card stack' }, [ themeRow, el('hr', { class:'divider' }), resetRow ]),
      el('div', { class:'card' }, [
        el('h2', { text:'عن المنصة' }),
        el('p', { class:'page__sub', text:'مراجعة — بنك أسئلة تفاعلي لطلاب الجامعات العربية. الإصدار ' + QBANK.version + ' · المرحلة ' + QBANK.stage })
      ])
    ]);
  }
};

/* ٦ · صفحة غير موجودة */
const ViewNotFound = {
  title:'الصفحة غير موجودة',
  view(){
    return page('الصفحة غير موجودة', null, [
      empty('؟', 'لم نجد هذه الصفحة', 'ربما تغيّر الرابط. عد إلى الرئيسية وتابع من هناك.',
        el('div', { class:'row', style:'justify-content:center;margin-top:16px' }, [
          el('a', { class:'btn', href:'#/', text:'الرئيسية' })
        ]))
    ]);
  }
};

QBANK.views = { ViewHome, campusBand, ViewLogin, ViewAdminLogin, ViewSettings, ViewNotFound, page, empty, stageNote, subjectColor, daysLeft, mySubjects, optLetter, arNum, subjectCard };
