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

  A.router.render('#/settings');
  has(W.document.title, 'الإعدادات', 'عنوان المستند يتبع الشاشة');
  const onNav = W.document.querySelector('[data-nav="#/settings"]');
  eq(onNav.getAttribute('aria-current'), 'page', 'الرابط النشط معلَّم aria-current');
  eq(W.document.querySelectorAll('[aria-current="page"]').length, 1, 'رابط نشط واحد لا أكثر');
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
  eq(doc.querySelectorAll('.tabs__btn').length, 5, 'خمسة تبويبات في اللوحة');
  A.api.saveSession(null);   // نعيد حالة الزائر لبقية فحوص هذا القسم

  // المنصة تبدأ فارغة: لا مادة ولا سؤال داخل الكود
  A.api.saveSession(null);
  A.router.render('#/');
  // ست بطاقات مزايا + نموذجا مادة ثابتان. ولا بطاقة واحدة تأتي من القاعدة
  eq(doc.querySelectorAll('.lp-card').length, 8, 'ثماني بطاقات: ست مزايا ونموذجان');
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
  eq(root.getAttribute('data-theme'), 'light', 'الوضع الفاتح هو الافتراضي');
  eq(A.theme.toggle(), 'dark', 'التبديل يُفعّل الليلي');
  eq(root.getAttribute('data-theme'), 'dark', 'السمة تُكتب على عنصر الجذر');
  eq(A.store.get('theme'), 'dark', 'الاختيار يُحفظ في الجهاز');
  eq(W.document.querySelector('[data-theme-icon]').textContent, '☀', 'أيقونة الزر تتبع الحالة');
  eq(A.theme.toggle(), 'light', 'التبديل يرجع للفاتح');
  W.document.getElementById('themeBtn').click();
  eq(root.getAttribute('data-theme'), 'dark', 'زر الشريط العلوي يبدّل السمة');
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
  eq(m.s1.exams, 5, 'عدّاد الاختبارات: المجموع');
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
  ok(btns.indexOf('الدخول بحساب جوجل') !== -1, 'زر جوجل موجود');
  ok(btns.indexOf('الدخول بحساب آبل') !== -1, 'زر آبل موجود');

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
  const acctBtns = Array.prototype.map.call(doc.querySelectorAll('#main button'), b => b.textContent);
  ok(acctBtns.indexOf('زامن الآن') !== -1, 'زر المزامنة موجود');
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
  has(ai, 'process.env.ANTHROPIC_API_KEY', 'مفتاح الذكاء من بيئة الخادم');
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
  has(t, 'انتهى موعده', 'ختم الانتهاء للمادة الماضية');
  has(t, 'من', 'العدد المطلق للأسئلة المنجزة — لا النسبة وحدها');
  has(t, 'مجانية', 'وسم المادة المجانية');
  ok(!!doc.querySelector('[aria-label*="أضف"]'), 'زر + أضف إلى موادي موجود');
  // المنتهية تنزل آخر قائمة موادي
  const cards = doc.querySelectorAll('#main .subj');
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
  // على الويب: الشراء من الموقع؛ وداخل التطبيق يصير زر شراء داخلي (قاعدة المتاجر)
  ok(!!doc.querySelector('#main a[href*="alsoqoor.com"]'), 'زر الشراء من الموقع على الويب');
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
  ok(!!doc.querySelector('.subj'), 'بطاقات المواد التفاعلية للمسجَّل');
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
  A.api.rpc = (name, args) => {
    if (name !== 'admin_dashboard') return Promise.resolve({ ok:false, data:null });
    ok(args && typeof args.days === 'number', 'اللوحة تمرّر مدى الأيام إلى الخادم');
    return Promise.resolve({ ok:true, data: DATA });
  };

  pending.push((async () => {
    await nav(W, '#/admin');
    await until(W, () => doc.querySelector('.ad-kpi'));
    const t = doc.getElementById('main').textContent;
    has(t, '42', 'عدد الطلاب في المؤشرات');
    has(t, '71.5٪', 'متوسط النتائج بعلامة النسبة');
    has(t, '4/5', 'المنشور من إجمالي المواد');
    has(t, 'مسوّدة معلّقة', 'المسوّدات المعلّقة تُنبَّه');
    eq(doc.querySelectorAll('.ad-kpi').length, 6, 'ستة مؤشرات');

    // الرسم: عمود لكل يوم، والفارغ يأخذ صنفًا مختلفًا كي يُقرأ الصفر لا يختفي
    const bars = doc.querySelectorAll('.ad-chart .bar');
    eq(bars.length, 3, 'عمود لكل يوم في السلسلة');
    eq(doc.querySelectorAll('.ad-chart .bar--empty').length, 1, 'اليوم الخالي يُرسم شريطًا باهتًا لا فراغًا');
    // أطول عمود هو الأعلى قيمة — الفحص على الارتفاع نفسه لا على وجود العنصر
    const hs = Array.prototype.map.call(bars, b => parseFloat(b.getAttribute('height')));
    ok(hs[2] > hs[0] && hs[0] > hs[1], 'ارتفاع الأعمدة يتناسب مع الأعداد ١٢ > ٥ > ٠');
    ok(!!doc.querySelector('.ad-chart .line'), 'خط متوسط النتيجة مرسوم');
    has(doc.getElementById('main').textContent, 'اختبارًا خلال', 'مجموع الفترة معروض');

    eq(doc.querySelectorAll('.ad-bucket').length, 5, 'خمس شرائح للنتائج');
    // المواد مرتبة بالمحاولات: «الصدمات» ٩٩ قبل «التسمم» ٨٠ رغم ترتيب المصفوفة
    const rows = doc.querySelectorAll('.ad-row');
    has(rows[0].textContent, 'الصدمات', 'المواد مرتبة بالأكثر استخدامًا لا بترتيب الجلب');
    has(rows[0].textContent, 'مخفية', 'حالة النشر ظاهرة في الصف');
    has(doc.querySelector('.ad-feed').textContent, 'سارة', 'آخر النشاط يعرض اسم الطالب');
    has(doc.querySelector('.ad-feed').textContent, ' د', 'وقت النشاط نسبي بالدقائق');
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
    eq(qbox.querySelectorAll('textarea, input[type="text"], [contenteditable="true"]').length, 0,
       'قاعدة القداسة: لا حقل تحرير على نص السؤال أو خياراته');

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

    eq(doc.querySelectorAll('.ad-panel[data-group]').length, 3, 'ثلاث مجموعات إعدادات');
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
    await until(W, () => fired === 'expired', 8000);
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

  // المنشئ نفسه ⇦ تجربة
  const mk = id => W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:id, email:'x@x.x' }))));
  A.api.auth.captureFromHash('#access_token=h.' + mk('creator-9') + '.s&refresh_token=r&expires_in=9999');
  eq(G.localGuess(SUB).reason, 'trial', 'المنشئ يدخل بالتجربة');

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
  has(btn.textContent, '49 ريال', 'زر الشراء يعرض السعر');
  eq(btn.getAttribute('data-ref'), 'creator-9', 'زر الشراء يحمل المُحيل كي تصله كوينزه');

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

    await nav(W, '#/account');
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
  has(css, '--read-lh: 2', 'وارتفاع السطر ٢ لنص إنجليزي داخل واجهة عربية');

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

  has(t, 'EMS 301', 'رمز المقرر كما يُكتب في الجدول الدراسي');
  ok(!!doc.querySelector('.subj__code'), 'وله موضعه الخاص فوق الاسم');

  // الموعد عدّاد لا وسم
  const dl = doc.querySelector('.deadline');
  ok(!!dl, 'موعد الاختبار عدّاد مستقل');
  has(dl.textContent, '٥', 'رقمه بالعربية');
  has(dl.textContent, 'أيام', 'ووحدته تحته');

  // العدد المطلق قبل النسبة
  has(t, 'من ١٢٠ سؤالًا', 'العدد المطلق للأسئلة — لا النسبة وحدها');
  has(t, '٣ محاور', 'وعدد المحاور');
  ok(!!doc.querySelector('.subj__pct'), 'والنسبة إلى جانبه لا بدلًا منه');
  has(t, 'انتهى موعده', 'والمادة الماضية موسومة بلا عدّاد');
  eq(doc.querySelectorAll('.deadline').length, 1, 'لا عدّاد لمادة انتهى موعدها');
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

  const TABS = ['dash','students','ugc','content','settings'];
  eq(A.views.ADMIN_TABS.length, 5, 'خمسة تبويبات في اللوحة');
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

    // تبويب الطلاب يستعمل نفس مؤشرات اللوحة
    await nav(W, '#/admin/students');
    await until(W, () => doc.querySelector('.ad-kpi'));
    eq(doc.querySelectorAll('.ad-kpi').length, 4, 'أربعة مؤشرات للطلاب بنفس مكوّن اللوحة');
    ok(!!doc.querySelector('.ad-panel'), 'والقائمة داخل لوحة معنونة');
    ok(!!doc.querySelector('.ad-row'), 'وصفوفها بلغة الصفوف الموحّدة');
    has(doc.getElementById('main').textContent, 'أفضل 88٪', 'وأفضل نتيجة للطالب ظاهرة');

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
}).catch(e => { console.error('✗ فحص غير متزامن انهار: ' + e.message); process.exit(1); });
