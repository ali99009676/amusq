/*
  الإقلاع: تسجيل المسارات، بناء شريط التبويب، تشغيل المظهر والموجّه.
  ترتيب مقصود: المظهر أولًا كي لا يرى المستخدم وميض الأبيض قبل الوضع الليلي.
*/
/*
  ═══════════════════════════════════════════════════════════════════
  الشريط السفلي — واجهة المنصة الدائمة
  ═══════════════════════════════════════════════════════════════════
  ★ رموزٌ مرسومة لا محارف نصية.
  كانت الأيقونات محارف يونيكود (▤ ⌕ ↻ ⇪ ◍) — وهي أسرع ما يُكتب وأسوأ ما
  يُرى: كل نظام يرسمها بخطّه، فتختلف أوزانها وأحجامها على أندرويد وآيفون
  وويندوز، ويسقط بعضها إلى مربّع فارغ حين لا يجد الجهازُ محرفًا لها.
  وشريطٌ سفليّ هو أكثر ما يراه الطالب في المنصة — يستحق رسمًا متسقًا.

  والرسم مضمّن لا من مكتبة: خمسة رموز لا تستحق ملفًا خارجيًا يُحمَّل،
  وتضمينها يبقيها تعمل بلا إنترنت كبقية التطبيق.
*/
const ICONS = {
  /* الرئيسية: بيت — أوضح رمز في الواجهات كلها، ولا يحتاج تعلّمًا */
  home: 'M3 10.4 12 3l9 7.4M5.6 9v10.5c0 .6.4 1 1 1h4v-6h2.8v6h4c.6 0 1-.4 1-1V9',
  /* استكشف: عدسة */
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20.5 20.5 16 16',
  /* راجع: سهم دائري — الاسترجاع بعد حين */
  repeat: 'M20 12a8 8 0 1 1-2.6-5.9M20 3.5V8h-4.5',
  /* ارفع: سهم يصعد من قاعدة */
  upload: 'M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 16v2.5c0 .8.7 1.5 1.5 1.5h13c.8 0 1.5-.7 1.5-1.5V16',
  /* حسابي: كتف ورأس */
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20.5c.9-3.6 3.9-5.5 7.5-5.5s6.6 1.9 7.5 5.5'
};

function icon(d){
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20'); svg.setAttribute('height', '20');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', d);
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.7');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);
  return svg;
}

const NAV = [
  { path:'#/',         label:'الرئيسية',  ico:'home' },
  // «ارفع مادة» في الشريط لا مدفونة في صفحة الحساب: ميزة لا يراها الطالب ميزة لا وجود لها
  { path:'#/explore',  label:'استكشف',    ico:'search' },
  /* ★ «راجع» في الشريط السفلي: هي الشاشة التي يُفترض أن يفتحها الطالب
     كل يوم، ولا معنى لميزةٍ تعتمد على العادة إن كانت مدفونة في قائمة. */
  { path:'#/review',   label:'راجع',      ico:'repeat' },
  /* «ارفع مادة» لا «ارفع»: الفعل وحده مبهم — ارفع ماذا؟ والكلمتان تسعان
     على شاشة ٣٦٠ بكسل، فلا داعي لاختصارٍ يشتري مساحةً بثمن الوضوح. */
  { path:'#/upload',   label:'ارفع مادة', ico:'upload' },
  /*
    ★ خمسة لا ستة.
    الشريط السفلي على الجوال يتّسع لخمسة قبل أن تضيق مساحة اللمس ويصير
    الخطأ في الضغط قاعدة. فحين دخلت «راجع» خرجت «الإعدادات» — والمقارنة
    محسومة: المراجعة تُفتح كل يوم، والإعدادات مرةً في العمر. وانتقلت إلى
    «حسابي» حيث يبحث عنها الناس أصلًا.
  */
  { path:'#/account',  label:'حسابي',     ico:'user' }
];

function buildTabbar(){
  /*
    ★ الشريط السفلي وتنقّل الترويسة يُبنيان من قائمةٍ واحدة.
    قائمتان تتباعدان: يُضاف تبويب إلى إحداهما ويُنسى في الأخرى، فيختلف
    ما يراه الطالب على جوّاله عمّا يراه على حاسوبه. مصدرٌ واحد لا مصدران.
  */
  const top = document.getElementById('topnav');
  if (top) {
    top.innerHTML = '';
    NAV.forEach(item => {
      const a = QBANK.dom.el('a', { class:'topnav__item', href:item.path, 'data-nav':item.path });
      a.appendChild(icon(ICONS[item.ico] || ICONS.home));
      a.appendChild(QBANK.dom.el('span', { class:'topnav__lbl', text:item.label }));
      top.appendChild(a);
    });
  }

  const bar = document.getElementById('tabbar');
  if (!bar) return;
  bar.innerHTML = '';
  NAV.forEach(item => {
    /*
      الرمز داخل غلافٍ مستقل كي تُرسم عليه حبّةُ التمييز خلف الأيقونة
      وحدها لا خلف النص — التمييز الذي يبتلع الكلمة يُثقل الشريط.
    */
    const box = QBANK.dom.el('span', { class:'tabbar__box', 'aria-hidden':'true' });
    box.appendChild(icon(ICONS[item.ico] || ICONS.home));
    bar.appendChild(QBANK.dom.el('a', { class:'tabbar__item', href:item.path, 'data-nav':item.path }, [
      box,
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
    .add('#/upload',       V.ViewUpload)   // المسار الذي يُعطى للطالب — والقديم يبقى للمشرف
    .add('#/explore',      V.ViewExplore)
    .add('#/u',            V.ViewUniversity)   // قسم الجامعة: #/u/<id>
    .add('#/admin/subject', V.ViewAdminSubject)
    .add('#/s',            V.ViewShare)      // رابط المشاركة: يقبل #s/slug و #/s/slug معًا
    .add('#/subject',      V.ViewSubject)
    .add('#/exam',         V.ViewExam)
    .add('#/challenge',    V.ViewChallenge)
    .add('#/pay',          V.ViewPayReturn)   // عودة الطالب من البوابة: #/pay/<payment_id>
    .add('#/board',        V.ViewBoard)
    .add('#/review',       V.ViewReview)      // «راجع اليوم» — من كل المواد معًا
    /* ★ ‎#/p‎ لا ‎#/u‎: الأخير محجوز لقسم الجامعة، وتسجيله مرتين يجعل
       الموجّه يبتلع أحدهما بصمت — فيفتح رابط الطالب قسم جامعة عشوائيًا */
    .add('#/p',            V.ViewPeer);      // الملف العام لأي طالب: #/p/<id>
  QBANK.router.notFound = V.ViewNotFound;
}

function boot(){
  if (QBANK.ready) return;   // الإقلاع مرة واحدة مهما تكرّر نداؤه
  QBANK.store.migrate();     // ننقل تخزين الهوية القديمة قبل أن يقرأه أحد
  QBANK.data.migrateDB();    // وأسئلة وضع عدم الاتصال — بلا انتظار، فهي ليست شرطًا للإقلاع
  QBANK.theme.init();

  // رموز الدخول تعود من Supabase في هاش الصفحة — نلتقطها قبل أن يفسّرها الموجّه كمسار
  if (QBANK.api.auth.captureFromHash(location.hash)) {
    /* ★ الوجهة المحفوظة قبل المغادرة تفوز على الرئيسية: من دخل من بوابة
       المشرف يعود إلى لوحته لا إلى واجهة الطالب. تُقرأ مرة ثم تُمحى. */
    const after = QBANK.store.get('after_login', '#/');
    QBANK.store.remove('after_login');
    const dest = /^#\//.test(after) ? after : '#/';
    try { history.replaceState(null, '', location.pathname + location.search + dest); }
    catch(e) { location.hash = dest; }
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
    /* ★ نبضةٌ متكرّرة لا واحدة عند الإقلاع: من فتح التطبيق ثم وضع جوّاله
       في جيبه ليس متصلًا بالمعنى الذي يهمّ المشرف. */
    if (QBANK.presence) QBANK.presence.start();
    /* ★ بوابة الاسم: من دخل بحسابٍ بلا اسم لا يمضي قبل أن يكتبه —
       اللوحة بأسماءٍ مجهولة لا تحفّز أحدًا. لا تُفتح في لوحة المشرف. */
    if (QBANK.names && !(location.hash || '').startsWith('#/admin')) QBANK.names.checkGate();
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
