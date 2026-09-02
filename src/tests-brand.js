/* ============ ٤٤ · الهوية الجديدة: مراجعة — بنك الأسئلة ============ */
describe('٤٤ · الهوية والاسم');
{
  // لا بقايا للاسم القديم في أي شيء يراه الطالب
  no(html, 'AMUSQ', 'لا أثر للاسم القديم في الملف المبني');
  no(html, 'amusq', 'ولا بحروف صغيرة — عدا هجرة التخزين التي تذكره عمدًا');

  has(html, 'مراجعة', 'الاسم الجديد في الملف المبني');
  has(html, 'بنك الأسئلة', 'والوصف تحته');

  const dom = makeDom(), W = dom.window, doc = W.document;
  const brand = doc.querySelector('.brand');
  ok(!!brand, 'العلامة في الترويسة');
  eq(doc.querySelector('.brand__name').textContent, 'مراجعة', 'الاسم هو «مراجعة»');
  eq(doc.querySelector('.brand__sub').textContent, 'بنك الأسئلة', 'والوصف «بنك الأسئلة» تحته');
  has(brand.getAttribute('aria-label'), 'مراجعة', 'قارئ الشاشة يسمع الاسم لا حرفًا مفردًا');
  ok(!!doc.querySelector('.brand__mark svg'), 'العلامة كتاب مفتوح مرسوم لا حرف لاتيني');
  eq(doc.title.indexOf('مراجعة') !== -1, true, 'عنوان التبويب بالاسم الجديد');
  eq(doc.querySelector('meta[name="theme-color"]').getAttribute('content'), '#8c2f39',
     'لون الترويسة عنّابي — يطابق الهوية في شريط المتصفح');

  // التذييل الثابت — قاعدة مشروع لا تتغيّر مع الهوية
  has(doc.querySelector('.footer').textContent, 'علي الصقور', 'التذييل باقٍ كما هو');
  has(doc.querySelector('.footer a').getAttribute('href'), 'wa.me/966580805553', 'ورابط الواتساب باقٍ');

  // الموجّه يضع الاسم الجديد في العنوان
  W.QBANK.router.render('#/login');
  has(doc.title, 'مراجعة', 'الاسم يلحق كل عنوان صفحة');
  W.close();
}

/* ============ ٤٥ · نظام الألوان الجديد ============ */
describe('٤٥ · ألوان الورق والمكتبة');
{
  const css = html.split('<style>')[1].split('</style>')[0];
  const tokens = fs.readFileSync(path.join(__dirname,'css','00-tokens.css'), 'utf8');

  has(tokens, '--brand:      #8c2f39', 'العنّابي هو لون الهوية');
  has(tokens, '--gold:      #c9a227', 'والرملي الذهبي للتمييز');
  has(tokens, '--bg:        #fbf7f0', 'وخلفية ورقية دافئة لا بيضاء');
  no(tokens, '#12805c', 'لا أثر للأخضر الطبي القديم');
  no(tokens, '#3b5bdb', 'ولا للأزرق الأقدم');

  // نصّ داكن على ورق فاتح: الحبر بنّي مسودّ لا أسود صريح
  has(tokens, '--text:      #241a15', 'الحبر بنّي مسودّ — أرحم للعين على الورق');

  // الوضع الليلي موجود ومقلوب فعلًا لا منسوخ
  const dark = tokens.slice(tokens.indexOf('[data-theme="dark"]'));
  has(dark, '--bg:        #16110e', 'الوضع الليلي بنّي محروق لا أزرق بارد');
  has(dark, '--brand:      #d97a83', 'والعنّابي يفتحّ في الليل كي يبقى مقروءًا');
  ok(dark.indexOf('--gold:') !== -1, 'والذهبي معرّف في الليل أيضًا');

  // ست ألوان مواد في الوضعين
  for (let i = 1; i <= 6; i++){
    ok(tokens.indexOf('--subject-' + i + ':') !== -1, 'لون المادة ' + i + ' معرّف');
  }
  eq((tokens.match(/--subject-1:/g) || []).length, 2, 'ألوان المواد معرّفة في الوضعين معًا');

  // القاعدة الثابتة: لا لون صريح خارج ملف المتغيّرات
  ['30-components.css','40-screens.css','50-landing.css','60-admin.css'].forEach(f => {
    const t = fs.readFileSync(path.join(__dirname,'css',f), 'utf8');
    ok(!/#[0-9a-fA-F]{3,6}\b/.test(t), f + ' بلا لون صريح — كله من المتغيّرات');
  });

  // الرفّ حلّ محلّ خط تخطيط القلب
  has(css, '.lp-shelf', 'رفّ الكتب معرّف');
  no(css, '.lp-ecg', 'وخط تخطيط القلب أُزيل بالكامل');
  has(css, 'prefers-reduced-motion', 'حركة الرفّ تحترم تقليل الحركة');
}

/* ============ ٤٦ · رفّ الكتب يقرأ الأرقام الحقيقية ============ */
describe('٤٦ · رفّ الهبوط');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  A.api.saveSession(null);
  // مادتان: واحدة ضخمة وأخرى صغيرة — يجب أن يختلف سُمك كعبيهما
  A.data.savePack({ subjects:[
    { id:'a', name:'مادة كبيرة', q_count:300, color:'subject-1', icon:'▤', topics:[] },
    { id:'b', name:'مادة صغيرة', q_count:20,  color:'subject-2', icon:'▤', topics:[] }
  ], settings:{} });
  A.router.render('#/');

  const shelf = doc.querySelector('.lp-shelf');
  ok(!!shelf, 'الرفّ مرسوم على صفحة الهبوط');
  const books = shelf.querySelectorAll('.lp-shelf__book');
  eq(books.length, 2, 'كعب لكل مادة');
  const wide = parseFloat(books[0].getAttribute('width'));
  const thin = parseFloat(books[1].getAttribute('width'));
  ok(wide > thin, 'سُمك الكعب يتناسب مع عدد الأسئلة — الصورة تقول ما تقوله الأرقام');
  has(shelf.getAttribute('aria-label'), '2', 'قارئ الشاشة يسمع عدد المواد');
  ok(!!shelf.querySelector('.lp-shelf__plank'), 'لوح الرفّ مرسوم');

  // منصة فارغة: رفّ نموذجي لا فراغ محرج
  A.data.savePack({ subjects:[], settings:{} });
  A.router.render('#/');
  ok(doc.querySelectorAll('.lp-shelf__book').length > 0, 'بلا مواد بعد: رفّ نموذجي لا صفحة عارية');
  W.close();
}

/* ============ ٤٧ · الهجرة لا تُفقد طالبًا تقدّمه ============ */
describe('٤٧ · هجرة بيانات الطالب');
{
  const dom = makeDom(), W = dom.window, A = W.QBANK;
  const LS = W.localStorage;

  // نُحاكي جهاز طالب فتح المنصة بالهوية القديمة: تقدّم ونجوم وإعدادات
  LS.clear();
  LS.setItem('amusq:progress', JSON.stringify({ 'sub-1':{ seen:['q1','q2'], star:{ q3:true } } }));
  LS.setItem('amusq:theme', '"dark"');
  LS.setItem('amusq:entitlements', JSON.stringify([{ subject_id:'s1', kind:'subject', expires_at:'2027-01-01' }]));
  eq(A.store.get('progress', null), null, 'قبل الهجرة: البادئة الجديدة لا ترى شيئًا');

  const moved = A.store.migrate();
  eq(moved, 3, 'الهجرة نقلت المفاتيح الثلاثة');
  const prog = A.store.get('progress', null);
  ok(!!prog && prog['sub-1'].seen.length === 2, 'تقدّم الطالب وصل سليمًا');
  eq(prog['sub-1'].star.q3, true, 'ونجومه معه');
  eq(A.store.get('theme', null), 'dark', 'واختياره للوضع الليلي');
  eq(A.store.get('entitlements', []).length, 1, 'ومشترياته المحفوظة محليًا');
  eq(LS.getItem('amusq:progress'), null, 'والقديم مُسح فلا يبقى نسختان');

  // لا تطمس قيمة جديدة بقديمة
  LS.setItem('amusq:theme', '"light"');
  A.store.set('theme', 'dark');
  A.store.migrate();
  eq(A.store.get('theme', null), 'dark', 'قيمة جديدة كتبها المستخدم لا تُطمس بقديمة');
  eq(LS.getItem('amusq:theme'), null, 'والقديمة تُنظَّف على كل حال');

  // جهاز نظيف: الهجرة لا تفعل شيئًا ولا تنهار
  LS.clear();
  eq(A.store.migrate(), 0, 'جهاز بلا بيانات قديمة: لا شيء يُنقل');

  // وتُنادى فعلًا عند الإقلاع — وإلا فالكود موجود بلا أثر
  const boot = fs.readFileSync(path.join(__dirname,'js','40-app.js'), 'utf8');
  has(boot, 'QBANK.store.migrate()', 'الهجرة تُنادى عند الإقلاع');
  ok(boot.indexOf('QBANK.store.migrate()') < boot.indexOf('QBANK.theme.init()'),
     'وقبل قراءة الإعدادات — وإلا قرأ التطبيق فراغًا ثم وصلت البيانات');
  has(boot, 'QBANK.data.migrateDB()', 'وأسئلة وضع عدم الاتصال تُهاجَر أيضًا');

  const data = fs.readFileSync(path.join(__dirname,'js','16-data.js'), 'utf8');
  has(data, "OLD_DB: 'amusq'", 'قاعدة الأسئلة القديمة معروفة بالاسم');
  has(data, 'deleteDatabase', 'وتُحذف بعد النقل فلا تشغل مساحة الطالب');
  W.close();
}

/* ============ ٤٨ · هجرة مخطط قاعدة البيانات ============ */
describe('٤٨ · ملف هجرة المخطط');
{
  const mig = fs.readFileSync(path.join(ROOT,'db','MIGRATE-TO-QBANK.sql'), 'utf8');
  has(mig, 'alter schema amusq rename to qbank', 'إعادة تسمية لا نسخ — البيانات لا تتحرّك');
  ok(mig.indexOf('drop table') === -1, 'لا حذف جدول في ملف الهجرة');
  ok(mig.indexOf('drop schema') === -1, 'ولا حذف مخطط');
  ok(mig.indexOf('truncate') === -1, 'ولا تفريغ جدول');
  has(mig, "where schema_name = 'amusq'", 'إعادة التسمية مشروطة — آمنة التكرار');
  has(mig, 'Exposed schemas', 'الملف يذكّر بخطوة Data API التي بدونها لا يعمل الموقع');
  has(mig, 'if not exists', 'إعادة بناء الجداول لا تمسّ موجودًا');

  // كل ملفات القاعدة انتقلت للاسم الجديد
  ['schema.sql','policies.sql','functions.sql','UGC-COINS.sql','ADMIN-DASHBOARD.sql','SETTINGS-UPGRADE.sql']
    .forEach(f => {
      const t = fs.readFileSync(path.join(ROOT,'db',f), 'utf8');
      ok(t.indexOf('amusq.') === -1, f + ' بلا أثر للمخطط القديم');
      ok(t.indexOf('qbank') !== -1, f + ' يستعمل المخطط الجديد');
    });

  // والخادم أيضًا
  const supa = fs.readFileSync(path.join(ROOT,'api','_lib','supa.js'), 'utf8');
  has(supa, "'Accept-Profile': 'qbank'", 'الخادم يطلب المخطط الجديد');
  no(supa, 'amusq', 'ولا أثر للقديم فيه');
}
