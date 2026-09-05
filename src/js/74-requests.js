/*
  ═══════════════════════════════════════════════════════════════════
  «ارفعها عنّي» — طلب رفع مادة من المشرف
  ═══════════════════════════════════════════════════════════════════
  معالج الرفع أربع خطوات: اسم وجامعة وكلية، ثم ملف، ثم مراجعةُ كل سؤال،
  ثم قرار الإثراء والنشر. وهو طريقٌ جيّد لمن يريده — لكن أكثر الطلاب لا
  يريدون أن يصيروا محرّرين، إنما عندهم ملفٌ ويريدونه في المنصة.

  والخطأ في ذلك الطريق لا يقع على صاحبه وحده: إجابةٌ خاطئة اعتُمدت بلا
  انتباه يذاكرها بعده عشرون. وكل ضغطة «أثرِ بالذكاء» فاتورةٌ تدفعها
  المنصة لا الطالب.

  ★ فالخيار الثاني: اسم المادة وملفها — وينتهي دوره. يصل الطلب لوحة
  المشرف، فيرفعه بيده ويراجعه ويقرّر متى يستدعي الذكاء. والمادة تُنشر
  باسم صاحبها لا باسم من رفعها: هو رافعها في كل شاشة، وله مدّتها وعائدها.
*/
const Requests = {
  /* حال الطلب كما يقرؤها صاحبه — لا بأسماء القاعدة */
  LABEL: {
    new:      ['badge--warn', 'في الطابور',        'وصل طلبك — سيرفعها المشرف ويظهر اسمك عليها.'],
    doing:    ['badge',       'يرفعها المشرف الآن', 'بدأ العمل على ملفك.'],
    done:     ['badge--ok',   'رُفعت ونُشرت',        'صارت مادتك على المنصة باسمك.'],
    rejected: ['badge--bad',  'لم تُقبل',           'راجع ملاحظة المشرف وأعد الإرسال.']
  },
  status(s){ return Requests.LABEL[s] || ['', s || '—', '']; },

  sizeText(bytes){
    const n = Number(bytes) || 0;
    const N = QBANK.views.arNum;
    if (n >= 1024 * 1024) return N((n / 1024 / 1024).toFixed(1)) + ' م.ب';
    return N(Math.max(1, Math.round(n / 1024))) + ' ك.ب';
  },

  /*
    الطلب سطرٌ في القاعدة ومسارٌ في المخزن. نرفع الملف أولًا: لو أُنشئ
    الصفّ ثم سقط الرفع لبقي طلبٌ بلا ملف يفتحه المشرف فلا يجد شيئًا.
  */
  async create(opts){
    const o = opts || {};
    const u = QBANK.api.user();
    if (!u) return { ok:false, error:'سجّل دخولك أولًا' };
    const name = String(o.name || '').trim();
    if (!name) return { ok:false, error:'اكتب اسم المادة' };
    if (!o.file) return { ok:false, error:'اختر ملف الأسئلة' };

    const up = await QBANK.admin.storageUpload(o.file);
    if (!up.ok) return { ok:false, error: up.error };

    const r = await QBANK.api.rest('upload_requests?select=id', {
      method:'POST',
      headers: Object.assign(QBANK.api.headers(), { 'Prefer':'return=representation' }),
      body: JSON.stringify({
        user_id: u.id, name, note: String(o.note || '').trim(),
        storage_path: up.path, filename: o.file.name || '',
        size_bytes: o.file.size || 0, status:'new'
      })
    });
    if (r.ok && r.data && r.data[0]) return { ok:true, id: r.data[0].id };
    return { ok:false, error: (r.data && (r.data.message || r.data.error)) ||
      (r.offline ? 'لا اتصال بالخادم' : 'تعذّر إرسال الطلب — نفّذ db/REQUESTS.sql') };
  },

  mine(){
    const u = QBANK.api.user();
    if (!u) return Promise.resolve({ ok:false, data:[] });
    return QBANK.api.rest('upload_requests?user_id=eq.' + u.id + '&select=*&order=created_at.desc');
  },
  cancel(id){ return QBANK.api.rest('upload_requests?id=eq.' + id, { method:'DELETE' }); },

  adminList(status){ return QBANK.api.rpc('admin_upload_requests', { p_status: status || '' }); },
  setStatus(id, status, subjectId, note){
    return QBANK.api.rpc('admin_request_status',
      { p_id: id, p_status: status, p_subject: subjectId || null, p_note: note || null });
  },
  one(id){ return QBANK.api.rpc('admin_upload_requests', { p_status: '' })
    .then(r => ({ ok: r.ok, data: ((r.ok && Array.isArray(r.data)) ? r.data : []).filter(x => x.id === id)[0] || null })); }
};
QBANK.requests = Requests;

/* ═══ نموذج الطالب: اسم المادة وملفها — لا أكثر ═══ */
function requestForm(onBack){
  const box = el('div', { class:'card stack' });
  const nameIn = el('input', { class:'input', required:'', 'aria-required':'true',
    placeholder:'مثال: فيزيولوجيا الجهاز التنفسي' });
  const noteIn = el('textarea', { class:'input', rows:'2',
    placeholder:'اختياري: اسم الدكتور، الفصل، أي شيء يفيد المشرف' });
  const fileIn = el('input', { type:'file', style:'display:none', 'aria-hidden':'true',
    accept:'.pdf,.docx,.pptx,.txt,.text,.md,.csv,.tsv,.rtf,.html,.htm,.png,.jpg,.jpeg,.webp,.gif,.heic,image/*' });
  const pick = el('button', { class:'btn btn--ghost btn--block', type:'button', text:'اختر ملف الأسئلة' });
  const fileLine = el('p', { class:'field__hint', style:'margin:0', text:'لم يُختر ملف بعد.' });
  const msg = el('p', { class:'field__hint', role:'status' });
  const send = el('button', { class:'btn btn--block', type:'button', text:'أرسل الطلب للمشرف' });

  let file = null;
  pick.addEventListener('click', () => fileIn.click());
  fileIn.addEventListener('change', () => {
    file = fileIn.files && fileIn.files[0];
    fileLine.textContent = file ? (file.name + ' · ' + Requests.sizeText(file.size)) : 'لم يُختر ملف بعد.';
    pick.textContent = file ? 'اختر ملفًا آخر' : 'اختر ملف الأسئلة';
  });

  send.addEventListener('click', async () => {
    msg.className = 'field__hint';
    if (!nameIn.value.trim()){ msg.className = 'field__hint is-bad'; msg.textContent = '⚠ اكتب اسم المادة أولًا.'; nameIn.focus(); return; }
    if (!file){ msg.className = 'field__hint is-bad'; msg.textContent = '⚠ اختر ملف الأسئلة.'; return; }
    send.disabled = true; msg.textContent = '… يُرفع الملف ويُسجَّل طلبك';
    const r = await Requests.create({ name: nameIn.value, note: noteIn.value, file });
    send.disabled = false;
    if (!r.ok){ msg.className = 'field__hint is-bad'; msg.textContent = '⚠ ' + r.error; return; }
    box.innerHTML = '';
    /* ★ الشكر يقول ماذا يحدث بعده: «وصل» وحدها تترك صاحبها ينتظر بلا علم */
    box.appendChild(el('div', { style:'text-align:center' }, [
      el('span', { class:'empty__ico', 'aria-hidden':'true' }, [ QBANK.ico('checkCircle', { size:40, weight:1.6 }) ]),
      el('p', { class:'empty__title', text:'وصل طلبك' }),
      el('p', { class:'empty__text', text:'سيرفعها المشرف بنفسه ويراجع أسئلتها، وتُنشر باسمك أنت — تجدها في «موادي» حين تجهز.' }),
      el('a', { class:'btn btn--block', href:'#/account/uploads', text:'تابع طلبك في موادي' })
    ]));
  });

  box.appendChild(el('h2', { style:'margin:0', text:'أرسلها للمشرف يرفعها عنك' }));
  box.appendChild(el('p', { class:'field__hint', style:'margin:0',
    text:'شيئان فقط: اسم المادة وملفها. المشرف يقرأ الملف ويراجع الأسئلة وينشرها باسمك.' }));
  box.appendChild(el('label', { class:'field', style:'margin:0' }, [
    el('span', { class:'field__label', text:'اسم المادة *' }), nameIn ]));
  box.appendChild(el('label', { class:'field', style:'margin:0' }, [
    el('span', { class:'field__label', text:'ملف الأسئلة * — PDF أو Word أو نص أو صور' }), pick, fileLine ]));
  box.appendChild(fileIn);
  box.appendChild(el('label', { class:'field', style:'margin:0' }, [
    el('span', { class:'field__label', text:'ملاحظة للمشرف' }), noteIn ]));
  box.appendChild(send);
  box.appendChild(msg);
  if (onBack){
    const back = el('button', { class:'btn btn--ghost btn--block', type:'button', text:'← أرفعها بنفسي' });
    back.addEventListener('click', onBack);
    box.appendChild(back);
  }
  return box;
}

/* ═══ دعوة الخيار الثاني — تظهر في معالج الرفع ═══ */
function requestInvite(onPick){
  const b = el('button', { class:'btn btn--soft btn--block', type:'button',
    text:'✉ أو أرسلها للمشرف يرفعها عنك' });
  b.addEventListener('click', onPick);
  return el('div', { class:'card stack reqinvite' }, [
    el('p', { style:'margin:0', text:'لا وقت للمراجعة؟' }),
    el('p', { class:'field__hint', style:'margin:0',
      text:'أرسل اسم المادة وملفها، والمشرف يرفعها ويراجعها بنفسه — وتبقى المادة باسمك ولك عائدها.' }),
    b
  ]);
}

/* ═══ «طلباتي» في حساب الطالب ═══ */
function myRequestsCard(){
  const box = el('div', { class:'card stack', hidden:true }, [
    el('h2', { style:'margin:0', text:'طلباتي عند المشرف' })
  ]);
  Requests.mine().then(r => {
    if (!alive() || !box.isConnected) return;
    const rows = (r.ok && Array.isArray(r.data)) ? r.data : [];
    if (!rows.length) return;
    box.hidden = false;
    rows.forEach(q => {
      const st = Requests.status(q.status);
      const row = el('div', { class:'up-row' }, [
        el('span', { class:'up-row__ico', 'aria-hidden':'true' }, [ QBANK.ico('message', { size:18 }) ]),
        el('span', { class:'up-row__x' }, [
          el('span', { class:'up-row__t', text: q.name }),
          el('span', { class:'up-row__s', text: st[2] + (q.admin_note ? ' — ' + q.admin_note : '') })
        ]),
        el('span', { class:'badge ' + st[0], text: st[1] }),
        (q.status === 'done' && q.subject_id)
          ? el('a', { class:'btn btn--sm btn--soft', href:'#/subject/' + q.subject_id, text:'افتحها' })
          : null
      ]);
      /* الإلغاء ما دام في الطابور: من أرسل ملفًا خطأً لا يُترك ينتظر رفضه */
      if (q.status === 'new'){
        const x = el('button', { class:'btn btn--sm btn--ghost', type:'button',
          text:'ألغِ', 'aria-label':'ألغِ طلب ' + q.name });
        let armed = false;
        x.addEventListener('click', async () => {
          if (!armed){ armed = true; x.textContent = 'اضغط ثانيةً للإلغاء'; x.className = 'btn btn--sm btn--danger'; return; }
          const d = await Requests.cancel(q.id);
          QBANK.toast(d.ok ? 'أُلغي الطلب' : 'تعذّر الإلغاء');
          if (d.ok) row.remove();
        });
        row.appendChild(x);
      }
      box.appendChild(row);
    });
  });
  return box;
}

/* ═══ طابور الطلبات في اللوحة ═══ */
function adminRequestsPanel(){
  const box = el('div', { class:'ad-panel', hidden:true });
  const head = el('div', { class:'ad-panel__h' }, [
    el('h2', { class:'ad-panel__t', text:'طلبات رفع مادة' }),
    el('span', { class:'ad-panel__s', text:'طلاب أرسلوا ملفاتهم ليرفعها المشرف' })
  ]);
  const list = el('div', { class:'ad-table' });
  box.appendChild(head); box.appendChild(list);

  function load(){
    Requests.adminList('').then(r => {
      if (!alive() || !box.isConnected) return;
      const all = (r.ok && Array.isArray(r.data)) ? r.data : [];
      /* المنتهية لا تزاحم: الطابور هو ما ينتظر عملًا */
      const rows = all.filter(x => x.status === 'new' || x.status === 'doing');
      if (!rows.length){ box.hidden = true; return; }
      box.hidden = false;
      head.querySelector('.ad-panel__s').textContent =
        QBANK.views.arNum(rows.length) + ' ينتظر — الملف عند المشرف والمادة باسم صاحبها';
      list.innerHTML = '';
      rows.forEach(q => list.appendChild(requestRow(q, load)));
    });
  }
  load();
  return box;
}

function requestRow(q, refresh){
  const st = Requests.status(q.status);
  const who = q.student || 'طالب بلا اسم';
  const meta = [ who, q.university, q.filename ? q.filename + ' · ' + Requests.sizeText(q.size_bytes) : null,
                 'منذ ' + QBANK.admin.charts.ago(q.created_at) ].filter(Boolean).join(' · ');

  const msg = el('p', { class:'field__hint', style:'margin:0', role:'status' });
  /* ★ «ارفعها الآن» يفتح المعالج جاهزًا: الاسم والرافع والملف — بلا إعادة كتابة */
  const go = el('a', { class:'btn btn--sm', href:'#/admin/upload?req=' + q.id, text:'⇪ ارفعها الآن' });

  const rej = el('button', { class:'btn btn--sm btn--ghost', type:'button', text:'ارفض' });
  let armed = false;
  rej.addEventListener('click', async () => {
    if (!armed){ armed = true; rej.textContent = 'اضغط ثانيةً للرفض'; rej.className = 'btn btn--sm btn--danger'; return; }
    const note = (typeof prompt === 'function' ? prompt('سبب الرفض — يراه صاحب الطلب:', 'الملف غير واضح') : '') || '';
    const r = await Requests.setStatus(q.id, 'rejected', null, note);
    QBANK.toast(r.ok ? 'رُفض الطلب' : 'تعذّر التعديل');
    if (r.ok && refresh) refresh();
  });

  return el('div', { class:'ad-row', style:'cursor:default;flex-wrap:wrap' }, [
    el('span', { class:'ad-row__main' }, [
      el('span', { class:'ad-row__t', text: q.name }),
      el('span', { class:'ad-row__s', text: meta })
    ]),
    el('span', { class:'badge ' + st[0], text: q.status === 'new' ? 'جديد' : 'قيد الرفع' }),
    go, rej,
    q.note ? el('span', { class:'ad-sub', style:'flex:1 0 100%' }, [
      el('span', { class:'field__hint', text:'ملاحظته: ' + q.note }) ]) : null,
    msg
  ]);
}

QBANK.views.requestForm    = requestForm;
QBANK.views.requestInvite  = requestInvite;
QBANK.views.myRequestsCard = myRequestsCard;
QBANK.views.adminRequestsPanel = adminRequestsPanel;
