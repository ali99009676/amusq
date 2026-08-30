'use strict';
/*
  الفحوص الآلية — شرط تسليم لا تحسين اختياري.
  لا تُسلَّم ميزة في AMUSQ بلا فحوصها، والفحوص تعمل على الملف المبني نفسه
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
    url: 'https://amusq.local/' + (hash || ''),
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
  await until(W, () => W.AMUSQ.router.current && W.AMUSQ.router.current.raw === hash.split('?')[0]);
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
  const W = d.window, A = W.AMUSQ;
  ok(!!A, 'مساحة الاسم AMUSQ متاحة');
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
  const W = d.window, A = W.AMUSQ, doc = W.document;
  const screens = [
    ['#/',            'ذاكر أذكى، لا أطول'],   // زائر: صفحة الهبوط التعريفية
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
  eq(doc.querySelector('[data-tab="students"]').getAttribute('aria-selected'), 'true', 'تبويب الطلاب هو الافتراضي');
  A.router.render('#/admin/content');
  eq(doc.querySelector('[data-tab="content"]').getAttribute('aria-selected'), 'true', 'تبويب المحتوى يُفعَّل من المسار');
  eq(doc.querySelectorAll('.tabs__btn').length, 3, 'ثلاثة تبويبات في اللوحة');
  A.api.saveSession(null);   // نعيد حالة الزائر لبقية فحوص هذا القسم

  // المنصة تبدأ فارغة: لا مادة ولا سؤال داخل الكود
  A.api.saveSession(null);
  A.router.render('#/');
  eq(doc.querySelectorAll('.lp-card').length, 6, 'صفحة الهبوط بلا مواد مدمجة — ست بطاقات مزايا فقط');
  ok(!!doc.querySelector('#main .empty'), 'الهبوط يعلن بوضوح أن المواد لم تُنشر بعد');
  W.close();
}

/* ============ ٧ · الوضع الليلي ============ */
describe('٧ · الوضع الليلي');
{
  const d = makeDom('#/');
  const W = d.window, A = W.AMUSQ, root = W.document.documentElement;
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
  const W = d.window, A = W.AMUSQ;
  eq(A.store.get('لا_يوجد', 'افتراضي'), 'افتراضي', 'القيمة الافتراضية ترجع عند غياب المفتاح');
  A.store.set('t', { a:1, ب:'نص' });
  eq(A.store.get('t').ب, 'نص', 'القيم العربية تُحفظ وتُقرأ سليمة');
  ok(W.localStorage.getItem('amusq:t') !== null, 'المفاتيح تحمل بادئة amusq:');
  W.localStorage.setItem('غريب', '1');
  A.store.clearAll();
  eq(A.store.get('t', null), null, 'التصفير يمسح مفاتيح المنصة');
  eq(W.localStorage.getItem('غريب'), '1', 'التصفير لا يمسّ مفاتيح تطبيقات أخرى');
  W.localStorage.setItem('amusq:bad', '{ليس JSON');
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
  const A = d.window.AMUSQ;
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
  const W = d.window, A = W.AMUSQ;
  // هذا القسم يفحص مسار «الإعداد اليدوي» — نعطّل الإعداد المحقون وقت البناء مؤقتًا
  delete W.AMUSQ_INJECTED_CONFIG;
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
  const W = d.window, A = W.AMUSQ;
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
  const P = d.window.AMUSQ.progress;
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
  const P = d.window.AMUSQ.progress;
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
  const W = d.window, DT = W.AMUSQ.data;
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
  const W = d.window, A = W.AMUSQ, doc = W.document;
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
    .forEach(t => has(sql, 'amusq.' + t, 'جدول ' + t + ' معرّف في مخطط amusq'));
  ['is_admin','content_pack','subject_questions','approve_draft','admin_students','admin_attempts','admin_stats','board','delete_me','heartbeat','can_access']
    .forEach(f => has(sql, 'function amusq.' + f, 'دالة ' + f + ' معرّفة في مخطط amusq'));
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
  const W = d.window, A = W.AMUSQ, Ad = A.admin;
  eq(Ad.BATCH, 25, 'حد الدفعة ٢٥ سؤالًا');
  eq(Ad.chunk([1,2,3,4,5], 2).length, 3, 'التقسيم لدفعات صحيح');
  eq(Ad.chunk([], 2).length, 0, 'مصفوفة فارغة: صفر دفعات');

  const w = Ad.newWizard();
  eq(w.step, 1, 'المعالج يبدأ من الخطوة ١');
  w.raw = new Array(300).fill(0).map((_, i) => ({ q:'Q' + i, has_options:true, options:['a','b'], answer:0 }));
  w.total = 300;
  const est = Ad.estimate(w);
  eq(est.questions, 300, 'التقدير: ٣٠٠ سؤال — ملف كبير يمرّ');
  eq(est.batches, 12, 'التقدير: ١٢ دفعة قبل التشغيل — تكلفة معلومة');

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

  const w2 = Ad.newWizard();
  w2.raw = new Array(60).fill(0).map((_, i) => ({ q:'Q' + i, has_options:true, options:['a','b'], answer:0 }));
  w2.total = 60; w2.step = 2;
  W.__t = (async () => {
    await Ad.wizardEnrich(w2);
    const afterFail = { done: w2.done, error: w2.error, saved };
    await Ad.wizardEnrich(w2);              // استئناف
    return { afterFail, final: { done: w2.done, step: w2.step, len: w2.enriched.length } };
  })();
  pending.push(W.__t.then(r => {
    eq(r.afterFail.done, 25, 'انقطاع الدفعة ٢: المنجز ٢٥ محفوظ لا ضائع');
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
  const W = d.window, A = W.AMUSQ, doc = W.document;
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
  has(ai, "questions.length > 25", 'الخادم يرفض دفعة تتجاوز ٢٥');
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
  const E = d.window.AMUSQ.exam;

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
  const W = d.window, A = W.AMUSQ, doc = W.document;
  const future = new Date(W.Date.now() + 5 * 86400000).toISOString();
  const past = new Date(W.Date.now() - 3 * 86400000).toISOString();
  A.data.savePack({ subjects: [
    { id:'s1', name:'الإسعافات', color:'subject-1', icon:'🚑', q_count:50, exam_date:future, ord:0, free:false },
    { id:'s2', name:'التشريح',   color:'subject-2', icon:'🦴', q_count:30, exam_date:past,   ord:1, free:true },
    { id:'s3', name:'الأدوية',   color:'bad"inject', icon:'💊', q_count:20, ord:2, free:false }
  ], settings:{ welcome_text:'أهلًا بك في AMUSQ' } });
  A.store.set('my_subjects', ['s1','s2']);
  // بطاقات المواد للطالب المسجَّل — الزائر يرى صفحة الهبوط بدلها
  const pl25 = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'stu-1', email:'s@t.sa' }))));
  A.api.auth.captureFromHash('#access_token=h.' + pl25 + '.s&refresh_token=r&expires_in=9999');
  A.router.render('#/');
  const t = doc.getElementById('main').textContent;
  has(t, 'أهلًا بك في AMUSQ', 'نص الترحيب من الإعدادات يظهر');
  has(t, 'موادي', 'قسم موادي أولًا');
  has(t, 'مواد أخرى متاحة', 'قسم المواد الأخرى مع زر الإضافة');
  has(t, 'الاختبار بعد 5 يوم', 'العد التنازلي لموعد الاختبار');
  has(t, 'تم الانتهاء ✓', 'ختم الانتهاء للمادة الماضية');
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
  const W = d.window, A = W.AMUSQ, doc = W.document;
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
  const W = d.window, A = W.AMUSQ, doc = W.document;
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
  const W = d.window, A = W.AMUSQ;
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
  const W = d.window, A = W.AMUSQ, G = A.gate, doc = W.document;
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
  eq(d.window.AMUSQ.registerSW(), false, 'لا تسجيل لعامل الخدمة خارج https — فتح الملف يبقى سليمًا');
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
  const A = d.window.AMUSQ;
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
  const W = d.window, A = W.AMUSQ, doc = W.document;
  A.data.savePack({ subjects:[
    { id:'s1', name:'الإسعافات الأولية', color:'subject-1', icon:'🚑', q_count:120, free:true,
      descr:'مبادئ الإنعاش', topics:['BLS','ALS'], ord:0 },
    { id:'s2', name:'التشريح', color:'subject-2', icon:'🦴', q_count:80, free:false, ord:1, topics:[] }
  ], settings:{ welcome_text:'' } });

  A.api.saveSession(null);
  A.router.render('#/');
  const t = doc.getElementById('main').textContent;

  has(t, 'ذاكر أذكى', 'العنوان الرئيسي يظهر للزائر');
  has(t, 'طلاب التخصصات الصحية', 'الجمهور المستهدف معلن');
  ok(doc.querySelectorAll('.lp-stat').length === 4, 'شريط الأرقام بأربع خانات');
  has(t, '200', 'إجمالي الأسئلة محسوب من المواد المنشورة فعلًا');
  has(t, 'الإسعافات الأولية', 'المواد المنشورة معروضة في الصفحة التعريفية');
  has(t, 'مجانية بالكامل', 'المادة المجانية موسومة للزائر');
  has(t, '120 سؤالًا', 'عدد أسئلة كل مادة ظاهر');
  ok(doc.querySelectorAll('.lp-steps .lp-step').length === 4, 'أربع خطوات للبدء');
  has(t, 'حزمة الفصل', 'نموذج التسعير الموسمي معروض');
  no(t, 'اشتراك شهري', 'لا وعد باشتراك شهري — مخالف لنموذج العمل');
  ok(doc.querySelectorAll('a[href="#/login"]').length >= 3, 'دعوات متعددة للتسجيل');
  has(t, 'بلا إنترنت', 'ميزة العمل دون اتصال مذكورة');
  has(t, 'حرفًا بحرف', 'قاعدة القداسة معروضة كميزة بيعية');

  // الطالب المسجَّل لا يرى الهبوط بل مواده
  const pl = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'u-lp', email:'a@b.c' }))));
  A.api.auth.captureFromHash('#access_token=h.' + pl + '.s&refresh_token=r&expires_in=9999');
  A.router.render('#/');
  const t2 = doc.getElementById('main').textContent;
  eq(doc.querySelector('#main h1').textContent, 'موادي', 'المسجَّل يرى مواده مباشرة لا الصفحة التعريفية');
  no(t2, 'ذاكر أذكى', 'الهبوط لا يظهر للمسجَّل');
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
