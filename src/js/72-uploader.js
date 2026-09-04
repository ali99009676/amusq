/*
  ═══════════════════════════════════════════════════════════════════
  الرافع — إسناد المادة لطالب، والعودة إليها قبل النشر
  ═══════════════════════════════════════════════════════════════════
  علي يستلم بنوك الأسئلة من الطلاب على واتساب ويرفعها بنفسه. فكانت كل
  مادة تُنسب إليه: اسمه عليها، ومدّة الرافع له، وعائدها له — والطالب الذي
  جمع الأسئلة لا أثر له. هنا يختار المشرف اسم الطالب فتُكتب المادة باسمه
  كما لو رفعها بيده.

  والرفع لم يكن طريقًا ذا عودة: من أغلق الصفحة في منتصفه لم يجد مسوّدته
  إلا إن كان مشرفًا، ومن ضغط «احفظ مخفية» لم يجد بابًا يعود منه ليراجع
  أسئلته وينشرها. فصار لكلٍّ بابه: «مسوّداتي» تُستأنف، والمخفية تُفتح في
  محرّرها.

  ★ الحكم في القاعدة لا هنا: من يعدّل ومتى تقرّره سياسات UPLOADER.sql
  وقادحاه. الواجهة تُخفي ما لا يُسمح به كي لا تعِد بما سيُرفض.
*/
const Uploader = {
  isAdmin(){ return !!(QBANK.store.get('is_admin_check', {}) || {}).ok; },

  /* بحث الطلاب بالاسم أو الإيميل — الدالة نفسها ترفض غير المشرف */
  search(q){ return QBANK.api.rpc('admin_students_pro', { p_search: String(q || '').trim(), p_limit: 12 }); },

  /* اسم صاحب المادة — public_profile عامة، فتصلح للمشرف والطالب والزائر */
  async nameOf(uid){
    if (!uid) return '';
    const r = await QBANK.api.rpc('public_profile', { p_user: uid });
    return (r.ok && r.data && r.data.name) ? String(r.data.name) : '';
  },

  /* الإسناد يمنح ما يمنحه الرفع: المالك ومدّته معًا (دالة القاعدة) */
  setUploader(subjectId, userId){
    return QBANK.api.rpc('admin_set_uploader', { p_subject: subjectId, p_user: userId });
  },

  /* المسوّدات غير المعتمدة: لي — أو كلها للمشرف إن لم يُطلب «لي» فقط */
  myDrafts(onlyMine){
    const u = QBANK.api.user();
    if (!u) return Promise.resolve({ ok:false, data:[] });
    let path = 'drafts?select=id,name,status,total,done,updated_at,created_by&status=neq.approved&order=updated_at.desc';
    if (onlyMine || !Uploader.isAdmin()) path += '&created_by=eq.' + u.id;
    return QBANK.api.rest(path);
  },

  /*
    هل يملك هذا المستخدم تعديل هذه المادة الآن؟ — الحكم نفسه الذي تحكم
    به القاعدة (subjects_owner_guard): المشرف دائمًا، والمالك قبل النشر،
    وبعده إن فتح له المشرف المفتاح.
  */
  canEdit(sub, u){
    if (Uploader.isAdmin()) return true;
    if (!u || !sub || sub.created_by !== u.id) return false;
    return !sub.published || !!sub.owner_edit;
  },
  LOCK_TEXT: 'المادة منشورة — التعديل بعد النشر بإذن المشرف',

  /* سطر حال المسوّدة كما يقرؤه صاحبها */
  draftLine(d){
    const N = QBANK.views.arNum;
    if (d.status === 'reviewing') return 'جاهزة للمراجعة والنشر — ' + N(d.total || 0) + ' سؤالًا';
    if (d.status === 'hidden')    return 'حُفظت مخفية';
    return 'قُرئ ' + N(d.done || 0) + ' من ' + N(d.total || 0) + ' — أكمل من حيث توقفت';
  }
};
QBANK.uploader = Uploader;

/* ═══ منتقي الطالب ═══
   حقل بحث واحد ونتائج تحته — لا قائمة منسدلة بمئات الأسماء. المختار يظهر
   شريحةً فوق الحقل، و«أنا» صفٌّ أول دائمًا كي لا يحتاج المشرف بحثًا ليعود
   إلى نفسه. */
function uploaderPick(opts){
  const o = opts || {};
  const me = o.me || null;
  let value = o.value || null;

  const box  = el('div', { class:'spick' });
  const cur  = el('span', { class:'spick__cur', text: value ? (value.name || '…') : (me ? me.name : 'بلا رافع') });
  const chg  = el('button', { class:'btn btn--sm btn--ghost', type:'button', text: o.collapsed ? 'غيّر' : 'اختر طالبًا' });
  const head = el('div', { class:'spick__head' }, [ el('span', { class:'spick__l', text:'رفعها:' }), cur, chg ]);
  const inp  = el('input', { class:'input', type:'search', placeholder:'ابحث باسم الطالب أو إيميله…',
    'aria-label':'ابحث عن الطالب الرافع' });
  const list = el('div', { class:'spick__list', role:'listbox', 'aria-label':'نتائج البحث' });
  const pane = el('div', { class:'spick__pane', hidden: !!o.collapsed }, [ inp, list ]);
  box.appendChild(head); box.appendChild(pane);

  /* الاسم يُجلب إن جاء المعرّف وحده — كما عند استئناف مسوّدة مُسندة */
  if (value && !value.name) Uploader.nameOf(value.id).then(n => { if (alive()){ value.name = n || 'طالب'; cur.textContent = value.name; } });

  const pick = v => {
    value = v;
    cur.textContent = v ? (v.name || 'طالب') : (me ? me.name : 'بلا رافع');
    pane.hidden = true; chg.textContent = 'غيّر';
    if (o.onPick) o.onPick(v);
  };
  chg.addEventListener('click', () => { pane.hidden = !pane.hidden; if (!pane.hidden) inp.focus(); });

  function row(x, isMe){
    const b = el('button', { class:'spick__row', type:'button', role:'option', 'data-uid': x.id }, [
      el('span', { class:'spick__av', 'aria-hidden':'true', text: x.avatar || '👤' }),
      el('span', { class:'spick__x' }, [
        el('span', { class:'spick__n', text: isMe ? x.name : (x.name || 'طالب بلا اسم') }),
        isMe ? null : el('span', { class:'spick__s', text: [x.email, x.university].filter(Boolean).join(' · ') })
      ])
    ]);
    b.addEventListener('click', () => pick(isMe ? null : { id: x.id, name: x.name || 'طالب بلا اسم' }));
    return b;
  }
  function draw(rows, q){
    list.innerHTML = '';
    if (me) list.appendChild(row(me, true));
    rows.forEach(x => { if (!me || x.id !== me.id) list.appendChild(row(x, false)); });
    if (!rows.length && q) list.appendChild(el('p', { class:'field__hint spick__empty', text:'لا طالب بهذا الاسم — جرّب جزءًا من الإيميل.' }));
  }
  let t = null, seq = 0;
  const run = () => {
    const q = inp.value.trim();
    const mine = ++seq;
    Uploader.search(q).then(r => {
      if (mine !== seq || !alive()) return;
      const rows = (r.ok && Array.isArray(r.data)) ? r.data : [];
      draw(rows, q);
    });
  };
  inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 250); });
  draw([], '');
  /* أول فتح: أحدث الطلاب بلا كتابة — غالبًا من أرسل بنكه هو آخر من سجّل */
  run();
  return box;
}

/* ═══ حقل الرافع في محرّر المشرف ═══ */
function uploaderField(sub, refresh){
  const u = QBANK.api.user() || {};
  const box = el('div', { class:'field spick-field', style:'margin:0;grid-column:1/-1' });
  box.appendChild(el('span', { class:'field__label', text:'الرافع — يظهر اسمه على المادة، وله مدّة الرافع وعائدها' }));

  const value = sub.created_by ? { id: sub.created_by, name: sub.created_by === u.id ? 'أنا (المشرف)' : '' } : null;
  const msg = el('p', { class:'field__hint', role:'status', style:'margin:4px 0 0' });
  box.appendChild(uploaderPick({
    value, collapsed:true, me: { id: u.id, name:'أنا (المشرف)' },
    onPick: async v => {
      const target = v ? v.id : u.id;
      if (target === sub.created_by) return;
      msg.textContent = '… يُسند';
      const r = await Uploader.setUploader(sub.id, target);
      const ok = r.ok && r.data && r.data.ok;
      msg.textContent = ok ? '' : '⚠ ' + ((r.data && (r.data.message || r.data.error)) || 'تعذّر الإسناد');
      QBANK.toast(ok ? 'أُسندت المادة إلى ' + (v ? v.name : 'حسابك') : 'تعذّر الإسناد');
      if (ok && refresh) refresh();
    }
  }));

  /*
    ★ مفتاح ما بعد النشر بيد المشرف.
    قبل النشر يعدّل الرافع مادته بحرّية — هي مسوّدته. وبعد النشر يذاكر منها
    آخرون، فتغييرُ إجابةٍ يغيّر ما حفظوه. فالافتراض قفلٌ، والمشرف يفتحه لمن
    يثق به — والقاعدة تحرس المفتاح لا الواجهة.
  */
  const tog = el('button', { class:'btn btn--sm ' + (sub.owner_edit ? 'btn--soft' : 'btn--ghost'), type:'button',
    'aria-pressed': sub.owner_edit ? 'true' : 'false',
    text: sub.owner_edit ? '✓ الرافع يعدّل بعد النشر — أقفله' : 'اسمح للرافع بالتعديل بعد النشر' });
  tog.addEventListener('click', async () => {
    const r = await QBANK.admin.subject.patchSubject(sub.id, { owner_edit: !sub.owner_edit });
    QBANK.toast(r.ok ? (sub.owner_edit ? 'أُقفل التعديل على الرافع' : 'فُتح التعديل للرافع') : 'تعذّر التعديل');
    if (r.ok && refresh) refresh();
  });
  box.appendChild(el('div', { class:'row', style:'margin-top:8px' }, [ tog ]));
  box.appendChild(el('p', { class:'field__hint', style:'margin:4px 0 0', text:
    !sub.published ? 'قبل النشر: الرافع يعدّل مادته بحرّية من «موادي» في حسابه.'
    : sub.owner_edit ? 'الرافع يستطيع الآن تعديل الأسئلة والهوية وإخفاء المادة.'
    : 'التعديل الآن للمشرف وحده — الرافع يرى مادته ولا يعدّلها.' }));
  box.appendChild(msg);
  return box;
}

/* ═══ لافتة الاستئناف في أول المعالج ═══
   من عاد إلى «ارفع» ومعه مسوّدة لم تكتمل يجدها قبل أن يبدأ من الصفر. */
function resumeBanner(){
  const box = el('div', { class:'card stack resume', hidden:true });
  const cur = QBANK.views.ViewUpload && QBANK.views.ViewUpload._get ? QBANK.views.ViewUpload._get() : null;
  const base = (typeof location !== 'undefined' && String(location.hash).indexOf('#/admin') === 0) ? '#/admin/upload' : '#/upload';
  Uploader.myDrafts(true).then(r => {
    if (!alive() || !box.isConnected) return;
    const rows = ((r.ok && Array.isArray(r.data)) ? r.data : []).filter(d => !cur || d.id !== cur.draftId);
    if (!rows.length) return;
    box.hidden = false;
    box.appendChild(el('h3', { class:'resume__t', text: rows.length === 1 ? 'لديك مسوّدة لم تكتمل' : 'لديك مسوّدات لم تكتمل' }));
    rows.slice(0, 5).forEach(d => box.appendChild(el('div', { class:'resume__row' }, [
      el('span', { class:'resume__x' }, [
        el('span', { class:'resume__n', text: d.name || 'بلا اسم' }),
        el('span', { class:'resume__s', text: Uploader.draftLine(d) + ' · ' + QBANK.admin.charts.ago(d.updated_at) })
      ]),
      el('a', { class:'btn btn--sm btn--soft', href: base + '?draft=' + d.id, text:'أكمل' })
    ])));
  });
  return box;
}

/* ═══ «مسوّداتي» في حساب الطالب ═══ */
function myDraftsCard(){
  const box = el('div', { class:'card stack', hidden:true }, [
    el('h2', { style:'margin:0', text:'مسوّداتي — لم تُنشر بعد' }),
    el('p', { class:'field__hint', style:'margin:0', text:'ما توقّف رفعه محفوظ هنا — أكمله متى شئت.' })
  ]);
  Uploader.myDrafts(true).then(r => {
    if (!alive() || !box.isConnected) return;
    const rows = (r.ok && Array.isArray(r.data)) ? r.data : [];
    if (!rows.length) return;
    box.hidden = false;
    rows.forEach(d => box.appendChild(el('div', { class:'up-row' }, [
      el('span', { class:'up-row__ico', 'aria-hidden':'true' }, [ QBANK.ico('upload', { size:18 }) ]),
      el('span', { class:'up-row__x' }, [
        el('span', { class:'up-row__t', text: d.name || 'بلا اسم' }),
        el('span', { class:'up-row__s', text: Uploader.draftLine(d) })
      ]),
      el('a', { class:'btn btn--sm btn--soft', href:'#/upload?draft=' + d.id, text:'أكمل' })
    ])));
  });
  return box;
}

/* ═══ شريط حال المادة في محرّر المالك ═══ */
function ownerStatus(sub, refresh){
  const u = QBANK.api.user() || {};
  const can = Uploader.canEdit(sub, u);
  const N = QBANK.views.arNum;
  const msg = el('p', { class:'field__hint', role:'status', style:'margin:0' });
  const acts = el('div', { class:'row' });

  if (!sub.published){
    const pub = el('button', { class:'btn', type:'button', text:'انشر للطلاب' });
    pub.addEventListener('click', async () => {
      if (!Number(sub.q_count)) return void (msg.textContent = '⚠ المادة بلا أسئلة — لا يُنشر بنك فارغ.');
      pub.disabled = true; msg.textContent = '… يُنشر';
      const r = await QBANK.admin.subject.patchSubject(sub.id, { published: true });
      pub.disabled = false;
      if (!r.ok) return void (msg.textContent = '⚠ ' + ((r.data && r.data.message) || 'تعذّر النشر'));
      try { await QBANK.data.refreshPack(); } catch(e){ /* القائمة تُجدَّد لاحقًا */ }
      QBANK.toast('نُشرت «' + sub.name + '»');
      if (refresh) refresh();
    });
    acts.appendChild(pub);
  } else {
    acts.appendChild(el('a', { class:'btn btn--sm btn--soft', href:'#/subject/' + sub.id, text:'افتح صفحة المادة' }));
    if (can){
      const hide = el('button', { class:'btn btn--sm btn--ghost', type:'button', text:'أخفِها عن الطلاب' });
      hide.addEventListener('click', async () => {
        const r = await QBANK.admin.subject.patchSubject(sub.id, { published: false });
        QBANK.toast(r.ok ? 'أُخفيت المادة' : 'تعذّر الإخفاء');
        if (r.ok) { try { await QBANK.data.refreshPack(); } catch(e){} if (refresh) refresh(); }
      });
      acts.appendChild(hide);
    }
  }

  return el('div', { class:'card stack ownerbar' + (can ? '' : ' is-locked') }, [
    el('div', { class:'row' }, [
      sub.published ? el('span', { class:'badge badge--ok', text:'منشورة' })
                    : el('span', { class:'badge badge--warn', text:'مخفية — لا يراها أحد غيرك' }),
      el('span', { class:'badge num', text: N(sub.q_count || 0) + ' سؤالًا' }),
      can ? null : el('span', { class:'badge', text:'🔒 مقفلة' })
    ]),
    el('p', { style:'margin:0', text:
      !sub.published ? 'راجع الأسئلة وصحّح ما يلزم، ثم انشر. قبل النشر كل شيء بيدك.'
      : can ? 'المشرف فتح لك التعديل بعد النشر — ما تحفظه يصل الطلاب فورًا.'
      : Uploader.LOCK_TEXT + '. تستطيع وسم الأسئلة بـ«اختبار سابق» من صفحة المادة، ولطلب تعديلٍ تواصل مع المشرف.' }),
    acts, msg
  ]);
}

/* ═══ محرّر المالك: #/edit/<id> ═══
   محرّر المشرف نفسه (الهوية، التحليل، المحاور، الأسئلة) بلا ما لا يملكه
   الرافع: السعر والتوثيق والإسناد. مكوّنات واحدة لا نسختان تتباعدان. */
const ViewOwnerEdit = {
  title:'محرّر مادتي',
  view(route){
    const u = QBANK.api.user();
    if (!u) return QBANK.views.ViewLogin.view();
    const id = route.rest[0];
    if (!id) return QBANK.views.ViewNotFound.view();

    const body = el('div', { class:'stack' }, [ el('p', { class:'page__sub', text:'جارٍ الجلب…' }) ]);
    function load(){
      Promise.all([
        QBANK.api.rest('subjects?id=eq.' + id + '&select=*'),
        QBANK.api.rest('questions?subject_id=eq.' + id + '&select=*&order=ord')
      ]).then(([sr, qr]) => {
        if (!body.isConnected) return;
        const sub = (sr.ok && sr.data && sr.data[0]) || null;
        body.innerHTML = '';
        if (!sub){
          body.appendChild(QBANK.views.empty('⚠', 'لم نجد المادة', 'ربما حُذفت، أو ليست من رفعك.'));
          return;
        }
        if (sub.created_by !== u.id && !Uploader.isAdmin()){
          body.appendChild(QBANK.views.empty('⚠', 'هذه ليست مادتك', 'لا يعدّل المادة إلا من رفعها أو المشرف.'));
          return;
        }
        const questions = (qr.ok && Array.isArray(qr.data)) ? qr.data : [];
        body.appendChild(ownerStatus(sub, load));
        if (!Uploader.canEdit(sub, u)) return;
        body.appendChild(QBANK.views.subjIdentity(sub, load, { owner:true }));
        body.appendChild(QBANK.views.subjContent(sub, load));
        body.appendChild(QBANK.views.subjTopics(sub, questions, load));
        body.appendChild(QBANK.views.subjQuestions(sub, questions, load));
      });
    }
    load();
    const back = el('a', { class:'btn btn--sm btn--ghost', href:'#/account/uploads', text:'→ موادي' });
    return QBANK.views.page('محرّر مادتي', 'راجع أسئلتك وصحّح إجاباتها ثم انشر.', [back, body]);
  }
};

/* المسار يُسجَّل هنا لا في 40-app: الملف مستقلّ، والموجّه يقبل الإضافة في أي وقت قبل أول رسم */
QBANK.router.add('#/edit', ViewOwnerEdit);
QBANK.views.ViewOwnerEdit = ViewOwnerEdit;
QBANK.views.uploaderPick  = uploaderPick;
QBANK.views.uploaderField = uploaderField;
QBANK.views.resumeBanner  = resumeBanner;
QBANK.views.myDraftsCard  = myDraftsCard;
QBANK.views.ownerStatus   = ownerStatus;
