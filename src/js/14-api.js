/*
  طبقة Supabase بلا مكتبات: fetch خام إلى /auth/v1 و /rest/v1.
  لماذا بلا supabase-js؟ لأن قاعدة «لا مكتبة خارجية في المتصفح» ثابتة،
  والذي نحتاجه فعلًا (دخول، جلسة، تجديد، REST، RPC) يغطيه fetch مباشرة.
*/
const Api = {
  SESSION_KEY: 'session',
  _fetch: null,   // باب حقن للفحوص: تستبدل fetch بواحد وهمي

  fetchFn(){ return Api._fetch || (typeof fetch !== 'undefined' ? fetch.bind(window) : null); },

  session(){ return AMUSQ.store.get(Api.SESSION_KEY, null); },
  saveSession(s){
    if (!s) return AMUSQ.store.remove(Api.SESSION_KEY);
    // نحفظ وقت الانتهاء المطلق كي نعرف متى نجدّد دون الرجوع للخادم
    s.expires_abs = Date.now() + (s.expires_in ? s.expires_in * 1000 : 3600 * 1000);
    AMUSQ.store.set(Api.SESSION_KEY, s);
  },
  user(){ const s = Api.session(); return s && s.user ? s.user : null; },

  headers(){
    const c = AMUSQ.config.get() || {};
    const s = Api.session();
    return {
      'apikey': c.anonKey || '',
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + (s && s.access_token ? s.access_token : (c.anonKey || ''))
    };
  },

  async raw(path, opts){
    const c = AMUSQ.config.get();
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
    magic(email){
      const back = Api.auth.redirectTo();
      return Api.raw('/auth/v1/otp' + (back ? '?redirect_to=' + encodeURIComponent(back) : ''), {
        method:'POST',
        body: JSON.stringify({
          email, create_user: true,
          options: { emailRedirectTo: back }
        })
      });
    },
    // دخول جوجل/آبل: توجيه كامل للصفحة — يصلح للويب والتطبيق معًا
    oauthUrl(provider){
      const c = AMUSQ.config.get();
      if (!c) return null;
      const back = (typeof location !== 'undefined') ? location.origin + location.pathname : '';
      return c.url + '/auth/v1/authorize?provider=' + provider + '&redirect_to=' + encodeURIComponent(back);
    },
    // عند العودة من رابط سحري أو OAuth تصل الرموز في هاش الصفحة
    captureFromHash(hash){
      const h = String(hash || '');
      if (h.indexOf('access_token=') === -1) return false;
      const p = {};
      h.replace(/^#/,'').split('&').forEach(kv => {
        const [k,v] = kv.split('=');
        p[k] = decodeURIComponent(v || '');
      });
      if (!p.access_token) return false;
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
      await Api.raw('/auth/v1/logout', { method:'POST' });
      Api.saveSession(null);
    },
    async deleteMe(){
      const r = await Api.rpc('delete_me');
      if (r.ok) { Api.saveSession(null); AMUSQ.store.clearAll(); }
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
AMUSQ.api = Api;
