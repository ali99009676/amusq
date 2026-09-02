/* ============ ٥٠ · التصنيف في قاعدة البيانات ============ */
describe('٥٠ · ملف التصنيف');
{
  const sql = fs.readFileSync(path.join(ROOT,'db','CATALOG.sql'), 'utf8');
  has(sql, 'create table if not exists qbank.universities', 'جدول الجامعات');
  has(sql, 'create table if not exists qbank.colleges', 'وجدول الكليات');
  ok(sql.indexOf('drop table') === -1 && sql.indexOf('drop column') === -1, 'لا حذف جدول ولا عمود');
  has(sql, 'add column if not exists university_id', 'المادة تُربط بجامعتها');

  // التطبيع العربي — بلا هذا لا يجد الطالب مادته
  has(sql, "translate(", 'تطبيع الحروف معرّف');
  has(sql, 'gin_trgm_ops', 'فهرس بحث ثلاثي — البحث لا يمسح الجدول كله');
  has(sql, 'generated always as', 'نص البحث محسوب مخزَّن لا يُحسب مع كل استعلام');

  // الترقيم: الحدّ يمنع استنزاف الخادم
  has(sql, 'least(greatest(coalesce(p_size,24), 1), 60)', 'حجم الصفحة مقصوص بين ١ و٦٠');
  has(sql, "'pages'", 'عدد الصفحات يعود مع النتيجة');
  has(sql, 'qbank.ensure_university', 'الطالب يضيف جامعته أثناء الرفع');
  has(sql, 'qbank.ar_norm(name) = qbank.ar_norm(nm)', 'والتطبيع يمنع تكرار الجامعة باختلاف الإملاء');
  has(sql, "verified   boolean not null default false", 'ما يضيفه الطالب غير موثّق افتراضيًا');

  // بذرة تغطّي المنطقة لا جامعة واحدة
  const countries = (sql.match(/\n  \('[A-Z]{2}'/g) || []).map(x => x.slice(4,6));
  ok(new Set(countries).size >= 15, 'البذرة تغطّي ' + new Set(countries).size + ' دولة عربية');
  has(sql, "('EG','جامعة القاهرة'", 'ومنها جامعات مصرية');
  has(sql, "('MA','جامعة محمد الخامس'", 'ومغربية');
}

/* ============ ٥١ · شاشة الاستكشاف ============ */
describe('٥١ · الاستكشاف');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  const E = A.explore;

  // أسماء الدول بالعربية لا برموزها
  eq(E.countryName('SA'), 'السعودية', 'رمز الدولة يُعرض بالعربية');
  eq(E.countryName('EG'), 'مصر', 'ومصر كذلك');
  eq(E.countryName('ZZ'), 'ZZ', 'ورمز مجهول يُعرض كما هو بلا انهيار');

  // الحالة في الرابط — تُشارَك وتُحفظ ويرجع إليها زرّ الرجوع
  const st = E.stateFrom({ q:'تشريح', country:'EG', page:'2' });
  eq(st.q, 'تشريح', 'البحث يُقرأ من الرابط');
  eq(st.country, 'EG', 'والدولة');
  eq(st.page, 2, 'ورقم الصفحة كعدد لا نص');
  eq(E.stateFrom({ page:'-5' }).page, 0, 'صفحة سالبة تُردّ إلى الأولى');
  eq(E.stateFrom({ page:'مرحبا' }).page, 0, 'وصفحة غير رقمية كذلك');

  has(E.toHash({ q:'قلب', country:'SA', sort:'newest', page:1 }), 'q=', 'الرابط يحمل البحث');
  has(E.toHash({ q:'قلب', country:'SA', sort:'newest', page:1 }), 'country=SA', 'ويحمل الدولة');
  has(E.toHash({ q:'قلب', country:'SA', sort:'newest', page:1 }), 'page=1', 'ورقم الصفحة');
  eq(E.toHash({ q:'', country:'', sort:'popular', page:0 }), '#/explore',
     'الحالة الافتراضية رابط نظيف بلا معاملات فارغة');

  // آخر اختيار يُحفظ — الطالب لا يعيد ضبط جامعته كل زيارة
  A.store.set(E.KEY, { country:'JO', uni:'u9', sort:'newest' });
  const back = E.stateFrom({});
  eq(back.country, 'JO', 'الدولة تعود من آخر زيارة');
  eq(back.sort, 'newest', 'وكذلك الترتيب');
  eq(E.stateFrom({ country:'' }).country, '', 'ومسحها صراحةً في الرابط يفوز على المحفوظ');
  A.store.remove(E.KEY);

  // في شريط التنقّل
  has(doc.getElementById('tabbar').textContent, 'استكشف', 'الاستكشاف في شريط التنقّل');
  ok(A.router.resolve('#/explore').def === A.views.ViewExplore, 'المسار يفتح الشاشة');

  const ROWS = [
    { id:'a', name:'تشريح الجهاز العصبي', descr:'وصف', icon:'☤', color:'subject-1', q_count:120,
      price:49, free:false, slug:'anat-n1', course_code:'ANA 201', university:'جامعة القاهرة',
      country:'EG', college:'كلية الطب', students:34 },
    { id:'b', name:'فيزيولوجيا', descr:'', icon:'▤', color:'subject-2', q_count:80,
      price:0, free:true, slug:'phys-1', course_code:'', university:'جامعة نجران',
      country:'SA', college:'', students:0 }
  ];
  A.api.rpc = (name, args) => {
    if (name === 'browse_subjects')
      return Promise.resolve({ ok:true, data:{ total:50, page:args.p_page, size:24, pages:3, rows:ROWS } });
    if (name === 'catalog_filters')
      return Promise.resolve({ ok:true, data:{
        countries:[{code:'SA',n:30},{code:'EG',n:20}],
        universities:[{id:'u1',name:'جامعة القاهرة',country:'EG',n:20}],
        colleges:[{id:'c1',name:'كلية الطب',n:12}] } });
    return Promise.resolve({ ok:false });
  };

  pending.push((async () => {
    await nav(W, '#/explore');
    await until(W, () => doc.querySelector('.excard'));
    const main = doc.getElementById('main');

    eq(doc.querySelectorAll('.excard').length, 2, 'بطاقة لكل نتيجة');
    has(main.textContent, '50 مادة', 'العدد الكلي معروض لا عدد الصفحة');
    has(main.textContent, 'جامعة القاهرة · كلية الطب', 'مكان تدريس المادة ظاهر — جوهر التصنيف');
    has(main.textContent, 'ANA 201', 'ورمز المقرر');
    has(main.textContent, '34 مشترك', 'وعدد المشتركين');
    has(main.textContent, 'مجانية', 'والمادة المجانية موسومة');
    has(main.textContent, '49 ريال', 'والمدفوعة بسعرها');
    eq(doc.querySelector('.excard').getAttribute('href'), '#s/anat-n1',
       'البطاقة تقود إلى رابط المشاركة لا إلى المحتوى مباشرة');

    // المرشّحات شرائح بأعدادها
    has(main.textContent, 'السعودية', 'الدولة بالعربية في المرشّحات');
    ok(doc.querySelectorAll('.chip').length >= 4, 'شرائح المرشّحات مرسومة');
    ok(!!doc.querySelector('.ex-chips'), 'وفي حاوية تمرير أفقي خاصة بها');

    // الترقيم
    has(main.textContent, '1 من 3', 'موضع الصفحة الحالية');
    const prev = Array.prototype.filter.call(doc.querySelectorAll('.ex-pager button'),
      b => b.textContent.indexOf('السابق') !== -1)[0];
    ok(prev.disabled, 'زر السابق معطّل في الصفحة الأولى');

    // لا نتائج: ندعوه ليرفعها هو — الفراغ فرصة لا نهاية
    A.api.rpc = name => name === 'browse_subjects'
      ? Promise.resolve({ ok:true, data:{ total:0, page:0, size:24, pages:0, rows:[] } })
      : Promise.resolve({ ok:true, data:{ countries:[], universities:[], colleges:[] } });
    A.router.render('#/explore?q=مادة+غير+موجودة');
    await until(W, () => doc.getElementById('main').textContent.indexOf('لم نجد شيئًا') !== -1);
    has(doc.getElementById('main').textContent, 'ارفع هذه المادة', 'الفراغ يدعوه للرفع');
    ok(!!doc.querySelector('a[href="#/upload"]'), 'والزر يقود لشاشة الرفع');
    W.close();
  })());
}

/* ============ ٥٢ · الاستكشاف لا يجلب المنصة كلها ============ */
describe('٥٢ · الحجم');
{
  const dom = makeDom(), W = dom.window, A = W.QBANK;
  const calls = [];
  A.api.rpc = (name, args) => { calls.push({ name, args });
    return Promise.resolve({ ok:true, data:{ total:0, page:0, size:24, pages:0, rows:[] } }); };

  pending.push((async () => {
    await nav(W, '#/explore');
    await until(W, () => calls.some(c => c.name === 'browse_subjects'), 5000);
    const b = calls.filter(c => c.name === 'browse_subjects')[0];
    ok(b.args.p_size <= 24, 'الطلب يحدّ الصفحة بـ ' + b.args.p_size + ' مادة لا كل المنصة');
    ok('p_page' in b.args, 'ويرسل رقم الصفحة');
    ok('p_country' in b.args && 'p_university' in b.args, 'والمرشّحات تُطبَّق في الخادم لا في المتصفح');
    eq(A.explore.PAGE, 24, 'حجم الدفعة ثابت ومعروف');
    W.close();
  })());
}
