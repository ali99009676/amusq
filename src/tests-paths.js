/* ============ ٦٥ · المساران قبل النشر ============ */
describe('٦٥ · اختيار المسار');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  const pl = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'s1', email:'a@a.a' }))));
  A.api.auth.captureFromHash('#access_token=h.' + pl + '.s&refresh_token=r&expires_in=9999');

  // ١٢٠ سؤالًا: ٢٠ بلا خيارات، ومنها ١٠ بلا إجابة معلنة إطلاقًا
  const raw = [];
  for (let i = 0; i < 120; i++){
    const hasOpts = i >= 20;
    raw.push({ q:'Q' + i, options: hasOpts ? ['a','b','c','d'] : null,
               answer: hasOpts ? 0 : null,
               answer_text: (!hasOpts && i >= 10) ? 'إجابة' : null,
               has_options: hasOpts });
  }
  const w = A.admin.newWizard();
  eq(w.enrich, false, 'المسار المجاني هو الافتراضي — الإثراء اختيار واعٍ يُدفع ثمنه');
  w.step = 2; w.raw = raw; w.total = raw.length; w.filename = 'f.txt';
  A.views.ViewUpload._set(w);

  A.api.rpc = name => name === 'my_credits'
    ? Promise.resolve({ ok:true, data:{ balance:200, cost_per_q:1, coin_halalas:5, open:true } })
    : Promise.resolve({ ok:false });

  pending.push((async () => {
    await nav(W, '#/upload');
    await until(W, () => doc.querySelector('.costbox') && !doc.querySelector('.costbox').hidden
                      || doc.querySelectorAll('.path').length === 2);
    const main = doc.getElementById('main');

    eq(doc.querySelectorAll('.path').length, 2, 'مساران معروضان');
    const free = doc.querySelector('[data-path="false"]');
    const paid = doc.querySelector('[data-path="true"]');
    eq(free.getAttribute('aria-checked'), 'true', 'والمجاني محدَّد ابتداءً');
    has(free.textContent, 'مجانًا', 'وثمنه معلن: مجانًا');

    // ★ الفرق يُقال بالأسماء لا يُخبأ — الطالب لا يعرف ما «الإثراء» حتى يرى ما ينقصه بدونه
    has(free.textContent, 'بلا شرح', 'المسار المجاني يقول ما ينقصه');
    has(free.textContent, 'ولا ترجمة', 'ولا ترجمة');
    has(free.textContent, 'بطاقات حفظ', 'ولا بطاقات حفظ');
    has(free.textContent, 'بلا إجابة معلنة', 'ويحذّر من الأسئلة التي ستحتاج ضبطًا يدويًا');
    has(paid.textContent, 'شرح لكل إجابة', 'والمدفوع يقول ما يضيفه');
    has(paid.textContent, 'كوين', 'وثمنه بالكوين');

    has(main.textContent, '120 سؤالًا', 'وعدد الأسئلة معروض');
    has(main.textContent, 'بلا خيارات', 'وما لا خيارات له موسوم');

    // الرصيد يكفي ⇦ يُسمح بالاختيار
    paid.dispatchEvent(new W.Event('click', { bubbles:true }));
    await until(W, () => doc.querySelector('[data-path="true"]').getAttribute('aria-checked') === 'true');
    eq(A.views.ViewUpload._get().enrich, true, 'اختيار المسار المدفوع يُسجَّل');
    const cb = doc.querySelector('.costbox');
    ok(cb && !cb.hidden, 'وصندوق الرصيد يظهر عند اختياره');
    has(cb.textContent, 'كوين', 'يعرض الرصيد بالكوين');
    has(cb.textContent, 'سيتبقى لك', 'وما سيتبقّى بعد الإثراء — لا الرصيد وحده');
    A.views.ViewUpload._reset();
    W.close();
  })());
}

/* ============ ٦٦ · رصيد لا يكفي ============ */
describe('٦٦ · نقص الرصيد');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  const pl = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'s2', email:'b@b.b' }))));
  A.api.auth.captureFromHash('#access_token=h.' + pl + '.s&refresh_token=r&expires_in=9999');

  const raw = [];
  for (let i = 0; i < 300; i++) raw.push({ q:'Q'+i, options:['a','b'], answer:0, has_options:true });
  const w = A.admin.newWizard();
  w.step = 2; w.raw = raw; w.total = 300; w.filename = 'big.txt';
  A.views.ViewUpload._set(w);

  A.api.rpc = name => name === 'my_credits'
    ? Promise.resolve({ ok:true, data:{ balance:50, cost_per_q:1, coin_halalas:5, open:true } })
    : Promise.resolve({ ok:false });

  pending.push((async () => {
    await nav(W, '#/upload');
    await until(W, () => doc.querySelector('[data-path="true"].is-blocked'), 6000);
    const paid = doc.querySelector('[data-path="true"]');
    ok(paid.className.indexOf('is-blocked') !== -1, 'المسار المدفوع معطّل عند نقص الرصيد');

    // ★ الضغط عليه لا يُفعّله — لا نُدخل الطالب مسارًا نعلم أنه سيفشل
    paid.dispatchEvent(new W.Event('click', { bubbles:true }));
    eq(A.views.ViewUpload._get().enrich, false, 'والضغط عليه لا يُفعّله');
    eq(doc.querySelector('[data-path="false"]').getAttribute('aria-checked'), 'true',
       'ويبقى المجاني هو المحدَّد');

    // المجاني لا يُحجب أبدًا — من لا يدفع ينشر بنكه على كل حال
    ok(doc.querySelector('[data-path="false"]').className.indexOf('is-blocked') === -1,
       'والمجاني لا يُحجب أبدًا');
    A.views.ViewUpload._reset();
    W.close();
  })());
}

/* ============ ٦٧ · المسار المجاني لا يمرّ بالذكاء ============ */
describe('٦٧ · النشر بلا إثراء');
{
  const dom = makeDom(), W = dom.window, A = W.QBANK;
  const Ad = A.admin;

  // ★ الفحص الحاسم: لا نداء خادم ولا حسم رصيد في المسار المجاني
  let serverCalls = 0, rpcCalls = 0;
  Ad.server = async () => { serverCalls++; return { ok:true, data:{ questions:[] } }; };
  Ad.saveDraft = async wz => { wz.draftId = 'd9'; return { ok:true }; };
  A.api.rpc = () => { rpcCalls++; return Promise.resolve({ ok:true, data:{ ok:true } }); };

  const w = Ad.newWizard();
  w.raw = [
    { q:'س بخيارات؟', options:['أ','ب','ج'], answer:1, has_options:true },
    { q:'س بلا خيارات؟', options:null, answer_text:'الإجابة', has_options:false },
    { q:'س بلا إجابة؟', options:['أ','ب'], answer:null, has_options:true }
  ];
  w.total = 3; w.step = 2; w.enrich = false;

  pending.push((async () => {
    const r = await Ad.wizardEnrich(w);
    eq(serverCalls, 0, 'المسار المجاني لا ينادي الذكاء إطلاقًا — صفر تكلفة');
    eq(rpcCalls, 0, 'ولا يحسم كوينًا واحدًا');
    eq(r.done, 3, 'وكل الأسئلة جاهزة');
    eq(r.step, 3, 'وينتقل للمراجعة مباشرة');

    // النص المقدّس كما وصل
    eq(r.enriched[0].q, 'س بخيارات؟', 'نصّ السؤال حرفًا بحرف');
    eq(r.enriched[0].q_original, 'س بخيارات؟', 'والأصل محفوظ');
    eq(r.enriched[0].options.join('|'), 'أ|ب|ج', 'والخيارات كما وصلت');
    eq(r.enriched[0].answer, 1, 'وإجابة الملف تُحترم');
    eq(r.enriched[0].derived, false, 'ولا تُوسم مستنتجة');

    // ما ينقص فعلًا — لا ندّعي إثراءً لم يحدث
    eq(r.enriched[0].expl_ar, '', 'بلا شرح');
    eq(r.enriched[0].translation, '', 'وبلا ترجمة');
    eq(JSON.stringify(r.enriched[0].mnemonic), '{}', 'وبلا بطاقة حفظ');

    // السؤال بلا خيارات: إجابته تصير الخيار الوحيد ويُوسم
    eq(r.enriched[1].options[0], 'الإجابة', 'السؤال بلا خيارات: إجابته محفوظة');
    eq(r.enriched[1].opts_built, true, 'ويُوسم «خيارات مبنية» ليصحّحه صاحبه');

    // السؤال بلا إجابة معلنة يُوسم مستنتجًا كي يراجعه صاحبه
    eq(r.enriched[2].derived, true, 'والسؤال بلا إجابة معلنة يُوسم للمراجعة');
    W.close();
  })());
}
