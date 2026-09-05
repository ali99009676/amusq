/*
  ═══════════════════════════════════════════════════════════════════
  شكل ملف الطالب — غلاف ولون وستايل
  ═══════════════════════════════════════════════════════════════════
  الملف العام هو وجه الطالب أمام دفعته: يُشارك رابطه، ويُفتح من لوحة
  المتصدرين ومن سطر «رفعها فلان». وملفٌ يشبه كل الملفات لا يُحبّ ولا يُنشر.
  فبطلب علي: غلافٌ يختاره (صورة يرفعها أو تدرّج جاهز)، ولونُ محور، وواحد
  من خمسة ستايلات تغيّر التخطيط نفسه لا الألوان وحدها.

  ★ الحرية داخل نظام التصميم لا خارجه:
  اللون اسمُ متغيّر (subject-3، gold…) يُحقن ‎--acc‎ كما تفعل بطاقة المادة،
  فيتلوّن كل شيء تحته آليًا ويبقى مقروءًا في الوضعين. لا hex يكتبه الطالب.
  والقاعدة تحصر القيم بقيود check — فالواجهة تعرض ما تسمح به القاعدة لا العكس.
*/
const Look = {
  /* الخمسة — الاسم للطالب، والوصف يقول ما الذي يتغيّر فعلًا */
  LAYOUTS: [
    { id:'classic',  label:'كلاسيكي', desc:'صورة يمين الاسم وبطاقات هادئة — كما بدأت المنصة' },
    { id:'cover',    label:'غلاف',    desc:'غلاف عريض والصورة تتوسّطه — كصفحات المشاهير' },
    { id:'stripe',   label:'شريط',    desc:'شريط لونيّ على الحافة وترتيب مضغوط — للعمليّين' },
    { id:'magazine', label:'مجلّة',   desc:'اسمك عنوانًا ضخمًا على الغلاف وإحصاءاتك عمودًا' },
    { id:'glass',    label:'زجاجي',   desc:'بطاقات شفافة تطفو فوق الغلاف' }
  ],
  /* ألوان المحور: أسماء متغيّرات النظام لا قيم — والفراغ يعني لون المنصة */
  ACCENTS: [
    { id:'',          label:'لون المنصة' },
    { id:'subject-1', label:'أخضر' },
    { id:'subject-2', label:'بنفسجي' },
    { id:'subject-3', label:'كهرماني' },
    { id:'subject-4', label:'وردي' },
    { id:'subject-5', label:'أزرق' },
    { id:'subject-6', label:'فيروزي' },
    { id:'gold',      label:'ذهبي' },
    { id:'brand',     label:'رمادي' }
  ],
  /* تدرّجات الغلاف الجاهزة — مرسومة في CSS من ألوان النظام */
  COVERS: [
    { id:'g1', label:'زمرّد' }, { id:'g2', label:'غروب' }, { id:'g3', label:'بحر' },
    { id:'g4', label:'توت' },   { id:'g5', label:'رمال' }, { id:'g6', label:'نعناع' },
    { id:'g7', label:'ليل' },   { id:'g8', label:'فجر' }
  ],
  DEFAULT: { layout:'classic', accent:'', cover_preset:'', cover_url:'' },

  /* ما لا نعرفه يعود إلى الافتراضي — صفٌّ قديم أو قيمة عابثة لا تكسر الصفحة */
  read(p){
    const o = p || {};
    const ok = (list, v) => list.some(x => x.id === v) ? v : '';
    return {
      layout:       Look.LAYOUTS.some(l => l.id === o.layout) ? o.layout : 'classic',
      accent:       ok(Look.ACCENTS, o.accent || ''),
      cover_preset: ok(Look.COVERS, o.cover_preset || ''),
      cover_url:    (typeof o.cover_url === 'string' && /^https:\/\//.test(o.cover_url)) ? o.cover_url : ''
    };
  },

  /* يصبغ حاوية بستايل ولون: الصنف يقود CSS، والمتغيّر يقود اللون */
  apply(root, look){
    const L = Look.read(look);
    Look.LAYOUTS.forEach(l => root.classList.remove('pf-look--' + l.id));
    root.classList.add('pf-page', 'pf-look--' + L.layout);
    if (L.accent) root.style.setProperty('--acc', 'var(--' + L.accent + ')');
    else root.style.removeProperty('--acc');
    return root;
  },

  /* الغلاف: صورة إن رُفعت، وإلا تدرّج، وإلا لا شيء (الستايلات التي تحتاجه ترسم تدرّج المحور) */
  cover(look){
    const L = Look.read(look);
    const c = el('div', { class:'pf-cover' + (L.cover_preset ? ' pf-cover--' + L.cover_preset : '') +
                                (!L.cover_url && !L.cover_preset ? ' pf-cover--acc' : ''), 'aria-hidden':'true' });
    if (L.cover_url) c.appendChild(el('img', { class:'pf-cover__img', src: L.cover_url, alt:'' }));
    return c;
  },

  /*
    رفع الغلاف: يُقصّ ٣:١ من الوسط ويُصغَّر إلى ١٥٠٠ بكسل قبل الرفع — صورة
    جوال خام ٥ ميغابايت تصير ~١٥٠ كيلوبايت. المسار في مجلد صاحبه لأن سياسة
    المخزن (PROFILE-ADMIN.sql) لا تسمح بغيره، وقيد cover_url في القاعدة يتحقق.
  */
  async uploadCover(file){
    const u = QBANK.api.user(), c = QBANK.config.get(), s = QBANK.api.session();
    if (!u || !c || !s) return { ok:false, error:'سجّل دخولك أولًا' };
    let img;
    try {
      img = await new Promise((res, rej) => {
        const i = new Image(); i.onload = () => res(i); i.onerror = rej;
        i.src = URL.createObjectURL(file);
      });
    } catch(e){ return { ok:false, error:'تعذّر قراءة الصورة' }; }
    const W = 1500, H = 500;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const r = Math.max(W / img.width, H / img.height);
    const sw = W / r, sh = H / r;
    g.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, W, H);
    const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', .82));
    const path = u.id + '/cover.jpg';
    const f = QBANK.api.fetchFn();
    let res;
    try {
      res = await f(c.url + '/storage/v1/object/avatars/' + path, {
        method:'POST',
        headers:{ 'Authorization':'Bearer ' + s.access_token, 'apikey': c.anonKey,
                  'Content-Type':'image/jpeg', 'x-upsert':'true' },
        body: blob
      });
    } catch(e){ return { ok:false, error:'لا اتصال بالخادم' }; }
    if (!res.ok) return { ok:false, error:'تعذّر رفع الغلاف' };
    return { ok:true, url: c.url + '/storage/v1/object/public/avatars/' + path + '?v=' + Date.now() };
  },

  /* ═══ بطل الملف — الدالة نفسها للصفحة العامة ولمعاينة المحرّر (ما تراه هو ما يُنشر) ═══ */
  hero(p, opts){
    const o = opts || {};
    const P = QBANK.peer;
    return el('div', { class:'card pf-hero' }, [
      el('div', { class:'pf-hero__avwrap' }, [ P.face(p, 'peer-face--lg') ]),
      el('div', { class:'pf-hero__x' }, [
        el('strong', { class:'pf-hero__n', text: p.name || 'طالب مراجعة' }),
        el('span', { class:'pf-hero__mail', text:
          [p.university, p.college].filter(Boolean).join(' · ') || 'بلا جامعة محدّدة' }),
        P.stars(p.rating_avg, p.rating_n),
        p.bio ? el('p', { class:'pf-hero__bio', text: p.bio }) : null
      ].concat(o.extra || []))
    ]);
  },

  /* الإحصاءات الأربع — مشتركة كذلك */
  stats(p){
    const N = QBANK.views.arNum;
    return el('div', { class:'peer-stats' }, [
      el('div', { class:'peer-stat' }, [ el('b', { class:'num', text: N(p.uploads || 0) }), el('span', { text:'مادة مرفوعة' }) ]),
      el('div', { class:'peer-stat' }, [ el('b', { class:'num', text: N(p.questions || 0) }), el('span', { text:'سؤالًا أهداه' }) ]),
      el('div', { class:'peer-stat' }, [
        el('b', { class:'num', text: Number(p.rating_avg) ? Number(p.rating_avg).toFixed(1) : '—' }),
        el('span', { text: p.rating_n ? 'من ' + N(p.rating_n) + ' تقييم' : 'بلا تقييم بعد' }) ]),
      el('div', { class:'peer-stat' }, [ el('b', { class:'num', text: N(p.sales || 0) }), el('span', { text:'طالبًا اشتروا منه' }) ])
    ]);
  }
};
QBANK.look = Look;

/* ═══════════════════════════════════════════════════════════════════
   بطاقة «شكل ملفي» في حسابي — معاينة حيّة فوق، والخيارات تحتها
   ═══════════════════════════════════════════════════════════════════
   ★ المعاينة هي الصفحة العامة نفسها مصغّرة (الدوال نفسها)، فلا يفاجأ
   الطالب بعد الحفظ. والحفظ زرٌّ صريح: تجربة عشرة ستايلات لا تُرسل عشرة طلبات.
*/
function lookCard(){
  const u = QBANK.api.user();
  if (!u) return el('div');
  const cached = QBANK.store.get('profile', null) || {};
  const prof = (cached.uid === u.id) ? cached : {};
  const state = Look.read(prof);
  let saved = JSON.stringify(state);

  const box = el('div', { class:'card stack look' });
  box.appendChild(el('h2', { style:'margin:0', text:'شكل ملفي' }));
  box.appendChild(el('p', { class:'field__hint', style:'margin:0',
    text:'غلاف ولون وستايل — هذا ما يراه زملاؤك حين يفتحون ملفك من المتصدرين أو من رابطك.' }));

  /* ── المعاينة ── */
  const pv = el('div', { class:'look__pv', 'aria-label':'معاينة ملفك' });
  function paint(){
    pv.innerHTML = '';
    Look.apply(pv, state);
    const p = {
      name: prof.name || 'اسمك', avatar: prof.avatar, avatar_url: prof.avatar_url,
      university: prof.university, college: prof.college, bio: prof.bio,
      rating_avg: prof.rating_avg, rating_n: prof.rating_n,
      uploads: prof.uploads, questions: prof.questions, sales: prof.sales
    };
    pv.appendChild(Look.cover(state));
    pv.appendChild(Look.hero(p));
    pv.appendChild(Look.stats(p));
    saveBtn.disabled = JSON.stringify(state) === saved;
    saveBtn.textContent = saveBtn.disabled ? 'محفوظ ✓' : 'احفظ الشكل';
  }
  box.appendChild(pv);

  /* ── الستايلات الخمسة: بلاطة لكل واحد برسم تخطيطي من CSS ── */
  const lay = el('div', { class:'look__tiles', role:'radiogroup', 'aria-label':'الستايل' });
  Look.LAYOUTS.forEach(l => {
    const t = el('button', { class:'look__tile', type:'button', role:'radio', 'data-layout': l.id,
      'aria-checked': state.layout === l.id ? 'true' : 'false', title: l.desc }, [
      el('span', { class:'look__mini look__mini--' + l.id, 'aria-hidden':'true' }, [
        el('i', { class:'look__mini-cov' }), el('i', { class:'look__mini-av' }),
        el('i', { class:'look__mini-t' }), el('i', { class:'look__mini-s' }) ]),
      el('span', { class:'look__tile-l', text: l.label })
    ]);
    t.addEventListener('click', () => {
      state.layout = l.id;
      lay.querySelectorAll('[role=radio]').forEach(x => x.setAttribute('aria-checked', x === t ? 'true' : 'false'));
      paint();
    });
    lay.appendChild(t);
  });
  box.appendChild(el('div', { class:'field' }, [ el('span', { class:'field__label', text:'الستايل' }), lay ]));

  /* ── اللون ── */
  const acc = el('div', { class:'look__dots', role:'radiogroup', 'aria-label':'لون المحور' });
  Look.ACCENTS.forEach(a => {
    const d = el('button', { class:'look__dot', type:'button', role:'radio', 'data-accent': a.id,
      'aria-checked': state.accent === a.id ? 'true' : 'false', 'aria-label': a.label, title: a.label,
      style: a.id ? '--dot:var(--' + a.id + ')' : '--dot:var(--brand)' });
    d.addEventListener('click', () => {
      state.accent = a.id;
      acc.querySelectorAll('[role=radio]').forEach(x => x.setAttribute('aria-checked', x === d ? 'true' : 'false'));
      paint();
    });
    acc.appendChild(d);
  });
  box.appendChild(el('div', { class:'field' }, [ el('span', { class:'field__label', text:'اللون' }), acc ]));

  /* ── الغلاف: تدرّجات جاهزة + صورة من الجهاز + بلا غلاف ── */
  const cov = el('div', { class:'look__covers', role:'radiogroup', 'aria-label':'الغلاف' });
  const covBtns = [];
  const syncCov = () => covBtns.forEach(b => b.setAttribute('aria-checked',
    (b.dataset.cover === state.cover_preset && !state.cover_url) ||
    (b.dataset.cover === 'url' && !!state.cover_url) ? 'true' : 'false'));
  const none = el('button', { class:'look__cover look__cover--none', type:'button', role:'radio', 'data-cover':'', text:'بلا غلاف' });
  none.addEventListener('click', () => { state.cover_preset = ''; state.cover_url = ''; syncCov(); paint(); });
  covBtns.push(none); cov.appendChild(none);
  Look.COVERS.forEach(c => {
    const b = el('button', { class:'look__cover pf-cover--' + c.id, type:'button', role:'radio', 'data-cover': c.id,
      'aria-label': c.label, title: c.label });
    b.addEventListener('click', () => { state.cover_preset = c.id; state.cover_url = ''; syncCov(); paint(); });
    covBtns.push(b); cov.appendChild(b);
  });
  const fileIn = el('input', { type:'file', accept:'image/*', style:'display:none', 'aria-hidden':'true' });
  const up = el('button', { class:'look__cover look__cover--up', type:'button', role:'radio', 'data-cover':'url',
    text: state.cover_url ? 'صورتي ✓' : '⇪ صورة من جهازي' });
  up.addEventListener('click', () => fileIn.click());
  const msg = el('p', { class:'field__hint', role:'status', style:'margin:0' });
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files && fileIn.files[0];
    if (!f) return;
    up.textContent = '… يُرفع'; msg.className = 'field__hint'; msg.textContent = '';
    const r = await Look.uploadCover(f);
    if (!r.ok){ up.textContent = '⇪ صورة من جهازي'; msg.className = 'field__hint is-bad'; msg.textContent = '⚠ ' + r.error; return; }
    state.cover_url = r.url; state.cover_preset = '';
    up.textContent = 'صورتي ✓'; syncCov(); paint();
  });
  covBtns.push(up); cov.appendChild(up); cov.appendChild(fileIn);
  syncCov();
  box.appendChild(el('div', { class:'field' }, [ el('span', { class:'field__label', text:'الغلاف' }), cov ]));

  /* ── الحفظ ── */
  const saveBtn = el('button', { class:'btn btn--block', type:'button', text:'احفظ الشكل' });
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true; saveBtn.textContent = '… يُحفظ';
    const r = await QBANK.api.saveProfile({ layout: state.layout, accent: state.accent,
      cover_preset: state.cover_preset, cover_url: state.cover_url });
    if (!r.ok){
      saveBtn.disabled = false; saveBtn.textContent = 'احفظ الشكل';
      msg.className = 'field__hint is-bad';
      msg.textContent = r.offline ? '⚠ لا اتصال — حاول بعد قليل' : '⚠ تعذّر الحفظ — نفّذ db/PROFILE-LOOK.sql';
      return;
    }
    saved = JSON.stringify(state);
    Object.assign(prof, state, { uid: u.id });
    QBANK.store.set('profile', prof);
    msg.className = 'field__hint is-ok'; msg.textContent = 'حُفظ — افتح ملفك لتراه كما يراه زملاؤك.';
    QBANK.toast('حُفظ شكل ملفك');
    paint();
  });
  box.appendChild(saveBtn);
  box.appendChild(msg);
  box.appendChild(el('a', { class:'btn btn--sm btn--ghost', href:'#/p/' + u.id, text:'👁 افتح ملفي العام' }));

  paint();

  /* الخادم هو الحقيقة: الأرقام والشكل المحفوظ يأتيان منه لا من ذاكرة الجهاز */
  QBANK.api.myProfile().then(r => {
    if (!r.ok || !r.data || !box.isConnected) return;
    const d = r.data;
    Object.assign(prof, { name: d.name || prof.name, bio: d.bio || prof.bio, avatar: d.avatar || prof.avatar,
      avatar_url: d.avatar_url || prof.avatar_url, rating_avg: d.rating_avg, rating_n: d.rating_n });
    /* لا يُداس اختيارٌ لم يُحفظ بعد: لو غيّر الطالب قبل وصول الرد نُبقي اختياره */
    if (JSON.stringify(state) === saved){
      Object.assign(state, Look.read(d)); saved = JSON.stringify(state);
      lay.querySelectorAll('[role=radio]').forEach(x => x.setAttribute('aria-checked', x.dataset.layout === state.layout ? 'true' : 'false'));
      acc.querySelectorAll('[role=radio]').forEach(x => x.setAttribute('aria-checked', x.dataset.accent === state.accent ? 'true' : 'false'));
      up.textContent = state.cover_url ? 'صورتي ✓' : '⇪ صورة من جهازي';
      syncCov();
    }
    paint();
  });
  return box;
}

QBANK.views.lookCard = lookCard;
