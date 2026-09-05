/*
  ═══════════════════════════════════════════════════════════════════
  التطبيق الأصلي (Capacitor) — الجسر بين الويب والجهاز
  ═══════════════════════════════════════════════════════════════════
  الملف نفسه (index.html) يعمل في المتصفح وفي تطبيق آيفون/أندرويد. الفرق
  الوحيد: داخل التطبيق يوجد جسرٌ يحقنه النظام قبل أي سطر منّا
  (window.Capacitor) — ليس مكتبةً نحمّلها من الشبكة، بل جزء من غلاف
  التطبيق كما أن المتصفح جزء من الجهاز. كل ما هنا يُفعَّل حين يوجد الجسر
  فقط، ويبقى الموقع كما هو بدونه — لا سطر منه يلمس الويب.

  ★ لماذا يحتاج التطبيقُ جسرًا أصلًا؟
  ١ · الدخول: جوجل ترفض OAuth داخل WebView مضمَّن (403 disallowed_useragent)،
      فيُفتح الدخول في Safari الحقيقي ويعود بالرمز عبر رابطٍ عميق muraja://auth.
  ٢ · الخادم: أصل التطبيق capacitor://localhost لا https — فنداءات /api
      تحتاج عنوان الإنتاج صراحةً.
  ٣ · وما يجعله «تطبيقًا» لا «موقعًا في غلاف» عند مراجعة أبل: اهتزاز عند
      الإجابة، ورقة المشاركة، شريط الحالة يتبع الوضع، وشاشة بداية.
*/
const Native = {
  SCHEME:   'muraja',
  REDIRECT: 'muraja://auth',
  API_BASE: 'https://amsuq.alsoqoor.com',
  active: false,

  bridge(){
    const C = (typeof window !== 'undefined') ? window.Capacitor : null;
    return (C && typeof C.isNativePlatform === 'function' && C.isNativePlatform()) ? C : null;
  },
  plugin(name){
    const C = Native.bridge();
    return (C && C.Plugins && C.Plugins[name]) || null;
  },
  platform(){ const C = Native.bridge(); return C ? C.getPlatform() : 'web'; },

  /* يُستدعى عند تحميل الملف — والجسر موجود قبله. آمن التكرار (للفحوص) */
  init(){
    if (!Native.bridge()) { Native.active = false; return false; }
    Native.active = true;
    window.QBANK_NATIVE_APP = true;
    /* الخادم: التطبيق لا يعرف «نفس الأصل»، فيُكتب عنوان الإنتاج مرة ويبقى */
    if (!QBANK.store.get('api_base', '')) QBANK.store.set('api_base', Native.API_BASE);
    Native.wireAuth();
    Native.wireLinks();
    Native.wireTheme();
    Native.wireShare();
    Native.wireBack();
    Native.wireStore();
    /* شاشة البداية تُخفى بعد أول رسم — لا قبل أن يكون هناك ما يُرى */
    setTimeout(Native.splashOff, 250);
    return true;
  },

  /*
    ═══ قاعدة المتجر ٣.١.١: داخل التطبيق لا شراء إلا عبر أبل ═══
    الإصدار الأول مجاني بلا شراء داخل التطبيق. فالمادة المدفوعة لا تعرض
    سعرًا ولا رمز تفعيل ولا واتساب ولا «اشترِ» — أبل ترفض كل ذلك حتى
    الإشارة إلى الموقع. تُقال الحقيقة بجملة واحدة، ويُترك للطالب ما هو
    مفتوح. ومتجر الكوينز يختفي للسبب نفسه. يوم تُضاف مشتريات أبل (v2)
    تُستبدل هذه البطاقة بزرّ StoreKit — لا تُلغى.
  */
  lockedCard(sub){
    return el('div', { class:'card', style:'text-align:center' }, [
      el('span', { class:'empty__ico', 'aria-hidden':'true' }, [ QBANK.ico('shield', { size:40, weight:1.6 }) ]),
      el('p', { class:'empty__title', text:'«' + ((sub && sub.name) || 'هذه المادة') + '» غير متاحة في التطبيق حاليًا' }),
      el('p', { class:'empty__text', text:'المواد المجانية كلها مفتوحة لك هنا — ومن اشترى من قبل يدخل بحسابه فتُفتح له تلقائيًا.' }),
      el('a', { class:'btn btn--block', href:'#/explore', text:'استكشف المواد المجانية' })
    ]);
  },
  wireStore(){
    if (QBANK.gate)  QBANK.gate.paywallCard = sub => Native.lockedCard(sub);
    if (QBANK.trial) QBANK.trial.expiredCard = sub => Native.lockedCard(sub);
    if (QBANK.pay)   QBANK.pay.coinShop = () => null;
  },

  /* ═══ الدخول: Safari يفتح، والرابط العميق يُرجع ═══ */
  wireAuth(){
    if (!QBANK.authProviders) return;
    QBANK.authProviders.opener = url => {
      const B = Native.plugin('Browser');
      if (B && B.open) { B.open({ url, presentationStyle:'popover' }); return true; }
      return false;   // بلا إضافة متصفح: يُترك للمسار العادي
    };
  },
  /*
    ★ الرمز يعود في هاش الرابط العميق تمامًا كما يعود في هاش الصفحة على الويب —
    فالتقاطه هو الدالة نفسها (captureFromHash)، ولا مسارَ ثانٍ للجلسة.
  */
  handleUrl(url){
    const u = String(url || '');
    if (u.indexOf(Native.SCHEME + '://') !== 0) return false;
    const B = Native.plugin('Browser');
    if (B && B.close) { try { B.close(); } catch(e){} }
    const hashAt = u.indexOf('#');
    const hash = hashAt >= 0 ? u.slice(hashAt) : '';
    if (hash && QBANK.api.auth.captureFromHash(hash)){
      const after = QBANK.store.get('after_login', '#/');
      QBANK.store.remove('after_login');
      QBANK.toast('تم تسجيل الدخول');
      /* ما يفعله الإقلاع بعد الدخول يُفعل هنا أيضًا: التقدّم والاستحقاقات والحضور */
      try { QBANK.progress.pull(); QBANK.gate.refresh(); if (QBANK.presence) QBANK.presence.start(); } catch(e){}
      QBANK.router.go(/^#\//.test(after) ? after : '#/');
      return true;
    }
    /* خطأٌ من المزوّد يصل في الاستعلام: ?error=…&error_description=… */
    const m = /[?&#]error_description=([^&]+)/.exec(u) || /[?&#]error=([^&]+)/.exec(u);
    if (m) QBANK.toast('تعذّر الدخول: ' + decodeURIComponent(m[1]).replace(/\+/g, ' '));
    return true;
  },
  wireLinks(){
    const A = Native.plugin('App');
    if (A && A.addListener) A.addListener('appUrlOpen', ev => Native.handleUrl(ev && ev.url));
  },

  /* ═══ شريط الحالة يتبع الوضع: نصٌّ فاتح على الليلي وداكن على الفاتح ═══ */
  wireTheme(){
    const S = Native.plugin('StatusBar');
    if (!S || !S.setStyle || !QBANK.theme) return;
    const orig = QBANK.theme.apply;
    QBANK.theme.apply = function(mode){
      const out = orig.call(QBANK.theme, mode);
      try { S.setStyle({ style: out === 'dark' ? 'DARK' : 'LIGHT' }); } catch(e){}
      return out;
    };
    try { S.setStyle({ style: document.documentElement.getAttribute('data-theme') === 'dark' ? 'DARK' : 'LIGHT' }); } catch(e){}
  },

  /* ═══ ورقة المشاركة الأصلية بدل navigator.share الذي لا يوفّره WKWebView ═══ */
  wireShare(){
    const Sh = Native.plugin('Share');
    if (!Sh || !Sh.share || !QBANK.share) return;
    QBANK.share.sharePlain = async function(url, title, text){
      try {
        await Sh.share({ title: title || 'مراجعة', text: text || '', url, dialogTitle: title || 'مراجعة' });
        return { ok:true, via:'share' };
      } catch(e){ return { ok:false, cancelled:true }; }
    };
  },

  /* ═══ زرّ الرجوع في أندرويد: يرجع في التاريخ، ومن الرئيسية يخرج ═══ */
  wireBack(){
    const A = Native.plugin('App');
    if (!A || !A.addListener) return;
    A.addListener('backButton', ev => {
      const atRoot = !location.hash || location.hash === '#/' || location.hash === '#';
      if (!atRoot && (!ev || ev.canGoBack !== false)) history.back();
      else if (A.exitApp) A.exitApp();
    });
  },

  /* ═══ الاهتزاز: يُنادى من شاشة الاختبار — «أصبت» تُحسّ لا تُقرأ فقط ═══ */
  haptic(kind){
    const H = Native.plugin('Haptics');
    if (!H) return false;
    try {
      if (kind === 'success' && H.notification) H.notification({ type:'SUCCESS' });
      else if (kind === 'error' && H.notification) H.notification({ type:'ERROR' });
      else if (H.impact) H.impact({ style:'LIGHT' });
      return true;
    } catch(e){ return false; }
  },

  /* شاشة البداية تُخفى بعد أول رسم — لا قبل أن يكون هناك ما يُرى */
  splashOff(){
    const S = Native.plugin('SplashScreen');
    if (S && S.hide) { try { S.hide(); } catch(e){} }
  }
};
QBANK.native = Native;

Native.init();
