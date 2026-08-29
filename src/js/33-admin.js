/*
  لوحة تحكم المشرف — قلب المشروع.
  البوابة الحقيقية هي قاعدة البيانات (RLS + is_admin)؛ الواجهة هنا مجرد مرآة:
  حتى لو عبث أحد بالمتصفح فلن يقرأ صفًا واحدًا ليس له.
*/
const Admin = {
  /* هل الجلسة الحالية لمشرف؟ نسأل قاعدة البيانات مرة ونخزّن الجواب للجلسة */
  async check(){
    if (!AMUSQ.api.user()) return false;
    const cached = AMUSQ.store.get('is_admin_check', null);
    if (cached && cached.uid === AMUSQ.api.user().id) return cached.ok;
    const r = await AMUSQ.api.myProfile();
    const ok = !!(r.ok && r.data && r.data.is_admin);
    AMUSQ.store.set('is_admin_check', { uid: AMUSQ.api.user().id, ok });
    return ok;
  },

  /* رابط دوال الخادم: على Vercel هو نفس الأصل، ومن file:// يضبطه المشرف مرة واحدة */
  apiBase(){
    const c = AMUSQ.store.get('api_base', '');
    if (c) return c.replace(/\/+$/,'');
    return (typeof location !== 'undefined' && location.protocol.indexOf('http') === 0) ? '' : null;
  },
  async server(path, body){
    const base = Admin.apiBase();
    const f = AMUSQ.api.fetchFn();
    if (base === null || !f) return { ok:false, offline:true };
    try{
      const res = await f(base + path, {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify(body || {})
      });
      const data = await res.json().catch(() => null);
      return { ok: res.ok, status: res.status, data };
    } catch(e){ return { ok:false, offline:true, err:e.message }; }
  },

  /* ===== معالج الرفع — أربع خطوات، حالته قابلة للفحص بمعزل عن الواجهة ===== */
  BATCH: 25,   // حد دفعة الذكاء — يحمي من مهلة الخادم ويسمح باستئناف الرفع
  chunk(arr, n){
    const out = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
  },
  newWizard(){
    return { step:1, filename:'', raw:[], enriched:[], draftId:null, done:0, total:0, error:'' };
  },
  // تقدير التكلفة قبل التشغيل: عدد الأسئلة والدفعات — يقرّر المشرف على بيّنة
  estimate(w){
    return { questions: w.raw.length, batches: Admin.chunk(w.raw, Admin.BATCH).length };
  },

  async wizardIngest(w, filename, base64){
    const r = await Admin.server('/api/ingest', { filename, content_base64: base64 });
    if (!r.ok) { w.error = (r.data && r.data.error) || 'تعذّر الاتصال بالخادم'; return w; }
    w.filename = filename; w.raw = r.data.questions; w.total = r.data.total;
    w.step = 2; w.error = '';
    return w;
  },

  // «افهمه بالذكاء» على دفعات: المسوّدة تُحفظ بعد كل دفعة فيمكن إغلاق الصفحة والعودة
  async wizardEnrich(w, onProgress){
    const batches = Admin.chunk(w.raw, Admin.BATCH);
    for (let i = 0; i < batches.length; i++) {
      // لا إعادة معالجة لما اكتمل — الاستئناف يبدأ من حيث توقّف
      if (w.done >= (i + 1) * Admin.BATCH) continue;
      const r = await Admin.server('/api/ai', { questions: batches[i] });
      if (!r.ok) { w.error = (r.data && r.data.error) || 'انقطعت الدفعة ' + (i + 1); return w; }
      w.enriched = w.enriched.concat(r.data.questions);
      w.done = Math.min(w.enriched.length, w.total);
      await Admin.saveDraft(w);
      if (onProgress) onProgress(w.done, w.total);
    }
    if (w.done >= w.total) { w.step = 3; w.error = ''; }
    return w;
  },

  async saveDraft(w){
    const body = {
      name: w.filename.replace(/\.[^.]+$/, ''),
      source_name: w.filename,
      status: w.done >= w.total ? 'reviewing' : 'processing',
      payload: w.enriched, total: w.total, done: w.done,
      updated_at: new Date().toISOString()
    };
    if (w.draftId) {
      return AMUSQ.api.rest('drafts?id=eq.' + w.draftId, { method:'PATCH', body: JSON.stringify(body) });
    }
    body.created_by = (AMUSQ.api.user() || {}).id;
    const r = await AMUSQ.api.rest('drafts?select=id', {
      method:'POST',
      headers: Object.assign(AMUSQ.api.headers(), { 'Prefer':'return=representation' }),
      body: JSON.stringify(body)
    });
    if (r.ok && r.data && r.data[0]) w.draftId = r.data[0].id;
    return r;
  },

  // الاعتماد: نداء واحد ذرّي في قاعدة البيانات — إما كل شيء أو لا شيء
  approve(w, publish){
    return AMUSQ.api.rpc('approve_draft', { draft_id: w.draftId, publish });
  },

  // كشف المكرر بتشابه نصي بسيط: نفس الأحرف الدنيا بعد إزالة الفراغات — يوسم لا يحذف
  findDuplicates(questions){
    const seen = new Map(), dups = [];
    questions.forEach((q, i) => {
      const key = String(q.q || '').toLowerCase().replace(/\s+/g, ' ').trim();
      if (seen.has(key)) dups.push({ index: i, firstIndex: seen.get(key) });
      else seen.set(key, i);
    });
    return dups;
  }
};

/* ===== الواجهة ===== */
function adminStat(label, value){
  return el('div', { class:'card card--flat stat' }, [
    el('span', { class:'stat__num num', text: String(value) }),
    el('span', { class:'stat__lbl', text: label })
  ]);
}

function adminStudentsTab(box){
  box.appendChild(el('p', { class:'page__sub', text:'جارٍ الجلب…' }));
  Promise.all([ AMUSQ.api.rpc('admin_stats'), AMUSQ.api.rpc('admin_students', { page:0, page_size:50, search:'' }) ])
    .then(([st, rows]) => {
      if (!box.isConnected) return;   // غادر المشرف الشاشة قبل وصول الرد
      box.innerHTML = '';
      if (!st.ok || (st.data && st.data.error)) {
        box.appendChild(AMUSQ.views.empty('⚠', 'تعذّر الجلب', st.offline ? 'لا اتصال بالإنترنت.' : 'تأكد أن حسابك مشرف وأن قاعدة البيانات مجهزة.'));
        return;
      }
      const s = st.data;
      box.appendChild(el('div', { class:'grid grid--2 stats' }, [
        adminStat('طالبًا', s.students), adminStat('نشط آخر ٧ أيام', s.active_7d),
        adminStat('اختبارًا', s.attempts), adminStat('متوسط النتائج ٪', s.avg_pct)
      ]));
      const list = (rows.ok && rows.data && rows.data.rows) || [];
      if (!list.length) { box.appendChild(AMUSQ.views.empty('👥', 'لا طلاب بعد', 'سيظهر الطلاب هنا فور تسجيلهم.')); return; }
      const tbl = el('div', { class:'card stack' }, list.map(r => {
        const row = el('button', { class:'row rowbtn', type:'button' }, [
          el('span', { text: (r.avatar || '👤') + ' ' + (r.name || 'بلا اسم') }),
          el('span', { class:'spacer' }),
          el('span', { class:'badge num', text: r.attempts + ' اختبار' }),
          el('span', { class:'badge badge--ok num', text: 'أفضل ' + Math.round(r.best) + '٪' })
        ]);
        row.addEventListener('click', async () => {
          const at = await AMUSQ.api.rpc('admin_attempts', { uid: r.id });
          const items = (at.ok && Array.isArray(at.data)) ? at.data : [];
          const det = el('div', { class:'card stack' },
            items.length ? items.map(a => el('div', { class:'row' }, [
              el('span', { text: a.subject }),
              el('span', { class:'spacer' }),
              el('span', { class:'badge num', text: Math.round(a.pct) + '٪' }),
              el('span', { class:'badge num', text: Math.round(a.duration_s / 60) + ' د' })
            ])) : [el('p', { class:'page__sub', text:'لا محاولات لهذا الطالب.' })]);
          row.parentNode.insertBefore(det, row.nextSibling);
        }, { once:true });
        return row;
      }));
      box.appendChild(tbl);
    });
}

function adminContentTab(box){
  const upBtn = el('button', { class:'btn btn--block', type:'button', text:'⇪ ارفع ملف أسئلة جديدًا' });
  upBtn.addEventListener('click', () => AMUSQ.router.go('#/admin/upload'));
  box.appendChild(upBtn);
  const listBox = el('div', { class:'stack', style:'margin-top:16px' });
  box.appendChild(listBox);
  listBox.appendChild(el('p', { class:'page__sub', text:'جارٍ الجلب…' }));

  Promise.all([
    AMUSQ.api.rest('subjects?select=id,name,color,icon,q_count,published,free,ord,exam_date&order=ord'),
    // قوائم المسوّدات بلا payload — الحمولة كبيرة ولا تلزم القائمة
    AMUSQ.api.rest('drafts?select=id,name,status,total,done,updated_at&order=updated_at.desc')
  ]).then(([subs, drs]) => {
    if (!listBox.isConnected) return;
    listBox.innerHTML = '';
    const subjects = (subs.ok && subs.data) || [];
    const drafts = (drs.ok && drs.data) || [];

    if (drafts.length) {
      listBox.appendChild(el('h2', { text:'المسوّدات' }));
      drafts.forEach(d => {
        if (d.status === 'approved') return;
        listBox.appendChild(el('div', { class:'card row' }, [
          el('span', { text: d.name || 'بلا اسم' }),
          el('span', { class:'badge ' + (d.status === 'reviewing' ? 'badge--warn' : ''), text:
            d.status === 'reviewing' ? 'بانتظار المراجعة' : 'قيد المعالجة ' + d.done + ' من ' + d.total }),
          el('span', { class:'spacer' }),
          el('a', { class:'btn btn--sm btn--soft', href:'#/admin/upload?draft=' + d.id, text:'أكمل' })
        ]));
      });
    }

    listBox.appendChild(el('h2', { text:'المواد' }));
    if (!subjects.length) {
      listBox.appendChild(AMUSQ.views.empty('▤', 'لا مواد بعد', 'ارفع أول ملف أسئلة وسيظهر هنا بعد الاعتماد.'));
      return;
    }
    subjects.forEach(sub => {
      const pubBtn = el('button', { class:'btn btn--sm ' + (sub.published ? 'btn--soft' : ''), type:'button',
        text: sub.published ? 'أخفِ' : 'انشر' });
      pubBtn.addEventListener('click', async () => {
        const r = await AMUSQ.api.rest('subjects?id=eq.' + sub.id,
          { method:'PATCH', body: JSON.stringify({ published: !sub.published }) });
        AMUSQ.toast(r.ok ? 'تم' : 'تعذّر التعديل');
        if (r.ok) AMUSQ.router.render('#/admin/content');
      });
      const dateIn = el('input', { class:'input input--sm', type:'date',
        value: sub.exam_date ? String(sub.exam_date).slice(0,10) : '', 'aria-label':'موعد اختبار ' + sub.name });
      dateIn.addEventListener('change', async () => {
        await AMUSQ.api.rest('subjects?id=eq.' + sub.id,
          { method:'PATCH', body: JSON.stringify({ exam_date: dateIn.value || null }) });
        AMUSQ.toast('حُفظ الموعد');
      });
      const freeBtn = el('button', { class:'btn btn--sm btn--ghost', type:'button',
        text: sub.free ? '★ مجانية' : 'اجعلها مجانية' });
      freeBtn.addEventListener('click', async () => {
        await AMUSQ.api.rest('subjects?id=eq.' + sub.id,
          { method:'PATCH', body: JSON.stringify({ free: !sub.free }) });
        AMUSQ.router.render('#/admin/content');
      });
      listBox.appendChild(el('div', { class:'card stack' }, [
        el('div', { class:'row' }, [
          el('span', { text: (sub.icon || '▤') + ' ' + sub.name }),
          el('span', { class:'badge num', text: sub.q_count + ' سؤالًا' }),
          sub.published ? el('span', { class:'badge badge--ok', text:'منشورة ✓' })
                        : el('span', { class:'badge', text:'مخفية' }),
          el('span', { class:'spacer' }), pubBtn
        ]),
        el('div', { class:'row' }, [ dateIn, freeBtn ])
      ]));
    });
  });
}

function adminSettingsTab(box){
  // إعداد الربط: يعمل حتى قبل الدخول — هو أول ما يفعله المشرف عند التركيب
  const c = AMUSQ.config.get() || {};
  const urlIn = el('input', { class:'input', dir:'ltr', id:'cfgUrl', value: c.url || '', placeholder:'https://xxxx.supabase.co' });
  const keyIn = el('input', { class:'input', dir:'ltr', id:'cfgKey', value: c.anonKey || '', placeholder:'anon key' });
  const apiIn = el('input', { class:'input', dir:'ltr', id:'cfgApi', value: AMUSQ.store.get('api_base',''), placeholder:'https://amusq.vercel.app (اتركه فارغًا على نفس الموقع)' });
  const saveCfg = el('button', { class:'btn btn--block', type:'button', text:'احفظ الربط' });
  saveCfg.addEventListener('click', () => {
    const r = AMUSQ.config.set(urlIn.value.trim(), keyIn.value.trim());
    AMUSQ.store.set('api_base', apiIn.value.trim());
    AMUSQ.toast(r.ok ? 'حُفظ الربط — المنصة موصولة' : r.err);
  });
  box.appendChild(el('div', { class:'card stack' }, [
    el('h2', { text:'ربط الخادم' }),
    el('label', { class:'field', style:'margin:0' }, [ el('span', { class:'field__label', text:'رابط Supabase' }), urlIn ]),
    el('label', { class:'field', style:'margin:0' }, [ el('span', { class:'field__label', text:'المفتاح العام (anon) — عام بطبيعته، والحماية في RLS' }), keyIn ]),
    el('label', { class:'field', style:'margin:0' }, [ el('span', { class:'field__label', text:'رابط دوال الخادم (Vercel)' }), apiIn ]),
    saveCfg
  ]));

  // إعدادات المنصة من قاعدة البيانات
  const setBox = el('div', { class:'card stack' }, [ el('h2', { text:'إعدادات المنصة' }),
    el('p', { class:'page__sub', text:'جارٍ الجلب…' }) ]);
  box.appendChild(setBox);
  AMUSQ.api.rest('settings?id=eq.1').then(r => {
    if (!setBox.isConnected) return;
    const s = (r.ok && r.data && r.data[0]) || null;
    setBox.innerHTML = '';
    setBox.appendChild(el('h2', { text:'إعدادات المنصة' }));
    if (!s) { setBox.appendChild(el('p', { class:'page__sub', text:'تُجلب بعد ربط الخادم والدخول كمشرف.' })); return; }
    const welcome = el('textarea', { class:'input', rows:'3', id:'setWelcome' }); welcome.value = s.welcome_text || '';
    const boardBtn = el('button', { class:'btn btn--sm ' + (s.board_enabled ? 'btn--soft' : 'btn--ghost'), type:'button',
      text: s.board_enabled ? 'لوحة المتصدرين: مفعّلة' : 'لوحة المتصدرين: موقوفة' });
    const limitIn = el('input', { class:'input', type:'number', min:'1', max:'10', value: String(s.device_limit || 3), 'aria-label':'حد الأجهزة' });
    let boardOn = !!s.board_enabled;
    boardBtn.addEventListener('click', () => {
      boardOn = !boardOn;
      boardBtn.textContent = boardOn ? 'لوحة المتصدرين: مفعّلة' : 'لوحة المتصدرين: موقوفة';
    });
    const save = el('button', { class:'btn btn--block', type:'button', text:'احفظ الإعدادات' });
    save.addEventListener('click', async () => {
      const rr = await AMUSQ.api.rest('settings?id=eq.1', { method:'PATCH', body: JSON.stringify({
        welcome_text: welcome.value, board_enabled: boardOn, device_limit: parseInt(limitIn.value || '3', 10)
      }) });
      AMUSQ.toast(rr.ok ? 'حُفظت الإعدادات' : 'تعذّر الحفظ');
    });
    setBox.appendChild(el('label', { class:'field', style:'margin:0' }, [ el('span', { class:'field__label', text:'نص الترحيب' }), welcome ]));
    setBox.appendChild(boardBtn);
    setBox.appendChild(el('label', { class:'field', style:'margin:0' }, [ el('span', { class:'field__label', text:'حد الأجهزة لكل حساب' }), limitIn ]));
    setBox.appendChild(save);
  });
}

const ADMIN_TABS = [
  { id:'students', label:'الطلاب',   fill: adminStudentsTab },
  { id:'content',  label:'المحتوى',  fill: adminContentTab },
  { id:'settings', label:'الإعدادات', fill: adminSettingsTab }
];

const AdminView = {
  title:'لوحة التحكم',
  view(route){
    const u = AMUSQ.api.user();
    // بلا جلسة: نعرض دخول المشرف — إلا الإعدادات فهي تعمل محليًا لضبط الربط الأول
    if (!u && route.rest[0] !== 'settings') return AMUSQ.views.ViewAdminLogin.view();

    const active = ADMIN_TABS.some(t => t.id === route.rest[0]) ? route.rest[0] : 'students';
    const tabs = el('div', { class:'tabs', role:'tablist' },
      ADMIN_TABS.map(t => el('button', {
        class:'tabs__btn', type:'button', role:'tab', 'data-tab':t.id,
        'aria-selected': t.id === active ? 'true' : 'false', text: t.label })));
    tabs.addEventListener('click', e => {
      const b = e.target.closest('[data-tab]');
      if (b) AMUSQ.router.go('#/admin/' + b.getAttribute('data-tab'));
    });
    const body = el('div', { class:'stack', id:'adminBody' });
    ADMIN_TABS.filter(t => t.id === active)[0].fill(body);
    return AMUSQ.views.page('لوحة التحكم', 'كل ما يظهر للطالب يمرّ من هنا أولًا.', [tabs, body]);
  }
};

AMUSQ.admin = Admin;
AMUSQ.views.ViewAdmin = AdminView;
