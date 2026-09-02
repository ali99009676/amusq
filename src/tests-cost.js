/* ============ ٦٣ · النموذج الأوفر وتخزين التعليمات ============ */
describe('٦٣ · توفير تكلفة الذكاء');
{
  const ai = fs.readFileSync(path.join(ROOT,'api','ai.js'), 'utf8');

  has(ai, "'claude-haiku-4-5-20251001'", 'Haiku 4.5 هو الافتراضي — ثلث سعر Sonnet 4.5');
  has(ai, 'process.env.AI_MODEL', 'ويبقى قابلًا للتبديل من متغيّر البيئة');
  no(ai, "|| 'claude-sonnet-4-5'", 'ولم يبقَ النموذج الأغلى افتراضًا');

  // تخزين التعليمات: قراءة الذاكرة بعُشر سعر الدخل
  has(ai, "cache_control: { type:'ephemeral' }", 'تعليمات النظام مخزَّنة مؤقتًا');
  has(ai, "system: [{ type:'text'", 'وبالشكل الذي يقبله الخادم');

  // الشرح الإنجليزي أُسقط — إخراج مكرّر على منصة عربية، والإخراج ٥ أضعاف سعر الدخل
  no(ai, 'expl_en (الشرح بالانجليزية)', 'لا يُطلب شرح إنجليزي — إخراج مكرّر مكلف');
  has(ai, 'شرح عربي مركز في جملتين', 'والشرح العربي محدود الطول صراحةً');

  has(ai, 'questions.length > 40', 'حدّ الدفعة ٤٠ — تعليمات أقل لكل سؤال');
  has(ai, 'usage: aiOut._usage', 'والاستهلاك الحقيقي يعود للمشرف لا التقدير وحده');

  const A = makeDom().window.QBANK;
  eq(A.admin.BATCH, 40, 'وحدّ المتصفح يطابق حدّ الخادم');
}

/* ============ ٦٤ · حاسبة التكلفة ============ */
describe('٦٤ · حاسبة التكلفة');
{
  const A = makeDom().window.QBANK;
  const C = A.cost;

  // الأسعار كما أعلنتها Anthropic — لكل مليون رمز
  eq(C.prices['claude-haiku-4-5'].in, 1,   'سعر دخل Haiku 4.5 دولار للمليون');
  eq(C.prices['claude-haiku-4-5'].out, 5,  'وإخراجه خمسة');
  eq(C.prices['claude-sonnet-4-5'].in, 3,  'وSonnet 4.5 ثلاثة');
  eq(C.prices['claude-sonnet-4-5'].out, 15,'وإخراجه خمسة عشر');
  eq(C.DEFAULT, 'claude-haiku-4-5', 'والافتراضي هو الأوفر');

  const opts = { questions:300, withoutOptions:50, batchSize:40 };
  const h = C.estimate(opts);
  const s = C.estimate(Object.assign({}, opts, { model:'claude-sonnet-4-5' }));

  eq(h.batches, 8, 'ثلاثمئة سؤال بدفعات ٤٠ = ٨ دفعات');
  ok(h.usd > 0 && h.usd < 1, 'تكلفة ٣٠٠ سؤال بـHaiku أقل من دولار: $' + h.usd.toFixed(3));
  // ★ النسبة هي الدليل: الإخراج يغلب فالنسبة تقارب ثلث سعر النموذج
  ok(h.usd < s.usd * 0.4, 'وأقل من ٤٠٪ من تكلفة Sonnet 4.5');
  eq(C.estimate(Object.assign({}, opts, { model:'claude-opus-5' })).usd > s.usd, true,
     'وOpus أغلى من Sonnet كما هو متوقّع');

  // الريال مربوط بالدولار — التحويل ثابت لا يحتاج جلبًا
  ok(Math.abs(h.sar - h.usd * 3.75) < 1e-9, 'التحويل إلى الريال بسعر الربط الثابت');

  // السؤال بلا خيارات أغلى: الذكاء يبني له ثلاثة مشتتات
  const noOpts = C.estimate({ questions:100, withoutOptions:100, batchSize:40 });
  const allOpts = C.estimate({ questions:100, withoutOptions:0, batchSize:40 });
  ok(noOpts.usd > allOpts.usd, 'الأسئلة بلا خيارات أغلى — تحتاج بناء مشتتات');

  // التخزين المؤقت يوفّر، وتوفيره يكبر مع كثرة الدفعات
  const many = C.estimate({ questions:1000, withoutOptions:0, batchSize:40 });
  const few  = C.estimate({ questions:40,   withoutOptions:0, batchSize:40 });
  ok(many.saved > few.saved, 'توفير التخزين يكبر مع كثرة الدفعات');
  ok(few.saved >= 0, 'ولا يكون سالبًا أبدًا');

  // الحواف
  eq(C.estimate({ questions:0 }).usd, 0, 'ملف فارغ: صفر تكلفة');
  eq(C.estimate({ questions:0 }).batches, 0, 'وصفر دفعات');
  eq(C.estimate({ questions:-5 }).usd, 0, 'وعدد سالب لا يُنتج تكلفة سالبة');
  ok(C.estimate({ questions:10, model:'نموذج-غير-موجود' }).usd > 0,
     'ونموذج مجهول يسقط إلى الافتراضي بلا انهيار');

  // المقارنة مرتّبة بالأرخص
  const cmp = C.compare(opts);
  eq(cmp[0].id, 'claude-haiku-4-5', 'المقارنة تبدأ بالأوفر');
  ok(cmp[0].usd < cmp[cmp.length - 1].usd, 'وتنتهي بالأغلى');
  eq(cmp.length, Object.keys(C.prices).length, 'وتشمل كل النماذج المعروفة');

  // العرض: الريال أولًا لأنه عملة الطالب
  has(C.money(h), 'ريال', 'المبلغ يُعرض بالريال');
  has(C.money(h), '$', 'ومعه الدولار للمرجع');
}

/* ============ ٦٥ · التكلفة تُعرض قبل التشغيل ============ */
describe('٦٥ · شاشة ما قبل التشغيل');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  const pl = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'s1', email:'a@a.a' }))));
  A.api.auth.captureFromHash('#access_token=h.' + pl + '.s&refresh_token=r&expires_in=9999');

  // نضع المعالج في الخطوة ٢ مباشرة بـ١٢٠ سؤالًا
  const raw = [];
  for (let i = 0; i < 120; i++)
    raw.push({ q:'Q' + i, options:['a','b','c','d'], answer:0, has_options: i % 4 !== 0 });
  const w = A.admin.newWizard();
  w.step = 2; w.raw = raw; w.total = raw.length; w.filename = 'f.txt';
  A.views.ViewUpload._set(w);

  A.router.render('#/upload');
  const main = doc.getElementById('main');

  const box = doc.querySelector('.costbox');
  ok(!!box, 'صندوق التكلفة معروض قبل الضغط على التشغيل');
  has(box.textContent, 'التكلفة المقدّرة', 'وعنوانه صريح');
  has(box.textContent, 'ريال', 'والمبلغ بالريال');
  has(box.textContent, 'Haiku 4.5', 'والنموذج المستعمل مذكور');
  has(box.textContent, 'الأوفر', 'ومعلن أنه الأوفر');
  has(box.textContent, 'ولو استعملنا', 'ومعه ثمن البديل الأغلى للمقارنة');

  has(main.textContent, '120 سؤالًا', 'وعدد الأسئلة');
  has(main.textContent, '3 دفعة', 'وعدد الدفعات بحدّ ٤٠');
  has(main.textContent, 'المسوّدة تُحفظ بعد كل دفعة', 'ويطمئن أن التوقف لا يضيّع العمل');
  ok(!!doc.querySelector('.meter'), 'وشريط التقدّم جاهز');
  A.views.ViewUpload._reset();
  W.close();
}
