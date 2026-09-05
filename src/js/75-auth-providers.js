/*
  ═══════════════════════════════════════════════════════════════════
  مزوّدو الدخول — أكثر من جوجل
  ═══════════════════════════════════════════════════════════════════
  كان الدخول بابين: رابط البريد، وجوجل. ومن لا بريد جوجل عنده — وكثيرٌ من
  الطلاب بريدهم الجامعي مايكروسوفت، وكثيرٌ منهم لا يفتح بريده أصلًا — كان
  أمامه الرابط البريدي وحده: ينتظر رسالةً قد تتأخر أو تقع في المهملات.

  ★ والأزرار تُكتشف ولا تُكتب.
  كلّ مزوّد يحتاج مفتاحًا وسرًّا يُضبطان في لوحة Supabase، وزرٌّ لمزوّدٍ غير
  مضبوط يقود الطالب إلى صفحة خطأ إنجليزية — أسوأ من ألّا يكون. فنسأل
  الخادمَ نفسه (‎/auth/v1/settings‎ عامّةٌ بالمفتاح العام) عمّا هو مفعَّل،
  ونرسم أزرار المفعَّل وحده. يفعّل علي مزوّدًا من لوحة Supabase فيظهر زرّه
  في المنصة بلا نشرٍ جديد ولا سطر كود.

  والقائمة المخبّأة تُرسم فورًا (لا وميض ولا انتظار)، ثم تُصحّح حين يصل الرد.
*/
const AuthProviders = {
  KEY: 'auth_providers',
  TTL: 6 * 3600 * 1000,     // ست ساعات: التفعيل حدثٌ نادر، والسؤال مع كل فتح إسراف

  /*
    ما نعرف رسمه ونثق أن طلابنا يملكونه. الترتيب هو ترتيب العرض:
    جوجل أولًا لأنه الأكثر، ثم آبل ومايكروسوفت (البريد الجامعي غالبًا
    مايكروسوفت)، ثم سناب شات — وهو عند طلابنا أكثر من فيسبوك.
    (ديسكورد مرفوع من القائمة بطلب علي: ليس من منصات طلابنا.)
  */
  /*
    لكلٍّ قرصُه بلون علامته وشعارٌ يقابله. والقرص الأبيض لجوجل ومايكروسوفت
    (شعاراهما متعدّدا الألوان ولا يُقلبان أبيض)، والأصفر لسناب شات كما هو
    في تطبيقه. bg/fg ألوانُ علاماتٍ لا ألوانُ منصّتنا — لذلك تُكتب هنا لا
    في CSS، ولا تدخل نظام التصميم.
  */
  LIST: [
    { id:'google',        label:'جوجل',       brand:'google',    bg:'#ffffff', fg:null,      pale:true },
    { id:'apple',         label:'آبل',        brand:'apple',     bg:'#000000', fg:'#ffffff' },
    { id:'azure',         label:'مايكروسوفت', brand:'microsoft', bg:'#ffffff', fg:null,      pale:true },
    { id:'snapchat',      label:'سناب شات',   brand:'snapchat',  bg:'#FFFC00', fg:'#111111', pale:true },
    { id:'facebook',      label:'فيسبوك',     brand:'facebook',  bg:'#1877F2', fg:'#ffffff' },
    { id:'twitter',       label:'X',          brand:'x',         bg:'#000000', fg:'#ffffff' },
    { id:'github',        label:'جِتهَب',      brand:'github',    bg:'#181717', fg:'#ffffff' },
    { id:'linkedin_oidc', label:'لينكدإن',    brand:'linkedin',  bg:'#0A66C2', fg:'#ffffff' },
    { id:'linkedin',      label:'لينكدإن',    brand:'linkedin',  bg:'#0A66C2', fg:'#ffffff' }
  ],
  meta(id){ return AuthProviders.LIST.filter(p => p.id === id)[0] || null; },

  /* المخبّأ — ولو قديمًا: زرٌّ ظهر أمس أولى من صفٍّ فارغ اليوم */
  cached(){
    const c = QBANK.store.get(AuthProviders.KEY, null);
    return (c && Array.isArray(c.list)) ? c.list : null;
  },
  fresh(){
    const c = QBANK.store.get(AuthProviders.KEY, null);
    return !!(c && Array.isArray(c.list) && (Date.now() - (c.at || 0)) < AuthProviders.TTL);
  },

  /*
    الرد شكله { external: { google:true, azure:false, … } }.
    ونحن نأخذ منه ما نعرف رسمه فقط — مزوّدٌ مفعَّل بلا شعارٍ عندنا يبقى
    مخفيًّا حتى نرسمه، لا يظهر بزرٍّ مجهول.
  */
  async load(){
    const c = QBANK.config.get();
    const f = QBANK.api.fetchFn();
    if (!c || !f) return null;
    try {
      const res = await f(c.url + '/auth/v1/settings', { headers:{ 'apikey': c.anonKey } });
      if (!res.ok) return null;
      const d = await res.json();
      const ext = (d && d.external) || {};
      const list = AuthProviders.LIST.filter(p => ext[p.id] === true).map(p => p.id);
      QBANK.store.set(AuthProviders.KEY, { at: Date.now(), list });
      return list;
    } catch(e){ return null; }
  },

  /*
    ★ بابٌ واحد للانطلاق إلى المزوّد — من كل زرّ.
    الويب ينتقل بالصفحة نفسها، والتطبيق الأصلي يفتح Safari (opener يضبطه
    الجسر). والوجهة تُحفظ قبل المغادرة في الحالين: من قصد اللوحة يعود إليها.
  */
  opener: null,
  /* ★ الرابط يُبنى بلا تزامن (بصمة PKCE تُحسب بـcrypto.subtle) — الوجهة تُحفظ قبل المغادرة */
  async launch(id, after){
    const u = await QBANK.api.auth.oauthUrl(id);
    if (!u) { QBANK.toast('المنصة غير موصولة بالخادم بعد'); return false; }
    if (after) QBANK.store.set('after_login', after);
    if (AuthProviders.opener && AuthProviders.opener(u)) return true;
    location.href = u;
    return true;
  },

  /* المزوّد الواحد يظهر مرة: لينكدإن له معرّفان في Supabase (القديم والـOIDC) */
  dedupe(ids){
    const seen = {}, out = [];
    (ids || []).forEach(id => {
      const m = AuthProviders.meta(id);
      if (!m || seen[m.brand]) return;
      seen[m.brand] = 1; out.push(m);
    });
    return out;
  }
};
QBANK.authProviders = AuthProviders;

/*
  صفّ أزرار الدخول. يُرسم من المخبّأ فورًا ثم يُصحَّح من الخادم.
  ★ والوجهة تُحفظ قبل المغادرة: جوجل وأخواته يعودون إلى أصل الموقع (الهاش
  يحمله رمز الجلسة)، فمن أين نعرف أن القاصد كان اللوحة؟ من هذا المفتاح.
*/
function oauthRow(opts){
  const o = opts || {};
  const box = el('div', { class:'oauth' });
  const head = el('p', { class:'field__hint oauth__h', style:'margin:0' });
  const grid = el('div', { class:'oauth__grid' });
  box.appendChild(head); box.appendChild(grid);

  const go = p => AuthProviders.launch(p.id, o.after);

  function paint(ids){
    /* الافتراض جوجل: هو المفعَّل منذ اليوم الأول، ولو تعذّر السؤال فالزرّ يعمل */
    const list = AuthProviders.dedupe((ids && ids.length) ? ids : ['google']);
    grid.innerHTML = '';

    /*
      ★ الشكل يتبع العدد.
      مزوّدٌ واحد قرصًا وحيدًا في وسط الشاشة يبدو زينةً لا زرًّا — فيبقى
      زرًّا عريضًا باسمه. وستةُ أزرارٍ عريضة تُطيل الشاشة وتُغرق حقل البريد،
      فتصير أقراصًا بشعاراتها: الشعار يُعرف قبل أن يُقرأ الاسم، والاسم باقٍ
      في aria-label وtitle لمن يقرأ بالصوت أو يتردّد.
    */
    if (list.length === 1){
      const p = list[0];
      head.textContent = 'أو ادخل مباشرة:';
      grid.className = 'oauth__grid';
      const b = el('button', { class:'btn btn--ghost oauth__b', type:'button',
        'data-provider': p.id, 'aria-label':'الدخول بحساب ' + p.label }, [
        el('span', { class:'oauth__ico', 'aria-hidden':'true' }, [ QBANK.brand(p.brand, { size:18 }) ]),
        el('span', { class:'oauth__l', text:'الدخول بحساب ' + p.label })
      ]);
      b.addEventListener('click', () => go(p));
      grid.appendChild(b);
      return;
    }

    head.textContent = 'أو ادخل بحسابك في:';
    grid.className = 'oauth__grid oauth__tiles';
    list.forEach(p => {
      const t = el('button', { class:'oauth__tile' + (p.pale ? ' is-pale' : ''), type:'button',
        'data-provider': p.id, title:'الدخول بحساب ' + p.label,
        'aria-label':'الدخول بحساب ' + p.label,
        style:'--tile:' + p.bg }, [
        el('span', { class:'oauth__mark', 'aria-hidden':'true' },
          [ QBANK.brand(p.brand, { size:26, fill: p.fg || undefined }) ])
      ]);
      t.addEventListener('click', () => go(p));
      grid.appendChild(t);
    });
  }

  paint(AuthProviders.cached());
  if (!AuthProviders.fresh())
    AuthProviders.load().then(list => { if (list && grid.isConnected) paint(list); });
  return box;
}

/*
  ═══ في إعدادات المشرف: ما المفعَّل الآن وكيف يُفعَّل غيره ═══
  السؤال الذي سيُسأل حتمًا: «أضفتُ الأزرار فأين هي؟» — الجواب أن التفعيل
  في Supabase لا في الكود، فنقوله في المكان الذي يُسأل فيه.
*/
function providersAdminCard(){
  const box = el('div', { class:'card stack' }, [
    el('h2', { style:'margin:0', text:'طرق الدخول' }),
    el('p', { class:'field__hint', style:'margin:0', text:'جارٍ سؤال الخادم…' })
  ]);
  const show = list => {
    if (!alive() || !box.isConnected) return;
    box.innerHTML = '';
    box.appendChild(el('h2', { style:'margin:0', text:'طرق الدخول' }));
    const on = AuthProviders.dedupe(list || []);
    box.appendChild(el('div', { class:'row' }, [
      el('span', { class:'badge badge--ok', text:'رابط البريد + الرمز' })
    ].concat(on.map(p => el('span', { class:'badge badge--ok prov-badge' }, [
      /* الشعار بلونه هنا أيضًا: الشارة تُقرأ لمحًا، واللون هو ما يُلمح */
      QBANK.brand(p.brand, { size:14, fill: p.pale ? undefined : p.bg }),
      el('span', { text:' ' + p.label }) ])))
     .concat(on.length ? [] : [ el('span', { class:'badge badge--warn', text:'لا مزوّد اجتماعي مفعَّل' }) ])));
    const off = AuthProviders.LIST.filter(p => (list || []).indexOf(p.id) === -1 && p.id !== 'linkedin');
    box.appendChild(el('p', { class:'field__hint', style:'margin:0', text:
      'الأزرار تظهر للطالب تلقائيًا لكل مزوّد تُفعّله في Supabase — بلا نشر جديد. ' +
      'المتاح للتفعيل عندنا: ' + off.map(p => p.label).join('، ') + '.' }));
    const c = QBANK.config.get();
    const ref = c && c.url ? String(c.url).replace(/^https?:\/\//, '').split('.')[0] : '';
    if (ref) box.appendChild(el('a', { class:'btn btn--sm btn--ghost', target:'_blank', rel:'noopener',
      href:'https://supabase.com/dashboard/project/' + ref + '/auth/providers',
      text:'افتح مزوّدي الدخول في Supabase ↗' }));
  };
  const cached = AuthProviders.cached();
  if (cached) show(cached);
  AuthProviders.load().then(l => { if (l) show(l); });
  return box;
}

QBANK.views.oauthRow = oauthRow;
QBANK.views.providersAdminCard = providersAdminCard;
