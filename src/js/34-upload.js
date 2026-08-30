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
  const nameIn = el('input', { class:'input', id:'subjName', value: wizard.subjectName || '',
    placeholder:'مثال: فيزيولوجيا الجهاز التنفسي' });
  nameIn.addEventListener('input', () => { wizard.subjectName = nameIn.value; });

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

  return el('div', { class:'card stack' }, [
    el('label', { class:'field', style:'margin:0' }, [
      el('span', { class:'field__label', text:'اسم المادة' }), nameIn ]),
    el('div', { class:'ad-edit ad-edit--2' }, [
      el('label', { class:'field', style:'margin:0' }, [
        el('span', { class:'field__label', text:'الدولة' }), countryIn ]),
      el('label', { class:'field', style:'margin:0' }, [
        el('span', { class:'field__label', text:'الجامعة' }), uniIn ]),
      el('label', { class:'field', style:'margin:0' }, [
        el('span', { class:'field__label', text:'الكلية' }), colIn ]),
      el('label', { class:'field', style:'margin:0' }, [
        el('span', { class:'field__label', text:'رمز المقرر — اختياري' }), codeIn ])
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
  box.appendChild(subjectMeta());
  box.appendChild(formatGuide());
  const drop = el('div', { class:'drop', tabindex:'0', role:'button', 'aria-label':'اختر ملف أسئلة' }, [
    el('span', { class:'empty__ico', 'aria-hidden':'true', text:'⇪' }),
    el('p', { class:'empty__title', text:'أسقط ملف الأسئلة هنا أو اضغط للاختيار' }),
    el('p', { class:'empty__text', text:'PDF أو DOCX أو TXT — حتى ١٥ ميغابايت. يفهم شكلين: خيارات A-D، وقوائم سؤال-ثم-إجابة.' })
  ]);
  const fileIn = el('input', { type:'file', accept:'.pdf,.docx,.txt', style:'display:none', 'aria-hidden':'true' });
  const msg = el('p', { class:'field__hint', role:'status' });

  async function handle(file){
    if (!file) return;
    msg.textContent = 'جارٍ قراءة «' + file.name + '»…';
    const b64 = await new Promise(resolve => {
      const rd = new FileReader();
      rd.onload = () => resolve(String(rd.result).split(',')[1] || '');
      rd.readAsDataURL(file);
    });
    wizard = await QBANK.admin.wizardIngest(wizard, file.name, b64);
    if (wizard.error) { msg.textContent = '⚠ ' + wizard.error; return; }
    rerender();
  }
  drop.addEventListener('click', () => fileIn.click());
  drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fileIn.click(); });
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('is-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('is-over'); handle(e.dataTransfer.files[0]); });
  fileIn.addEventListener('change', () => handle(fileIn.files[0]));

  box.appendChild(drop); box.appendChild(fileIn); box.appendChild(msg);
}

/* الخطوة ٢: التقدير ثم التشغيل بدفعات مع شريط «٨٠ من ٣٠٠» */
function stepEnrich(box, rerender){
  const est = QBANK.admin.estimate(wizard);
  const bar = el('div', { class:'meter', role:'progressbar', 'aria-valuemin':'0',
    'aria-valuemax': String(wizard.total), 'aria-valuenow': String(wizard.done) }, [
    el('div', { class:'meter__fill', style:'width:' + (wizard.total ? wizard.done / wizard.total * 100 : 0) + '%' })
  ]);
  const label = el('p', { class:'page__sub num', text: wizard.done + ' من ' + wizard.total });
  const msg = el('p', { class:'field__hint', role:'status' });
  const go = el('button', { class:'btn btn--block', type:'button',
    text: wizard.done ? 'أكمل من حيث توقفت (' + wizard.done + ')' : 'شغّل الذكاء الآن' });

  go.addEventListener('click', async () => {
    go.setAttribute('aria-disabled','true'); go.textContent = 'جارٍ المعالجة…';
    wizard = await QBANK.admin.wizardEnrich(wizard, (done, total) => {
      label.textContent = done + ' من ' + total;
      bar.setAttribute('aria-valuenow', String(done));
      bar.firstChild.style.width = (done / total * 100) + '%';
    });
    if (wizard.error) { msg.textContent = '⚠ ' + wizard.error + ' — المحفوظ لا يضيع، أعد المحاولة.'; go.removeAttribute('aria-disabled'); go.textContent = 'أعد المحاولة'; return; }
    rerender();
  });

  /*
    مساران، والفرق بينهما معروض لا مخبوء.
    الطالب لا يعرف ما «الإثراء» حتى يرى ماذا ينقصه بدونه — فنقوله بالأسماء.
  */
  const withoutOpts = wizard.raw.filter(q => !q.has_options).length;
  const noAnswer = wizard.raw.filter(q =>
    !(q.has_options && typeof q.answer === 'number' && q.answer >= 0) && !q.answer_text).length;

  const paths = el('div', { class:'paths', role:'radiogroup', 'aria-label':'طريقة المعالجة' });
  const creditBox = el('div', { class:'costbox', hidden:true });
  const N = QBANK.views.arNum;

  function paint(credits){
    const cost = QBANK.admin.creditsNeeded(wizard, (credits && credits.cost_per_q) || 1);
    const bal = (credits && credits.balance) || 0;
    const enough = bal >= cost;
    wizard.costPerQ = (credits && credits.cost_per_q) || 1;

    paths.innerHTML = '';
    [
      { id:false, t:'انشر بلا إثراء', price:'مجانًا',
        d:'أسئلتك وخياراتها كما وصلت، جاهزة للمراجعة والاختبار حالًا.',
        miss: 'بلا شرح لكل إجابة، ولا ترجمة، ولا بطاقات حفظ'
              + (noAnswer ? '. و' + N(noAnswer) + ' سؤالًا بلا إجابة معلنة في ملفك ستحتاج ضبطها بيدك' : '') },
      { id:true, t:'انشر مع الإثراء', price: N(cost) + ' كوين',
        d:'شرح لكل إجابة، وترجمة عربية، وبطاقة حفظ، وتصنيف بالمحاور.',
        miss: noAnswer ? 'ويستنتج الذكاء إجابات ' + N(noAnswer) + ' سؤالًا لم تُعلَن في ملفك'
                       : 'وكل أسئلتك فيها إجاباتها أصلًا — فلن يُغيّر الذكاء إجابة واحدة' }
    ].forEach(o => {
      const on = wizard.enrich === o.id;
      const blocked = o.id && !enough;
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
        paint(credits);
      });
      paths.appendChild(b);
    });

    creditBox.hidden = !wizard.enrich;
    creditBox.innerHTML = '';
    if (wizard.enrich){
      creditBox.appendChild(el('span', { class:'costbox__l', text:'رصيدك' }));
      creditBox.appendChild(el('span', { class:'costbox__n num',
        text: N(bal) + ' كوين' + (enough ? '' : ' — لا يكفي') }));
      creditBox.appendChild(el('span', { class:'costbox__s',
        text: enough ? 'سيتبقى لك ' + N(bal - cost) + ' كوين بعد الإثراء.'
                     : 'ينقصك ' + N(cost - bal) + ' كوين لإثراء هذا الملف.' }));
      if (!enough)
        creditBox.appendChild(el('a', { class:'btn btn--sm', href:'#/account', text:'اشحن رصيدك' }));
    }
    go.textContent = wizard.done ? 'أكمل من حيث توقفت (' + wizard.done + ')'
                    : (wizard.enrich ? 'أثرِ وانشر' : 'انشر بلا إثراء');
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
  const derived = wizard.enriched.filter(q => q.derived).length;
  const pub = el('button', { class:'btn btn--block', type:'button', text:'اعتمد وانشر للطلاب' });
  const hide = el('button', { class:'btn btn--ghost btn--block', type:'button', text:'احفظ مخفية' });
  const msg = el('p', { class:'field__hint', role:'status' });
  async function fire(publish){
    const r = await QBANK.admin.approve(wizard, publish);
    if (!r.ok)
      return void (msg.textContent = '⚠ ' + ((r.data && r.data.message) || 'تعذّر الاعتماد — لم يتغير شيء في قاعدة البيانات.'));
    // approve_draft تُرجع معرّف المادة — نختمها بهوية رافعها ونمطه ومساره
    const newId = (typeof r.data === 'string') ? r.data : (r.data && r.data.id) || null;
    const w = wizard;
    await QBANK.admin.stamp(newId, w);
    QBANK.toast(publish ? 'نُشرت المادة' : 'حُفظت مخفية');
    if (publish && newId && w.slug){
      // رابط المشاركة يظهر فورًا: هذه هي اللحظة التي يشارك فيها الطالب مادته
      wizard = null;
      return void showShare(box, w.slug, w.subjectName);
    }
    wizard = null;
    QBANK.router.go(QBANK.store.get('is_admin_check', {}).ok ? '#/admin/content' : '#/account');
  }
  pub.addEventListener('click', () => fire(true));
  hide.addEventListener('click', () => fire(false));
  box.appendChild(el('div', { class:'card stack' }, [
    el('h2', { text:'الاعتماد' }),
    el('p', { class:'page__sub num', text: wizard.total + ' سؤالًا جاهزًا' +
      (derived ? ' — منها ' + derived + ' بإجابة مستنتجة راجعتَها' : '') }),
    el('p', { class:'field__hint', text:'الاعتماد عملية ذرّية: إما تُنشأ المادة وكل أسئلتها أو لا يتغير شيء.' }),
    pub, hide, msg
  ]));
}

/* شاشة ما بعد النشر: الرابط وزر النسخ — لا يُترك الطالب يبحث عن مادته */
function showShare(box, slug, name){
  const u = QBANK.api.user() || {};
  box.innerHTML = '';
  box.appendChild(el('div', { class:'card stack', style:'text-align:center' }, [
    el('span', { class:'empty__ico', 'aria-hidden':'true', text:'✓' }),
    el('p', { class:'empty__title', text:'نُشرت «' + (name || 'مادتك') + '»' }),
    el('p', { class:'empty__text', text:'شاركها مع زملائك — كل شراء عبر رابطك يضيف كوينز لرصيدك.' }),
    QBANK.share.copyRow(QBANK.share.shareUrl(slug, u.id)),
    el('a', { class:'btn btn--block', href:'#s/' + slug, text:'افتح صفحة المادة' }),
    el('a', { class:'btn btn--ghost btn--block', href:'#/account', text:'محفظتي' })
  ]));
}

const ViewUpload = {
  title:'رفع الأسئلة',
  view(route){
    // الرفع مفتوح لكل مسجَّل لا للمشرف وحده — هذه هي ميزة مواد الطلاب
    if (!QBANK.api.user()) return QBANK.views.ViewLogin.view();
    if (!wizard) wizard = QBANK.admin.newWizard();
    // استئناف مسوّدة من القائمة: نجلبها بحمولتها ونقفز للخطوة الصحيحة
    if (route.query.draft && wizard.draftId !== route.query.draft) {
      wizard = QBANK.admin.newWizard();
      wizard.draftId = route.query.draft;
      QBANK.api.rest('drafts?id=eq.' + route.query.draft + '&select=*').then(r => {
        if (r.ok && r.data && r.data[0]) {
          const d = r.data[0];
          wizard.filename = d.source_name; wizard.enriched = d.payload || [];
          wizard.total = d.total; wizard.done = d.done;
          wizard.step = d.done >= d.total ? 3 : 2;
          QBANK.router.render(location.hash);
        }
      });
    }
    const body = el('div', { class:'stack' });
    const rerender = () => QBANK.router.render(location.hash);
    [null, stepRead, stepEnrich, stepReview, stepPublish][wizard.step](body, rerender);
    return QBANK.views.page('رفع الأسئلة', 'من ملفك إلى مادة يذاكرها زملاؤك — بأربع خطوات.', [
      stepsBar(wizard.step), body
    ]);
  },
  _reset(){ wizard = null; },       // للفحوص
  _get(){ return wizard; },
  _set(w){ wizard = w; }
};
QBANK.views.ViewUpload = ViewUpload;
