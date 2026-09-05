/*
  طبقة Supabase بلا مكتبات: fetch خام إلى /auth/v1 و /rest/v1.
  لماذا بلا supabase-js؟ لأن قاعدة «لا مكتبة خارجية في المتصفح» ثابتة،
  والذي نحتاجه فعلًا (دخول، جلسة، تجديد، REST، RPC) يغطيه fetch مباشرة.
*/
const Api = {
  SESSION_KEY: 'session',
  _fetch: null,   // باب حقن للفحوص: تستبدل fetch بواحد وهمي

  fetchFn(){ return Api._fetch || (typeof fetch !== 'undefined' ? fetch.bind(window) : null); },

  session(){ return QBANK.store.get(Api.SESSION_KEY, null); },
  /* مفتاح صاحب البيانات المخزّنة — لا رمزٌ ولا سرّ، معرّفٌ للمقارنة وحده */
  UID_KEY: 'last_uid',
  saveSession(s){
    if (!s) {
      /* خروجٌ أو رمزٌ ميت: لا نترك أثر صاحبه لمن يأتي بعده */
      QBANK.store.clearPersonal();
      QBANK.store.remove(Api.UID_KEY);
      return QBANK.store.remove(Api.SESSION_KEY);
    }
    /*
      ★ الحارس الحقيقي هنا لا في زرّ الخروج.
      الخروجُ طريقٌ واحد من طرقٍ كثيرة لتبدّل الهوية: رمزٌ انتهت صلاحيته،
      دخولٌ برابط بريد، حسابٌ ثانٍ على المتصفح نفسه، تطبيقٌ أُعيد فتحه بعد
      شهر. فنقيس عند كل حفظِ جلسةٍ: من كان هنا؟ ومن جاء الآن؟
    */
    const uid = (s.user && s.user.id) || null;
    const was = QBANK.store.get(Api.UID_KEY, null);
    /* `was` فارغةً لا تعني تبدّلًا: قد يكون زائرًا ذاكر مجانًا ثم سجّل،
       ومسحُ تقدّمه عقوبةٌ على أنه سجّل. التبدّل يكون بين معلومَين. */
    if (uid && was && was !== uid) QBANK.store.clearPersonal();
    if (uid) QBANK.store.set(Api.UID_KEY, uid);

    // نحفظ وقت الانتهاء المطلق كي نعرف متى نجدّد دون الرجوع للخادم
    s.expires_abs = Date.now() + (s.expires_in ? s.expires_in * 1000 : 3600 * 1000);
    QBANK.store.set(Api.SESSION_KEY, s);
  },
  user(){ const s = Api.session(); return s && s.user ? s.user : null; },

  headers(){
    const c = QBANK.config.get() || {};
    const s = Api.session();
    return {
      'apikey': c.anonKey || '',
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + (s && s.access_token ? s.access_token : (c.anonKey || ''))
    };
  },

  async raw(path, opts){
    const c = QBANK.config.get();
    const f = Api.fetchFn();
    if (!c || !f) return { ok:false, offline:true, data:null };
    try{
      // جلسة على وشك الانتهاء؟ نجدّدها قبل الطلب لا بعد فشله
      const s = Api.session();
      if (s && s.refresh_token && s.expires_abs && Date.now() > s.expires_abs - 60000 && path.indexOf('/auth/') === -1) {
        await Api.auth.refresh();
      }
      const res = await f(c.url + path, Object.assign({ headers: Api.headers() }, opts || {}));
      const text = await res.text();
      let data = null;
      try{ data = text ? JSON.parse(text) : null; } catch(e){ data = text; }
      return { ok: res.ok, status: res.status, data };
    } catch(e){
      return { ok:false, offline:true, data:null, err: e.message };
    }
  },

  rest(path, opts){ return Api.raw('/rest/v1/' + path, opts); },
  rpc(name, args){
    return Api.raw('/rest/v1/rpc/' + name, { method:'POST', body: JSON.stringify(args || {}) });
  },

  auth: {
    // عنوان العودة بعد الضغط على الرابط: موقعنا الحالي لا الافتراضي في إعدادات Supabase.
    // بدونه يعود المستخدم إلى localhost فلا يدخل — وهذا سبب فشل الدخول الأول.
    redirectTo(){
      if (typeof location === 'undefined') return '';
      // نحذف الهاش كي لا يختلط مسار التطبيق برموز الجلسة العائدة
      return location.origin + location.pathname;
    },
    /*
      ★ «دخولٌ معلّق» — علامة أن هذا الجهاز هو من طلب الدخول.
      رمزٌ يصل في هاش الصفحة بلا طلبٍ سبقه من هنا لا يُقبل: كان أي رابط
      مُرسَل من غريب (#access_token=رمزه) يُسجّل الضحية في حساب الغريب،
      فيرفع ويدفع في حسابٍ ليس له (تدقيق H-01). خمس عشرة دقيقة تكفي
      لفتح البريد؛ ومن فتح الرابط في جهازٍ آخر يكتب الرمز الذي في البريد.
    */
    PENDING_MS: 15 * 60 * 1000,
    markPending(){ QBANK.store.set('login_pending', Date.now()); return true; },
    isPending(){
      const t = Number(QBANK.store.get('login_pending', 0)) || 0;
      return t > 0 && (Date.now() - t) < Api.auth.PENDING_MS;
    },
    magic(email){
      const back = Api.auth.redirectTo();
      Api.auth.markPending();
      return Api.raw('/auth/v1/otp' + (back ? '?redirect_to=' + encodeURIComponent(back) : ''), {
        method:'POST',
        body: JSON.stringify({
          email, create_user: true,
          options: { emailRedirectTo: back }
        })
      });
    },
    /*
      ★ PKCE: المتصفح يولّد سرًّا (verifier) ويرسل بصمته (challenge) مع طلب
      الدخول، فلا يعود من المزوّد رمزُ جلسةٍ بل رمزُ تبديل (code) لا يُصرف
      إلا بالسرّ — ورمزٌ في رابطٍ من غريب لا يساوي شيئًا بلا سرّه.
      السرّ في مخزن الجهاز لأن العودة إعادةُ تحميلٍ كاملة للصفحة.
      إن غاب crypto.subtle (متصفح قديم جدًا) عدنا للتدفق الضمني بحارس
      «الدخول المعلّق» وحده.
    */
    async pkceChallenge(){
      try {
        if (typeof crypto === 'undefined' || !crypto.subtle || !crypto.getRandomValues) return '';
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        const b64 = a => btoa(String.fromCharCode.apply(null, Array.from(a)))
          .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        const verifier = b64(bytes);
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
        QBANK.store.set('pkce_verifier', verifier);
        return '&code_challenge=' + b64(new Uint8Array(digest)) + '&code_challenge_method=s256';
      } catch(e){ return ''; }
    },
    // دخول جوجل/آبل: توجيه كامل للصفحة — يصلح للويب والتطبيق معًا
    async oauthUrl(provider){
      const c = QBANK.config.get();
      if (!c) return null;
      /* ★ داخل التطبيق الأصلي يعود المزوّد إلى رابطٍ عميق (muraja://auth) لا إلى
         الصفحة: أصل التطبيق capacitor://localhost لا يقبله أحد، وSafari الذي فتح
         الدخول لا يعرف طريق العودة إلى التطبيق إلا بالمخطّط المسجَّل له. */
      const back = (QBANK.native && QBANK.native.active) ? QBANK.native.REDIRECT
                 : (typeof location !== 'undefined') ? location.origin + location.pathname : '';
      Api.auth.markPending();
      const pkce = await Api.auth.pkceChallenge();
      return c.url + '/auth/v1/authorize?provider=' + encodeURIComponent(provider) +
             '&redirect_to=' + encodeURIComponent(back) + pkce;
    },
    /* رمز التبديل من استعلام الرابط (?code=…) — عودة PKCE من المزوّد */
    codeFrom(search){
      const m = /[?&]code=([A-Za-z0-9._~-]{8,200})(?:&|$)/.exec(String(search || ''));
      return m ? m[1] : '';
    },
    async captureFromCode(code){
      const verifier = QBANK.store.get('pkce_verifier', '');
      if (!code || !verifier) return false;
      QBANK.store.remove('pkce_verifier');
      const r = await Api.raw('/auth/v1/token?grant_type=pkce', {
        method:'POST', body: JSON.stringify({ auth_code: code, code_verifier: verifier })
      });
      if (!r.ok || !r.data || !r.data.access_token) return false;
      QBANK.store.remove('login_pending');
      Api.saveSession({
        access_token: r.data.access_token,
        refresh_token: r.data.refresh_token || '',
        expires_in: r.data.expires_in || 3600,
        user: r.data.user || Api.auth.decodeUser(r.data.access_token)
      });
      return true;
    },
    // عند العودة من رابط سحري أو OAuth تصل الرموز في هاش الصفحة
    /*
      ★ التحقق برمز مكتوب — طريق الدخول داخل التطبيق المغلّف.
      رابط البريد يفتح في متصفح الجهاز الافتراضي لا داخل التطبيق، فتُحفظ
      الجلسة هناك ويبقى التطبيق زائرًا. الرمز يُكتب حيث يقف الطالب،
      فتولد الجلسة في المكان الصحيح — تطبيقًا كان أو متصفحًا.
    */
    async verifyOtp(email, token){
      const r = await Api.raw('/auth/v1/verify', {
        method:'POST',
        body: JSON.stringify({ type:'email', email, token: String(token || '').trim() })
      });
      if (r.ok && r.data && r.data.access_token){
        Api.saveSession({
          access_token: r.data.access_token,
          refresh_token: r.data.refresh_token || '',
          expires_in: r.data.expires_in || 3600,
          user: r.data.user || Api.auth.decodeUser(r.data.access_token)
        });
      }
      return r;
    },
    captureFromHash(hash){
      const h = String(hash || '');
      if (h.indexOf('access_token=') === -1) return false;
      /* رمزٌ لم يطلبه هذا الجهاز خلال ربع ساعة لا يُقبل — انظر markPending */
      if (!Api.auth.isPending()) return false;
      const p = {};
      h.replace(/^#/,'').split('&').forEach(kv => {
        const [k,v] = kv.split('=');
        // ترميزٌ معطوب في الرابط لا يُسقط الإقلاع كله (كان decodeURIComponent يرمي)
        try { p[k] = decodeURIComponent(v || ''); } catch(e){ p[k] = ''; }
      });
      if (!p.access_token) return false;
      QBANK.store.remove('login_pending');
      Api.saveSession({
        access_token: p.access_token,
        refresh_token: p.refresh_token || '',
        expires_in: parseInt(p.expires_in || '3600', 10),
        user: Api.auth.decodeUser(p.access_token)
      });
      return true;
    },
    // نقرأ هوية المستخدم من الـJWT نفسه — بلا نداء شبكة إضافي
    decodeUser(jwt){
      try{
        const payload = JSON.parse(
          decodeURIComponent(escape(atob(jwt.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))))
        );
        return { id: payload.sub, email: payload.email || '' };
      } catch(e){ return null; }
    },
    async refresh(){
      const s = Api.session();
      if (!s || !s.refresh_token) return { ok:false };
      const r = await Api.raw('/auth/v1/token?grant_type=refresh_token', {
        method:'POST', body: JSON.stringify({ refresh_token: s.refresh_token })
      });
      if (r.ok && r.data && r.data.access_token) {
        r.data.user = r.data.user || Api.auth.decodeUser(r.data.access_token);
        Api.saveSession(r.data);
      } else if (!r.offline) {
        Api.saveSession(null);   // رمز تجديد ميت: جلسة منتهية فعلًا
      }
      return r;
    },
    async signOut(){
      /*
        الكنس قبل النداء لا بعده: لو انقطعت الشبكة عند الخادم بقيت بيانات
        الخارج على الجهاز رغم أنه ضغط «خروج». نيّته صريحة، فتُنفَّذ محليًا
        على كل حال، والخادم يلحق.
      */
      QBANK.store.clearPersonal();
      QBANK.store.remove(Api.UID_KEY);
      await Api.raw('/auth/v1/logout', { method:'POST' });
      Api.saveSession(null);
    },
    async deleteMe(){
      const r = await Api.rpc('delete_me');
      if (r.ok) { Api.saveSession(null); QBANK.store.clearAll(); }
      return r;
    }
  },

  /* --- ملف المستخدم الشخصي --- */
  async myProfile(){
    const u = Api.user();
    if (!u) return { ok:false };
    const r = await Api.rest('profiles?id=eq.' + u.id + '&select=*');
    return r.ok && r.data && r.data[0] ? { ok:true, data:r.data[0] } : r;
  },
  saveProfile(fields){
    const u = Api.user();
    if (!u) return Promise.resolve({ ok:false });
    return Api.rest('profiles?id=eq.' + u.id, { method:'PATCH', body: JSON.stringify(fields) });
  }
};
QBANK.api = Api;
