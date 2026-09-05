/*
  النواة: مساحة الاسم، أدوات DOM، والتخزين.
  لماذا مساحة اسم واحدة على window؟ لأن الفحوص الآلية (jsdom) تحتاج بابًا واحدًا
  تدخل منه إلى المنطق دون فتح كل شيء للعالم.
*/
const QBANK = { version: '0.1.0', stage: 0 };

/* --- أدوات DOM مختصرة --- */
/* الجذر قد يختفي إن رجع وعدٌ متأخر بعد تفكيك الصفحة (تنقّل أو إغلاق تبويب) — نُرجِع لا شيء بدل الانهيار */
const docOf = root => root || (typeof document !== 'undefined' ? document : null);
const $  = (sel, root) => { const d = docOf(root); return d ? d.querySelector(sel) : null; };
const $$ = (sel, root) => { const d = docOf(root); return d ? Array.prototype.slice.call(d.querySelectorAll(sel)) : []; };

/*
  ★ هل الصفحة ما زالت قائمة؟
  وعدٌ يعود بعد إغلاق التبويب — أو بعد أن تُنهي الفحوص نافذتها — يجد
  `document` مفقودًا، فتنهار `el` بـ«cannot read createElement of undefined»
  ويسقط كل ما بعده في تلك السلسلة.

  وحارس `isConnected` لا يصلح بديلًا عن هذا: البطاقة قد تكون مبنيّةً ولمّا
  تُدرَج في شجرتها بعد، فيمنعها من أول رسمٍ لها ويتركها فارغةً أبدًا —
  وهذا عطلٌ وقع فعلًا في موجز الأكواد. فالسؤالان مختلفان: «هل المستند حيّ؟»
  غير «هل أنا معلّق فيه؟».
*/
const alive = () => !!docOf(null);

/*
  ★ الرابط والمصدر لا يحملان سكربتًا: href/src بمخطّط javascript: أو vbscript:
  يُسقَطان، وdata: لا يصلح رابطًا (يصلح مصدر صورة). البيانات تأتي من القاعدة
  ومن ملفات الطلاب، وحارسٌ في البنّاء نفسه أضمن من تذكّره عند كل استعمال.
*/
const BAD_URL = /^\s*(javascript|vbscript)\s*:/i;
function safeUrlAttr(k, v){
  const s = String(v);
  if (BAD_URL.test(s)) return false;
  if (k === 'href' && /^\s*data\s*:/i.test(s)) return false;
  return true;
}
function el(tag, attrs, children){
  const node = document.createElement(tag);
  if (attrs) Object.keys(attrs).forEach(k => {
    const v = attrs[k];
    if (v === null || v === undefined || v === false) return;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;   // يُستعمل فقط مع نصوص نبنيها نحن
    else if ((k === 'href' || k === 'src' || k === 'action' || k === 'formaction') && !safeUrlAttr(k, v)) return;
    else if (/^on/i.test(k)) return;              // لا معالجات أحداث كسِمات — addEventListener فقط
    else node.setAttribute(k, v === true ? '' : String(v));
  });
  if (children) [].concat(children).forEach(c => {
    if (c === null || c === undefined) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

QBANK.alive = alive;

/* تهريب النصوص قبل حقنها — قاعدة أمان ثابتة: أي نص من ملف أو قاعدة بيانات يمرّ من هنا */
function esc(s){
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/* --- التخزين المحلي: التقدّم والإعدادات في localStorage (خفيفة).
       الأسئلة لاحقًا في IndexedDB لأن سقف localStorage ≈ ٥ ميغابايت لا يكفي مئات الأسئلة. --- */
const Store = {
  NS: 'qbank:',
  OLD_NS: 'amusq:',   // البادئة قبل تغيير الهوية

  /*
    هجرة تخزين الطالب عند أول فتح بعد التحديث.

    تغيير البادئة وحده كان سيجعل كل طالب يفتح المنصة فيجد تقدّمه ونجومه
    وأخطاءه المحفوظة قد اختفت — وهي في جهازه لم تُمسّ، لكنها تحت اسم لا نقرؤه.
    فننقلها مرة واحدة ثم نمسح القديم. من لا شيء عنده لا يدفع ثمن شيء.
  */
  migrate(){
    let moved = 0;
    try{
      Object.keys(localStorage)
        .filter(k => k.indexOf(Store.OLD_NS) === 0)
        .forEach(k => {
          const fresh = Store.NS + k.slice(Store.OLD_NS.length);
          // لا نطمس قيمة جديدة كتبها المستخدم بعد التحديث
          if (localStorage.getItem(fresh) === null) localStorage.setItem(fresh, localStorage.getItem(k));
          localStorage.removeItem(k);
          moved++;
        });
    } catch(e){}          // التصفح الخاص قد يمنع الكتابة — لا نُسقط التطبيق
    return moved;
  },
  get(key, fallback){
    try{
      const raw = localStorage.getItem(Store.NS + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch(e){ return fallback; }   // وضع التصفح الخاص قد يمنع القراءة، فلا نُسقط التطبيق
  },
  set(key, value){
    try{ localStorage.setItem(Store.NS + key, JSON.stringify(value)); return true; }
    catch(e){ return false; }
  },
  remove(key){
    try{ localStorage.removeItem(Store.NS + key); return true; } catch(e){ return false; }
  },
  clearAll(){
    try{
      Object.keys(localStorage)
        .filter(k => k.indexOf(Store.NS) === 0)
        .forEach(k => localStorage.removeItem(k));
      return true;
    } catch(e){ return false; }
  },

  /*
    ★ ما يخصّ الشخص لا الجهاز.
    الجهاز واحد وقد يتناوب عليه شخصان: طالبٌ يخرج وزميله يدخل، أو صاحبُ
    الجهاز نفسه بحسابٍ ثانٍ. وكان كل ما نخزّنه مفتاحًا عامًّا بلا هوية،
    فيرث الداخلُ الجديدُ ملفَ من قبله: صورتَه ورقمَ جواله وتقدّمَه — بل
    ومشترياته. هذا ليس خللًا في العرض، هو تسريبُ بياناتٍ بين حسابين.

    القائمة صريحة لا نمطية: مفتاحٌ جديد يُنسى إضافته يبقى ظاهرًا فيُكتشف،
    ومفتاحُ جهازٍ يُمسح خطأً (السمة، إعداد الربط) عطلٌ صامت يحيّر صاحبه.
  */
  PERSONAL: ['profile', 'progress', 'entitlements', 'campus', 'my_subjects',
             'is_admin_check', 'exam_dates', 'after_login', 'ad_days', 'explore_last'],
  clearPersonal(){
    Store.PERSONAL.forEach(k => Store.remove(k));
    return true;
  }
};

/* --- رسالة عابرة --- */
let toastTimer = null;
function toast(msg, ms){
  const box = $('#toast');
  if (!box) return;
  box.textContent = msg;
  box.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove('is-on'), ms || 2400);
}

QBANK.dom = { $, $$, el, esc };
QBANK.store = Store;
QBANK.toast = toast;
