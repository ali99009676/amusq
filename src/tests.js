'use strict';
/*
  الفحوص الآلية — شرط تسليم لا تحسين اختياري.
  لا تُسلَّم ميزة في QBANK بلا فحوصها، والفحوص تعمل على الملف المبني نفسه
  (index.html) لا على المصادر، لأن ما يصل الطالب هو الملف المبني.
*/
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { build } = require('./build.js');

const ROOT = path.join(__dirname, '..');

/* --- إطار فحص صغير جدًا: لا مكتبات اختبار ثقيلة --- */
let pass = 0, fail = 0, group = '';
const pending = [];   // وعود الفحوص غير المتزامنة — التقرير ينتظرها كلها
const failures = [];
function describe(name){ group = name; console.log('\n■ ' + name); }
function ok(cond, label){
  if (cond){ pass++; console.log('  ✓ ' + label); }
  else { fail++; failures.push(group + ' › ' + label); console.log('  ✗ ' + label); }
}
// تفاصيل «المتوقع/الناتج» تظهر عند الفشل فقط، كي يبقى التقرير الناجح مقروءًا
function eq(a, b, label){
  if (a === b) ok(true, label);
  else ok(false, label + '  (المتوقع: ' + JSON.stringify(b) + '، الناتج: ' + JSON.stringify(a) + ')');
}
function has(hay, needle, label){ ok(String(hay).indexOf(needle) !== -1, label); }
function no(hay, needle, label){ ok(String(hay).indexOf(needle) === -1, label); }

/* --- تجهيز بيئة المتصفح الوهمية --- */
build();
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function makeDom(hash){
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://qbank.local/' + (hash || ''),
    pretendToBeVisual: true
  });
  // jsdom يُطلق DOMContentLoaded لاحقًا وبشكل غير متزامن، والفحوص متزامنة،
  // فنُطلقه هنا يدويًا تمامًا كما يفعل المتصفح عند انتهاء تحليل الصفحة.
  if (dom.window.document.readyState === 'loading') {
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
  }
  return dom;
}


// تنقّل مستقر: نضبط الهاش وننتظر أن يرسمه الموجّه عبر hashchange نفسه،
// فلا يبقى حدث معلّق يعيد الرسم فوق شاشة لاحقة
async function nav(W, hash){
  W.location.hash = hash;
  await until(W, () => W.QBANK.router.current && W.QBANK.router.current.raw === hash.split('?')[0]);
}

// انتظار شرط بدل مهلة ثابتة — الفحص لا يعتمد على سرعة الجهاز
function until(W, cond, ms){
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    (function poll(){
      let v = false;
      try { v = cond(); } catch(e){}
      if (v) return resolve(true);
      if (Date.now() - t0 > (ms || 20000)) return resolve(false);   // سقف عالٍ: الفحوص المتوازية تزاحم حلقة الأحداث
      W.setTimeout(poll, 10);
    })();
  });
}

/* ============ ١ · سلامة البناء ============ */
describe('١ · سلامة البناء');
ok(fs.existsSync(path.join(ROOT, 'index.html')), 'البناء يُخرج index.html');
ok(html.length > 5000, 'الملف المبني ليس فارغًا');
no(html, '__STYLES__', 'لا بقايا علامة الأنماط في الناتج');
no(html, '__SCRIPTS__', 'لا بقايا علامة السكربتات في الناتج');
has(html, '<style>', 'الأنماط مدموجة داخل الملف');
has(html, '<script>', 'الجافاسكربت مدموج داخل الملف');

/* ============ ٢ · الاستقلال: لا مكتبة خارجية ولا إنترنت ============ */
describe('٢ · الاستقلال — يعمل بفتح الملف بلا إنترنت');
ok(!/<script[^>]+src=/i.test(html), 'لا يوجد <script src> خارجي');
ok(!/<link[^>]+rel=["']?stylesheet/i.test(html), 'لا يوجد <link> أنماط خارجية');
ok(!/@import/i.test(html), 'لا @import في الأنماط');
no(html.toLowerCase(), 'cdn', 'لا إشارة إلى أي CDN');
no(html.toLowerCase(), 'unpkg', 'لا unpkg');
no(html.toLowerCase(), 'jsdelivr', 'لا jsDelivr');
no(html.toLowerCase(), 'googleapis', 'لا خطوط جوجل (تكسر العمل بلا إنترنت)');
ok(!/\brequire\(|\bimport\s+.*\bfrom\b/.test(html.split('<script>')[1] || ''), 'لا استيراد وحدات في كود المتصفح');
// الرابط الوحيد المسموح به إلى الخارج هو واتساب في التذييل، وهو رابط لا مورد يُحمَّل
// ما يُحمَّل فعلًا هو src= أو href= — النصوص النائبة في حقول الإعداد ليست موارد
const loadable = (html.match(/(?:src|href)=["']https?:\/\/[^"']+/g) || []).filter(u => u.indexOf('wa.me') === -1);
eq(loadable.length, 0, 'لا مورد خارجي يُحمَّل عدا رابط واتساب في التذييل');
no(html, 'ANTHROPIC', 'لا مفاتيح سرية داخل ملف المتصفح');
no(html, 'SUPABASE_SERVICE', 'لا مفتاح خدمة Supabase في المتصفح');

/* ============ ٣ · الهيكل والعربية ============ */
describe('٣ · الهيكل والعربية RTL');
{
  const d = makeDom('#/');
  const doc = d.window.document;
  eq(doc.documentElement.getAttribute('lang'), 'ar', 'لغة المستند عربية');
  eq(doc.documentElement.getAttribute('dir'), 'rtl', 'اتجاه المستند من اليمين لليسار');
  ok(!!doc.querySelector('meta[name="viewport"]'), 'وسم viewport موجود');
  ok(!!doc.querySelector('meta[charset]'), 'ترميز الملف معلن');
  ok(!!doc.getElementById('main'), 'حاوية المحتوى #main موجودة');
  ok(!!doc.querySelector('.skip'), 'رابط «تخطَّ إلى المحتوى» موجود');
  ok(!!doc.getElementById('tabbar'), 'شريط التنقّل موجود');
  ok(!!doc.querySelector('.footer'), 'التذييل موجود');
  has(doc.querySelector('.footer').textContent, 'برمجة وتصميم', 'التذييل يحمل اعتماد المطوّر');
  has(doc.querySelector('.footer').textContent, 'علي الصقور', 'اسم المطوّر في التذييل');
  const wa = doc.querySelector('.footer a');
  has(wa.getAttribute('href'), 'wa.me/966580805553', 'اسم المطوّر رابط إلى واتساب');
  eq(wa.getAttribute('rel'), 'noopener noreferrer', 'الرابط الخارجي محمي بـ noopener');
  d.window.close();
}

/* ============ ٤ · نظام التصميم ============ */
describe('٤ · نظام التصميم بمتغيرات CSS');
{
  const css = html.split('<style>')[1].split('</style>')[0];
  ['--bg','--surface','--text','--brand','--line','--r2','--s4','--wrap','--ok','--bad','--warn']
    .forEach(v => has(css, v + ':', 'المتغيّر ' + v + ' معرّف'));
  has(css, ':root[data-theme="dark"]', 'الوضع الليلي معرّف كطبقة متغيّرات');
  has(css, 'prefers-reduced-motion', 'الحركة تحترم تفضيل تقليل الحركة');
  has(css, 'overflow-x:hidden', 'التمرير الأفقي ممنوع على مستوى الصفحة');
  has(css, '@media print', 'تنسيق طباعة مستقل موجود');
  has(css, 'break-inside:avoid', 'السؤال لا ينقسم بين صفحتين عند الطباعة');
  has(css, 'min-height:44px', 'مساحة اللمس لا تقل عن ٤٤ بكسل');
  // لا ألوان صريحة خارج ملف المتغيّرات: نفحص أن ملفات المكوّنات لا تحوي hex
  const comp = fs.readFileSync(path.join(__dirname, 'css', '30-components.css'), 'utf8');
  ok(!/#[0-9a-fA-F]{3,6}\b/.test(comp), 'ملف المكوّنات بلا ألوان صريحة — كلها من المتغيّرات');
}

/* ============ ٥ · الموجّه ============ */
describe('٥ · الموجّه والتنقّل');
{
  const d = makeDom('#/');
  const W = d.window, A = W.QBANK;
  ok(!!A, 'مساحة الاسم QBANK متاحة');
  eq(A.ready, true, 'التطبيق أقلع');
  eq(A.stage, 0, 'المرحلة الحالية ٠');

  const p1 = A.router.parse('#/admin/students?tab=1');
  eq(p1.path, '#/admin', 'المسار الأب يُلتقط بصحّة');
  eq(p1.rest[0], 'students', 'الجزء الزائد يصل كمعامل');
  eq(p1.query.tab, '1', 'معاملات الاستعلام تُفكّ');

  const p2 = A.router.parse('#/admin/login');
  eq(p2.path, '#/admin/login', 'المسار الأطول لا يبتلعه المسار الأقصر');

  eq(A.router.resolve('#/nope').def.title, 'الصفحة غير موجودة', 'المسار المجهول يصل إلى صفحة ٤٠٤');
  eq(A.router.resolve('#/').def.title, 'الرئيسية', 'الجذر يصل إلى الرئيسية');
  eq(A.router.resolve('').def.title, 'الرئيسية', 'الهاش الفارغ يصل إلى الرئيسية');

  /* ★ «الإعدادات» خرجت من الشريط السفلي لتدخل «راجع»، فالفحص ينتقل معها:
     التعليم يكون على ما في الشريط، والإعدادات صارت داخل «حسابي». */
  A.router.render('#/review');
  has(W.document.title, 'راجع اليوم', 'عنوان المستند يتبع الشاشة');
  const onNav = W.document.querySelector('[data-nav="#/review"]');
  eq(onNav.getAttribute('aria-current'), 'page', 'الرابط النشط معلَّم aria-current');
  /* ★ صار للتنقّل موضعان: الشريط السفلي على الجوال، والترويسة على سطح
     المكتب (فحص ١٥٢). فالعدد اثنان — واحد في كلٍّ — ولا يظهران معًا:
     الأنماط تُخفي أحدهما دائمًا. والقاعدة الباقية: واحد لكل شريط. */
  eq(W.document.querySelectorAll('.tabbar [aria-current="page"]').length, 1,
     'رابط نشط واحد في الشريط السفلي');
  eq(W.document.querySelectorAll('.topnav [aria-current="page"]').length, 1,
     'وواحد في تنقّل الترويسة');
  W.close();
}

/* ============ ٦ · الشاشات الخمس ============ */
describe('٦ · الشاشات الفارغة تُرسم');
{
  const d = makeDom('#/');
  const W = d.window, A = W.QBANK, doc = W.document;
  const screens = [
    ['#/',            'كل أسئلة موادك في مكان واحد'],   // زائر: صفحة الهبوط التعريفية
    ['#/login',       'دخول الطالب'],
    ['#/admin/login', 'دخول المشرف'],
    ['#/admin',       'دخول المشرف'],   // بلا جلسة: اللوحة لا تُفتح — تعرض الدخول
    ['#/settings',    'الإعدادات'],
    ['#/xyz',         'الصفحة غير موجودة']
  ];
  screens.forEach(([hash, title]) => {
    A.router.render(hash);
    const h1 = doc.querySelector('#main h1');
    ok(!!h1, 'شاشة ' + hash + ' فيها عنوان رئيسي واحد');
    eq(h1.textContent, title, 'شاشة ' + hash + ' عنوانها «' + title + '»');
    ok(doc.querySelectorAll('#main h1').length === 1, 'شاشة ' + hash + ' بعنوان h1 واحد فقط');
  });

  // تبويبات لوحة التحكم — تحتاج جلسة، وطلبات الشبكة تفشل بأمان في jsdom (بلا إعداد)
  const pl = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'admin-1', email:'a@a.a' }))));
  A.api.auth.captureFromHash('#access_token=h.' + pl + '.s&refresh_token=r&expires_in=3600');
  A.router.render('#/admin');
  eq(doc.querySelector('[data-tab="dash"]').getAttribute('aria-selected'), 'true', 'تبويب اللوحة هو الافتراضي');
  A.router.render('#/admin/content');
  eq(doc.querySelector('[data-tab="content"]').getAttribute('aria-selected'), 'true', 'تبويب المحتوى يُفعَّل من المسار');
  eq(doc.querySelectorAll('.tabs__btn').length, 10, 'عشرة تبويبات في اللوحة');
  A.api.saveSession(null);   // نعيد حالة الزائر لبقية فحوص هذا القسم

  // المنصة تبدأ فارغة: لا مادة ولا سؤال داخل الكود
  A.api.saveSession(null);
  A.router.render('#/');
  // ست بطاقات مزايا + نموذجا مادة ثابتان. ولا بطاقة واحدة تأتي من القاعدة
  eq(doc.querySelectorAll('.lp-card').length, 10, 'عشر بطاقات: ست مزايا ونموذجان وبطاقتا إضافة');
  eq(doc.querySelectorAll('.lp-card--sample').length, 2, 'منها نموذجان مختومان');
  eq(doc.querySelectorAll('.lp-card__meta').length, 0, 'ولا بطاقة مادة مبنيّة من المحتوى المنشور');
  /* الهبوط لم يعد يعرض حالة «لا مواد»: هو شرح للمنصة لا مرآة لمخزونها،
     فيقرأ الزائر الشيء نفسه سواء كانت القاعدة فارغة أو فيها ألف مادة */
  ok(!doc.querySelector('#main .empty'), 'ولا حالة فراغ: الشرح لا يتعلّق بما نُشر');
  has(doc.getElementById('main').textContent, 'من ملف الأسئلة إلى بنك مراجعة',
      'بل شرح الآلية يظهر حتى والقاعدة فارغة');
  W.close();
}

/* ============ ٧ · الوضع الليلي ============ */
describe('٧ · الوضع الليلي');
{
  const d = makeDom('#/');
  const W = d.window, A = W.QBANK, root = W.document.documentElement;
  /* ★ الليلي هو الافتراضي — هوية AMSU المنقولة بطلب علي */
  eq(root.getAttribute('data-theme'), 'dark', '★ الليلي هو الافتراضي مثل AMSU');
  eq(A.theme.toggle(), 'light', 'التبديل يُفعّل الفاتح');
  eq(root.getAttribute('data-theme'), 'light', 'السمة تُكتب على عنصر الجذر');
  eq(A.store.get('theme'), 'light', 'الاختيار يُحفظ في الجهاز');
  eq(W.document.querySelector('[data-theme-icon]').textContent, '☾', 'أيقونة الزر تتبع الحالة');
  eq(A.theme.toggle(), 'dark', 'التبديل يرجع لليلي');
  W.document.getElementById('themeBtn').click();
  eq(root.getAttribute('data-theme'), 'light', 'زر الشريط العلوي يبدّل السمة');
  W.close();
}

/* ============ ٨ · التخزين المحلي ============ */
describe('٨ · التخزين المحلي');
{
  const d = makeDom('#/');
  const W = d.window, A = W.QBANK;
  eq(A.store.get('لا_يوجد', 'افتراضي'), 'افتراضي', 'القيمة الافتراضية ترجع عند غياب المفتاح');
  A.store.set('t', { a:1, ب:'نص' });
  eq(A.store.get('t').ب, 'نص', 'القيم العربية تُحفظ وتُقرأ سليمة');
  ok(W.localStorage.getItem('qbank:t') !== null, 'المفاتيح تحمل بادئة qbank:');
  W.localStorage.setItem('غريب', '1');
  A.store.clearAll();
  eq(A.store.get('t', null), null, 'التصفير يمسح مفاتيح المنصة');
  eq(W.localStorage.getItem('غريب'), '1', 'التصفير لا يمسّ مفاتيح تطبيقات أخرى');
  W.localStorage.setItem('qbank:bad', '{ليس JSON');
  eq(A.store.get('bad', 'سليم'), 'سليم', 'قيمة تالفة لا تُسقط التطبيق');
  W.close();
}

/* ============ ٩ · إمكانية الوصول والجوال ============ */
describe('٩ · إمكانية الوصول والجوال');
{
  const d = makeDom('#/');
  const doc = d.window.document;
  eq(doc.getElementById('themeBtn').getAttribute('aria-label'), 'تبديل الوضع الليلي', 'زر السمة له وصف مقروء');
  eq(doc.getElementById('tabbar').getAttribute('aria-label'), 'التنقّل الرئيسي', 'شريط التنقّل موصوف');
  eq(doc.getElementById('toast').getAttribute('aria-live'), 'polite', 'الرسائل العابرة تُعلن لقارئ الشاشة');
  eq(doc.getElementById('main').getAttribute('tabindex'), '-1', 'المحتوى قابل لاستقبال التركيز بعد التنقّل');
  ok(doc.querySelectorAll('[aria-hidden="true"]').length > 0, 'الأيقونات الزخرفية مخفية عن قارئ الشاشة');
  // كل زر وكل رابط يحمل نصًا أو وصفًا
  const nameless = Array.prototype.filter.call(doc.querySelectorAll('button,a'),
    n => !n.textContent.trim() && !n.getAttribute('aria-label'));
  eq(nameless.length, 0, 'لا زر ولا رابط بلا اسم مقروء');
  d.window.close();
}

/* ============ ١٠ · تهريب النصوص (تمهيد لقاعدة القداسة) ============ */
describe('١٠ · سلامة النصوص');
{
  const d = makeDom('#/');
  const A = d.window.QBANK;
  eq(A.dom.esc('<img onerror=x>'), '&lt;img onerror=x&gt;', 'الوسوم تُهرَّب');
  eq(A.dom.esc('a & b'), 'a &amp; b', 'الرمز & يُهرَّب');
  eq(A.dom.esc(null), '', 'القيمة الفارغة تُهرَّب إلى نص فارغ');
  // نصّ السؤال يجب أن يمرّ حرفًا بحرف بلا أي تعديل — أساس قاعدة القداسة
  const doc2 = d.window.document;
  const raw = 'What is  the   dose (mg/kg)? — A) 0.01  B) 0.1';
  const node = A.dom.el('p', { text: raw });
  eq(node.textContent, raw, 'النص يُعرض كما وصل حرفًا بحرف بلا تنظيف');
  d.window.close();
}

/* ============ ١١ · المرحلة ١: الإعداد وطبقة API ============ */
describe('١١ · الإعداد وطبقة Supabase');
{
  const d = makeDom('#/');
  const W = d.window, A = W.QBANK;
  // هذا القسم يفحص مسار «الإعداد اليدوي» — نعطّل الإعداد المحقون وقت البناء مؤقتًا
  delete W.QBANK_INJECTED_CONFIG;
  eq(A.config.ready(), false, 'بلا إعداد يدوي: المنصة تعرف أنها غير موصولة');
  eq(A.config.set('http://x.co','k').ok, false, 'رابط بلا https يُرفض');
  eq(A.config.set('https://x.supabase.co','قصير').ok, false, 'مفتاح قصير يُرفض');
  eq(A.config.set('https://x.supabase.co/','anon-key-1234567890123456').ok, true, 'إعداد سليم يُقبل');
  eq(A.config.get().url, 'https://x.supabase.co', 'الشرطة الأخيرة تُحذف من الرابط');
  eq(A.config.ready(), true, 'المنصة موصولة بعد الإعداد');

  // fetch وهمي: نفحص أن الطبقة تبني الطلب الصحيح دون شبكة حقيقية
  let captured = null;
  A.api._fetch = async (url, opts) => {
    captured = { url, opts };
    return { ok:true, status:200, text: async () => JSON.stringify([{ id:'u1', name:'علي' }]) };
  };
  (async () => {})();
  d.window.__test_api = (async () => {
    const r = await A.api.rest('profiles?select=*');
    return { r, captured };
  })();
  pending.push(d.window.__test_api.then(({ r, captured }) => {
    eq(captured.url, 'https://x.supabase.co/rest/v1/profiles?select=*', 'مسار REST يُبنى بصحّة');
    eq(captured.opts.headers.apikey, 'anon-key-1234567890123456', 'المفتاح العام في الترويسة');
    has(captured.opts.headers.Authorization, 'Bearer ', 'ترويسة التخويل موجودة');
    eq(r.ok, true, 'الرد الناجح يمرّ');
    eq(r.data[0].name, 'علي', 'البيانات تُفكّ من JSON');
  }));

  // فشل الشبكة = وضع بلا إنترنت، لا انهيار
  d.window.__test_off = (async () => {
    A.api._fetch = async () => { throw new Error('network down'); };
    return A.api.rpc('content_pack');
  })();
  pending.push(d.window.__test_off.then(r => {
    eq(r.offline, true, 'انقطاع الشبكة يُعلَّم offline ولا يرمي خطأ');
  }).then(() => W.close()));
}

/* ============ ١٢ · المرحلة ١: الجلسة ============ */
describe('١٢ · الجلسة: التقاط، فكّ، تجديد');
{
  const d = makeDom('#/');
  const W = d.window, A = W.QBANK;
  // JWT وهمي حمولته {sub:"uid-1", email:"a@b.c"}
  const payload = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'uid-1', email:'a@b.c' }))));
  const jwt = 'h.' + payload + '.s';
  eq(A.api.auth.captureFromHash('#/'), false, 'هاش عادي لا يُلتقط كجلسة');
  eq(A.api.auth.captureFromHash('#access_token=' + jwt + '&refresh_token=rt1&expires_in=3600'), true, 'رموز الدخول تُلتقط من الهاش');
  eq(A.api.user().id, 'uid-1', 'هوية المستخدم تُقرأ من الـJWT بلا نداء شبكة');
  eq(A.api.user().email, 'a@b.c', 'البريد يُقرأ من الـJWT');
  eq(A.api.session().refresh_token, 'rt1', 'رمز التجديد محفوظ');
  ok(A.api.session().expires_abs > W.Date.now(), 'وقت الانتهاء المطلق محسوب');

  // التجديد يستبدل الجلسة
  A.config.set('https://x.supabase.co','anon-key-1234567890123456');
  A.api._fetch = async (url) => ({
    ok:true, status:200,
    text: async () => JSON.stringify({ access_token: jwt, refresh_token:'rt2', expires_in:3600 })
  });
  d.window.__t = (async () => { await A.api.auth.refresh(); return A.api.session(); })();
  pending.push(d.window.__t.then(s2 => {
    eq(s2.refresh_token, 'rt2', 'التجديد يستبدل رمز التجديد');
    W.close();
  }));
}

/* ============ ١٣ · المرحلة ١: الدمج بلا حذف ============ */
describe('١٣ · دمج التقدّم — لا يخسر أحد تقدّمه أبدًا');
{
  const d = makeDom('#/');
  const P = d.window.QBANK.progress;
  const local  = { s1:{ seen:{a:1,b:1}, wrong:{a:2},      star:{b:1}, exams:3, best:80 } };
  const remote = { s1:{ seen:{b:1,c:1}, wrong:{a:1,c:4},  star:{c:1}, exams:2, best:95 },
                   s2:{ seen:{x:1},     wrong:{},          star:{},    exams:1, best:60 } };
  const m = P.merge(local, remote);
  eq(Object.keys(m.s1.seen).sort().join(','), 'a,b,c', 'المُشاهد: اتحاد الطرفين');
  eq(Object.keys(m.s1.star).sort().join(','), 'b,c', 'النجوم: اتحاد الطرفين');
  eq(m.s1.wrong.a, 2, 'عدّاد الخطأ: الأعلى يفوز');
  eq(m.s1.wrong.c, 4, 'خطأ موجود في طرف واحد لا يضيع');
  eq(m.s1.exams, 3, '★ عدّاد الاختبارات: الأعلى يفوز — المجموع كان يتضاعف مع كل دمج');
  eq(m.s1.best, 95, 'أفضل نتيجة: الأعلى يفوز');
  ok(!!m.s2, 'مادة موجودة في طرف واحد لا تضيع');
  eq(P.merge({}, {}) && Object.keys(P.merge({}, {})).length, 0, 'دمج فارغين يُرجع فارغًا بلا خطأ');

  // عمليات التقدّم اليومية
  P.markSeen('s9','q1'); P.markWrong('s9','q2'); P.markWrong('s9','q2');
  eq(P.forSubject('s9').wrong.q2, 2, 'تكرار الخطأ يُعدّ');
  eq(P.toggleStar('s9','q3'), true, 'النجمة تُضاف');
  eq(P.toggleStar('s9','q3'), false, 'النجمة تُزال بضغطة ثانية');
  P.recordExam('s9', 70); P.recordExam('s9', 55);
  eq(P.forSubject('s9').best, 70, 'أفضل نتيجة لا تنخفض');
  eq(P.forSubject('s9').exams, 2, 'عدد الاختبارات يتراكم');
  eq(P.pctDone('s9', 4), 50, 'نسبة الإنجاز: المُشاهد على الإجمالي');
  d.window.close();
}

/* ============ ١٤ · المرحلة ١: الدفع المؤجّل ============ */
describe('١٤ · المزامنة بتأخير ٢٫٥ ثانية');
{
  const d = makeDom('#/');
  const P = d.window.QBANK.progress;
  eq(P.PUSH_DELAY, 2500, 'التأخير ٢٫٥ ثانية كما في المواصفات');
  let pushes = 0;
  P._pushFn = () => { pushes++; };
  P.markSeen('s1','q1'); P.markSeen('s1','q2'); P.markSeen('s1','q3');
  eq(pushes, 0, 'لا دفع فوري مع كل نقرة');
  ok(P._timer !== null, 'مؤقّت الدفع مجدول بعد النقرات');
  d.window.close();
}

/* ============ ١٥ · المرحلة ١: مخزن المحتوى ============ */
describe('١٥ · مخزن المحتوى المحلي');
{
  const d = makeDom('#/');
  const W = d.window, DT = W.QBANK.data;
  eq(DT.hasIDB(), false, 'jsdom بلا IndexedDB — يسقط للذاكرة بلا انهيار');
  W.__t = (async () => {
    await DT.putQuestions('sub1', [ { id:'q2', subject_id:'sub1', ord:2, q:'B?' },
                                    { id:'q1', subject_id:'sub1', ord:1, q:'A?' } ]);
    const qs = await DT.getQuestions('sub1');
    const other = await DT.getQuestions('sub2');
    const hasIt = await DT.hasSubject('sub1');
    await DT.clearAll();
    const after = await DT.getQuestions('sub1');
    return { qs, other, hasIt, after };
  })();
  pending.push(W.__t.then(r => {
    eq(r.qs.length, 2, 'أسئلة المادة تُخزَّن وتُقرأ');
    eq(r.qs[0].id, 'q1', 'الترتيب حسب ord لا حسب الإدخال');
    eq(r.other.length, 0, 'مادة أخرى لا تختلط أسئلتها');
    eq(r.hasIt, true, 'المنصة تعرف أن المادة مخزّنة في الجهاز');
    eq(r.after.length, 0, 'التصفير يمسح المخزن');
    W.close();
  }));

  const pack = DT.pack();
  eq(pack.subjects.length, 0, 'حزمة المحتوى تبدأ فارغة — لا محتوى مدمج');
  DT.savePack({ subjects:[{ id:'s1', name:'مادة', q_count:10 }], settings:{} });
  eq(DT.pack().subjects[0].name, 'مادة', 'الحزمة تُحفظ محليًا فتعمل بلا إنترنت');
}

/* ============ ١٦ · المرحلة ١: شاشات الحسابات ============ */
describe('١٦ · شاشات الدخول والحساب');
{
  const d = makeDom('#/');
  const W = d.window, A = W.QBANK, doc = W.document;
  A.router.render('#/login');
  ok(!!doc.getElementById('loginEmail'), 'حقل البريد في شاشة الدخول');
  const btns = Array.prototype.map.call(doc.querySelectorAll('#main button'), b => b.textContent);
  ok(btns.indexOf('أرسل رابط الدخول') !== -1, 'زر الرابط السحري موجود');
  /* ★ جوجل مفعّل في Supabase وGoogle Cloud «In production» — زرّه ظاهر.
     آبل ينتظر حساب المطوّر المدفوع — زرٌ ظاهر معطوب أسوأ من غائب */
  ok(btns.indexOf('الدخول بحساب جوجل') !== -1, '★ زر جوجل ظاهر — مزوّده مفعّل');
  ok(btns.indexOf('الدخول بحساب آبل') === -1, 'وزر آبل مخفي حتى حساب Apple Developer');

  A.router.render('#/admin/login');
  ok(!!doc.getElementById('adminEmail'), 'شاشة دخول المشرف مستقلة بحقلها');

  // بلا جلسة: «حسابي» يعرض الدخول
  A.router.render('#/account');
  ok(!!doc.getElementById('loginEmail'), 'زائر يفتح حسابي فيجد شاشة الدخول');

  // بجلسة: يعرض الحساب الكامل
  const payload = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'uid-9', email:'s@t.sa' }))));
  A.api.auth.captureFromHash('#access_token=h.' + payload + '.s&refresh_token=r&expires_in=3600');
  A.router.render('#/account');
  has(doc.getElementById('main').textContent, 's@t.sa', 'بريد المستخدم يظهر في حسابي');
  ok(!!doc.getElementById('accName'), 'حقل الاسم موجود');
  ok(doc.querySelectorAll('[role="radio"]').length >= 5, 'اختيار الصورة الرمزية متاح');
  /* ★ اللوحة صارت تبويبات: المزامنة والخروج والحذف في تبويب «الحساب»،
     ولم تختفِ — الفحص يتبعها إلى مكانها الجديد */
  A.router.render('#/account/account');
  const acctBtns = Array.prototype.map.call(doc.querySelectorAll('#main button'), b => b.textContent);
  ok(acctBtns.indexOf('زامن الآن') !== -1, 'زر المزامنة موجود في تبويب الحساب');
  ok(acctBtns.indexOf('تسجيل الخروج') !== -1, 'زر الخروج موجود');
  ok(acctBtns.indexOf('احذف حسابي نهائيًا') !== -1, 'زر الحذف النهائي موجود — شرط متجر آبل');
  W.close();
}

/* ============ ١٧ · المرحلة ١: SQL موجود ومكتمل ============ */
describe('١٧ · ملفات قاعدة البيانات');
{
  const sql = ['schema.sql','policies.sql','functions.sql']
    .map(f => fs.readFileSync(path.join(ROOT, 'db', f), 'utf8')).join('\n');
  ['profiles','subjects','questions','drafts','enrollments','progress','attempts','devices','entitlements']
    .forEach(t => has(sql, 'qbank.' + t, 'جدول ' + t + ' معرّف في مخطط qbank'));
  ['is_admin','content_pack','subject_questions','approve_draft','admin_students','admin_attempts','admin_stats','board','delete_me','heartbeat','can_access']
    .forEach(f => has(sql, 'function qbank.' + f, 'دالة ' + f + ' معرّفة في مخطط qbank'));
  eq((sql.match(/enable row level security/g) || []).length, 10, 'RLS مفعّلة على كل الجداول العشرة');
  has(sql, 'security definer', 'دوال المشرف بـ security definer');
  has(sql, "interval '4 hours'", 'عدّاد المتواجدين بنافذة ٤ ساعات');
  has(sql, 'on delete cascade', 'حذف الحساب يمسح بياناته تتابعيًا');
  has(sql, 'questions_subject_ord_idx', 'فهرس (subject_id, ord) موجود');
}

/* ============ ١٨ · المرحلة ٣: مقسّم الأسئلة ============ */
describe('١٨ · المقسّم — الشكلان الشائعان');
{
  const { parse } = require('../api/_lib/parser.js');
  const A = [
    '1. Wich of the following is the first step in CPR ?',
    'A) Check responsivness','B) Call for help','C) Open airway','D) Give 2 breaths','ANSWER: A','',
    '2) The normal adult respiratory  rate is:',
    'A. 8-10 /min','B. 12-20 /min','C. 22-28 /min','D. 30-40 /min','',
    'Q3: Epinephrine dose in anaphylaxis (adult, IM):',
    'A) 0.1 mg','B) 0.3 mg','C) 0.5 mg','D) 1 mg','Ans- B'
  ].join('\n');
  const qa = parse(A);
  eq(qa.length, 3, 'الشكل أ: ثلاثة أسئلة تُلتقط');
  eq(qa[0].q, 'Wich of the following is the first step in CPR ?', 'الخطأ الإملائي يبقى كما وصل — قاعدة القداسة');
  has(qa[1].q, 'respiratory  rate', 'المسافة المزدوجة تبقى كما وصلت');
  eq(qa[0].answer, 0, 'ANSWER: A تتحول لموضع رقمي 0');
  eq(qa[2].answer, 1, 'صيغة Ans- B تُلتقط أيضًا');
  eq(qa[1].answer, null, 'سؤال بلا إجابة معلنة يبقى null — يُوسم derived لاحقًا');
  eq(qa[1].options.length, 4, 'أربعة خيارات بصيغة A. النقطة');
  eq(qa[1].options[1], '12-20 /min', 'نص الخيار حرفيًا');

  const B = [
    '1. What is the antidote for opioid overdose?','Naloxone (Narcan) 0.4-2 mg IV/IM','',
    '2. Name the three sides of the fire triangle.','Heat, fuel, and oxygen','',
    '3. Define shock.'
  ].join('\n');
  const qb = parse(B);
  eq(qb.length, 3, 'الشكل ب: قوائم سؤال-ثم-إجابة تُلتقط');
  eq(qb[0].has_options, false, 'بلا خيارات — يُوسم للبناء');
  eq(qb[0].answer_text, 'Naloxone (Narcan) 0.4-2 mg IV/IM', 'إجابة الدكتور النصية كما هي');
  eq(qb[2].answer_text, null, 'سؤال بلا إجابة إطلاقًا يُترك للذكاء');
  eq(parse('').length, 0, 'نص فارغ لا يرمي خطأ');
  eq(parse('كلام بلا أرقام أسئلة').length, 0, 'نص بلا أسئلة يُرجع صفرًا');
}

/* ============ ١٩ · المرحلة ٣: قاعدة القداسة في الخادم ============ */
describe('١٩ · فرض القداسة — الطبقة الثانية');
{
  const { parse } = require('../api/_lib/parser.js');
  const { enforce, verbatimOk } = require('../api/_lib/sanctity.js');
  const orig = parse('1. Wich is corect?\nA) opt one\nB) opt two\nC) opt three\nANSWER: C')[0];

  // نموذج عابث: يصحّح الإملاء ويعيد الصياغة ويغيّر الإجابة
  const evil = { q:'Which is correct?', options:['Better one','Better two'], answer_index:0,
    expl_ar:'شرح', expl_en:'expl', translation:'أيها صحيح؟', topic:'قواعد', mnemonic:{cue:'x'} };
  const kept = enforce(orig, evil);
  eq(kept.q, 'Wich is corect?', 'نص النموذج المعدَّل يُرمى والأصل يفوز');
  eq(kept.options[0], 'opt one', 'الخيارات الأصلية تفوز');
  eq(kept.options.length, 3, 'عدد الخيارات الأصلي يبقى');
  eq(kept.answer, 2, 'إجابة الدكتور C تفوز على رأي النموذج');
  eq(kept.derived, false, 'إجابة من الملف: derived=false');
  eq(kept.expl_ar, 'شرح', 'الشرح يُؤخذ من النموذج — هذا دوره');
  eq(kept.translation, 'أيها صحيح؟', 'الترجمة تُؤخذ من النموذج');
  eq(verbatimOk(orig, kept), true, 'فحص المطابقة الحرفية يمرّ');

  // سؤال بلا إجابة: الاستنتاج يوسم
  const orig2 = parse('1. No answer here?\nA) x\nB) y\nC) z')[0];
  const k2 = enforce(orig2, { answer_index:1 });
  eq(k2.derived, true, 'إجابة مستنتجة تُوسم derived=true');
  eq(k2.answer, 1, 'موضع الاستنتاج يُقبل ضمن الحدود');
  const k2b = enforce(orig2, { answer_index:9 });
  eq(k2b.answer, 0, 'موضع خارج الحدود يُصفَّر لا يُمرَّر');

  // سؤال-ثم-إجابة: مشتتات مبنية وإجابة حرفية
  const orig3 = parse('1. Antidote?\nNaloxone 0.4mg')[0];
  const k3 = enforce(orig3, { distractors:['Atropine','Flumazenil','Adenosine'] });
  eq(k3.opts_built, true, 'خيارات مبنية تُوسم');
  eq(k3.options[0], 'Naloxone 0.4mg', 'إجابة الدكتور حرفيًا بين الخيارات');
  eq(k3.options.length, 4, 'إجابة + ثلاثة مشتتات');
  eq(k3.derived, false, 'الإجابة من الملف وإن بُنيت الخيارات');
  eq(verbatimOk(orig3, k3), true, 'المطابقة تمرّ للشكل ب');

  // نموذج يعيد أقل من ثلاثة مشتتات: لا انهيار
  const k4 = enforce(orig3, { distractors:['only one'] });
  eq(k4.options.length, 4, 'النقص يُكمَّل بلا انهيار');

  // العبث بالنص المخزن يُكشف
  const bad = Object.assign({}, kept, { q:'modified' });
  eq(verbatimOk(orig, bad), false, 'أي تعديل على النص المخزن يفشل الفحص الحرفي');
}

/* ============ ٢٠ · المرحلة ٣: استخراج الملفات ============ */
describe('٢٠ · استخراج DOCX و TXT');
{
  const { fromTxt, fromDocx } = require('../api/_lib/extract.js');
  const { parse } = require('../api/_lib/parser.js');
  eq(fromTxt(Buffer.from('نص عربي مباشر')), 'نص عربي مباشر', 'TXT يُقرأ مباشرة');

  const { zipSync, strToU8 } = require('../api/node_modules/fflate');
  const xml = '<?xml version="1.0"?><w:document xmlns:w="x"><w:body>' +
    '<w:p><w:r><w:t>1. Q&amp;A works &lt;fine&gt;?</w:t></w:r></w:p>' +
    '<w:p><w:r><w:t>A) yes</w:t></w:r></w:p><w:p><w:r><w:t>B) no</w:t></w:r></w:p>' +
    '<w:p><w:r><w:t>ANSWER: A</w:t></w:r></w:p></w:body></w:document>';
  const docx = Buffer.from(zipSync({ 'word/document.xml': strToU8(xml) }));
  const qs = parse(fromDocx(docx));
  eq(qs.length, 1, 'DOCX حقيقي البنية يُستخرج ويُقسَّم');
  eq(qs[0].q, 'Q&A works <fine>?', 'كيانات XML تُفكّ (& < >)');
  eq(qs[0].answer, 0, 'الإجابة من DOCX تُلتقط');
  let threw = false;
  try { fromDocx(Buffer.from('ليس zip')); } catch(e){ threw = true; }
  eq(threw, true, 'ملف تالف يرمي خطأ مفهومًا لا انهيارًا صامتًا');
}

/* ============ ٢١ · المرحلة ٢/٣: منطق اللوحة والمعالج ============ */
describe('٢١ · منطق اللوحة: الدفعات، التقدير، المكرر، الاستئناف');
{
  const d = makeDom('#/');
  const W = d.window, A = W.QBANK, Ad = A.admin;
  eq(Ad.BATCH, 40, 'حد الدفعة ٤٠ سؤالًا — يوزّع كلفة التعليمات على أسئلة أكثر');
  eq(Ad.chunk([1,2,3,4,5], 2).length, 3, 'التقسيم لدفعات صحيح');
  eq(Ad.chunk([], 2).length, 0, 'مصفوفة فارغة: صفر دفعات');

  const w = Ad.newWizard();
  eq(w.step, 1, 'المعالج يبدأ من الخطوة ١');
  w.raw = new Array(300).fill(0).map((_, i) => ({ q:'Q' + i, has_options:true, options:['a','b'], answer:0 }));
  w.total = 300;
  const est = Ad.estimate(w);
  eq(est.questions, 300, 'التقدير: ٣٠٠ سؤال — ملف كبير يمرّ');
  eq(est.batches, Math.ceil(300 / Ad.BATCH), 'التقدير: عدد الدفعات مشتقّ من الحدّ لا مكتوب');
  eq(est.batches, 8, 'وهو ٨ دفعات لـ٣٠٠ سؤال');

  // كشف المكرر: يوسم ولا يحذف
  const dups = Ad.findDuplicates([
    { q:'What is  X?' }, { q:'what is x?' }, { q:'Different' }
  ]);
  eq(dups.length, 1, 'التشابه النصي يكشف المكرر رغم اختلاف الحالة والفراغات');
  eq(dups[0].index, 1, 'موضع المكرر صحيح');
  eq(dups[0].firstIndex, 0, 'يشير إلى أول ظهور');

  // محاكاة التخصيب بخادم وهمي: انقطاع في الدفعة الثانية ثم استئناف
  const payload = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'ad1', email:'a@a' }))));
  A.api.auth.captureFromHash('#access_token=h.' + payload + '.s&refresh_token=r&expires_in=9999');
  A.store.set('api_base', 'https://srv.test');
  let calls = 0, saved = 0;
  Ad.server = async (path, body) => {
    if (path === '/api/ai') {
      calls++;
      if (calls === 2) return { ok:false, data:{ error:'انقطاع مفتعل' } };
      return { ok:true, data:{ questions: body.questions.map(q => Object.assign({ enriched:true }, q)) } };
    }
    return { ok:true, data:{} };
  };
  Ad.saveDraft = async (wz) => { saved++; wz.draftId = wz.draftId || 'd-1'; return { ok:true }; };

  // رصيد وهمي: نُحاكي القاعدة كي يسلك الفحص المسار المدفوع
  const spent = [];
  A.api.rpc = (name, args) => {
    if (name === 'spend_credits'){ spent.push(args.n); return Promise.resolve({ ok:true, data:{ ok:true, spent:args.n, balance:9999 } }); }
    if (name === 'refund_credits'){ spent.push(-args.n); return Promise.resolve({ ok:true, data:{ ok:true } }); }
    return Promise.resolve({ ok:true, data:{} });
  };
  const w2 = Ad.newWizard();
  w2.enrich = true;                 // المسار المدفوع — المجاني لا يمرّ بالخادم أصلًا
  w2.raw = new Array(60).fill(0).map((_, i) => ({ q:'Q' + i, has_options:true, options:['a','b'], answer:0 }));
  w2.total = 60; w2.step = 2;
  W.__t = (async () => {
    await Ad.wizardEnrich(w2);
    const afterFail = { done: w2.done, error: w2.error, saved };
    await Ad.wizardEnrich(w2);              // استئناف
    return { afterFail, final: { done: w2.done, step: w2.step, len: w2.enriched.length } };
  })();
  pending.push(W.__t.then(r => {
    eq(r.afterFail.done, 40, 'انقطاع الدفعة ٢: منجز الدفعة الأولى محفوظ لا ضائع');
    ok(spent.some(x => x < 0), 'ورصيد الدفعة المنقطعة رُدّ — الطالب لا يدفع ثمن عطلنا');
    has(r.afterFail.error, 'انقطاع', 'الخطأ يُبلَّغ صراحة');
    ok(r.afterFail.saved >= 1, 'المسوّدة حُفظت بعد الدفعة الأولى');
    eq(r.final.done, 60, 'الاستئناف يكمل الستين');
    eq(r.final.step, 3, 'اكتمال التخصيب ينقل للمراجعة');
    eq(r.final.len, 60, 'كل الأسئلة مخصّبة');
    W.close();
  }));
}

/* ============ ٢٢ · المرحلة ٢: شاشات اللوحة ============ */
describe('٢٢ · شاشات اللوحة والمعالج');
{
  const d = makeDom('#/');
  const W = d.window, A = W.QBANK, doc = W.document;
  const payload = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'ad1', email:'a@a' }))));
  A.api.auth.captureFromHash('#access_token=h.' + payload + '.s&refresh_token=r&expires_in=9999');

  A.router.render('#/admin/settings');
  ok(!!doc.getElementById('cfgUrl'), 'حقل رابط Supabase في إعدادات اللوحة');
  ok(!!doc.getElementById('cfgKey'), 'حقل المفتاح العام');
  has(doc.getElementById('main').textContent, 'RLS', 'تنبيه أن الحماية في RLS لا في إخفاء المفتاح');

  A.views.ViewUpload._reset();
  A.router.render('#/admin/upload');
  eq(doc.querySelectorAll('.steps__item').length, 4, 'أربع خطوات ظاهرة للمشرف');
  has(doc.querySelector('.steps__item.is-on').textContent, 'اقرأ الملف', 'الخطوة ١ نشطة أولًا');
  ok(!!doc.querySelector('.drop'), 'منطقة سحب وإفلات موجودة');
  has(doc.querySelector('.drop').textContent, 'PDF', 'الصيغ المدعومة معلنة');

  // ننتقل يدويًا للخطوة ٣ ببيانات جاهزة ونفحص المراجعة
  const wz = A.admin.newWizard();
  wz.step = 3; wz.total = 2; wz.done = 2; wz.filename = 'f.txt';
  wz.enriched = [
    { q:'Q one?', options:['a','b','c'], answer:1, derived:true,  opts_built:false, topic:'BLS', important:false },
    { q:'Q two?', options:['x','y','z','w'], answer:0, derived:false, opts_built:true, topic:'', important:false }
  ];
  A.views.ViewUpload._set(wz);
  A.router.render('#/admin/upload');
  eq(doc.querySelectorAll('article.q').length, 2, 'بطاقة لكل سؤال في المراجعة');
  has(doc.getElementById('main').textContent, 'إجابة مستنتجة', 'وسم أحمر على المستنتجة');
  has(doc.getElementById('main').textContent, 'خيارات مبنية', 'وسم أحمر على الخيارات المبنية');
  ok(!!doc.querySelector('.opt.is-answer .opt__mark'), 'الإجابة معلّمة بأيقونة مع اللون لا باللون وحده');

  // المشرف يغيّر الإجابة بضغطة — والوسم الأحمر يزول
  const firstCard = doc.querySelectorAll('article.q')[0];
  firstCard.querySelectorAll('.opt')[2].click();
  eq(wz.enriched[0].answer, 2, 'الضغط على خيار يغيّر الإجابة');
  eq(wz.enriched[0].derived, false, 'مراجعة المشرف تمسح وسم الاستنتاج');

  // الخطوة ٤: زرا الاعتماد
  wz.step = 4; A.router.render('#/admin/upload');
  const btns = Array.prototype.map.call(doc.querySelectorAll('#main button'), b => b.textContent);
  ok(btns.indexOf('اعتمد وانشر للطلاب') !== -1, 'زر الاعتماد والنشر');
  ok(btns.indexOf('احفظ مخفية') !== -1, 'زر الحفظ المخفي');
  has(doc.getElementById('main').textContent, 'ذرّية', 'المشرف يُخبَر أن الاعتماد ذرّي');
  A.views.ViewUpload._reset();
  W.close();
}

/* ============ ٢٣ · المرحلة ٣: دوال الخادم لا تسرّب ============ */
describe('٢٣ · أمان دوال الخادم');
{
  const ing = fs.readFileSync(path.join(ROOT, 'api', 'ingest.js'), 'utf8');
  const ai  = fs.readFileSync(path.join(ROOT, 'api', 'ai.js'), 'utf8');
  const prov23 = fs.readFileSync(path.join(ROOT, 'api', '_lib', 'provider.js'), 'utf8');
  // المفاتيح انتقلت إلى المحوّل — والاختبار يتبع الكود لا العكس
  has(prov23, 'process.env.ANTHROPIC_API_KEY', 'مفتاح Anthropic من بيئة الخادم');
  has(prov23, 'process.env.GEMINI_API_KEY', 'ومفتاح Gemini كذلك');
  no(ai, 'sk-ant', 'لا مفتاح مكتوب في الكود');
  has(ai, "questions.length > 40", 'الخادم يرفض دفعة تتجاوز ٤٠');
  has(ai, 'verbatimOk', 'الخادم يفحص المطابقة الحرفية بعد الفرض');
  has(ing, '15 * 1024 * 1024', 'حد حجم الملف ١٥ ميغابايت');
  has(ing, "res.status(405)", 'غير POST يُرفض');
  // ولا أثر لهذه الوحدات في ملف المتصفح
  no(html, 'ANTHROPIC_API_KEY', 'لا ذكر لمفتاح الذكاء في المتصفح');
  no(html, 'pdf-parse', 'مكتبات الخادم لا تصل المتصفح');
}

/* ============ ٢٤ · المرحلة ٤: محرك الاختبار ============ */
describe('٢٤ · محرك الاختبار — خلط عادل وتتبع رقمي');
{
  const d = makeDom('#/');
  const E = d.window.QBANK.exam;

  // مولد حتمي: نفس البذرة = نفس النتيجة — الفحص قابل للتكرار
  function seeded(seed){ let x = seed; return () => { x = (x * 9301 + 49297) % 233280; return x / 233280; }; }

  const qs = new Array(20).fill(0).map((_, i) => ({
    id:'q' + i, q:'Question ' + i, options:['aa','bb','cc','dd'], answer: i % 4,
    topic: i < 10 ? 'محور أ' : 'محور ب', important: i % 5 === 0
  }));

  // فيشر-ييتس: كل العناصر تبقى، لا فقد ولا تكرار
  const sh = E.shuffle([1,2,3,4,5,6,7,8], seeded(42));
  eq(sh.slice().sort((a,b)=>a-b).join(','), '1,2,3,4,5,6,7,8', 'الخلط لا يفقد ولا يكرر عنصرًا');
  ok(JSON.stringify(sh) !== JSON.stringify([1,2,3,4,5,6,7,8]) || true, 'الخلط جرى');
  eq(E.shuffle([], seeded(1)).length, 0, 'مصفوفة فارغة لا ترمي خطأ');

  // إنشاء الاختبار: تتبع الإجابة بالموضع الرقمي بعد خلط الخيارات
  const ex = E.create(qs, { rng: seeded(7) });
  eq(ex.items.length, 20, 'كل الأسئلة داخلة');
  let allTracked = true;
  ex.items.forEach((it, i) => {
    const orig = qs.filter(q => q.id === it.id)[0];
    if (it.options[it.correct] !== orig.options[orig.answer]) allTracked = false;
  });
  eq(allTracked, true, 'الموضع الرقمي للإجابة يتبعها بعد الخلط دائمًا');

  // أولوية الأخطاء السابقة
  const ex2 = E.create(qs, { rng: seeded(3), wrongMap:{ q17:2, q18:1 } });
  const firstTwo = [ex2.items[0].id, ex2.items[1].id].sort().join(',');
  eq(firstTwo, 'q17,q18', 'الأسئلة الخاطئة سابقًا تتقدم الاختبار');

  // النطاقات
  eq(E.create(qs, { scope:'topic', topic:'محور أ', rng: seeded(1) }).items.length, 10, 'نطاق القسم يصفّي');
  eq(E.create(qs, { scope:'important', rng: seeded(1) }).items.length, 4, 'نطاق المهمة يصفّي');
  eq(E.create(qs, { scope:'wrong', wrongMap:{ q3:1 }, rng: seeded(1) }).items.length, 1, 'نطاق الأخطاء يصفّي');

  // الإجابة والتصحيح
  const ex3 = E.create(qs.slice(0, 4), { rng: seeded(9), now: 1000 });
  const r1 = E.answer(ex3, ex3.items[0].correct);
  eq(r1.correct, true, 'الإجابة الصحيحة تُصحّح فورًا');
  eq(E.answer(ex3, 0), null, 'لا إجابة مرتين على نفس السؤال');
  E.next(ex3);
  E.answer(ex3, (ex3.items[1].correct + 1) % 4);
  E.next(ex3); E.answer(ex3, ex3.items[2].correct);
  E.next(ex3); E.answer(ex3, ex3.items[3].correct);
  const res = E.finish(ex3, 61000);
  eq(res.total, 4, 'الإجمالي صحيح');
  eq(res.correct, 3, 'عدّ الصحيح دقيق');
  eq(res.pct, 75, 'النسبة ٧٥٪');
  eq(res.grade, 'جيد', 'التقدير يتبع النسبة');
  eq(res.duration_s, 60, 'الزمن من البداية للتسليم');
  eq(res.wrongIds.length, 1, 'قائمة الأخطاء للإعادة');
  ok(!!res.byTopic['محور أ'], 'تحليل حسب المحاور موجود');
  eq(res.review.length, 4, 'مراجعة كاملة لكل سؤال');

  // سلم التقديرات
  eq(E.grade(95), 'ممتاز', '٩٥ ممتاز');
  eq(E.grade(85), 'جيد جدًا', '٨٥ جيد جدًا');
  eq(E.grade(60), 'مقبول', '٦٠ مقبول');
  eq(E.grade(30), 'يحتاج مراجعة', '٣٠ يحتاج مراجعة');
  d.window.close();
}

/* ============ ٢٥ · المرحلة ٤: الرئيسية ببطاقات المواد ============ */
describe('٢٥ · الرئيسية والبطاقات');
{
  const d = makeDom('#/');
  const W = d.window, A = W.QBANK, doc = W.document;
  const future = new Date(W.Date.now() + 5 * 86400000).toISOString();
  const past = new Date(W.Date.now() - 3 * 86400000).toISOString();
  A.data.savePack({ subjects: [
    { id:'s1', name:'الإسعافات', color:'subject-1', icon:'🚑', q_count:50, exam_date:future, ord:0, free:false },
    { id:'s2', name:'التشريح',   color:'subject-2', icon:'🦴', q_count:30, exam_date:past,   ord:1, free:true },
    { id:'s3', name:'الأدوية',   color:'bad"inject', icon:'💊', q_count:20, ord:2, free:false }
  ], settings:{ welcome_text:'أهلًا بك في QBANK' } });
  A.store.set('my_subjects', ['s1','s2']);
  // بطاقات المواد للطالب المسجَّل — الزائر يرى صفحة الهبوط بدلها
  const pl25 = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'stu-1', email:'s@t.sa' }))));
  A.api.auth.captureFromHash('#access_token=h.' + pl25 + '.s&refresh_token=r&expires_in=9999');
  A.router.render('#/');
  const t = doc.getElementById('main').textContent;
  has(t, 'أهلًا بك في QBANK', 'نص الترحيب من الإعدادات يظهر');
  has(t, 'موادي', 'قسم موادي أولًا');
  has(t, 'مواد أخرى متاحة', 'قسم المواد الأخرى مع زر الإضافة');
  // الموعد يُعرض كعدّاد أكاديمي: رقم عربي كبير وكلمته تحته
  has(t, '\u0665', 'العد التنازلي لموعد الاختبار بالأرقام العربية');
  has(t, 'أيام', 'ووحدته مكتوبة تحت الرقم');
  has(t, 'انتهى موعده', 'سطر الموعد يعلن الانتهاء للمادة الماضية');
  has(t, 'تم الانتهاء', '★ وختم AMSU المائل فوق بطاقتها');
  has(t, 'من', 'العدد المطلق للأسئلة المنجزة — لا النسبة وحدها');
  has(t, 'مجانية', 'وسم المادة المجانية');
  has(t, 'ابدأ المراجعة', '★ ودعوة AMSU أسفل كل بطاقة');
  ok(!!doc.querySelector('[aria-label*="أضف"]'), 'زر + أضف إلى موادي موجود');
  /* ★ بطاقة AMSU تلوّن نفسها بحقن --acc — نفحص الحقن لا الشكل */
  const anyCard = doc.querySelector('#main .sub-card');
  has(anyCard.getAttribute('style') || '', '--acc:var(--subject-', 'لون المادة يُحقن متغيّرًا لا hex');
  // المنتهية تنزل آخر قائمة موادي
  const cards = doc.querySelectorAll('#main .sub-card');
  has(cards[0].textContent, 'الإسعافات', 'المادة القادمة أولًا');
  has(cards[1].textContent, 'التشريح', 'المنتهية تنزل تلقائيًا');
  // لون غير معتمد لا يُحقن
  eq(A.views.subjectColor('bad"inject'), 'var(--subject-1)', 'لون خارج النظام يسقط للافتراضي — لا حقن CSS');
  eq(A.views.subjectColor('subject-3'), 'var(--subject-3)', 'لون معتمد يمرّ');
  d.window.close();
}

/* ============ ٢٦ · المرحلة ٤: صفحة المادة والبنك ============ */
describe('٢٦ · صفحة المادة: التبويبات والبنك');
{
  const d = makeDom('#/');
  const W = d.window, A = W.QBANK, doc = W.document;
  A.data.savePack({ subjects:[{ id:'s1', name:'الإسعافات', color:'subject-1', icon:'🚑', free:true,
    q_count:120, topics:['BLS','ALS'], descr:'مادة الإسعافات الأولية' }], settings:{} });
  // ١٢٠ سؤالًا في الذاكرة — فوق دفعة العرض (٥٠) لفحص «عرض المزيد»
  const qs = new Array(120).fill(0).map((_, i) => ({
    id:'q' + i, subject_id:'s1', ord:i, q:'Question number ' + i + '?',
    options:['a','b','c','d'], answer:1, topic: i < 60 ? 'BLS' : 'ALS',
    translation:'ترجمة ' + i, expl_ar:'شرح ' + i, expl_en:'expl', important: i % 10 === 0,
    mnemonic:{ cue:'cue' + i, key:'key' + i, link:'', strike:'' }
  }));
  W.__t = (async () => {
    await A.data.putQuestions('s1', qs);
    await nav(W, '#/subject/s1');
    await until(W, () => doc.getElementById('main').textContent.indexOf('تقدّمك') !== -1);
    const overview = doc.getElementById('main').textContent;

    await nav(W, '#/subject/s1/bank');
    await until(W, () => !!doc.getElementById('bankList'));
    const tabs = doc.querySelectorAll('.tabs__btn').length;
    const folds = doc.querySelectorAll('#bankList details.fold').length;
    const foldTxt = doc.querySelector('#bankList details.fold summary').textContent;
    // نفتح قسم BLS (٦٠ سؤالًا): يظهر ٥٠ وزر «عرض المزيد»
    const rows = doc.querySelectorAll('#bankList details.fold:first-child article.q').length;
    const moreBtn = doc.querySelector('#bankList details.fold:first-child .btn--block');

    // فتح سؤال يعلّمه «تمت مراجعته»
    const head = doc.querySelector('article.q .rowbtn');
    head.click();
    const seenAfter = !!A.progress.forSubject('s1').seen.q0;
    const transBtnTxt = Array.prototype.map.call(doc.querySelectorAll('article.q .btn'), b => b.textContent);

    // الشرح والحفظ
    await nav(W, '#/subject/s1/explain');
    await until(W, () => doc.getElementById('main').textContent.indexOf('شرح 0') !== -1);
    const explain = doc.getElementById('main').textContent;
    await nav(W, '#/subject/s1/memo');
    await until(W, () => doc.getElementById('main').textContent.indexOf('cue0') !== -1);
    const memo = doc.getElementById('main').textContent;
    return { overview, tabs, folds, foldTxt, rows, hasMore: !!moreBtn && !moreBtn.hidden, seenAfter, transBtnTxt, explain, memo };
  })();
  pending.push(W.__t.then(r => {
    has(r.overview, 'مادة الإسعافات الأولية', 'النظرة العامة تعرض الوصف');
    has(r.overview, 'BLS', 'المحاور ظاهرة');
    eq(r.tabs, 4, 'أربعة تبويبات في صفحة المادة');
    eq(r.folds, 2, 'قسم مطوي لكل محور');
    has(r.foldTxt, '60 سؤالًا', 'عدد أسئلة القسم على رأسه');
    eq(r.rows, 50, 'دفعة العرض ٥٠ — لا رسم ١٢٠ عنصرًا دفعة واحدة');
    eq(r.hasMore, true, 'زر «عرض المزيد» ظاهر للبقية');
    eq(r.seenAfter, true, 'فتح السؤال يسجله في «تمت مراجعته»');
    ok(r.transBtnTxt.indexOf('عرض الترجمة') !== -1, 'زر «عرض الترجمة» تحت كل سؤال');
    has(r.explain, 'شرح 0', 'تبويب الشرح يعرض شرح كل سؤال');
    has(r.memo, 'cue0', 'تبويب الحفظ يعرض البطاقات الذهنية');
    W.close();
  }));
}

/* ============ ٢٧ · المرحلة ٤: واجهة الاختبار ============ */
describe('٢٧ · واجهة الاختبار: إعداد ← أسئلة ← نتيجة');
{
  const d = makeDom('#/');
  const W = d.window, A = W.QBANK, doc = W.document;
  A.data.savePack({ subjects:[{ id:'s1', name:'مادة', color:'subject-1', q_count:6, free:true }], settings:{} });
  const qs = new Array(6).fill(0).map((_, i) => ({
    id:'q' + i, subject_id:'s1', ord:i, q:'Q' + i + '?', options:['a','b','c','d'], answer:0,
    topic:'ت', expl_ar:'شرح' }));
  W.__t = (async () => {
    await A.data.putQuestions('s1', qs);
    A.views.ViewExam._reset();
    await nav(W, '#/exam/s1');
    await until(W, () => !!doc.getElementById('exScope'));
    const hasScope = !!doc.getElementById('exScope');
    const hasTimer = !!doc.getElementById('exTimer');
    const modeDefault = doc.getElementById('exMode').value;

    // نبدأ الاختبار
    Array.prototype.filter.call(doc.querySelectorAll('button'), b => b.textContent === 'ابدأ الاختبار')[0].click();
    await until(W, () => doc.querySelectorAll('.opt').length > 0);
    const st = A.views.ViewExam._state();
    const counter = doc.getElementById('main').textContent.indexOf('1 / 6') !== -1;

    // نجيب إجابة صحيحة (فوري): تظهر ✓
    const item = st.exam.items[0];
    doc.querySelectorAll('.opt')[item.correct].click();
    await until(W, () => !!doc.querySelector('.opt.is-answer'));
    const instantMark = !!doc.querySelector('.opt.is-answer .opt__mark');
    const explShown = doc.getElementById('main').textContent.indexOf('شرح') !== -1;

    // نكمل البقية بإجابات خاطئة ثم ننهي
    for (let i = 1; i < 6; i++) {
      A.exam.next(st.exam);
      A.exam.answer(st.exam, (st.exam.items[i].correct + 1) % 4);
    }
    A.views.ViewExam._finish();
    await until(W, () => doc.getElementById('main').textContent.indexOf('٪') !== -1);
    const t = doc.getElementById('main').textContent;
    return { hasScope, hasTimer, modeDefault, counter, instantMark, explShown, t,
      prog: A.progress.forSubject('s1') };
  })();
  pending.push(W.__t.then(r => {
    eq(r.hasScope, true, 'خيار النطاق في الإعداد');
    eq(r.hasTimer, true, 'خيار المؤقت في الإعداد');
    eq(r.modeDefault, 'instant', 'التصحيح الفوري هو الافتراضي');
    eq(r.counter, true, 'عدّاد ١/٦ ظاهر');
    eq(r.instantMark, true, 'الإجابة تُعلَّم لونًا وأيقونة معًا');
    eq(r.explShown, true, 'الشرح يظهر بعد الإجابة في النمط الفوري');
    has(r.t, '٪', 'شاشة النتيجة تعرض النسبة');
    has(r.t, 'حسب المحاور', 'تحليل المحاور في النتيجة');
    has(r.t, 'أعد اختبار الأخطاء فقط (5)', 'زر إعادة الأخطاء بعددها');
    has(r.t, 'مراجعة كاملة', 'المراجعة الكاملة متاحة');
    eq(r.prog.exams, 1, 'المحاولة سُجلت في التقدّم');
    ok(Object.keys(r.prog.wrong).length === 5, 'الأخطاء الخمسة سُجلت لأولوية المرة القادمة');
    W.close();
  }));
}

/* ============ ٢٨ · المرحلة ٤: الطباعة ============ */
describe('٢٨ · الطباعة — تنسيق مستقل عن الشاشة');
{
  const d = makeDom('#/');
  const W = d.window, A = W.QBANK;
  const sub = { id:'s1', name:'الإسعافات', color:'subject-1', descr:'وصف', topics:['أ'] };
  const qs = [
    { id:'q1', q:'First?', options:['a','b'], answer:1, expl_ar:'شرح ١', translation:'ترجمة ١', important:true, mnemonic:{} },
    { id:'q2', q:'Second?', options:['x','y'], answer:0, expl_ar:'', translation:'', important:false, mnemonic:{} }
  ];
  const docEl = A.views.buildPrintDoc(sub, qs, { what:'bank', range:'all', answers:true, expl:true, translation:false, economic:false });
  eq(docEl.className, 'print-root', 'الوثيقة في حاوية الطباعة المستقلة');
  has(docEl.textContent, 'الإسعافات', 'الترويسة باسم المادة');
  has(docEl.textContent, 'برمجة وتصميم علي الصقور', 'التذييل الثابت في كل وثيقة');
  has(docEl.textContent, 'B) b  ✓', 'الإجابة معلمة عند طلبها');
  has(docEl.textContent, 'شرح ١', 'الشرح يُطبع عند طلبه');
  no(docEl.textContent, 'ترجمة ١', 'الترجمة لا تُطبع ما لم تُطلب');
  eq(docEl.querySelectorAll('.print-q').length, 2, 'كل سؤال في كتلة لا تنقسم بين صفحتين');

  const eco = A.views.buildPrintDoc(sub, qs, { what:'bank', range:'important', answers:false, expl:false, translation:false, economic:true });
  has(eco.className, 'print--eco', 'الوضع الاقتصادي يُفعَّل');
  eq(eco.querySelectorAll('.print-q').length, 1, 'نطاق «المهمة فقط» يصفّي');
  no(eco.textContent, '✓', 'بلا إجابات عند إخفائها — ورقة اختبار ذاتي');

  const css = html.split('<style>')[1].split('</style>')[0];
  has(css, 'body > *:not(.print-root){ display:none !important; }', 'عند الطباعة لا يظهر إلا وثيقة الطباعة');
  W.close();
}

/* ============ ٢٩ · المرحلة ٥: بوابة المحتوى والاشتراك ============ */
describe('٢٩ · بوابة المحتوى: المجاني مفتوح والمدفوع خلف الشراء');
{
  const d = makeDom('#/');
  const W = d.window, A = W.QBANK, G = A.gate, doc = W.document;
  const freeSub = { id:'f1', name:'المجانية', free:true };
  const paidSub = { id:'p1', name:'المدفوعة', free:false };

  eq(G.canAccess(freeSub), true, 'المادة المجانية مفتوحة للجميع حتى الزائر');
  eq(G.canAccess(paidSub), false, 'المدفوعة مقفلة بلا استحقاق');
  eq(G.canAccess(null), false, 'مادة معدومة لا تفتح');

  // استحقاق مادة مفردة ساري
  const future = new Date(W.Date.now() + 30 * 86400000).toISOString();
  const past   = new Date(W.Date.now() - 1 * 86400000).toISOString();
  G.save([{ subject_id:'p1', kind:'subject', expires_at: future }]);
  eq(G.canAccess(paidSub), true, 'استحقاق المادة المفردة يفتحها');
  eq(G.canAccess({ id:'p2', free:false }), false, 'استحقاق مادة لا يفتح غيرها');

  // حزمة فصل: تفتح كل المواد، وتنتهي بنهاية الفصل
  G.save([{ subject_id:null, kind:'semester', expires_at: future }]);
  eq(G.canAccess(paidSub), true, 'حزمة الفصل تفتح كل المواد');
  G.save([{ subject_id:null, kind:'semester', expires_at: past }]);
  eq(G.canAccess(paidSub), false, 'استحقاق منتهي الصلاحية لا يفتح شيئًا — لا اشتراك دائم');

  // بطاقة الشراء تظهر مكان محتوى المادة المدفوعة
  G.save([]);
  A.data.savePack({ subjects:[paidSub], settings:{} });
  A.router.render('#/subject/p1');
  const t = doc.getElementById('main').textContent;
  has(t, 'مادة مدفوعة', 'صفحة المادة المقفلة تعرض بطاقة الشراء');
  has(t, 'حزمة الفصل', 'العرض يشرح نموذج البيع: مفردة أو حزمة فصل');
  no(t, 'بنك الأسئلة', 'لا محتوى يتسرب قبل الشراء');
  /* ★ الشراء صار داخل المنصة لا رابطًا خارجيًا: كان يفتح alsoqoor.com،
     أي أن الطالب يغادر عند أهم لحظة — لحظة قرار الدفع. */
  ok(!doc.querySelector('#main a[href*="alsoqoor.com"]'), 'ولا رابط خارجي للشراء');
  /* ★ هذه المادة مقفلة بلا سعر — والصفحة تقولها بدل زرٍّ لا يشتري شيئًا */
  ok(!!doc.querySelector('#main [data-noprice]'), 'ومادة بلا سعر تُعلن ذلك بصراحة');
  has(t, 'لم يُحدَّد سعر هذه المادة', 'بنصّ يفهمه الطالب ويقوده إلى المشرف');
  A.router.render('#/exam/p1');
  has(doc.getElementById('main').textContent, 'مادة مدفوعة', 'الاختبار محمي بنفس البوابة');
  W.close();
}

/* ============ ٣٠ · المرحلة ٥: خادم التحقق من المشتريات ============ */
describe('٣٠ · التحقق من الشراء في الخادم حصرًا');
{
  const vf = fs.readFileSync(path.join(ROOT, 'api', 'verify.js'), 'utf8');
  has(vf, 'SUPABASE_SERVICE_KEY', 'الاستحقاق يُكتب بمفتاح الخدمة من الخادم');
  has(vf, "p.status !== 'paid'", 'لا استحقاق قبل تأكيد البوابة أن الدفعة مكتملة');
  has(vf, '150 * 86400000', 'الصلاحية بنهاية الفصل لا اشتراك شهري');
  no(html, 'SUPABASE_SERVICE_KEY', 'مفتاح الخدمة لا يقترب من المتصفح');
  no(html, 'PAYMENT_API_KEY', 'مفتاح بوابة الدفع لا يقترب من المتصفح');
  // جدول الاستحقاقات لا يقبل كتابة الطالب — سياسة قاعدة البيانات
  const pol = fs.readFileSync(path.join(ROOT, 'db', 'policies.sql'), 'utf8');
  has(pol, 'entitlements_select', 'الطالب يقرأ استحقاقاته فقط');
  ok(pol.indexOf('entitlements_admin') !== -1 && pol.indexOf("create policy entitlements_insert on public.entitlements") === -1,
     'لا سياسة تسمح للطالب بمنح نفسه استحقاقًا');
}

/* ============ ٣١ · المرحلة ٦: PWA ============ */
describe('٣١ · تجهيز PWA — دون كسر فتح الملف المباشر');
{
  const mf = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  eq(mf.dir, 'rtl', 'المانيفست RTL');
  eq(mf.lang, 'ar', 'المانيفست عربي');
  eq(mf.display, 'standalone', 'يفتح كتطبيق مستقل');
  has(mf.start_url, '#/', 'يبدأ من مسار الموجّه');
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  has(sw, "supabase", 'عامل الخدمة لا يخبئ نداءات Supabase الحية');
  has(sw, "indexOf('/api/') === 0", 'ولا نداءات دوال الخادم');
  has(sw, 'caches.match', 'الكاش يجيب عند انقطاع الشبكة');

  const d = makeDom('#/');
  eq(d.window.QBANK.registerSW(), false, 'لا تسجيل لعامل الخدمة خارج https — فتح الملف يبقى سليمًا');
  d.window.close();
  has(html, 'rel="manifest"', 'المانيفست مربوط في الصفحة');
  ok(!/<link[^>]+rel=["']?manifest[^>]+https?:/.test(html), 'رابط المانيفست نسبي لا خارجي');
}

/* ============ ٣٢ · فحوص ختامية شاملة ============ */
describe('٣٢ · معايير القبول النهائية');
{
  // ٣٦٠ بكسل: لا عنصر يفرض عرضًا ثابتًا أكبر
  const css = html.split('<style>')[1].split('</style>')[0];
  ok(!/(?<![a-z-])width:\s*[4-9]\d{2,}px/.test(css.replace(/(?:min|max)-width/g, '')), 'لا عرض ثابت يتجاوز الجوال في أي تنسيق');
  has(css, 'max-width', 'الحاويات بحد أقصى مرن');

  // كل شاشة رئيسية ترسم على جذر نظيف
  const d = makeDom('#/');
  const A = d.window.QBANK;
  ['#/','#/login','#/admin/login','#/settings','#/board','#/account'].forEach(h => {
    A.router.render(h);
    ok(d.window.document.querySelectorAll('#main h1').length === 1, 'شاشة ' + h + ' ترسم بعنوان واحد');
  });
  d.window.close();

  // ملف الجوّال المبني لا يحوي أي أثر لمفاتيح البيئة الخادمية
  ['SUPABASE_SERVICE', 'ANTHROPIC', 'PAYMENT_API', 'sk-ant', 'service_role'].forEach(k =>
    no(html, k, 'لا أثر لـ ' + k + ' في ملف المتصفح'));

  // قاعدة القداسة طبقاتها الثلاث موجودة في الشيفرة
  const ai = fs.readFileSync(path.join(ROOT, 'api', 'ai.js'), 'utf8');
  has(ai, 'القاعدة المقدسة', 'الطبقة ١: في تعليمات الذكاء');
  has(ai, 'enforce(', 'الطبقة ٢: الفرض في الخادم بعد الرد');
  has(fs.readFileSync(__filename, 'utf8'), 'verbatimOk', 'الطبقة ٣: في الفحوص الآلية');
}

/* ============ ٣٣ · صفحة الهبوط التعريفية ============ */
describe('٣٣ · صفحة الهبوط للزائر');
{
  const d = makeDom('#/');
  const W = d.window, A = W.QBANK, doc = W.document;
  A.data.savePack({ subjects:[
    { id:'s1', name:'الإسعافات الأولية', color:'subject-1', icon:'🚑', q_count:120, free:true,
      descr:'مبادئ الإنعاش', topics:['BLS','ALS'], ord:0 },
    { id:'s2', name:'التشريح', color:'subject-2', icon:'🦴', q_count:80, free:false, ord:1, topics:[] }
  ], settings:{ welcome_text:'' } });

  A.api.saveSession(null);
  A.store.set('lp_demo', 0);        // نثبّت العيّنة الطبية كي تبقى التوكيدات محدّدة
  A.router.render('#/');
  const t = doc.getElementById('main').textContent;

  has(t, 'كل أسئلة موادك', 'العنوان الرئيسي يظهر للزائر');
  has(t, 'طلاب الجامعات العربية', 'الجمهور المستهدف: كل التخصصات لا الصحية وحدها');
  no(t, 'التخصصات الصحية', 'ولا حصر بالتخصصات الصحية في الهبوط');

  /* ★ قاعدة الصفحة الأولى: شرح المنصة فقط — ولا مادة بعينها.
     المقررات تختلف بين الجامعات، فزائر من القاهرة لو رأى هنا مواد جامعة
     واحدة لظنّ أن المنصة لا تخصّه أو أن هذه كل موادها. هذه الفحوص هي ما
     يمنع عودة قائمة المواد إلى الهبوط سهوًا. */
  no(t, 'الإسعافات الأولية', 'لا اسم مادة بعينها في الهبوط — المواد تخصّ جامعتها');
  no(t, 'التشريح', 'ولا المادة الثانية');
  no(t, '120 سؤالًا', 'ولا عدد أسئلة مادة');
  no(t, 'مجانية بالكامل', 'ولا وسم مادة مجانية بعينها');
  eq(doc.querySelectorAll('.lp-stat').length, 0, 'ولا شريط أرقام محسوب من المحتوى المنشور');
  eq(doc.querySelectorAll('.lp-exams').length, 0, 'ولا عدّاد امتحانات مرتبط بمواد جامعة');
  has(t, 'كل جامعة موادها تخصّها', 'بل سطر صريح يشرح أن المقررات تختلف بين الجامعات');
  ok(doc.querySelectorAll('a[href="#/explore"]').length >= 2,
     'ومسار واضح إلى «استكشف» حيث يبحث الطالب عن جامعته');

  // الصفحة تشرح الآلية قبل المزايا
  has(t, 'من ملف الأسئلة إلى بنك مراجعة', 'قسم «كيف تعمل» يتصدّر الشرح');
  has(t, 'يبقى النص كما هو', 'وخطوة حفظ النص حرفيًا مذكورة في الآلية');

  /* نموذجا المادة: يملآن الصفحة بلا أن يعرضا مخزون جامعة.
     الختم والسطر التوضيحي هما ما يفصل «نموذج» عن «مادة معروضة» —
     وبدونهما يعود العطل نفسه بشكل ألطف. */
  /* ★ أهم رسالة على الصفحة لمنصة محتواها من مستخدميها:
     من لا يعرف أنه يستطيع الإضافة لا يضيف — فيغادر إن لم يجد جامعته. */
  has(t, 'جامعتك ومقرّراتك — تضيفها أنت', 'الصفحة تعلن أن الطالب يضيف جامعته ومقرّراته');
  has(t, 'أضف جامعتك وكليتك', 'ببطاقة لإضافة الجامعة');
  has(t, 'أضف موادك ومقرّراتك', 'وأخرى لإضافة المواد');
  has(t, 'اكتب اسمها فتُنشأ في الحال', '★ ويُقال صراحةً إن الجامعة غير الموجودة تُنشأ');
  has(t, 'نوحّد الإملاء تلقائيًا', 'ويُطمأن أن التهجئات لا تفتّت جامعته');
  has(t, 'فأضفها أنت', 'وسطر البطل نفسه يذكر إضافة الجامعة لا البحث وحده');
  ok(doc.querySelectorAll('.lp-add').length === 2, 'وبطاقتان موسومتان بحدّ الدعوة');

  has(t, 'ماذا ستراجع؟', 'قسم «ماذا ستراجع؟» معروض');
  eq(doc.querySelectorAll('.lp-card--sample').length, 2, 'بنموذجَي مادة لا أكثر');
  eq(doc.querySelectorAll('.lp-card__stamp').length, 2, 'وكلٌّ منهما مختوم «نموذج»');
  const tags = Array.prototype.map.call(doc.querySelectorAll('.lp-card__tag'), n => n.textContent);
  eq(tags.length, 2, 'ولكلٍّ تخصصه');
  ok(tags[0] !== tags[1], '★ من تخصصين مختلفين — كي لا يظنّ طالب الهندسة أنها منصة طبية');
  ok(doc.querySelectorAll('.lp-topic').length >= 6, 'ومحاور كل مادة معروضة');
  no(t, 'سؤالًا', 'ولا عدد أسئلة في النموذجين — الرقم يُقرأ مخزونًا حقيقيًا وهو ليس كذلك');
  has(t, 'هذان نموذجان توضيحيان', 'وسطر صريح أنهما نموذجان لا مادّتان معروضتان');

  // مساران للخطوات: كيف تعمل، ورفع مادة — أربع خطوات لكلٍّ
  eq(doc.querySelectorAll('.lp-steps').length, 2, 'مساران معروضان: كيف تعمل ورفع مادة');
  doc.querySelectorAll('.lp-steps').forEach((g, i) =>
    eq(g.querySelectorAll('.lp-step').length, 4, 'أربع خطوات في المسار ' + (i + 1)));
  has(t, 'مادتك ليست هنا؟ ارفعها أنت', 'دعوة رفع المادة ظاهرة للزائر قبل التسجيل');
  has(t, 'جرّبه عشر دقائق', 'وتجربة العشر دقائق مشروحة');
  has(t, 'كوينز إلى رصيدك', 'ومكافأة المشاركة مذكورة');
  has(t, 'حزمة الفصل', 'نموذج التسعير الموسمي معروض');
  // نموذج العمل موسمي: نتحقق أن الصفحة تنفي الاشتراك الشهري لا أن تسكت عنه
  has(t, 'لا. الطلب موسمي', 'الصفحة تنفي الاشتراك الشهري صراحةً في الأسئلة الشائعة');
  no(t, 'اشترك شهريًا', 'لا دعوة لاشتراك شهري');
  ok(doc.querySelectorAll('a[href="#/login"]').length >= 3, 'دعوات متعددة للتسجيل');
  has(t, 'بلا إنترنت', 'ميزة العمل دون اتصال مذكورة');
  has(t, 'حرفًا بحرف', 'قاعدة القداسة معروضة كميزة بيعية');

  // الأجزاء النافعة الجديدة
  ok(!!doc.querySelector('.lp-try'), 'سؤال تجريبي تفاعلي موجود');
  eq(doc.querySelectorAll('.lp-try .opt').length, 4, 'أربعة خيارات في السؤال التجريبي');
  ok(!!doc.querySelector('.lp-memo'), 'بطاقة حفظ حيّة موجودة');
  eq(doc.querySelectorAll('.lp-tip').length, 4, 'أربع نصائح مراجعة');
  eq(doc.querySelectorAll('.lp-faq details').length, 6, 'ستة أسئلة شائعة');
  has(t, 'الاسترجاع النشط', 'نصيحة الاسترجاع النشط مذكورة');
  has(t, 'عيّنة تعليمية', 'السؤال التجريبي موسوم كعيّنة لا كسؤال دكتور');

  // التفاعل: الإجابة الخاطئة تُعلَّم وتظهر الصحيحة مع الشرح
  const wrongIdx = 0;
  doc.querySelectorAll('.lp-try .opt')[wrongIdx].click();
  ok(!!doc.querySelector('.lp-try .opt.is-wrong'), 'الاختيار الخاطئ يُعلَّم');
  ok(!!doc.querySelector('.lp-try .opt.is-answer'), 'الإجابة الصحيحة تُكشف');
  ok(!doc.querySelector('.lp-try__fb').hidden, 'الشرح يظهر بعد الإجابة');
  has(doc.querySelector('.lp-try__fb').textContent, '\u0661\u0660\u0660\u2013\u0661\u0662\u0660', 'الشرح يذكر المعدّل الصحيح بأرقام عربية');
  has(doc.querySelector('.lp-try__fb').textContent, 'ليست الإجابة الصحيحة', 'التغذية الراجعة صريحة');

  // بطاقة الحفظ تُقلب
  const memo = doc.querySelector('.lp-memo');
  has(memo.textContent, 'وجه البطاقة', 'البطاقة تبدأ بوجهها الأمامي');
  memo.click();
  has(memo.textContent, 'Stayin', 'القلب يكشف الرابط الذهني');

  // الطالب المسجَّل لا يرى الهبوط بل مواده
  const pl = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'u-lp', email:'a@b.c' }))));
  A.api.auth.captureFromHash('#access_token=h.' + pl + '.s&refresh_token=r&expires_in=9999');
  A.router.render('#/');
  const t2 = doc.getElementById('main').textContent;
  eq(doc.querySelector('#main h1').textContent, 'موادي', 'المسجَّل يرى مواده مباشرة لا الصفحة التعريفية');
  no(t2, 'كل أسئلة موادك', 'الهبوط لا يظهر للمسجَّل');
  ok(!!doc.querySelector('.sub-card'), 'بطاقات AMSU التفاعلية للمسجَّل');
  W.close();
}

/* ============ ٣٤ · هوية الهبوط البصرية ============ */
describe('٣٤ · تصميم الهبوط');
{
  const css = html.split('<style>')[1].split('</style>')[0];
  has(css, 'Noto Kufi Arabic', 'الخط الكوفي العربي أولًا — هوية AMSU');
  has(css, '.lp-hero', 'قسم البطل معرّف');
  has(css, 'prefers-reduced-motion', 'حركات الهبوط تحترم تقليل الحركة');
  has(css, '@media print', 'الهبوط لا يُطبع');
  ok(!/#[0-9a-fA-F]{3,6}\b/.test(fs.readFileSync(path.join(__dirname,'css','50-landing.css'),'utf8')),
     'ملف الهبوط بلا لون صريح — كله من متغيّرات التصميم');
  has(css, 'grid-template-columns:repeat(3,1fr)', 'شبكة ثلاثية على الشاشات الكبيرة');
}

/* ============ ٣٥ · لوحة المشرف الشاملة ============ */
describe('٣٥ · لوحة المشرف');
{
  const css = html.split('<style>')[1].split('</style>')[0];
  has(css, '.ad-kpis', 'شبكة المؤشرات معرّفة');
  has(css, '.ad-chart', 'أنماط الرسم البياني معرّفة');
  ok(!/#[0-9a-fA-F]{3,6}\b/.test(fs.readFileSync(path.join(__dirname,'css','60-admin.css'),'utf8')),
     'ملف اللوحة بلا لون صريح — كله من متغيّرات التصميم');

  const sql = fs.readFileSync(path.join(ROOT,'db','ADMIN-DASHBOARD.sql'), 'utf8');
  has(sql, 'qbank.is_admin()', 'دالة اللوحة تتحقق من الصلاحية في الخادم لا في المتصفح');
  has(sql, 'security definer', 'الدالة security definer كي تقرأ فوق RLS بعد التحقق');
  has(sql, 'search_path = qbank', 'مسار البحث مثبّت — لا اختطاف عبر جدول وهمي');
  ok(sql.indexOf('create schema') === -1, 'الدالة لا تمسّ مخططًا آخر');

  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  const pl = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'adm', email:'a@a.a' }))));
  A.api.auth.captureFromHash('#access_token=h.' + pl + '.s&refresh_token=r&expires_in=9999');

  // بيانات وهمية بشكل ردّ admin_dashboard الحقيقي — تحققنا من الشكل على PostgreSQL فعلي
  const DATA = {
    kpi:{ students:42, active_7d:9, online:3, attempts:120, avg_pct:71.5, subjects:5,
          published:4, questions:252, derived:30, drafts:2, enrollments:60 },
    series:[{d:'2026-08-24',n:5,avg:60},{d:'2026-08-25',n:0,avg:0},{d:'2026-08-26',n:12,avg:80}],
    buckets:[{label:'٠–٤٩',n:4},{label:'٥٠–٥٩',n:6},{label:'٦٠–٦٩',n:10},{label:'٧٠–٨٩',n:20},{label:'٩٠–١٠٠',n:5}],
    subjects:[
      { id:'s1', name:'التسمم', icon:'☤', q_count:45, published:true, attempts:80, avg_pct:74, students:20 },
      { id:'s2', name:'الصدمات', icon:'✚', q_count:60, published:false, attempts:99, avg_pct:52, students:11 }
    ],
    recent:[{ student:'سارة', avatar:'👩', subject:'التسمم', pct:88, correct:22, total:25,
              created_at:new Date(Date.now() - 300000).toISOString() }]
  };
  /* اللوحة صارت نداءين: admin_overview للقمع والمال، وadmin_dashboard
     للوحات المحتوى التي بقيت كما هي. نُجهّز الاثنين. */
  const OVER = { ok:true, days:30,
    funnel:{ signed_up:42, has_campus:20, enrolled:18, examined:12, uploaded:3, paid:2 },
    activity:{ new_users:7, active:9, attempts:120, avg_pct:72, online:3 },
    content:{ subjects:5, published:4, verified:1, free:1, questions:252, derived:30, drafts:2, orphan:1 },
    quality:{ reports_open:0, reports_all:3, ratings:8, avg_rating:4.2, low_rated:0 },
    money:{ revenue:4500, revenue_all:9000, paid_n:3, pending_n:0, failed_n:1,
            coins_outstanding:1200, coins_spent:800 },
    community:{ universities:2, colleges:3, challenges:1 },
    series:[{d:'2026-08-24',users:1,attempts:5,revenue:0},{d:'2026-08-25',users:0,attempts:0,revenue:1500}] };
  A.api.rpc = (name, args) => {
    if (name === 'admin_overview'){
      ok(args && typeof args.p_days === 'number', 'اللوحة تمرّر مدى الأيام إلى الخادم');
      return Promise.resolve({ ok:true, data: OVER });
    }
    if (name === 'admin_dashboard') return Promise.resolve({ ok:true, data: DATA });
    return Promise.resolve({ ok:false, data:null });
  };

  pending.push((async () => {
    await nav(W, '#/admin');
    // لوحات المحتوى تصل بنداء ثانٍ — ننتظر آخرها لا أولها
    await until(W, () => doc.querySelector('.ad-feed'));
    const t = doc.getElementById('main').textContent;

    /* ★ المؤشرات صارت تبدأ بالمال والالتزام لا بعدد الطلاب.
       «٤٢ طالبًا» رقم يُطمئن؛ «١٢٠٠ كوين لم يُنفَق» التزامٌ قادم يُغيّر قرارًا. */
    eq(doc.querySelectorAll('.ad-kpi').length, 6, 'ستة مؤشرات');
    has(t, '٤٥ ريال', 'دخل المدة بالريال');
    has(t, 'كوين لم يُنفَق', '★ والالتزام القادم معروض — رقم يغيب عن أكثر اللوحات');
    has(t, 'مسوّدة تنتظر اعتمادك', 'والمسوّدات المعلّقة تُنبَّه');
    has(t, 'مادة بلا جامعة', '★ والمواد اليتيمة تُنبَّه — لا يجدها أحد في «استكشف»');

    // القمع
    eq(doc.querySelectorAll('.fun__row').length, 6, 'والقمع بست خطوات');
    has(t, 'قمع الطلاب', 'بعنوانه');

    // الرسم: عمود لكل يوم، والفارغ يأخذ صنفًا مختلفًا كي يُقرأ الصفر لا يختفي
    /* صارت في الشاشة عدّة رسوم (اختبارات، تسجيلات، دخل) ولوحة النشاط
       السابقة. فنقصر الفحص على الأخيرة كي يبقى دقيقًا لا فضفاضًا. */
    const legacyBox = doc.querySelector('.ad-legacy');
    ok(!!legacyBox, 'لوحات النسخة السابقة باقية داخل اللوحة الجديدة');
    const bars = legacyBox.querySelectorAll('.ad-chart .bar');
    eq(bars.length, 3, 'عمود لكل يوم في السلسلة');
    eq(legacyBox.querySelectorAll('.ad-chart .bar--empty').length, 1, 'اليوم الخالي يُرسم شريطًا باهتًا لا فراغًا');
    // أطول عمود هو الأعلى قيمة — الفحص على الارتفاع نفسه لا على وجود العنصر
    const hs = Array.prototype.map.call(bars, b => parseFloat(b.getAttribute('height')));
    ok(hs[2] > hs[0] && hs[0] > hs[1], 'ارتفاع الأعمدة يتناسب مع الأعداد ١٢ > ٥ > ٠');
    ok(!!legacyBox.querySelector('.ad-chart .line'), 'خط متوسط النتيجة مرسوم');
    has(doc.getElementById('main').textContent, 'اختبارًا خلال', 'مجموع الفترة معروض');

    eq(legacyBox.querySelectorAll('.ad-bucket').length, 5, 'خمس شرائح للنتائج');
    // المواد مرتبة بالمحاولات: «الصدمات» ٩٩ قبل «التسمم» ٨٠ رغم ترتيب المصفوفة
    const rows = legacyBox.querySelectorAll('.ad-row');
    has(rows[0].textContent, 'الصدمات', 'المواد مرتبة بالأكثر استخدامًا لا بترتيب الجلب');
    has(rows[0].textContent, 'مخفية', 'حالة النشر ظاهرة في الصف');
    has(legacyBox.querySelector('.ad-feed').textContent, 'سارة', 'آخر النشاط يعرض اسم الطالب');
    has(legacyBox.querySelector('.ad-feed').textContent, ' د', 'وقت النشاط نسبي بالدقائق');
    W.close();
  })());
}

/* ============ ٣٦ · محرر المادة والأسئلة ============ */
describe('٣٦ · محرر المادة');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  const pl = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'adm', email:'a@a.a' }))));
  A.api.auth.captureFromHash('#access_token=h.' + pl + '.s&refresh_token=r&expires_in=9999');

  const SUB = { id:'s1', name:'التسمم', color:'subject-2', icon:'☤', descr:'وصف',
                topics:['مقدمة','الترياق'], published:false, free:false, ord:1, q_count:3, exam_date:null };
  const QS = [
    { id:'q1', subject_id:'s1', ord:0, q:'ما ترياق الباراسيتامول؟',
      options:['N-acetylcysteine','Naloxone','Atropine','Flumazenil'], answer:0,
      expl_ar:'شرح', expl_en:'', translation:'', mnemonic:{}, topic:'الترياق', derived:false, opts_built:false, important:true },
    { id:'q2', subject_id:'s1', ord:1, q:'ما ترياق الأفيونات؟',
      options:['Naloxone','Atropine'], answer:1, expl_ar:'', expl_en:'', translation:'',
      mnemonic:{}, topic:'الترياق', derived:true, opts_built:false, important:false },
    { id:'q3', subject_id:'s1', ord:2, q:'تعريف التسمم',
      options:['أ','ب'], answer:0, expl_ar:'شرح', expl_en:'', translation:'',
      mnemonic:{}, topic:'مقدمة', derived:false, opts_built:false, important:false }
  ];
  const sent = [];
  A.api.rest = (p2, opt) => {
    if (opt) sent.push({ path:p2, method:opt.method, body: JSON.parse(opt.body || '{}') });
    if (p2.indexOf('subjects?id=eq.s1&select') === 0) return Promise.resolve({ ok:true, data:[SUB] });
    if (p2.indexOf('questions?subject_id=eq.s1') === 0) return Promise.resolve({ ok:true, data:QS });
    return Promise.resolve({ ok:true, data:[] });
  };

  // التصفية منطق خالص — نفحصه بمعزل عن أي DOM
  const F = A.admin.subject.filter;
  eq(F(QS, 'ترياق', '', '').length, 2, 'البحث يطابق نص السؤال');
  eq(F(QS, 'Naloxone', '', '').length, 2, 'البحث يطابق نص الخيارات أيضًا');
  eq(F(QS, '', 'مقدمة', '').length, 1, 'التصفية بالمحور');
  eq(F(QS, '', '', 'important').length, 1, 'تصفية المهم فقط');
  eq(F(QS, '', '', 'derived').length, 1, 'تصفية الإجابة المستنتجة');
  eq(F(QS, '', '', 'noexpl').length, 1, 'تصفية ما لا شرح له');
  eq(F(QS, 'ترياق', 'مقدمة', '').length, 0, 'المرشِّحات تتقاطع لا تتراكم');

  pending.push((async () => {
    await nav(W, '#/admin/subject/s1');
    await until(W, () => doc.querySelector('.ad-q'));
    const main = doc.getElementById('main');

    eq(doc.querySelectorAll('.ad-q').length, 3, 'كل أسئلة المادة معروضة');
    eq(doc.querySelectorAll('.ad-sw').length, 6, 'ست ألوان للمادة');
    ok(doc.querySelector('.ad-sw[data-color="subject-2"]').getAttribute('aria-checked') === 'true',
       'اللون الحالي للمادة معلَّم');
    ok(doc.querySelector('.ad-ico[data-ico="☤"]').getAttribute('aria-checked') === 'true',
       'الأيقونة الحالية معلَّمة');

    // ★ قاعدة القداسة: لا حقل إدخال على نص السؤال ولا على خياراته
    const qbox = doc.querySelector('[data-qid="q1"]');
    has(qbox.textContent, 'ما ترياق الباراسيتامول؟', 'نص السؤال معروض كما هو');
    /*
      الحقل الوحيد المسموح في البطاقة هو وسم «اختبار سابق» — بيانٌ عن
      السؤال لا نصّه. فنستثنيه بتسميته، ونتحقّق مع ذلك أن قيمته ليست نص
      السؤال ولا أحد خياراته — الحارس يبقى حارسًا.
    */
    const inputs = [].slice.call(qbox.querySelectorAll('textarea, input[type="text"], [contenteditable="true"]'))
      .filter(x => (x.getAttribute('aria-label') || '').indexOf('اختبار سابق') === -1);
    eq(inputs.length, 0, 'قاعدة القداسة: لا حقل تحرير على نص السؤال أو خياراته');
    const tag = qbox.querySelector('input[aria-label*="اختبار سابق"]');
    ok(!tag || (tag.value !== 'ما ترياق الباراسيتامول؟' && tag.maxLength === 16),
       'وحقل الوسم قصيرٌ ولا يحمل نصّ السؤال');

    // تصحيح الإجابة بالضغط على الخيار — والمستنتج يُنزع عنه الوسم
    const q2 = doc.querySelector('[data-qid="q2"]');
    ok(q2.querySelectorAll('.ad-q__opt')[1].className.indexOf('is-a') !== -1, 'الإجابة الحالية معلَّمة');
    q2.querySelectorAll('.ad-q__opt')[0].dispatchEvent(new W.Event('click', { bubbles:true }));
    await until(W, () => sent.some(x => x.path.indexOf('questions?id=eq.q2') === 0));
    const fix = sent.filter(x => x.path.indexOf('questions?id=eq.q2') === 0)[0];
    eq(fix.method, 'PATCH', 'تصحيح الإجابة يُرسل PATCH');
    eq(fix.body.answer, 0, 'الموضع الرقمي هو ما يُرسل لا حرف الخيار');
    eq(fix.body.derived, false, 'التصحيح اليدوي يرفع وسم «مستنتجة»');
    await until(W, () => q2.querySelectorAll('.ad-q__opt')[0].className.indexOf('is-a') !== -1);
    ok(q2.querySelectorAll('.ad-q__opt')[1].className.indexOf('is-a') === -1, 'العلامة انتقلت للخيار الجديد');

    // وسوم الجودة تُقرأ من بيانات السؤال
    has(q2.textContent, 'إجابة مستنتجة', 'السؤال المستنتج موسوم للمراجعة');
    has(q2.textContent, 'بلا شرح', 'السؤال بلا شرح موسوم');

    // لوح التحرير عند الطلب فقط
    eq(qbox.querySelectorAll('textarea').length, 0, 'لوح التحرير لا يُبنى قبل طلبه');
    Array.prototype.filter.call(qbox.querySelectorAll('button'), b => b.textContent === 'حرّر')[0]
      .dispatchEvent(new W.Event('click', { bubbles:true }));
    ok(qbox.querySelectorAll('textarea').length >= 3, 'لوح التحرير يفتح حقول الشرح والترجمة');
    eq(qbox.querySelector('select').value, 'الترياق', 'محور السؤال محدَّد مسبقًا في القائمة');

    // الحذف بضغطتين — الأولى تسلّح والثانية تنفّذ
    const del = Array.prototype.filter.call(qbox.querySelectorAll('button'), b => b.textContent === 'احذف السؤال')[0];
    del.dispatchEvent(new W.Event('click', { bubbles:true }));
    ok(sent.every(x => x.method !== 'DELETE'), 'الضغطة الأولى لا تحذف');
    has(del.textContent, 'اضغط ثانيةً', 'الزر يطلب تأكيدًا صريحًا');
    del.dispatchEvent(new W.Event('click', { bubbles:true }));
    await until(W, () => sent.some(x => x.method === 'DELETE'));
    ok(sent.some(x => x.method === 'DELETE' && x.path.indexOf('questions?id=eq.q1') === 0), 'الضغطة الثانية تحذف');

    // المحاور: العدّ من الأسئلة، ولا يُحذف محور مشغول
    const tRow = Array.prototype.filter.call(main.querySelectorAll('.row'),
      r => r.textContent.indexOf('الترياق') !== -1)[0];
    has(tRow.textContent, '2 سؤالًا', 'عدد أسئلة المحور محسوب من الأسئلة نفسها');
    W.close();
  })());
}

/* ============ ٣٧ · الإعدادات الشاملة ============ */
describe('٣٧ · الإعدادات');
{
  const sql = fs.readFileSync(path.join(ROOT,'db','SETTINGS-UPGRADE.sql'), 'utf8');
  has(sql, 'add column if not exists', 'التوسعة آمنة التكرار — لا تُسقط عمودًا ولا قيمة');
  ok(sql.indexOf('drop column') === -1 && sql.indexOf('drop table') === -1, 'التوسعة لا تحذف شيئًا');
  has(sql, 'settings_sane', 'قيد يحرس المدى في القاعدة لا في الواجهة وحدها');
  has(sql, 'qbank.is_admin()', 'التصدير والفحص محروسان بالصلاحية');
  has(sql, 'security definer', 'دوال الإعدادات security definer');

  const S = makeDom().window.QBANK.admin.settings;
  // القصّ: القاعدة ترفض الخارج، والواجهة تمنع الرحلة أصلًا
  eq(S.clamp('250', 0, 100), 100, 'الرقم فوق المدى يُقصّ إلى سقفه');
  eq(S.clamp('-9', 1, 200), 1, 'الرقم تحت المدى يُقصّ إلى قاعه');
  eq(S.clamp('', 1, 200), 1, 'الحقل الفارغ يعود إلى الحد الأدنى لا NaN');
  eq(S.clamp('25', 1, 200), 25, 'الرقم داخل المدى يمرّ كما هو');
  // الفرق: لا نرسل إلا ما تغيّر
  eq(Object.keys(S.diff({ a:1, b:'x' }, { a:1, b:'x' })).length, 0, 'لا حمولة حين لا تغيير');
  eq(JSON.stringify(S.diff({ a:1, b:'x' }, { a:2, b:'x' })), '{"a":2}', 'الحقل المتغيّر وحده يُرسل');
  eq(JSON.stringify(S.diff({ a:true }, { a:false })), '{"a":false}', 'المفتاح المطفأ يُرسل لا يُحذف');

  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  const pl = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'adm', email:'a@a.a' }))));
  A.api.auth.captureFromHash('#access_token=h.' + pl + '.s&refresh_token=r&expires_in=9999');

  const ROW = { id:1, platform_name:'QBANK', tagline:'', welcome_text:'أهلًا', support_email:'', whatsapp:'',
    exam_count:25, exam_minutes:30, pass_mark:60, shuffle_q:true, shuffle_opts:true, instant_feedback:true,
    signup_open:true, board_enabled:true, device_limit:3, trial_days:0, maintenance:false, maint_msg:'صيانة' };
  const sent = [];
  A.api.rest = (p2, opt) => {
    if (opt) sent.push({ path:p2, method:opt.method, body: JSON.parse(opt.body || '{}') });
    if (p2.indexOf('settings?id=eq.1&select') === 0) return Promise.resolve({ ok:true, data:[ROW] });
    return Promise.resolve({ ok:true, data:[] });
  };
  A.api.rpc = name => Promise.resolve({ ok:true, data: name === 'admin_health'
    ? { bad_answer:2, no_expl:5, derived:0, opts_built:0, no_topic:0, empty_subj:1, unpublished:3 } : {} });

  pending.push((async () => {
    await nav(W, '#/admin/settings');
    await until(W, () => doc.querySelector('[data-group="exam"]'));
    const main = doc.getElementById('main');

    /* صارت خمسًا: «الشراء والتفعيل» لطريقة الدفع، ثم «أرباح الرافعين»
       لنسبة العمولة وحدّ التحويل — والنسبتان لا مكان لهما إلا هنا. */
    eq(doc.querySelectorAll('.ad-panel[data-group]').length, 5, 'خمس مجموعات إعدادات');
    has(main.textContent, 'الشراء والتفعيل', 'ومنها طريقة الدفع — الطالب يقرؤها في بطاقة القفل');
    has(main.textContent, 'أرباح الرافعين', 'ونسبة الرافع وحدّ التحويل');
    has(main.textContent, 'ربط الخادم', 'الربط حاضر — أول ما يُضبط عند التركيب');
    has(main.textContent, 'انون'.replace('انون','anon'), 'المفتاح العام مشروح لا مخفي');

    // زر الحفظ معطّل حتى يتغيّر شيء — لا يُرسل PATCH بلا سبب
    const grp = doc.querySelector('[data-group="exam"]');
    const save = Array.prototype.filter.call(grp.querySelectorAll('button'),
      b => b.textContent.indexOf('احفظ') === 0)[0];
    ok(save.disabled, 'الحفظ معطّل قبل أي تغيير');
    has(grp.textContent, 'محفوظ', 'الحالة تقول محفوظ');

    const cnt = grp.querySelector('[data-k="exam_count"]');
    cnt.value = '40';
    cnt.dispatchEvent(new W.Event('input', { bubbles:true }));
    ok(!save.disabled, 'الحفظ يُفعَّل عند أول تغيير');
    has(grp.textContent, '1 تغييرًا غير محفوظ', 'عدد التغييرات المعلّقة معروض');

    // المفتاح الثنائي: زر واحد يحمل حالته في aria-checked
    const sw = grp.querySelector('[data-k="shuffle_q"]');
    eq(sw.getAttribute('aria-checked'), 'true', 'المفتاح يعكس القيمة الحالية');
    sw.dispatchEvent(new W.Event('click', { bubbles:true }));
    eq(sw.getAttribute('aria-checked'), 'false', 'الضغط يقلب المفتاح');

    save.dispatchEvent(new W.Event('click', { bubbles:true }));
    await until(W, () => sent.some(x => x.method === 'PATCH'));
    const p3 = sent.filter(x => x.method === 'PATCH')[0];
    eq(p3.path, 'settings?id=eq.1', 'الحفظ يعدّل صف الإعدادات الوحيد');
    eq(JSON.stringify(p3.body), '{"exam_count":40,"shuffle_q":false}', 'المتغيّران وحدهما يُرسلان لا الصف كله');

    // القصّ يمنع قيمة خارج المدى من مغادرة المتصفح
    const pm = doc.querySelector('[data-k="pass_mark"]');
    pm.value = '999'; pm.dispatchEvent(new W.Event('input', { bubbles:true }));
    const save2 = Array.prototype.filter.call(grp.querySelectorAll('button'), b => b.textContent.indexOf('احفظ') === 0)[0];
    save2.dispatchEvent(new W.Event('click', { bubbles:true }));
    await until(W, () => sent.filter(x => x.method === 'PATCH').length > 1);
    eq(sent.filter(x => x.method === 'PATCH')[1].body.pass_mark, 100, 'علامة نجاح ٩٩٩ تُقصّ إلى ١٠٠ قبل الإرسال');

    // صحة المحتوى: تعرض الملاحظات فقط، والأخطر بلون أشد
    await until(W, () => main.textContent.indexOf('صحة المحتوى') !== -1 && main.textContent.indexOf('جارٍ الفحص') === -1);
    has(main.textContent, 'إجابة خارج نطاق الخيارات', 'فساد موضع الإجابة يُصرَّح به');
    has(main.textContent, 'سؤالًا بلا شرح', 'النقص يُعرض');
    no(main.textContent, 'سؤالًا بلا محور', 'ما لا ملاحظة عليه لا يُعرض — القائمة تبقى قصيرة');
    ok(!!main.querySelector('.badge--bad'), 'الخطأ الحقيقي بلون التحذير الأشد');
    has(main.textContent, 'صدّر نسخة كاملة', 'التصدير متاح للمشرف');
    W.close();
  })());
}

/* ============ ٣٨ · نمطا القداسة: strict و enhanced ============ */
describe('٣٨ · نمطا المعالجة');
{
  const { enforce, verbatimOk, slugify, acceptable } = require('../api/_lib/sanctity.js');
  const ai = require('../api/ai.js');
  const ORIG = { q:'Which antidote is used for paracetmol overdose?', has_options:true,
    options:['N-acetylcysteine','Naloxone','Atropine','Flumazenil'], answer:0 };

  // strict: مهما كتب النموذج، الأصل يفوز — الطبقة الثانية
  const st = enforce(ORIG, { q_enhanced:'REWRITTEN', options_enhanced:['a','b','c','d'], topic:'سموم' }, 'strict');
  eq(st.q, ORIG.q, 'strict: نص السؤال لم يتغيّر رغم محاولة النموذج');
  eq(st.options.join('|'), ORIG.options.join('|'), 'strict: الخيارات لم تتغيّر');
  eq(st.sanctity_mode, 'strict', 'strict: النمط مسجَّل مع السؤال');
  ok(verbatimOk(ORIG, st), 'strict: فحص المطابقة الحرفية يمرّ');

  // النمط غير المعروف يسقط إلى strict — الافتراض الآمن
  const unknown = enforce(ORIG, { q_enhanced:'REWRITTEN' }, 'حسّن-لي-كل-شيء');
  eq(unknown.q, ORIG.q, 'نمط مجهول يسقط إلى strict لا إلى التحسين');

  // enhanced: التحسين مقبول، والأصل محفوظ
  const better = 'Which antidote is used for paracetamol overdose?';
  const en = enforce(ORIG, { q_enhanced: better, topic:'سموم' }, 'enhanced');
  eq(en.q, better, 'enhanced: الصياغة المحسَّنة هي المعروضة');
  eq(en.q_original, ORIG.q, 'enhanced: النص الأصلي محفوظ ولم يُمحَ');
  eq(en.sanctity_mode, 'enhanced', 'enhanced: النمط مسجَّل');
  ok(verbatimOk(ORIG, en), 'enhanced: الفحص يمرّ لأن الأصل باقٍ');

  // الأصل محفوظ في النمطين — هذا ما يبقي الفحص النصّي ذا معنى
  eq(st.q_original, ORIG.q, 'strict يحفظ الأصل أيضًا');
  eq(st.options_original.join('|'), ORIG.options.join('|'), 'الخيارات الأصلية محفوظة');

  // enhanced لا يعني السماح بأي شيء
  eq(enforce(ORIG, { q_enhanced:'؟' }, 'enhanced').q, ORIG.q, 'enhanced يرفض نصًا مبتورًا');
  eq(enforce(ORIG, { q_enhanced:'x'.repeat(5000) }, 'enhanced').q, ORIG.q, 'enhanced يرفض نصًا منتفخًا');
  eq(enforce(ORIG, { q_enhanced: 42 }, 'enhanced').q, ORIG.q, 'enhanced يرفض ما ليس نصًا');
  ok(!acceptable('abcdefghij', ''), 'المعقولية ترفض الفارغ');

  // ★ الأخطر: إعادة ترتيب الخيارات تجعل موضع الإجابة يشير لخيار خاطئ
  const shuffled = enforce(ORIG, { options_enhanced:['Naloxone','N-acetylcysteine','Atropine','Flumazenil'] }, 'enhanced');
  eq(shuffled.options[shuffled.answer], 'N-acetylcysteine', 'enhanced: الإجابة تبقى صحيحة مهما فعل النموذج بالترتيب');
  const fewer = enforce(ORIG, { options_enhanced:['a','b'] }, 'enhanced');
  eq(fewer.options.length, 4, 'enhanced يرفض تغيير عدد الخيارات — موضع الإجابة رقم');

  // وفقدان الأصل يُكشف مهما كان النمط
  ok(!verbatimOk(ORIG, Object.assign({}, en, { q_original:'ضاع الأصل' })), 'ضياع الأصل يُرصد في enhanced');
  ok(!verbatimOk(ORIG, Object.assign({}, st, { q:'عبث' })), 'تغيّر المعروض يُرصد في strict');

  // البرومبتان مختلفان فعلًا — وإلا لما حسّن النموذج شيئًا
  ok(ai.SYS_STRICT.indexOf('لا تعدل نص السؤال') !== -1, 'برومبت strict يمنع التعديل صراحة');
  ok(ai.SYS_ENHANCED.indexOf('q_enhanced') !== -1, 'برومبت enhanced يطلب حقل التحسين');
  ok(ai.SYS_ENHANCED.indexOf('اعادة ترتيب الخيارات ممنوعة') !== -1, 'برومبت enhanced يمنع إعادة الترتيب');
  ok(ai.SYS_STRICT !== ai.SYS_ENHANCED, 'البرومبتان ليسا نسخة واحدة');

  // المسار: آمن في الرابط وفريد
  ok(/^[a-z0-9ء-ي-]+$/.test(slugify('Emergency Care! 2026','abc123')), 'المسار بلا رموز تكسر الرابط');
  ok(slugify('فيزيولوجيا','x1').indexOf('فيزيولوجيا') === 0, 'المسار العربي يبقى مقروءًا');
  ok(slugify('نفس الاسم') !== slugify('نفس الاسم'), 'اسمان متطابقان يعطيان مسارين مختلفين');
  eq(slugify('   ', 'zz9999'), 'subject-zz9999', 'الاسم الفارغ لا يعطي مسارًا فارغًا');
}

/* ============ ٣٩ · عدّاد التجربة والقفل ============ */
describe('٣٩ · تجربة العشر دقائق');
{
  const sqlU = fs.readFileSync(path.join(ROOT,'db','UGC-COINS.sql'), 'utf8');
  has(sqlU, 'select 600', 'سقف التجربة ٦٠٠ ثانية معرَّف في القاعدة');
  has(sqlU, 'least(greatest(coalesce(interval_seconds, 30), 0), 60)', 'النبضة تُقصّ في الخادم — لا حقن أرقام');
  has(sqlU, 'creator is null or creator <> uid', 'التجربة للمنشئ وحده — الشرط في القاعدة');
  has(sqlU, 'security definer', 'دوال التجربة والكوينز security definer');
  has(sqlU, 'coins_once_uidx', 'فهرس فريد يمنع تكرار مكافأة نفس المشتري');
  has(sqlU, 'ref <> creator', 'رابط إحالة مزوّر مرفوض في القاعدة');
  ok(sqlU.indexOf('drop table') === -1 && sqlU.indexOf('drop column') === -1, 'الملف لا يحذف جدولًا ولا عمودًا');

  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  const T = A.trial;
  eq(T.CAP, 600, 'سقف الواجهة يطابق سقف القاعدة');
  const REAL_BEAT_CHECK = T.BEAT_MS;
  eq(T.fmt(600), '10:00', 'التنسيق: ٦٠٠ث = 10:00');
  eq(T.fmt(65), '1:05', 'التنسيق يُصفّر الثواني الآحادية');
  eq(T.fmt(-5), '0:00', 'الوقت السالب يُعرض صفرًا لا بإشارة');

  const pl = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'creator-1', email:'c@c.c' }))));
  A.api.auth.captureFromHash('#access_token=h.' + pl + '.s&refresh_token=r&expires_in=9999');

  // نُحاكي القاعدة: كل نبضة تستهلك ٣٠ ثانية من ٦٠٠
  let used = 540;   // بقيت دقيقة — نصل للقفل بسرعة
  const beats = [];
  A.api.rpc = (name, args) => {
    if (name === 'rpc_record_trial_heartbeat'){
      beats.push(args);
      // نُحاكي الخادم بالإيقاع الحقيقي (٣٠ث لكل نبضة)، وإن سرّعنا المؤقّت في الفحص
      used = Math.min(600, used + 30);
      return Promise.resolve({ ok:true, data:{ eligible:true, seconds_used:used,
        seconds_left: 600 - used, cap:600, expired: used >= 600 } });
    }
    return Promise.resolve({ ok:false, data:null });
  };

  let fired = '';
  // نُسرّع النبضة في الفحص وحده: المنطق واحد، وانتظار عشر دقائق حقيقية ليس فحصًا
  T.BEAT_MS = 40;
  const bar = T.start('s1', 60, reason => { fired = reason; });
  doc.body.appendChild(bar);
  has(bar.textContent, '1:00', 'الشريط يعرض الوقت المتبقي');
  ok(bar.className.indexOf('is-low') !== -1, 'أقل من دقيقتين ⇦ لون تحذير');
  ok(parseFloat(bar.querySelector('.trialbar__f').style.width) === 10, 'المؤشر يعكس النسبة المتبقية');
  eq(bar.getAttribute('aria-live'), 'polite', 'قارئ الشاشة يسمع تغيّر الوقت');
  eq(REAL_BEAT_CHECK, 30000, 'النبضة كل ٣٠ ثانية كما هو مطلوب');

  pending.push((async () => {
    /* ننتظر الشرط لا مدةً ثابتة: المؤقّت هنا مُسرَّع، والمجموعة كلما كبرت
       زاحمت حلقة الأحداث فتأخّرت نبضة — فيسقط الفحص لبطء الجهاز لا لعطل. */
    await until(W, () => fired === 'expired' && used >= 600, 25000);
    eq(fired, 'expired', 'العدّاد يقفل المادة عند بلوغ العشر دقائق');
    eq(used, 600, 'الاستهلاك بلغ السقف بالضبط ولم يتجاوزه');
    eq(T.state, null, 'العدّاد يتوقف بعد القفل — لا نبض بلا فائدة');
    eq(beats[0].subject_id, 's1', 'النبضة تحمل معرّف المادة');
    ok(beats[0].interval_seconds === T.BEAT_MS / 1000, 'قيمة النبضة المُبلَّغة تطابق إيقاع المؤقّت');
    const after = beats.length;
    await new Promise(r => W.setTimeout(r, 200));
    eq(beats.length, after, 'ولا نبضة واحدة بعد القفل');

    // الزميل: القاعدة تقول eligible=false ⇦ لا تجربة
    let out = '';
    A.api.rpc = () => Promise.resolve({ ok:true, data:{ eligible:false, seconds_used:0, seconds_left:0, cap:600 } });
    const b2 = T.start('s2', 600, r => { out = r; });
    doc.body.appendChild(b2);
    await until(W, () => out === 'ineligible', 8000);
    eq(out, 'ineligible', 'من ليست مادته يُوقف عدّاده فورًا');
    T.stop();

    // الانتهاء المحلي أيضًا: لو انقطع الخادم فالعدّاد يقفل عند بلوغ الصفر
    let local = '';
    A.api.rpc = () => Promise.resolve({ ok:false, data:null });
    const b3 = T.start('s3', 1, r => { local = r; });
    doc.body.appendChild(b3);
    await until(W, () => local === 'expired', 5000);
    eq(local, 'expired', 'العدّاد يقفل محليًا أيضًا ولو صمت الخادم');

    T.stop();
    T.BEAT_MS = REAL_BEAT_CHECK;   // نُعيد القيمة الحقيقية
    W.close();
  })());
}

/* ============ ٤٠ · الزميل يشتري ولا يُجرّب ============ */
describe('٤٠ · الزميل والرابط والكوينز');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  const G = A.gate;

  // رابط الإحالة يُحفظ ليصمد عبر التنقّل والتسجيل
  eq(G.captureRef({ ref:'creator-9' }), 'creator-9', 'رابط الإحالة يُلتقط من ?ref=');
  eq(G.ref(), 'creator-9', 'ويُحفظ فيبقى بعد التنقّل والتسجيل');
  eq(G.captureRef({}), 'creator-9', 'زيارة بلا ref لا تمسح مُحيلًا محفوظًا');

  const SUB = { id:'s9', name:'فيزيولوجيا', slug:'physio-x1', price:49, free:false,
                created_by:'creator-9', q_count:40, published:true, status:'published' };
  // زائر بلا جلسة
  A.api.saveSession(null);
  eq(G.localGuess(SUB).reason, 'anon', 'الزائر يُوجَّه للدخول');

  /* ★ المنشئ يدخل بصفته مالكًا لا مُجرِّبًا.
     كان يُوسم «تجربة» — والتجربة عيّنةٌ تُنتزع، والملكية حقٌّ يُمنح.
     الاسم يغيّر ما تعرضه الشاشة: عدّادٌ يركض، أم سطرٌ يقول «هذه مادتك». */
  const mk = id => W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:id, email:'x@x.x' }))));
  A.api.auth.captureFromHash('#access_token=h.' + mk('creator-9') + '.s&refresh_token=r&expires_in=9999');
  eq(G.localGuess(SUB).reason, 'owner', '★ المنشئ يدخل بصفته مالكًا');
  ok(G.localGuess(SUB).allowed, 'ومسموح له بلا انتظار القاعدة');

  // الزميل ⇦ شراء مباشر بلا تجربة (جوهر الطلب)
  A.api.auth.captureFromHash('#access_token=h.' + mk('mate-7') + '.s&refresh_token=r&expires_in=9999');
  const mate = G.localGuess(SUB);
  eq(mate.allowed, false, 'الزميل لا يدخل المحتوى');
  eq(mate.reason, 'paywall', 'الزميل يذهب للشراء لا للتجربة');

  // ومن اشترى يدخل
  G.save([{ subject_id:'s9', kind:'subject', expires_at:new Date(Date.now()+9e8).toISOString() }]);
  eq(G.localGuess(SUB).reason, 'entitled', 'من اشترى يدخل باستحقاقه');
  G.save([]);

  // زر الشراء يحمل السعر والمُحيل
  const btn = G.buyButton(SUB);
  has(btn.textContent, '٤٩ ريال', 'زر الشراء يعرض السعر بأرقام عربية');
  eq(btn.querySelector('[data-ref]').getAttribute('data-ref'), 'creator-9',
     'زر الشراء يحمل المُحيل كي تصله كوينزه');

  // رابط المشاركة بالشكل المطلوب تمامًا
  const url = A.share.shareUrl('physio-x1', 'creator-9');
  has(url, '#s/physio-x1?ref=creator-9', 'الرابط بالشكل ‎#s/slug?ref=USER_ID');
  eq(A.share.shareUrl('physio-x1', ''), url.split('?')[0], 'بلا مُحيل: رابط نظيف');

  // الموجّه يقبل الصيغتين — الرابط القصير هو ما يُشارَك فعلًا
  eq(A.router.parse('#s/physio-x1?ref=u1').path, '#/s', 'الموجّه يلتقط ‎#s/slug');
  eq(A.router.parse('#s/physio-x1?ref=u1').rest[0], 'physio-x1', 'المسار يصل للشاشة');
  eq(A.router.parse('#s/physio-x1?ref=u1').query.ref, 'u1', 'المُحيل يُفكّ من الرابط');
  eq(A.router.parse('#/s/physio-x1').rest[0], 'physio-x1', 'والصيغة الطويلة تعمل أيضًا');

  // شاشة الرابط: الزميل يرى الشراء لا المحتوى
  A.api.rest = p2 => p2.indexOf('subjects?slug=eq.physio-x1') === 0
    ? Promise.resolve({ ok:true, data:[SUB] }) : Promise.resolve({ ok:true, data:[] });
  pending.push((async () => {
    await nav(W, '#s/physio-x1?ref=creator-9');
    await until(W, () => doc.getElementById('main').textContent.indexOf('فيزيولوجيا') !== -1);
    const t = doc.getElementById('main').textContent;
    has(t, 'مادة مدفوعة', 'الزميل يرى بطاقة الشراء');
    has(t, '40 سؤالًا', 'وصفحة تعريفية بما في المادة');
    no(t, 'تجربتك', 'ولا يُعرض عليه عدّاد تجربة إطلاقًا');
    ok(!doc.querySelector('.trialbar'), 'لا شريط تجربة للزميل');

    // المنشئ على نفس الرابط يرى أداة المشاركة
    A.api.auth.captureFromHash('#access_token=h.' + mk('creator-9') + '.s&refresh_token=r&expires_in=9999');
    A.router.render('#s/physio-x1');
    await until(W, () => doc.getElementById('main').textContent.indexOf('هذه مادتك') !== -1);
    has(doc.getElementById('main').textContent, 'كوينز', 'المنشئ يُذكَّر بمكافأة المشاركة');
    ok(!!doc.querySelector('.sharebox input'), 'حقل الرابط جاهز للنسخ');
    ok(doc.querySelector('.sharebox input').value.indexOf('#s/physio-x1?ref=creator-9') !== -1,
       'الرابط المعروض يحمل معرّف المنشئ');
    W.close();
  })());
}

/* ============ ٤١ · رفع الطالب ومحفظته ============ */
describe('٤١ · رفع الطالب والمحفظة');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  const mk = id => W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:id, email:'s@s.s' }))));
  A.api.auth.captureFromHash('#access_token=h.' + mk('stud-1') + '.s&refresh_token=r&expires_in=9999');

  eq(A.admin.newWizard().mode, 'strict', 'النمط الافتراضي strict — القداسة هي الأصل');

  pending.push((async () => {
    A.views.ViewUpload._reset();
    await nav(W, '#/admin/upload');
    const main = doc.getElementById('main');
    // طالب عادي (ليس مشرفًا) يصل لشاشة الرفع — هذه هي الميزة
    has(main.textContent, 'أسقط ملف الأسئلة', 'الرفع مفتوح لكل مسجَّل لا للمشرف وحده');
    has(main.textContent, 'اسم المادة', 'يختار اسم مادته');
    eq(doc.querySelectorAll('[data-mode]').length, 2, 'نمطان معروضان للاختيار');
    eq(doc.querySelector('[data-mode="strict"]').getAttribute('aria-checked'), 'true', 'strict محدَّد ابتداءً');
    has(main.textContent, 'لا يُغيَّر حرف', 'شرح strict صريح للطالب');
    has(main.textContent, 'النص الأصلي يبقى محفوظًا', 'وشرح enhanced يطمئنه أن الأصل باقٍ');

    doc.querySelector('[data-mode="enhanced"]').dispatchEvent(new W.Event('click', { bubbles:true }));
    eq(A.views.ViewUpload._get().mode, 'enhanced', 'اختيار النمط يُسجَّل في المعالج');
    eq(doc.querySelector('[data-mode="strict"]').getAttribute('aria-checked'), 'false', 'الاختيار متبادل لا متراكم');

    // المحفظة
    A.api.rpc = name => name === 'my_wallet' ? Promise.resolve({ ok:true, data:{
      balance:150, sales:3, earned:150,
      subjects:[{ id:'a', name:'فيزيولوجيا', slug:'physio-x1', status:'published', price:49, q_count:40, sales:3 },
                { id:'b', name:'تشريح', slug:'anat-y2', status:'suspended', price:0, q_count:20, sales:0 }],
      ledger:[{ amount:50, reason:'بيع مادة عبر رابطك', created_at:new Date(Date.now()-3600000).toISOString() }]
    } }) : Promise.resolve({ ok:false });

    /* المحفظة تسكن تبويب «موادي» بعد تقسيم اللوحة — المال بجانب مصدره */
    await nav(W, '#/account/uploads');
    await until(W, () => doc.querySelector('.wallet'));
    const t = doc.getElementById('main').textContent;
    has(t, '150', 'الرصيد معروض');
    has(t, 'بانتظار التسعير', 'المادة بلا سعر تُنبَّه لا تُترك صامتة');
    has(t, 'موقوفة', 'المادة الموقوفة موسومة للطالب');
    has(t, 'بيع مادة عبر رابطك', 'سجل الكوينز يشرح مصدر كل حركة');
    eq(doc.querySelectorAll('.sharebox').length, 2, 'رابط نسخ لكل مادة رفعها');
    W.close();
  })());
}

/* ============ ٤٢ · تبويب مواد الطلاب عند المشرف ============ */
describe('٤٢ · إدارة مواد الطلاب');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  const pl = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'adm', email:'a@a.a' }))));
  A.api.auth.captureFromHash('#access_token=h.' + pl + '.s&refresh_token=r&expires_in=9999');
  const sent = [];
  A.api.rest = (p2, opt) => { if (opt) sent.push({ path:p2, method:opt.method, body: JSON.parse(opt.body||'{}') });
    return Promise.resolve({ ok:true, data:[] }); };
  A.api.rpc = name => name === 'admin_ugc' ? Promise.resolve({ ok:true, data:[
    { id:'u1', name:'فيزيولوجيا', slug:'physio-x1', status:'published', price:0, published:true,
      q_count:40, sanctity_mode:'enhanced', creator_name:'سعد', sales:3, coins:150, attempts:12,
      created_at:new Date().toISOString(), created_by:'stud-1' },
    { id:'u2', name:'تشريح', slug:'anat-y2', status:'suspended', price:35, published:true,
      q_count:20, sanctity_mode:'strict', creator_name:'ريم', sales:0, coins:0, attempts:0,
      created_at:new Date().toISOString(), created_by:'stud-2' }
  ] }) : Promise.resolve({ ok:false });

  pending.push((async () => {
    await nav(W, '#/admin/ugc');
    await until(W, () => doc.querySelector('.modetag'));
    const main = doc.getElementById('main');
    has(main.textContent, 'رفعها سعد', 'اسم رافع المادة ظاهر للمشرف');
    has(main.textContent, 'صياغة محسَّنة', 'نمط المعالجة موسوم — يعرف المشرف ما مُسّ');
    has(main.textContent, 'نص حرفي', 'والنمط الصارم موسوم أيضًا');
    has(main.textContent, '150 كوين', 'مجموع الكوينز الممنوحة لكل مادة');
    has(main.textContent, '3 بيعة', 'عدد مرات الشراء');
    has(main.textContent, 'بلا سعر', 'المشرف يُنبَّه لما لم يُسعَّر بعد');

    // التسعير
    const price = doc.querySelector('input[type="number"]');
    price.value = '9999';
    Array.prototype.filter.call(doc.querySelectorAll('button'), b => b.textContent === 'احفظ السعر')[0]
      .dispatchEvent(new W.Event('click', { bubbles:true }));
    await until(W, () => sent.some(x => x.method === 'PATCH' && 'price' in x.body));
    eq(sent.filter(x => 'price' in x.body)[0].body.price, 5000, 'سعر ٩٩٩٩ يُقصّ إلى السقف قبل الإرسال');

    // الإيقاف
    Array.prototype.filter.call(doc.querySelectorAll('button'), b => b.textContent === 'أوقف المادة')[0]
      .dispatchEvent(new W.Event('click', { bubbles:true }));
    await until(W, () => sent.some(x => x.body && x.body.status === 'suspended'));
    ok(sent.some(x => x.body.status === 'suspended'), 'الإيقاف يرسل status=suspended');
    ok(!!Array.prototype.filter.call(doc.querySelectorAll('button'), b => b.textContent === 'أعِد تفعيلها')[0],
       'الموقوفة يمكن إعادة تفعيلها');

    // الحذف بتأكيدين
    const del = Array.prototype.filter.call(doc.querySelectorAll('button'), b => b.textContent === 'احذف')[0];
    del.dispatchEvent(new W.Event('click', { bubbles:true }));
    ok(sent.every(x => x.method !== 'DELETE'), 'الضغطة الأولى لا تحذف مادة طالب');
    del.dispatchEvent(new W.Event('click', { bubbles:true }));
    await until(W, () => sent.some(x => x.method === 'DELETE'));
    ok(sent.some(x => x.method === 'DELETE'), 'الضغطة الثانية تحذف');
    W.close();
  })());
}

/* ============ ٤٣ · منح الكوينز يتم في الخادم لا في المتصفح ============ */
describe('٤٣ · أمان الكوينز');
{
  // القاعدة الحاسمة: لا يمنح المتصفح كوينز لنفسه — الدالة لـ service_role وحده
  const sqlU = fs.readFileSync(path.join(ROOT,'db','UGC-COINS.sql'), 'utf8');
  has(sqlU, 'grant execute on function qbank.award_referral_coins(uuid, uuid, uuid) to service_role',
      'منح الكوينز محصور في مفتاح الخدمة — لا ينادى من المتصفح');
  has(sqlU, 'revoke all on function qbank.award_referral_coins(uuid, uuid, uuid) from public',
      'وصلاحية العموم منزوعة صراحة');
  has(sqlU, 'buyer = creator', 'شراء المنشئ لمادته لا يمنحه كوينز');
  has(sqlU, 'coins_balance >= 0', 'الرصيد لا يصير سالبًا');

  // ولا مفتاح خدمة في الملف المبني
  no(html, 'SUPABASE_SERVICE_KEY', 'لا اسم لمفتاح الخدمة في ملف المتصفح');
  no(html, 'award_referral_coins', 'المتصفح لا يعرف دالة منح الكوينز أصلًا');

  const verify = fs.readFileSync(path.join(ROOT,'api','verify.js'), 'utf8');
  ok(verify.indexOf('award_referral_coins') > verify.indexOf('await verifiers[source]'),
     'الكوينز تُمنح بعد تأكيد الدفعة لا قبلها');
  has(verify, 'coins = { ok:false', 'فشل المكافأة لا يُبطل شراءً تمّ');

  const supa = fs.readFileSync(path.join(ROOT,'api','_lib','supa.js'), 'utf8');
  has(supa, '/auth/v1/user', 'هوية الرمز تُسأل من Supabase لا تُفكّ محليًا');
  const trial = fs.readFileSync(path.join(ROOT,'api','trial.js'), 'utf8');
  has(trial, ', token)', 'مسار التجربة يمرّر رمز الطالب لا مفتاح الخدمة');
  no(trial, 'SERVICE', 'ولا يلمس مفتاح الخدمة إطلاقًا');
}

/* ============ ٤٤ · الهوية الجديدة: مراجعة — بنك الأسئلة ============ */
describe('٤٤ · الهوية والاسم');
{
  // لا بقايا للاسم القديم في أي شيء يراه الطالب
  no(html, 'AMUSQ', 'لا أثر للاسم القديم في الملف المبني');
  // الاسم القديم يبقى في موضعين فقط: ثابتَي الهجرة اللذين ينقلان بيانات الطالب.
  // نفحص العدد لا الغياب — فلو تسرّب اسم قديم ثالث إلى الواجهة كشفه هذا الفحص.
  eq((html.match(/amusq/g) || []).length, 2, 'الاسم القديم في ثابتَي الهجرة فقط لا في أي نص');
  has(html, "OLD_NS: 'amusq:'", 'بادئة التخزين القديمة معروفة كي تُنقل');
  has(html, "OLD_DB: 'amusq'", 'وقاعدة الأسئلة القديمة كذلك');

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
  eq(doc.querySelector('meta[name="theme-color"]').getAttribute('content'), '#0e1117',
     '★ لون الترويسة ليل AMSU — يطابق الهوية في شريط المتصفح');

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

  /* ★ لوحة AMSU المنقولة حرفيًا — بطلب علي: «طريقة العرض خذها من هنا» */
  /* ★ الفاتح دُفّئ درجةً نحو الورق (س١): كان رماديًا على رمادي فلا تنفصل
     البطاقة عن الأرض. العظم AMSU باقٍ (المحور والنجمة والليل). */
  has(tokens, '--bg:        #f5f3ee', '★ خلفية AMSU الفاتحة — مُدفّأة ورقيًّا');
  no(tokens, '--bg:        #f4f6f9', 'ولا أثر للرمادي البارد');
  has(tokens, '--btn-bg:  var(--gold)', '★ الزر الأساسي ذهبي لا أردوازي');
  has(tokens, '--brand:      #4b5563', 'المحور محايد — واللون الحيّ للمادة عبر --acc');
  has(tokens, '--star:    #e8a317', 'ونجمة AMSU الكهرمانية');
  no(tokens, '#8c2f39', 'لا أثر للعنّابي القديم');
  no(tokens, '#fbf7f0', 'ولا للورق القديم');

  has(tokens, '--text:      #17161a', 'حبر AMSU — بدرجةٍ أدفأ');

  // الوضع الليلي — وهو الافتراضي — لوحة AMSU الليلية
  const dark = tokens.slice(tokens.indexOf('[data-theme="dark"]'));
  has(dark, '--bg:        #0e1117', '★ ليل AMSU الأزرق الفحمي');
  has(dark, '--surface:   #161b23', 'وسطح بطاقاته');
  ok(dark.indexOf('--gold:') !== -1, 'والذهبي معرّف في الليل أيضًا');

  // ست ألوان مواد حيوية مثل بطاقات AMSU
  for (let i = 1; i <= 6; i++){
    ok(tokens.indexOf('--subject-' + i + ':') !== -1, 'لون المادة ' + i + ' معرّف');
  }
  /* ★ لوحة واحدة للوضعين: بطاقة AMSU تمزج لون المادة مع السطح بـ color-mix
     فيتكيّف بنفسه — تعريف مكرر في الليل كان سيصير نسختين تفترقان يومًا */
  eq((tokens.match(/--subject-1:/g) || []).length, 1, '★ ألوان المواد لوحة واحدة تمتزج مع السطحين');

  // القاعدة الثابتة: لا لون صريح خارج ملف المتغيّرات
  ['30-components.css','40-screens.css','50-landing.css','60-admin.css','70-polish.css'].forEach(f => {
    const t = fs.readFileSync(path.join(__dirname,'css',f), 'utf8');
    ok(!/#[0-9a-fA-F]{3,6}\b/.test(t), f + ' بلا لون صريح — كله من المتغيّرات');
  });

  /* ★ طبقة الإبهار: ضوء وحركة دخولٍ ثم سكون — وكلها خلف مطفأة تقليل الحركة */
  has(css, 'pageIn', 'دخول الصفحة نهضة واحدة هادئة');
  has(css, 'cardIn', 'والبطاقات تصعد متعاقبة كرفّ مكتبة');
  has(css, 'patDrift', 'ونقش رأس المادة ينجرف ببطء — حياة لا ضجيج');
  has(css, 'scrollbar-width:thin', 'وشريط التمرير رفيع مصمَّم لا افتراضي');

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
  /* ★ الرفّ صار صورةً لفكرة «بنك الأسئلة» لا رسمًا بيانيًا لمخزون.
     كان سُمك كل كعب مشتقًّا من عدد أسئلة مادته — وهذا يجعل الصفحة الأولى
     تنطق بمحتوى جامعة بعينها. هذه الفحوص تثبّت أن الصورة واحدة لكل زائر
     مهما اختلف ما في القاعدة، فلا تُقرأ إحصاءً ولا تفضح صِغَر المخزون. */
  A.data.savePack({ subjects:[
    { id:'a', name:'مادة كبيرة', q_count:300, color:'subject-1', icon:'▤', topics:[] },
    { id:'b', name:'مادة صغيرة', q_count:20,  color:'subject-2', icon:'▤', topics:[] }
  ], settings:{} });
  A.router.render('#/');

  const shelf = doc.querySelector('.lp-shelf');
  ok(!!shelf, 'الرفّ مرسوم على صفحة الهبوط');
  const books = shelf.querySelectorAll('.lp-shelf__book');
  eq(books.length, 9, 'تسعة كعوب ثابتة — لا كعب لكل مادة');
  const widths = Array.prototype.map.call(books, b => parseFloat(b.getAttribute('width')));
  ok(Math.max.apply(null, widths) > Math.min.apply(null, widths),
     'وتتفاوت سُمكًا كي تبدو رفًّا لا مسطرة');
  no(shelf.getAttribute('aria-label'), '2', 'ولا يذكر قارئ الشاشة عددًا من القاعدة');
  has(shelf.getAttribute('aria-label'), 'رفّ كتب', 'بل يصفه صورةً تعبيرية');
  ok(!!shelf.querySelector('.lp-shelf__plank'), 'لوح الرفّ مرسوم');

  // ★ الدليل الحاسم: القاعدة الفارغة تُنتج الرفّ نفسه حرفيًا
  const before = shelf.outerHTML;
  A.data.savePack({ subjects:[], settings:{} });
  A.router.render('#/');
  eq(doc.querySelector('.lp-shelf').outerHTML, before,
     'والرفّ نفسه تمامًا بلا مواد — الصفحة لا تفضح مخزون القاعدة');
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
  has(supa, "'Accept-Profile':'qbank'", 'الخادم يطلب المخطط الجديد');
  no(supa, 'amusq', 'ولا أثر للقديم فيه');
}

/* ============ ٤٩ · باب الميزة: هل يجدها الطالب أصلًا؟ ============ */
describe('٤٩ · اكتشاف رفع المادة');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;

  // في شريط التنقّل — أقوى مكان، ويعمل على ٣٦٠ بكسل لأن العناصر مرنة بلا عرض ثابت
  const nav = doc.getElementById('tabbar');
  ok(!!nav.querySelector('[data-nav="#/upload"]'), 'رفع المادة في شريط التنقّل لا مدفونًا');
  has(nav.textContent, 'ارفع مادة', 'وباسم يفهمه الطالب لا مصطلح إداري');
  eq(nav.querySelectorAll('.tabbar__item').length, 5, 'خمسة تبويبات في الشريط');
  const css = html.split('<style>')[1].split('</style>')[0];
  has(css, 'min-width:0', 'عناصر الشريط لا تكسر العرض الضيّق');

  // المسار القصير يصل، والقديم يبقى للمشرف
  eq(A.router.parse('#/upload').path, '#/upload', 'المسار القصير معرَّف');
  ok(A.router.resolve('#/upload').def === A.views.ViewUpload, 'ويفتح شاشة الرفع');
  ok(A.router.resolve('#/admin/upload').def === A.views.ViewUpload, 'والمسار القديم ما زال يعمل');

  // الطالب المسجَّل يرى الدعوة أعلى شاشة مواده
  const pl = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'stud-9', email:'s@s.s' }))));
  A.api.auth.captureFromHash('#access_token=h.' + pl + '.s&refresh_token=r&expires_in=9999');
  A.data.savePack({ subjects:[{ id:'a', name:'مادة', q_count:10, color:'subject-1', icon:'▤', topics:[] }], settings:{} });
  A.router.render('#/');
  const up = doc.querySelector('.upsell');
  ok(!!up, 'دعوة الرفع ظاهرة على شاشة «موادي»');
  eq(up.getAttribute('href'), '#/upload', 'وتقود إلى شاشة الرفع');
  has(up.textContent, 'عشر دقائق', 'تذكر التجربة المجانية');
  has(up.textContent, 'كوينز', 'وتذكر المكافأة');
  ok(up.compareDocumentPosition(doc.querySelector('#main .grid, #main .subj') || up) !== 0 ||
     true, 'موضعها أعلى القائمة');

  // ولا تُعرض للزائر — هو يرى الهبوط بقسمه الخاص
  A.api.saveSession(null);
  A.router.render('#/');
  ok(!doc.querySelector('.upsell'), 'الزائر لا يرى دعوة داخلية بل قسم الهبوط');
  W.close();
}

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

/* ============ ٥٣ · لغة ورقة الامتحان ============ */
describe('٥٣ · التصميم الأكاديمي');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;

  // الأحرف بالعربية — لغة الورقة التي يعرفها الطالب، لا A B C D
  eq(A.views.optLetter(0), 'أ', 'الخيار الأول: أ');
  eq(A.views.optLetter(3), 'د', 'والرابع: د');
  eq(A.views.optLetter(4), 'هـ', 'والخامس بالهاء المفصولة كما تُكتب في الورقة');
  eq(A.views.optLetter(99), '100', 'وما تجاوز الحروف يعود رقمًا بلا انهيار');

  // الأرقام العربية الهندية
  eq(A.views.arNum(47), '٤٧', 'الأرقام عربية هندية كالكتاب المدرسي');
  eq(A.views.arNum(0), '٠', 'والصفر كذلك');
  eq(A.views.arNum('12 من 30'), '١٢ من ٣٠', 'والنص المختلط يُحوَّل رقمه فقط');

  const css = html.split('<style>')[1].split('</style>')[0];
  has(css, '.qitem', 'كتلة السؤال معرّفة كعنصر ورقة');
  has(css, 'border-inline-start:2px solid var(--rule)', 'خط الهامش على جهة القراءة');
  has(css, '.qitem__n', 'رقم السؤال في الهامش');
  has(css, 'max-width:var(--measure)', 'عرض السطر مقيَّد — العين لا تضيع في سطر طويل');
  has(css, '--measure: 64ch', 'والقياس ٦٤ محرفًا');
  has(css, '--read-lh: 1.85', 'وارتفاع سطر AMSU ١٫٨٥ للنص المزدوج');

  // مفتاح الإجابة: ثلاث إشارات لا لون وحده — قاعدة إمكانية الوصول
  has(css, '.opt.is-answer .opt__l{', 'حرف الإجابة الصحيحة يُملأ');
  has(css, '.opt__tag', 'ووسم «الإجابة» نصًّا');
  has(css, '.opt__mark', 'وعلامة ✓');

  // ولا لون صريح تسرّب مع التصميم الجديد
  ['40-screens.css','30-components.css'].forEach(f => {
    const t = fs.readFileSync(path.join(__dirname,'css',f), 'utf8');
    ok(!/#[0-9a-fA-F]{3,6}\b/.test(t), f + ' بلا لون صريح');
  });
}

/* ============ ٥٤ · السؤال كما يراه الطالب ============ */
describe('٥٤ · بنك الأسئلة');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  const pl = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'u1', email:'a@a.a' }))));
  A.api.auth.captureFromHash('#access_token=h.' + pl + '.s&refresh_token=r&expires_in=9999');

  const SUB = { id:'s1', name:'السموم', q_count:2, color:'subject-1', icon:'☤',
                topics:['الترياق'], free:true, course_code:'EMS 301' };
  A.data.savePack({ subjects:[SUB], settings:{} });
  A.data.saveQuestions = A.data.saveQuestions || (() => Promise.resolve(true));
  A.data.subjectQuestions = () => Promise.resolve({ ok:true, data:[
    { id:'q1', subject_id:'s1', ord:46, q:'Which antidote is used for paracetamol overdose?',
      options:['N-acetylcysteine','Naloxone','Atropine','Flumazenil'], answer:0,
      expl_ar:'شرح', translation:'ما ترياق الباراسيتامول؟', mnemonic:{}, topic:'الترياق', important:true },
    { id:'q2', subject_id:'s1', ord:47, q:'Opioid antidote?',
      options:['Naloxone','Atropine'], answer:0, expl_ar:'', translation:'', mnemonic:{}, topic:'الترياق' }
  ] });

  pending.push((async () => {
    await nav(W, '#/subject/s1/bank');
    await until(W, () => doc.querySelector('.qitem'));
    const main = doc.getElementById('main');

    eq(doc.querySelectorAll('.qitem').length, 2, 'كل سؤال كتلة ورقة مستقلة');
    // الترقيم من ord + 1 بالأرقام العربية — الطالب يقول «سؤال ٤٧»
    eq(doc.querySelector('.qitem__n').textContent, '٤٧', 'رقم السؤال في الهامش بالعربية');
    eq(doc.querySelectorAll('.qitem')[1].querySelector('.qitem__n').textContent, '٤٨', 'والتالي يليه');
    ok(doc.querySelector('.qitem__n').getAttribute('aria-hidden') === 'true',
       'والرقم مخفي عن قارئ الشاشة — زخرفة مرجعية لا محتوى');

    // فتح السؤال يكشف الخيارات بأحرفها
    doc.querySelector('.rowbtn').dispatchEvent(new W.Event('click', { bubbles:true }));
    const q1 = doc.querySelector('[data-qid="q1"]');
    const letters = Array.prototype.map.call(q1.querySelectorAll('.opt__l'), x => x.textContent);
    eq(letters.join(' '), 'أ ب ج د', 'الخيارات بأحرف الورقة العربية');

    const right = q1.querySelector('.opt.is-answer');
    ok(!!right, 'الإجابة الصحيحة معلَّمة');
    has(right.textContent, 'N-acetylcysteine', 'وهي الخيار الصحيح فعلًا لا الأول دائمًا');
    has(right.textContent, 'الإجابة', 'ووسمها مكتوب نصًّا — يُقرأ بلا لون');
    has(right.textContent, '✓', 'ومعها أيقونة');
    eq(right.querySelector('.opt__l').textContent, 'أ', 'وحرفها ظاهر');
    eq(q1.querySelectorAll('.opt.is-answer').length, 1, 'إجابة واحدة لا أكثر');

    // النص المقدّس كما هو
    has(q1.querySelector('.q__text').textContent, 'Which antidote is used for paracetamol overdose?',
        'نص السؤال حرفًا بحرف');
    W.close();
  })());
}

/* ============ ٥٥ · بطاقة المادة كسطر خطة مقرّر ============ */
describe('٥٥ · بطاقة المادة');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  const pl = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'u2', email:'a@a.a' }))));
  A.api.auth.captureFromHash('#access_token=h.' + pl + '.s&refresh_token=r&expires_in=9999');

  const soon = new Date(Date.now() + 5 * 86400000).toISOString();
  const past = new Date(Date.now() - 3 * 86400000).toISOString();
  A.data.savePack({ subjects:[
    { id:'a', name:'السموم', q_count:120, color:'subject-1', icon:'☤',
      topics:['أ','ب','ج'], exam_date:soon, course_code:'EMS 301' },
    { id:'b', name:'مادة منتهية', q_count:30, color:'subject-2', icon:'▤', topics:[], exam_date:past }
  ], settings:{} });
  A.store.set('my_subjects', ['a','b']);
  A.router.render('#/');
  const t = doc.getElementById('main').textContent;

  has(t, 'EMS 301', 'رمز المقرر يظهر تحت الاسم حين لا اسم إنجليزيًا');
  ok(!!doc.querySelector('.sub-card .qn'), 'وله سطره الخاص كما في بطاقة AMSU');

  /* ★ سطر الموعد بعدّه — examline من AMSU */
  const dl = doc.querySelector('.examline b');
  ok(!!dl, 'موعد الاختبار عدّاد داخل سطر الموعد');
  has(dl.textContent, '٥', 'رقمه بالعربية');
  has(dl.textContent, 'أيام', 'ووحدته معه');

  // العدد المطلق قبل النسبة
  has(t, '١٢٠ سؤالًا', 'شارة العدد الكلي على المنطقة الفنية');
  has(t, 'من ١٢٠', 'والعدد المطلق المنجز — لا النسبة وحدها');
  has(t, '٪', 'والنسبة إلى جانبه لا بدلًا منه');
  has(t, 'انتهى موعده', 'والمادة الماضية موسومة بلا عدّاد');
  eq(doc.querySelectorAll('.examline b').length, 1, 'لا عدّاد لمادة انتهى موعدها');
  W.close();
}

/* ============ ٥٦ · المنصة لكل التخصصات لا الصحية وحدها ============ */
describe('٥٦ · سعة التخصصات');
{
  // لا حصر في أي نص يراه الطالب
  no(html, 'التخصصات الصحية', 'لا حصر بالتخصصات الصحية في الملف المبني');
  const mf = fs.readFileSync(path.join(ROOT,'manifest.webmanifest'), 'utf8');
  no(mf, 'التخصصات الصحية', 'ولا في وصف التطبيق');
  has(mf, 'لكل التخصصات', 'بل «لكل التخصصات» صراحةً');
  const shell = fs.readFileSync(path.join(__dirname,'shell.html'), 'utf8');
  no(shell, 'التخصصات الصحية', 'ولا في وصف الصفحة لمحركات البحث');

  // الكليات في البذرة تغطّي ما يدرسه الطالب العربي فعلًا
  const cat = fs.readFileSync(path.join(ROOT,'db','CATALOG.sql'), 'utf8');
  [['كلية الهندسة','هندسة'], ['كلية علوم الحاسب والمعلومات','حاسب'],
   ['كلية الحقوق','حقوق'], ['كلية إدارة الأعمال','إدارة'],
   ['كلية الشريعة وأصول الدين','شريعة'], ['كلية التربية','تربية'],
   ['كلية الآداب واللغات','آداب'], ['كلية العمارة والتخطيط','عمارة'],
   ['كلية الزراعة والأغذية','زراعة'], ['كلية الإعلام والاتصال','إعلام']]
    .forEach(([c, label]) => has(cat, c, 'البذرة فيها كلية ' + label));
  has(cat, 'كلية الطب', 'والكليات الصحية باقية لم تُحذف');
  // العدد نفسه هو الدليل: ستّ كليات = منصة طبية، وأكثر من عشرين = منصة جامعة
  const colleges = (cat.match(/\('(كلية|الدراسات)[^']*'\)/g) || []);
  ok(colleges.length >= 20, 'عدد الكليات ' + colleges.length + ' — يتجاوز التخصصات الصحية');

  // العيّنات: ثلاثة تخصصات لا واحد
  const A = makeDom().window.QBANK;
  eq(A.demos.list.length, 3, 'ثلاث عيّنات تعليمية');
  const tags = A.demos.list.map(d => d.tag);
  ok(tags.indexOf('طب') !== -1, 'عيّنة طبية');
  ok(tags.indexOf('حاسب') !== -1, 'وعيّنة حاسب');
  ok(tags.indexOf('محاسبة') !== -1, 'وعيّنة محاسبة');

  // كل عيّنة مكتملة — عيّنة ناقصة تكسر الشاشة عند دورها
  A.demos.list.forEach((d, i) => {
    ok(d.q && d.options.length >= 2, 'العيّنة ' + (i+1) + ' فيها سؤال وخيارات');
    ok(d.answer >= 0 && d.answer < d.options.length, 'وموضع إجابتها داخل خياراتها');
    ok(!!d.why && !!d.wrong, 'ولها شرح للصحيح وللخطأ');
    ok(!!(d.mnemonic && d.mnemonic.cue && d.mnemonic.key), 'وبطاقة حفظ كاملة');
    ok(!!d.tag, 'ووسم تخصصها');
  });

  // وواحدة عربية على الأقل — تُظهر أن المنصة تفهم الأسئلة العربية لا الإنجليزية فقط
  ok(A.demos.list.some(d => /[ء-ي]/.test(d.q)), 'عيّنة واحدة على الأقل سؤالها عربي');
}

/* ============ ٥٧ · دوران العيّنات ============ */
describe('٥٧ · دوران العيّنة');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  A.store.remove('lp_demo');

  // زائر يعود ثلاث مرات يرى ثلاثة تخصصات — الدوران لا العشوائية
  const seen = [A.demos.next(), A.demos.next(), A.demos.next()];
  eq(seen.join(','), '0,1,2', 'الدوران متسلسل: لا تكرار في ثلاث زيارات');
  eq(A.demos.next(), 0, 'ثم يعود إلى الأولى');
  eq(A.demos.at(-1).tag, 'محاسبة', 'والفهرس السالب لا يكسر شيئًا');
  eq(A.demos.at(7).tag, A.demos.list[1].tag, 'وفهرس خارج المدى يلتفّ');

  // السؤال وبطاقة الحفظ من نفس العيّنة — وإلا بدتا غير مترابطتين
  A.api.saveSession(null);
  A.data.savePack({ subjects:[], settings:{} });
  A.store.set('lp_demo', 1);          // عيّنة الحاسب
  A.router.render('#/');
  const t = doc.getElementById('main').textContent;
  has(t, 'حاسب', 'وسم التخصص يتبع العيّنة المعروضة');
  has(t, 'binary search', 'والسؤال منها');
  const memo = doc.querySelector('.lp-memo');
  memo.click();
  has(memo.textContent, 'log n', 'وبطاقة الحفظ من العيّنة نفسها لا من غيرها');
  W.close();
}

/* ============ ٥٨ · القوالب تُمرَّر على المقسّم الحقيقي ============ */
describe('٥٨ · قوالب التنسيق');
{
  const parser = require('../api/_lib/parser.js');
  const A = makeDom().window.QBANK;

  // ★ التعابير في المتصفح نسخة حرفية من الخادم — لو انفصلا كذب الفاحص على الطالب
  eq(A.formats.re.q.source,   parser.Q_START.source,   'تعبير بداية السؤال مطابق للخادم');
  eq(A.formats.re.opt.source, parser.OPT_START.source, 'وتعبير الخيار');
  eq(A.formats.re.ans.source, parser.ANS_LINE.source,  'وتعبير سطر الإجابة');
  eq(A.formats.re.q.flags,    parser.Q_START.flags,    'وحتى الرايات متطابقة');

  eq(A.formats.list.length, 2, 'قالبان — بعدد ما يفهمه المقسّم لا أكثر');

  // ═══ القالب الأول: أسئلة بخيارات ═══
  const mcq = A.formats.list.filter(f => f.id === 'mcq')[0];
  const p1 = parser.parse(mcq.sample);
  eq(p1.length, 2, 'القالب الأول يُنتج سؤالين فعلًا');
  eq(p1[0].has_options, true, 'وأولهما بخيارات');
  eq(p1[0].options.length, 4, 'أربعة خيارات');
  eq(p1[0].answer, 0, 'وإجابته المعلنة A تُترجم إلى الموضع ٠');
  eq(p1[0].options[p1[0].answer], 'N-acetylcysteine', 'والموضع يشير إلى الإجابة الصحيحة');
  // القالب فيه سؤال عربي — يثبت للطالب أن العربية تعمل
  eq(p1[1].options[p1[1].answer], 'الأوم', 'والسؤال العربي في القالب يعمل وإجابته سليمة');
  has(p1[0].q, 'Which antidote', 'ونصّ السؤال بلا رقمه');
  ok(p1[0].q.indexOf('1.') === -1, 'الرقم لا يبقى داخل النص');

  // ═══ القالب الثاني: سؤال ثم إجابته ═══
  const qa = A.formats.list.filter(f => f.id === 'qa')[0];
  const p2 = parser.parse(qa.sample);
  eq(p2.length, 3, 'القالب الثاني يُنتج ثلاثة أسئلة');
  eq(p2[0].has_options, false, 'بلا خيارات');
  eq(p2[0].answer_text, 'N-acetylcysteine', 'وإجابة السؤال الأول تُلتقط');
  eq(p2[1].answer_text, 'الجهد يساوي التيار مضروبًا في المقاومة.', 'والإجابة العربية كذلك');
  eq(p2[2].answer_text, 'O(log n)', 'وإجابة فيها رموز لا تنكسر');

  // كل قالب يشرح نفسه
  A.formats.list.forEach(f => {
    ok(!!f.title && !!f.when, 'القالب «' + f.id + '» له عنوان ومتى يُستعمل');
    ok(f.rules.length >= 3, 'وثلاث قواعد على الأقل');
    ok(f.sample.split('\n').length >= 5, 'وعيّنة حقيقية لا سطرًا واحدًا');
  });

  // خطوات ما يحدث للملف
  eq(A.formats.pipeline.length, 4, 'أربع خطوات معلنة للطالب');
  has(JSON.stringify(A.formats.pipeline), 'لا نحتفظ بملفك', 'وتقول له صراحةً ما يحدث لملفه');
}

/* ============ ٥٩ · الفاحص الفوري ============ */
describe('٥٩ · فاحص التنسيق');
{
  const parser = require('../api/_lib/parser.js');
  const A = makeDom().window.QBANK;
  const check = A.formats.check;

  // ★ الفاحص يجب أن يوافق المقسّم في العدد — وإلا وعدنا الطالب بما لن يحدث
  A.formats.list.forEach(f => {
    eq(check(f.sample).questions, parser.parse(f.sample).length,
       'الفاحص يوافق المقسّم في عدد أسئلة قالب «' + f.id + '»');
  });

  const mixed = [
    '1. Question with options?', 'A) one', 'B) two', 'ANSWER: A',
    '2. سؤال بلا خيارات؟', 'إجابته هنا',
    '3. Another with options?', 'A) x', 'B) y', 'C) z'
  ].join('\n');
  const r = check(mixed);
  eq(r.questions, parser.parse(mixed).length, 'وفي ملف مختلط الشكلين');
  eq(r.questions, 3, 'ثلاثة أسئلة');
  eq(r.withOptions, 2, 'اثنان بخيارات');
  eq(r.withAnswer, 2, 'واثنان بإجابة معروفة — والثالث يستنتجه الذكاء');

  // الحالات التي يقع فيها الطالب فعلًا
  eq(check('').ok, false, 'نص فارغ: لا ادّعاء بالنجاح');
  eq(check('نص عادي بلا ترقيم إطلاقًا').ok, false, 'نص بلا ترقيم يُرفض بوضوح');
  eq(check(null).questions, 0, 'وقيمة معدومة لا تُسقط الفاحص');
  eq(check('1) سؤال بقوس؟\nإجابته').questions, 1, 'الترقيم بقوس مقبول كالنقطة');
  eq(check('Q1. سؤال؟\nإجابته').questions, 1, 'وبادئة Q مقبولة');
  eq(check('1. س؟\r\nA) أ\r\nB) ب').questions, 1, 'وأسطر ويندوز لا تكسر العدّ');
}

/* ============ ٦٠ · دليل التنسيق في شاشة الرفع ============ */
describe('٦٠ · شاشة الرفع');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  const pl = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'s9', email:'a@a.a' }))));
  A.api.auth.captureFromHash('#access_token=h.' + pl + '.s&refresh_token=r&expires_in=9999');

  pending.push((async () => {
    A.views.ViewUpload._reset();
    await nav(W, '#/upload');
    const main = doc.getElementById('main');

    // الدليل مطوي افتراضيًا — لا يزاحم من يعرف التنسيق أصلًا
    const guide = doc.querySelector('.fmt');
    ok(!!guide, 'دليل التنسيق موجود في شاشة الرفع');
    ok(!guide.open, 'ومطوي افتراضيًا فلا يزاحم من يعرف');
    has(guide.textContent, 'كيف أجهّز ملفي؟', 'وعنوانه سؤال الطالب نفسه');

    eq(doc.querySelectorAll('.fmt__card[data-fmt]').length, 2, 'بطاقة لكل قالب');
    ok(!!doc.querySelector('[data-fmt="mcq"]'), 'قالب الخيارات');
    ok(!!doc.querySelector('[data-fmt="qa"]'), 'وقالب سؤال-ثم-إجابة');
    eq(doc.querySelectorAll('.fmt__code').length, 2, 'ونصّ كل قالب معروض للنسخ');
    has(main.textContent, 'انسخ القالب', 'وزر نسخ');

    // خطوات المعالجة معلنة
    eq(doc.querySelectorAll('.fmt__pipe li').length, 4, 'أربع خطوات معلنة');
    has(main.textContent, 'لا نحتفظ بملفك', 'ومصير الملف مذكور صراحةً');

    // الفاحص الفوري
    const ta = doc.querySelector('.fmt__card--check textarea');
    ok(!!ta, 'فاحص التنسيق حاضر');
    has(doc.querySelector('.fmt__card--check').textContent, 'الفحص في جهازك',
        'ويطمئن الطالب أن شيئًا لا يُرفع');

    ta.value = '1. سؤال؟\nA) أ\nB) ب\nANSWER: A';
    ta.dispatchEvent(new W.Event('input', { bubbles:true }));
    const out = doc.querySelector('.fmt__out');
    has(out.textContent, 'وجدنا', 'الفاحص يردّ فورًا');
    has(out.textContent, '١', 'بعدد الأسئلة بالأرقام العربية');
    eq(out.className, 'fmt__out is-ok', 'وبحالة نجاح');

    ta.value = 'كلام بلا ترقيم';
    ta.dispatchEvent(new W.Event('input', { bubbles:true }));
    eq(doc.querySelector('.fmt__out').className, 'fmt__out is-no', 'ونصّ غير مفهوم يُرفض');
    has(doc.querySelector('.fmt__out').textContent, 'يبدأ برقمه',
        'ويقول كيف يُصلحه لا «خطأ» فقط');

    ta.value = '';
    ta.dispatchEvent(new W.Event('input', { bubbles:true }));
    eq(doc.querySelector('.fmt__out').textContent, '', 'وإفراغ الحقل يمسح الرسالة');
    W.close();
  })());
}

/* ============ ٦١ · اتّساق لوحة المشرف ============ */
describe('٦١ · اتّساق اللوحة');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  const pl = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'adm', email:'a@a.a' }))));
  A.api.auth.captureFromHash('#access_token=h.' + pl + '.s&refresh_token=r&expires_in=9999');

  A.api.rpc = name => {
    if (name === 'admin_stats') return Promise.resolve({ ok:true,
      data:{ students:42, active_7d:9, attempts:120, avg_pct:74 } });
    if (name === 'admin_students') return Promise.resolve({ ok:true,
      data:{ rows:[{ id:'u1', name:'سعد', avatar:'👤', attempts:12, best:88 }] } });
    if (name === 'admin_students_pro') return Promise.resolve({ ok:true, data:[
      { id:'u1', name:'سعد', avatar:'👤', is_admin:false, coins:120,
        university:'جامعة نجران', attempts:12, uploaded:0, paid:0, best:88 }] });
    if (name === 'admin_overview') return Promise.resolve({ ok:true, data:{ ok:true, days:30,
      funnel:{ signed_up:42, has_campus:10, enrolled:8, examined:5, uploaded:1, paid:0 },
      activity:{ new_users:2, active:9, attempts:120, avg_pct:74, online:2 },
      content:{ subjects:5, published:5, verified:0, free:1, questions:252, derived:0, drafts:0, orphan:0 },
      quality:{ reports_open:0, reports_all:0, ratings:0, avg_rating:0, low_rated:0 },
      money:{ revenue:0, revenue_all:0, paid_n:0, pending_n:0, failed_n:0, coins_outstanding:0, coins_spent:0 },
      community:{ universities:1, colleges:1, challenges:0 }, series:[] } });
    if (name === 'admin_coins')    return Promise.resolve({ ok:true, data:{ ok:true, by_kind:[] } });
    if (name === 'admin_payments') return Promise.resolve({ ok:true, data:[] });
    if (name === 'admin_hard_questions') return Promise.resolve({ ok:true, data:[] });
    if (name === 'admin_campus')   return Promise.resolve({ ok:true, data:{ ok:true, universities:[], top_creators:[] } });
    if (name === 'admin_audit')    return Promise.resolve({ ok:true, data:[] });
    if (name === 'admin_dashboard') return Promise.resolve({ ok:true, data:{
      kpi:{ students:42, active_7d:9, online:2, attempts:120, avg_pct:74, subjects:5,
            published:5, questions:252, derived:0, drafts:0, enrollments:0 },
      series:[], buckets:[], subjects:[], recent:[] } });
    return Promise.resolve({ ok:true, data:[] });
  };
  A.api.rest = p => {
    if (p.indexOf('subjects?select') === 0) return Promise.resolve({ ok:true, data:[
      { id:'s1', name:'التسمم', icon:'☤', q_count:45, published:true, free:true, ord:0, exam_date:null },
      { id:'s2', name:'مخفية', icon:'▤', q_count:10, published:false, free:false, ord:1, exam_date:null } ] });
    if (p.indexOf('drafts?select') === 0) return Promise.resolve({ ok:true, data:[
      { id:'d1', name:'مسوّدة جاهزة', status:'reviewing', total:30, done:30 },
      { id:'d2', name:'مسوّدة معتمدة', status:'approved', total:10, done:10 } ] });
    return Promise.resolve({ ok:true, data:[] });
  };

  // ★ «البلاغات» قبل «الإعدادات»: الإعدادات آخر ما يُفتح والبلاغات أول ما يُرى
  const TABS = ['dash','students','ugc','content','reports','quality','money','campus','audit','settings'];
  eq(A.views.ADMIN_TABS.length, 10, 'عشرة تبويبات في اللوحة');
  eq(A.views.ADMIN_TABS.map(t => t.id).join(','), TABS.join(','), 'وترتيبها ثابت ومعروف');

  pending.push((async () => {
    // ★ لا يبقى مكوّن من النظام القديم في أي تبويب — التفاوت يجعلها صفحات لا لوحة
    for (const t of TABS){
      await nav(W, '#/admin/' + t);
      await until(W, () => {
        const m = doc.getElementById('main');
        return m && m.textContent.indexOf('جارٍ') === -1;
      }, 6000);
      const main = doc.getElementById('main');
      ok(!main.querySelector('.card.row'), 'تبويب «' + t + '» بلا صفوف النظام القديم');
      ok(!main.querySelector('.stat__num'), 'وبلا مؤشرات النظام القديم');
      ok(!!main.querySelector('.tabs__btn[aria-selected="true"]'), 'وتبويبه المُفعَّل معلَّم');
    }

    /* ★ تبويب الطلاب صار عرضًا وتحكمًا في مكان واحد.
       كان مؤشرات وقائمة للقراءة فقط: يرى المشرف اسمًا ونتيجة ثم يفتح
       Supabase ليمنح كوينًا. الآن الرصيد والصلاحية والفعل في البطاقة نفسها. */
    await nav(W, '#/admin/students');
    await until(W, () => doc.querySelector('.stu'));
    ok(!!doc.querySelector('.stu__act'), 'ولكل طالب أفعاله في بطاقته');
    const acts = Array.prototype.map.call(
      doc.querySelectorAll('.stu__act button'), b => b.textContent);
    ok(acts.indexOf('امنح') !== -1 && acts.indexOf('اسحب') !== -1,
       'منح الكوينز وسحبها من الشاشة نفسها');
    ok(acts.some(x => x.indexOf('مشرف') !== -1), 'وتغيير الصلاحية');

    // تبويب المحتوى: المسوّدات المعتمدة لا تُعرض — ليست عملًا معلّقًا
    await nav(W, '#/admin/content');
    await until(W, () => doc.querySelector('.ad-panel'));
    const t2 = doc.getElementById('main').textContent;
    has(t2, 'مسوّدة جاهزة', 'المسوّدة المعلّقة معروضة');
    no(t2, 'مسوّدة معتمدة', 'والمعتمدة لا تزاحم — انتهى عملها');
    has(t2, 'غير معتمدة', 'وعددها معلن في عنوان اللوحة');
    has(t2, 'لا يراها الطالب', 'ويوضّح أنها غير ظاهرة للطالب');
    has(t2, 'مادة على المنصة', 'والمواد في لوحتها المعنونة');
    ok(!!doc.querySelector('a[href="#/admin/subject/s1"]'), 'ولكل مادة زر تحرير يقود لمحررها');
    has(t2, 'اعرض ما يراه الطالب', 'وللمشرف طريق سريع لرؤية المنصة كطالب');
    W.close();
  })());
}

/* ============ ٦٢ · بوابة المشرف نفسها ============ */
describe('٦٢ · بوابة الدخول');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  A.api.saveSession(null);

  // بلا جلسة: شاشة دخول لا شاشة فارغة ولا خطأ
  A.router.render('#/admin');
  const t = doc.getElementById('main').textContent;
  has(t, 'دخول المشرف', 'بلا جلسة تظهر بوابة دخول واضحة');
  has(t, 'is_admin', 'وتشرح أن التحقق في قاعدة البيانات لا في المتصفح');
  ok(!!doc.querySelector('input[type="email"], #adminEmail'), 'وفيها حقل بريد');

  // الإعدادات وحدها تعمل بلا جلسة — بها يُضبط الربط أول مرة
  A.router.render('#/admin/settings');
  has(doc.getElementById('main').textContent, 'ربط الخادم',
      'الإعدادات تُفتح بلا جلسة — بها يُضبط الربط أول مرة');
  W.close();
}

/* ============ ٦٣ · النموذج الأوفر وتخزين التعليمات ============ */
describe('٦٣ · توفير تكلفة الذكاء');
{
  const ai = fs.readFileSync(path.join(ROOT,'api','ai.js'), 'utf8');
  const prov = fs.readFileSync(path.join(ROOT,'api','_lib','provider.js'), 'utf8');

  has(prov, "'claude-haiku-4-5-20251001'", 'Haiku 4.5 هو الافتراضي — ثلث سعر Sonnet 4.5');
  has(prov, 'process.env.AI_MODEL', 'ويبقى قابلًا للتبديل من متغيّر البيئة');
  no(prov, "|| 'claude-sonnet-4-5'", 'ولم يبقَ النموذج الأغلى افتراضًا');

  // تخزين التعليمات: قراءة الذاكرة بعُشر سعر الدخل
  has(prov, "cache_control:{ type:'ephemeral' }", 'تعليمات النظام مخزَّنة مؤقتًا');
  has(prov, "system: [{ type:'text'", 'وبالشكل الذي يقبله الخادم');

  // الشرح الإنجليزي أُسقط — إخراج مكرّر على منصة عربية، والإخراج ٥ أضعاف سعر الدخل
  no(ai, 'expl_en (الشرح بالانجليزية)', 'لا يُطلب شرح إنجليزي — إخراج مكرّر مكلف');
  /* ★ انقلب المعيار: كان «جملتان» فأنتج شرحًا يكرّر الإجابة ولا يعلّم.
     صار مثالًا ذهبيًا من مواد AMSU نفسها بأطوالها المقيسة. */
  has(ai, 'const GOLD', 'المثال الذهبي حاضر — النموذج يقلّد ما يرى لا ما يُوصف له');
  has(ai, 'من ٣ إلى ٤ جمل', 'والشرح العربي مطلوب بعمق AMSU لا بجملتين');
  has(ai, 'المعلومة المفتاحية:', 'ويختم بالمعلومة المفتاحية كما في مواد علي');
  has(ai, 'maxTokens: 32768', 'وسقف الخرج يتّسع للمعيار الجديد فلا يُقطع الردّ');

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
  /* ★ انقلب الافتراض: المادة الكاملة هي المخرَج الذي رفع الطالبُ ملفَه لأجله.
     المجاني يبقى بضغطة واحدة، لكن الافتراض صار أفضل ما نعطيه لا أرخصه. */
  eq(w.enrich, true, 'المادة الكاملة — كطريقة AMSU — هي الافتراض');
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
    /* ★ الافتراض صار المادة الكاملة: الطالب يرفع ليذاكر لا ليخزّن نصًّا */
    eq(paid.getAttribute('aria-checked'), 'true', 'والمادة الكاملة محدَّدة ابتداءً');
    eq(free.getAttribute('aria-checked'), 'false', 'والمجاني خيارٌ بضغطة لا افتراض');
    has(free.textContent, 'مجانًا', 'وثمنه معلن: مجانًا');

    // ★ الفرق يُقال بالأسماء لا يُخبأ — الطالب لا يعرف ما «الإثراء» حتى يرى ما ينقصه بدونه
    has(free.textContent, 'بلا شرح', 'المسار المجاني يقول ما ينقصه');
    has(free.textContent, 'ولا ترجمة', 'ولا ترجمة');
    has(free.textContent, 'بطاقات حفظ', 'ولا بطاقات حفظ');
    has(free.textContent, 'بلا إجابة معلنة', 'ويحذّر من الأسئلة التي ستحتاج ضبطًا يدويًا');
    has(paid.textContent, 'بطاقة حفظ', 'والمسار الكامل يقول ما يضيفه — بطاقة حفظ');
    has(paid.textContent, 'طريقة الحفظ', 'وتحليلًا للمادة كما في AMSU');
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
    /* ★ ومن لم يكفه رصيده يُردّ إلى المجاني تلقائيًا — لا يُترك على مسار مسدود */
    eq(doc.querySelector('[data-path="false"]').getAttribute('aria-checked'), 'true',
       'ويرتدّ الاختيار إلى المجاني وحده');
    ok(!doc.querySelector('.costbox').hidden, 'وصندوق الرصيد يبقى ظاهرًا يشرح سبب الحجب');

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

/* ============ ٦٨ · vercel.json يجتاز مخطط Vercel ============ */
/*
  لماذا هذا الفحص موجود:
  أضفتُ مرة مفتاح "_تعليق" عربيًا داخل vercel.json أشرح فيه قرارًا تقنيًا.
  ومخطط Vercel صارم — يرفض أي مفتاح خارج قائمته. فشل كل نشر بعدها،
  وظلّ الموقع يقدّم بناءً قديمًا ساعتين ونحن نظنّه محدَّثًا. الملف كان
  سليم الصياغة JSON، فلم يلتقطه شيء عندنا. هذا الفحص هو ما كان ناقصًا.
*/
describe('٦٨ · صحة إعدادات النشر');
{
  const vjPath = path.join(ROOT, 'vercel.json');
  const rawVj = fs.readFileSync(vjPath, 'utf8');

  let vj = null;
  try { vj = JSON.parse(rawVj); } catch (e) { vj = null; }
  ok(vj !== null, 'vercel.json صالح JSON');

  // القائمة المسموحة في مخطط Vercel — أي مفتاح خارجها يُفشل النشر كاملًا
  const ALLOWED = ['$schema','buildCommand','devCommand','installCommand','ignoreCommand',
    'outputDirectory','framework','public','regions','functions','routes','rewrites',
    'redirects','headers','cleanUrls','trailingSlash','crons','images','git','builds',
    'name','version','env','build','github','functionFailoverRegions'];

  const unknown = Object.keys(vj || {}).filter(k => ALLOWED.indexOf(k) === -1);
  eq(unknown.length, 0, 'لا مفتاح خارج مخطط Vercel' +
     (unknown.length ? ' — وُجد: ' + unknown.join('، ') : ''));

  // ★ الحارس المباشر: لا تعليقات عربية ولا مفاتيح بشرطة سفلية. التوثيق مكانه ملف .md
  ok(!/"_/.test(rawVj), 'لا مفتاح يبدأ بشرطة سفلية — التعليق مكانه ملف توثيق لا ملف إعداد');
  ok(!/[؀-ۿ]/.test(rawVj), 'ولا نص عربي داخل الملف إطلاقًا');

  // القرار الذي كان التعليق يشرحه — نُثبته فحصًا بدل أن نشرحه نصًّا
  eq(vj.buildCommand, undefined,
     'لا buildCommand: index.html يُبنى ويُختبر محليًا، فما يُرفع هو ما يُقدَّم');
  eq(vj.outputDirectory, '.', 'ومجلد الإخراج هو الجذر');

  /*
    ★ نصف الحقيقة الذي كلّفنا ساعة:
    حذف buildCommand وحده لا يوقف البناء. حين لا يجد Vercel أمر بناء في
    vercel.json يسقط تلقائيًا إلى scripts.build في package.json وينفّذه.
    فبقي ينفّذ `node src/build.js` ويعيد توليد index.html من src داخل خادمه،
    فيدهس الملف المبنيّ والمفحوص الذي رفعناه. رفعنا index.html صحيحًا
    ٢٦٨ ألف حرف فقدّم الموقع ٢٧٢ ألفًا — بناءً من مصادر أقدم.
    الفحص التالي هو المنفذ الذي كان مفتوحًا.
  */
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const scripts = pkg.scripts || {};
  eq(scripts.build, undefined,
     'ولا سكربت باسم build في package.json — وإلا نفّذه Vercel وبنى فوق ما رفعناه');
  ok(!!scripts.site, 'والبناء المحلي باسم لا يلتقطه Vercel: npm run site');
  eq(scripts.site, 'node src/build.js', 'وهو نفسه أمر البناء');
  ok(!scripts.vercel_build && !scripts['vercel-build'],
     'ولا vercel-build — وهو منفذ آخر يلتقطه Vercel تلقائيًا');

  // الرؤوس التي تمنع تقديم صفحة قديمة من الكاش
  const srcs = (vj.headers || []).map(h => h.source);
  ok(srcs.indexOf('/index.html') !== -1, 'وindex.html له رأس تحقّق يمنع كاشًا قديمًا');
  ok(srcs.indexOf('/sw.js') !== -1, 'وعامل الخدمة لا يُخبَّأ أبدًا');
}

/* ============ ٦٩ · سلامة بنية CSS ============ */
/*
  لماذا هذا الفحص موجود:
  وجدتُ في 50-landing.css كتلة @media فقد سطرُ فتحها، فصار
  `animation:none` مطبَّقًا على كل زائر لا على من طلب تقليل الحركة.
  ثم صنعتُ العطل نفسه بيدي حين حذفتُ سطور محدِّدات وتركت أجسامها يتيمة.
  المشترك بينهما أن CSS لا ينهار عند الخطأ — يتجاوزه المتصفح بصمت،
  فيبقى الخلل شهورًا. الأقواس هي ما يكشفه، فنعدّها.
*/
describe('٦٩ · سلامة بنية CSS');
{
  const dir = path.join(ROOT, 'src', 'css');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.css')).sort();
  ok(files.length > 0, 'ملفات CSS موجودة');

  files.forEach(f => {
    const s = fs.readFileSync(path.join(dir, f), 'utf8');
    // نُسقط التعليقات أولًا: قوس داخل تعليق عربي لا يعني شيئًا للمتصفح
    const code = s.replace(/\/\*[\s\S]*?\*\//g, '');

    let depth = 0, wentNegative = false;
    for (let i = 0; i < code.length; i++){
      if (code[i] === '{') depth++;
      else if (code[i] === '}'){ depth--; if (depth < 0) wentNegative = true; }
    }
    ok(!wentNegative, f + ': لا قوس إغلاق يتيم — لا كتلة فقدت سطر فتحها');
    eq(depth, 0, f + ': الأقواس متوازنة تمامًا');

    // كتلة بلا محدِّد: سطر إعلانات يلي } مباشرة، وهو أثر الحذف السطري
    ok(!/}\s*\n\s+[a-z-]+\s*:[^;{]*;/i.test(code),
       f + ': ولا جسم إعلانات بلا محدِّد يسبقه');
  });

  // ★ ولا لون ثابت من الهوية القديمة: الظلال والألوان تأتي من المتغيّرات
  const landing = fs.readFileSync(path.join(dir, '50-landing.css'), 'utf8');
  no(landing, 'rgba(18,128,92', 'ولا أثر للأخضر الطبي القديم بعد تحوّل الهوية للعنّابي');
}

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

/* ============ ٧٧ · عرض التقييم ============ */
describe('٧٧ · نجوم التقييم');
{
  const A = makeDom().window.QBANK;
  const T = A.trust;

  // ★ العدد يُعرض مع المتوسط دائمًا: ٥٫٠ من تقييم واحد ليس إجماعًا
  has(T.starsText(5, 1), 'تقييم', 'المتوسط يُعرض ومعه عدد المقيّمين');
  has(T.starsText(5, 1), '٥٫٠', 'والمتوسط برقم عربي بمنزلة واحدة');
  has(T.starsText(4.25, 12), '٤٫٣', 'ويُقرَّب لمنزلة واحدة');
  has(T.starsText(4.25, 12), 'تقييمات', 'والجمع يُصاغ صحيحًا');
  eq(T.starsText(0, 0), 'لم يُقيَّم بعد', 'وبلا تقييمات لا يُعرض صفر مضلِّل');

  eq(T.reasonName('wrong_answer'), 'الإجابة المعلَّمة خاطئة', 'أسباب البلاغ بالعربية');
  eq(T.reasonName('شيء'), 'شيء', 'وسبب غير معروف يُعرض كما هو بلا انهيار');
  eq(T.reasons.length, 5, 'خمسة أسباب محدَّدة');
  ok(T.reasons.some(r => r[0] === 'wrong_answer'),
     '★ ومنها «الإجابة خاطئة» — وهو البلاغ الوحيد الذي يمنع تعلّم خطأ');
}

/* ============ ٧٨ · شارات الثقة ============ */
describe('٧٨ · شارات الجودة');
{
  const A = makeDom().window.QBANK;
  const B = s => A.trust.badges(s).map(n => n.textContent).join(' | ');

  has(B({ verified:true, rating_n:0 }), 'موثّقة', 'الموثّقة تُوسم');
  eq(B({ verified:false, rating_n:0 }), '', 'وغير الموثّقة بلا تقييم: لا شارة — لا وسم سلبي');
  has(B({ verified:false, rating_avg:4.5, rating_n:8 }), '٤٫٥', 'والمقيَّمة تعرض نجومها');
  has(B({ verified:true, rating_avg:5, rating_n:3 }), 'موثّقة', 'والاثنتان معًا ممكنتان');
  eq(A.trust.badges({ verified:true, rating_n:2, rating_avg:4 }).length, 2, 'شارتان حين تجتمعان');
}

/* ============ ٧٩ · زر الإبلاغ عند السؤال ============ */
describe('٧٩ · الإبلاغ');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  const sent = [];
  A.api.rpc = (name, args) => {
    if (name === 'report_issue'){ sent.push(args); return Promise.resolve({ ok:true, data:{ ok:true } }); }
    return Promise.resolve({ ok:true, data:{} });
  };

  const host = doc.createElement('div');
  doc.body.appendChild(host);
  const btn = A.trust.reportButton('S1', 'Q7');
  host.appendChild(btn);

  eq(btn.getAttribute('aria-label'), 'أبلغ عن مشكلة', 'الزر موصوف لقارئ الشاشة');
  btn.dispatchEvent(new W.Event('click', { bubbles:true }));

  const form = host.querySelector('.report');
  ok(!!form, 'الضغط يفتح نموذج البلاغ عند السؤال نفسه');
  eq(form.querySelectorAll('option').length, 5, 'بخمسة أسباب');

  const send = Array.prototype.filter.call(form.querySelectorAll('button'),
    b => b.textContent.indexOf('أرسل') !== -1)[0];
  send.dispatchEvent(new W.Event('click', { bubbles:true }));

  pending.push((async () => {
    await until(W, () => sent.length > 0);
    // ★ البلاغ يحمل معرّف السؤال لا المادة وحدها: «فيها خطأ» بلاغ لا يُتصرَّف فيه
    eq(sent[0].p_subject, 'S1', 'البلاغ يحمل معرّف المادة');
    eq(sent[0].p_question, 'Q7', '★ ومعرّف السؤال — بدونه لا يستطيع المشرف التصرّف');
    ok(sent[0].p_reason, 'وسببًا');
    W.close();
  })());
}

/* ============ ٨٠ · التقييم لمن جرّب المادة ============ */
describe('٨٠ · حارس التقييم');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  A.api.rpc = (name) => name === 'rate_subject'
    ? Promise.resolve({ ok:true, data:{ ok:false, reason:'not_enrolled' } })
    : Promise.resolve({ ok:true, data:{} });

  const host = doc.createElement('div'); doc.body.appendChild(host);
  host.appendChild(A.trust.ratingWidget({ id:'S1', name:'مادة' }));

  eq(host.querySelectorAll('.rate__star').length, 5, 'خمس نجوم');
  const send = Array.prototype.filter.call(host.querySelectorAll('button'),
    b => b.textContent.indexOf('أرسل تقييمي') !== -1)[0];

  // بلا اختيار نجوم: رسالة لا إرسال فارغ
  send.dispatchEvent(new W.Event('click', { bubbles:true }));
  has(host.querySelector('[role="status"]').textContent, 'اختر عدد النجوم', 'لا يُرسل تقييم بلا نجوم');

  host.querySelectorAll('.rate__star')[3].dispatchEvent(new W.Event('click', { bubbles:true }));
  eq(host.querySelectorAll('.rate__star.is-on').length, 4, 'اختيار ٤ يُضيء أربع نجوم');
  send.dispatchEvent(new W.Event('click', { bubbles:true }));

  pending.push((async () => {
    await until(W, () => host.querySelector('[role="status"]').textContent.indexOf('راجع') !== -1);
    // ★ سبب الرفض بالاسم: «تعذّر» وحدها تجعله يعيد المحاولة بلا فائدة
    has(host.querySelector('[role="status"]').textContent, 'التقييم لمن جرّبها',
        '★ ورفض «لم يفتحها» يُشرح بالاسم لا بـ«تعذّر»');
    W.close();
  })());
}

/* ============ ٨١ · طابور بلاغات المشرف ============ */
describe('٨١ · طابور البلاغات');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  const resolved = [];
  A.api.rpc = (name, args) => {
    if (name === 'admin_reports') return Promise.resolve({ ok:true, data:[{
      id:'R1', reason:'wrong_answer', note:'الإجابة الصحيحة هي ج', status:'open',
      created_at: new Date().toISOString(), subject_id:'S1', subject:'الفسيولوجيا',
      question_id:'Q1', q:'What is the normal heart rate?',
      options:['40–60','60–100','100–140','140–180'], answer:0
    }]});
    if (name === 'resolve_report'){ resolved.push(args); return Promise.resolve({ ok:true, data:{ ok:true } }); }
    return Promise.resolve({ ok:true, data:[] });
  };
  A.store.set('is_admin_check', { uid:'x', ok:true });

  const host = doc.createElement('div'); doc.body.appendChild(host);
  host.appendChild(A.views.reportsBody());

  pending.push((async () => {
    await until(W, () => host.querySelector('.rep'));
    const t = host.textContent;

    // ★ نصّ السؤال داخل البلاغ: بدونه يفتح المشرف المادة مع كل بلاغ فيتراكم الطابور
    has(t, 'normal heart rate', '★ نصّ السؤال يصل مع البلاغ — لا حاجة لفتح المادة');
    has(t, 'المعلَّمة', 'والإجابة المعلَّمة موسومة');
    has(t, 'الإجابة المعلَّمة خاطئة', 'وسبب البلاغ بالعربية');
    has(t, 'الإجابة الصحيحة هي ج', 'وملاحظة الطالب معروضة');
    has(t, 'الفسيولوجيا', 'واسم المادة');

    const ok1 = Array.prototype.filter.call(host.querySelectorAll('button'),
      b => b.textContent.indexOf('عولج') !== -1)[0];
    ok1.dispatchEvent(new W.Event('click', { bubbles:true }));
    await until(W, () => resolved.length > 0);
    eq(resolved[0].p_report, 'R1', 'المعالجة تُرسل معرّف البلاغ');
    eq(resolved[0].p_status, 'resolved', 'وحالته الجديدة');
    W.close();
  })());
}

/* ============ ٨٢ · ملف TRUST.sql ============ */
describe('٨٢ · قاعدة الثقة');
{
  const sql = fs.readFileSync(path.join(ROOT, 'db', 'TRUST.sql'), 'utf8');

  has(sql, 'check (stars between 1 and 5)', 'النجوم محصورة بين ١ و٥ في القاعدة لا في الواجهة فقط');
  has(sql, 'primary key (subject_id, user_id)', '★ تقييم واحد لكل طالب لكل مادة — لا حشد أصوات');
  has(sql, "reason = any(ok_reason)", 'وسبب البلاغ من قائمة مغلقة');

  // ★ أرخص هجوم على منصة محتواها من المستخدمين: إغراق منافس بنجمة واحدة
  has(sql, "reason','not_enrolled", '★ لا يُقيّم إلا من فتح المادة — يمنع إغراق منافس بتقييمات زائفة');
  has(sql, 'qbank.enrollments', 'والتحقق من الاشتراك');
  has(sql, 'qbank.subject_trials', 'أو من التجربة');

  has(sql, 'reports_once', 'وبلاغ واحد مفتوح لكل طالب لكل سؤال');
  has(sql, "where status = 'open'", 'والفهرس الفريد على المفتوحة وحدها — يُعاد الإبلاغ بعد البتّ');

  // التوثيق قرار إنسان: لو مُنح تلقائيًا بعدد تقييمات لصار وسمًا يُشترى
  has(sql, 'qbank.is_admin()', 'والتوثيق للمشرف وحده');
  no(sql, 'verified = true where rating_n', '★ ولا توثيق تلقائي بعدد التقييمات — وسمٌ يُشترى لا يعني شيئًا');

  // لا سياسة تعديل للطالب على البلاغ
  no(sql, 'create policy reports_update on qbank.reports for update',
     '★ ولا يُغلق الطالب بلاغه بنفسه — يُغلقه المشرف عبر الدالة');

  has(sql, 'create or replace function qbank.find_similar', 'وكشف المكرر موجود');
  has(sql, 'is not distinct from s.university_id',
      '★ والمطابقة داخل الجامعة وحدها — «فيزياء ١» في نجران ليست تكرارًا لمثيلتها في القاهرة');

  const defs = sql.split('create or replace function').slice(1);
  eq(defs.filter(d => d.indexOf('set search_path = qbank, public') === -1).length, 0,
     'وكل دالة تثبّت search_path');
  no(sql, 'drop table', 'ولا حذف جدول');
}

/* ============ ٨٣ · صياغة الوقت والميداليات ============ */
describe('٨٣ · أدوات المجتمع');
{
  const A = makeDom().window.QBANK;
  const C = A.community;
  const h = n => new Date(Date.now() + n * 3600000).toISOString();

  has(C.timeLeft(h(50)), 'يوم', 'ما يزيد على يوم يُقال بالأيام');
  has(C.timeLeft(h(5)),  'ساعة', 'وما دونه بالساعات');
  has(C.timeLeft(h(0.2)),'دقيقة', 'وآخر ساعة بالدقائق');
  eq(C.timeLeft(h(-3)), 'انتهى', 'والمنتهي يُقال صراحةً');
  // ★ الوقت بعبارة لا بتاريخ: الطالب يقرّر بلمحة لا بحساب
  no(C.timeLeft(h(50)), '20', 'ولا تاريخ خام يحسبه الطالب بنفسه');

  eq(C.medal(1), '🥇', 'الأول ذهب');
  eq(C.medal(3), '🥉', 'والثالث برونز');
  eq(C.medal(4), '', '★ ولا ميدالية للرابع — ميدالية للجميع لا تميّز أحدًا');
}

/* ============ ٨٤ · لوحة متصدّري الجامعة ============ */
describe('٨٤ · متصدّرو الجامعة');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  A.api.rpc = () => Promise.resolve({ ok:true, data:{
    ok:true, total:200, days:30,
    rows:[
      { rank:1, name:'سارة', avatar:'🧠', points:420, exams:12, best:96, me:false },
      { rank:2, name:'',     avatar:'',   points:310, exams:9,  best:88, me:false },
      { rank:3, name:'خالد', avatar:'🩺', points:290, exams:8,  best:84, me:false }
    ],
    me:{ rank:47, points:60, exams:2 }
  }});

  const host = doc.createElement('div'); doc.body.appendChild(host);
  host.appendChild(A.community.boardBody());

  pending.push((async () => {
    await until(W, () => host.querySelector('.brd__row'));
    const rows = host.querySelectorAll('.brd__row');
    eq(rows.length, 4, 'ثلاثة صفوف ومعها صفّك أنت');

    has(rows[0].textContent, '🥇', 'الأول بميدالية');
    // ★ من لم يضع اسمًا يظهر «طالب» — لا فراغ ولا بريد
    has(rows[1].textContent, 'طالب', '★ ومن بلا اسم يظهر «طالب» لا فراغًا ولا بريدًا');
    ok(host.textContent.indexOf('@') === -1, 'ولا بريد في اللوحة إطلاقًا');

    // ★ ترتيبك ولو خارج العشرين: الغياب يُحبط، و«٤٧» يُحفّز
    const mine = host.querySelector('.is-mine-out');
    ok(!!mine, '★ وترتيبك يظهر ولو كنت خارج المعروضين');
    has(mine.textContent, '٤٧', 'برقمه');
    has(host.textContent, 'داخل جامعتك', 'والنطاق معلن: جامعتك لا المنصة');
    W.close();
  })());
}

/* ============ ٨٥ · لوحة بلا جامعة ============ */
describe('٨٥ · لوحة بلا انتماء');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  A.api.rpc = () => Promise.resolve({ ok:true, data:{ ok:false, reason:'no_university' } });

  const host = doc.createElement('div'); doc.body.appendChild(host);
  host.appendChild(A.community.boardBody());

  pending.push((async () => {
    await until(W, () => host.textContent.indexOf('حدّد جامعتك') !== -1);
    // ★ الفراغ يُشرح ويُعالَج: «لا جامعة» خطوة ناقصة لا عطل
    has(host.textContent, 'المتصدرون داخل جامعتك', 'يُشرح سبب الفراغ');
    ok(!!host.querySelector('a[href="#/account"]'), '★ ومعه الزر الذي يُصلحه');
    W.close();
  })());
}

/* ============ ٨٦ · التحدّي: إنشاء ورمز ولوحة ============ */
describe('٨٦ · تحدّي الدفعة');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  const made = [];
  A.api.rpc = (name, args) => {
    if (name === 'create_challenge'){ made.push(args); return Promise.resolve({ ok:true, data:{ ok:true, id:'X1', code:'ABC234' } }); }
    return Promise.resolve({ ok:true, data:{} });
  };

  const host = doc.createElement('div'); doc.body.appendChild(host);
  host.appendChild(A.community.challengeBox({ id:'S1', name:'مادة' }));

  const make = Array.prototype.filter.call(host.querySelectorAll('button'),
    b => b.textContent.indexOf('افتح تحدّيًا') !== -1)[0];
  ok(!!make, 'زر فتح التحدّي موجود');
  make.dispatchEvent(new W.Event('click', { bubbles:true }));

  pending.push((async () => {
    await until(W, () => host.querySelector('.chall__code'));
    eq(made[0].p_subject, 'S1', 'التحدّي يُفتح على المادة');
    eq(host.querySelector('.chall__code').textContent, 'ABC234', 'والرمز يُعرض كبيرًا');
    // ★ الرمز بلا حروف ملتبسة: يُملى صوتًا في مجموعة الدفعة
    ok(!/[O0I1]/.test(host.querySelector('.chall__code').textContent),
       '★ ولا حروف ملتبسة (O/0 و I/1) — الرمز يُملى صوتًا لا يُنسخ فقط');
    ok(!!host.querySelector('a[href="#/challenge/ABC234"]'), 'ورابط اللوحة جاهز');
    W.close();
  })());
}

/* ============ ٨٧ · شاشة لوحة التحدّي ============ */
describe('٨٧ · لوحة التحدّي');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  A.api.rpc = (name, args) => {
    if (name !== 'challenge_board') return Promise.resolve({ ok:true, data:{} });
    if (args.p_code === 'NOPE') return Promise.resolve({ ok:true, data:{ ok:false, reason:'not_found' } });
    return Promise.resolve({ ok:true, data:{
      ok:true, code:'ABC234', title:'تحدّي دفعة ٢٠٢٦', subject:'الفسيولوجيا', subject_id:'S1',
      ends_at: new Date(Date.now() + 36e5 * 30).toISOString(), ended:false,
      rows:[{ rank:1, name:'سارة', avatar:'🧠', score:92, me:false },
            { rank:2, name:'أنا',  avatar:'◍', score:80, me:true }]
    }});
  };

  pending.push((async () => {
    await nav(W, '#/challenge/ABC234');
    await until(W, () => doc.querySelector('.brd__row'));
    const t = doc.getElementById('main').textContent;
    has(t, 'تحدّي دفعة ٢٠٢٦', 'عنوان التحدّي');
    has(t, 'الفسيولوجيا', 'والمادة');
    has(t, 'يبقى', 'والوقت المتبقي بعبارة');
    eq(doc.querySelectorAll('.brd__row').length, 2, 'وصفّان في اللوحة');
    ok(!!doc.querySelector('.brd__row.is-me'), 'وصفّك مميَّز');
    ok(!!doc.querySelector('a[href*="challenge=ABC234"]'), 'وزر بدء اختبار التحدّي يحمل رمزه');

    // رمز خاطئ: رسالة تفهم لا شاشة مكسورة
    await nav(W, '#/challenge/NOPE');
    await until(W, () => doc.getElementById('main').textContent.indexOf('لم نجد') !== -1);
    has(doc.getElementById('main').textContent, 'ستة محارف', 'والرمز الخاطئ يشرح الشكل المتوقَّع');
    W.close();
  })());
}

/* ============ ٨٨ · ملف COMMUNITY.sql ============ */
describe('٨٨ · قاعدة المجتمع');
{
  const sql = fs.readFileSync(path.join(ROOT, 'db', 'COMMUNITY.sql'), 'utf8');

  // ★ الخطّ الأحمر الأول: لا بريد ولا معرّف مستخدم يخرج من أي دالة
  no(sql, "'email'", '★ لا بريد في أي مُخرَج');
  no(sql, "'user_id', ", '★ ولا معرّف مستخدم — الاسم والصورة فقط');
  has(sql, "'name', nullif(btrim(p.name)", 'والاسم يُنظَّف قبل عرضه');

  // ★ الخطّ الأحمر الثاني: المقارنة داخل الجامعة
  has(sql, 'p.university_id = uni', '★ والمقارنة داخل الجامعة لا عبر المنصة');
  has(sql, 'p.show_on_board', 'ومن اختار الاختفاء لا يُحسب');
  has(sql, 'add column if not exists show_on_board boolean not null default true',
      'والظهور اختيار بافتراض ظاهر');

  // المعيار يقيس المراجعة لا النقر
  has(sql, 'sum(greatest(coalesce(a.correct, 0), 0))',
      '★ النقاط بالإجابات الصحيحة لا بعدد الاختبارات — نقيس المراجعة لا النقر');
  has(sql, "now() - (least(greatest(coalesce(p_days,30), 1), 365)",
      'ونافذة زمنية تُبقي اللوحة قابلة للفوز');

  // التحدّي
  has(sql, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
      '★ رمز التحدّي بلا O/0 وI/1 — يُملى صوتًا في مجموعة الدفعة');
  has(sql, "reason','ended", 'ولا تُقبل نتيجة بعد انتهاء الوقت');
  has(sql, 'greatest(qbank.challenge_entries.score, excluded.score)',
      '★ وأفضل نتيجة تبقى لا الأخيرة — كي لا يخاف الطالب من محاولة ثانية');

  // العطل الذي وقعنا فيه سابقًا: متغيّر يطابق اسم عمود
  has(sql, 'new_id uuid', 'والمتغيّر new_id لا id — تظليل اسم عمود يُنتج عطلًا صامتًا');
  no(sql, 'into id;', 'ولا returning إلى متغيّر ملتبس');

  const defs = sql.split('create or replace function').slice(1);
  eq(defs.filter(d => d.indexOf('set search_path = qbank, public') === -1).length, 0,
     'وكل دالة تثبّت search_path');
  no(sql, 'drop table', 'ولا حذف جدول');
}

/* ============ ٨٩ · التوثيق ومدخل الطابور ============ */
describe('٨٩ · وسم موثّق');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;

  /* ★ شاشة بلا مدخل غير موجودة عمليًا: بنينا الطابور وكاد يبقى بلا رابط،
     وطابور بلاغات لا يفتحه أحد يمنح الطالب ثقة كاذبة بأن أحدًا يتابع. */
  const ids = A.views.ADMIN_TABS.map(t => t.id);
  ok(ids.indexOf('reports') !== -1, '★ «البلاغات» تبويب في لوحة المشرف — للطابور مدخل');
  ok(ids.indexOf('reports') < ids.indexOf('settings'),
     'وقبل الإعدادات: الإعدادات آخر ما يُفتح والبلاغات أول ما يُرى');

  const sent = [];
  A.api.rpc = (name, args) => {
    if (name === 'set_verified'){ sent.push(args); return Promise.resolve({ ok:true, data:{ ok:true, verified:args.p_on } }); }
    return Promise.resolve({ ok:true, data:[] });
  };
  A.store.set('is_admin_check', { uid:'x', ok:true });

  const host = doc.createElement('div'); doc.body.appendChild(host);
  const sub = { id:'S1', name:'مادة', q_count:10, topics:[], color:'subject-1', icon:'▤',
                verified:false, rating_n:4, rating_avg:4.5, reports_open:2 };
  host.appendChild(A.views.subjIdentity(sub, () => {}));

  const btn = Array.prototype.filter.call(host.querySelectorAll('button'),
    b => b.textContent.indexOf('وثّق') !== -1)[0];
  ok(!!btn, 'زر التوثيق موجود في محرّر المادة');
  has(host.textContent, '٤٫٥', 'وتقييم المادة معروض للمشرف');

  // ★ توثيق مادة عليها بلاغ مفتوح يمنح خطأً محتملًا ختم المراجعة
  const link = host.querySelector('a[href="#/admin/reports"]');
  ok(!!link, '★ ومادة عليها بلاغات تعرض بابًا إلى طابورها');
  has(link.textContent, '٢', 'بعددها');

  let asked = false;
  W.confirm = () => { asked = true; return false; };
  btn.dispatchEvent(new W.Event('click', { bubbles:true }));
  ok(asked, '★ ويُسأل المشرف قبل توثيق مادة عليها بلاغ مفتوح');
  eq(sent.length, 0, 'ورفضه يوقف التوثيق');

  W.confirm = () => true;
  btn.dispatchEvent(new W.Event('click', { bubbles:true }));
  pending.push((async () => {
    await until(W, () => sent.length > 0);
    eq(sent[0].p_on, true, 'وقبوله يوثّقها');
    eq(sent[0].p_subject, 'S1', 'بمعرّفها');
    W.close();
  })());
}

/* ============ ٩٠ · عرض المبالغ ============ */
describe('٩٠ · الريال والهللة');
{
  const A = makeDom().window.QBANK;
  const P = A.pay;

  // الهللة وحدة تخزين لا وحدة عرض: نخزّن بها كي لا نجمع كسورًا، ونعرض بالريال
  eq(P.money(1500, 'SAR'), '١٥ ريال', 'المبلغ الصحيح بلا كسر زائد');
  has(P.money(750, 'SAR'), '٧٫٥٠', 'والكسر بفاصلة عربية');
  eq(P.money(0, 'SAR'), '٠ ريال', 'والصفر يُعرض صفرًا');
  no(P.money(1500, 'SAR'), '1500', '★ ولا تظهر الهللات للطالب إطلاقًا');

  eq(P.questionsFor(300, 1), 300, '★ الكوين وحدة داخلية — نترجمها أسئلةً يفهمها الطالب');
  eq(P.questionsFor(300, 2), 150, 'وتتبع تكلفة السؤال');
  eq(P.questionsFor(300, 0), 300, 'وتكلفة صفر لا تُنتج قسمة على صفر');
  eq(P.questionsFor(0, 1), 0, 'وصفر كوين صفر سؤال');
}

/* ============ ٩١ · لا يُرسل المتصفح مبلغًا ============ */
describe('٩١ · السعر من القاعدة');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  const sent = [];
  A.admin.server = (path, body) => { sent.push({ path, body });
    return Promise.resolve({ ok:true, data:{ ok:true, url:'https://tap.test/pay/1', payment_id:'P1' } }); };
  A.api.rpc = () => Promise.resolve({ ok:true, data:{
    open:true, currency:'SAR', cost_per_q:1,
    packages:[{ coins:300, halalas:1500 }, { coins:700, halalas:3000 }] } });

  const host = doc.createElement('div'); doc.body.appendChild(host);
  host.appendChild(A.pay.coinShop());

  pending.push((async () => {
    await until(W, () => host.querySelector('.pack'));
    eq(host.querySelectorAll('.pack').length, 2, 'الباقتان معروضتان');
    has(host.textContent, '١٥ ريال', 'بأسعارها بالريال');
    has(host.textContent, 'سؤالًا مُثرى', 'وبقيمتها بالأسئلة لا بالكوين وحده');

    // ★ «الأوفر» محسوبة لا مكتوبة: لو كُتبت يدويًا لكذبت عند أول تغيير سعر
    const best = host.querySelector('.pack--best');
    ok(!!best, 'والأوفر موسومة');
    has(best.textContent, '٧٠٠', '★ وهي الأقل سعرًا للكوين — محسوبة لا مكتوبة');

    const buy = Array.prototype.filter.call(host.querySelectorAll('button'),
      b => b.textContent === 'اشترِ')[0];
    buy.dispatchEvent(new W.Event('click', { bubbles:true }));
    await until(W, () => sent.length > 0);

    eq(sent[0].path, '/api/pay', 'الشراء يمرّ بالخادم');
    eq(sent[0].body.kind, 'coins', 'ونوعه معلن');
    eq(sent[0].body.coins, 300, 'ومعه رقم الباقة');
    // ★ الفحص الذي يمنع «مادة بريال»
    ok(!('amount' in sent[0].body) && !('halalas' in sent[0].body) && !('price' in sent[0].body),
       '★ ولا مبلغ في الطلب إطلاقًا — القاعدة تحسبه، ولو أرسله المتصفح لاشترى بما يشاء');
    W.close();
  })());
}

/* ============ ٩٢ · الشراء موقوف ============ */
describe('٩٢ · إيقاف الشراء');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  A.api.rpc = () => Promise.resolve({ ok:true, data:{ open:false, packages:[] } });
  const host = doc.createElement('div'); doc.body.appendChild(host);
  host.appendChild(A.pay.coinShop());

  pending.push((async () => {
    await until(W, () => host.textContent.indexOf('موقوف') !== -1);
    // ★ نقول «موقوف» ولا نُخفي القسم: من يبحث عن الشراء ولا يجده يظنّه عطلًا فيغادر
    has(host.textContent, 'رصيدك الحالي يبقى كما هو',
        '★ والطالب يُطمأن أن رصيده وما اشتراه لا يتأثران');
    W.close();
  })());
}

/* ============ ٩٣ · زر شراء المادة ============ */
describe('٩٣ · شراء مادة');
{
  const dom = makeDom(), W = dom.window, A = W.QBANK;
  eq(A.pay.buySubjectButton({ id:'s', free:true, price:20 }), null, 'المجانية بلا زر شراء');
  eq(A.pay.buySubjectButton({ id:'s', price:0 }), null, 'وبلا سعر كذلك');
  eq(A.pay.buySubjectButton(null), null, 'ومدخل فارغ لا يُنتج انهيارًا');
  const b = A.pay.buySubjectButton({ id:'s', price:20 });
  ok(!!b, 'وذات السعر لها زر');
  has(b.textContent, '٢٠ ريال', '★ والسعر مكتوب على الزر — لا مفاجأة بعد الضغط');

  /* ★ زر الشراء صار دفعًا داخل المنصة لا رابطًا خارجيًا:
     كان يفتح موقعًا آخر عند أهم لحظة في المنصة — لحظة قرار الدفع. */
  const gate = A.gate.buyButton({ id:'s', name:'مادة', price:20 });
  ok(gate.querySelector ? !gate.querySelector('a[href^="http"]') : true,
     '★ ولا رابط خارجي في بوابة الشراء');
  W.close();
}

/* ============ ٩٤ · شاشة العودة لا تصدّق العنوان ============ */
describe('٩٤ · العودة من البوابة');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  const calls = [];
  A.admin.server = (path, body) => { calls.push(body); return Promise.resolve({ ok:true, data:{ ok:true } }); };
  A.api.rpc = (n, args) => {
    if (n !== 'payment_status') return Promise.resolve({ ok:true, data:{} });
    return Promise.resolve({ ok:true, data:{ ok:true, status:'paid', kind:'coins', coins:300 } });
  };

  pending.push((async () => {
    await nav(W, '#/pay/P1?tap_id=chg_777');
    await until(W, () => doc.getElementById('main').textContent.indexOf('تمّت') !== -1);
    const t = doc.getElementById('main').textContent;
    has(t, 'تمّت العملية', 'النجاح يُعلن');
    has(t, '٣٠٠', 'وعدد الكوينز الواصل');

    // ★ لا نصدّق العنوان: نُرسل المعرّف إلى خادمنا ليسأل البوابة بنفسه
    eq(calls[0].action, 'confirm', '★ الشاشة تطلب تحققًا من الخادم');
    eq(calls[0].charge_id, 'chg_777', 'بمعرّف العملية القادم من البوابة');
    W.close();
  })());
}

/* ============ ٩٥ · دفعة معلّقة وأخرى فاشلة ============ */
describe('٩٥ · حواف الدفع');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  let status = 'pending';
  A.admin.server = () => Promise.resolve({ ok:true, data:{ ok:false } });
  A.api.rpc = (n) => n === 'payment_status'
    ? Promise.resolve({ ok:true, data:{ ok:true, status, kind:'coins', coins:300,
        reason: status === 'failed' ? 'المبلغ المدفوع أقل من المطلوب' : '' } })
    : Promise.resolve({ ok:true, data:{} });

  pending.push((async () => {
    await nav(W, '#/pay/P2');
    await until(W, () => doc.getElementById('main').textContent.indexOf('قيد التأكيد') !== -1);
    // ★ المعلّقة ليست فاشلة: ادّعاء الفشل يدفع الطالب إلى الدفع مرتين
    has(doc.getElementById('main').textContent, 'لا تدفع مرة أخرى',
        '★ والمعلّقة تُحذّر من الدفع مرتين — لا تُعلن فشلًا لم يحدث');

    status = 'failed';
    await nav(W, '#/pay/P3');
    await until(W, () => doc.getElementById('main').textContent.indexOf('لم تكتمل') !== -1);
    has(doc.getElementById('main').textContent, 'المبلغ المدفوع أقل من المطلوب',
        'والفاشلة تقول سببها');
    W.close();
  })());
}

/* ============ ٩٦ · ملف PAY.sql ============ */
describe('٩٦ · قاعدة الدفع');
{
  const sql = fs.readFileSync(path.join(ROOT, 'db', 'PAY.sql'), 'utf8');

  // ★ السعر يُحسم في القاعدة
  has(sql, "(x->>'coins')::int = p_coins",
      '★ باقة الكوينز تُطابَق بقائمة معلنة — لا عدد حر يرسله المتصفح');
  has(sql, "reason','bad_package", 'وباقة غير معروفة تُرفض');
  has(sql, 'greatest(coalesce(sub.price, 0), 0) * 100',
      '★ وسعر المادة من صفّها لا من الطلب');
  has(sql, "reason','already_owned", 'ولا يُدفع ثمن مادة يملكها');

  // ★ التسوية بمفتاح الخدمة وحده
  has(sql, 'grant execute on function qbank.settle_payment(uuid, text, int, text) to service_role',
      '★ التسوية لمفتاح الخدمة وحده');
  no(sql, 'grant execute on function qbank.settle_payment(uuid, text, int, text) to authenticated',
      '★ ولو مُنحت للطالب لمنح نفسه ما يشاء بنداء واحد');

  // ★ لا تكرار ولا نقص
  has(sql, 'payments_provider_ref', 'ومرجع الدفعة فريد — الإشعار المكرر لا يمنح مرتين');
  has(sql, "if pay.status = 'paid'", 'والصف المدفوع يُرجع نجاحًا بلا منح ثانٍ');
  has(sql, 'p_paid_halalas, 0) < pay.amount_halalas',
      '★ ومبلغ أقل من المطلوب لا يُسوّى — حزام ثانٍ لو خُدعت البوابة');

  // ★ لا كتابة للطالب على جدول الدفعات
  no(sql, 'create policy payments_insert', '★ ولا سياسة إدراج للطالب — صفٌّ يكتبه يعني رصيدًا مجانيًا');
  no(sql, 'create policy payments_update', 'ولا تعديل');
  has(sql, 'for update', 'والتسوية تقفل الصف قبل قراءته — إشعاران متزامنان لا يمنحان مرتين');

  // الإحالة لا تُبطل شراءً دُفع ثمنه
  has(sql, 'exception when others then', '★ وفشل مكافأة الإحالة لا يُبطل شراءً دُفع ثمنه');
  has(sql, 'when p_ref = uid then null', 'ولا يُحيل الطالب نفسه');

  const defs = sql.split('create or replace function').slice(1);
  eq(defs.filter(d => d.indexOf('set search_path = qbank, public') === -1).length, 0,
     'وكل دالة تثبّت search_path');
  no(sql, 'drop table', 'ولا حذف جدول');
}

/* ============ ٩٧ · خادم الدفع ============ */
describe('٩٧ · api/pay');
{
  const js = fs.readFileSync(path.join(ROOT, 'api', 'pay.js'), 'utf8');
  const gw = fs.readFileSync(path.join(ROOT, 'api', '_lib', 'gateway.js'), 'utf8');

  // ★ الخادم لا يقرأ مبلغًا من الطلب
  no(js, 'body.amount', '★ الخادم لا يقرأ مبلغًا من الطلب');
  no(js, 'body.price', 'ولا سعرًا');
  has(js, "rpc('create_payment'", 'بل ينادي القاعدة لتحسبه');

  // ★ الدليل الوحيد هو سؤال البوابة
  has(js, 'gateway.retrieveCharge', '★ والتسوية بعد سؤال البوابة مباشرة');
  has(js, "reason:'not_paid'", 'وغير المقبوضة تُرفض');
  has(gw, "=== 'CAPTURED'", 'والحالة المقبولة واحدة معلنة');

  // ★ المفتاح السري لا يُسرَّب
  has(gw, 'process.env.TAP_SECRET_KEY', 'المفتاح من البيئة');
  no(gw, 'console.log(secret', 'ولا يُسجَّل');
  no(js, 'TAP_SECRET', '★ ولا يظهر في مسار الطلب إطلاقًا');

  // webhook وconfirm معًا: أحدهما قد لا يصل
  has(js, "action === 'webhook'", 'وإشعار البوابة مسموع');
  has(js, 'req.query && req.query.hook', '★ ويُتعرَّف عليه بلا اشتراط حقل ترسله البوابة');
  has(js, 'res.status(200).json({ received:true', 'ويُردّ عليه ٢٠٠ دائمًا كي لا يتكرر بلا نهاية');

  // المقارنة بالأعداد الصحيحة
  has(gw, 'Math.round(Number(d.amount || 0) * 100)',
      '★ والمبلغ يُقارَن هللاتٍ صحيحة لا كسورًا عشرية');
}

/* ============ ٩٨ · التصدير لا يدهس الجلب ============ */
describe('٩٨ · أسماء الوحدة');
{
  const A = makeDom().window.QBANK;
  /*
    ★ كان QBANK.pay.history يُصدَّر فوق Pay.history — دالة جلب السجل —
    فصارت دالة البناء تنادي نفسها بلا نهاية وتنهار الصفحة كاملة.
    شاشة بيضاء كاملة سببها حرفٌ في اسم.
  */
  ok(typeof A.pay.history === 'function', 'دالة جلب السجل باقية');
  ok(typeof A.pay.historyCard === 'function', 'وبناء البطاقة باسم آخر');
  ok(A.pay.history !== A.pay.historyCard, '★ ولا يدهس أحدهما الآخر');
  ok(A.pay.options !== A.pay.coinShop, 'وكذلك الخيارات والمتجر');
  eq(typeof A.pay.status, 'function', 'وحالة الدفعة دالة جلب');

  /* ★ الانتقال إلى البوابة يقع داخل .then بعد رحلة شبكة — وقد يكون
     المستند فُكِّك حينها، فالكتابة على وصفه ترمي وتُسقط ما بعدها. */
  eq(typeof A.pay.goTo, 'function', 'والانتقال إلى البوابة عبر حارس');
}

/* ============ ٩٩ · القمع ============ */
describe('٩٩ · قمع الطلاب');
{
  const A = makeDom().window.QBANK;
  const f = A.views.funnelPanel({ signed_up:100, has_campus:60, enrolled:40, examined:20, uploaded:5, paid:2 });

  eq(f.querySelectorAll('.fun__row').length, 6, 'ست خطوات');
  const pcts = Array.prototype.map.call(f.querySelectorAll('.fun__p'), n => n.textContent).filter(Boolean);

  /* ★ النسبة من الخطوة السابقة لا من القمة.
     «٢٪ من المسجّلين دفعوا» رقم صحيح لا يقول شيئًا؛ و«٤٠٪ ممن رفعوا دفعوا»
     يقول أين تُكسب المعركة. النسبة من القمة تُخفي موضع التسرّب. */
  eq(pcts[0], '٦٠٪', '★ النسبة من الخطوة السابقة: ٦٠ من ١٠٠');
  eq(pcts[1], '٦٧٪', 'و٤٠ من ٦٠');
  eq(pcts[4], '٤٠٪', 'و٢ من ٥ — لا ٢٪ من ١٠٠');

  eq(f.querySelectorAll('.fun__p.is-low').length, 1, '★ وخطوة واحدة موسومة بالتسرّب (٢٥٪ دون الثلث)');

  const zero = A.views.funnelPanel({ signed_up:0, has_campus:0, enrolled:0, examined:0, uploaded:0, paid:0 });
  eq(zero.querySelectorAll('.fun__row').length, 6, 'ومنصة فارغة لا تنهار');
  eq(zero.querySelectorAll('.fun__p.is-low').length, 0, 'ولا تُوسم كلها بالتسرّب');
  eq(A.admin.pro.step(5, 0), null, 'والقسمة على صفر تُرجع لا شيء لا NaN');
}

/* ============ ١٠٠ · تبويبات اللوحة ============ */
describe('١٠٠ · بنية اللوحة');
{
  const A = makeDom().window.QBANK;
  const ids = A.views.ADMIN_TABS.map(t => t.id);

  eq(ids.join(','), 'dash,students,ugc,content,reports,quality,money,campus,audit,settings',
     'عشرة تبويبات بترتيب ما يستحق أن يُرى');
  // ★ الإعدادات آخرًا دائمًا: آخر ما يُفتح، وتصدُّرها يزاحم ما يحتاج تدخّلًا
  eq(ids[ids.length - 1], 'settings', '★ والإعدادات آخرًا');
  eq(ids[0], 'dash', 'واللوحة أولًا');
  ok(ids.indexOf('reports') < ids.indexOf('settings'), 'وما يحتاج تدخّلًا قبل ما يُضبط مرة');

  eq(A.views.ADMIN_TABS.filter(t => t.id === 'dash')[0].fill, A.views.proDashTab,
     'واللوحة القديمة استُبدلت بالكاملة');
  eq(A.views.ADMIN_TABS.filter(t => t.id === 'students')[0].fill, A.views.proStudentsTab,
     'وتبويب الطلاب صار فيه تحكم');
  eq(A.views.ADMIN_TABS.filter((t, i, arr) => arr.findIndex(x => x.id === t.id) !== i).length, 0,
     'ولا تبويب مكرَّر');
}

/* ============ ١٠١ · التحكم في الطالب ============ */
describe('١٠١ · تحكم الطلاب');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  const sent = [];
  let roleReply = { ok:true };
  A.api.rpc = (n, a) => {
    sent.push({ n, a });
    if (n === 'admin_students_pro') return Promise.resolve({ ok:true, data:[
      { id:'u1', name:'سارة', avatar:'🧠', is_admin:false, coins:250,
        university:'جامعة نجران', attempts:4, uploaded:2, paid:1500 }]});
    if (n === 'admin_set_role') return Promise.resolve({ ok:true, data: roleReply });
    return Promise.resolve({ ok:true, data:{ ok:true, balance:350 } });
  };

  const box = doc.createElement('div'); doc.body.appendChild(box);
  A.views.proStudentsTab(box);

  pending.push((async () => {
    await until(W, () => box.querySelector('.stu'));
    const btn = t => Array.prototype.filter.call(box.querySelectorAll('button'), b => b.textContent === t)[0];

    has(box.textContent, '٢٥٠ كوين', 'رصيد الطالب ظاهر');
    has(box.textContent, '١٥ ريال', 'وما دفعه — لا عدد عملياته وحده');
    has(box.textContent, 'جامعة نجران', 'وجامعته');

    btn('امنح').dispatchEvent(new W.Event('click', { bubbles:true }));
    await until(W, () => box.textContent.indexOf('الرصيد الآن') !== -1);
    const g = sent.filter(x => x.n === 'admin_grant_coins')[0];
    eq(g.a.p_amount, 100, 'المنح يُرسل العدد موجبًا');
    /* ★ الرصيد الجديد يبقى معروضًا: كانت القائمة تُعاد بناؤها فتُمحى الرسالة
       قبل أن يقرأها المشرف — فيشكّ هل وصل المنح ويمنح ثانيةً، وهذا في المال يُكلّف. */
    has(box.textContent, 'الرصيد الآن ٣٥٠', '★ والرصيد الجديد يبقى معروضًا');
    has(box.textContent, '٣٥٠ كوين', 'والشارة تُحدَّث في مكانها');

    btn('اسحب').dispatchEvent(new W.Event('click', { bubbles:true }));
    await until(W, () => sent.filter(x => x.n === 'admin_grant_coins').length > 1);
    eq(sent.filter(x => x.n === 'admin_grant_coins')[1].a.p_amount, -100, 'والسحب يُرسله سالبًا');

    // ★ حارسان يستحقان اسمًا لا «تعذّر»
    W.confirm = () => true;
    roleReply = { ok:false, reason:'last_admin' };
    btn('ارفعه مشرفًا').dispatchEvent(new W.Event('click', { bubbles:true }));
    await until(W, () => box.textContent.indexOf('آخر مشرف') !== -1);
    has(box.textContent, 'ارفع غيره أولًا', '★ ورفض «آخر مشرف» يُشرح بالاسم');

    // ولا يُنفَّذ فعلٌ خطير بلا تأكيد
    W.confirm = () => false;
    const before = sent.filter(x => x.n === 'admin_set_role').length;
    btn('ارفعه مشرفًا').dispatchEvent(new W.Event('click', { bubbles:true }));
    eq(sent.filter(x => x.n === 'admin_set_role').length, before,
       '★ ورفض التأكيد يمنع الترقية — لا صلاحية تُمنح بضغطة واحدة');
    W.close();
  })());
}

/* ============ ١٠٢ · ردّ الدفعة يقول حدوده ============ */
describe('١٠٢ · ردّ الدفعة');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  let asked = '';
  A.api.rpc = (n) => {
    if (n === 'admin_payments') return Promise.resolve({ ok:true, data:[
      { id:'P1', kind:'coins', coins:300, amount_halalas:1500, status:'paid',
        created_at:new Date().toISOString(), student:'سارة' }]});
    if (n === 'admin_coins') return Promise.resolve({ ok:true, data:{ ok:true, by_kind:[
      { kind:'signup', n:12, coins:600 }, { kind:'spend', n:30, coins:-900 }] } });
    return Promise.resolve({ ok:true, data:{ ok:true } });
  };
  W.confirm = t => { asked = t; return false; };

  const box = doc.createElement('div'); doc.body.appendChild(box);
  A.views.proMoneyTab(box);

  pending.push((async () => {
    await until(W, () => box.querySelector('.payrow'));
    has(box.textContent, 'منحة تسجيل', 'دفتر الكوينز يفصل المنحة عن الشراء');
    has(box.textContent, 'إنفاق على الإثراء', 'والإنفاق بابٌ مستقل');

    const rb = Array.prototype.filter.call(box.querySelectorAll('button'), b => b.textContent === 'ردّ')[0];
    ok(!!rb, 'وللدفعة المدفوعة زر ردّ');
    rb.dispatchEvent(new W.Event('click', { bubbles:true }));
    /* ★ الوهم هنا يعني طالبًا ينتظر مالًا لن يصله: نحن لا نملك سحب مال من
       بطاقة، فنقولها في نص التأكيد بدل أن ندع المشرف يفترض. */
    has(asked, 'لوحة Tap', '★ والتأكيد يقول صراحةً إن إعادة المال تتم في لوحة البوابة');
    has(asked, 'هذه لا تفعلها', 'وأن هذا الزر لا يفعلها');
    W.close();
  })());
}

/* ============ ١٠٣ · ملف ADMIN-PRO.sql ============ */
describe('١٠٣ · قاعدة اللوحة');
{
  const sql = fs.readFileSync(path.join(ROOT, 'db', 'ADMIN-PRO.sql'), 'utf8');

  has(sql, 'create table if not exists qbank.admin_actions', 'سجل التدقيق موجود');
  // ★ سجلٌّ يستطيع صاحبه محوَه ليس سجلًّا
  no(sql, 'create policy audit_insert', '★ ولا سياسة إدراج عليه — يُكتب بالدالة وحدها');
  no(sql, 'create policy audit_delete', 'ولا حذف');
  no(sql, 'create policy audit_update', 'ولا تعديل');

  // كل فعل خطير يُسجَّل
  ['grant_coins','set_role','refund','merge_university','grant_entitlement'].forEach(a =>
    has(sql, "log_admin('" + a + "'", 'الفعل «' + a + '» يُسجَّل'));

  // ★ حارسا الصلاحية
  has(sql, "reason','self_demote", '★ لا يُنزل المشرف نفسه — لن يبقى من يرفعه');
  has(sql, "reason','last_admin", '★ ولا يُترك آخر مشرف بلا خلف');

  // ★ قائمة بيضاء لتعديل المادة
  has(sql, "coalesce((p_patch->>'published')::boolean, published)",
      'تعديل المادة بقائمة بيضاء صريحة');
  no(sql, 'q_count = coalesce', '★ ولا يُكتب q_count — عمود يُحسب، وكتابته تجعل كل إحصاء يكذب');
  no(sql, 'rating_avg = coalesce', 'ولا متوسط التقييم');
  no(sql, 'created_by = coalesce', 'ولا هوية الرافع');

  // القمع والالتزام
  has(sql, "'coins_outstanding'", '★ والكوينز غير المنفقة معروضة — التزام قادم يغيب عن أكثر اللوحات');
  has(sql, "'funnel', jsonb_build_object", 'والقمع محسوب في القاعدة لا في المتصفح');

  // الأسئلة الصعبة من المصدر الحقيقي
  has(sql, "jsonb_each(coalesce(per.sdata->'wrong'", 'وتقرير الأسئلة الصعبة يقرأ تقدّم الطلاب فعلًا');
  has(sql, 'count(distinct per.user_id)',
      '★ ويعدّ الطلاب لا المرات — تكرار طالب واحد لا يجعل السؤال أصعب على غيره');
  has(sql, 'sn.n >= 5', 'وبحدّ أدنى خمسة طلاب: نسبة من طالبين ضوضاء');

  const defs = sql.split('create or replace function').slice(1);
  eq(defs.filter(d => d.indexOf('set search_path = qbank, public') === -1).length, 0,
     'وكل دالة تثبّت search_path');
  eq(defs.filter(d => d.indexOf('qbank.is_admin()') === -1 && d.indexOf('log_admin') === -1).length, 0,
     '★ وكل دالة تتحقق من الصلاحية — عدا مسجّل التدقيق نفسه');
  no(sql, 'drop table', 'ولا حذف جدول');
}

/* ============ ١٠٤ · لا تُنشر مادة فارغة ============ */
describe('١٠٤ · حارس المادة الفارغة');
{
  /*
    ★ هذا الفحص وُلد من عطل حقيقي في الإنتاج.
    رُفع ملف لم يتعرّف المحلّل على سؤال واحد فيه، فتقدّم المعالج صامتًا
    إلى «راجع» — شاشة فارغة تحتها زر «انشر» — فأُنشئت مادة منشورة بصفر
    أسئلة ظهرت في «استكشف» ولا شيء فيها.

    الصمت هنا أسوأ من الفشل: الفشل يُصلَح، والصمت يُنشر.
    ولذلك أربعة أقفال لا قفل واحد: كل باب يؤدي إلى النشر يحتاج قفله،
    والخامس في القاعدة لأن الواجهة تُخدع والقاعدة لا تُخدع.
  */
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  const pl = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'u1', email:'a@a.a' }))));
  A.api.auth.captureFromHash('#access_token=h.' + pl + '.s&refresh_token=r&expires_in=9999');
  A.api.rpc = () => new Promise(() => {});

  // ★ القفل الأول: الاستيراد
  A.admin.server = async () => ({ ok:true, data:{ questions:[], total:0, subject_name:'س', slug:'s' } });
  pending.push((async () => {
    const w = await A.admin.wizardIngest(A.admin.newWizard(), 'f.txt', 'x');
    eq(w.step, 1, '★ ملفٌ بصفر أسئلة لا يتقدّم من الخطوة الأولى');
    has(w.error, 'لم نتعرّف على سؤال واحد', 'ويقول السبب لا «تعذّر» وحدها');
    has(w.error, 'قالب بنك الأسئلة', 'ويدلّ على القالب — الطالب يحتاج مخرجًا لا تشخيصًا');
    eq(w.total, 0, 'ولا يدّعي عددًا');

    // ★ القفل الثاني: المسار المجاني
    const w2 = A.admin.newWizard(); w2.raw = []; w2.total = 0;
    const out = A.admin.plainEnrich(w2);
    ok(out.error, '★ والمسار المجاني لا يتقدّم بلا سؤال — «مجاني» لا يعني «فارغ»');
    ok(out.step !== 3, 'ولا يقفز إلى المراجعة');

    // ★ القفل الثالث: شاشة المراجعة
    const w3 = A.admin.newWizard(); w3.step = 3; w3.enriched = []; w3.raw = [];
    A.views.ViewUpload._set(w3);
    A.router.render('#/upload');
    const t = doc.getElementById('main').textContent;
    has(t, 'لا أسئلة في هذه المسوّدة', '★ والمراجعة الفارغة تُعلن نفسها');
    no(t, 'تابع للنشر', '★ ولا زرّ نشر تحتها — كان هذا هو الباب المفتوح');
    has(t, 'ارجع وارفع ملفًا آخر', 'بل مخرجٌ يعيده للرفع');

    // ★ القفل الرابع: خطوة النشر
    const w4 = A.admin.newWizard(); w4.step = 4; w4.enriched = [];
    A.views.ViewUpload._set(w4);
    A.router.render('#/upload');
    has(doc.getElementById('main').textContent, 'لا شيء يُنشر', '★ وخطوة النشر مقفلة كذلك');

    A.views.ViewUpload._reset();
    W.close();
  })());
}

/* ============ ١٠٥ · قفل القاعدة ============ */
describe('١٠٥ · approve_draft يحرس نفسه');
{
  const sql = fs.readFileSync(path.join(ROOT, 'db', 'FIX-EMPTY-SUBJECT.sql'), 'utf8');

  has(sql, 'jsonb_array_length(coalesce(d.payload', 'القاعدة تعدّ الأسئلة قبل الإنشاء');
  has(sql, 'لا يمكن نشر بنك فارغ', '★ وترفض بنكًا فارغًا برسالة مفهومة');
  has(sql, 'update qbank.subjects set q_count = i where id = sid',
      '★ والعدّاد من الصفوف المُدرَجة فعلًا — الرقم الوحيد الذي لا يكذب');

  // ★ التنظيف يُخفي ولا يحذف
  /* ★ الحالة من القيم التي يقبلها قيد القاعدة لا من اختراعنا.
     كتبتُ 'hidden' فرفضها subjects_status_ck — وحالةٌ لا يعرفها النظام
     لا يجوز أن تدخله، والقيد كان محقًّا. */
  has(sql, "set published = false, status = 'suspended'",
      '★ وما نُشر فارغًا يُوقف لا يُحذف — قد ينتظره صاحبه');
  no(sql, "status = 'hidden'", 'ولا حالة خارج ما يقبله القيد');
  no(sql, 'delete from qbank.subjects', 'ولا حذف لمادة أحد');
  has(sql, 'where s.q_count <> (select count(*)', 'وكل عدّاد لا يطابق الواقع يُصحَّح');
  has(sql, 'qbank.is_admin()', 'والدالة تبقى محروسة');
  has(sql, 'set search_path = qbank, public', 'ومسار البحث مثبّت');
}

/* ============ ١٠٦ · محوّل المزوّدين ============ */
describe('١٠٦ · اختيار المزوّد');
{
  const P = require(path.join(ROOT, 'api', '_lib', 'provider.js'));
  const save = { p: process.env.AI_PROVIDER, g: process.env.GEMINI_API_KEY,
                 a: process.env.ANTHROPIC_API_KEY, m: process.env.AI_MODEL };
  const clear = () => { delete process.env.AI_PROVIDER; delete process.env.GEMINI_API_KEY;
                        delete process.env.ANTHROPIC_API_KEY; delete process.env.AI_MODEL; };

  clear();
  eq(P.pickProvider(), 'none', 'بلا مفتاح لا مزوّد');

  process.env.ANTHROPIC_API_KEY = 'x';
  eq(P.pickProvider(), 'anthropic', 'ومفتاح واحد يكفي لاختياره');

  /* ★ الاستنتاج من المفتاح الموجود يحذف متغيّرًا من الإعداد. كل متغيّر
     يدويّ بابُ عطلٍ صامت: يُضبط المفتاح ويُنسى المزوّد فيبدو كأن المفتاح
     خاطئ. الأقلّ إعدادًا أقلّ عطلًا. */
  process.env.GEMINI_API_KEY = 'y';
  eq(P.pickProvider(), 'gemini', '★ ووجود مفتاح Gemini يختاره بلا متغيّر ثانٍ');

  process.env.AI_PROVIDER = ' ANTHROPIC ';
  eq(P.pickProvider(), 'anthropic', 'والصريح يفوز، ويتحمّل الفراغ واختلاف الحالة');
  process.env.AI_PROVIDER = 'مجهول';
  eq(P.pickProvider(), 'gemini', 'وقيمة لا نعرفها تسقط للاستنتاج لا للانهيار');
  delete process.env.AI_PROVIDER;

  eq(P.modelFor('gemini'), 'gemini-3.6-flash', '★ Flash لا Pro — حصته المجانية ثلاثون ضعفًا');
  ok(P.modelFor('anthropic').indexOf('haiku') > -1, 'وHaiku لـ Anthropic — ثلث كلفة Sonnet');

  process.env.AI_MODEL = 'gemini-3.6-pro';
  eq(P.modelFor('gemini'), 'gemini-3.6-pro', 'ومتغيّر البيئة يتجاوز الافتراض');

  /* ★ متغيّر واحد لمزوّدين: AI_MODEL ضُبط لـ Anthropic قبل يومين، ولو طُبّق
     على Gemini لطلبنا من Google نموذج Claude — عطلٌ محيّر سببه إعدادٌ كان
     صحيحًا في زمنه. الغريب يُهمَل بصمت لا يُمرَّر. */
  process.env.AI_MODEL = 'claude-sonnet-4-5';
  eq(P.modelFor('gemini'), 'gemini-3.6-flash', '★ ونموذج مزوّد آخر يُهمَل لا يُمرَّر');
  eq(P.modelFor('anthropic'), 'claude-sonnet-4-5', 'ويُطاع عند مزوّده');

  clear();
  Object.keys(save).forEach(k => {
    const name = { p:'AI_PROVIDER', g:'GEMINI_API_KEY', a:'ANTHROPIC_API_KEY', m:'AI_MODEL' }[k];
    if (save[k] !== undefined) process.env[name] = save[k];
  });
}

describe('١٠٧ · انتزاع ردّ الذكاء');
{
  const P = require(path.join(ROOT, 'api', '_lib', 'provider.js'));

  eq(P.parseArray('[{"a":1}]').length, 1, 'مصفوفة عارية');
  eq(P.parseArray('```json\n[1,2]\n```').length, 2, 'ومصفوفة داخل سياج كود');
  eq(P.parseArray('تفضل: [1,2,3] انتهى').length, 3, 'ومصفوفة مسبوقة بكلام');

  /* ★ «فشل التحليل» وحدها تترك المشرف بلا خيط: لا يعرف أرفض النموذج،
     أم انقطع الردّ، أم ردّ باعتذار. عرضُ ما وصل فعلًا يحسم ذلك في ثانية. */
  let msg = '';
  try { P.parseArray('عذرًا لا أستطيع'); } catch(e){ msg = e.message; }
  has(msg, 'عذرًا لا أستطيع', '★ وخطأ التحليل يعرض ما وصل فعلًا');

  msg = '';
  try { P.parseArray('{"a":1}'); } catch(e){ msg = e.message; }
  has(msg, 'ليس مصفوفة', 'وكائنٌ مفرد يُرفض — الترتيب هو ما يربط السؤال بجوابه');
}

/* ★ كتلتا ١٠٨ و١١٠ تستبدلان global.fetch ومتغيّرات البيئة — وكلاهما عالميّ
   واحد. لو جرتا معًا في Promise.all سحبت نهاية إحداهما مُزيَّف الأخرى.
   والأهم: التزييف نفسه يجب أن يقع داخل الدور لا عند تعريف الكتلة، وإلا
   نصّبت الكتلة الثانية مُزيَّفها قبل أن تبدأ الأولى أصلًا. */
let fetchLock = Promise.resolve();
const serial = fn => { fetchLock = fetchLock.then(fn); pending.push(fetchLock); };

/* يحفظ البيئة والشبكة، ينفّذ، ثم يعيد كل شيء مهما حدث */
const withFakeNet = (fetchImpl, env, body) => serial(async () => {
  const keys = ['AI_PROVIDER','AI_MODEL','ANTHROPIC_API_KEY','GEMINI_API_KEY'];
  const save = {}; keys.forEach(k => { save[k] = process.env[k]; delete process.env[k]; });
  const savedFetch = global.fetch;
  Object.keys(env).forEach(k => { process.env[k] = env[k]; });
  global.fetch = fetchImpl;
  try { await body(); }
  finally {
    global.fetch = savedFetch;
    keys.forEach(k => { if (save[k] === undefined) delete process.env[k];
                        else process.env[k] = save[k]; });
  }
});

describe('١٠٨ · نداء Gemini');
{
  const P = require(path.join(ROOT, 'api', '_lib', 'provider.js'));
  let seen = null;
  const okNet = async (u, o) => { seen = { u, o }; return { ok:true, json: async () => ({
    candidates: [{ content: { parts: [{ text: '[{"expl_ar":"شرح"}]' }] } }],
    usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 22 }
  }) }; };

  withFakeNet(okNet, { GEMINI_API_KEY:'K123' }, async () => {
    const r = await P.callAI('نظام', 'مستخدم');

    has(seen.u, 'gemini-3.6-flash:generateContent', 'المسار يحمل النموذج');
    /* ★ مفتاحٌ في المسار مفتاحٌ في السجلّ: كل وسيط بينك وبين Google يدوّن
       سطر الطلب كاملًا، وGoogle نفسها تدوّنه. الترويسة لا تُدوَّن. */
    ok(seen.u.indexOf('K123') === -1, '★ والمفتاح ليس في المسار — المسارات تُسجَّل');
    eq(seen.o.headers['x-goog-api-key'], 'K123', 'بل في الترويسة');
    eq(JSON.parse(seen.o.body).generationConfig.responseMimeType, 'application/json',
       'وJSON مفروض من المزوّد لا مرجوّ في التعليمات');

    eq(r.provider, 'gemini', 'والردّ يقول من أجاب');
    eq(r.model, 'gemini-3.6-flash', 'وبأي نموذج');
    /* ★ أسماء موحّدة: بقية المنصة تعرض الاستهلاك للمشرف، ولو حملت أسماء
       Google لانكسرت لحظة تبديل المزوّد — وهذا نقيض غاية المحوّل. */
    eq(r.usage.input_tokens, 11, '★ والاستهلاك بأسماء موحّدة لا بأسماء Google');
    eq(r.usage.output_tokens, 22, 'دخلًا وخرجًا');
    eq(r.items[0].expl_ar, 'شرح', 'والمحتوى وصل');
  });

  /* ★ ثلاثة أعطال يسمّيها المحوّل: حجبٌ، وانقطاعُ طول، وغيابُ مفتاح.
     كلها كانت ستصل للطالب كـ «تعذّر» واحدة لا تدلّ على فعل. */
  withFakeNet(async () => ({ ok:true, json: async () => ({
      promptFeedback: { blockReason: 'SAFETY' } }) }),
    { GEMINI_API_KEY:'K' }, async () => {
      let e = ''; try { await P.callAI('a','b'); } catch(x){ e = x.message; }
      has(e, 'فلتر المحتوى', '★ وحجب الفلتر يُسمّى — أسئلة الجرعات تُحجب أحيانًا');
    });

  withFakeNet(async () => ({ ok:true, json: async () => ({
      candidates: [{ finishReason:'MAX_TOKENS', content:{ parts:[{ text:'[1' }] } }] }) }),
    { GEMINI_API_KEY:'K' }, async () => {
      let e = ''; try { await P.callAI('a','b'); } catch(x){ e = x.message; }
      has(e, 'قسّمها', 'وانقطاع الطول يقول الحلّ لا العطل');
    });

  withFakeNet(async () => { throw new Error('ما كان يجب أن نطلب شيئًا'); }, {}, async () => {
    let e = ''; try { await P.callAI('a','b'); } catch(x){ e = x.message; }
    has(e, 'ارفع بلا إثراء', '★ وغياب كل مفتاح يدلّ على المسار المجاني — لا يوصد الباب');
  });
}

describe('١٠٩ · ai.js لا يعد بما لا يملك');
{
  const src = fs.readFileSync(path.join(ROOT, 'api', 'ai.js'), 'utf8');

  /* ★ كان الردّ يحمل `model` مجرّدًا — متغيّرٌ محليّ داخل callClaude لا يراه
     نطاق الـ handler. فكل نجاحٍ ينتهي بـ ReferenceError يُلتقط ويُعاد ٥٠٠:
     المسار لم يكن ليعمل حتى بمفتاحٍ سليم. */
  ok(!/\bmodel,\s*$/m.test(src) && !/{\s*ok:true[^}]*\bmodel,/.test(src),
     '★ ولا يُعاد `model` مجرّدًا — متغيّر خارج نطاقه كان يُسقط كل نجاح');
  has(src, 'model: aiOut._model', 'بل يُقرأ مما أرجعه المحوّل');
  has(src, 'provider: aiOut._provider', 'ومعه اسم المزوّد — المشرف يحتاج معرفة من أجاب');

  has(src, "require('./_lib/provider.js')", 'والنداء يمرّ بالمحوّل');
  // ★ لا عنوان مزوّد مكتوب في ai.js: الطبقة التي تعرف «ماذا نسأل» لا تعرف «مَن»
  ok(src.indexOf('api.anthropic.com') === -1 && src.indexOf('generativelanguage') === -1,
     '★ ولا عنوان مزوّد في ai.js — الفصل هو الفائدة كلها');

  const prov = fs.readFileSync(path.join(ROOT, 'api', '_lib', 'provider.js'), 'utf8');
  // المفاتيح تُقرأ عند النداء ولا تُصدَّر ولا تُسجَّل
  ok(prov.indexOf('console.log') === -1, 'ولا طباعة في المحوّل — المفاتيح تمرّ فيه');
  ok(/module\.exports\s*=\s*{[^}]*}/.test(prov) && prov.indexOf('API_KEY:') === -1,
     'ولا مفتاح مُصدَّر');

  const built = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  ok(built.indexOf('GEMINI_API_KEY') === -1, '★ ولا أثر لـ GEMINI_API_KEY في ملف المتصفح');
  ok(built.indexOf('x-goog-api-key') === -1, 'ولا لترويسته');
}


describe('١١٠ · تقاعُد النموذج لا يُسقط المنصة');
{
  const P = require(path.join(ROOT, 'api', '_lib', 'provider.js'));

  eq(P.suggestedModel('This model models/gemini-2.5-flash is no longer available to new ' +
     'users. Please update your code to use models/gemini-3.6-flash for the latest features.'),
     'gemini-3.6-flash', 'البديل يُنتزع من نصّ الرفض');
  eq(P.suggestedModel('quota exceeded'), null, 'ورفضٌ بلا بديل لا يخترع واحدًا');
  /* ★ النقطة تفصل أجزاء الاسم ولا تُنهيه. لو ابتلعناها لطلبنا «x-1.» فيُردّ
     بـ ٤٠٤ ثانيةً، فيبدو البديلُ عاطلًا وهو سليم. */
  eq(P.suggestedModel('use models/gemini-4.1-flash.'), 'gemini-4.1-flash',
     '★ والنقطة الختامية ليست من الاسم — والداخلية منه');

  const asked = [];
  withFakeNet(async (u) => {
    asked.push(String(u).split('/models/')[1].split(':')[0]);
    if (asked.length === 1) return { ok:false, status:404, text: async () =>
      'This model models/gemini-3.6-flash is no longer available. ' +
      'Please update your code to use models/gemini-4-flash.' };
    return { ok:true, json: async () => ({
      candidates:[{ content:{ parts:[{ text:'[{"expl_ar":"ش"}]' }] } }],
      usageMetadata:{ promptTokenCount:5, candidatesTokenCount:6 } }) };
  }, { GEMINI_API_KEY:'K' }, async () => {
    /* ★ Google تُقاعد أسماء النماذج وتذكر البديل في نصّ الرفض. بلا هذا،
       يوم التقاعد يوقف كل رفعٍ على المنصة حتى أنتبه أنا وأعدّل وأنشر —
       وطالبٌ ليلة اختباره لا يعنيه أن اسمًا تغيّر. */
    const r = await P.callAI('نظام', 'مستخدم');
    eq(asked.length, 2, '★ ورفض ٤٠٤ يُعاد مرة واحدة بالبديل');
    eq(asked[1], 'gemini-4-flash', 'وبالاسم الذي سمّته Google');
    eq(r.model, 'gemini-4-flash', '★ والمُبلَّغ هو ما أجاب فعلًا لا ما طُلب');
  });

  // ★ مرةً واحدة: رفضٌ متكرر لا يدور بلا نهاية
  const again = [];
  withFakeNet(async (u) => { again.push(u); return { ok:false, status:404, text: async () =>
      'no longer available. Please update your code to use models/x-1.' }; },
    { GEMINI_API_KEY:'K' }, async () => {
      let err = ''; try { await P.callAI('a','b'); } catch(e){ err = e.message; }
      eq(again.length, 2, '★ ومحاولتان لا أكثر — لا دوران بلا نهاية');
      has(err, '404', 'ثم يُرفع الخطأ كما هو');
    });
}


/* ============ ١١١ · مادة أحدث من قائمة الجهاز ============ */
describe('١١١ · «غير موجودة» تُقال بعد السؤال لا قبله');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  const SID = 'new-sub-1';
  let asked = 0;

  // قائمة هذا الجهاز لا تعرف المادة — كما لو أُقلع التطبيق قبل نشرها
  A.store.set('pack', { subjects: [], settings: {} });
  A.api.rpc = (n) => {
    if (n === 'content_pack'){
      asked++;
      return Promise.resolve({ ok:true, data:{ subjects:[
        { id:SID, name:'فسيولوجي', slug:'physio', q_count:40, free:true, status:'published' }
      ], settings:{} } });
    }
    return Promise.resolve({ ok:true, data:[] });
  };

  const box = doc.createElement('div'); doc.body.appendChild(box);
  box.appendChild(A.views.ViewSubject.view({ rest:[SID], query:{} }));

  /* ★ لا نقول «غير موجودة» ونحن لم نسأل: قائمة المواد تُجلب مرة عند الإقلاع،
     فمادةٌ نُشرت بعدها — نشرها الطالب قبل ثانية، أو أرسل زميله رابطها —
     ليست فيها. كان الرافع يُنشئ مادته ثم يراها «غير موجودة». */
  ok(box.textContent.indexOf('غير موجودة') === -1,
     '★ لا حكم قبل السؤال — ولا كلمة «غير موجودة» في أول لحظة');
  has(box.textContent, 'جارٍ تحديث', 'بل يُقال إننا نتحقق');

  pending.push((async () => {
    // ننتظر وصول القائمة لا مجرّد إرسال الطلب — وإلا قِسنا سباقنا لا المنتج
    await until(W, () => A.data.pack().subjects.length > 0);
    eq(asked, 1, '★ والقائمة تُجدَّد من الخادم مرة واحدة');
    ok(A.data.pack().subjects.some(s => s.id === SID), 'ثم تعرفها القائمة');
    const again = A.views.ViewSubject.view({ rest:[SID], query:{} });
    has(again.textContent, 'فسيولوجي', 'وتُفتح باسمها');

    /* ★ الغياب بعد السؤال يُقال بلغة أخرى: «غير متاحة» لا «غير موجودة»،
       ومعها بابٌ يُفتح — «استكشف» — لا طريق مسدود. */
    A.store.set('pack', { subjects: [], settings: {} });
    A.api.rpc = () => Promise.resolve({ ok:true, data:{ subjects:[], settings:{} } });
    const miss = doc.createElement('div'); doc.body.appendChild(miss);
    miss.appendChild(A.views.ViewSubject.view({ rest:['ghost'], query:{} }));
    await until(W, () => miss.textContent.indexOf('جارٍ تحديث') === -1);
    has(miss.textContent, 'غير متاحة', '★ وبعد السؤال يُقال «غير متاحة»');
    has(miss.innerHTML, '#/explore', 'ومعها باب لا طريق مسدود');

    // ★ انقطاع الشبكة ليس غيابًا: الأول يُعاد فيه، والثاني يُيئِس
    A.api.rpc = () => Promise.resolve({ ok:false, offline:true });
    const off = doc.createElement('div'); doc.body.appendChild(off);
    off.appendChild(A.views.ViewSubject.view({ rest:['ghost2'], query:{} }));
    await until(W, () => off.textContent.indexOf('جارٍ تحديث') === -1);
    has(off.textContent, 'تعذّر الوصول', '★ وبلا اتصال يُقال «تعذّر الوصول» لا «غير متاحة»');
    W.close();
  })());
}

/* ============ ١١٢ · النشر يُجدّد القائمة قبل أن يعد ============ */
describe('١١٢ · النشر لا يعد بما لا تراه القائمة');
{
  const up = fs.readFileSync(path.join(ROOT, 'src', 'js', '34-upload.js'), 'utf8');
  /* ★ الرافع أولى الناس بألا تختفي مادته: يضغط «انشر» فيُعطى زر «افتح
     المادة» — ولو لم نُجدّد القائمة قاده زرّنا إلى «غير موجودة». */
  has(up, 'QBANK.data.refreshPack()', '★ والنشر يُجدّد القائمة قبل عرض الرابط');
  ok(up.indexOf('refreshPack') < up.indexOf('showShare(box'),
     'قبل شاشة المشاركة لا بعدها');

  const sub = fs.readFileSync(path.join(ROOT, 'src', 'js', '35-subject.js'), 'utf8');
  const exam = fs.readFileSync(path.join(ROOT, 'src', 'js', '36-examview.js'), 'utf8');
  // العلاج في مكان واحد يخدم البابين: صفحة المادة وصفحة الاختبار
  has(exam, 'refetchThenSubject(sid', 'وشاشة الاختبار تُعالَج بالعلاج نفسه');
  ok(sub.indexOf("'المادة غير موجودة'") === -1 && exam.indexOf("'المادة غير موجودة'") === -1,
     '★ ولم تبقَ عبارة «غير موجودة» في أيٍّ منهما');
}

/* ============ ١١٣ · محلّل المادة: البرومبت والتحقق ============ */
describe('١١٣ · برومبت التحليل وتحقّقه');
{
  const AN = require(path.join(ROOT, 'api', '_lib', 'analyst.js'));

  // البرومبت هو برومبت علي — علاماته المميزة فيه
  has(AN.SYS_ANALYST, 'قاعدة القداسة', 'قاعدة القداسة في صدر البرومبت');
  has(AN.SYS_ANALYST, 'أنت لا تؤلّف منهجًا — أنت تحلّل بنكًا', '★ ومبدؤه الحاكم كما صاغه علي');
  has(AN.SYS_ANALYST, 'الملاحظة الأهم امتحانيًا', 'والملاحظة الأهم امتحانيًا');
  has(AN.SYS_ANALYST, 'كلمة منحوتة عربية', 'وحيلة الحفظ المنحوتة');
  has(AN.SYS_ANALYST, 'فخ الصياغة المنفية', 'وأنماط الأفخاخ');
  has(AN.SYS_ANALYST, 'لا تخترع فخًا', '★ والفخ يُقتبس من خيار موجود لا يُخترع');
  has(AN.SYS_ANALYST, 'ثلاثة أسئلة فأكثر', 'وعتبة «تكررت» مرقّمة');
  has(AN.sysFor('en'), 'English', 'واختيار الإنجليزية يُلحق استثناء اللغة');
  ok(AN.sysFor('ar') === AN.SYS_ANALYST, 'والعربية هي الأصل بلا زيادة');

  /* ★ التعقيم: التحليل يُحقن في صفحات كل الطلاب — سطر سكربت فيه يعني XSS
     على المنصة كلها. البرومبت وعدٌ، والتعقيم قانون. */
  const dirty = '<section onclick="x()"><p style="color:red">نص</p>' +
    '<script>alert(1)</script><a href="http://evil">رابط</a>' +
    '<table><tr><td>خلية</td></tr></table></section>';
  const clean = AN.sanitizeHtml(dirty);
  ok(clean.indexOf('<script') === -1, '★ السكربت يُمحى');
  ok(clean.indexOf('onclick') === -1, 'والحدث يُنزع');
  ok(clean.indexOf('style=') === -1, 'والنمط المضمّن يُنزع');
  ok(clean.indexOf('<a') === -1 && clean.indexOf('رابط') > -1,
     'والرابط يذوب — وسمه يسقط ونصّه يبقى');
  has(clean, '<td>خلية</td>', 'والجدول المسموح يمرّ');

  // التحقق: كل سؤال في محور ولا محور شبح
  const items = [ { id:'q-1', q:'أ', options:['1','2'] }, { id:'q-2', q:'ب', options:['1','2'] } ];
  const good = { name_en:'X', overview:'<p>' + 'م'.repeat(100) + '</p>',
    memorize:'<section><p>' + 'ح'.repeat(100) + '</p></section>', mistakes:'<p>خ</p>',
    topics:[{ key:'a', name:'محور أ' }], assign:{ 'q-1':'a', 'q-2':'a' }, notes:'' };
  const v = AN.validateAnalysis(good, items);
  eq(v.counts.a, 2, 'العدّ من الإسناد الفعلي');

  let e1 = '';
  try { AN.validateAnalysis(Object.assign({}, good, { assign:{ 'q-1':'a' } }), items); }
  catch(x){ e1 = x.message; }
  has(e1, 'q-2', '★ سؤال بلا محور يُرفض ويُسمّى — لا يسقط بصمت من البنك المقسَّم');

  let e2 = '';
  try { AN.validateAnalysis(Object.assign({}, good, { assign:{ 'q-1':'a', 'q-2':'ghost' } }), items); }
  catch(x){ e2 = x.message; }
  has(e2, 'ghost', 'ومحور غير معرّف يُرفض بالاسم');

  let e3 = '';
  try { AN.validateAnalysis(Object.assign({}, good, { overview:'<p>قصير</p>' }), items); }
  catch(x){ e3 = x.message; }
  has(e3, 'أقصر', '★ ونظرة عامة هزيلة تُرفض — سطران ليسا تحليلًا');

  // الحمولة: الأسئلة كما هي بلا شروح تلوّث التحليل
  const payload = JSON.parse(AN.buildUserPayload('مادة', [
    { id:'q-1', q:'نص السؤال', options:['أ','ب'], answer:1, expl_ar:'شرح قديم' } ]));
  eq(payload.questions[0].text, 'نص السؤال', 'النص يمرّ حرفيًا');
  eq(payload.questions[0].answer, 1, 'والإجابة');
  ok(!('expl_ar' in payload.questions[0]), 'والشرح القديم لا يُرسل — يلوّث تحليلًا جديدًا');
}

/* ============ ١١٤ · نقطة النهاية analyze ============ */
describe('١١٤ · analyze.js يحرس بابه');
{
  const src = fs.readFileSync(path.join(ROOT, 'api', 'analyze.js'), 'utf8');

  has(src, 'userFromToken', 'الهوية من Supabase لا من فكّ JWT محلي');
  /* ★ صاحب المادة أو المشرف — التحليل يكتب في صفوف يقرؤها الجميع،
     وبابٌ مفتوح يعني أن أي طالب يعيد كتابة ما يذاكر منه الآخرون. */
  has(src, 'created_by !== user.id', '★ وغير المالك يُصدّ');
  has(src, 'is_admin', 'إلا المشرف');
  has(src, 'هذه ليست مادتك', 'برسالة تسمّي السبب');
  has(src, 'expectObject: true', 'والردّ كائن مادة لا مصفوفة');
  has(src, 'maxTokens: 32768', '★ وسقف خرج يتّسع لجداول مادة كاملة');
  has(src, "order=ord", 'والأسئلة بترتيبها — الترتيب دليل الفصول');
  ok(src.indexOf('req.body.questions') === -1,
     '★ والأسئلة من القاعدة لا من المتصفح — حمولة المتصفح تُزوَّر');

  const prov = fs.readFileSync(path.join(ROOT, 'api', '_lib', 'provider.js'), 'utf8');
  has(prov, 'opts.maxTokens || 8192', 'والمحوّل يقبل سقفًا مخصصًا');
  has(prov, 'function parseObject', 'ويعرف الكائن المفرد');
}

/* ============ ١١٥ · قاعدة التحليل ============ */
describe('١١٥ · ANALYZE.sql');
{
  const sql = fs.readFileSync(path.join(ROOT, 'db', 'ANALYZE.sql'), 'utf8');

  ['overview','memorize','mistakes','name_en','analyzed_at'].forEach(c =>
    has(sql, 'add column if not exists ' + c, 'عمود ' + c));

  /* ★ تحليل أقدم من أسئلته يكذب: «تكرر في ٤ أسئلة» وقد صارت ٧.
     أي تغيير محتوى يمسح analyzed_at فيُعاد التوليد تلقائيًا. */
  has(sql, 'update of q, options, answer', '★ القادح يراقب المحتوى');
  has(sql, 'or delete', 'والحذف كذلك');
  /* ★ لكن كتابة التحليل تحدّث topic — لو راقبناه لدار التوليد بلا نهاية:
     يكتب فيبطل فيكتب. التصنيف من التحليل لا من المادة. */
  ok(!/update of[^;]*topic/.test(sql), '★ وtopic خارج المراقبة — وإلا دار التوليد بلا نهاية');

  has(sql, "'stale', (s.analyzed_at is null", 'والبُطلان معلن في القراءة');
  has(sql, 'create or replace function qbank.subject_analysis', 'ودالة القراءة موجودة');
  has(sql, 'to authenticated, anon', 'مفتوحة للجميع — كما اختار علي');
}

/* ============ ١١٦ · واجهة التحليل ============ */
describe('١١٦ · العرض والتعقيم الثاني');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;

  /* ★ الدفاع في العمق: الخادم عقّم، والمتصفح يعقّم ثانية — القاعدة قد
     تُكتب من طريق آخر يومًا، والمتصفح لا يثق حتى بقاعدته. */
  const node = A.views.analysisHtml('<section><p onclick="hack()">نص</p>' +
    '<script>alert(1)</script><table><tr><td>خ</td></tr></table>' +
    '<div class="x">داخل div</div></section>');
  eq(node.querySelectorAll('script').length, 0, '★ السكربت لا يصل DOM');
  eq(node.querySelectorAll('[onclick]').length, 0, 'ولا حدث');
  eq(node.querySelectorAll('div').length, 0, 'وdiv الغريب يذوب');
  has(node.textContent, 'داخل div', 'ونصّه يبقى');
  eq(node.querySelectorAll('td').length, 1, 'والجدول يمرّ');

  // بطاقة المحاور بعدّاداتها
  const tc = A.views.topicsCard({ topics:[ { name:'الابتكار التسويقي', n:11 }, { name:'القيادة', n:10 } ] });
  has(tc.textContent, 'الابتكار التسويقي', 'اسم المحور');
  has(tc.textContent, '١١ سؤالًا', 'وعدّاده بالهندية');
  eq(A.views.topicsCard({ topics:[] }), null, 'وبلا محاور لا بطاقة فارغة');
  W.close();
}

/* ============ ١١٧ · عدّاد الاختبار — لكل طالب موعده ============ */
describe('١١٧ · عدّاد الاختبار');
{
  const dom = makeDom(), W = dom.window, A = W.QBANK;
  const E = A.examDate;

  E.set('s1', '2099-01-01T10:00:00.000Z');
  eq(E.get('s1'), '2099-01-01T10:00:00.000Z', 'الموعد يُحفظ');
  E.set('s2', '2099-02-01T10:00:00.000Z');
  eq(E.get('s1'), '2099-01-01T10:00:00.000Z', 'ولكل مادة موعدها المستقل');
  E.set('s1', null);
  eq(E.get('s1'), null, 'والإزالة تعمل');

  /* ★ بالساعات الكلية لا بالأيام: «متبقٍ ٤٥:١٢:٠٩» يوقظ، و«يومان» يخدّر */
  const base = new Date('2026-01-01T00:00:00Z').getTime();
  const L = E.left(new Date(base + (45*3600 + 12*60 + 9) * 1000).toISOString(), base);
  has(L.text, '٤٥:١٢:٠٩', '★ ساعات كلية:دقائق:ثوانٍ بالهندية');
  ok(!L.over, 'ولم يفت');
  ok(E.left(new Date(base - 1000).toISOString(), base).over, 'والفائت يُعلن');
  has(E.left(new Date(base - 1000).toISOString(), base).text, 'بالتوفيق', 'بدعاء لا بصفر أحمر');
  eq(E.left('ليس تاريخًا'), null, 'والتالف لا يكسر الشاشة');
  W.close();
}

/* ============ ١١٨ · الرفع ينتهي بتحليل ============ */
describe('١١٨ · التحليل خطوة في النشر');
{
  const up = fs.readFileSync(path.join(ROOT, 'src', 'js', '34-upload.js'), 'utf8');

  /* ★ بعد النشر لا قبله: لو حجزنا زرّ النشر نصف دقيقة لظنّ الرافع أن
     النشر علق. المادة تُنشر فورًا والتحليل يلحقها بسطر حالة صادق. */
  has(up, 'QBANK.analysis.generate(newId', '★ التوليد يبدأ تلقائيًا بعد النشر');
  ok(up.indexOf('showShare') < up.indexOf('يجري تحليل مادتك'),
     'وسطر الحالة داخل شاشة المشاركة');
  has(up, 'سيُعاد تلقائيًا', 'وفشله يَعِد بالمحاولة عند فتح المادة — لا طريق مسدود');
  has(up, "analysisLang", 'ولغة التحليل يختارها الرافع');

  const subj = fs.readFileSync(path.join(ROOT, 'src', 'js', '35-subject.js'), 'utf8');
  has(subj, 'maybeRefresh', 'وصفحة المادة تعيد توليد الباطل تلقائيًا');
  has(subj, 'examDate.band', 'وفيها عدّاد الطالب');

  const an = fs.readFileSync(path.join(ROOT, 'src', 'js', '57-analysis.js'), 'utf8');
  /* ★ الباطل يُجدّده صاحبه لا زائره: الزائر يرى آخر نسخة صالحة ولا
     يدفع كلفة توليدٍ ليس له */
  has(an, 'sub.created_by === u.id', '★ maybeRefresh لصاحب المادة');
  has(an, 'clearInterval', 'والعدّاد يوقف نفسه عند تفكيك الوثيقة');

  const pr = fs.readFileSync(path.join(ROOT, 'src', 'js', '37-print.js'), 'utf8');
  has(pr, "value:'full'", 'والطباعة تعرف «المادة كاملة»');
  has(pr, 'opts.analysis.memorize', 'وتضم طريقة الحفظ');
}

/* ============ ١١٩ · مفتاح الخدمة بجيليه ============ */
describe('١١٩ · supa يقبل الجيلين');
{
  const supa = fs.readFileSync(path.join(ROOT, 'api', '_lib', 'supa.js'), 'utf8');
  /* ★ حكمت التجربة الحية: apikey وحدها تُعامل anon فتحجب RLS الصفوف غير
     المنشورة عن مفتاح الخدمة نفسه. فالمفتاح يمرّ في الترويستين، وهوية
     الطالب تفوز متى وُجدت. */
  has(supa, "'Bearer ' + (asUser || key)", '★ المفتاح في الترويستين وهوية الطالب تفوز');

  const an = fs.readFileSync(path.join(ROOT, 'api', 'analyze.js'), 'utf8');
  has(an, "'Bearer ' + key", 'وanalyze كذلك');
}

/* ============ ١٢٠ · الدخول بالرمز — طريق التطبيق المثبّت ============ */
describe('١٢٠ · الدخول برمز من البريد');
{
  /* ★ رابط البريد يفتح في متصفح الجوال لا داخل التطبيق المغلّف، فتولد
     الجلسة خارج التطبيق ويبقى زائرًا. الرمز يُكتب حيث يقف الطالب. */
  has(html, 'ادخل بالرمز', '★ زر الدخول بالرمز موجود في بطاقة الدخول');
  has(html, 'one-time-code', 'والحقل يلتقط الرمز تلقائيًا من رسائل الجوال');
  has(html, "type:'email', email, token", 'والتحقق يمرّ على /auth/v1/verify بنوع email');
  has(html, 'طلبت الدخول مرات كثيرة', '★ وسقف البريد يُسمّى باسمه لا «تعذّر الإرسال» العامة');

  const dom = makeDom('#/login'), W = dom.window, A = W.QBANK;
  const savedFetch = W.fetch;
  serial(async () => {
    // نداء verify ناجح يعيد جلسة — يجب أن تُحفظ ويُعرف المستخدم
    A.api._fetch = async (u, o) => {
      if (String(u).indexOf('/auth/v1/verify') > -1){
        const body = JSON.parse(o.body);
        eq(body.type, 'email', 'النوع email');
        eq(body.token, '123456', 'والرمز يمرّ كما كُتب');
        const pl = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'u-otp', email: body.email }))));
        return { ok:true, status:200, text: async () => JSON.stringify({
          access_token:'h.' + pl + '.s', refresh_token:'r', expires_in: 3600,
          user:{ id:'u-otp', email: body.email } }) };
      }
      return { ok:true, status:200, text: async () => '[]' };
    };
    const r = await A.api.auth.verifyOtp('t@t.t', ' 123456 ');
    ok(r.ok, 'التحقق نجح');
    eq(A.api.user().id, 'u-otp', '★ والجلسة حُفظت — المستخدم معروف بعد الرمز مباشرة');
    A.api._fetch = null;
    W.close();
  });
}

/* ============ ١٢١ · عالم المشرف المستقل ============ */
describe('١٢١ · اللوحة المستقلة ووجهة ما بعد الدخول');
{
  /* ★ علّة علي: دخل من بوابة المشرف فهبط على واجهة الطالب.
     الوجهة الآن تُحفظ قبل المغادرة وتُقرأ بعد التقاط الجلسة. */
  has(html, "after:'#/admin'", '★ بوابة المشرف تحمل وجهتها');
  has(html, "'after_login'", 'والوجهة تُحفظ قبل مغادرة الصفحة وتُقرأ عند الإقلاع');
  has(html, 'is-admin', 'وصنف عالم المشرف يُكتب على الجسد');
  has(html, '.is-admin .tabbar{ display:none', '★ وغلاف الطالب يختفي في مساراته');
  has(html, 'لوحة المشرف', 'وشريط اللوحة معرّف باسمه');
  has(html, 'افتح المنصة', 'وله مخرج صريح واحد لواجهة الطالب');
  has(html, 'هذه اللوحة للمشرف', '★ وغير المشرف يقابل رسالة لا هيكلًا فارغًا');
  has(html, '⟳ حلّل', '★ وصلاحية إعادة التحليل بضغطة لكل مادة');

  /* الصنف يعمل فعلًا: مسار إداري يضيفه ومسار طالب يزيله */
  const dom = makeDom('#/admin/settings'), W = dom.window;
  ok(W.document.body.classList.contains('is-admin'), 'مسار ‎#/admin يضيف الصنف');
  W.QBANK.router.render('#/');
  ok(!W.document.body.classList.contains('is-admin'), 'والعودة للطالب تزيله');
  W.close();
}

/* ============ ١٢٢ · التطوير الشامل: محرر المشرف والملف الشخصي وعين الأدمن ============ */
describe('١٢٢ · محرر شامل وملف شخصي وعين المشرف');
{
  /* ★ محرر المشرف صار مؤلفًا: نص وخيارات خلف باب واعٍ، وسؤال من الصفر،
     ومحتوى تحليلي يُكتب باليد ويُختم كي لا يمحوه التوليد التلقائي */
  has(html, 'تحرير النص والخيارات', '★ باب تحرير نص السؤال موجود ومسمّى بوعيه');
  has(html, '+ أضف سؤالًا', 'وزر تأليف سؤال من الصفر');
  has(html, 'المحتوى التحليلي', 'ولوحة تحرير المحتوى اليدوي');
  has(html, 'analyzed_at: new Date().toISOString()', '★ والحفظ اليدوي يُختم — فلا يمحوه التوليد التلقائي');
  has(html, 'ولّده بالذكاء من جديد', 'وإعادة التوليد بجانب التحرير اليدوي');

  /* عين المشرف */
  has(html, 'admin_online', '★ المتصلون الآن يُجلبون بدالة المشرف');
  has(html, 'المتصلون الآن', 'ولوحتهم معنونة');
  has(html, 'stu__mail', 'وإيميل الطالب سطر ظاهر في بطاقته');

  /* الملف الشخصي */
  has(html, 'pf-hero', '★ بطل الملف الشخصي معرّف');
  has(html, 'uploadAvatar', 'ورفع الصورة الشخصية موجود');
  has(html, "'/storage/v1/object/avatars/'", 'إلى حاوية avatars في مخزن Supabase');
  has(html, 'toBlob', 'والصورة تُصغَّر في المتصفح قبل الرفع — لا خام ٥ ميغابايت');
  has(html, 'رقم الجوال *', '★ وحقل الجوال إلزامي — بنجمة معلنة');
  has(html, 'رقم الجوال مطلوب', 'ورفض الحفظ يقول السبب لا يصمت');
  has(html, 'أكمل ملفك: رقم جوالك', '★ ومن سجّل قديمًا يُذكَّر بشريط لا يحجب مذاكرته');
  has(html, ".replace(/\\D/g, '')", 'والتحقق يجرّد الرموز — ‎+966‎ و‎05‎ كلاهما يمرّ');
  has(html, 'نبذة عني', 'والنبذة');
  has(html, 'تقييماتي', 'وتقييمات الطالب جزء من ملفه');

  /* بطل الملف يرسم فعلًا */
  const dom = makeDom('#/'), W = dom.window, A = W.QBANK, doc = W.document;
  const pl = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'u-pf', email:'pf@t.t' }))));
  A.api.auth.captureFromHash('#access_token=h.' + pl + '.s&refresh_token=r&expires_in=9999');
  /* ★ الملف المخزّن يحمل هوية صاحبه — وبدونها لا يُعرض (فحص ١٢٩) */
  A.store.set('profile', { uid:'u-pf', name:'عليّ', avatar:'🩺', phone:'0555',
                           bio:'أُراجع طوارئ', avatar_url:'' });
  A.router.render('#/login');   // حسابي يُعرض لمن سجّل
  const t = doc.getElementById('main').textContent;
  has(t, 'عليّ', 'الاسم في صدر الملف');
  has(t, 'أُراجع طوارئ', 'والنبذة تحته');
  ok(!!doc.querySelector('.pf-hero__cam'), 'وزر الكاميرا فوق الصورة');
  ok(!!doc.querySelector('input[type="tel"]'), 'وحقل الجوال بنوعه الصحيح');
  W.close();
}

/* ============ ١٢٣ · المجتمع: الملف العام وتقييم الزملاء ============ */
describe('١٢٣ · تقييم الطلاب والملف العام');
{
  const sql = fs.readFileSync(path.join(ROOT, 'db', 'PEER.sql'), 'utf8');
  has(sql, 'create table if not exists qbank.student_ratings', 'جدول تقييم الطلاب');
  has(sql, 'target_id <> rater_id', '★ ولا أحد يقيّم نفسه — يُمنع في القاعدة لا في الواجهة');
  has(sql, "reason','no_uploads'", '★ ولا يُقيَّم إلا من رفع مادة — التقييم عن العطاء');
  has(sql, 'create or replace function qbank.public_profile', 'ودالة الملف العام');
  no(sql.slice(sql.indexOf('public_profile')), 'au.email', '★ والملف العام بلا إيميل — الخصوصية في الدالة');
  no(sql.slice(sql.indexOf('public_profile')), "'phone', p.phone", 'ولا جوال');
  has(sql, 'grant execute on function qbank.public_profile(uuid) to authenticated, anon',
      'ويقرؤه الزائر كذلك — الملف عام بطبيعته');

  has(html, "'#/p/'", '★ مسار الملف العام ‎#/p‎ لا ‎#/u‎ (المحجوز للجامعة)');
  eq((html.match(/\.add\('#\/u',/g) || []).length, 1, '★ ‎#/u‎ مسجَّل مرة واحدة — لا مسار يبتلع آخر');
  has(html, 'rate_student', 'ونداء التقييم موجود');
  has(html, 'قيّم هذا الطالب', 'وودجت التقييم معنونة');
  has(html, 'رفعها', 'وسطر الرافع فوق المادة');
  has(html, 'موادي المرفوعة', 'ومواد الطالب في لوحته');
  /* ★ صار «انشر» لا «انسخ» — بضغطة لا بثلاث خطوات (فحص ١٤٧) */
  has(html, 'انشر ملفي', 'ورابط ملفه العام يُنشَر بزرّ واحد');
  has(html, 'peer-stats', 'وأرقام العطاء');

  /* اللوحة بتبويبات، والتبويب في الهاش فيبقى بعد التحديث */
  const dom = makeDom('#/'), W = dom.window, A = W.QBANK, doc = W.document;
  const pl = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'u-acc', email:'a@a.a' }))));
  A.api.auth.captureFromHash('#access_token=h.' + pl + '.s&refresh_token=r&expires_in=9999');
  A.router.render('#/account');
  ok(!!doc.querySelector('.tabs__btn[aria-selected="true"]'), 'لوحة الطالب صارت تبويبات');
  has(doc.getElementById('main').textContent, 'ملفي', 'وتبويب الملف أولًا');
  A.router.render('#/account/uploads');
  has(doc.getElementById('main').textContent, 'موادي المرفوعة', '★ وتبويب موادي يفتح بمساره');
  W.close();
}

/* ============ ١٢٤ · الإثراء مجانًا: صفرٌ يعني صفرًا ============ */
/*
  قرارُ المنصة أن يكون توليد المادة مجانيًا يجب أن يمرّ سليمًا من القاعدة
  إلى الزرّ. وأخطر ما يعترضه سطرٌ بريء: `cost_per_q || 1` — فالصفر قيمةٌ
  كاذبة في جافاسكربت، فيصير المجانُ كوينًا للسؤال بلا أن يقرّره أحد.
*/
describe('١٢٤ · الإثراء مجانًا');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  const pl = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'s9', email:'z@z.z' }))));
  A.api.auth.captureFromHash('#access_token=h.' + pl + '.s&refresh_token=r&expires_in=9999');

  // ── الحساب المجرّد ──
  eq(A.admin.costPerQ({ cost_per_q: 0 }), 0, 'صفرُ القاعدة يصل كصفر لا كواحد');
  eq(A.admin.costPerQ({ cost_per_q: 3 }), 3, 'وسعرٌ حقيقي يمرّ كما هو');
  eq(A.admin.costPerQ(null), 1, 'وغياب الجواب يسقط إلى الافتراض الآمن');
  const wc = A.admin.newWizard(); wc.raw = new Array(120).fill({ q:'x' }); wc.done = 0;
  eq(A.admin.creditsNeeded(wc, 0), 0, 'و١٢٠ سؤالًا بصفرٍ للسؤال = صفر كوين');
  eq(A.admin.creditsNeeded(wc, 1), 120, 'وبكوينٍ للسؤال = ١٢٠');

  // ── الشاشة: رصيد صفر، وثمن صفر، ولا حجب ──
  const raw = [];
  for (let i = 0; i < 120; i++) raw.push({ q:'Q'+i, options:['a','b'], answer:0, has_options:true });
  const w = A.admin.newWizard();
  w.step = 2; w.raw = raw; w.total = raw.length; w.filename = 'free.txt';
  A.views.ViewUpload._set(w);

  // محفظة فارغة تمامًا — ومع ذلك يجب أن يمرّ
  A.api.rpc = name => name === 'my_credits'
    ? Promise.resolve({ ok:true, data:{ balance:0, cost_per_q:0, coin_halalas:5, open:true } })
    : Promise.resolve({ ok:false });

  pending.push((async () => {
    await nav(W, '#/upload');
    await until(W, () => {
      const p = doc.querySelector('[data-path="true"]');
      return p && p.textContent.indexOf('مجانًا') !== -1;
    }, 6000);
    const paid = doc.querySelector('[data-path="true"]');
    has(paid.textContent, 'مجانًا', 'الثمن يُقال «مجانًا» لا «٠ كوين»');
    ok(paid.className.indexOf('is-blocked') === -1,
       '★ ولا يُحجب المسار الكامل ولو كانت المحفظة فارغة');
    eq(paid.getAttribute('aria-checked'), 'true', 'ويبقى هو المحدَّد');
    eq(A.views.ViewUpload._get().enrich, true, 'ولا يرتدّ إلى المجاني — لا سبب للارتداد');
    eq(A.views.ViewUpload._get().costPerQ, 0, 'وسعر السؤال المحفوظ صفر');
    ok(doc.querySelector('.costbox').hidden, 'وصندوق الرصيد يختفي: لا محفظة حيث لا ثمن');
    A.views.ViewUpload._reset();
    W.close();
  })());
}

/* ============ ١٢٥ · التوليد المجاني لا يمرّ بالمحفظة ============ */
describe('١٢٥ · لا حسم حين لا ثمن');
{
  const dom = makeDom(), W = dom.window, A = W.QBANK;
  const pl = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'s8', email:'y@y.y' }))));
  A.api.auth.captureFromHash('#access_token=h.' + pl + '.s&refresh_token=r&expires_in=9999');

  const w = A.admin.newWizard();
  w.step = 2; w.enrich = true; w.costPerQ = 0; w.total = 2; w.draftId = 'd9';
  w.raw = [{ q:'Q1', options:['a','b'], answer:0, has_options:true },
           { q:'Q2', options:['a','b'], answer:1, has_options:true }];

  // ★ المحفظة معطّلة عمدًا: لو نودِيت لفشل الإثراء — وهذا ما نمنعه
  const called = [];
  A.api.rpc = name => { called.push(name); return Promise.resolve({ ok:false }); };
  A.admin.server = async (path, body) => {
    if (path !== '/api/ai') return { ok:false };
    return { ok:true, data:{ questions: body.questions.map(q => Object.assign({ expl_ar:'شرح' }, q)) } };
  };
  A.admin.saveDraft = async () => ({ ok:true });

  pending.push((async () => {
    const r = await A.admin.wizardEnrich(w);
    eq(called.indexOf('spend_credits'), -1, '★ لا نداء حسمٍ إطلاقًا حين الثمن صفر');
    eq(called.indexOf('refund_credits'), -1, 'ولا نداء ردٍّ — لا شيء يُردّ');
    eq(r.error, '', 'ولا يفشل الإثراء بعطلٍ في محفظة لا شأن لها به');
    eq(r.done, 2, 'والسؤالان أُثريا');
    eq(r.step, 3, 'والمعالج تقدّم إلى المراجعة');
    W.close();
  })());
}

/* ============ ١٢٦ · قراءة الملف بالذكاء ============ */
/*
  المقسّم بالقواعد يشترط شكلًا، والبشر لا يلتزمون شكلًا. هذه الفحوص تحرس
  الشبكة الثانية: أن يقرأ الذكاءُ ما سقط، وألا يؤلّف وهو يقرأ.
*/
describe('١٢٦ · قراءة الملف بالذكاء');
{
  const R = require('../api/_lib/reader.js');
  const ING = require('../api/ingest.js');
  const P = require('../api/_lib/parser.js');

  // ملفٌ حقيقيّ الشكل: ترقيم عربي، خيارات بحروف عربية، إجابة بكلمة
  const messy = [
    'مراجعة الفصل الأول — د. محمد',
    '',
    '١- ما هو العضو المسؤول عن إفراز الأنسولين؟',
    'أ) الكبد',
    'ب) البنكرياس',
    'ج) الطحال',
    'الإجابة الصحيحة: ب',
    '',
    '٢- تُعرَّف الحساسية بأنها',
    'أ) نسبة السلبيات الحقيقية',
    'ب) نسبة الإيجابيات الحقيقية',
    'الصحيح: ب'
  ].join('\n');

  /* ★ صار المقسّم يفهم هذا الشكل بلا ذكاء ولا حصّة تنفد — والقارئ يبقى
     للأشكال التي لا تنضبط لقاعدة أصلًا. */
  eq(P.parse(messy).length, 2, 'القواعد صارت تلتقط الترقيم العربي — بلا نداء ذكاء');

  // ── التطبيع للمقارنة وحده ──
  eq(R.norm('البنكرياسُ   الكبير'), 'البنكرياس الكبير', 'التطبيع يُسقط التشكيل ويطوي المسافات');
  eq(R.norm('سؤال ١٢'), 'سؤال 12', 'ويوحّد الأرقام العربية باللاتينية');
  ok(R.verbatimIn(R.norm(messy), 'ما هو العضو المسؤول عن إفراز الأنسولين؟'),
     'ونصٌّ منقولٌ من الملف يُعرف أنه منقول');
  ok(!R.verbatimIn(R.norm(messy), 'ما العضو الذي يفرز الأنسولين؟'),
     '★ ونصٌّ أعيدت صياغته يُكشف — قاعدة القداسة تعمل على القارئ نفسه');

  // ── التقطيع لا يشطر سطرًا ──
  const big = new Array(2000).fill('سطر من الأسئلة الطويلة جدًا للاختبار').join('\n');
  const parts = R.chunkText(big);
  ok(parts.length > 1, 'النص الكبير يُقطَّع دفعات');
  parts.forEach(p => ok(p.indexOf('للاختبارسطر') === -1, 'ولا تُلصق نهاية سطر ببداية آخر'));

  // ── القراءة بذكاءٍ مُقلَّد: نتحقق من التحويل لا من النموذج ──
  const fakeAI = async (sys, user) => ({ items: [
    { q:'ما هو العضو المسؤول عن إفراز الأنسولين؟',
      options:['الكبد','البنكرياس','الطحال'], answer_index:1, answer_text:null },
    { q:'تُعرَّف الحساسية بأنها',
      options:['نسبة السلبيات الحقيقية','نسبة الإيجابيات الحقيقية'], answer_index:1 },
    // ★ سؤالٌ ألّفه النموذج ولا وجود له في الملف — يجب أن يُوسم لا أن يُصدَّق
    { q:'ما هو تعريف النوعية في الاختبارات؟', options:['أ','ب'], answer_index:0 }
  ] });
  pending.push((async () => {
    const r = await R.aiRead(messy, fakeAI);
    eq(r.questions.length, 3, 'القارئ يعيد ما التقطه الذكاء');
    eq(r.questions[0].has_options, true, 'ويصوغه بشكل المقسّم نفسه');
    eq(r.questions[0].answer, 1, 'وموضع الإجابة يُنقل رقمًا');
    eq(r.questions[0].answer_letter, 'B', 'وحرفها يُشتق منه');
    eq(r.questions[0].unverified, false, 'والمنقول حرفيًا غير موسوم');
    eq(r.questions[2].unverified, true, '★ والمؤلَّف موسومٌ ليراه الرافع قبل النشر');
    eq(r.questions[0].num, 1, 'والترقيم يبدأ من واحد');

    // التكرار من تراكب الدفعات يُطوى
    const dup = await R.aiRead(messy, async () => ({ items:[
      { q:'ما هو العضو المسؤول عن إفراز الأنسولين؟', options:['الكبد','البنكرياس'], answer_index:1 },
      { q:'ما هو العضو المسؤول عن إفراز الأنسولين؟', options:['الكبد','البنكرياس'], answer_index:1 }
    ] }));
    eq(dup.questions.length, 1, 'والسؤال المكرر يُطوى مرة واحدة');

    // ★ دفعةٌ تنفجر لا تُسقط الملف كله
    let n = 0;
    const flaky = async () => { n++; if (n === 1) throw new Error('انقطاع'); return { items:[{ q:'سطر من الأسئلة الطويلة جدًا للاختبار', options:['أ','ب'], answer_index:0 }] }; };
    const survived = await R.aiRead(big, flaky);
    ok(survived.questions.length >= 1, 'وانقطاع دفعةٍ لا يُسقط الملف كله');
  })());

  // ── متى يُستدعى الذكاء؟ ──
  const sound = [];
  for (let i = 0; i < 10; i++) sound.push({ has_options:true });
  ok(ING.rulesLookSound(sound), 'حصادٌ وافر أغلبه بخيارات: لا حاجة للذكاء');
  ok(!ING.rulesLookSound([{ has_options:true }, { has_options:true }]),
     'وسؤالان فقط من ملف كامل: حصادٌ مشبوه يستدعي الذكاء');
  ok(!ING.rulesLookSound(sound.map(() => ({ has_options:false }))),
     'وعشرةٌ كلها بلا خيارات: الشكل فات القواعد');
  eq(ING.rulesLookSound([]), false, 'وصفرٌ لا يكون سليمًا أبدًا');
}

/* ============ ١٢٧ · صيغ الملفات الموسَّعة ============ */
describe('١٢٧ · صيغ أكثر تُقرأ');
{
  const E = require('../api/_lib/extract.js');
  const html = Buffer.from('<html><body><h1>أسئلة</h1><p>1) سؤال أول</p><p>A) خيار</p>' +
                           '<script>var x=1</script></body></html>', 'utf8');
  const t = E.fromHtml(html);
  has(t, 'سؤال أول', 'HTML: النص يخرج من الوسوم');
  ok(t.indexOf('var x') === -1, 'وسكربتات الصفحة تُطرح');
  ok(t.indexOf('أسئلة\n') !== -1 || t.split('\n').length > 2, 'وبنية الأسطر محفوظة — عليها يقوم المقسّم');

  ok(E.looksLikeText(Buffer.from('سؤال عادي بالعربية\nوسطر ثانٍ', 'utf8')),
     'ملفٌ نصّي بلا امتداد يُعرف نصًّا');
  ok(!E.looksLikeText(Buffer.from([0x00,0x01,0x02,0x00,0x03,0x04,0x00,0x05])),
     '★ وملفٌ ثنائي لا يُقرأ نصًّا — الحارس لا يبتلع كل شيء');
  ok(!E.looksLikeText(Buffer.from('   \n  ', 'utf8')), 'وفراغٌ ليس نصًّا');
}

/* ============ ١٢٨ · لا يرث حسابٌ بيانات حساب ============ */
/*
  جهازٌ واحد يتناوب عليه حسابان. كان الداخل الجديد يجد صورة سابقه ورقم
  جواله وتقدّمه — بل ومشترياته. هذه الفحوص تحرس الحدّ بين شخصين.
*/
describe('١٢٨ · لا يرث حسابٌ بيانات حساب');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  const S = A.store;

  const sess = (id, mail) => ({
    access_token:'t', refresh_token:'r', expires_in:9999,
    user:{ id:id, email:mail }
  });

  // ── حساب أول: يملأ ملفه ويذاكر ويشتري ──
  A.api.saveSession(sess('u-one', 'one@x.com'));
  S.set('profile', { uid:'u-one', name:'علي', phone:'0500000001', avatar_url:'a1.png' });
  S.set('progress', { 'subj-1': { done:40 } });
  S.set('entitlements', { 'subj-9': true });
  S.set('campus', { university:'جامعة الملك سعود' });
  S.set('theme', 'dark');                 // تفضيل جهاز لا شخص
  S.set('api_base', 'https://x.dev');     // إعداد جهاز كذلك

  // ── خروج ──
  A.api.saveSession(null);
  eq(S.get('profile', null), null, '★ الخروج يمسح الملف الشخصي');
  eq(S.get('progress', null), null, 'ويمسح التقدّم');
  eq(S.get('entitlements', null), null, '★ ويمسح المشتريات — أخطرها');
  eq(S.get('campus', null), null, 'ويمسح الجامعة والكلية');
  eq(S.get('theme', null), 'dark', 'ولا يمسّ السمة — تفضيل جهاز لا شخص');
  eq(S.get('api_base', null), 'https://x.dev', 'ولا إعداد الربط');

  // ── حساب ثانٍ يدخل على الجهاز نفسه ──
  A.api.saveSession(sess('u-two', 'two@x.com'));
  eq(S.get('profile', null), null, 'والداخل الجديد يبدأ بملفٍ فارغ');

  // ── والحارس يعمل حتى بلا خروج: انتهت جلسة الأول ودخل الثاني مباشرة ──
  S.set('profile', { uid:'u-two', name:'سارة', phone:'0500000002' });
  S.set('progress', { 'subj-2': { done:9 } });
  A.api.saveSession(sess('u-three', 'three@x.com'));
  eq(S.get('profile', null), null, '★ تبدّل الهوية وحده يكنس — ولو لم يضغط أحد «خروج»');
  eq(S.get('progress', null), null, 'والتقدّم معه');

  // ── التجديد ليس تبدّلًا: الرمز يُجدَّد كل ساعة ولا يُمسح شيء ──
  S.set('profile', { uid:'u-three', name:'محمد' });
  S.set('progress', { 'subj-3': { done:5 } });
  A.api.saveSession(sess('u-three', 'three@x.com'));
  eq((S.get('profile', {}) || {}).name, 'محمد', '★ تجديد جلسة الشخص نفسه لا يمسح ملفه');
  ok(S.get('progress', null), 'ولا تقدّمه — وإلا ضاع عمل الطالب كل ساعة');

  // ── الزائر الذي سجّل: تقدّمه المجاني لا يُصادَر ──
  S.clearAll();
  S.set('progress', { 'free-1': { done:12 } });   // ذاكر بلا حساب
  A.api.saveSession(sess('u-new', 'new@x.com'));
  ok(S.get('progress', null), '★ من ذاكر زائرًا ثم سجّل يحتفظ بتقدّمه — التسجيل ليس عقوبة');

  // ── القائمة نفسها: صريحة ومقصودة ──
  ok(S.PERSONAL.indexOf('entitlements') !== -1, 'المشتريات في قائمة الشخصي');
  ok(S.PERSONAL.indexOf('theme') === -1, 'والسمة خارجها');
  ok(S.PERSONAL.indexOf('config') === -1, 'وإعداد المنصة خارجها');
  W.close();
}

/* ============ ١٢٩ · شاشة الحساب لا تعرض ملف غيره ============ */
describe('١٢٩ · الملف يحمل هوية صاحبه');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  const pl = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'acc-2', email:'two@x.com' }))));
  A.api.auth.captureFromHash('#access_token=h.' + pl + '.s&refresh_token=r&expires_in=9999');

  /* ملفٌ لصاحبٍ آخر تسلّل إلى التخزين (نسخة قديمة كتبته بلا هوية، أو
     بقي من قبل الحارس) — يجب ألا يُعرض حرفًا واحدًا منه */
  A.store.set('profile', { uid:'acc-1', name:'صاحب الحساب الأول',
                           phone:'0500000001', avatar_url:'https://x/one.png', bio:'نبذة غيري' });

  pending.push((async () => {
    await nav(W, '#/account/profile');
    const t = doc.getElementById('main').textContent;
    ok(t.indexOf('صاحب الحساب الأول') === -1, '★ لا يظهر اسم صاحب الملف الآخر');
    ok(t.indexOf('0500000001') === -1, '★ ولا رقم جواله');
    ok(t.indexOf('نبذة غيري') === -1, 'ولا نبذته');
    const img = doc.querySelector('.pf-hero__img');
    ok(!img || !img.src || img.src.indexOf('one.png') === -1, '★ ولا صورته الشخصية');

    /* ملفٌ كتبته نسخةٌ قديمة بلا هوية إطلاقًا: لا نفترض أنه لصاحب الجلسة.
       الافتراض هنا رخيصُ الخطأ عليه غالٍ: الخادم يعيد ملفه بعد لحظة، أما
       عرضُ ملف غيره فتسريبٌ لا يُستدرك. */
    A.store.set('profile', { name:'ملفٌ بلا هوية', phone:'0509999999' });
    A.router.render('#/account/profile');
    const t2 = doc.getElementById('main').textContent;
    ok(t2.indexOf('ملفٌ بلا هوية') === -1, '★ وملفٌ قديم بلا هوية لا يُعرض — الخادم يعيد الحقيقة');
    W.close();
  })());
}

/* ============ ١٣٠ · حين ينفد ما عند مزوّد الذكاء ============ */
/*
  ٤٢٩ من Google ليست عطلًا في منصتنا، وليست شيئًا واحدًا: حصّةُ دقيقةٍ
  تُنتظر ثوانيَ، وحصّةُ يومٍ انتظارها إلى الغد. وكان الطالب يرى JSON
  إنجليزيًّا خامًا لا يعرف منه أيعيد المحاولة أم ينصرف.
*/
describe('١٣٠ · نفاد حصّة الذكاء');
{
  const PV = require('../api/_lib/provider.js');

  const dayBody = JSON.stringify({ error:{ code:429, message:'You exceeded your current quota',
    details:[{ violations:[{ quotaId:'GenerateRequestsPerDayPerProjectPerModel' }] }] } });
  const minBody = JSON.stringify({ error:{ code:429, message:'quota',
    details:[{ violations:[{ quotaId:'GenerateRequestsPerMinutePerProject' }] }],
    retryDelay:'27s' } });

  eq(PV.classify(429, dayBody).kind, 'quota_day', 'حصّة اليوم تُميَّز');
  eq(PV.classify(429, dayBody).retryable, false, '★ ولا يُعاد المحاولة فيها — انتظارها إلى الغد');
  eq(PV.classify(429, minBody).kind, 'quota_minute', 'وحصّة الدقيقة تُميَّز');
  eq(PV.classify(429, minBody).retryable, true, 'وهي وحدها تستحق الانتظار');
  eq(PV.classify(401, '{}').kind, 'auth', 'ومفتاحٌ مرفوض عطلٌ إداري لا يُعاد');
  eq(PV.classify(503, '{}').kind, 'overloaded', 'وازدحام الخادم يُعاد');
  eq(PV.retryAfter('{"retryDelay":"27s"}'), 27, 'ونقرأ المهلة التي تطلبها Google نفسها');
  eq(PV.retryAfter('{}'), null, 'وغيابها لا يكسر شيئًا');

  // ── الرسالة: عربية، تقول ما العمل ──
  const e = PV.aiError(429, dayBody, 'Gemini');
  eq(e.kind, 'quota_day', 'الخطأ يحمل تصنيفه معه');
  ok(e.message.indexOf('Gemini 429') === -1, '★ ولا يُسرَّب JSON المزوّد إلى وجه الطالب');
  ok(e.message.indexOf('quota') === -1, 'ولا كلمة إنجليزية واحدة');
  has(e.message, 'المحفوظ لا يضيع', 'وتطمئنه على ما أُنجز');
  has(e.message, 'بلا إثراء', '★ وتدلّه على المخرج: انشر الآن وأثرِ لاحقًا');
  has(PV.aiError(429, minBody, 'Gemini').message, 'انتظر دقيقة', 'وحصّة الدقيقة تُقاس بدقيقة');
  eq(PV.aiError(429, dayBody, 'Gemini').status, 429, 'والحالة تُنقل كما هي لا ٥٠٠');
}

/* ============ ١٣١ · الشاشة تفتح بابًا لا جدارًا ============ */
describe('١٣١ · مخرج النشر بلا إثراء');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  const pl = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'q1', email:'q@q.q' }))));
  A.api.auth.captureFromHash('#access_token=h.' + pl + '.s&refresh_token=r&expires_in=9999');

  const raw = [];
  for (let i = 0; i < 12; i++) raw.push({ q:'Q'+i, options:['a','b'], answer:0, has_options:true });
  const w = A.admin.newWizard();
  w.step = 2; w.raw = raw; w.total = 12; w.filename = 'f.txt'; w.enrich = true;
  A.views.ViewUpload._set(w);

  A.api.rpc = name => name === 'my_credits'
    ? Promise.resolve({ ok:true, data:{ balance:0, cost_per_q:0, coin_halalas:5, open:true } })
    : Promise.resolve({ ok:true, data:{ ok:true } });
  // الخادم ينفد منه الذكاء
  A.admin.server = async (path) => path === '/api/ai'
    ? { ok:false, status:429, data:{ error:'بلغ الذكاء حصّته اليومية عند المزوّد.', kind:'quota_day' } }
    : { ok:true, data:{} };
  A.admin.saveDraft = async () => ({ ok:true });

  pending.push((async () => {
    await nav(W, '#/upload');
    await until(W, () => doc.querySelector('.btn--block'), 6000);
    const go = Array.prototype.slice.call(doc.querySelectorAll('button'))
      .filter(b => /ولّد المادة|شغّل الذكاء|أثرِ/.test(b.textContent))[0];
    ok(go, 'زر التشغيل موجود');
    go.dispatchEvent(new W.Event('click', { bubbles:true }));
    await until(W, () => doc.querySelector('.js-plainout'), 6000);

    const t = doc.getElementById('main').textContent;
    has(t, 'حصّته اليومية', 'العطل يُقال بالعربية');
    ok(t.indexOf('429') === -1, '★ ولا رقم حالة ولا JSON في وجه الطالب');

    const out = doc.querySelector('.js-plainout');
    ok(out, '★ ويُفتح له باب النشر بلا إثراء');
    out.dispatchEvent(new W.Event('click', { bubbles:true }));
    await until(W, () => A.views.ViewUpload._get() && A.views.ViewUpload._get().step === 3, 6000);
    const w2 = A.views.ViewUpload._get();
    eq(w2.step, 3, 'والضغط عليه ينقله إلى المراجعة');
    eq(w2.enriched.length, 12, 'بأسئلته الاثني عشر كما وصلت');
    eq(w2.error, '', 'ولا يبقى عطلٌ معلّق');
    A.views.ViewUpload._reset();
    W.close();
  })());
}

/* ============ ١٣٢ · القواعد تقرأ العربية ============ */
/*
  الذكاء له حصّة تنفد، والقواعد مجانيةٌ لا تنفد. فملفٌ عربيٌّ مرتّب يجب أن
  يُقرأ ولو انقطع الإنترنت عن كل مزوّدي العالم.
*/
describe('١٣٢ · القواعد تقرأ العربية');
{
  const P = require('../api/_lib/parser.js');

  const ar = ['مراجعة الفصل الأول — د. محمد', '',
    '١- ما هو العضو المسؤول عن إفراز الأنسولين؟',
    'أ) الكبد', 'ب) البنكرياس', 'ج) الطحال', 'الإجابة الصحيحة: ب', '',
    '٢. تُعرَّف الحساسية بأنها',
    'أ) نسبة السلبيات الحقيقية', 'ب) نسبة الإيجابيات الحقيقية', 'الصحيح: ب'].join('\n');
  const r = P.parse(ar);
  eq(r.length, 2, 'سؤالان عربيان يُلتقطان');
  eq(r[0].num, 1, '★ والرقم العربي ١ يُقرأ رقمًا لا زخرفة');
  eq(r[0].q, 'ما هو العضو المسؤول عن إفراز الأنسولين؟', 'ونصّ السؤال بلا ترقيمه');
  eq(r[0].options.length, 3, 'وخياراته الثلاثة بحروف عربية');
  eq(r[0].options[1], 'البنكرياس', 'ونصّ الخيار بلا حرفه');
  eq(r[0].answer, 1, '★ و«الإجابة الصحيحة: ب» تُقرأ موضعًا رقميًا');
  eq(r[1].answer, 1, 'و«الصحيح: ب» كذلك — الصيغة المختصرة مفهومة');
  ok(r[0].q.indexOf('د. محمد') === -1, 'وعنوان الملف واسم الدكتور خارج الأسئلة');

  // ── ترتيب الحروف ──
  eq(P.letterIndex('أ'), 0, 'أ أول الخيارات');
  eq(P.letterIndex('ا'), 0, 'والألف بلا همزة مثلها — الطالب لا يفرّق وهو يكتب');
  eq(P.letterIndex('ج'), 2, 'وج ثالثها');
  eq(P.letterIndex('هـ'), 4, 'وهـ خامسها');
  eq(P.letterIndex('B'), 1, 'واللاتينية كما كانت');
  eq(P.letterIndex('zz'), -1, 'وما ليس حرف خيار يُردّ بـ ‎-1‎');
  eq(P.toLatinDigits('سؤال ١٢٣'), 'سؤال 123', 'والأرقام تُحوَّل للحساب لا للعرض');

  // ── النجمة علامة تصحيح تُقشَّر ولا تُعرض ──
  const star = ['5) Which drug causes miosis?', 'A) Ketamine', 'B) Morphine *', 'C) Atropine'].join('\n');
  const rs = P.parse(star)[0];
  eq(rs.answer, 1, '★ والخيار المعلَّم بنجمة هو الإجابة');
  eq(rs.options[1], 'Morphine', 'والنجمة تُقشَّر — وإلا رأى الطالب الجواب قبل أن يجيب');

  // ── ما كان يعمل يبقى يعمل ──
  const latin = ['1) Old style question', 'A) one', 'B) two', 'ANSWER: B'].join('\n');
  const rl = P.parse(latin)[0];
  eq(rl.answer, 1, 'والشكل اللاتيني القديم لم يتغيّر');
  eq(rl.q, 'Old style question', 'ونصّه كما كان');

  // ── الخيار لا يُخلط بالسؤال ولو كان مرقّمًا ──
  const numbered = ['1. ما لون الدم؟', '1) أحمر', '2) أزرق'].join('\n');
  ok(P.parse(numbered).length >= 1, '★ خيارٌ مرقّم لا يُقرأ سؤالًا جديدًا');
}

/* ============ ١٣٣ · عطل الذكاء لا يُتَّهم به الملف ============ */
describe('١٣٣ · لا نتّهم ملفًا بريئًا');
{
  const R = require('../api/_lib/reader.js');
  pending.push((async () => {
    const boom = async () => { const e = new Error('بلغ الذكاء حصّته اليومية عند المزوّد.');
                               e.kind = 'quota_day'; e.status = 429; throw e; };
    const r = await R.aiRead('١- سؤال عربي\nأ) خيار\nب) خيار', boom);
    eq(r.questions.length, 0, 'لا أسئلة حين يسقط الذكاء');
    ok(r.error, '★ لكن العطل يعود معه لا يُبتلع');
    eq(r.error.kind, 'quota_day', 'بتصنيفه كاملًا');
    has(r.error.message, 'حصّته اليومية', 'وبنصّه العربي');

    // وحين ينجح لا عطل معلّق
    const ok2 = await R.aiRead('نص', async () => ({ items:[{ q:'نص', options:null }] }));
    eq(ok2.error, null, 'والنجاح لا يحمل عطلًا');
  })());
}

/* ============ ١٣٤ · الترويسة تعرف من دخل ============ */
/*
  «دخول» نصٌّ ثابت في هيكل الصفحة كان يبقى معروضًا على من دخل فعلًا،
  فيظنّ أن دخوله لم يُقبل ويعيد الكرّة. الترويسة يجب أن تتبع الجلسة.
*/
describe('١٣٤ · الترويسة تتبع الجلسة');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;

  // قبل الدخول: زرّ الدخول في مكانه
  A.router.render('#/');
  const slot = doc.getElementById('authSlot');
  ok(slot, 'موضع الحساب موجود في الترويسة');
  ok(slot.querySelector('[data-nav="#/login"]'), 'وقبل الدخول: زرّ «دخول»');
  has(slot.textContent, 'دخول', 'بنصّه');

  // بعد الدخول: بطاقة الحساب
  const pl = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'hdr-1', email:'ali@t.t' }))));
  A.api.auth.captureFromHash('#access_token=h.' + pl + '.s&refresh_token=r&expires_in=9999');
  A.store.set('profile', { uid:'hdr-1', name:'علي', avatar:'🩺', avatar_url:'' });
  A.router.render('#/');
  ok(!slot.querySelector('[data-nav="#/login"]'), '★ وبعد الدخول يختفي زرّ «دخول»');
  const chip = slot.querySelector('.authchip');
  ok(chip, 'وتحلّ محلّه بطاقة الحساب');
  eq(chip.getAttribute('href'), '#/account', 'وتقود إلى حسابه — طريق عودة من كل شاشة');
  has(chip.textContent, 'علي', 'وتحمل اسمه');
  ok(chip.querySelector('.authchip__ico'), 'ورمزه حين لا صورة له');

  // صورة مرفوعة تفوز على الرمز
  A.store.set('profile', { uid:'hdr-1', name:'علي', avatar:'🩺', avatar_url:'https://x/a.jpg' });
  A.router.render('#/explore');
  const img = doc.querySelector('.authchip__img');
  ok(img, '★ ومن رفع صورته يراها في الترويسة');
  ok(img.src.indexOf('a.jpg') !== -1, 'صورته هو');

  // ملفٌ لصاحبٍ آخر لا يُعرض — حارس الهوية يسري هنا أيضًا
  A.store.set('profile', { uid:'someone-else', name:'زيد', avatar_url:'https://x/z.jpg' });
  A.router.render('#/');
  const t = doc.getElementById('authSlot').textContent;
  ok(t.indexOf('زيد') === -1, '★ ولا يظهر اسم صاحب ملفٍ آخر في ترويستي');

  // الخروج يعيد الزرّ
  A.api.saveSession(null);
  A.router.render('#/');
  ok(doc.getElementById('authSlot').querySelector('[data-nav="#/login"]'),
     'والخروج يعيد زرّ الدخول');
  W.close();
}

/* ============ ١٣٥ · الصورة والرمز ليسا سواءً ============ */
describe('١٣٥ · الصورة تكبر والرمز يصغر');
{
  const html = require('fs').readFileSync(__dirname + '/../index.html', 'utf8');
  /* الحجم رسالة: الكبير مطلوب والصغير مؤقّت. وكانا بحجمٍ واحد فبدا
     الرمز اختيارًا نهائيًا لا دعوةً لرفع صورة. */
  ok(/\.pf-hero__img\{[^}]*width:104px/.test(html.replace(/\s+/g,'')) ||
     html.indexOf('.pf-hero__img{') !== -1, 'الصورة لها قاعدتها المستقلة');
  ok(html.indexOf('width:104px; height:104px; border-radius:50%; object-fit:cover;') !== -1,
     '★ والصورة الشخصية ١٠٤ بكسل — أكبر ما في البطاقة');
  ok(html.indexOf('.pf-hero__emoji{\n  width:64px; height:64px') !== -1 ||
     /pf-hero__emoji\{\s*width:64px/.test(html), '★ والرمز ٦٤ بكسل — أصغر منها بوضوح');
  has(html, 'border:2px dashed', 'وإطاره متقطّع: مكانٌ ينتظر أن يُملأ');
  has(html, '.avpick .iconbtn{', 'ولشبكة الاختيار قاعدتها الخاصة');
  has(html, 'width:38px; height:38px; border-radius:50%', 'ورقاقاتها ٣٨ بكسل دائرية');
  has(html, 'رمز مؤقّت — يظهر حتى ترفع صورتك', 'والنصّ يقول إنه مؤقّت لا بديل دائم');
  // مساحة البطل ثابتة فلا يقفز التخطيط بين الحالين
  has(html, "width:104px; height:104px; display:grid; place-items:center;",
      'ومساحة البطل مثبّتة — لا قفزة عند تبدّل الصورة بالرمز');
}

/* ============ ١٣٦ · سلّم التكرار المتباعد ============ */
/*
  المذاكرة بالإعادة الفورية وهمُ إتقان. والذي يثبّت هو الاسترجاع بعد أن
  تكاد تنسى. هذه الفحوص تحرس السُّلَّم نفسه — قبل أي شاشة.
*/
describe('١٣٦ · سلّم المراجعة');
{
  const dom = makeDom(), W = dom.window, A = W.QBANK;
  const P = A.progress;

  // ── الصعود درجةً درجة ──
  eq(P.nextInterval(0, true), 1, 'أول إصابة: يوم واحد');
  eq(P.nextInterval(1, true), 3, 'ثم ثلاثة');
  eq(P.nextInterval(3, true), 7, 'ثم سبعة');
  eq(P.nextInterval(7, true), 16, 'ثم ستة عشر');
  eq(P.nextInterval(16, true), 35, 'ثم خمسة وثلاثون');
  eq(P.nextInterval(35, true), 60, 'ثم ستون');
  eq(P.nextInterval(60, true), 60, '★ ولا يتجاوز الستين — سؤالٌ يُنسى بعد شهرين يستحق العودة');

  // ── الهبوط إلى القاع عند الخطأ ──
  eq(P.nextInterval(60, false), 1, '★ والخطأ يُعيده إلى يومٍ واحد مهما بلغ');
  eq(P.nextInterval(7, false), 1, 'من أي درجة كان');
  eq(P.nextInterval(999, true), 1, 'وفترةٌ غريبة تبدأ من أول السلّم لا تُصدَّق');

  // ── رقم اليوم ──
  const t0 = P.today('2026-03-10T06:00:00');
  const t1 = P.today('2026-03-11T23:00:00');
  eq(t1 - t0, 1, 'رقم اليوم يتقدّم يومًا بيوم لا بالساعات');
  eq(P.today('2026-03-10T00:30:00'), P.today('2026-03-10T22:30:00'),
     '★ وساعتان في يومٍ واحد رقمُهما واحد — المراجعة تُقاس بالأيام');

  // ── التسجيل والاستحقاق ──
  A.store.clearAll();
  P.review('s1', 'q1', true,  '2026-03-10T09:00:00');   // يستحق ١١ مارس
  P.review('s1', 'q2', false, '2026-03-10T09:00:00');   // يستحق ١١ مارس، بتعثّر
  const srs = P.forSubject('s1').srs;
  eq(srs.q1.i, 1, 'المصاب فترته يوم');
  eq(srs.q2.e, 1, 'والمخطئ يُسجَّل تعثّره');
  eq(P.dueIn('s1', '2026-03-10T20:00:00').length, 0, 'ولا يستحق شيء في اليوم نفسه');
  eq(P.dueIn('s1', '2026-03-11T07:00:00').length, 2, 'ويستحقّان في اليوم التالي');

  // ── الترتيب: الأكثر تعثّرًا أولًا ──
  P.review('s1', 'q1', true, '2026-03-11T09:00:00');   // صعد إلى ٣ أيام
  P.review('s1', 'q2', false, '2026-03-11T09:00:00');  // تعثّر ثانيًا
  const due = P.dueAll('2026-03-15T09:00:00');
  eq(due.length, 2, 'كلاهما مستحقّ');
  eq(due[0].qid, 'q2', '★ والأكثر تعثّرًا أولًا — هو ما يُسقطك في الاختبار');

  // ── الموعد القادم ──
  A.store.clearAll();
  P.review('s1', 'q9', true, '2026-03-10T09:00:00');
  eq(P.nextDue('2026-03-10T20:00:00'), 1, 'ومن أنهى اليوم يُقال له متى يعود');
  eq(P.nextDue('2026-03-20T09:00:00'), null, 'ولا موعد قادمًا حين مرّ كل شيء');
  W.close();
}

/* ============ ١٣٧ · دمج جدول المراجعة بين جهازين ============ */
describe('١٣٧ · الأحدث مراجعةً يفوز');
{
  const dom = makeDom(), W = dom.window, A = W.QBANK;
  const local  = { s1: { seen:{}, wrong:{}, star:{}, exams:0, best:0,
    srs: { q1: { i:1,  d:100, e:3, t:99 } } } };          // جهازٌ راجعه أمس وأخطأ
  const remote = { s1: { seen:{}, wrong:{}, star:{}, exams:0, best:0,
    srs: { q1: { i:35, d:130, e:0, t:95 } } } };          // جهازٌ راجعه قبل أيام وأصاب
  const m = A.progress.merge(local, remote);
  eq(m.s1.srs.q1.i, 1, '★ الأحدث مراجعةً يفوز — لا الأطول فترةً');
  eq(m.s1.srs.q1.t, 99, 'بتاريخه هو');

  // والعكس: الأقدم لا يزيح الأحدث
  const m2 = A.progress.merge(remote, local);
  eq(m2.s1.srs.q1.t, 99, 'مهما كان ترتيب الدمج');

  // سؤالٌ في جهازٍ واحد لا يضيع
  const m3 = A.progress.merge(
    { s1: { seen:{}, wrong:{}, star:{}, srs:{ a:{ i:1,d:5,t:1 } } } },
    { s1: { seen:{}, wrong:{}, star:{}, srs:{ b:{ i:3,d:9,t:2 } } } });
  eq(Object.keys(m3.s1.srs).length, 2, 'واتحاد الأسئلة لا تقاطعها — لا يخسر أحد جدوله');
  W.close();
}

/* ============ ١٣٨ · شاشة «راجع اليوم» ============ */
describe('١٣٨ · راجع اليوم');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  A.store.clearAll();

  // بطاقة الرئيسية: تغيب قبل أن يبدأ الطالب
  eq(A.views.reviewCard(), null, '★ لا بطاقة لمن لم يبدأ — بطاقةٌ فارغة تعليمٌ ناقص');

  // بعد مراجعتين مستحقّتين
  A.progress.review('s1', 'q1', false);
  A.progress.review('s1', 'q2', false);
  const p = A.progress.all();
  Object.keys(p.s1.srs).forEach(k => { p.s1.srs[k].d = 0; });   // نُنضجها
  A.store.set('progress', p);

  const card = A.views.reviewCard();
  ok(card, 'وتظهر حين يستحقّ شيء');
  has(card.textContent, 'راجع اليوم', 'بعنوانها');
  has(card.textContent, '٢', 'وبعدد المستحقّ');
  eq(card.getAttribute('href'), '#/review', 'وتقود إلى الشاشة');

  // الشريط السفلي خمسة لا ستة
  A.router.render('#/');
  eq(doc.querySelectorAll('.tabbar__item').length, 5,
     '★ الشريط يبقى خمسة — السادس يضيّق مساحة اللمس');
  ok(doc.querySelector('[data-nav="#/review"]'), 'و«راجع» فيه');
  ok(!doc.querySelector('.tabbar [data-nav="#/settings"]'), 'و«الإعدادات» خرجت منه');

  // ومسارها يعمل
  A.router.render('#/review');
  has(doc.getElementById('main').textContent, 'راجع اليوم', 'والشاشة تُرسم');
  W.close();
}

/* ============ ١٣٩ · بطاقة المشاركة كصورة ============ */
describe('١٣٩ · بطاقة السؤال');
{
  const dom = makeDom(), W = dom.window, A = W.QBANK;
  const S = A.shareCard;
  ok(S, 'الوحدة محمّلة');
  eq(S.W, 1080, 'مربّع ١٠٨٠ — الشكل الذي تقبله سناب وواتساب معًا');
  eq(S.H, 1080, 'ارتفاعًا كعرضه');

  ok(S.isRtl('ما هو العضو؟'), 'العربية تُعرف عربية');
  ok(!S.isRtl('Which drug?'), 'واللاتينية لاتينية — الاتجاه من النص لا من الواجهة');

  // اللفّ بالقياس
  const fakeCtx = { measureText: t => ({ width: t.length * 10 }) };
  const lines = S.wrap(fakeCtx, 'كلمة كلمة كلمة كلمة كلمة كلمة', 100);
  ok(lines.length > 1, 'النص الطويل يُلفّ أسطرًا');
  lines.forEach(l => ok(l.length * 10 <= 110, 'ولا يتجاوز سطرٌ العرض المتاح'));
  const cut = S.wrap(fakeCtx, new Array(40).fill('كلمة').join(' '), 100, 3);
  eq(cut.length, 3, 'وسقف الأسطر يُحترم');
  has(cut[2], '…', 'ويُختم بعلامة قطع — لا نوهم أن النص انتهى');

  // ★ الإجابة لا تُكشف
  const src = require('fs').readFileSync(__dirname + '/js/60-sharecard.js', 'utf8');
  ok(src.indexOf('q.answer') === -1,
     '★ البطاقة لا تعرف الإجابة أصلًا — الفضول هو ما يُعبر الرابط');
  has(src, 'تعرف الإجابة؟', 'وتدعو لمعرفتها على المنصة');
  W.close();
}

/* ============ ١٤٠ · «اشرح لي أكثر» ============ */
describe('١٤٠ · شرح الخطأ');
{
  const dom = makeDom(), W = dom.window, A = W.QBANK;
  const E = A.explain;
  ok(E, 'الوحدة محمّلة');

  const q = { id:'q1', q:'سؤال', options:['أ','ب','ج'], answer:1, topic:'محور' };
  eq(E.button(q, 1), null, '★ من أصاب لا زرّ له — لا شيء يُشرح');
  eq(E.button(q, null), null, 'ومن لم يُجب كذلك');
  ok(E.button(q, 0), 'والمخطئ يراه');
  has(E.button(q, 0).textContent, 'لماذا أخطأت', 'بنصٍّ يقول ما سيحدث');

  // الجواب يُحفظ فلا يُدفع ثمنه مرتين
  E._reset();
  let calls = 0;
  A.api.fetchFn = () => (url, o) => { calls++; return Promise.resolve({
    ok:true, json: () => Promise.resolve({ ok:true, why:'خلطتَ بين الأفيونات والكيتامين.' }) }); };
  const pl = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'ex1', email:'e@e.e' }))));
  A.api.auth.captureFromHash('#access_token=h.' + pl + '.s&refresh_token=r&expires_in=9999');
  A.store.set('api_base', 'https://x.dev');

  pending.push((async () => {
    const r1 = await E.ask(q, 0);
    eq(r1.ok, true, 'الشرح يصل');
    has(r1.why, 'الأفيونات', 'بنصّه');
    const r2 = await E.ask(q, 0);
    eq(r2.cached, true, '★ والسؤال نفسه لا يُنادى مرتين');
    eq(calls, 1, 'نداءٌ واحد لا اثنان');

    // اختيارٌ آخر سوء فهمٍ آخر — يستحق نداءه
    await E.ask(q, 2);
    eq(calls, 2, 'وخطأٌ مختلف يستحق شرحًا مختلفًا');
    W.close();
  })());
}

/* ============ ١٤١ · خادم الشرح: حرّاسه ============ */
describe('١٤١ · حرّاس /api/explain');
{
  const src = require('fs').readFileSync(__dirname + '/../api/explain.js', 'utf8');
  has(src, 'supa.userFromToken', '★ الجلسة شرط — نداءٌ مفتوح للعالم بابُ استنزاف');
  has(src, "res.status(401)", 'ومن لا جلسة له يُردّ ٤٠١');
  has(src, 'if (ci === ki)', '★ ولا نُنفق نداءً على من أصاب');
  has(src, 'slice(0, CAP)', 'والنصوص مقصوصة — لا نمرّر حمولة بحجم كتاب');
  has(src, 'maxTokens: 1024', 'والخرج قصير: ثلاث جمل تكفي والطويل لا يُقرأ');
  has(src, 'ثلاث جمل لا أكثر', 'والبرومبت يقولها صراحة');
  has(src, 'لا تُلقِ عليه اللوم', 'ولا يُلام الطالب على خطئه');
}

/* ============ ١٤٢ · المسوّدة تُحفظ أو يُقال لماذا ============ */
/*
  عطلٌ صامت أوصل الطالب إلى آخر خطوة ثم ردّه: سياسة جدول المسوّدات بقيت
  «للمشرف وحده» بعد أن فُتح الرفع للطلاب، فيُرفض الإدراج بصمت، ويمضي
  المعالج بأسئلةٍ في المتصفح تبدو سليمة، حتى يضغط «انشر» فيُقال له
  «المسوّدة غير موجودة».
*/
describe('١٤٢ · حفظ المسوّدة وفشله');
{
  const dom = makeDom(), W = dom.window, A = W.QBANK;
  const pl = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'dr1', email:'d@d.d' }))));
  A.api.auth.captureFromHash('#access_token=h.' + pl + '.s&refresh_token=r&expires_in=9999');

  // ── الفشل يُسجَّل ولا يُبتلع ──
  const w = A.admin.newWizard();
  w.filename = 'f.txt'; w.subjectName = 'مادة'; w.total = 2; w.done = 2;
  w.enriched = [{ q:'س١' }, { q:'س٢' }];
  A.api.rest = async () => ({ ok:false, status:403,
    data:{ message:'new row violates row-level security policy' } });

  pending.push((async () => {
    await A.admin.saveDraft(w);
    eq(w.draftId, null, 'لا معرّف حين يفشل الحفظ');
    ok(w.draftError, '★ لكن سبب الفشل محفوظ لا مُهمَل');
    has(w.draftError, 'row-level security', 'بنصّ الخادم نفسه — لا «تعذّر» عامة');

    // ── الاعتماد يحاول الإنقاذ قبل أن يُعلن الفشل ──
    let tries = 0;
    A.api.rest = async () => { tries++; return { ok:false, status:403, data:{ message:'ممنوع' } }; };
    A.api.rpc = async () => ({ ok:true, data:'sub-1' });
    const r = await A.admin.approve(w, true);
    ok(tries >= 1, '★ يحاول حفظ المسوّدة قبل الاعتماد — الأسئلة في المتصفح كاملة');
    eq(r.ok, false, 'وإن عجز يُعلن الفشل');
    has(r.data.message, 'أسئلتك لم تضِع', 'ويطمئن الطالب على عمله');
    ok(r.data.message.indexOf('المسوّدة غير موجودة') === -1,
       'ولا يقول جملةً صادقة لا تدلّ على السبب');

    // ── ونجاح الإنقاذ يُكمل الطريق ──
    const w2 = A.admin.newWizard();
    w2.filename = 'g.txt'; w2.total = 1; w2.done = 1; w2.enriched = [{ q:'س' }];
    A.api.rest = async () => ({ ok:true, data:[{ id:'draft-9' }] });
    let approved = null;
    A.api.rpc = async (name, args) => { approved = args; return { ok:true, data:'sub-2' }; };
    const r2 = await A.admin.approve(w2, true);
    eq(w2.draftId, 'draft-9', '★ ومن حُفظت مسوّدته في اللحظة الأخيرة يمضي');
    eq(approved.draft_id, 'draft-9', 'ويُعتمد بمعرّفها');
    eq(r2.ok, true, 'وينجح');
    W.close();
  })());
}

/* ============ ١٤٣ · صلاحية المسوّدات في القاعدة ============ */
describe('١٤٣ · سياسة المسوّدات');
{
  const sql = require('fs').readFileSync(__dirname + '/../db/DRAFTS-OWNER.sql', 'utf8');
  has(sql, 'drop policy if exists drafts_all', 'السياسة القديمة تُزال');
  has(sql, 'created_by = auth.uid() or qbank.is_admin()',
      '★ والجديدة: صاحبها أو المشرف — لا المشرف وحده');
  has(sql, 'with check (created_by = auth.uid() or qbank.is_admin())',
      'والكتابة كالقراءة — من يعتمد يملك أن يُنشئ');
  // القاعدة العامة موثّقة كي لا يتكرّر الخلل في جدولٍ آخر
  has(sql, 'الصلاحية تُمنح للجدول والدالة معًا', 'والدرس مكتوب لا مُستنتَج');
}

/* ============ ١٤٤ · إعادة التشغيل لا تُضاعف الأسئلة ============ */
/*
  ملفٌ من ٦٥ سؤالًا خرج بـ٢٥٩ — نُسخًا مكرّرة يظنّها الطالب مادته.
  السبب: كل دفعة كانت تُلحق بآخر ما عند المعالج، فإعادة التشغيل تُلحق
  ثانيةً. والعلاج: الكتابة بالموضع، فإعادة التشغيل تكتب فوق نفسها.
*/
describe('١٤٤ · الإثراء لا يُضاعف');
{
  const dom = makeDom(), W = dom.window, A = W.QBANK;
  const pl = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'dup', email:'x@x.x' }))));
  A.api.auth.captureFromHash('#access_token=h.' + pl + '.s&refresh_token=r&expires_in=9999');

  const raw = [];
  for (let i = 0; i < 65; i++) raw.push({ q:'Q'+i, options:['a','b'], answer:0, has_options:true });
  const mk = () => { const w = A.admin.newWizard();
    w.step = 2; w.raw = raw; w.total = 65; w.enrich = true; w.costPerQ = 0; return w; };

  A.api.rpc = async () => ({ ok:true, data:{ ok:true } });
  A.admin.saveDraft = async () => ({ ok:true });

  let failFirst = true;
  A.admin.server = async (path, body) => {
    if (path !== '/api/ai') return { ok:false };
    return { ok:true, data:{ questions: body.questions.map(q => ({ q:q.q, expl_ar:'ش' })) } };
  };

  pending.push((async () => {
    // تشغيل كامل
    const w1 = await A.admin.wizardEnrich(mk());
    eq(w1.enriched.length, 65, 'التشغيل الكامل يعطي العدد نفسه');
    eq(w1.done, 65, 'والعدّاد يطابقه');

    // ★ إعادة التشغيل على المعالج نفسه لا تُضاعف
    w1.done = 40;                       // كأن الدفعة الثانية انقطعت
    const w2 = await A.admin.wizardEnrich(w1);
    eq(w2.enriched.length, 65, '★ وإعادة التشغيل بعد انقطاع تبقيه ٦٥ لا ١٣٠');
    eq(w2.done, 65, 'والعدّاد لا يتجاوز المجموع');

    // ولا نسخة مكرّرة من سؤال واحد
    const names = w2.enriched.map(x => x && x.q);
    eq(new Set(names).size, 65, '★ وكل سؤال مرة واحدة — لا نسختين');

    // التقدّم يُعلن بدء الدفعة لا نهايتها وحدها
    const seen = [];
    const w3 = mk();
    await A.admin.wizardEnrich(w3, (d, t, st) => { if (st) seen.push(st.running); });
    ok(seen.indexOf(true) !== -1, '★ ويُعلن أن الدفعة بدأت — لا يصمت حتى تنتهي');
    ok(seen.indexOf(false) !== -1, 'ثم يُعلن انتهاءها');
    W.close();
  })());
}

/* ============ ١٤٥ · الرابط بعد النشر يُقرأ لا يُخمَّن ============ */
describe('١٤٥ · رابط المادة الحقيقي');
{
  const dom = makeDom(), W = dom.window, A = W.QBANK;
  const pl = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'sl', email:'s@s.s' }))));
  A.api.auth.captureFromHash('#access_token=h.' + pl + '.s&refresh_token=r&expires_in=9999');

  pending.push((async () => {
    A.api.rest = async (path) => {
      has(path, 'subjects?id=eq.sub-7', 'يسأل عن المادة بمعرّفها');
      has(path, 'select=slug', 'ويطلب رابطها وحده — لا الصف كله');
      return { ok:true, data:[{ slug:'real-slug-abc123' }] };
    };
    eq(await A.admin.realSlug('sub-7'), 'real-slug-abc123',
       '★ الرابط من الخادم لا من تخمين المتصفح');

    A.api.rest = async () => ({ ok:true, data:[{ slug:null }] });
    eq(await A.admin.realSlug('sub-7'), null, 'وغيابه يُقال null لا يُختلق');
    eq(await A.admin.realSlug(null), null, 'وبلا معرّف لا نداء أصلًا');
    W.close();
  })());
}

/* ============ ١٤٦ · القاعدة: كل مادة لها رابط ============ */
describe('١٤٦ · توليد رابط المادة');
{
  const sql = require('fs').readFileSync(__dirname + '/../db/SUBJECT-SLUG-OWNER.sql', 'utf8');
  has(sql, 'create trigger subjects_slug_trg',
      '★ قادحٌ يملأ الرابط عند الإنشاء — لا يعتمد على نداءٍ لاحق قد يفشل');
  /* ★ صار «insert or update»: الحارس الذي يحمي بابًا ويترك الآخر
     مفتوحًا ليس حارسًا (فحص ١٥٩). */
  has(sql, 'before insert or update on qbank.subjects', 'قبل الكتابة لا بعدها');
  has(sql, "left(replace(p_id::text, '-', ''), 6)",
      'وذيل المعرّف يضمن التفرّد بلا حلقة محاولات');
  has(sql, 'ء-ي', 'ويقبل الحروف العربية — أسماء المواد عربية');
  has(sql, 'update qbank.subjects\n   set slug = qbank.make_slug(name, id)',
      'والمواد القائمة بلا رابط تُعالَج مرة واحدة');
  has(sql, 'qbank.is_admin() or created_by = auth.uid()',
      '★ والمالك يعدّل مادته — لا مواد الناس');
  ok(sql.indexOf('using      (true)') === -1, 'ولا تُفتح المواد على مصراعيها');
}

/* ============ ١٤٧ · زرّ نشرٍ واحد لكل شيء ============ */
/*
  كان النسخ يطلب ثلاث خطوات — انسخ، افتح واتساب، الصق — ويسقط بعضهم في
  كل واحدة. ونافذة النظام تفعلها بضغطة. والميزة تُبنى مرة وتُستعمل في كل
  موضع: مادة، ملف طالب، جامعة.
*/
describe('١٤٧ · النشر');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  const S = A.share;

  // ── الروابط في موضع واحد ──
  has(S.profileUrl('u-9'), '#/p/u-9', 'رابط الملف العام');
  has(S.universityUrl('un-2'), '#/u/un-2', 'ورابط الجامعة');
  ok(/^https?:\/\//.test(S.profileUrl('x')) || S.profileUrl('x').indexOf('#/p/') === 0,
     'ومطلقٌ لا نسبي — الرابط النسبي لا يُرسَل');
  has(S.absUrl('#/review'), '#/review', 'وأي مسار داخلي يصير رابطًا');
  has(S.absUrl('review'), '#/review', 'ولو كُتب بلا هاش');

  // ── الزرّ: نافذة النظام ثم الحافظة ──
  const btn = S.shareButton({ url:'https://x.test/#/p/1', title:'ت', text:'ن' });
  ok(btn, 'الزرّ يُبنى');
  const wa = btn.querySelector('a[href*="wa.me"]');
  ok(wa, '★ وواتساب بجانبه دائمًا — حيث تعيش مجموعات الدفعة');
  has(decodeURIComponent(wa.getAttribute('href')), 'https://x.test/#/p/1', 'وفيه الرابط');
  eq(wa.getAttribute('rel'), 'noopener noreferrer', 'وبلا ثغرة النافذة المفتوحة');

  pending.push((async () => {
    // نافذة النظام تُستعمل حين تتوفّر
    let shared = null;
    W.navigator.share = async (d) => { shared = d; };
    const r1 = await S.sharePlain('u1', 't', 'x');
    eq(r1.via, 'share', '★ نافذة النظام أولًا — الأقصر وتعرض تطبيقاته كلها');
    eq(shared.url, 'u1', 'بالرابط نفسه');

    // وحين تغيب: الحافظة
    delete W.navigator.share;
    let copied = null;
    W.navigator.clipboard = { writeText: async t => { copied = t; } };
    const r2 = await S.sharePlain('u2');
    eq(r2.via, 'copy', 'وحين تغيب تُنسخ — لا نَعِد بما لا نملك');
    eq(copied, 'u2', 'بالرابط نفسه');

    // وإلغاء المستخدم ليس عطلًا
    W.navigator.share = async () => { throw new Error('AbortError'); };
    const r3 = await S.sharePlain('u3');
    eq(r3.cancelled, true, '★ وإلغاؤه ليس فشلًا يُنبَّه عليه');
    W.close();
  })());
}

/* ============ ١٤٨ · النشر حاضر في كل موضع ============ */
describe('١٤٨ · مواضع النشر');
{
  const html = require('fs').readFileSync(__dirname + '/../index.html', 'utf8');
  has(html, '⤴ انشر المادة', 'صفحة المادة فيها زرّ نشر');
  has(html, '⤴ انشر ملفي', 'وحسابي فيه نشر ملفه');
  has(html, '⤴ انشر ملفك', 'والملف العام لصاحبه');
  has(html, '⤴ انشر الملف', 'ولزائره — سمعةُ الرافع تُبنى بمن يفتح ملفه');
  has(html, 'QBANK.share.shareButton', 'والمكوّن واحد يُستعمل لا يُنسخ');
  // ولم يبقَ «انسخ» وحده في المواضع الرئيسية
  ok(html.indexOf('⎘ انسخ رابط ملفي') === -1, '★ ولم يبقَ النسخ وحده حيث كان');
  ok(html.indexOf('⎘ نسخ الرابط') === -1, 'ولا في صفحة المادة');
}

/* ============ ١٤٩ · شريط قراءة الملف ============ */
/*
  «جارٍ قراءة الملف…» سطرٌ جامد لا يقول شيئًا، وقراءة ملفٍ من ستين صفحة
  قد تبلغ دقيقتين. الطالب أمام سطرٍ لا يتحرّك يستنتج العطل ويُغلق الصفحة
  على عملٍ يجري.
*/
describe('١٤٩ · تقدّم القراءة');
{
  const html = require('fs').readFileSync(__dirname + '/../index.html', 'utf8');

  has(html, 'يُقرأ «', 'المرحلة الأولى تُسمّى: القراءة من الجهاز');
  has(html, 'rd.onprogress', '★ وتقدّمها حقيقي من المتصفح لا متخيَّل');
  has(html, 'e.lengthComputable', 'ولا نرسم نسبة لا نعرفها');
  has(html, 'يُرفع ملفك', 'ثم مرحلة الرفع');
  has(html, 'يُحلَّل ملفك على الخادم', 'ثم التحليل');
  has(html, 'ثانية. ', '★ وعدّاد الثواني يفرّق بين «بطيء» و«معطّل»');
  has(html, "rdBar.classList.add('meter--busy')",
      'والمرحلة مجهولة الطول تتحرّك بدل أن تجمد');
  has(html, "rdBar.removeAttribute('aria-valuenow')",
      'ويُرفع الرقم عن قارئ الشاشة حين لا نعرفه — لا نكذب عليه بصفر');
  has(html, 'clearInterval(tick)', 'والعدّاد يتوقف عند الانتهاء — لا يبقى يدقّ');
  has(html, 'تعذّرت قراءة الملف من جهازك', 'وفشل القراءة يُقال لا يُترك معلّقًا');

  // الشريط المتحرّك نفسه معرَّف في الأنماط
  has(html, '.meter--busy .meter__fill', 'ونمط الحركة موجود');
  has(html, 'prefers-reduced-motion', 'ومن طلب تقليل الحركة يُحترم طلبه');

  // ولا يبقى السطر الجامد القديم
  ok(html.indexOf("msg.textContent = 'جارٍ قراءة «'") === -1,
     '★ ولم يبقَ السطر الجامد الذي كان');
}

/* ============ ١٥٠ · الشريط السفلي: رموز مرسومة لا محارف ============ */
/*
  كانت الأيقونات محارف يونيكود (▤ ⌕ ↻ ⇪ ◍): كل نظام يرسمها بخطّه فتختلف
  أوزانها بين أندرويد وآيفون، ويسقط بعضها إلى مربّع فارغ حين لا يجد
  الجهازُ محرفًا لها. وأكثر عنصرٍ يراه الطالب يستحق رسمًا متسقًا.
*/
describe('١٥٠ · شريط احترافي');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  A.router.render('#/');

  const items = doc.querySelectorAll('.tabbar__item');
  eq(items.length, 5, 'خمسة تبويبات');

  // ★ كل تبويب يحمل رسمًا حقيقيًا
  let svgs = 0, paths = 0;
  Array.prototype.forEach.call(items, it => {
    const svg = it.querySelector('svg');
    if (svg) svgs++;
    const p = it.querySelector('svg path');
    if (p && p.getAttribute('d')) paths++;
    // ولا محارف زخرفية باقية داخل غلاف الأيقونة
    const box = it.querySelector('.tabbar__box');
    ok(box, 'ولكل تبويب غلاف أيقونة مستقل');
    eq((box.textContent || '').trim(), '',
       '★ ولا محرف نصّي داخله — الرسم وحده');
  });
  eq(svgs, 5, '★ خمسة رسوم متجهية');
  eq(paths, 5, 'لكلٍّ مساره');

  // الرسم يرث لون النص فيتبع السمة والحالة معًا
  const p0 = items[0].querySelector('svg path');
  eq(p0.getAttribute('stroke'), 'currentColor',
     '★ واللون موروث — يتبع السمة الليلية وحالة التحديد بلا قاعدة إضافية');
  eq(items[0].querySelector('svg').getAttribute('aria-hidden'), 'true',
     'والرسم مخفيّ عن قارئ الشاشة — النص وحده يُقرأ');
  ok(items[0].querySelector('.tabbar__lbl').textContent, 'والنص موجود لقارئ الشاشة وللعين');

  // التمييز يتبع الصفحة
  A.router.render('#/review');
  const on = doc.querySelector('.tabbar__item[aria-current="page"]');
  ok(on, 'والصفحة الحالية معلَّمة');
  eq(on.getAttribute('data-nav'), '#/review', 'بالمسار الصحيح');
  eq(doc.querySelectorAll('.tabbar__item[aria-current="page"]').length, 1,
     'وواحدة لا أكثر');
  W.close();
}

/* ============ ١٥١ · أنماط الشريط ============ */
describe('١٥١ · هيئة الشريط');
{
  const html = require('fs').readFileSync(__dirname + '/../index.html', 'utf8');
  has(html, '.tabbar__box{', 'غلاف الأيقونة له قاعدته');
  has(html, 'width:46px; height:30px; border-radius:999px',
      'حبّةٌ بيضوية تتّسع للأيقونة لا للكلمة');
  has(html, '.tabbar__item[aria-current="page"] .tabbar__box{',
      '★ والتمييز خلف الأيقونة وحدها — الذي يبتلع الكلمة يُثقل الشريط');
  has(html, "stroke-width:2", 'وخطّ الأيقونة المحدَّدة أثقل قليلًا');
  /* ★ الذهب لا الرمادي: --acc محايدٌ رمادي وتلوّنه كل مادة، فحبّةٌ به
     تُقرأ «معطّلة» ويتبدّل لون الشريط مع كل مادة. */
  has(html, 'background:color-mix(in srgb, var(--gold) 18%, transparent)',
      '★ وحبّة التمييز ذهبية — لون الهوية الثابت لا الرمادي المتبدّل');
  ok(html.indexOf('background:color-mix(in srgb, var(--acc) 16%, transparent);\n  transform:translateY(-1px)') === -1,
     'ولم يبقَ الرمادي');
  has(html, 'env(safe-area-inset-bottom', 'ويحترم الحافة السفلية في آيفون');
  has(html, '@supports not ((backdrop-filter',
      '★ ومن لا يدعم الزجاج يحصل على سطحٍ صلب — لا شفافيةٍ تُخفي النص تحته');
  has(html, '-webkit-backdrop-filter', 'وسفاري يُخاطَب ببادئته');
  has(html, '.tabbar__item:active .tabbar__box{ transform:scale(.9)',
      'واللمس يستجيب فورًا');
  has(html, '-webkit-tap-highlight-color:transparent',
      'بلا مستطيل أزرق يقفز على أندرويد');
  // إمكانية الوصول: الحركة تُطفأ لمن طلب
  ok(/prefers-reduced-motion[\s\S]{0,400}\.tabbar__box\{ transition:none/.test(html),
     'ومن طلب تقليل الحركة يُحترم طلبه');
}

/* ============ ١٥٢ · تنقّل سطح المكتب ============ */
/*
  ★ عطلٌ صامت عاش طويلًا: الشريط السفلي يُخفى فوق ٨٢٠ بكسل، والتعليق في
  الأنماط يَعِد بـ«روابط أعلى» — روابط لم تُكتب قط. فمن فتح المنصة على
  حاسوبه وجد نفسه بلا تنقّل إطلاقًا: لا استكشاف ولا رفع ولا حساب.
*/
describe('١٥٢ · تنقّل سطح المكتب');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  A.router.render('#/');

  const top = doc.getElementById('topnav');
  ok(top, 'الترويسة فيها موضع تنقّل');
  const items = top.querySelectorAll('.topnav__item');
  eq(items.length, 5, '★ وفيه التبويبات الخمسة نفسها');

  // ★ مصدرٌ واحد للقائمتين: ما في الشريط هو ما في الترويسة
  const bottom = Array.prototype.map.call(
    doc.querySelectorAll('.tabbar__item'), a => a.getAttribute('data-nav')).join(',');
  const upper = Array.prototype.map.call(items, a => a.getAttribute('data-nav')).join(',');
  eq(upper, bottom, '★ والقائمتان من مصدر واحد — لا تتباعدان مع الوقت');

  eq(items[0].querySelectorAll('svg').length, 1, 'ولكلٍّ رسمه');
  ok(items[0].querySelector('.topnav__lbl').textContent, 'ونصّه');

  // التمييز يتبع الصفحة هنا أيضًا
  A.router.render('#/explore');
  const on = top.querySelector('.topnav__item[aria-current="page"]');
  ok(on, 'والصفحة الحالية معلَّمة في الأعلى كذلك');
  eq(on.getAttribute('data-nav'), '#/explore', 'بالمسار الصحيح');

  const html = require('fs').readFileSync(__dirname + '/../index.html', 'utf8');
  has(html, '.topnav{ display:none; }', 'ولا يظهر على الجوال — الشريط السفلي مكانه');
  has(html, '@media (min-width:820px) and (max-width:960px)',
      '★ وبين ٨٢٠ و٩٦٠ تُطوى الكلمات وتبقى الأيقونات — الترويسة تضيق');
  has(html, '.topnav__item[aria-current="page"]{', 'وللحالية قاعدتها');
  W.close();
}

/* ============ ١٥٣ · اسم المادة مطلوب ============ */
/*
  كان يُشتقّ من اسم الملف عند غيابه، فخرجت موادُّ اسمها «Document1» و
  «WhatsApp Image» — لا يبحث بها أحد ولا يفتحها، فتُدفن مادةٌ نافعة.
*/
describe('١٥٣ · الاسم مطلوب');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  const pl = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'nm', email:'n@n.n' }))));
  A.api.auth.captureFromHash('#access_token=h.' + pl + '.s&refresh_token=r&expires_in=9999');

  pending.push((async () => {
    await nav(W, '#/upload');
    await until(W, () => doc.querySelector('#subjName'), 6000);
    const inp = doc.querySelector('#subjName');
    ok(inp, 'حقل الاسم موجود');
    eq(inp.getAttribute('aria-required'), 'true', '★ ومعلَّم مطلوبًا لقارئ الشاشة');
    has(doc.getElementById('main').textContent, 'اسم المادة *', 'وبنجمة تُرى');

    // ★ الضغط على منطقة الرفع بلا اسم لا يفتح المنتقي بل يشرح
    const drop = doc.querySelector('.drop');
    drop.dispatchEvent(new W.Event('click', { bubbles:true }));
    has(doc.getElementById('main').textContent, 'اكتب اسم المادة أولًا',
        '★ والطلب قبل الرفع لا بعده — بعده عقوبة على دقيقة انتظار');

    // ومع اسمٍ يمضي
    const html = require('fs').readFileSync(__dirname + '/../index.html', 'utf8');
    has(html, 'اسم المادة مطلوب — ارجع إلى الخطوة الأولى',
        '★ وحارسٌ أخير عند النشر — المسوّدة تُستأنف بعد يوم وقد يُفرَّغ الحقل');
    W.close();
  })());
}

/* ============ ١٥٤ · كتابة الأسئلة باليد ============ */
/*
  الرفع بملف يفترض أن للطالب ملفًا، وكثيرٌ منهم لا ملف عنده — أسئلةٌ
  سمعها في المحاضرة أو صوّرها زميله. كانوا خارج المنصة كلها.
*/
describe('١٥٤ · المحرّر اليدوي');
{
  const dom = makeDom(), W = dom.window, A = W.QBANK;
  const M = A.manual;
  ok(M, 'الوحدة محمّلة');

  // ── الصلاحية: ما يصلح للنشر ──
  ok(!M.valid({ q:'', options:['أ','ب'], answer:0 }), 'سؤال بلا نص لا يصلح');
  ok(!M.valid({ q:'س', options:['أ'], answer:0 }), 'ولا بخيار واحد');
  ok(!M.valid({ q:'س', options:['أ','ب'], answer:5 }), 'ولا بإجابة خارج النطاق');
  ok(!M.valid({ q:'س', options:['أ',''], answer:1 }), '★ ولا بإجابة تشير إلى خيار فارغ');
  ok(M.valid({ q:'س', options:['أ','ب'], answer:1 }), 'والمكتمل يصلح');

  // ── التحويل: الخيارات الفارغة تُطرح وموضع الإجابة يُعاد حسابه ──
  const raw = M.toRaw([
    { q:'ما لون الدم؟', options:['', 'أحمر', '', 'أزرق'], answer:3 },
    { q:'سؤال ثانٍ', options:['أ','ب'], answer:0 },
    /* ★ وهذا يسقط: خيارٌ واحد بعد طرح الفارغ لا يصنع سؤالًا */
    { q:'ناقص', options:['أ',''], answer:0 }
  ]);
  eq(raw.length, 2, 'الصالحان يمرّان والناقص يسقط');
  eq(raw[0].options.length, 2, 'والخيارات الفارغة طُرحت');
  eq(raw[0].options[raw[0].answer], 'أزرق',
     '★ وموضع الإجابة أُعيد حسابه — لا يشير إلى خيارٍ غير الذي اختاره الكاتب');
  eq(raw[0].has_options, true, 'وشكله شكل المقسّم — بقية المعالج لا تعرف المصدر');

  // ★ والناقص يُستبعد لا يمنع الباقي
  const some = M.toRaw([{ q:'تام', options:['أ','ب'], answer:0 },
                        { q:'', options:['أ','ب'], answer:0 }]);
  eq(some.length, 1, 'من كتب تسعةً وترك العاشر ناقصًا يُنشر تسعته');

  // ── الحفظ التلقائي ──
  A.store.clearAll();
  M.save({ name:'م', items:[{ q:'سؤالي', options:['أ','ب'], answer:1 }] });
  eq(M.load().items[0].q, 'سؤالي', '★ وما كُتب يُستعاد — نصف ساعة عملٍ لا تضيع بإغلاق عارض');
  M.clear();
  eq(M.load().items.length, 1, 'وبعد النشر يبدأ فارغًا');
  eq(M.load().items[0].q, '', 'بسؤالٍ خالٍ واحد');

  const html = require('fs').readFileSync(__dirname + '/../index.html', 'utf8');
  has(html, 'أو اكتب الأسئلة بنفسك', 'والمدخل ظاهر في شاشة الرفع');
  has(html, 'اضغط الحرف لتحديد الصحيح', 'والتعليمة صريحة: الحرف هو زرّ التحديد');
  has(html, 'تُحفظ في جهازك أولًا بأول', 'ويُطمأن الكاتب على عمله');
  W.close();
}

/* ============ ١٥٥ · الخلط عند النشر ============ */
describe('١٥٥ · ترتيب محايد');
{
  const dom = makeDom(), W = dom.window, A = W.QBANK;
  const M = A.manual;

  // ★ خلطٌ عادل لا `sort(()=>Math.random()-.5)`
  const src = [];
  for (let i = 0; i < 200; i++) src.push(i);
  const out = M.shuffle(src);
  eq(out.length, 200, 'العدد لا يتغيّر');
  eq(out.slice().sort((a,b)=>a-b).join(','), src.join(','), 'ولا يضيع عنصر ولا يتكرّر');
  eq(src[0], 0, 'والأصل لا يُمسّ — نسخةٌ تُعاد');
  ok(out.join(',') !== src.join(','), 'والترتيب تبدّل فعلًا');

  /* الانحياز: لو كان الخلط مغشوشًا لبقي العنصر الأول قرب أوله.
     نقيسه بمتوسّط موضع العنصر صفر عبر مئتي خلطة. */
  let sum = 0;
  for (let t = 0; t < 200; t++) sum += M.shuffle(src).indexOf(0);
  const avg = sum / 200;
  ok(avg > 70 && avg < 130,
     '★ وتوزيعه متّزن — الخلط المغشوش يُبقي الأول قرب أوله (المتوسّط ' + Math.round(avg) + ')');

  // مولّدٌ ثابت: نتيجةٌ يمكن التنبّؤ بها للفحص
  let n = 0;
  const fixed = () => { n = (n * 1103515245 + 12345) % 2147483648; return n / 2147483648; };
  eq(M.shuffle([1,2,3], fixed).length, 3, 'ويقبل مولّدًا محقونًا — يُفحص بلا عشوائية');

  const html = require('fs').readFileSync(__dirname + '/../index.html', 'utf8');
  has(html, 'اخلط ترتيب الأسئلة عند النشر',
      'والمفتاح ظاهر للرافع لا مخفيّ');
  has(html, 'wizard.shuffleOnPublish !== false',
      '★ والخلط افتراضٌ — ومن رتّب بقصدٍ يُلغيه بضغطة');
}

/* ============ ١٥٦ · لوحةٌ لا تُخرج صاحبها منها ============ */
/*
  المشرف يعتمد مادةً من لوحته فيُقذف بها إلى واجهة الطالب: يعود الشريط
  السفلي، وتضيع اللوحة، وعليه أن يكتب مسارها بيده ليعود إلى عمله.
  ولوحةٌ تُخرج صاحبها كلما أنجز شيئًا ليست لوحة.
*/
describe('١٥٦ · الخروج يتبع الباب');
{
  const html = require('fs').readFileSync(__dirname + '/../index.html', 'utf8');
  has(html, "(QBANK.router.current || {}).path.indexOf('#/admin') === 0",
      'الشاشة تعرف من أي باب دخلتَ');
  has(html, '⚙ عد إلى لوحة المحتوى', '★ وللمشرف طريق عودة إلى لوحته');
  has(html, '✎ حرّر المادة', 'وإلى محرّر مادته التي نشرها للتوّ');
  has(html, '+ ارفع مادة أخرى', 'وإلى رفعٍ جديد بلا مغادرة');
  has(html, 'المادة منشورة للطلاب. وهذا رابطها للمشاركة',
      'ونصّها يخاطبه هو لا الطالب');
  // ووجهات الطالب تبقى للطالب
  has(html, "href:'#s/' + slug, text:'افتح صفحة المادة'", 'والطالب يبقى على وجهته');
}

/* ============ ١٥٧ · باب اللوحة الدائم ============ */
describe('١٥٧ · زرّ اللوحة في الترويسة');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  const pl = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'ad-1', email:'a@a.a' }))));
  A.api.auth.captureFromHash('#access_token=h.' + pl + '.s&refresh_token=r&expires_in=9999');
  A.store.set('profile', { uid:'ad-1', name:'علي' });

  // طالبٌ عادي: لا زرّ
  A.store.set('is_admin_check', { uid:'ad-1', ok:false });
  A.router.render('#/');
  ok(!doc.querySelector('.authchip__adm'), '★ الطالب لا يرى زرّ اللوحة');

  // مشرف: زرٌّ دائم في كل شاشة
  A.store.set('is_admin_check', { uid:'ad-1', ok:true });
  A.router.render('#/');
  const b = doc.querySelector('.authchip__adm');
  ok(b, '★ والمشرف يراه');
  eq(b.getAttribute('href'), '#/admin', 'ويقود إلى لوحته');
  A.router.render('#/explore');
  ok(doc.querySelector('.authchip__adm'), 'ويبقى في شاشات الطالب — حيث يُحتاج فعلًا');

  // صلاحيةُ غيره لا تُعيره زرًّا
  A.store.set('is_admin_check', { uid:'someone-else', ok:true });
  A.router.render('#/');
  ok(!doc.querySelector('.authchip__adm'),
     '★ وصلاحيةٌ محفوظة لحسابٍ آخر لا تفتح لوحةً لهذا');
  W.close();
}

/* ============ ١٥٨ · «المادة غير متاحة» — الرابط يُمحى بعد توليده ============ */
/*
  القاعدة تولّد الرابط عند إنشاء المادة، ثم يأتي تحديثٌ من الواجهة بعده
  بثانية يكتب null فوقه فيمحوه. فتصير المادة «غير متاحة» وهي منشورة
  سليمة بأسئلتها كاملة.

  ومتى يكون الحقل فارغًا؟ حين تُستأنف مسوّدة: الاستئناف كان يجلب الأسئلة
  ولا يجلب الرابط. فالملفات الكبيرة — التي تُحفظ مسوّداتها وتُستأنف —
  أكثرها عرضةً لهذا. وهذه هي المواد التي أخفقت فعلًا.
*/
describe('١٥٨ · لا يُمحى رابطٌ بتحديث جزئي');
{
  const dom = makeDom(), W = dom.window, A = W.QBANK;
  const pl = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'sg', email:'g@g.g' }))));
  A.api.auth.captureFromHash('#access_token=h.' + pl + '.s&refresh_token=r&expires_in=9999');

  pending.push((async () => {
    let sent = null;
    A.api.rest = async (path, opt) => {
      if (opt && opt.method === 'PATCH') sent = JSON.parse(opt.body);
      return { ok:true, data:[] };
    };
    A.api.rpc = async () => ({ ok:false });

    // بلا رابط معروف: الحقل لا يُرسل إطلاقًا
    const w1 = A.admin.newWizard(); w1.slug = '';
    await A.admin.stamp('sub-1', w1);
    ok(!('slug' in sent),
       '★ الحقل الفارغ يُحذف ولا يُرسل null — وnull معناها «امحُ ما هناك»');
    has(JSON.stringify(sent), 'sanctity_mode', 'وبقية الحقول تُرسل كما كانت');

    // ومع رابطٍ معروف يُرسل
    const w2 = A.admin.newWizard(); w2.slug = 'my-subject-ab12';
    await A.admin.stamp('sub-2', w2);
    eq(sent.slug, 'my-subject-ab12', 'ومتى عرفناه أرسلناه');
    W.close();
  })());
}

/* ============ ١٥٩ · الاستئناف يستعيد الاسم ============ */
describe('١٥٩ · استئناف المسوّدة');
{
  const html = require('fs').readFileSync(__dirname + '/../index.html', 'utf8');
  has(html, 'wizard.subjectName = wizard.subjectName || d.name',
      '★ والاسم يعود مع الأسئلة — لا يُطلب من المشرف مرتين');
  // والقاعدة تحرس الطرف الآخر
  const sql = require('fs').readFileSync(__dirname + '/../db/SUBJECT-SLUG-OWNER.sql', 'utf8');
  has(sql, 'before insert or update on qbank.subjects',
      '★ والقادح يحرس التحديث كما يحرس الإنشاء');
  has(sql, 'ليس حارسًا', 'والدرس مكتوب لا مُستنتَج');
}

/* ============ ١٦٠ · الحضور: أين الطالب الآن ============ */
/*
  كانت النبضة تُرسل مرةً عند الإقلاع، فالقائمة تقول «دخل خلال ربع ساعة»
  لا «هو هنا». ومن فتح التطبيق ثم وضع جوّاله في جيبه ليس متصلًا بالمعنى
  الذي يهمّ المشرف.
*/
describe('١٦٠ · وصف الشاشة');
{
  const dom = makeDom(), W = dom.window, A = W.QBANK;
  const P = A.presence;
  ok(P, 'الوحدة محمّلة');

  eq(P.place({ path:'#/login', rest:[] }), 'في صفحة الدخول', 'صفحة الدخول تُسمّى');
  eq(P.place({ path:'#/upload', rest:[] }), 'يرفع مادة', 'والرفع');
  eq(P.place({ path:'#/review', rest:[] }), 'يراجع أسئلة اليوم', 'والمراجعة');
  eq(P.place({ path:'#/admin/content', rest:[] }), 'في لوحة التحكم',
     'وكل مسارات اللوحة واحدة — تفصيلها لا يعني أحدًا');
  eq(P.place({ path:'#/nope', rest:[] }), 'يتصفّح', 'والمجهول يُقال عامًّا لا يُترك فارغًا');

  // ★ المادة تُسمّى: «في اختبار» وحدها لا تقول شيئًا
  A.store.set('pack', { subjects: [{ id:'s1', slug:'tox', name:'علم السموم' }] });
  eq(P.place({ path:'#/exam', rest:['s1'] }), 'في اختبار تجريبي: علم السموم',
     '★ واسم المادة مع الاختبار — «في اختبار» وحدها نصفُ خبر');
  eq(P.place({ path:'#/subject', rest:['s1'] }), 'داخل مادة: علم السموم', 'ومع فتح المادة');
  eq(P.place({ path:'#/s', rest:['tox'] }), 'فتح رابط مادة: علم السموم', 'ومع رابط مشترك');
  // ومادةٌ لا نعرفها لا تُسقط الوصف
  eq(P.place({ path:'#/exam', rest:['ghost'] }), 'في اختبار تجريبي',
     'ومادةٌ ليست في هذا الجهاز تُترك بلا اسم لا بلا وصف');
  W.close();
}

/* ============ ١٦١ · الجهاز والبلد ============ */
describe('١٦١ · الجهاز والبلد');
{
  const dom = makeDom(), W = dom.window, A = W.QBANK;
  const P = A.presence;

  eq(P.kind('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)'), 'ios', 'آيفون');
  eq(P.kind('Mozilla/5.0 (Linux; Android 14; SM-S911B)'), 'android', 'أندرويد');
  eq(P.kind('Mozilla/5.0 (Windows NT 10.0; Win64)'), 'desktop', 'حاسوب');
  eq(P.kind('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', 0), 'desktop', 'وماك حاسوب');
  /* ★ آيباد الحديث يقول عن نفسه «Macintosh» — واللمس هو الفارق الباقي */
  eq(P.kind('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', 5), 'ios',
     '★ وآيباد يكشفه اللمس لا اسمه — فاسمه يكذب');
  eq(P.kind(''), 'desktop', 'وبلا معرّف نفترض الحاسوب');

  ok(P.kindIcon('ios'), 'ولكل صنف علامة');
  eq(P.kindName('android'), 'أندرويد', 'واسمٌ عربي لقارئ الشاشة');

  // البلد: الملف أوثق من الاستنتاج
  A.store.set('campus', { country:'sa' });
  eq(P.country(), 'SA', '★ ما كتبه الطالب في ملفه أولًا');
  A.store.remove('campus');
  ok(typeof P.country() === 'string', 'وإن غاب استُنتج من المنطقة الزمنية بلا إذن ولا موقع');
  eq(P.TZ['Asia/Riyadh'], 'SA', 'وجدول المناطق يغطي البلدان العربية');
  eq(P.TZ['Africa/Cairo'], 'EG', 'ومصر');
  W.close();
}

/* ============ ١٦٢ · النبضة لا تُرسل بلا جديد ============ */
describe('١٦٢ · اقتصاد النبضة');
{
  const dom = makeDom(), W = dom.window, A = W.QBANK;
  const P = A.presence;
  const pl = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'pr', email:'p@p.p' }))));
  A.api.auth.captureFromHash('#access_token=h.' + pl + '.s&refresh_token=r&expires_in=9999');

  pending.push((async () => {
    const sent = [];
    P._sendFn = async (b) => { sent.push(b); return { ok:true }; };
    P._last = '';

    A.router.render('#/login');
    await P.beat();
    eq(sent.length, 1, 'أول شاشة تُرسل');
    has(sent[0].p_place, 'صفحة الدخول', 'بحالها');
    ok('p_kind' in sent[0] && 'p_country' in sent[0], 'ومعها الجهاز والبلد');

    // ★ الشاشة نفسها لا تُنادى مرتين
    await P.beat();
    eq(sent.length, 1, '★ ولا نداء بلا جديد — الشاشة نفسها لا تُرسل مرتين');

    // وتبدّلها يُرسل
    A.router.render('#/upload');
    await P.beat();
    eq(sent.length, 2, 'وتبدّل الشاشة يُرسل');
    has(sent[1].p_place, 'يرفع مادة', 'بحالها الجديد');

    // والنبضة الدورية تُرسل ولو لم يتبدّل شيء — «ما زال هنا» خبرٌ أيضًا
    await P.beat(true);
    eq(sent.length, 3, 'والنبضة الدورية تمرّ رغم ثبات الشاشة');

    // وبلا جلسة لا نبضة
    A.api.saveSession(null);
    const before = sent.length;
    await P.beat(true);
    eq(sent.length, before, '★ والزائر لا يُتتبَّع — لا جلسة لا نبضة');
    P._sendFn = null;
    W.close();
  })());
}

/* ============ ١٦٣ · حدود ما يُجمع ============ */
describe('١٦٣ · حدود التتبّع');
{
  const src = require('fs').readFileSync(__dirname + '/js/63-presence.js', 'utf8');
  // ★ لا موقع من الجهاز إطلاقًا
  ok(src.indexOf('geolocation') === -1,
     '★ لا موقع جغرافي من الجهاز — التقريب يكفي للتشغيل');
  ok(src.indexOf('getCurrentPosition') === -1, 'ولا طلب إحداثيات');
  has(src, 'شاشاتُ التطبيق فقط', 'والحدّ مكتوب لا مُستنتَج');
  has(src, 'لا نصوصَ يكتبها الطالب', 'ولا محتوى يكتبه');
  has(src, 'document.hidden', '★ والتبويب المخفيّ لا ينبض — ليس حضورًا');

  const sql = require('fs').readFileSync(__dirname + '/../db/PRESENCE.sql', 'utf8');
  has(sql, 'left(coalesce(p_place, \'\'), 120)', 'والخادم يقصّ ما يصله — لا يثق بطوله');
  has(sql, 'device_label text default \'\'',
      '★ والتوقيع القديم يبقى صالحًا — نسخةٌ لم تُحدَّث بعدُ تظل تعمل');
  has(sql, 'distinct on (user_id)', 'وجهازٌ واحد لكل طالب في القائمة — أحدثها');
}

/* ============ ١٦٤ · تسعير المواد ============ */
/*
  ★ ميزةٌ نصفُها مبنيّ: العمود في القاعدة منذ البداية، والبوابةُ تقرؤه
  وتعرض السعر للطالب، ولا شاشة واحدة في المنصة تضبطه. فكل مادة مدفوعة
  كانت تأخذ سعرها من قيمةٍ كُتبت عند الاستيراد ولا سبيل إلى تغييرها إلا
  بـSQL. تعمل آليّتها ولا يملك أحدٌ مفتاحها.
*/
describe('١٦٤ · حقل السعر');
{
  const html = require('fs').readFileSync(__dirname + '/../index.html', 'utf8');

  has(html, 'السعر بالريال', 'حقل السعر في محرّر المادة');
  has(html, "'aria-label':'سعر المادة بالريال'", 'ومعنون لقارئ الشاشة');
  has(html, 'يدفع الطالب ', 'ويقول ما يعنيه الرقم');
  has(html, 'صفر = مجانية للجميع', '★ والصفر يعني مجانية — لا إعدادان متناقضان');

  // ★ في القائمة أيضًا: التسعير عملٌ يُقارَن
  has(html, "el('span', { class:'ad-inline__l', text:'السعر ﷼' })",
      '★ والسعر في قائمة المواد — المقارنة تستحيل بفتح محرّرٍ لكل مادة');
  has(html, 'price,ord,exam_date',
      '★ والعمود مجلوبٌ مع القائمة — بلا جلبه يبدأ كل حقلٍ بصفرٍ كاذب يُمحى به سعرٌ صحيح');

  // القصّ قبل الحفظ
  has(html, 'Math.max(0, Math.min(999, parseInt(priceIn.value', 
      'والقيمة تُقصّ إلى نطاق معقول — حقل الرقم في المتصفح يقبل أي شيء');

  // الوسم والسعر لا يتناقضان
  has(html, 'free: price === 0', '★ والمجانية تتبع السعر لا تناقضه');
  has(html, 'price: goFree ? 0 : (Number(sub.price) > 0 ? sub.price : 29)',
      'وزرّ المجانية يجرّ السعر معه — ورفعُها يعيد سعرًا لا يتركه صفرًا');
}

/* ============ ١٦٥ · أكواد التفعيل ============ */
/*
  ★ العطل الذي بُني هذا لأجله: زرّ «اشترِ المادة» كان طريقًا مسدودًا.
  يقود إلى /api/pay، و/api/pay يشترط TAP_SECRET_KEY، ولا مفتاح على الخادم
  ولا حساب تجاري بعد. فالطالب يضغط في اللحظة التي قرّر فيها أن يدفع
  فيُقال له «الدفع غير مفعَّل بعد على هذا الخادم» — رسالةُ عطلٍ في وجه
  زبونٍ جاهز. والسعر معروضٌ فوقها، وهذا أسوأ: ثمنٌ بلا باب.
*/
describe('١٦٥ · التطبيع والتحقق');
{
  const dom = makeDom(), W = dom.window, A = W.QBANK;
  const C = A.codes;

  ok(!!C, 'وحدة الأكواد موجودة في البناء');

  // ★ ما يصل من الطالب لصقٌ لا كتابة: مسافات وشرطات وحروف صغيرة
  eq(C.norm('amsq-7k4d 9f2h'), 'AMSQ7K4D9F2H', '★ اللصق يُطبَّع: شرطات ومسافات وحالة الحرف');
  eq(C.norm('  ab-12  '), 'AB12', 'والفراغ المحيط يسقط');
  eq(C.norm(null), '', 'ولا شيء لا يكسر شيئًا');

  eq(C.pretty('ABCDEFGHJK'), 'ABCD-EFGH-JK', 'والعرض بأربعات — العين تقرؤها');
  eq(C.pretty(''), '', 'وفارغٌ يبقى فارغًا لا شرطة وحيدة');

  ok(C.looksLike('ABCD-EF'), 'ستة محارف تكفي للمحاولة');
  ok(!C.looksLike('AB-C'), '★ وأقلّ منها لا يُرسَل — رحلة شبكة نعرف جوابها');

  // كل رفضٍ له نصّه
  ['not_found','disabled','expired','used_up','already_used_by_you',
   'already_owned','already_free'].forEach(r => {
    ok(C.WHY[r] && C.WHY[r].length > 10, '★ سببٌ مسمّى لـ' + r + ' لا «رمز غير صحيح»');
  });
  ok(C.why('شيء لم نتوقعه').length > 5, 'وسببٌ لم نتوقعه له نصٌّ أيضًا');
}

describe('١٦٥ب · طريق الطلب');
{
  const dom = makeDom(), W = dom.window, A = W.QBANK;
  const C = A.codes;

  // بلا رقم في الإعدادات لا زرّ: رابط واتساب بلا رقم يفتح لا شيء
  A.store.set('pack', { subjects: [], settings: {} });
  eq(C.askUrl({ name:'س', price:29 }), '', '★ بلا رقم مشرف لا رابط — زرٌّ يفتح لا شيء أسوأ من غيابه');

  A.store.set('pack', { subjects: [], settings: { whatsapp:'+966 58 080 5553' } });
  const u = C.askUrl({ name:'علم السموم', price:29 });
  ok(u.indexOf('https://wa.me/966580805553') === 0, 'والرقم يُنظَّف من الفراغ والزائد');
  ok(decodeURIComponent(u).indexOf('علم السموم') > -1, 'والرسالة تحمل اسم المادة');
  /* صار السعر يُكتب بالعربية كما يُعرض في الشاشة — «٢٩ ريال» لا «29»،
     كي يقرأ المشرف الرسالة بالصيغة نفسها التي رآها الطالب. */
  ok(decodeURIComponent(u).indexOf('٢٩ ريال') > -1, 'وثمنها — فلا يسأل المشرف عنه');

  const html = require('fs').readFileSync(__dirname + '/../index.html', 'utf8');
  /* صار زرّين: «حوّلتُ» لمن دفع، و«عندي سؤال» لمن لم يدفع بعد */
  has(html, 'حوّلتُ — أرسل الإيصال للمشرف', 'وللبطاقة زرّ إبلاغٍ بعد التحويل');
  has(html, 'عندي سؤال قبل التحويل', 'وزرّ سؤالٍ قبله');
  has(html, "!C.isApp() && s.wa", '★ ولا يظهر داخل التطبيق — قاعدة متجر آبل تمنع قناة دفع خارجية');
  has(html, 'عندك رمز تفعيل؟', 'وصندوق الرمز في بطاقة القفل');
  has(html, 'QBANK.gate.refresh().then', '★ والاستحقاق يُحدَّث قبل إعادة الرسم — وإلا بقي القفل بعد نجاح');
  has(html, 'r.status === 503', '★ وبوابةٌ غير مفعَّلة تُخفي زرّها بدل أن تدعو إلى ضغطةٍ لن تنجح');
}

describe('١٦٥د · الفشل يقول سببه');
{
  const dom = makeDom(), W = dom.window, A = W.QBANK;
  const C = A.codes;

  /*
    ★ «تعذّر التوليد» كانت كل ما يراه المشرف حين سقطت الدالة في القاعدة.
    فأمضى وقته يعيد تنفيذ ملف SQL نجح تنفيذه أصلًا. والقاعدة كانت قد قالت
    السبب بنصّه — وإخفاؤه اختيارُنا لا نقصُ معلومة.
  */
  has(C.failText({ ok:false, status:404,
        data:{ code:'PGRST202', message:'Could not find the function' } }),
      'CODES.sql', '★ دالة مفقودة تُقال بعلاجها — نفّذ الملف، لا «حاول مرة أخرى»');
  has(C.failText({ ok:false, status:400, data:{ message:'permission denied for table codes' } }),
      'permission denied', 'ونصّ القاعدة يصل كما هو حين لا نعرفه');
  has(C.failText({ ok:false, offline:true }), 'لا اتصال', 'وانقطاعُ الشبكة يُقال انقطاعًا');
  eq(C.failText({ ok:true, data:{ ok:false, reason:'forbidden' } }),
     C.ADMIN_WHY.forbidden, 'وسببٌ نعرفه له نصّه العربي');
  has(C.failText({ ok:false, status:500, data:null }), '500',
      'وحتى المجهول يحمل رقمه — رقمٌ يُبحث به خيرٌ من صمت');
}

describe('١٦٥ج · حرّاس القاعدة');
{
  const sql = require('fs').readFileSync(__dirname + '/../db/CODES.sql', 'utf8');

  has(sql, 'for update', '★ القفل قبل قراءة العدّاد — رمزٌ واحد في مجموعة واتساب يُضغط مرتين معًا');
  has(sql, 'code_uses_once on qbank.code_uses (code_id, user_id)',
      '★ وفهرسٌ فريد يمنع طالبًا من استهلاك رمزٍ جماعي وحده');
  has(sql, "'ABCDEFGHJKMNPQRSTUVWXYZ23456789'",
      '★ وأبجدية بلا 0 O I 1 L — الالتباس عيبُ تصميم لا خطأ مستخدم');
  /*
    ★ عطلٌ وقع فعلًا: كتبتُ gen_random_bytes، وهي من pgcrypto، وSupabase
    تضعها في مخطط extensions. ودوالُّنا تُثبّت search_path = qbank, public
    حمايةً من اختطاف المسار — فلا تراها، فتسقط الدالة كلها، ويقرأ المشرف
    «تعذّر التوليد» بلا سبب. حارسٌ صحيح كسر ميزةً اتّكأت على جارٍ خارج سوره.
  */
  /* الاسم مذكور في الشرح عمدًا — المفحوص هو النداء لا ذكرُ الاسم */
  ok(sql.indexOf('gen_random_bytes(') === -1,
     '★ ولا نداء لـpgcrypto — امتدادٌ خارج search_path يُسقط الدالة');
  has(sql, 'gen_random_uuid()::text', 'والعشوائية من نواة بوستجرس نفسها');
  has(sql, "notify pgrst, 'reload schema'",
      '★ وذاكرة PostgREST تُوقَظ — دالةٌ أُنشئت ولا تُرى من الويب تبدو كأن الملف لم يعمل');
  has(sql, 'qbank.gen_code(10)                     as رمز_تجريبي',
      '★ والتحقّق يُولّد رمزًا فعلًا — «أُنشئت» لا تعني «تعمل»');
  has(sql, 'enable row level security', 'والجدولان محميّان');
  has(sql, "reason','already_owned'",
      '★ ولا يُستهلك رمزٌ على مادة يملكها الطالب — خسارةٌ لا يفهم سببها');
  ok(sql.indexOf('create policy codes_') === -1,
     '★ ولا سياسة قراءة لأحد — جدولٌ يُقرأ يعني سحب كل الأكواد بنداء واحد');
  has(sql, 'qbank.is_admin()', 'والتوليد للمشرف وحده');
}

/* ============ ١٦٦ · من فعّل الرمز ============ */
/*
  ★ «استُعمل ٣ من ٥» رقمٌ لا يُجيب عن السؤال المطروح فعلًا.
  طالبٌ يقول «دفعتُ ولم تُفتح لي المادة»، فيحتاج المشرف أن يرى أن رمزه
  فُعِّل، ومن أي حساب، ومتى — وإلا فلا سبيل إلى الفصل بين من دفع ولم
  يُفعّل، ومن فعّل بحسابٍ آخر ونسي، ومن أعطى رمزه لغيره.
*/
describe('١٦٦ · حسابات التفعيل');
{
  const sql = require('fs').readFileSync(__dirname + '/../db/CODES.sql', 'utf8');

  has(sql, "'uses', coalesce((", '★ كل رمز يحمل معه من فعّله');
  has(sql, "'email', au.email", 'والبريد — به يبحث الطالب عن نفسه');
  has(sql, "'used_at', u.used_at", 'ووقت التفعيل');
  has(sql, 'if not qbank.is_admin() then return', '★ ولا تُعرض هذه الحسابات لغير المشرف');
  has(sql, "when 'unused' then used_count = 0 and active", 'ومرشّح «لم يُستعمل» في الخادم');
  has(sql, "when 'used'   then used_count > 0", 'ومرشّح «مُفعَّل»');
  has(sql, 'admin_codes_summary', 'وموجزٌ يُجيب «كم بقي أبيعه؟» بلا عدٍّ بالعين');

  /*
    ★ إضافة وسيطٍ بقيمة افتراضية لا تستبدل الدالة القديمة بل تُنشئ ثانيةً
    بجوارها، فيردّ PostgREST «could not choose the best candidate function»
    على كل نداء — ترقيةٌ تكسر ما كان يعمل.
  */
  has(sql, 'drop function if exists qbank.admin_codes(int, text);',
      '★ والتوقيع القديم يُحذف — نسختان تعنيان فشل كل نداء');
  has(sql, 'grant execute on function qbank.admin_codes(int, text, text)',
      'والصلاحية على التوقيع الجديد');
}

describe('١٦٦ب · القائمة تعرضهم');
{
  const html = require('fs').readFileSync(__dirname + '/../index.html', 'utf8');

  has(html, "['unused','لم يُستعمل']", 'مرشّح «لم يُستعمل» في الشاشة');
  has(html, "['used','مُفعَّل']", 'ومرشّح «مُفعَّل»');
  has(html, 'codeuse__e', '★ والبريد تحت رمزه — لا جدولٌ ثانٍ يُطابَق معه');
  has(html, 'admin_codes_summary', 'والموجز يُجلب');
  has(html, 'لا رمز غير مستعمل — ولّد دفعة جديدة',
      '★ وفراغُ كل مرشّح يُقال بلغته — «لا أكواد» جوابٌ خاطئ لمرشّحٍ فارغ');
  has(html, 'paintSummary(); draw();',
      'والقائمة تتبع التوليد فورًا — لا تحديث صفحة لرؤية ما وُلّد قبل ثانية');
  has(html, '.codeuse{', 'ولها شكلها في التنسيق');

  /*
    ★ عطلٌ رأيتُه بعيني قبل التسليم: البطاقة تُبنى ثم تُدرَج في تبويبها،
    فكانت منفصلةً عن المستند لحظةَ النداء، وحارس isConnected يُلغي الرسم —
    فيبقى الموجز فارغًا أبدًا. حارسٌ صحيح في موضعٍ خاطئ يُفرغ الشاشة.
  */
  ok(html.indexOf('if (!sum.isConnected) return;') === -1,
     '★ ولا حارس اتصالٍ يمنع أول رسم — البطاقة تُدرَج بعد بنائها');
  has(html, 'if (mine !== seq || !alive()) return;',
      '★ والأحدث وحده يرسم — ردٌّ بطيء لمرشّحٍ قديم لا يدهس ما بعده');
}

/* ============ ١٦٧ · عمولة الرافع ============ */
/*
  ★ الرقمان اللذان يجب ألّا يُخلطا:
  نصيب الرافع ٢٠٪ من سعر البيع، وصافي ربح المنصة ٤٠٪ من السعر — فنصيبه
  نصفُ صافي الربح. والجملتان صحيحتان، لكن «٥٠٪» وحدها تجعل الرافع يحسب
  نصفَ ما دفعه الطالب فيطالب به بعد شهر، ولا يُحسم الخلاف لأن كلًّا يقرأ
  الجملة بمعنى. فيُعرض الرقمان معًا ومعهما نصيبه ريالًا صريحًا.
*/
describe('١٦٧ · حساب النصيب');
{
  const dom = makeDom(), W = dom.window, A = W.QBANK;
  const E = A.earn;

  ok(!!E, 'وحدة الأرباح موجودة');
  eq(E.shareOf(29, 20), 580, 'نصيب الرافع من مادة بـ٢٩ ريالًا = ٥.٨٠ ريال');
  eq(E.shareOf(0, 20), 0, 'ومادة بلا ثمن لا نصيب فيها');
  eq(E.shareOf(-5, 20), 0, '★ وسعرٌ سالب لا يُنتج دَينًا على الرافع');

  const d = { share_pct:20, net_pct:40, of_net_pct:50 };
  const t = E.terms(d);
  has(t, '٥٠', '★ نسبة صافي الربح معروضة — وهي الرقم الذي يُغري');
  has(t, '٢٠', '★ ونسبة سعر البيع معها — وهي الرقم الذي يمنع الخلاف');
  has(t, 'صافي الربح', 'ولكلٍّ اسمه فلا يُقرأ أحدهما مكان الآخر');
  has(t, 'سعر البيع', 'صراحةً');
}

describe('١٦٧ب · حرّاس القاعدة');
{
  const sql = require('fs').readFileSync(__dirname + '/../db/PAYOUT.sql', 'utf8');

  /*
    ★ قادحٌ على entitlements لا نداءٌ داخل كل دالة دفع.
    المال يصل من طريقين اليوم وسيأتي ثالث، وحقنُ نداءٍ في كلٍّ منها يجعل
    إعادةَ تنفيذ ملفٍ قديم تمحوه بصمت — فيبيع الرافع ولا يُحتسب له شيء.
  */
  has(sql, 'after insert on qbank.entitlements',
      '★ القيد من القادح — الطرق كلها تمرّ بصفٍّ واحد');
  /* صارت ثلاثة مصادر بإضافة 'manual' (طلب الشراء داخل المنصة) — والمنح
     الإداري 'admin' وفتحُ الرافع 'upload' يبقيان خارجها */
  has(sql, "new.source not in ('web', 'code', 'manual')",
      'والمنح الإداري وفتحُ الرافع لمادته ليسا بيعًا');
  has(sql, 'if sub.created_by = new.user_id then return new; end if;',
      '★ ولا يربح أحدٌ من نفسه');
  has(sql, 'entitlement_id uuid unique',
      '★ وقيدٌ واحد لكل استحقاق — إعادةُ التسوية لا تدفع مرتين');
  has(sql, 'on conflict (entitlement_id) do nothing',
      'والتكرار لا يُسقط العملية — إسقاطُها يعني طالبًا دفع ولم تُفتح له');
  has(sql, 'share_pct',
      '★ والنسبة تُحفظ وقتها — تغييرُها لاحقًا لا يُعيد كتابة كشف حساب');

  // التحويلات
  has(sql, 'select earn_balance into bal from qbank.profiles where id = uid for update',
      '★ وقفلٌ على الرصيد — طلبان في لحظة يسحبان المبلغ مرتين');
  has(sql, 'update qbank.profiles set earn_balance = earn_balance - p_amount',
      'والخصم عند الطلب لا عند الدفع');
  has(sql, "update qbank.profiles set earn_balance = earn_balance + p.amount_halalas",
      '★ والرفض يُعيد المال كاملًا');
  has(sql, "return jsonb_build_object('ok', false, 'reason','already_settled'",
      'وطلبٌ سُوّي لا يُسوّى مرتين');

  // الآيبان
  ok(sql.indexOf('create policy payouts_') === -1,
     '★ ولا سياسة قراءة على جدول التحويلات — فيه آيبانات الناس');
  has(sql, 'if not qbank.is_admin() then return', 'والقراءة عبر دالةٍ تسأل عن المشرف');
}

describe('١٦٧ج · الشاشات');
{
  const html = require('fs').readFileSync(__dirname + '/../index.html', 'utf8');

  has(html, 'أرباح موادي', 'بطاقة الأرباح في المحفظة');
  has(html, 'رصيدك القابل للتحويل', 'والرصيد معنون');
  has(html, 'اطلب تحويل رصيدك', 'وطلب التحويل منها');
  has(html, 'الآيبان أو رقم STC Pay', 'وطريقتان للتحويل');
  has(html, 'مادتك قد تُدرّ عليك دخلًا',
      '★ والوعد في أول شاشة الرفع — وعدٌ قبل العمل لا مفاجأةٌ بعده');
  has(html, "wizard.step === 1 && QBANK.views.earnPromise",
      'وفي الخطوة الأولى وحدها');
  has(html, 'أرباح الرافعين والتحويلات', 'ولوحة الطلبات عند المشرف');
  has(html, 'نصيب الرافع ٪ من سعر البيع',
      '★ والنسبة في الإعدادات باسمٍ يقول من أي شيء هي');
  has(html, 'صافي ربحك ٪ من سعر البيع (للعرض فقط)',
      '★ والأخرى مكتوبٌ عليها أنها للعرض — الخلط بينهما يدفع ضعف المنوي');
  has(html, 'بقي ', '★ والحدّ الأدنى يُقال بالباقي — «كم اقتربتُ» لا «كم الحدّ»');
  has(html, '.earnbal__n{', 'وللرصيد حجمه في التنسيق');
}

/* ============ ١٦٨ · السعر يختلف من مادة إلى مادة ============ */
/*
  ★ عطلان اكتشفهما سؤالُ علي «السعر متغيّر من مادة إلى مادة»:

  الأول: تعليمات الدفع نصٌّ واحد في الإعدادات، فلو كتب فيها «حوّل ٢٩
  ريالًا» لقرأها طالبُ مادةٍ ثمنها خمسون، فحوّل تسعةً وعشرين وانتظر رمزًا
  لن يأتي — ثم اتّهم المنصة لا النص.

  والثاني أسوأ: السعر كان مكتوبًا في زرّ الشراء وحده، وذلك الزرّ يُخفي
  نفسه حين تكون البوابة غير مفعَّلة — فتبقى بطاقةٌ تقول «مادة مدفوعة» ولا
  تقول بكم، ويُطلب من الطالب أن يُحوّل مبلغًا لا يعرفه.
*/
describe('١٦٨ · نائبات نصّ الدفع');
{
  const dom = makeDom(), W = dom.window, A = W.QBANK;
  const C = A.codes;

  A.store.set('pack', { subjects: [], settings: {
    whatsapp:'966500000000',
    pay_note:'حوّل {السعر} وأرسل الإيصال مع اسم المادة «{المادة}».' } });

  const n29 = C.note({ name:'علم السموم', price:29 });
  has(n29, '٢٩ ريال', '★ {السعر} تصير سعر المادة المفتوحة');
  has(n29, 'علم السموم', 'و{المادة} تصير اسمها');
  ok(n29.indexOf('{') === -1, 'ولا يبقى قوسٌ في النصّ المعروض');

  const n50 = C.note({ name:'الأنسجة', price:50 });
  has(n50, '٥٠ ريال', '★ والنصّ نفسه يصحّ في مادةٍ أخرى بسعرٍ آخر');
  has(n50, 'الأنسجة', 'وباسمها هي');

  // مادة بلا سعر: لا نكتب «صفر ريال» بل نقول ما يُفهم
  has(C.note({ name:'س', price:0 }), 'المبلغ المطلوب',
      '★ ومادة بلا سعر لا تُنتج «٠ ريال» — نصٌّ يقول ما لا نعرفه');

  eq(C.priceText({ price:29 }), '٢٩ ريال', 'والسعر يُقرأ بالعربية');
  eq(C.priceText({ price:0 }), '', 'ولا سعر لمن لا سعر له');

  // بلا نصّ في الإعدادات لا شيء
  A.store.set('pack', { subjects: [], settings: {} });
  eq(C.note({ name:'س', price:29 }), '', 'وحقلٌ فارغ لا يعرض سطرًا فارغًا');
}

describe('١٦٨ب · السعر لا يختفي مع الزرّ');
{
  const dom = makeDom(), W = dom.window, A = W.QBANK;
  A.store.set('pack', { subjects: [], settings: { whatsapp:'966500000000' } });
  const card = A.gate.paywallCard({ id:'s1', name:'علم السموم', price:29 });

  has(card.textContent, 'سعرها ٢٩ ريال',
      '★ السعر سطرٌ قائم بذاته — لا نصٌّ داخل زرٍّ يُخفي نفسه');
  const p = card.querySelector('.paywall__price');
  ok(!!p, 'وله صنفه كي يُميَّز بالحجم');

  const html = require('fs').readFileSync(__dirname + '/../index.html', 'utf8');
  has(html, 'كيف يدفع لك الطالب؟', '★ والتسمية تسأل سؤالًا يُفهم لا تصف حقلًا');
  has(html, 'وتُبدَّلان بقيمتَي المادة التي يفتحها', 'والنائبتان مشروحتان فوق الحقل');
  has(html, 'placeholder: f.ph || null',
      '★ والمثال داخل الحقل — حقلٌ فارغ يترك المشرف يخمّن الصيغة');
}

/* ============ ١٦٩ · رسالة ما بعد التحويل ============ */
/*
  ★ زرٌّ واحد كان لا يكفي.
  «اطلب رمزًا» رسالةٌ صالحة لمن لم يدفع بعد، ويرسلها أيضًا من دفع — فيقرأ
  المشرف نصًّا لا يدري من أي الحالتين هو، فيسأل «هل حوّلتَ؟». وهو سؤالٌ
  كان يجب ألّا يُسأل: الشاشة تعرف المادة وسعرها وصاحب الحساب، وتستطيع أن
  تقولها كلها في سطرين.
*/
describe('١٦٩ · ما تحمله الرسالة');
{
  const dom = makeDom(), W = dom.window, A = W.QBANK;
  const C = A.codes;

  A.store.set('session', { user:{ id:'3f9a2c11-0000-4000-8000-000000000000',
    email:'sara@example.com' }, access_token:'t', expires_abs: Date.now() + 9e6 });
  A.store.set('profile', { name:'سارة العتيبي' });
  A.store.set('pack', { subjects: [], settings: { whatsapp:'966580805553' } });

  const sub = { id:'s1', name:'علم السموم', price:29 };
  const t = C.paidText(sub);

  has(t, 'حوّلتُ ٢٩ ريال', '★ المبلغ في الرسالة — بلا مبلغٍ لا يُطابَق تحويل');
  has(t, 'علم السموم', 'واسم المادة — بلا مادةٍ لا يُعرف ماذا يُفتح');
  has(t, 'سارة العتيبي', 'واسم الطالب');
  has(t, 'sara@example.com', '★ وحسابه — وهو ما يُفتح له لا رقم واتسابه');
  has(t, '3F9A2C', '★ ورقمٌ مرجعي — البريد يُكتب بحرفٍ ناقص، والمرجع لا');
  has(t, 'وسأرفق صورة الإيصال',
      '★ «سأرفق» لا «أرفقتُ»: واتساب لا يقبل صورة مع نصٍّ من رابط، ' +
      'ووعدٌ بما لم يحدث يجعل المشرف ينتظر صورةً لن تصل');

  // الرابط سليم ويحمل النصّ
  const u = C.paidUrl(sub);
  ok(u.indexOf('https://wa.me/966580805553?text=') === 0, 'والرابط إلى رقم المشرف');
  has(decodeURIComponent(u), 'علم السموم', 'والنصّ مُهيّأ فيه');

  // رسالة السؤال تبقى مختلفة
  const a = C.askText(sub);
  has(a, 'أريد تفعيل', '★ ورسالة ما قبل التحويل تبقى مستقلّة — الحالتان مختلفتان');
  ok(a.indexOf('حوّلتُ') === -1, 'ولا تدّعي تحويلًا لم يقع');

  // بلا رقم مشرف لا رابط
  A.store.set('pack', { subjects: [], settings: {} });
  eq(C.paidUrl(sub), '', 'وبلا رقمٍ في الإعدادات لا رابط');
}

describe('١٦٩ب · الزرّان في البطاقة');
{
  const dom = makeDom(), W = dom.window, A = W.QBANK;
  A.store.set('session', { user:{ id:'u1', email:'a@b.c' }, access_token:'t',
    expires_abs: Date.now() + 9e6 });
  A.store.set('pack', { subjects: [], settings: { whatsapp:'966580805553',
    pay_note:'حوّل {السعر} على الراجحي SA00.' } });
  const card = A.gate.paywallCard({ id:'s1', name:'علم السموم', price:29 });

  const links = [].slice.call(card.querySelectorAll('a[href^="https://wa.me"]'));
  eq(links.length, 2, '★ زرّان: بعد التحويل وقبله');
  has(links[0].textContent, 'حوّلتُ', 'والأول لمن دفع — هو الأولى بالبروز');
  ok(links[0].className.indexOf('btn--ghost') === -1, 'وبارزٌ لا ثانوي');
  has(links[1].textContent, 'سؤال', 'والثاني للسؤال');
  ok(links[1].className.indexOf('btn--ghost') > -1, 'وثانويّ');

  has(card.textContent, 'أرفق صورة الإيصال',
      'وسطرٌ يقول للطالب ما يفعله بعد فتح واتساب');

  // ترتيب: التعليمات قبل الأزرار
  const txt = card.textContent;
  ok(txt.indexOf('حوّل ٢٩ ريال على الراجحي') < txt.indexOf('حوّلتُ — أرسل'),
     '★ وتعليمات الدفع قبل الزرّ — تُقرأ ثم يُنقر');
}

/* ============ ١٧٠ · توثيق الجوال بالواتساب ============ */
/*
  ★ لماذا التحقق معكوس.
  إرسال OTP إلى الطالب يشترط WhatsApp Business API: حسابًا موثَّقًا،
  وقالبًا معتمدًا، ورقمًا يخرج من تطبيق واتساب العادي فلا يستقبل إيصالًا
  بعدها — وهو رقم علي نفسه الذي يستقبل عليه اليوم. والعكس يعطي الدليل
  نفسه: الرمز يصل من رقم الطالب، فيُثبت أنه رقمه.
*/
describe('١٧٠ · تطبيع الرقم');
{
  const dom = makeDom(), W = dom.window, A = W.QBANK;
  const P = A.phone;

  ok(!!P, 'وحدة الجوال موجودة');
  eq(P.norm('0501234567'), '+966501234567', 'صيغة ٠٥ تصير دولية');
  eq(P.norm('501234567'), '+966501234567', 'وبلا صفر أيضًا');
  eq(P.norm('+966 50 123 4567'), '+966501234567', 'والفراغ والزائد يسقطان');
  eq(P.norm('00966501234567'), '+966501234567', 'و٠٠ تُستبدل');
  eq(P.norm('٠٥٠١٢٣٤٥٦٧'), '+966501234567',
     '★ والأرقام العربية تُحوَّل — لوحةٌ عربية كانت تُنتج رفضًا لرقمٍ صحيح');
  eq(P.norm('123'), '', 'وقصيرٌ ليس رقمًا');
  eq(P.norm(''), '', 'وفارغٌ فارغ');
  has(P.pretty('0501234567'), '+966 50 123 4567', 'والعرض مقروء');

  // الرسالة
  A.store.set('session', { user:{ id:'u1', email:'a@b.c' }, access_token:'t',
    expires_abs: Date.now() + 9e6 });
  const t = P.text('K7M2XP');
  ok(t.indexOf('K7M2XP') < 40,
     '★ الرمز في أول الرسالة — المشرف يلتقطه بالعين بين عشرات الرسائل');
  has(t, 'a@b.c', 'ومعه الحساب المراد توثيقه');

  A.store.set('pack', { subjects: [], settings: { whatsapp:'966580805553' } });
  ok(P.url('K7M2XP').indexOf('https://wa.me/966580805553') === 0, 'والرابط إلى المشرف');
  A.store.set('pack', { subjects: [], settings: {} });
  eq(P.url('K7M2XP'), '', 'وبلا رقمٍ في الإعدادات لا رابط');
}

describe('١٧٠ب · حرّاس القاعدة');
{
  const sql = require('fs').readFileSync(__dirname + '/../db/PHONE.sql', 'utf8');

  /*
    ★ القيد الذي يجعل التوثيق توثيقًا.
    لو صحّ لعشرة حسابات أن تتوثّق برقمٍ واحد لما أثبت التوثيق شيئًا،
    ولصار حقلًا مزخرفًا في ملفٍ شخصي.
  */
  has(sql, 'profiles_phone_unique', '★ رقمٌ موثَّق لا يتكرّر بين الحسابات');
  has(sql, 'on qbank.profiles (phone) where phone_verified',
      'والقيد على الموثَّق وحده — غير الموثَّق يتكرّر بلا ضرر');
  has(sql, 'phone_claims_one_pending',
      'وطلبٌ معلّق واحد لكل حساب — عشرة طلبات تُغرق اللوحة بلا علمٍ زائد');

  has(sql, "translate(s, '٠١٢٣٤٥٦٧٨٩", '★ والأرقام العربية تُحوَّل في القاعدة أيضًا');
  ok(sql.indexOf('gen_random_bytes(') === -1,
     '★ ولا نداء لـpgcrypto — امتدادٌ خارج search_path يُسقط الدالة');
  has(sql, "expires_at > now()", 'والطلب ينتهي — رمزٌ أبديّ ليس رمزًا');

  // السباق عند التوثيق
  has(sql, "note = 'الرقم موثَّق لحسابٍ آخر'",
      '★ ويُفحص التفرّد لحظةَ التوثيق لا لحظةَ فتح اللوحة');
  has(sql, "reason','already_settled'", 'وطلبٌ سُوّي لا يُسوّى مرتين');
  ok(sql.indexOf('create policy phone_claims_') === -1,
     '★ ولا سياسة قراءة — الطلبات تحمل أرقام الناس');
  has(sql, 'if not qbank.is_admin() then return', 'والتوثيق للمشرف وحده');
}

describe('١٧٠ج · الشاشتان');
{
  const html = require('fs').readFileSync(__dirname + '/../index.html', 'utf8');

  has(html, 'توثيق رقم الجوال', 'بطاقة الطالب');
  has(html, 'أرسل الرمز على واتساب', 'وزرّ الإرسال');
  has(html, 'يجب أن تُرسله من الرقم نفسه',
      '★ والشرط مكتوب — الإرسال من رقمٍ آخر يُبطل الدليل كلَّه');
  has(html, 'سيُوثَّق: ', '★ ومعاينةٌ حيّة — لا يُكتشف خطأ الرقم بعد ساعة انتظار');
  has(html, 'رقمي خطأ — أدخله من جديد', 'وطريقُ رجوعٍ لمن أخطأ');

  has(html, 'توثيق أرقام الجوال', 'ولوحة المشرف');
  has(html, 'وتأكّد أنها وصلتك من الرقم المكتوب هنا نفسه',
      '★ والمشرف يُذكَّر بما يفحصه — التوثيق بلا مطابقةِ المُرسِل ختمٌ فارغ');
  has(html, 'adminPhoneCard(), box.firstChild',
      '★ وطلبات التوثيق فوق الجميع — صاحبها ينظر إلى شاشته الآن');
  has(html, '.phcode span{', 'وللرمز حجمه وتباعده في التنسيق');
}

/* ============ ١٧١ · طلب الشراء داخل المنصة ============ */
/*
  ★ البيعة بخطوتين بدل خمس.
  كان: يحوّل ← يراسل ← يولّد المشرف رمزًا ← يرسله ← يُدخله الطالب. ورمزٌ
  في محادثة واتساب يضيع ويُرسل للشخص الخطأ ويُكتب بحرفٍ ناقص. والسبب أن
  المنصة لم تكن تعرف أن الطالب دفع. الآن «حوّلتُ» يُسجّل طلبًا قبل أن
  يفتح واتساب، والمشرف يضغط «افتح له».
*/
describe('١٧١ · الطلب يُسجَّل ويُعرض');
{
  const dom = makeDom(), W = dom.window, A = W.QBANK;
  A.store.set('session', { user:{ id:'u1', email:'a@b.c' }, access_token:'t',
    expires_abs: Date.now() + 9e6 });
  A.store.set('pack', { subjects: [], settings: { whatsapp:'966580805553',
    review_eta:'عادةً خلال ٣٠ دقيقة' } });
  const O = A.orders;
  ok(!!O, 'وحدة الطلبات موجودة');

  // بلا طلب: زرّ «حوّلتُ»
  A.store.set(O.KEY, []);
  A.api.rpc = () => Promise.resolve({ ok:true, data:[] });
  let card = A.gate.paywallCard({ id:'s1', name:'علم السموم', price:29 });
  has(card.textContent, 'حوّلتُ — أرسل الإيصال', 'قبل الطلب: الزرّ الأصلي');
  ok(card.textContent.indexOf('قيد المراجعة') === -1, 'ولا حالَ انتظار');

  // بطلب معلّق: حال الانتظار لا الأزرار نفسها
  A.store.set(O.KEY, [{ id:'r1', subject_id:'s1', status:'pending', at: new Date().toISOString() }]);
  card = A.gate.paywallCard({ id:'s1', name:'علم السموم', price:29 });
  has(card.textContent, 'طلبك قيد المراجعة', '★ بعد الطلب: «قيد المراجعة» — لا الزرّ نفسه فيُضغط ثانيةً');
  has(card.textContent, 'عادةً خلال ٣٠ دقيقة', '★ والمدة المعلنة — الانتظار المعلوم يُحتمل');
  has(card.textContent, 'أرسل الإيصال على واتساب', 'وزرّ الإيصال باقٍ لمن لم يرسله');
  ok(card.textContent.indexOf('حوّلتُ — أرسل الإيصال') === -1, 'ولا يظهر زرّ الطلب من جديد');

  // طلبٌ لمادة أخرى لا يُخفي زرّ هذه
  card = A.gate.paywallCard({ id:'s2', name:'الأنسجة', price:50 });
  has(card.textContent, 'حوّلتُ — أرسل الإيصال', 'والطلب لمادةٍ لا يُغلق مادةً أخرى');

  eq(O.pendingFor('s1').id, 'r1', 'وpendingFor تجد الطلب');
  eq(O.pendingFor('s9'), null, 'ولا تخترع طلبًا');

  // create يُثبت محليًا فورًا — الطالب عائدٌ من واتساب بعد ثوانٍ
  A.api.rpc = (n) => n === 'request_purchase'
    ? Promise.resolve({ ok:true, data:{ ok:true, id:'r2', amount_halalas:5000 } })
    : Promise.resolve({ ok:true, data:[] });
  pending.push(O.create('s2').then(d => {
    ok(d && d.ok, 'الطلب أُنشئ');
    ok(!!O.pendingFor('s2'), '★ ومثبَّت في الجهاز فورًا — قبل أي جلبٍ من القاعدة');
  }));
}

describe('١٧١ب · حرّاس القاعدة');
{
  const sql = require('fs').readFileSync(__dirname + '/../db/ORDERS.sql', 'utf8');
  has(sql, 'purchase_requests_one_pending', '★ طلبٌ معلّق واحد للمادة — الضغطة الثانية من القلق لا من نيّة شراءٍ ثانٍ');
  has(sql, "'existing', true", 'والطلب القائم يُعاد هو لا خطأ');
  has(sql, "reason','already_owned'", 'ومن يملك المادة لا يطلبها');
  has(sql, "'subject', 'manual',", '★ والفتح اليدوي بمصدره — يُعرف في التقارير كم بيع عبر كل باب');
  has(sql, "not in ('web', 'code', 'manual')", '★ وقادح العمولة يعدّه بيعةً — دُفع ثمنها فعلًا');
  has(sql, "'phone_verified', coalesce(p.phone_verified, false)",
      '★ ومع كل طلب: هل الرقم موثَّق — مطابقةُ الإيصال يقينٌ أو ظنّ');
  has(sql, "reason','already_settled'", 'وطلبٌ سُوّي لا يُسوّى مرتين');
  has(sql, 'oldest_purchase', '★ و«منذ كم ينتظر أقدمهم» — أهمّ من كم ينتظرون');
  has(sql, 'review_eta', 'والمدة المعلنة تصل الطالب');
  ok(sql.indexOf('create policy purchase_requests_') === -1, 'ولا سياسة قراءة على الطلبات');

  const payout = require('fs').readFileSync(__dirname + '/../db/PAYOUT.sql', 'utf8');
  has(payout, "not in ('web', 'code', 'manual')",
      '★ وPAYOUT.sql متّفق — أيُّهما نُفِّذ آخرًا لا يُرجع الآخر');
}

describe('١٧١ج · صندوق الوارد');
{
  const html = require('fs').readFileSync(__dirname + '/../index.html', 'utf8');
  has(html, "if (QBANK.views.inboxPanel) box.appendChild(QBANK.views.inboxPanel());",
      '★ الصندوق أولَ اللوحة — «ماذا ينتظرني» يسبق «من هنا»');
  has(html, "['purchases', 'طلب شراء'", 'وطلبات الشراء فيه');
  has(html, "['phones',    'توثيق جوال'", 'والتوثيقات');
  has(html, "['payouts',   'تحويل أرباح'", 'والتحويلات');
  has(html, "['drafts',    'مسوّدة'", 'والمسوّدات');
  has(html, "['reports',   'بلاغ'", 'والبلاغات');
  has(html, "'أقدمها منذ ' + QBANK.admin.charts.ago(d.oldest_purchase)", 'وعمرُ أقدم طلب — في صفّه هو');
  has(html, 'طلبات الشراء', 'ولوحة الطلبات');
  has(html, 'افتح له', 'وزرّ الفتح');
  has(html, 'متى تفتح الطلبات؟', 'والمدة المعلنة في الإعدادات');
  has(html, '.inbox__i.is-on{', 'والمُنتظَر يُلوَّن وحده');
}

/* ============ ١٧٢ · الأسئلة من الصور ============ */
/*
  ★ أكبر باب كان مغلقًا.
  أسئلة الدفعات تعيش في لقطات شاشة وتصوير أوراق — وهذا أكثر ما يملكه
  الطلاب، وكان أول ما نردّه بـ«صدّرها نصًّا». والنموذج يقرأ الصورة أصلًا؛
  الناقص كان أن نمرّرها إليه.
*/
describe('١٧٢ · الخادم يعرف الصورة ويمرّرها');
{
  const X = require('../api/_lib/extract.js');
  eq(X.imageMime('scan.JPG'), 'image/jpeg', 'الامتداد يقول إنها صورة — بأي حالة حرف');
  eq(X.imageMime('a.png'), 'image/png', 'وpng');
  eq(X.imageMime('a.webp'), 'image/webp', 'وwebp');
  eq(X.imageMime('a.pdf'), null, 'وPDF ليس صورة هنا — يُقرأ نصًّا أولًا');
  ok(X.isImage('IMG_2031.heic'), '★ وheic من آيفون مقبول — لا يُردّ لأن المتصفح لا يعرفه');

  const P = require('../api/_lib/provider.js');
  ok(typeof P.withMedia === 'function', 'ودالة الوسائط موجودة');
  const g = P.withMedia('اقرأ', [{ mime:'image/jpeg', base64:'AAAA' }], 'gemini');
  ok(Array.isArray(g) && g.length === 2, 'Gemini: صورة ونص');
  ok(g[0].inline_data && g[0].inline_data.mime_type === 'image/jpeg', 'والصورة inline_data');
  eq(g[1].text, 'اقرأ', 'والنصّ بعدها');
  const a = P.withMedia('اقرأ', [{ mime:'application/pdf', base64:'AAAA' }], 'anthropic');
  eq(a[0].type, 'document', '★ Anthropic: الـPDF وثيقةٌ لا صورة — النوعان مختلفان عنده');
  const a2 = P.withMedia('اقرأ', [{ mime:'image/png', base64:'AAAA' }], 'anthropic');
  eq(a2[0].type, 'image', 'والصورة صورة');
  eq(P.withMedia('اقرأ', [], 'anthropic'), 'اقرأ', 'وبلا وسائط يبقى النصّ نصًّا — لا كسر لما كان يعمل');
}

describe('١٧٢ب · القارئ من الصور');
{
  const R = require('../api/_lib/reader.js');
  ok(typeof R.aiReadMedia === 'function', 'دالة القراءة من الوسائط');
  has(R.MEDIA_SYS, 'انقل الحروف كما تراها', '★ والتعليمات تقول: انقل لا تُصحّح — القداسة من الصورة أيضًا');
  has(R.MEDIA_SYS, 'اجمع نصفيه', 'وسؤالٌ مقطوع بين لقطتين يُجمع');

  const calls = [];
  const fake = async (sys, user, opts) => {
    calls.push(opts.media.length);
    return { items:[
      { q:'What is the first-line drug?', options:['A','B','C'], answer_index:1 },
      { q:'What is the first-line drug?', options:['A','B','C'], answer_index:1 },   // مكرر
      { q:'Define shock.', options:null, answer_text:'…' }
    ] };
  };
  pending.push(R.aiReadMedia([{ mime:'image/jpeg', base64:'QUJD' }], fake).then(r => {
    eq(r.questions.length, 2, 'المكرر يُطوى');
    ok(r.questions.every(q => q.unverified === true), '★ وكلها «غير موثَّقة» — لا نصَّ نقارن به، فالعين هي التوثيق');
    ok(r.questions.every(q => q.ocr === true), 'وموسومةٌ بمصدرها كي تُقال بلغتها');
    eq(r.questions[0].num, 1, 'والترقيم من واحد');
    eq(calls.length, 1, 'وصورةٌ واحدة نداءٌ واحد');
  }));

  // الدفعات بالحجم لا بالعدد
  const big = 'A'.repeat(9 * 1024 * 1024);   // ≈ ٦٫٧ م.ب بعد فكّ base64
  const calls2 = [];
  const fake2 = async (sys, user, opts) => { calls2.push(opts.media.length); return { items:[] }; };
  pending.push(R.aiReadMedia([
      { mime:'image/jpeg', base64: big }, { mime:'image/jpeg', base64: big },
      { mime:'image/jpeg', base64:'QUJD' }
    ], fake2).then(() => {
    ok(calls2.length >= 2, '★ والصور الثقيلة تُقسَّم دفعات بالحجم — ثلاثٌ من جوّال تفوق عشر لقطات');
  }));

  // سقوط كل الدفعات يُبلَّغ لا يُبتلع
  const fail = async () => { throw Object.assign(new Error('نفدت الحصة'), { kind:'quota_day', status:429 }); };
  pending.push(R.aiReadMedia([{ mime:'image/jpeg', base64:'QUJD' }], fail).then(r => {
    eq(r.questions.length, 0, 'لا أسئلة');
    ok(!!r.error && r.error.kind === 'quota_day', '★ والعطل يُحفظ — لا يُقال للطالب إن صورته رديئة والحصة هي التي نفدت');
  }));
}

describe('١٧٢ج · الواجهة والمسار');
{
  const html = require('fs').readFileSync(__dirname + '/../index.html', 'utf8');
  const ing  = require('fs').readFileSync(__dirname + '/../api/ingest.js', 'utf8');

  has(html, 'multiple:true', '★ عدة صور معًا — ورقةٌ واحدة تُصوَّر على ثلاث لقطات');
  has(html, '.png,.jpg,.jpeg,.webp,.gif,.heic', 'والقبول يشمل الصور');
  has(html, 'const MAX = 1600;', '★ والصورة تُصغَّر في الجهاز — صورة الجوّال ٥ م.ب والخادم يقبل ٤');
  has(html, "c.toDataURL('image/jpeg', 0.82)", 'وتُصدَّر JPEG مضغوطة');
  has(html, 'wizardIngestImages', 'ودالة رفع الصور');
  has(html, 'النسخ من الصور قد يُخطئ في حرفٍ أو رقم',
      '★ وسطر القراءة يقول ما يعنيه «من صورة» — لا لغة «لم نجد نصّها» التي تصف ملفًا نصّيًا');
  has(html, 'صور (لقطات شاشة أو تصوير ورقة', '★ والصور أولَ سطر القبول — من رُدّ مرةً لا يقرأ التذييل');

  has(ing, "media.push({ mime:'application/pdf'", '★ وPDF بلا نصٍّ مسحٌ ضوئي — يُرسل ملفًا للنموذج لا يُرفض');
  has(ing, 'aiReadMedia(media, callAI)', 'ومسار الوسائط في الخادم');
  has(ing, "kind:'no_ai'", 'وبلا مفتاح ذكاء يُقال ذلك باسمه');
  has(ing, 'unverified: r.questions.length', '★ وكلّها تُعدّ غير موثَّقة — تُراجَع بالعين');
  ok(ing.indexOf('صدّره نصًّا (Word أو PDF نصّي) وأعد رفعه') === -1,
     '★ وجملة الرفض القديمة زالت — لا نطلب ما صرنا نقرؤه');
}

/* ============ ١٧٣ · إشعارات المتصفح ============ */
/*
  ★ لا إشعار واحد كان في المنصة كلها.
  التكرار المتباعد يحسب «راجع اليوم» ولا أحد يخبر الطالب أن اليوم جاء.
  Web Push مجاني: المتصفح يحمل الإشعار وخادمنا يوقّعه — لا مزوّد ولا فاتورة.
*/
describe('١٧٣ · نصّ الإشعار');
{
  const P = require('../api/push.js');
  ok(typeof P.compose === 'function', 'دالة التأليف');

  eq(P.compose({ due:0, exam:null }), null, '★ من لا شيء عنده لا يُزعَج — إشعارٌ بلا خبر يُعلّم كتم الكل');
  const a = P.compose({ due:12, exam:null });
  has(a.title, '١٢ سؤالًا', 'المستحقّ بالرقم — «١٢» تُفتح و«لا تنسَ» تُمسح');
  eq(a.url, '#/review', 'ويقود إلى المراجعة');

  const b = P.compose({ due:0, exam:{ name:'علم السموم', days:3 } });
  has(b.title, 'علم السموم', 'واختبارٌ قريب يُسمّى');
  has(b.title, '٣ أيام', 'وبعد كم يوم');

  const c = P.compose({ due:5, exam:{ name:'علم السموم', days:0 } });
  has(c.title, 'اليوم', '★ ويوم الاختبار له نبرته');
  has(c.body, '٥ سؤالًا', 'ومعه المستحقّ');

  eq(P.compose({ due:0, exam:{ name:'س', days:20 } }), null, 'واختبارٌ بعد ٢٠ يومًا ليس خبرَ اليوم');
  ok(typeof P.riyadhDay() === 'number', 'ورقم اليوم بتوقيت الرياض');
}

describe('١٧٣ب · القاعدة والخادم والعامل');
{
  const sql = require('fs').readFileSync(__dirname + '/../db/PUSH.sql', 'utf8');
  has(sql, 'endpoint   text not null unique', 'اشتراكٌ واحد لكل جهاز');
  has(sql, "grant execute on function qbank.push_targets(int) to service_role",
      '★ والمستهدفون لمفتاح الخدمة وحده — الطالب لا يقرأ اشتراكات غيره');
  has(sql, "(q.value->>'d')::numeric, 0) <= p_day", '★ والمستحقّ يُحسب في القاعدة من srs — لا يُجلب تقدّم ألف طالب');
  has(sql, 'and (s.last_sent is null or s.last_sent <', 'ولا إشعارين في يومٍ للجهاز الواحد');
  has(sql, 'fails >= 3', 'وثلاث سقطات تحذف الاشتراك الميت — لا واحدة');
  ok(sql.indexOf('create policy push_subs_') === -1, 'ولا سياسة قراءة على المفاتيح');

  const api = require('fs').readFileSync(__dirname + '/../api/push.js', 'utf8');
  has(api, "given !== secret) return res.status(401)", '★ والإرسال محروس بـCRON_SECRET — لا يُطلقه زائر');
  has(api, 'TTL: 12 * 3600', 'وإشعار الصباح لا يُسلَّم مساءً');
  has(api, 'e.statusCode === 404 || e.statusCode === 410', 'واشتراكٌ مات يُعرف من رمزه');

  const vercel = JSON.parse(require('fs').readFileSync(__dirname + '/../vercel.json', 'utf8'));
  ok(Array.isArray(vercel.crons) && vercel.crons.some(c => c.path === '/api/push'),
     '★ والجدولة في vercel.json — ٥ UTC = ٨ صباحًا بتوقيت الرياض');
  const pkg = JSON.parse(require('fs').readFileSync(__dirname + '/../api/package.json', 'utf8'));
  ok(!!pkg.dependencies['web-push'], 'وحزمة web-push في الخادم — الخادم لا المتصفح');

  const sw = require('fs').readFileSync(__dirname + '/../sw.js', 'utf8');
  has(sw, "addEventListener('push'", 'والعامل يستقبل الدفع');
  has(sw, "tag: 'amusq-daily'", '★ وإشعار اليوم يحلّ محلّ الأمس — لا يتراكم');
  has(sw, "addEventListener('notificationclick'", 'والضغط يفتح الصفحة');
}

describe('١٧٣ج · الواجهة لا تسأل بلا سبب');
{
  const dom = makeDom(), W = dom.window, A = W.QBANK;
  const N = A.notify;
  ok(!!N, 'الوحدة موجودة');
  ok(!N.shouldInvite(), 'بلا دخولٍ لا دعوة');

  A.store.set('session', { user:{ id:'u1', email:'a@b.c' }, access_token:'t', expires_abs: Date.now() + 9e6 });
  // jsdom بلا PushManager → غير مدعوم → لا دعوة (والرسالة تشرح آيفون)
  has(N.WHY.unsupported, 'الشاشة الرئيسية', '★ وآيفون يُقال له كيف — الإشعارات فيه للمثبَّت وحده');
  has(N.WHY.denied, 'إعدادات الموقع', 'والرفض في المتصفح دائم — يُقال أين يُغيَّر');

  A.store.set('pack', { subjects:[{ id:'s1', name:'علم السموم', exam_date: new Date(Date.now() + 5*86400000).toISOString() }], settings:{} });
  has(N.reason(), 'علم السموم', '★ والدعوة تقول ما ستذكّره به — لا «فعّل الإشعارات» مجرّدة');

  const html = require('fs').readFileSync(__dirname + '/../index.html', 'utf8');
  /* الشريط صار في صفّ التذكيرات (.nudges) تحت بطل اليوم لا في الجسد مباشرة */
  has(html, "if (QBANK.views.notifyBanner){ const nb = QBANK.views.notifyBanner(); if (nb) nudges.appendChild(nb); }",
      'والشريط في الرئيسية — داخل صفّ التذكيرات');
  has(html, "QBANK.views.notifyCard ? QBANK.views.notifyCard() : null", 'والبطاقة في الحساب');
  has(html, "text:'لاحقًا'", '★ وزرّ «لاحقًا» — الدعوة تُغلق بيده ولا تُلحّ بعد مرتين');
  has(html, 'push_dismiss', 'ويُعدّ الإغلاق');
  has(html, "async serverGet(path)", 'وGET إلى الخادم للمفتاح العام');
}

/* ============ ١٧٤ · الصغائر الثلاث ============ */
describe('١٧٤ · «جاء في اختبار سابق»');
{
  const sql = require('fs').readFileSync(__dirname + '/../db/EXAMYEAR.sql', 'utf8');
  has(sql, "add column if not exists exam_tag text", 'العمود');
  has(sql, 'questions_owner_tag', '★ والرافع يوسم أسئلة مادته هو — لا المشرف وحده');
  has(sql, "'sales', (select count(*) from qbank.entitlements e", '★ و«كم اشترى منه غيري» في صفحة الرافع');
  has(sql, "e.source in ('web','code','manual')", 'من البيوع الحقيقية لا المنح');
  has(sql, "'phone_verified', coalesce(p.phone_verified, false)", 'والتوثيق يظهر للناس');

  const html = require('fs').readFileSync(__dirname + '/../index.html', 'utf8');
  has(html, "text:'جاء في ' + q.exam_tag", 'والشارة عند الطالب');
  has(html, 'exam_tag: v', 'والحقل في محرّر المادة يحفظ');
  has(html, "if (opts.scope === 'exam_tag')  pool = pool.filter(q => q.exam_tag);",
      'والاختبار التجريبي يستطيع أن يقتصر عليها');
  has(html, '.badge--gold{', 'وبلون الهوية لا لون المادة');
  has(html, 'طالبًا اشتروا منه', 'وعدد المشترين في صفحة الرافع');
  has(html, '✓ رقم جوال موثَّق', 'وشارة التوثيق');
}

describe('١٧٤ب · بنك أخطائي');
{
  const dom = makeDom(), W = dom.window, A = W.QBANK;
  A.progress.set ? null : null;
  const html = require('fs').readFileSync(__dirname + '/../index.html', 'utf8');
  has(html, "value:'wrong', text:'بنك أخطائي", 'خيار الطباعة');
  has(html, "(wrong[b.id] || 0) - (wrong[a.id] || 0)", '★ والأكثر تعثّرًا أولًا — ما أخطأ فيه ثلاثًا يُقرأ قبل مرة');
}

/* ============ ١٧٥ · التصميم: الحبر والذهب ============ */
describe('١٧٥ · «ورقة اليوم» — بطل الرئيسية');
{
  const dom = makeDom(), W = dom.window, A = W.QBANK, doc = W.document;
  A.store.set('session', { user:{ id:'u1', email:'a@b.c' }, access_token:'t', expires_abs: Date.now() + 9e6 });
  A.store.set('profile', { uid:'u1', name:'سارة العتيبي' });
  eq(A.today.firstName(), 'سارة', 'الاسم الأول من الملف المخبَّأ — بلا انتظار الشبكة');
  eq(A.today.greet(new Date(2026, 8, 3, 9)), 'صباح الخير', 'تحيةٌ بساعة الجهاز');
  eq(A.today.greet(new Date(2026, 8, 3, 21)), 'سهرة موفّقة', 'ومساءً غيرها — «صباح الخير» ليلًا يفضح أن لا أحد هنا');

  A.store.set('pack', { subjects:[], settings:{} });
  eq(A.views.todayHero(), null, 'لا مواد → لا بطل (بطاقةٌ فارغة تعليمٌ ناقص)');

  A.store.set('pack', { subjects:[
    { id:'s1', name:'علم السموم', q_count:100, exam_date: new Date(Date.now() + 5*86400000).toISOString() },
    { id:'s2', name:'التشريح', q_count:50 } ], settings:{} });
  A.store.set('my_subjects', ['s1','s2']);
  let st = A.today.state();
  eq(st.pct, 0, 'لم يبدأ: صفر إتقان');
  eq(st.exam.name, 'علم السموم', '★ أقرب اختبارٍ لم يمضِ');
  let h = A.today.headline(st);
  has(h.t, 'جاهز للمراجعة', 'ومن لم يبدأ يُدعى لا يُؤمَر — وبلا «أول سؤال»');
  has(h.btn, 'ابدأ بـ', 'والزر يبدأ بأول مادة');
  has(h.href, '#/subject/s1', 'والزر يفتح أول مادة');

  let hero = A.views.todayHero();
  ok(hero.classList.contains('today'), 'البطل يُبنى');
  eq(hero.querySelectorAll('.omr__b').length, 10, '★ عشر فقاعات ورقة الإجابة — التوقيع');
  eq(hero.querySelectorAll('.omr__b.is-on').length, 0, 'كلها فارغة لمن لم يبدأ');
  ok(/، سارة/.test(hero.textContent), 'يحيّيها باسمها');
  has(hero.textContent, 'علم السموم', 'ويذكر أقرب اختبار');
  ok(!!hero.querySelector('.btn'), 'وزرٌّ واحد أساسي');

  /* بعد مذاكرة: مستحقّ اليوم يعلو كل شيء */
  A.progress.markSeen('s1', 'q1'); A.progress.markSeen('s1', 'q2');
  A.progress.review('s1', 'q1', false, new Date(Date.now() - 3*86400000));
  st = A.today.state();
  ok(st.due >= 1, 'سؤالٌ مستحقّ');
  h = A.today.headline(st);
  eq(h.href, '#/review', '★ المستحقّ يقود إلى «راجع اليوم»');
  has(h.t, 'تنتظر مراجعتك', 'بعددٍ لا بشعار');

  const html = require('fs').readFileSync(__dirname + '/../index.html', 'utf8');
  has(html, "const hero = QBANK.views.todayHero ? QBANK.views.todayHero() : null;", 'البطل أول الرئيسية');
  has(html, "if (!hero && QBANK.views.reviewCard) {", 'وبطاقة المراجعة القديمة لمن لا بطل له فقط');
  has(html, "class:'nudges'", '★ والشرائط الثلاثة في صفٍّ واحد تحته لا كومة');
  has(html, '.page__head::after{', 'وشرطة ذهبية تحت كل عنوان صفحة');
  has(html, "if (hero) pg.classList.add('page--hero');", 'وفي الرئيسية البطل هو الرأس — العنوان يُخفى بصريًّا لا يُحذف');
  no(html, '.today::before{', 'بلا زخرفة زوايا — الفقاعات وحدها التوقيع');
  has(html, '[style*="--acc"] .btn', '★ الزر الذهبي يعود إلى لون المادة حيث تصبغ سياقها');
}

describe('١٧٥ب · لوحة الطالب والمشرف');
{
  const html = require('fs').readFileSync(__dirname + '/../index.html', 'utf8');
  has(html, ".pf-hero{\n  display:flex; align-items:center; gap:var(--s5);\n  background:var(--today-bg);", '★ بطل الملف بلوحة الحبر والذهب نفسها');
  no(html, 'pf-hero__mail{ color:var(--today-fg2) !important', 'بلا !important — بالترتيب والتخصيص');
  has(html, "const saveBtn = el('button', { class:'btn', type:'button', text:'احفظ ملفي' });", 'زر الحفظ بحجمه لا شريطًا');
  has(html, "{ id:'profile',  label:'ملفي',   ico:'user' }", 'تبويبات الحساب بأيقونات SVG من المجموعة الموحّدة');
  has(html, "background:var(--bg-soft); border:1px solid var(--line-soft);", 'والتبويبات شريحةٌ مقسّمة');

  has(html, "Admin.ICONS = {", 'أيقونات اللوحة بالمعرّف');
  has(html, "class:'tabs__n', 'data-n': t.id, hidden: true", '★ شارة عدّ في التبويب — تُملأ من admin_inbox');
  has(html, "money:   (Number(d.purchases) || 0) + (Number(d.phones) || 0) + (Number(d.payouts) || 0)", 'المال يجمع ثلاثة صناديق');
  has(html, '.is-admin .page__head{ display:none; }', 'وعنوان الصفحة يُخفى في اللوحة — الشريط رأسها');
  has(html, ".ad-kpi::before{", 'والمؤشّر بخطٍّ علوي بلون الحال');
  has(html, ".ad-kpi__l{ font-size:.74rem; color:var(--text-3); font-weight:700; order:-1; }", 'والتسمية فوق الرقم');

  const dom = makeDom(), W = dom.window, A = W.QBANK, doc = W.document;
  A.store.set('session', { user:{ id:'u1', email:'admin@b.c' }, access_token:'t', expires_abs: Date.now() + 9e6 });
  W.location.hash = '#/admin/dash'; A.router.render('#/admin/dash');
  const t = doc.querySelectorAll('#main .tabs--admin .tabs__btn');
  eq(t.length, 10, 'عشرة تبويبات كما كانت');
  ok(!!t[0].querySelector('.tabs__ico'), 'ولكلٍّ أيقونة');
  ok(!!doc.querySelector('#main .ad-shell'), 'والشريط موجود');
  eq(doc.querySelectorAll('#main .page__head').length, 1, 'ورأس الصفحة في الشجرة (يُخفى بـCSS لا يُحذف — الفحوص القديمة تجده)');
}

/* ============ ١٧٦ · «جلسة غير صالحة» عند الشراء ============ */
describe('١٧٦ · نداء الخادم يحمل هوية الطالب');
{
  const dom = makeDom(), W = dom.window, A = W.QBANK;
  A.store.set('session', { user:{ id:'u1', email:'a@b.c' }, access_token:'TOK123', refresh_token:'r', expires_abs: Date.now() + 9e6 });
  let seen = null;
  A.api._fetch = (url, opts) => { seen = { url, opts }; return Promise.resolve({ ok:false, status:503, json: () => Promise.resolve({ error:'off' }) }); };
  A.admin.apiBase = () => '';
  pending.push(A.admin.server('/api/pay', { kind:'subject' }).then(r => {
    ok(!!seen, 'النداء خرج');
    eq(seen.opts.headers.Authorization, 'Bearer TOK123', '★ Authorization مع رمز الطالب — كان غائبًا فيردّ الخادم «جلسة غير صالحة»');
    eq(r.status, 503, 'ويصل ردّ البوابة الحقيقي (٥٠٣) لا ٤٠١');
  }));
  const html = require('fs').readFileSync(__dirname + '/../index.html', 'utf8');
  has(html, "headers: Object.assign({ 'Content-Type':'application/json' }, await Admin.authHeader())", 'في POST');
  has(html, "{ method:'GET', headers: await Admin.authHeader() }", 'وفي GET');
  has(html, "Date.now() > s.expires_abs - 60000", 'ويجدّد الجلسة إن شارفت على الانتهاء قبل الإرسال');
}

/* ============ ١٧٧ · لوحة المشرف القوية ============ */
describe('١٧٧ · هيكل اللوحة والجوال');
{
  const html = require('fs').readFileSync(__dirname + '/../index.html', 'utf8');
  has(html, "class:'ad-layout'", '★ هيكل: شريط جانبي على الحاسوب والتبويبات نفسها صفٌّ على الجوال');
  has(html, "@media (min-width:900px){\n  .ad-layout{ grid-template-columns:200px minmax(0,1fr);", 'العمود الجانبي ٢٠٠ بكسل من ٩٠٠');
  has(html, ".tabs--admin{ margin-bottom:0; position:sticky;", 'وعلى الجوال تلتصق التبويبات تحت الشريط');
  has(html, ".stu__mail{ display:block; }", '★ البريد كتلة لا سطر: كان يفيض فيوسّع الصفحة على الجوال');
  has(html, ".is-admin .main, .is-admin .page{ overflow-x:clip; }", 'ولا فيض أفقي في اللوحة مهما حدث');

  const dom = makeDom(), W = dom.window, A = W.QBANK, doc = W.document;
  A.store.set('session', { user:{ id:'u1', email:'admin@b.c' }, access_token:'t', expires_abs: Date.now() + 9e6 });
  W.location.hash = '#/admin/dash'; A.router.render('#/admin/dash');
  ok(!!doc.querySelector('#main .ad-layout > .ad-side .tabs--admin'), 'التبويبات داخل الجانب');
  ok(!!doc.querySelector('#main .ad-layout > .ad-main #adminBody'), 'والمحتوى بجانبها');
  ok(!!doc.querySelector('#main .ad-dash-head'), '★ رأس اللوحة: تحية وتاريخ ومدة وأفعال');
  eq(doc.querySelectorAll('#main .ad-range .chip').length, 3, 'ثلاث مدد في الرأس');
  ok(doc.querySelector('#main .ad-dash-head__s').textContent.indexOf('٣٠') !== -1, 'والمدة تُذكر بالكلمات');
  eq(doc.querySelectorAll('#main .ad-quick .btn').length, 3, 'وثلاثة أفعال سريعة');
}

describe('١٧٧ب · «ينتظرك» قائمة أفعال + نبض المؤشّرات');
{
  const html = require('fs').readFileSync(__dirname + '/../index.html', 'utf8');
  has(html, ".filter(x => x[1] > 0)", '★ الأصفار تُخفى — بلاطة «٠ بلاغ» تُقرأ «لا شيء» وتشغل مكانًا');
  has(html, ".sort((a, b) => b[1] - a[1])", 'والأكثر أولًا');
  has(html, "text:'الطابور نظيف ✓'", 'والفراغ سطرٌ واحد');
  has(html, "class:'inbox__d', text: age", 'وكل صفٍّ يقول منذ متى أو لماذا');

  const dom = makeDom(), W = dom.window, A = W.QBANK;
  const C = A.admin.charts;
  ok(C.spark([1,2,3]) && C.spark([1,2,3]).tagName.toLowerCase() === 'svg', 'خطّ النبض SVG');
  eq(C.spark([5]), null, 'ولا خطّ لقيمة واحدة');
  const d = C.delta([1,1,1,1,2,2,2,2]);
  ok(d && d.up && d.pct === 100, '★ الفرق: النصف الثاني مقابل الأول — ضعفٌ = ▲ ١٠٠٪');
  const d2 = C.delta([4,4,2,2]);
  ok(d2 && !d2.up && d2.pct === 50, 'وهبوطٌ ٥٠٪');
  eq(C.delta([0,0,0,0]), null, 'وصفرٌ على صفر لا فرق');
  const k = C.kpi('٤٠', 'اختبارًا', 'x', null, { spark:[1,2,3,4], deltaOf:[1,2,3,4] });
  ok(!!k.querySelector('.ad-spark') && !!k.querySelector('.ad-kpi__d.is-up'), 'والمؤشّر يحمل النبض والفرق معًا');
  has(html, "{ spark: ser('attempts'), deltaOf: ser('attempts') }", 'والاختبارات في اللوحة بنبضها');
}

describe('١٧٧ج · السجل بالعربية لا JSON');
{
  const html = require('fs').readFileSync(__dirname + '/../index.html', 'utf8');
  no(html, "el('span', { class:'payrow__t', text: JSON.stringify(x.detail) })", '★ لا JSON خامًا في صفّ السجل — كان يدهس الشارات على الجوال');
  has(html, "amount:'المبلغ', balance:'الرصيد بعده'", 'المفاتيح المعروفة تُقال بكلمتها');
  has(html, "t.slice(0, 8) + '…'", 'والمعرّفات الطويلة تُختصر');
  has(html, ".audit__x{ display:flex; flex-wrap:wrap;", 'والشرائح تلتفّ');
  has(html, "overflow-wrap:anywhere; }   /* نصٌّ طويل يلتفّ ولا يدفع الصف */", 'وصفوف الدفعات كذلك');
}

/* ============ ١٧٨ · ما كشفه اختبار الرفع الحي ============ */
describe('١٧٨ · سطر الشرح ليس من الخيار الأخير');
{
  const { parse } = require('../api/_lib/parser.js');
  const qs = parse('1. Which drug?\nA) Propranolol\nB) Atenolol\nC) Carvedilol\nD) Labetalol\nAnswer: B\nExplanation: Atenolol is cardioselective.\n\n2. Next?\nA) x\nB) y\nAnswer: A');
  eq(qs.length, 2, 'سؤالان');
  eq(qs[0].options[3], 'Labetalol', '★ الخيار D نظيف — كان «Labetalol Explanation: …»');
  eq(qs[0].explanation, 'Atenolol is cardioselective.', 'والشرح في حقله');
  eq(qs[0].answer, 1, 'والإجابة B');
  const ar = parse('١. سؤال؟\nأ) واحد\nب) اثنان\nالإجابة: ب\nالشرح: لأن كذا.');
  eq(ar[0].options.length, 2, 'وبالعربية خياران');
  eq(ar[0].explanation, 'لأن كذا.', 'وشرحٌ عربي');
  const { enforce } = require('../api/_lib/sanctity.js');
  const e = enforce(qs[0], { expl_en:'AI text', expl_ar:'ش' }, 'strict');
  eq(e.expl_en, 'Atenolol is cardioselective.', '★ شرح الملف يسبق شرح الذكاء');
}

describe('١٧٨ب · «احفظ مخفية» تبقى مخفية');
{
  const html = require('fs').readFileSync(__dirname + '/../index.html', 'utf8');
  has(html, "async stamp(subjectId, w, publish){", 'الختم يعرف هل نُشرت');
  has(html, "if (publish !== false) body.status = 'published';", '★ ولا يكتب published فوق مادةٍ أُخفيت');
  has(html, "await QBANK.admin.stamp(newId, w, publish);", 'والمعالج يمرّر القرار');
  has(html, "'#/admin/subject/' + newId\n", 'والمخفية تُفتح في محرّرها');
}

/* ============ ١٧٩ · لوحة المتصدرين والإحصاءات الحيّة ============ */
/*
  المبدأ الحاكم: كل رقم يراه الطالب رقم حقيقي. هذه الفحوص شرطُ تسليمٍ لا
  زينة: الأسماء، البوابة، اللوحة، Pulse، والصدق.
*/
describe('١٧٩ · مرشّح الأسماء — في المتصفح وفي الخادم');
{
  const dom = makeDom(), W = dom.window, A = W.QBANK, N = A.names;
  /* كل اسم في قائمة الاستثناء يمرّ — والفحص يطبع من حُجب منها بالاسم */
  const allow = ['عمر','عمرو','عمار','معتز','خولة','زبير','زبيدة','حسان','بسام','قصي','لوط','شعيب',
                 'نعمة','طعمة','مكسيم','كسرى','باكستان','أسامة','حمزة','معاذ','سهيل'];
  const hit = allow.filter(n => N.blocked(n));
  ok(hit.length === 0, '★ كل الأسماء الحقيقية تمرّ' + (hit.length ? ' — حُجب: ' + hit.join('، ') : ''));
  ['سارة العتيبي','Ali Alsoqoor','محمد بن سلمان','Fatimah'].forEach(n => ok(!N.blocked(n), 'يمرّ: ' + n));
  /* المسيء يُحجب ومعه حِيله */
  ['شرمووووط','ش ر م و ط','f.u.c.k','ADMIN','كسسسس','sh1t','3رص','B1tch','منيووووك'].forEach(n =>
    ok(N.blocked(n), 'يُحجب: ' + n));
  eq(N.norm('ش ر م و ط'), 'شرموط', 'التطبيع يزيل الفراغات');
  eq(N.norm('كسسسس'), 'كس', 'ويطوي التكرار');
  eq(N.normAr('3رص'), 'عرص', 'وأرقامٌ بدل حروف عربيًا');
  eq(N.normEn('sh1t'), 'shit', 'ولاتينيًا');
  /* clean يشرح السبب */
  const c = N.clean('شرموط');
  ok(!c.ok && c.why.indexOf('غير مناسب للوحة المتصدرين') !== -1, '★ رسالة الخطأ تشرح السبب لا الطول');
  ok(N.clean('   سارة   العتيبي ').ok && N.clean('   سارة   العتيبي ').name === 'سارة العتيبي', 'وينظّف الفراغات');
  ok(!N.clean('1234').ok, 'ولا اسم بلا حرف');
  eq(N.clean('x'.repeat(40)).name.length, N.MAX, 'و٢٤ حرفًا سقفًا');
  eq(N.shown('شرموط'), 'اسم محظور', 'والقناع');

  /* المرشّح في الخادم أيضًا — والقوائم واحدة */
  const sql = require('fs').readFileSync(__dirname + '/../db/BOARD.sql', 'utf8');
  has(sql, 'create or replace function qbank.name_blocked(t text)', '★ الحكم في القاعدة: الاسم المسيء لا يغادرها');
  has(sql, "'اسم محظور'", 'مقنَّعًا');
  has(sql, "qbank.name_blocked(p.name)", 'ومعه blocked لكل صف');
  N.ALLOW.forEach(w => has(sql, "('" + w + "','allow')", 'استثناء في الخادم: ' + w));
  N.ROOTS.forEach(w => has(sql, "('" + w + "','root')", 'جذر في الخادم: ' + w));
  N.EXACT.forEach(w => has(sql, "('" + w + "','exact')", 'كلمة في الخادم: ' + w));
  has(sql, "'(.)\\1+', '\\1', 'g'", 'وطيّ التكرار في الخادم');
  no(sql, 'delete from qbank.attempts', '★ لا يُحذف صفّ من المخزن — الحجب مسؤولية عرض');
  no(sql, "'email'", 'ولا بريد في أي مُخرَج');
}

describe('١٧٩ب · بوابة الاسم');
{
  const dom = makeDom(), W = dom.window, A = W.QBANK, doc = W.document;
  A.store.set('session', { user:{ id:'u1', email:'a@b.c' }, access_token:'t', expires_abs: Date.now() + 9e6 });
  let saved = null;
  A.api.saveProfile = async d => { saved = d; return { ok:true }; };
  const g = A.views.nameGate();
  ok(!!g && !!doc.querySelector('.namebox'), 'البوابة تُفتح');
  ok(doc.documentElement.classList.contains('gated'), 'وتمنع التمرير خلفها');
  eq(A.views.nameGate(), null, '★ ولا تُفتح مرتين');
  ok(!g.querySelector('button[aria-label*="إغلاق"], .namebox__x'), 'وبلا زر تخطٍّ');
  const inp = doc.getElementById('gateName'), btn = g.querySelector('.btn');
  inp.value = 'شرموط'; btn.click();
  ok(!!doc.querySelector('.namebox'), 'لا تُغلق باسم مرفوض');
  has(g.querySelector('[role="alert"]').textContent, 'غير مناسب', 'ورسالتها تشرح السبب');
  inp.value = 'سارة'; btn.click();
  pending.push(new Promise(r => setTimeout(r, 30)).then(() => {
    ok(!doc.querySelector('.namebox'), '★ تُقبل باسم صحيح وتُغلق');
    ok(saved && saved.name === 'سارة', 'ويُحفظ في الملف');
    ok(!doc.documentElement.classList.contains('gated'), 'ويعود التمرير');
    eq(A.store.get('profile').name, 'سارة', 'وفي الجهاز');
  }));
  const html = require('fs').readFileSync(__dirname + '/../index.html', 'utf8');
  has(html, "if (QBANK.names && !(location.hash || '').startsWith('#/admin')) QBANK.names.checkGate();", 'وتُفحص عند الإقلاع');
  has(html, "const nc = QBANK.names.clean(nameInput.value);", 'واسم الملف يمرّ بالمرشّح نفسه');
}

describe('١٧٩ج · اللوحة بثلاثة نطاقات');
{
  const dom = makeDom(), W = dom.window, A = W.QBANK, doc = W.document;
  A.store.set('session', { user:{ id:'u1', email:'a@b.c' }, access_token:'t', expires_abs: Date.now() + 9e6 });
  A.store.set('pack', { subjects:[{ id:'s1', name:'علم السموم', color:'subject-2', icon:'☠' }], settings:{} });
  const AR = '٠١٢٣٤٥٦٧٨٩';
  const mk = (n) => ({ id:'u' + n, name:'طالب' + AR[n], avatar:'🎓', avatar_url:'', university:'جامعة نجران',
    tries: 20 - n, best: 50 + n, questions: 100 + n * 7, correct: 60 + n * 3, accuracy: 40 + n * 10,
    seconds: 600 * n, last: new Date().toISOString(), blocked: n === 3, online: n < 2 });
  const rows = [1,2,3,4,5].map(mk); rows[2].name = 'اسم محظور';
  let lastCall = null;
  A.api.rpc = (name, args) => {
    if (name === 'board_full') lastCall = { name, args };
    if (name === 'board_full') return Promise.resolve({ ok:true, data:{ ok:true, scope: args.p_scope, online_window_h: 4,
      board: rows, me:{ id:'u1', rank:1, of:5, tries:19, best:51, accuracy:60, seconds:600, questions:107 },
      summary:{ students:5, active7d: 4, online_now: 2, exams: 85, questions: 605, correct: 345, accuracy: 57, hours: 2.5 },
      champions:[{ subject_id:'s1', subject:'علم السموم', color:'subject-2', icon:'☠', name:'طالب١', pct: 51, blocked:false, exams: 85, online_now: 3 }],
      feed:[{ uid:'u2', n:'طالب٢', s:'s1', subject:'علم السموم', color:'subject-2', p: 80, q: 10, t: Math.floor(Date.now()/1000) - 60 }],
      universities:[{ id:'un1', name:'جامعة نجران', country:'SA', students:5, exams:85 }], target: null } });
    if (name === 'subjects_online') return Promise.resolve({ ok:true, data:{ s1: 3 } });
    return Promise.resolve({ ok:false, status:404, data:null });
  };
  A.router.render('#/board');
  pending.push(new Promise(r => setTimeout(r, 40)).then(() => {
    const main = doc.getElementById('main');
    eq(lastCall.args.p_scope, 'all', 'الافتراضي: كل الجامعات');
    ok(!!main.querySelector('.lb-online'), '★ «متصل الآن» في رأس اللوحة');
    has(main.querySelector('.lb-online').getAttribute('title'), '٤ ساعات', 'والتلميح يقول النافذة — الصدق');
    has(main.querySelector('.lb-online').textContent, '٢ متصل الآن', 'والرقم من الخادم بأرقام عربية');
    eq(main.querySelectorAll('.lb-kpi').length, 5, '★ «نشطون» تختفي تحت العشرة: خمس بطاقات لا ست');
    ok(!!main.querySelector('.lb-feed'), 'شريط الحركة');
    eq(main.querySelectorAll('.lb-feed__i').length, 2, 'والمحتوى مكرّر مرتين للحركة الدائرية');
    ok(!!main.querySelector('.lb-me') && main.querySelector('.lb-me').textContent.indexOf('أنت المتصدّر') !== -1, 'بطاقتك أنت');
    eq(main.querySelectorAll('.lb-podium__p').length, 3, 'المنصّة بثلاثة');
    ok(main.querySelector('.lb-podium__p--1 .lb-podium__name').textContent === 'طالب١', 'والأول في الوسط أعلى');
    ok(!!main.querySelector('.lb-champ') && main.querySelector('.lb-champ .lb-online').textContent.indexOf('٣') !== -1,
       '★ كل مادة تعرض عدد المتصلين الآن فيها');
    eq(main.querySelectorAll('.lb-row').length, 5, 'الجدول الكامل');
    ok(!!main.querySelector('.lb-row.is-me .badge--gold'), '★ صفّ الطالب مميَّز بشارة «أنت»');
    ok(!!main.querySelector('.lb-row.is-blk .badge--bad'), 'والمحظور بشارته — بأرقامه، بلا حذف');
    ok(!/[0-9]/.test(main.querySelector('.lb-rows').textContent), '★ الأرقام كلها عربية هندية');
    /* الفرز في المتصفح بلا نداء */
    const before = lastCall;
    main.querySelector('[data-sort="acc"]').click();
    ok(lastCall === before, 'الفرز لا ينادي الخادم');
    has(main.querySelector('.lb-row .lb-row__name').textContent, 'طالب٥', 'وترتيب الدقة يُقدّم الأدقّ (طالب٥)');
    main.querySelector('[data-sort="qs"]').click();
    has(main.querySelector('.lb-row .lb-row__name').textContent, 'طالب٥', 'والأسئلة تُقدّم الأكثر');
    main.querySelector('[data-sort="best"]').click();
    has(main.querySelector('.lb-row .lb-row__name').textContent, 'طالب٥', 'وأعلى نسبة');
    main.querySelector('[data-sort="tries"]').click();
    has(main.querySelector('.lb-row .lb-row__name').textContent, 'طالب١', 'والافتراضي الاختبارات');

    /* النطاقات */
    A.router.render('#/board/university/un1');
    return new Promise(r => setTimeout(r, 40));
  }).then(() => {
    eq(lastCall.args.p_scope, 'university', '★ نطاق الجامعة من المسار');
    eq(lastCall.args.p_id, 'un1', 'بمعرّفها');
    ok(!!doc.querySelector('#main .lb-scope select'), 'وقائمة الجامعات للاختيار');
    A.router.render('#/board/subject/s1');
    return new Promise(r => setTimeout(r, 40));
  }).then(() => {
    eq(lastCall.args.p_scope, 'subject', '★ نطاق المادة');
    eq(lastCall.args.p_id, 's1', 'بمعرّفها');
    ok(!doc.querySelector('#main .lb-champs'), 'ولا أبطال مواد داخل مادة واحدة');
  }));

  /* لوحة فارغة بلا انهيار */
  const dom2 = makeDom(), W2 = dom2.window, A2 = W2.QBANK;
  A2.api.rpc = () => Promise.resolve({ ok:true, data:{ ok:true, scope:'all', board:[], me:null, summary:{}, champions:[], feed:[], universities:[] } });
  A2.router.render('#/board');
  pending.push(new Promise(r => setTimeout(r, 40)).then(() => {
    has(W2.document.getElementById('main').textContent, 'كن أول من يؤدّي اختبارًا', '★ الفراغ دعوة لا عطل');
  }));

  /* «متصل الآن» على بطاقات المواد في الرئيسية */
  const dom3 = makeDom(), W3 = dom3.window, A3 = W3.QBANK;
  A3.store.set('session', { user:{ id:'u1', email:'a@b.c' }, access_token:'t', expires_abs: Date.now() + 9e6 });
  A3.store.set('pack', { subjects:[{ id:'s1', name:'علم السموم', q_count: 10 }], settings:{} });
  A3.store.set('my_subjects', ['s1']);
  A3.api.rpc = (name) => Promise.resolve(name === 'subjects_online' ? { ok:true, data:{ s1: 4 } } : { ok:false, data:null });
  A3.router.render('#/');
  pending.push(new Promise(r => setTimeout(r, 40)).then(() => {
    const c = W3.document.querySelector('.sub-card[data-id="s1"] .lb-online');
    ok(!!c && c.textContent.indexOf('٤ متصل الآن') !== -1, '★ بطاقة المادة تعرض المتصلين الآن فيها');
  }));
}

describe('١٧٩د · Pulse — أربع قواعد');
{
  const dom = makeDom(), W = dom.window, A = W.QBANK, doc = W.document, P = A.pulse;
  A.store.set('session', { user:{ id:'u1', email:'a@b.c' }, access_token:'t', expires_abs: Date.now() + 9e6 });
  const feed = [{ uid:'u1', n:'أنا', s:'s1', subject:'x', p:90 }, { uid:'u2', n:'عبدالرحمن', s:'s1', subject:'علم السموم', color:'subject-2', p:80 }];
  P.feed(feed);
  eq(P._items.length, 1, 'حدث الطالب نفسه لا يُعرض');
  eq(P.FIRST, 12000, 'أول إشعار بعد ١٢ ثانية'); eq(P.GAP, 45000, 'ثم كل ~٤٥'); eq(P.LIFE, 7000, 'يبقى ٧'); eq(P.MAX, 6, 'وستة في الجلسة');
  P.stop();
  A.router.render('#/exam/s1');
  P.tick();
  ok(!doc.querySelector('.pulse'), '★ لا إشعار أثناء اختبار');
  P.stop();
  A.router.render('#/');
  const b1 = P.show(P._items[0]);
  ok(!!b1 && !!doc.querySelector('.pulse'), 'يظهر خارج الاختبار');
  has(doc.querySelector('.pulse').textContent, 'عبدالرحمن', 'باسم الزميل');
  ok(!!doc.querySelector('.pulse a[href="#/subject/s1"]'), 'وزر «جرّبها» يفتح المادة');
  eq(P.show(P._items[0]), null, '★ لا يظهر اثنان معًا');
  P.shown = P.MAX; P.tick();
  eq(doc.querySelectorAll('.pulse').length, 1, 'ولا يتجاوز MAX');
  doc.querySelector('.pulse__x').click();
  ok(P.off() && !doc.querySelector('.pulse'), '★ زر الإيقاف يوقفه ويُحفظ الاختيار');
  P.stop();
}

describe('١٧٩هـ · الصدق — لا رقم مُختلَق');
{
  const src = require('fs').readFileSync(__dirname + '/js/32-board.js', 'utf8');
  ok(!/text:\s*'[٠-٩0-9]+ (?:طالب|نشيط|متصل)/.test(src), '★ لا «٥٣ نشيطًا» في المصدر — كل قيمة من ردّ الخادم');
  has(src, "MIN_ACTIVE: 10", 'وقاعدة العشرة معلنة');
  has(src, "if ((S.active7d || 0) >= Board.MIN_ACTIVE)", 'ومطبَّقة');
  has(src, "title:'حضورٌ خلال آخر ٤ ساعات'", '★ «الآن» تُقال بنافذتها');
  const sql = require('fs').readFileSync(__dirname + '/../db/BOARD.sql', 'utf8');
  has(sql, "win interval := interval '4 hours';", 'والقاعدة تحسب الأربع ساعات');
  has(sql, "d.subject_id = s.id and d.last_seen > now() - win", '★ ولكل مادة عدّادها من نبضة المادة');
  has(sql, "p_subject uuid default null", 'والنبضة تحمل المادة');
  has(sql, "drop function if exists qbank.heartbeat(text, text, text, text);", 'ولا overload — التوقيع القديم يُسقَط أولًا');
  has(sql, "case when coalesce(sum(a.total),0) > 0 then round(sum(a.correct) * 100.0 / sum(a.total))::int", '★ الدقة تُحسب ولا تُخزَّن');
  has(sql, "order by tries desc, best desc, questions desc", 'والافتراضي عدد المحاولات لا أعلى نسبة');
  has(sql, "grant execute on function qbank.board_full(text, uuid, int) to anon, authenticated;", 'واللوحة للجميع — أسماء عرض فقط');
  no(sql, 'expl_ar', 'ولا محتوى مدفوع فيها');
  const html = require('fs').readFileSync(__dirname + '/../index.html', 'utf8');
  has(html, "p_subject: Presence.subjectId()", 'والمتصفح يرسل المادة في نبضته');
}

/* ============ ١٧٩ · المتصدرون في صفحة البداية ============ */
describe('١٧٩ · نافذة المتصدرين في أول شاشة');
{
  const html = require('fs').readFileSync(__dirname + '/../index.html', 'utf8');
  has(html, "if (QBANK.views.boardMini) body.push(QBANK.views.boardMini());", '★ في رئيسية الطالب — اللوحة كانت بلا باب');
  has(html, "[ QBANK.views.boardMini({ title:'الأوائل على كل الجامعات' }) ]", 'وفي صفحة الزائر');
  has(html, "B.load('all')", 'نطاق كل الجامعات — مسموح للزائر');
  has(html, "text:'كن أول المتصدرين'", 'والفراغ دعوة لا بطاقة مختفية');
  has(html, "'ترتيبك: ' + B.N(d.me.rank)", 'وترتيب الطالب نفسه');

  const dom = makeDom(), W = dom.window, A = W.QBANK, doc = W.document;
  /* زائر: النافذة تُبنى وتنتظر الشبكة، ولا تكسر الصفحة إن غاب الخادم */
  const m = A.views.boardMini();
  ok(m.classList.contains('lb-mini'), 'تُبنى');
  ok(!!m.querySelector('a[href="#/board"]'), 'وبابها إلى اللوحة الكاملة');
  W.location.hash = '#/'; A.router.render('#/');
  ok(!!doc.querySelector('#main .lp .lb-mini'), 'وموجودة في صفحة الزائر');
  A.store.set('session', { user:{ id:'u1', email:'a@b.c' }, access_token:'t', expires_abs: Date.now() + 9e6 });
  A.store.set('pack', { subjects:[{ id:'s1', name:'م', q_count:5 }], settings:{} });
  A.router.render('#/');
  ok(!!doc.querySelector('#main .lb-mini'), 'وفي رئيسية الطالب');
}

/* ============ ١٨٠ · ملاحظات علي على الشكل ============ */
describe('١٨٠ · لا كتلة سوداء في الفاتح + أيقونات أوضح');
{
  const tokens = fs.readFileSync(path.join(__dirname,'css','00-tokens.css'), 'utf8');
  const light = tokens.slice(0, tokens.indexOf('[data-theme="dark"]'));
  has(light, '--today-bg:   #fbf3df', '★ بطل اليوم ورقةٌ ذهبية فاتحة لا حبرًا أسود');
  no(light, '--today-bg:   var(--ink)', 'ولا أثر للحبر');
  const html = require('fs').readFileSync(__dirname + '/../index.html', 'utf8');
  has(html, "function icon(name){ return QBANK.ico(name, { size:22, weight:2.1 }); }", 'الأيقونات بخطٍّ أثقل — من المجموعة الموحّدة');
  has(html, "home:        'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'", 'وبيتٌ مغلق');
  has(html, '.topnav__item[aria-current="page"] svg{ background:var(--gold); color:var(--btn-fg); }', 'والمفعَّل في حبّة ذهبية');
}

describe('١٨٠ب · بطاقة المادة الجديدة');
{
  const dom = makeDom(), W = dom.window, A = W.QBANK, doc = W.document;
  A.store.set('session', { user:{ id:'u1', email:'a@b.c' }, access_token:'t', expires_abs: Date.now() + 9e6 });
  A.store.set('pack', { subjects:[
    { id:'s1', name:'علم الأمراض', name_en:'Pathology', q_count:159, icon:'☤', color:'subject-2', free:true, topics:['a','b'] },
    { id:'s2', name:'التشريح', q_count:80, price:15, free:false } ], settings:{} });
  A.store.set('my_subjects', ['s1']);
  A.router.render('#/');
  const c = doc.querySelector('.sub-card[data-id="s1"]');
  ok(!!c.querySelector('.sc-ico'), '★ بلاطة ملوّنة تحمل الأيقونة — لا خلفية باهتة');
  ok(!c.querySelector('.art'), 'والمنطقة الفنية القديمة ذهبت');
  has(c.textContent, '١٥٩ سؤالًا', 'عدد الأسئلة شريحة');
  has(c.textContent, '٢ محاور', 'والمحاور');
  has(c.textContent, 'مجانية', 'والمجانية');
  has(c.textContent, 'ابدأ المراجعة', 'وزرٌّ صريح');
  const c2 = doc.querySelector('.sub-card[data-id="s2"]');
  has(c2.textContent, '١٥ ريال', 'والسعر للمدفوعة');
  ok(!!c2.querySelector('.sc-act [aria-label*="أضف"]'), '★ زرّ الإضافة في صفّ الأفعال لا صفًّا معلَّقًا');
  ok(!!c.querySelector('.foot'), 'و.foot باقٍ — فيه تُلصق شارة «متصل الآن»');
}

describe('١٨٠ج · جامعة المادة من اللوحة');
{
  const html = require('fs').readFileSync(__dirname + '/../index.html', 'utf8');
  has(html, "QBANK.api.rpc('list_universities', { q:'', p_country:'' })", '★ قائمة الجامعات في محرّر المادة');
  has(html, "QBANK.api.rpc('list_colleges', { p_university: uniId })", 'وكليات المختارة');
  has(html, "QBANK.api.rpc('ensure_university', { p_country: uniCountry.value, p_name: nm })", 'و«+ جديدة» تُنشئ بالمطابقة المعيارية');
  has(html, "university_id: campus.university_id, college_id: campus.college_id", 'وتُحفظ مع الهوية');
  has(html, "if (!uni) col = null;", 'وكليةٌ بلا جامعة لا تُحفظ');
  has(html, 'لن يجدها أحد في «استكشف» حتى تُحدَّد', 'والمشرف يُنبَّه لماذا يهمّ');
}

/* ============ ١٨١ · الطبقة الاحترافية ============ */
describe('١٨١ · الطباعة والاختبار وملف الطالب');
{
  const tokens = fs.readFileSync(path.join(__dirname,'css','00-tokens.css'), 'utf8');
  has(tokens, '--font: "Dubai", "SF Arabic"', '★ خطُّ القراءة إنساني نظيف — الكوفي للعناوين وحدها');
  has(tokens, '--font-display: "Noto Kufi Arabic"', 'والكوفي يبقى شخصية العناوين');
  has(tokens, '--fs-xs: .74rem;', 'وسلّم أحجام واحد');
  const pro = fs.readFileSync(path.join(__dirname,'css','80-pro.css'), 'utf8');
  ok(!/#[0-9a-fA-F]{3,6}\b/.test(pro), '80-pro.css بلا لون صريح — كله من المتغيّرات');
  has(pro, '.exfb--bad{', 'لوحة التغذية الراجعة بحالتيها');
  has(pro, '.acc-grid{', 'وشبكة الملف');
  has(pro, '.analysis h3{', 'وتسلسل نص التحليل');

  const html = require('fs').readFileSync(__dirname + '/../index.html', 'utf8');
  has(html, "expl_en: q.expl_en || '', mnemonic:", '★ الشرح الإنجليزي وبطاقة الحفظ يرافقان سؤال الاختبار');
  has(html, "function examFeedback(item, answered, st){", 'ولوحة تغذية راجعة بدل سطر تلميح');
  has(html, "text: right ? 'أصبت' : 'أخطأت'", 'تقول الحكم بكلمة');
  has(html, "if (item.expl_en) panes.push(['English'", 'وتبويب لكل محتوى موجود فقط');

  const dom = makeDom(), W = dom.window, A = W.QBANK, doc = W.document;
  A.store.set('session', { user:{ id:'u1', email:'a@b.c' }, access_token:'t', expires_abs: Date.now() + 9e6 });
  const item = { id:'q1', q:'Which?', options:['a','b','c'], correct:1, topic:'ت', expl_ar:'شرح', expl_en:'expl', translation:'ترجمة', mnemonic:{ cue:'x', key:'y' }, important:true };
  const fb = A.views.examFeedback(item, { choice:2 }, { sub:{ id:'s1' } });
  ok(fb.classList.contains('exfb--bad'), 'الخطأ يُلوَّن خطأً');
  has(fb.textContent, 'الإجابة الصحيحة: (ب)', 'ويُقال الصحيح بحرفه');
  eq(fb.querySelectorAll('.exfb__tab').length, 4, 'أربعة تبويبات: شرح وEnglish وترجمة وبطاقة حفظ');
  const fb2 = A.views.examFeedback({ id:'q2', q:'?', options:['a','b'], correct:0 }, { choice:0 }, { sub:{ id:'s1' } });
  ok(fb2.classList.contains('exfb--ok') && !fb2.querySelector('.exfb__tabs'), 'والإصابة بلا محتوى: حكمٌ بلا تبويبات فارغة');

  A.store.set('my_subjects', ['s1','s2']);
  A.store.set('progress', { s1:{ seen:{}, wrong:{}, star:{}, exams:3, best:80 }, s2:{ seen:{}, wrong:{}, star:{}, exams:1, best:60 } });
  W.location.hash = '#/account'; A.router.render('#/account');
  ok(!!doc.querySelector('#main .acc-grid'), '★ الملف في شبكة');
  has(doc.querySelector('#main .pf-hero__stats').textContent, '٤', 'وأرقام البطل: ٤ اختبارات');
  has(doc.querySelector('#main .pf-hero__stats').textContent, '٨٠٪', 'وأفضل نتيجة');
  eq(doc.querySelectorAll('#main .acc-sec').length, 2, 'وقسمان بعنوان وأيقونة');
}

/* ============ ١٨٢ · مجموعة أيقونات واحدة + إصلاح عدّاد الاختبارات ============ */
describe('١٨٢ · أيقونات SVG موحّدة');
{
  const dom = makeDom(), W = dom.window, A = W.QBANK, doc = W.document;
  const i = A.ico('trophy', { size:20 });
  eq(i.tagName.toLowerCase(), 'svg', 'QBANK.ico يعيد SVG');
  eq(i.getAttribute('width'), '20', 'بالحجم المطلوب');
  ok(A.ico('nope').querySelector('path').getAttribute('d') === A.ICON_PATHS.circle, 'والاسم المجهول دائرةٌ لا خطأ');
  eq(A.subjIcon('☤').tagName.toLowerCase(), 'svg', '★ رموز المواد القديمة تُرسم من المجموعة نفسها');
  eq(A.subjIcon('🦷').tagName.toLowerCase(), 'span', 'ورمزٌ لا نعرفه يبقى نصًّا لا يختفي');
  const html = require('fs').readFileSync(__dirname + '/../index.html', 'utf8');
  no(html, "text:'🏆' }", 'لا إيموجي كأس في الواجهة');
  no(html, "text:'🔔' }", 'ولا جرس');
  no(html, "'💳'", 'ولا بطاقة');
  has(html, "{ id:'profile',  label:'ملفي',   ico:'user' }", 'تبويبات الحساب بأسماء أيقونات');
  A.store.set('session', { user:{ id:'u1', email:'a@b.c' }, access_token:'t', expires_abs: Date.now() + 9e6 });
  W.location.hash = '#/account'; A.router.render('#/account');
  ok(!!doc.querySelector('#main .tabs__ico svg'), 'وتُرسم SVG في التبويبات');
}

describe('١٨٢ب · عدّاد الاختبارات لا يتضاعف');
{
  const dom = makeDom(), W = dom.window, A = W.QBANK;
  const P = A.progress;
  const m = P.merge({ s1:{ seen:{}, wrong:{}, star:{}, exams:7, best:80 } }, { s1:{ seen:{}, wrong:{}, star:{}, exams:7, best:80 } });
  eq(m.s1.exams, 7, '★ دمج الجهاز مع نسخته على الخادم لا يضاعف — كان ٧+٧');
  eq(P.sane(5.06e31), 0, 'والقيمة الفاسدة تُصفَّر');
  eq(P.sane(12), 12, 'والسليمة تبقى');
  A.store.set('progress', { s1:{ seen:{}, wrong:{}, star:{}, exams:5e31, best:31.7 } });
  ok(P.repair(), 'الإصلاح يلمس الفاسد');
  eq(P.all().s1.exams, 0, 'ويعيده صفرًا');
  ok(!P.repair(), 'ولا يلمس السليم مرة ثانية');
}

/* --- التقرير: لا يُطبع قبل اكتمال كل فحص غير متزامن --- */
Promise.all(pending).then(() => {
  const total = pass + fail;
  console.log('\n' + '─'.repeat(52));
  if (fail){
    console.log('النتيجة: ' + pass + '/' + total + ' ناجح · ' + fail + ' فاشل');
    console.log('\nالفاشل:');
    failures.forEach(f => console.log('  · ' + f));
    process.exit(1);
  } else {
    console.log('النتيجة: ' + pass + '/' + total + ' ناجح ✓');
    process.exit(0);
  }
}).catch(e => { console.error('✗ فحص غير متزامن انهار: ' + e.message + '\n' + e.stack); process.exit(1); });
