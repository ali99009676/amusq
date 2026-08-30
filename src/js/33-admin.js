/*
  لوحة تحكم المشرف — قلب المشروع.
  البوابة الحقيقية هي قاعدة البيانات (RLS + is_admin)؛ الواجهة هنا مجرد مرآة:
  حتى لو عبث أحد بالمتصفح فلن يقرأ صفًا واحدًا ليس له.
*/
const Admin = {
  /* هل الجلسة الحالية لمشرف؟ نسأل قاعدة البيانات مرة ونخزّن الجواب للجلسة */
  async check(){
    if (!QBANK.api.user()) return false;
    const cached = QBANK.store.get('is_admin_check', null);
    if (cached && cached.uid === QBANK.api.user().id) return cached.ok;
    const r = await QBANK.api.myProfile();
    const ok = !!(r.ok && r.data && r.data.is_admin);
    QBANK.store.set('is_admin_check', { uid: QBANK.api.user().id, ok });
    return ok;
  },

  /* رابط دوال الخادم: على Vercel هو نفس الأصل، ومن file:// يضبطه المشرف مرة واحدة */
  apiBase(){
    const c = QBANK.store.get('api_base', '');
    if (c) return c.replace(/\/+$/,'');
    return (typeof location !== 'undefined' && location.protocol.indexOf('http') === 0) ? '' : null;
  },
  async server(path, body){
    const base = Admin.apiBase();
    const f = QBANK.api.fetchFn();
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
  // ٤٠ لا ٢٥: تعليمات النظام تُرسل مرة لكل دفعة، فالدفعة الأكبر توزّع كلفتها
  // على أسئلة أكثر. والسقف يبقى دون مهلة الخادم ويسمح باستئناف الرفع.
  BATCH: 40,
  chunk(arr, n){
    const out = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
  },
  newWizard(){
    // strict افتراضًا: قاعدة القداسة هي الأصل، والتحسين اختيار صريح من الرافع
    // enrich=false افتراضًا: المسار المجاني هو الأصل، والإثراء اختيار واعٍ يُدفع ثمنه
    return { step:1, filename:'', subjectName:'', slug:'', mode:'strict', enrich:false,
             country:'', university:'', college:'', courseCode:'',
             raw:[], enriched:[], draftId:null, done:0, total:0, error:'' };
  },
  // تقدير التكلفة قبل التشغيل: عدد الأسئلة والدفعات — يقرّر المشرف على بيّنة
  estimate(w){
    return { questions: w.raw.length, batches: Admin.chunk(w.raw, Admin.BATCH).length };
  },

  async wizardIngest(w, filename, base64){
    const r = await Admin.server('/api/ingest', { filename, content_base64: base64,
      subject_name: w.subjectName || '', sanctity_mode: w.mode || 'strict' });
    if (!r.ok) { w.error = (r.data && r.data.error) || 'تعذّر الاتصال بالخادم'; return w; }
    w.filename = filename; w.raw = r.data.questions; w.total = r.data.total;
    w.subjectName = w.subjectName || r.data.subject_name || '';
    w.slug = r.data.slug || '';
    w.step = 2; w.error = '';
    return w;
  },

  // «افهمه بالذكاء» على دفعات: المسوّدة تُحفظ بعد كل دفعة فيمكن إغلاق الصفحة والعودة
  /*
    المسار المجاني: نبني الأسئلة من المقسّم مباشرة بلا نداء ذكاء.
    ما ينقصها هو الشرح والترجمة وبطاقة الحفظ — والسؤال بلا إجابة معلنة
    يبقى بلا إجابة، فنوسمه ليصحّحه صاحبه بيده في المحرر.
  */
  plainEnrich(w){
    w.enriched = w.raw.map(q => ({
      q: q.q, q_original: q.q, sanctity_mode: 'strict',
      options: q.has_options ? q.options.slice() : [String(q.answer_text || '—')],
      options_original: q.has_options ? q.options.slice() : [],
      answer: (q.has_options && typeof q.answer === 'number' && q.answer >= 0) ? q.answer : 0,
      derived: !(q.has_options && typeof q.answer === 'number' && q.answer >= 0),
      opts_built: !q.has_options,
      expl_ar:'', expl_en:'', translation:'', mnemonic:{}, topic:'', important:false
    }));
    w.done = w.total; w.step = 3; w.error = '';
    return w;
  },

  /* كم كوينًا يلزم لإثراء هذا الملف */
  creditsNeeded(w, costPerQ){
    return Math.max(0, (w.raw.length - w.done)) * Math.max(0, costPerQ || 1);
  },

  async wizardEnrich(w, onProgress){
    // المسار المجاني لا يمرّ بالخادم إطلاقًا — لا تكلفة ولا انتظار
    if (!w.enrich) { const r = Admin.plainEnrich(w); await Admin.saveDraft(r); return r; }

    const batches = Admin.chunk(w.raw, Admin.BATCH);
    for (let i = 0; i < batches.length; i++) {
      // لا إعادة معالجة لما اكتمل — الاستئناف يبدأ من حيث توقّف
      if (w.done >= (i + 1) * Admin.BATCH) continue;

      /*
        الحسم قبل النداء لا بعده. لو حسمنا بعده لكان كل انقطاع إثراءً مجانيًا،
        ولو تعطّل الخادم بعد الحسم رددنا الرصيد في السطر التالي.
      */
      const need = batches[i].length * (w.costPerQ || 1);
      const pay = await QBANK.api.rpc('spend_credits',
        { n: need, p_reason: 'إثراء ' + batches[i].length + ' سؤالًا', p_draft: w.draftId });
      if (!pay.ok || !pay.data || !pay.data.ok) {
        const d = (pay.data) || {};
        w.error = d.reason === 'insufficient'
          ? 'رصيدك ' + (d.balance || 0) + ' كوين ولا يكفي — يلزم ' + need
          : (d.reason === 'closed' ? 'الإثراء موقوف مؤقتًا' : 'تعذّر حسم الرصيد');
        w.needCoins = d.reason === 'insufficient' ? need - (d.balance || 0) : 0;
        return w;
      }

      const r = await Admin.server('/api/ai', { questions: batches[i], sanctity_mode: w.mode || 'strict' });
      if (!r.ok) {
        // الطالب لا يدفع ثمن عطل عندنا
        await QBANK.api.rpc('refund_credits', { n: need, p_reason: 'تعذّرت الدفعة', p_draft: w.draftId });
        w.error = (r.data && r.data.error) || 'انقطعت الدفعة ' + (i + 1) + ' — رُدّ رصيدها';
        return w;
      }
      w.enriched = w.enriched.concat(r.data.questions);
      w.done = Math.min(w.enriched.length, w.total);
      if (r.data.usage) w.usage = r.data.usage;
      await Admin.saveDraft(w);
      if (onProgress) onProgress(w.done, w.total);
    }
    if (w.done >= w.total) { w.step = 3; w.error = ''; }
    return w;
  },

  async saveDraft(w){
    const body = {
      name: w.subjectName || w.filename.replace(/\.[^.]+$/, ''),
      source_name: w.filename,
      status: w.done >= w.total ? 'reviewing' : 'processing',
      payload: w.enriched, total: w.total, done: w.done,
      updated_at: new Date().toISOString()
    };
    if (w.draftId) {
      return QBANK.api.rest('drafts?id=eq.' + w.draftId, { method:'PATCH', body: JSON.stringify(body) });
    }
    body.created_by = (QBANK.api.user() || {}).id;
    const r = await QBANK.api.rest('drafts?select=id', {
      method:'POST',
      headers: Object.assign(QBANK.api.headers(), { 'Prefer':'return=representation' }),
      body: JSON.stringify(body)
    });
    if (r.ok && r.data && r.data[0]) w.draftId = r.data[0].id;
    return r;
  },

  // الاعتماد: نداء واحد ذرّي في قاعدة البيانات — إما كل شيء أو لا شيء
  approve(w, publish){
    return QBANK.api.rpc('approve_draft', { draft_id: w.draftId, publish });
  },

  /*
    بعد الاعتماد نختم المادة بهوية رافعها: من رفعها، وبأي نمط، وبأي مسار.
    نداء منفصل عن approve_draft عمدًا كي لا نغيّر توقيع دالة معتمدة تعمل،
    وفشله لا يُبطل مادة أُنشئت — يبقى المشرف قادرًا على ضبط الباقي بيده.
  */
  async stamp(subjectId, w){
    if (!subjectId) return { ok:false };
    const u = QBANK.api.user() || {};
    const body = {
      created_by: u.id || null,
      sanctity_mode: w.mode === 'enhanced' ? 'enhanced' : 'strict',
      slug: w.slug || null,
      status: 'published',
      course_code: w.courseCode || ''
    };
    // الجامعة والكلية تُنشآن في الخادم إن لم تكونا موجودتين — والتطبيع يمنع التكرار
    if (w.country && w.university){
      const r = await QBANK.api.rpc('ensure_university', { p_country: w.country, p_name: w.university });
      if (r.ok && r.data && typeof r.data === 'string'){
        body.university_id = r.data;
        if (w.college){
          const c = await QBANK.api.rpc('ensure_college', { p_university: r.data, p_name: w.college });
          if (c.ok && c.data && typeof c.data === 'string') body.college_id = c.data;
        }
      }
    }
    return QBANK.api.rest('subjects?id=eq.' + subjectId, { method:'PATCH', body: JSON.stringify(body) });
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

/* ===== الواجهة =====
   كل تبويبات اللوحة تستعمل مكوّنات واحدة: ad-kpi للمؤشرات، ad-panel للأقسام،
   ad-row للصفوف. التفاوت بين التبويبات يجعل اللوحة تبدو مجموعة صفحات لا لوحة. */
function adminPanel(title, sub, body){
  return el('section', { class:'ad-panel' }, [
    el('div', { class:'ad-panel__h' }, [
      el('h2', { class:'ad-panel__t', text:title }),
      sub ? el('span', { class:'ad-panel__s', text:sub }) : null
    ]),
    body
  ]);
}

function adminStudentsTab(box){
  box.appendChild(el('p', { class:'page__sub', text:'جارٍ الجلب…' }));
  Promise.all([ QBANK.api.rpc('admin_stats'), QBANK.api.rpc('admin_students', { page:0, page_size:50, search:'' }) ])
    .then(([st, rows]) => {
      if (!box.isConnected) return;   // غادر المشرف الشاشة قبل وصول الرد
      box.innerHTML = '';
      if (!st.ok || (st.data && st.data.error)) {
        box.appendChild(QBANK.views.empty('⚠', 'تعذّر الجلب', st.offline ? 'لا اتصال بالإنترنت.' : 'تأكد أن حسابك مشرف وأن قاعدة البيانات مجهزة.'));
        return;
      }
      const s = st.data;
      const K = QBANK.admin.charts.kpi;
      box.appendChild(el('div', { class:'ad-kpis' }, [
        K(s.students, 'طالبًا', 'مسجَّل'),
        K(s.active_7d, 'نشط', 'آخر ٧ أيام', s.active_7d > 0 ? 'live' : null),
        K(s.attempts, 'اختبارًا', 'منذ الإطلاق'),
        K(s.avg_pct + '٪', 'متوسط النتائج', s.avg_pct >= 70 ? 'فوق حدّ النجاح' : 'تحت حدّ النجاح',
          s.avg_pct >= 70 ? 'live' : (s.avg_pct > 0 ? 'warn' : null))
      ]));
      const list = (rows.ok && rows.data && rows.data.rows) || [];
      if (!list.length) { box.appendChild(QBANK.views.empty('👥', 'لا طلاب بعد', 'سيظهر الطلاب هنا فور تسجيلهم.')); return; }
      const tbl = el('div', { class:'ad-table' }, list.map(r => {
        const row = el('button', { class:'ad-row', type:'button' }, [
          el('span', { class:'ad-feed__av', text: r.avatar || '👤' }),
          el('span', { class:'ad-row__main' }, [
            el('span', { class:'ad-row__t', text: r.name || 'بلا اسم' }),
            el('span', { class:'ad-row__s', text: r.attempts + ' اختبار' })
          ]),
          el('span', { class:'badge num ' + (r.best >= 70 ? 'badge--ok' : ''),
            text: 'أفضل ' + Math.round(r.best) + '٪' })
        ]);
        row.addEventListener('click', async () => {
          const at = await QBANK.api.rpc('admin_attempts', { uid: r.id });
          const items = (at.ok && Array.isArray(at.data)) ? at.data : [];
          const det = el('div', { class:'ad-sub' },
            items.length ? items.map(a => el('div', { class:'ad-feed__i' }, [
              el('span', { class:'ad-row__main' }, [ el('span', { class:'ad-row__t', text: a.subject }) ]),
              el('span', { class:'badge num ' + (a.pct >= 70 ? 'badge--ok' : 'badge--warn'),
                text: Math.round(a.pct) + '٪' }),
              el('span', { class:'ad-feed__t', text: Math.round(a.duration_s / 60) + ' د' })
            ])) : [el('p', { class:'page__sub', style:'margin:0', text:'لا محاولات لهذا الطالب.' })]);
          row.parentNode.insertBefore(det, row.nextSibling);
        }, { once:true });
        return row;
      }));
      box.appendChild(el('div', { class:'ad-panels', style:'margin-top:22px' }, [
        adminPanel('الطلاب', list.length + ' طالبًا · اضغط أيًّا منهم لمحاولاته', tbl)
      ]));
    });
}

function adminContentTab(box){
  const upBtn = el('a', { class:'btn', href:'#/admin/upload', text:'⇪ ارفع ملف أسئلة' });
  box.appendChild(el('div', { class:'ad-bar' }, [
    upBtn,
    el('a', { class:'btn btn--ghost', href:'#/explore', text:'⌕ اعرض ما يراه الطالب' })
  ]));
  const listBox = el('div', { class:'ad-panels' });
  box.appendChild(listBox);
  listBox.appendChild(el('p', { class:'page__sub', text:'جارٍ الجلب…' }));

  Promise.all([
    QBANK.api.rest('subjects?select=id,name,color,icon,q_count,published,free,ord,exam_date&order=ord'),
    // قوائم المسوّدات بلا payload — الحمولة كبيرة ولا تلزم القائمة
    QBANK.api.rest('drafts?select=id,name,status,total,done,updated_at&order=updated_at.desc')
  ]).then(([subs, drs]) => {
    if (!listBox.isConnected) return;
    listBox.innerHTML = '';
    const subjects = (subs.ok && subs.data) || [];
    const drafts = (drs.ok && drs.data) || [];

    const pending = drafts.filter(d => d.status !== 'approved');
    if (pending.length) {
      listBox.appendChild(adminPanel('المسوّدات', pending.length + ' غير معتمدة — لا يراها الطالب',
        el('div', { class:'ad-table' }, pending.map(d =>
          el('div', { class:'ad-row', style:'cursor:default' }, [
            el('span', { class:'ad-row__main' }, [
              el('span', { class:'ad-row__t', text: d.name || 'بلا اسم' }),
              el('span', { class:'ad-row__s', text:
                d.status === 'reviewing' ? 'اكتملت المعالجة — بانتظار مراجعتك'
                                         : 'قيد المعالجة: ' + d.done + ' من ' + d.total })
            ]),
            el('span', { class:'badge ' + (d.status === 'reviewing' ? 'badge--warn' : ''),
              text: d.status === 'reviewing' ? 'راجِعها' : 'تُعالَج' }),
            el('a', { class:'btn btn--sm btn--soft', href:'#/admin/upload?draft=' + d.id, text:'أكمل' })
          ])))));
    }

    if (!subjects.length) {
      listBox.appendChild(QBANK.views.empty('▤', 'لا مواد بعد', 'ارفع أول ملف أسئلة وسيظهر هنا بعد الاعتماد.'));
      return;
    }
    const subTable = el('div', { class:'ad-table' });
    subjects.forEach(sub => {
      const pubBtn = el('button', { class:'btn btn--sm ' + (sub.published ? 'btn--soft' : ''), type:'button',
        text: sub.published ? 'أخفِ' : 'انشر' });
      pubBtn.addEventListener('click', async () => {
        const r = await QBANK.api.rest('subjects?id=eq.' + sub.id,
          { method:'PATCH', body: JSON.stringify({ published: !sub.published }) });
        QBANK.toast(r.ok ? 'تم' : 'تعذّر التعديل');
        if (r.ok) QBANK.router.render('#/admin/content');
      });
      const dateIn = el('input', { class:'input input--sm', type:'date',
        value: sub.exam_date ? String(sub.exam_date).slice(0,10) : '', 'aria-label':'موعد اختبار ' + sub.name });
      dateIn.addEventListener('change', async () => {
        await QBANK.api.rest('subjects?id=eq.' + sub.id,
          { method:'PATCH', body: JSON.stringify({ exam_date: dateIn.value || null }) });
        QBANK.toast('حُفظ الموعد');
      });
      const freeBtn = el('button', { class:'btn btn--sm btn--ghost', type:'button',
        text: sub.free ? '★ مجانية' : 'اجعلها مجانية' });
      freeBtn.addEventListener('click', async () => {
        await QBANK.api.rest('subjects?id=eq.' + sub.id,
          { method:'PATCH', body: JSON.stringify({ free: !sub.free }) });
        QBANK.router.render('#/admin/content');
      });
      subTable.appendChild(el('div', { class:'ad-row', style:'cursor:default;flex-wrap:wrap' }, [
        el('span', { text: sub.icon || '▤' }),
        el('span', { class:'ad-row__main' }, [
          el('span', { class:'ad-row__t', text: sub.name }),
          el('span', { class:'ad-row__s', text: sub.q_count + ' سؤالًا' })
        ]),
        sub.published ? el('span', { class:'badge badge--ok', text:'منشورة' })
                      : el('span', { class:'badge', text:'مخفية' }),
        el('a', { class:'btn btn--sm btn--soft', href:'#/admin/subject/' + sub.id, text:'حرّر' }),
        pubBtn,
        el('span', { class:'ad-sub', style:'flex:1 0 100%' }, [
          el('label', { class:'ad-inline' }, [
            el('span', { class:'ad-inline__l', text:'موعد الاختبار' }), dateIn ]),
          freeBtn
        ])
      ]));
    });
    listBox.appendChild(adminPanel('المواد', subjects.length + ' مادة على المنصة', subTable));
  });
}

function adminSettingsTab(box){
  // إعداد الربط: يعمل حتى قبل الدخول — هو أول ما يفعله المشرف عند التركيب
  const c = QBANK.config.get() || {};
  const urlIn = el('input', { class:'input', dir:'ltr', id:'cfgUrl', value: c.url || '', placeholder:'https://xxxx.supabase.co' });
  const keyIn = el('input', { class:'input', dir:'ltr', id:'cfgKey', value: c.anonKey || '', placeholder:'anon key' });
  const apiIn = el('input', { class:'input', dir:'ltr', id:'cfgApi', value: QBANK.store.get('api_base',''), placeholder:'https://qbank.vercel.app (اتركه فارغًا على نفس الموقع)' });
  const saveCfg = el('button', { class:'btn btn--block', type:'button', text:'احفظ الربط' });
  saveCfg.addEventListener('click', () => {
    const r = QBANK.config.set(urlIn.value.trim(), keyIn.value.trim());
    QBANK.store.set('api_base', apiIn.value.trim());
    QBANK.toast(r.ok ? 'حُفظ الربط — المنصة موصولة' : r.err);
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
  QBANK.api.rest('settings?id=eq.1').then(r => {
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
      const rr = await QBANK.api.rest('settings?id=eq.1', { method:'PATCH', body: JSON.stringify({
        welcome_text: welcome.value, board_enabled: boardOn, device_limit: parseInt(limitIn.value || '3', 10)
      }) });
      QBANK.toast(rr.ok ? 'حُفظت الإعدادات' : 'تعذّر الحفظ');
    });
    setBox.appendChild(el('label', { class:'field', style:'margin:0' }, [ el('span', { class:'field__label', text:'نص الترحيب' }), welcome ]));
    setBox.appendChild(boardBtn);
    setBox.appendChild(el('label', { class:'field', style:'margin:0' }, [ el('span', { class:'field__label', text:'حد الأجهزة لكل حساب' }), limitIn ]));
    setBox.appendChild(save);
  });
}

const ADMIN_TABS = [
  // تُحقن «اللوحة» من 42-admin-dash.js في المقدمة — أبقيناها منفصلة كي يبقى هذا الملف قابلًا للفحص وحده
  { id:'students', label:'الطلاب',   fill: adminStudentsTab },
  { id:'content',  label:'المحتوى',  fill: adminContentTab },
  { id:'settings', label:'الإعدادات', fill: adminSettingsTab }
];

const AdminView = {
  title:'لوحة التحكم',
  view(route){
    const u = QBANK.api.user();
    // بلا جلسة: نعرض دخول المشرف — إلا الإعدادات فهي تعمل محليًا لضبط الربط الأول
    if (!u && route.rest[0] !== 'settings') return QBANK.views.ViewAdminLogin.view();

    const active = ADMIN_TABS.some(t => t.id === route.rest[0]) ? route.rest[0] : ADMIN_TABS[0].id;
    const tabs = el('div', { class:'tabs', role:'tablist' },
      ADMIN_TABS.map(t => el('button', {
        class:'tabs__btn', type:'button', role:'tab', 'data-tab':t.id,
        'aria-selected': t.id === active ? 'true' : 'false', text: t.label })));
    tabs.addEventListener('click', e => {
      const b = e.target.closest('[data-tab]');
      if (b) QBANK.router.go('#/admin/' + b.getAttribute('data-tab'));
    });
    const body = el('div', { class:'stack', id:'adminBody' });
    ADMIN_TABS.filter(t => t.id === active)[0].fill(body);
    return QBANK.views.page('لوحة التحكم', 'كل ما يظهر للطالب يمرّ من هنا أولًا.', [tabs, body]);
  }
};

Object.assign(Admin, QBANK.admin || {});   // نحفظ ما ألحقته الملفات اللاحقة (charts وغيرها)
QBANK.admin = Admin;
QBANK.views.ADMIN_TABS = ADMIN_TABS;
QBANK.views.ViewAdmin = AdminView;
