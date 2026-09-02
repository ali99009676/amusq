/* ============ ٧٠ · تجميع مواد القسم تحت كلياتها ============ */
describe('٧٠ · تجميع القسم');
{
  const A = makeDom().window.QBANK;
  const G = A.campus.groupByCollege;

  const cols = [{ id:'c1', name:'كلية الهندسة' }, { id:'c2', name:'كلية الطب' }, { id:'c3', name:'كلية فارغة' }];
  const subs = [
    { id:'s1', college_id:'c1' }, { id:'s2', college_id:'c2' },
    { id:'s3', college_id:'c1' }, { id:'s4', college_id:null },
    { id:'s5', college_id:'مفقودة' }          // كلية حُذفت والمادة باقية
  ];
  const g = G(subs, cols);

  eq(g.length, 3, 'ثلاث مجموعات: كليتان فيهما مواد + مجموعة بلا كلية');
  eq(g[0].name, 'كلية الهندسة', 'الترتيب كما وصل من الخادم — الأكبر أولًا');
  eq(g[0].items.length, 2, 'والهندسة فيها مادتان');
  ok(!g.some(x => x.name === 'كلية فارغة'), 'والكلية بلا مواد لا تُعرض — تُربك ولا تُفيد');

  // ★ لا مادة تسقط: من لم يحدّد كليته، ومن أشارت مادته إلى كلية محذوفة
  const last = g[g.length - 1];
  eq(last.id, null, 'المجموعة الأخيرة هي «بلا كلية»');
  eq(last.items.length, 2, 'وتضمّ المادة بلا كلية والمادة ذات الكلية المفقودة');
  eq(subs.length, g.reduce((n, x) => n + x.items.length, 0),
     '★ مجموع المعروض يساوي مجموع الوارد — لا مادة تضيع في التجميع');

  eq(G([], cols).length, 0, 'ولا مجموعات حين لا مواد');
  eq(G(null, null).length, 0, 'ولا انهيار مع مدخلات فارغة');
}

/* ============ ٧١ · انتماء الطالب: حفظ وقراءة ومسح ============ */
describe('٧١ · جامعتي');
{
  const dom = makeDom(), W = dom.window, A = W.QBANK;
  const pl = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'u1', email:'a@a.a' }))));
  A.api.auth.captureFromHash('#access_token=h.' + pl + '.s&refresh_token=r&expires_in=9999');

  const calls = [];
  A.api.rpc = (name, args) => {
    calls.push({ name, args });
    if (name === 'set_my_campus')
      return Promise.resolve({ ok:true, data: args.p_university
        ? { university_id:'U1', university:args.p_university, country:args.p_country,
            college_id: args.p_college ? 'C1' : null, college: args.p_college || null }
        : {} });
    if (name === 'my_campus')
      return Promise.resolve({ ok:true, data:{ university_id:'U1', university:'جامعة نجران', country:'SA' } });
    return Promise.resolve({ ok:true, data:[] });
  };

  pending.push((async () => {
    const saved = await A.campus.save('SA', 'جامعة نجران', 'كلية الهندسة');
    eq(saved.university_id, 'U1', 'الحفظ يُرجع الجامعة');
    eq(A.campus.cached().university, 'جامعة نجران', 'وتُخزَّن محليًا للرسم الفوري');

    // ★ الاسم نصًّا لا معرّفًا: أول طالب في جامعته لن يجدها في أي قائمة
    const c = calls.filter(x => x.name === 'set_my_campus')[0];
    eq(c.args.p_university, 'جامعة نجران', 'ويُرسل الاسم نصًّا كي تُنشأ إن لم تكن موجودة');

    // ★ المسح يمسح فعلًا — وإلا بقي الطالب يرى جامعة تركها
    const cleared = await A.campus.save('', '', '');
    eq(cleared, null, 'المسح يُرجع لا شيء');
    eq(A.campus.cached(), null, 'ويُفرغ المخزَّن المحلي — لا يُبقي القديم');

    W.close();
  })());
}

/* ============ ٧٢ · شريط جامعتي على الشاشة الأولى ============ */
describe('٧٢ · شريط الجامعة');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  const pl = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'u2', email:'b@b.b' }))));
  A.api.auth.captureFromHash('#access_token=h.' + pl + '.s&refresh_token=r&expires_in=9999');
  A.data.savePack({ subjects:[{ id:'s1', name:'مادة', q_count:10, color:'subject-1', icon:'▤', topics:[] }], settings:{} });
  A.api.rpc = () => new Promise(() => {});      // الخادم صامت: نختبر الرسم الفوري من المخزَّن

  // بلا انتماء: دعوة لتحديد الجامعة
  A.store.remove('campus');
  A.router.render('#/');
  const ask = doc.querySelector('.campus-band--ask');
  ok(!!ask, 'من لم يحدّد جامعته يرى دعوة لتحديدها');
  has(ask.getAttribute('href'), '#/account', 'تقوده إلى حسابه حيث يختارها');
  has(ask.textContent, 'حدّد جامعتك', 'بنصّ صريح');

  // مع انتماء: باب القسم
  A.store.set('campus', { university_id:'U9', university:'جامعة الملك سعود', college:'كلية الحاسب', country:'SA' });
  A.router.render('#/');
  const band = doc.querySelector('.campus-band');
  ok(!!band, 'ومن حدّدها يرى شريط جامعته');
  ok(band.className.indexOf('campus-band--ask') === -1, 'لا دعوة بعد الآن');
  has(band.getAttribute('href'), '#/u/U9', '★ ويقود إلى قسم جامعته لا إلى قائمة عامة');
  has(band.textContent, 'جامعة الملك سعود', 'واسمها معروض');
  has(band.textContent, 'كلية الحاسب', 'وكليته معها');
  W.close();
}

/* ============ ٧٣ · صفحة القسم ============ */
describe('٧٣ · صفحة القسم');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;

  A.api.rpc = (name, args) => {
    if (name !== 'university_page') return Promise.resolve({ ok:true, data:[] });
    if (args.p_uni === 'GONE') return Promise.resolve({ ok:true, data:{ ok:false, reason:'not_found' } });
    return Promise.resolve({ ok:true, data:{
      ok:true, total:3,
      university:{ id:'U1', name:'جامعة نجران', country:'SA', city:'نجران', verified:true },
      colleges:[{ id:'c1', name:'كلية الهندسة', n:2 }],
      subjects:[
        { id:'s1', name:'الدوائر الكهربائية', slug:'circ', college_id:'c1', q_count:80, students:4, icon:'⚡', color:'subject-2' },
        { id:'s2', name:'الاستاتيكا', slug:'stat', college_id:'c1', q_count:40, students:1, icon:'▤', color:'subject-3' },
        { id:'s3', name:'مادة يتيمة', slug:'orph', college_id:null, q_count:12, students:0, icon:'▤', color:'subject-4' }
      ]
    }});
  };

  pending.push((async () => {
    await nav(W, '#/u/U1');
    await until(W, () => doc.querySelector('.uni-head'));
    const main = doc.getElementById('main');

    has(main.textContent, 'جامعة نجران', 'اسم الجامعة في الترويسة');
    has(main.textContent, 'موثّقة', 'ووسم التوثيق يظهر للموثّقة');
    has(main.textContent, 'السعودية', 'ودولتها بالاسم العربي لا الرمز');
    eq(doc.querySelectorAll('.excard').length, 3, 'وكل مواد القسم معروضة');
    eq(doc.querySelectorAll('.uni-col').length, 2, 'تحت عنوانَي مجموعة: الكلية و«بلا كلية»');
    has(doc.querySelectorAll('.uni-col')[0].textContent, 'كلية الهندسة', 'الكلية أولًا');

    // ★ الرابط هو الميزة: قسمٌ لا يُشارَك لا يجمع دفعة
    const copy = Array.prototype.filter.call(main.querySelectorAll('button'),
      b => b.textContent.indexOf('انسخ رابط القسم') !== -1)[0];
    ok(!!copy, 'وزر نسخ رابط القسم موجود');

    W.close();
  })());
}

/* ============ ٧٤ · قسم فارغ ورابط ميت ============ */
describe('٧٤ · حواف القسم');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  A.api.rpc = (name, args) => Promise.resolve({ ok:true, data:
    args.p_uni === 'GONE' ? { ok:false, reason:'not_found' } : {
      ok:true, total:0, university:{ id:'U2', name:'جامعة جديدة', country:'EG', city:'', verified:false },
      colleges:[], subjects:[] } });

  pending.push((async () => {
    // جامعة بلا بنوك: دعوة للرفع لا شاشة فارغة محبِطة
    await nav(W, '#/u/U2');
    await until(W, () => doc.getElementById('main').textContent.indexOf('لا بنوك') !== -1);
    const t = doc.getElementById('main').textContent;
    has(t, 'كن أنت أول من يرفع', '★ القسم الفارغ يدعو للرفع — أول طالب هو من يبنيه');
    ok(!!doc.querySelector('a[href="#/upload"]'), 'وبزر يقوده إلى الرفع');
    ok(t.indexOf('موثّقة') === -1, 'وغير الموثّقة لا تُوسم');

    // رابط لجامعة غير موجودة: رسالة تفهم لا صفحة مكسورة
    await nav(W, '#/u/GONE');
    await until(W, () => doc.getElementById('main').textContent.indexOf('لم نجد') !== -1);
    has(doc.getElementById('main').textContent, 'قد يكون الرابط قديمًا', 'والرابط الميت يشرح نفسه');

    // بلا معرّف إطلاقًا
    await nav(W, '#/u');
    has(doc.getElementById('main').textContent, 'لم تُحدَّد جامعة', 'ومسار بلا معرّف لا ينهار');
    W.close();
  })());
}

/* ============ ٧٥ · الرفع يرث انتماء الطالب ============ */
describe('٧٥ · الرفع يملأ الجامعة');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  const pl = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'u3', email:'c@c.c' }))));
  A.api.auth.captureFromHash('#access_token=h.' + pl + '.s&refresh_token=r&expires_in=9999');
  A.api.rpc = () => new Promise(() => {});
  A.store.set('campus', { university_id:'U1', university:'جامعة نجران', college:'كلية الطب', country:'SA' });

  // ★ الملء التلقائي ليس رفاهية: إعادة الكتابة تُنتج تهجئات تفتّت الجامعة
  const w = A.admin.newWizard();
  w.step = 3; w.raw = [{ q:'س', options:['أ','ب'], answer:0, has_options:true }];
  w.enriched = [{ q:'س', q_original:'س', options:['أ','ب'], answer:0, sanctity_mode:'strict' }];
  w.total = 1; w.done = 1;
  A.views.ViewUpload._set(w);
  A.router.render('#/upload');

  const cur = A.views.ViewUpload._get();
  eq(cur.country, 'SA', 'الدولة تُملأ من انتماء الطالب');
  eq(cur.university, 'جامعة نجران', 'والجامعة');
  eq(cur.college, 'كلية الطب', 'والكلية');

  // ولا يطمس ما كتبه بيده
  A.views.ViewUpload._reset();
  const w2 = A.admin.newWizard();
  w2.step = 3; w2.university = 'جامعة أخرى'; w2.country = 'EG';
  w2.raw = w.raw; w2.enriched = w.enriched; w2.total = 1; w2.done = 1;
  A.views.ViewUpload._set(w2);
  A.router.render('#/upload');
  eq(A.views.ViewUpload._get().university, 'جامعة أخرى', '★ ولا يطمس ما كتبه الطالب بيده');
  eq(A.views.ViewUpload._get().college, 'كلية الطب', 'ويملأ الفارغ وحده');

  A.views.ViewUpload._reset();
  W.close();
}

/* ============ ٧٦ · دوال القسم في قاعدة البيانات ============ */
describe('٧٦ · ملف CAMPUS.sql');
{
  const sql = fs.readFileSync(path.join(ROOT, 'db', 'CAMPUS.sql'), 'utf8');

  has(sql, 'add column if not exists university_id', 'انتماء الطالب يُضاف بأمان التكرار');
  has(sql, 'on delete set null', '★ حذف جامعة لا يحذف حساب طالب — يفقد انتماءه فقط');
  has(sql, 'create or replace function qbank.university_page', 'دالة صفحة القسم موجودة');
  has(sql, 'create or replace function qbank.set_my_campus', 'ودالة حفظ الانتماء');
  has(sql, 'create or replace function qbank.my_campus', 'ودالة قراءته');
  has(sql, 'create or replace function qbank.list_universities', 'وقائمة الجامعات للاختيار');

  // القسم مفتوح للزائر: الرابط يُشارَك في مجموعة الدفعة قبل أن يسجّل أحد
  has(sql, 'grant execute on function qbank.university_page(uuid) to anon, authenticated',
      '★ القسم يُفتح بلا تسجيل — الرابط يُشارَك قبل أن يسجّل أحد');
  // والانتماء لا يُكتب إلا من صاحبه
  has(sql, 'grant execute on function qbank.set_my_campus(text, text, text) to authenticated',
      'وحفظ الانتماء للمسجَّلين وحدهم');
  no(sql, 'grant execute on function qbank.set_my_campus(text, text, text) to anon',
     'ولا يُمنح للزائر');
  has(sql, 'auth.uid()', 'والدالة تكتب لصاحب الجلسة لا لمن يُمرَّر لها');

  // كل دالة تثبّت search_path — وإلا أمكن خداعها بمخطط بديل
  const defs = sql.split('create or replace function').slice(1);
  eq(defs.filter(d => d.indexOf('set search_path = qbank, public') === -1).length, 0,
     'وكل دالة تثبّت search_path');

  // المرور عبر ensure_* هو ما يمنع تفتّت الجامعة الواحدة إلى تهجئات
  has(sql, 'qbank.ensure_university(p_country, p_university)',
      '★ الحفظ يمرّ على ensure_university فيوحّد الإملاء');
  has(sql, 'published and s.status', 'ولا يُعرض في القسم إلا المنشور');
  no(sql, 'drop table', 'ولا حذف جدول في الملف');
  no(sql, 'drop column', 'ولا حذف عمود');
}
