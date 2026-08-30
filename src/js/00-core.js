/*
  النواة: مساحة الاسم، أدوات DOM، والتخزين.
  لماذا مساحة اسم واحدة على window؟ لأن الفحوص الآلية (jsdom) تحتاج بابًا واحدًا
  تدخل منه إلى المنطق دون فتح كل شيء للعالم.
*/
const AMUSQ = { version: '0.1.0', stage: 0 };

/* --- أدوات DOM مختصرة --- */
/* الجذر قد يختفي إن رجع وعدٌ متأخر بعد تفكيك الصفحة (تنقّل أو إغلاق تبويب) — نُرجِع لا شيء بدل الانهيار */
const docOf = root => root || (typeof document !== 'undefined' ? document : null);
const $  = (sel, root) => { const d = docOf(root); return d ? d.querySelector(sel) : null; };
const $$ = (sel, root) => { const d = docOf(root); return d ? Array.prototype.slice.call(d.querySelectorAll(sel)) : []; };

function el(tag, attrs, children){
  const node = document.createElement(tag);
  if (attrs) Object.keys(attrs).forEach(k => {
    const v = attrs[k];
    if (v === null || v === undefined || v === false) return;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;   // يُستعمل فقط مع نصوص نبنيها نحن
    else node.setAttribute(k, v === true ? '' : String(v));
  });
  if (children) [].concat(children).forEach(c => {
    if (c === null || c === undefined) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

/* تهريب النصوص قبل حقنها — قاعدة أمان ثابتة: أي نص من ملف أو قاعدة بيانات يمرّ من هنا */
function esc(s){
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/* --- التخزين المحلي: التقدّم والإعدادات في localStorage (خفيفة).
       الأسئلة لاحقًا في IndexedDB لأن سقف localStorage ≈ ٥ ميغابايت لا يكفي مئات الأسئلة. --- */
const Store = {
  NS: 'amusq:',
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

AMUSQ.dom = { $, $$, el, esc };
AMUSQ.store = Store;
AMUSQ.toast = toast;
