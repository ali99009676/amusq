/*
  الموجّه: يعتمد على hash لا على History API.
  لماذا؟ لأن المنصة يجب أن تعمل بفتح index.html مباشرة من القرص (file://)
  وهناك pushState لا يعمل، بينما #/ يعمل في كل مكان.
*/
const Router = {
  routes: {},
  notFound: null,
  current: null,

  add(path, def){ Router.routes[path] = def; return Router; },

  parse(hash){
    // نُحوّل "#/admin/students?x=1" إلى { path:'#/admin', rest:['students'], query:{x:'1'} }
    const raw = (hash || '#/').replace(/^#?/, '#');
    const [beforeQ, qs] = raw.split('?');
    const parts = beforeQ.replace(/^#\/?/, '').split('/').filter(Boolean);
    const query = {};
    (qs || '').split('&').filter(Boolean).forEach(pair => {
      const [k, v] = pair.split('=');
      query[decodeURIComponent(k)] = decodeURIComponent(v || '');
    });

    if (!parts.length) return { path:'#/', rest:[], query, raw:beforeQ };

    // نطابق أطول مسار مُعرَّف أولًا حتى لا يبتلع "#/admin" مسار "#/admin/login"
    let path = '#/' + parts.join('/');
    let rest = [];
    while (parts.length && !Router.routes[path]) {
      rest.unshift(parts.pop());
      path = '#/' + parts.join('/');
    }
    // لم يُطابَق شيء: نُرجع المسار كما هو ليصل إلى صفحة ٤٠٤،
    // ولا نُسقطه على الجذر — وإلا صار كل رابط خاطئ يفتح الرئيسية بصمت.
    if (!parts.length) return { path: beforeQ, rest:[], query, raw: beforeQ };
    return { path, rest, query, raw: beforeQ };
  },

  resolve(hash){
    const m = Router.parse(hash);
    const def = Router.routes[m.path];
    return def ? Object.assign({}, m, { def }) : Object.assign({}, m, { def: Router.notFound });
  },

  render(hash){
    const main = document.getElementById('main');
    if (!main) return null;
    const r = Router.resolve(hash);
    Router.current = r;

    main.innerHTML = '';
    const view = r.def && typeof r.def.view === 'function' ? r.def.view(r) : null;
    if (view) main.appendChild(view);

    document.title = (r.def && r.def.title ? r.def.title + ' · ' : '') + 'AMUSQ';
    Router.paintNav(r.path);
    // نُعيد التركيز إلى المحتوى كي يعرف قارئ الشاشة أن الصفحة تبدّلت
    if (Router.booted) { try { main.focus(); } catch(e){} }
    Router.booted = true;
    return r;
  },

  paintNav(path){
    Array.prototype.forEach.call(document.querySelectorAll('[data-nav]'), a => {
      const isOn = a.getAttribute('data-nav') === path;
      if (isOn) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current');
    });
  },

  go(hash){
    if (location.hash === hash) Router.render(hash);   // نفس الوجهة: نُعيد الرسم يدويًا
    else location.hash = hash;
  },

  init(){
    window.addEventListener('hashchange', () => Router.render(location.hash));
    Router.render(location.hash || '#/');
  }
};
AMUSQ.router = Router;
