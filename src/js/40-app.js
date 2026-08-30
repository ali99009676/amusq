/*
  الإقلاع: تسجيل المسارات، بناء شريط التبويب، تشغيل المظهر والموجّه.
  ترتيب مقصود: المظهر أولًا كي لا يرى المستخدم وميض الأبيض قبل الوضع الليلي.
*/
const NAV = [
  { path:'#/',         label:'الرئيسية',  ico:'▤' },
  { path:'#/board',    label:'المتصدرون', ico:'🏆' },
  { path:'#/settings', label:'الإعدادات', ico:'☰' },
  { path:'#/account',  label:'حسابي',     ico:'◍' }
];

function buildTabbar(){
  const bar = document.getElementById('tabbar');
  if (!bar) return;
  bar.innerHTML = '';
  NAV.forEach(item => {
    bar.appendChild(QBANK.dom.el('a', { class:'tabbar__item', href:item.path, 'data-nav':item.path }, [
      QBANK.dom.el('span', { class:'tabbar__ico', 'aria-hidden':'true', text:item.ico }),
      QBANK.dom.el('span', { class:'tabbar__lbl', text:item.label })
    ]));
  });
}

function registerRoutes(){
  const V = QBANK.views;
  QBANK.router
    .add('#/',            V.ViewHome)
    .add('#/login',       V.ViewLogin)
    .add('#/admin',       V.ViewAdmin)
    .add('#/admin/login', V.ViewAdminLogin)
    .add('#/settings',    V.ViewSettings)
    .add('#/account',     V.ViewAccount)
    .add('#/admin/upload', V.ViewUpload)
    .add('#/admin/subject', V.ViewAdminSubject)
    .add('#/s',            V.ViewShare)      // رابط المشاركة: يقبل #s/slug و #/s/slug معًا
    .add('#/subject',      V.ViewSubject)
    .add('#/exam',         V.ViewExam)
    .add('#/board',        V.ViewBoard);
  QBANK.router.notFound = V.ViewNotFound;
}

function boot(){
  if (QBANK.ready) return;   // الإقلاع مرة واحدة مهما تكرّر نداؤه
  QBANK.store.migrate();     // ننقل تخزين الهوية القديمة قبل أن يقرأه أحد
  QBANK.data.migrateDB();    // وأسئلة وضع عدم الاتصال — بلا انتظار، فهي ليست شرطًا للإقلاع
  QBANK.theme.init();

  // رموز الدخول تعود من Supabase في هاش الصفحة — نلتقطها قبل أن يفسّرها الموجّه كمسار
  if (QBANK.api.auth.captureFromHash(location.hash)) {
    try { history.replaceState(null, '', location.pathname + location.search + '#/'); }
    catch(e) { location.hash = '#/'; }
    QBANK.toast('تم تسجيل الدخول');
  }

  buildTabbar();
  registerRoutes();
  QBANK.router.init();
  registerSW();
  QBANK.ready = true;

  // أعمال الخلفية: لا تُعطّل الرسم الأول ولا تكسر العمل بلا إنترنت
  if (QBANK.api.user()) {
    QBANK.progress.pull();                       // دمج تقدّم الحساب مع الجهاز — بلا حذف
    QBANK.gate.refresh();                        // الاستحقاقات: ما اشتراه الطالب
    QBANK.api.rpc('heartbeat', { device_label: navigator.userAgent.slice(0, 60) });
  }
  if (QBANK.config.ready()) {
    QBANK.data.refreshPack().then(r => {         // تحديث قائمة المواد إن توفّر اتصال
      if (r.ok && QBANK.router.current && QBANK.router.current.path === '#/') QBANK.router.render('#/');
    });
  }
}

// PWA: عامل الخدمة يُسجَّل على https فقط — file:// يعمل بلا حاجة إليه أصلًا
function registerSW(){
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  if (location.protocol !== 'https:') return false;
  navigator.serviceWorker.register('sw.js').catch(() => {});   // فشله لا يعطل المنصة
  return true;
}

QBANK.registerSW = registerSW;
QBANK.nav = NAV;
QBANK.boot = boot;
window.QBANK = QBANK;

// jsdom في الفحوص يُحمّل الصفحة كاملة قبل تنفيذ السكربت، لذا نتحقق من الحالتين
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
