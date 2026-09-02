/*
  ═══════════════════════════════════════════════════════════════════
  الحضور: أين الطالب الآن، وبأي جهاز، ومن أي بلد
  ═══════════════════════════════════════════════════════════════════
  كانت النبضة تُرسل مرةً واحدة عند الإقلاع، فقائمة «المتصلون الآن» كانت
  تقول «دخل خلال ربع ساعة» لا «هو هنا». والفرق كبير: من فتح التطبيق ثم
  وضع جوّاله في جيبه ليس متصلًا بالمعنى الذي يهمّ.

  وصارت تُرسل عند كل تبدّل شاشة وكل دقيقة، وتحمل معها الحال لا الوجود:
  «في اختبار: علم السموم»، «يرفع مادة»، «في صفحة الدخول».

  ═══ وحدودُ ما نجمعه مقصودة ═══
  شاشاتُ التطبيق فقط. لا نصوصَ يكتبها الطالب، ولا إجاباتِه، ولا موقعًا
  من الجهاز. والبلد من حقلٍ كتبه هو أو من منطقته الزمنية — تقريبٌ يكفي
  للتشغيل ولا يقترب من عنوانه. ونوع الجهاز صنفٌ من ثلاثة لا بصمةٌ تُميّزه.
*/

const Presence = {
  EVERY: 60000,      // نبضة كل دقيقة ما دام التطبيق مفتوحًا
  _timer: null,
  _last: '',         // آخر حالٍ أُرسل — لا نُكرّر نداءً بلا جديد
  _sendFn: null,     // باب حقن للفحوص

  /*
    نوع الجهاز: ثلاثة أصناف لا أكثر.
    ترتيب الفحص مقصود: آيباد الحديث يقول عن نفسه «Macintosh» ويكذب،
    فنكشفه بوجود اللمس — وهو الفارق الوحيد الباقي بينه وبين حاسوب.
  */
  kind(ua, touchPoints){
    const s = String(ua || '');
    if (/iPhone|iPod/i.test(s)) return 'ios';
    if (/iPad/i.test(s)) return 'ios';
    if (/Macintosh/i.test(s) && (touchPoints || 0) > 1) return 'ios';
    if (/Android/i.test(s)) return 'android';
    return 'desktop';
  },

  /*
    رمزٌ لكل صنف — علامةٌ تُقرأ بلمحة في قائمة طويلة.
    ★ ولا شعار آبل: محرفُه في نطاق الاستعمال الخاص، ترسمه أجهزة آبل
    وحدها ويخرج فراغًا عند غيرها — والمشرف قد يفتح لوحته من ويندوز.
    والرمز الذي لا يُرى على نصف الأجهزة ليس رمزًا.
  */
  kindIcon(k){
    return k === 'ios' ? '📱' : k === 'android' ? '🤖' : '🖥';
  },
  /* واسمٌ عربي بجانبه: الرمز للعين، والاسم لقارئ الشاشة وللتلميح عند المرور */
  kindName(k){
    return k === 'ios' ? 'آيفون' : k === 'android' ? 'أندرويد' : 'حاسوب';
  },

  /*
    البلد: ما كتبه الطالب في ملفه أولًا — فهو أوثق مما نستنتج.
    وإن لم يكتبه استنتجناه من منطقته الزمنية، وهي معلومةٌ يعطيها المتصفح
    بلا إذنٍ ولا تحديد موقع، ودقّتها بلدٌ لا شارع.
  */
  TZ: {
    'Asia/Riyadh':'SA', 'Asia/Kuwait':'KW', 'Asia/Bahrain':'BH', 'Asia/Qatar':'QA',
    'Asia/Dubai':'AE', 'Asia/Muscat':'OM', 'Asia/Baghdad':'IQ', 'Asia/Amman':'JO',
    'Asia/Beirut':'LB', 'Asia/Damascus':'SY', 'Asia/Jerusalem':'PS', 'Asia/Gaza':'PS',
    'Asia/Hebron':'PS', 'Asia/Aden':'YE', 'Africa/Cairo':'EG', 'Africa/Khartoum':'SD',
    'Africa/Tripoli':'LY', 'Africa/Tunis':'TN', 'Africa/Algiers':'DZ',
    'Africa/Casablanca':'MA', 'Africa/Nouakchott':'MR', 'Africa/Mogadishu':'SO',
    'Africa/Djibouti':'DJ'
  },
  country(){
    try {
      const c = QBANK.campus && QBANK.campus.cached();
      if (c && c.country) return String(c.country).toUpperCase().slice(0, 2);
    } catch(e){}
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (Presence.TZ[tz]) return Presence.TZ[tz];
    } catch(e){}
    return '';
  },

  /*
    وصف الشاشة بالعربية. المسارات التي تحمل معرّفًا نُسمّي مادتها إن
    عرفناها — «في اختبار» وحدها لا تعني شيئًا، و«في اختبار: علم السموم»
    تقول أين هو تمامًا.
  */
  subjectName(id){
    try {
      const subs = (QBANK.data.pack().subjects) || [];
      const s = subs.filter(x => x.id === id || x.slug === id)[0];
      return s ? s.name : '';
    } catch(e){ return ''; }
  },

  MAP: {
    '#/':          'الرئيسية',
    '#/explore':   'يستكشف المواد',
    '#/review':    'يراجع أسئلة اليوم',
    '#/upload':    'يرفع مادة',
    '#/account':   'في حسابه',
    '#/settings':  'في الإعدادات',
    '#/login':     'في صفحة الدخول',
    '#/board':     'في لوحة المتصدرين',
    '#/challenge': 'في تحدٍّ',
    '#/pay':       'في صفحة الدفع',
    '#/p':         'يتصفّح ملف طالب',
    '#/u':         'في قسم جامعة',
    '#/admin':     'في لوحة التحكم'
  },

  place(route){
    const r = route || (QBANK.router && QBANK.router.current) || null;
    if (!r) return '';
    const path = r.path || '';
    const id = (r.rest && r.rest[0]) || '';

    if (path === '#/subject') {
      const n = Presence.subjectName(id);
      return n ? 'داخل مادة: ' + n : 'داخل مادة';
    }
    if (path === '#/exam') {
      const n = Presence.subjectName(id);
      return n ? 'في اختبار تجريبي: ' + n : 'في اختبار تجريبي';
    }
    if (path === '#/s') {
      const n = Presence.subjectName(id);
      return n ? 'فتح رابط مادة: ' + n : 'فتح رابط مادة مشتركة';
    }
    if (path.indexOf('#/admin') === 0) return Presence.MAP['#/admin'];
    return Presence.MAP[path] || 'يتصفّح';
  },

  /*
    الإرسال. نُرسل حين يتبدّل الحال، أو حين تمرّ الدقيقة على آخر نبضة —
    الأول ليكون الخبر حيًّا، والثاني ليُعرف أنه ما زال هنا.
  */
  async beat(force){
    if (!QBANK.api.user()) return { ok:false };
    const place = Presence.place();
    if (!force && place === Presence._last) return { ok:true, skipped:true };
    Presence._last = place;

    const payload = {
      device_label: (typeof navigator !== 'undefined' ? navigator.userAgent : '').slice(0, 60),
      p_place: place,
      p_kind: Presence.kind(typeof navigator !== 'undefined' ? navigator.userAgent : '',
                           typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0),
      p_country: Presence.country()
    };
    if (Presence._sendFn) return Presence._sendFn(payload);
    return QBANK.api.rpc('heartbeat', payload);
  },

  start(){
    if (Presence._timer) return;
    Presence.beat(true);
    Presence._timer = setInterval(() => Presence.beat(true), Presence.EVERY);
    /*
      ورقةٌ مخفيّة لا تنبض: التبويب في الخلفية ليس حضورًا، ونبضُه يملأ
      القائمة بمن ليسوا هنا. والعودة إليه تنبض فورًا لا بعد دقيقة.
    */
    try {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) return;
        Presence.beat(true);
      });
    } catch(e){}
  },
  stop(){ if (Presence._timer) { clearInterval(Presence._timer); Presence._timer = null; } }
};
QBANK.presence = Presence;
