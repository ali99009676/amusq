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
    bar.appendChild(AMUSQ.dom.el('a', { class:'tabbar__item', href:item.path, 'data-nav':item.path }, [
      AMUSQ.dom.el('span', { class:'tabbar__ico', 'aria-hidden':'true', text:item.ico }),
      AMUSQ.dom.el('span', { class:'tabbar__lbl', text:item.label })
    ]));
  });
}

function registerRoutes(){
  const V = AMUSQ.views;
  AMUSQ.router
    .add('#/',            V.ViewHome)
    .add('#/login',       V.ViewLogin)
    .add('#/admin',       V.ViewAdmin)
    .add('#/admin/login', V.ViewAdminLogin)
    .add('#/settings',    V.ViewSettings)
    .add('#/account',     V.ViewAccount)
    .add('#/admin/upload', V.ViewUpload)
    .add('#/admin/subject', V.ViewAdminSubject)
    .add('#/subject',      V.ViewSubject)
    .add('#/exam',         V.ViewExam)
    .add('#/board',        V.ViewBoard);
  AMUSQ.router.notFound = V.ViewNotFound;
}

function boot(){
  if (AMUSQ.ready) return;   // الإقلاع مرة واحدة مهما تكرّر نداؤه
  AMUSQ.theme.init();

  // رموز الدخول تعود من Supabase في هاش الصفحة — نلتقطها قبل أن يفسّرها الموجّه كمسار
  if (AMUSQ.api.auth.captureFromHash(location.hash)) {
    try { history.replaceState(null, '', location.pathname + location.search + '#/'); }
    catch(e) { location.hash = '#/'; }
    AMUSQ.toast('تم تسجيل الدخول');
  }

  buildTabbar();
  registerRoutes();
  AMUSQ.router.init();
  registerSW();
  AMUSQ.ready = true;

  // أعمال الخلفية: لا تُعطّل الرسم الأول ولا تكسر العمل بلا إنترنت
  if (AMUSQ.api.user()) {
    AMUSQ.progress.pull();                       // دمج تقدّم الحساب مع الجهاز — بلا حذف
    AMUSQ.gate.refresh();                        // الاستحقاقات: ما اشتراه الطالب
    AMUSQ.api.rpc('heartbeat', { device_label: navigator.userAgent.slice(0, 60) });
  }
  if (AMUSQ.config.ready()) {
    AMUSQ.data.refreshPack().then(r => {         // تحديث قائمة المواد إن توفّر اتصال
      if (r.ok && AMUSQ.router.current && AMUSQ.router.current.path === '#/') AMUSQ.router.render('#/');
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

AMUSQ.registerSW = registerSW;
AMUSQ.nav = NAV;
AMUSQ.boot = boot;
window.AMUSQ = AMUSQ;

// jsdom في الفحوص يُحمّل الصفحة كاملة قبل تنفيذ السكربت، لذا نتحقق من الحالتين
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
