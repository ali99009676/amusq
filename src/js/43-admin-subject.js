/*
  محرر المادة — كل ما يخصّ مادة واحدة في شاشة واحدة: هويتها، محاورها، وأسئلتها.

  قرار جوهري: نصّ السؤال وخياراته لا يُعدَّلان هنا ولا في أي مكان (قاعدة القداسة).
  ما يملك المشرف تعديله هو ما أضفناه نحن حول النص: موضع الإجابة، المحور، الشرح،
  الترجمة، بطاقة الحفظ، علامة الأهمية، والترتيب. الخطأ في نصّ الدكتور يُصلَح
  برفع الملف من جديد لا بالكتابة فوقه.
*/
const SUBJ_COLORS = ['subject-1','subject-2','subject-3','subject-4','subject-5','subject-6'];
const SUBJ_ICONS  = ['▤','☤','✚','♥','◈','⚕','☣','◐','⌁','⚗'];

const SubjEditor = {
  patchSubject(id, body){
    return AMUSQ.api.rest('subjects?id=eq.' + id, { method:'PATCH', body: JSON.stringify(body) });
  },
  patchQuestion(id, body){
    return AMUSQ.api.rest('questions?id=eq.' + id, { method:'PATCH', body: JSON.stringify(body) });
  },
  delQuestion(id){
    return AMUSQ.api.rest('questions?id=eq.' + id, { method:'DELETE' });
  },
  /* تصفية محلية: البحث في مادة واحدة لا يستحق ذهابًا إلى الخادم مع كل حرف */
  filter(list, q, topic, only){
    const needle = String(q || '').trim().toLowerCase();
    return list.filter(x => {
      if (topic && (x.topic || '') !== topic) return false;
      if (only === 'important' && !x.important) return false;
      if (only === 'derived'   && !x.derived)   return false;
      if (only === 'noexpl'    && x.expl_ar)    return false;
      if (!needle) return true;
      return (x.q + ' ' + (x.options || []).join(' ')).toLowerCase().indexOf(needle) !== -1;
    });
  }
};

/* ===== بطاقة هوية المادة ===== */
function subjIdentity(sub, refresh){
  const nameIn  = el('input', { class:'input', value: sub.name || '' });
  const descrIn = el('textarea', { class:'input', rows:'2' }); descrIn.value = sub.descr || '';
  const ordIn   = el('input', { class:'input', type:'number', value: String(sub.ord || 0), 'aria-label':'ترتيب المادة' });
  const dateIn  = el('input', { class:'input', type:'date',
    value: sub.exam_date ? String(sub.exam_date).slice(0,10) : '', 'aria-label':'موعد الاختبار' });

  let color = sub.color || SUBJ_COLORS[0];
  const swatches = el('div', { class:'ad-swatches', role:'radiogroup', 'aria-label':'لون المادة' },
    SUBJ_COLORS.map(c => {
      const b = el('button', { class:'ad-sw', type:'button', role:'radio', 'data-color':c,
        'aria-checked': c === color ? 'true' : 'false', 'aria-label': c,
        style:'background:var(--' + c + ')' });
      b.addEventListener('click', () => {
        color = c;
        swatches.querySelectorAll('.ad-sw').forEach(x =>
          x.setAttribute('aria-checked', x.getAttribute('data-color') === c ? 'true' : 'false'));
      });
      return b;
    }));

  let icon = sub.icon || SUBJ_ICONS[0];
  const icons = el('div', { class:'ad-icons', role:'radiogroup', 'aria-label':'أيقونة المادة' },
    SUBJ_ICONS.map(g => {
      const b = el('button', { class:'ad-ico', type:'button', role:'radio', 'data-ico':g,
        'aria-checked': g === icon ? 'true' : 'false', text:g });
      b.addEventListener('click', () => {
        icon = g;
        icons.querySelectorAll('.ad-ico').forEach(x =>
          x.setAttribute('aria-checked', x.getAttribute('data-ico') === g ? 'true' : 'false'));
      });
      return b;
    }));

  const save = el('button', { class:'btn', type:'button', text:'احفظ الهوية' });
  save.addEventListener('click', async () => {
    const r = await SubjEditor.patchSubject(sub.id, {
      name: nameIn.value.trim() || sub.name, descr: descrIn.value, color, icon,
      ord: parseInt(ordIn.value || '0', 10), exam_date: dateIn.value || null
    });
    AMUSQ.toast(r.ok ? 'حُفظت هوية المادة' : 'تعذّر الحفظ');
    if (r.ok && refresh) refresh();
  });

  const pub = el('button', { class:'btn btn--sm ' + (sub.published ? 'btn--soft' : ''), type:'button',
    text: sub.published ? 'منشورة — أخفِها' : 'مخفية — انشرها' });
  pub.addEventListener('click', async () => {
    const r = await SubjEditor.patchSubject(sub.id, { published: !sub.published });
    AMUSQ.toast(r.ok ? (sub.published ? 'أُخفيت المادة' : 'نُشرت المادة') : 'تعذّر التعديل');
    if (r.ok && refresh) refresh();
  });
  const free = el('button', { class:'btn btn--sm btn--ghost', type:'button',
    text: sub.free ? '★ مجانية للتجربة' : 'اجعلها مجانية' });
  free.addEventListener('click', async () => {
    const r = await SubjEditor.patchSubject(sub.id, { free: !sub.free });
    if (r.ok && refresh) refresh();
  });

  return el('div', { class:'ad-panel' }, [
    el('div', { class:'ad-panel__h' }, [
      el('h2', { class:'ad-panel__t', text:'هوية المادة' }),
      el('span', { class:'ad-panel__s', text: sub.q_count + ' سؤالًا' })
    ]),
    el('div', { class:'ad-edit ad-edit--2' }, [
      el('label', { class:'field', style:'margin:0' }, [ el('span', { class:'field__label', text:'الاسم' }), nameIn ]),
      el('label', { class:'field', style:'margin:0' }, [ el('span', { class:'field__label', text:'موعد الاختبار' }), dateIn ]),
      el('label', { class:'field', style:'margin:0;grid-column:1/-1' }, [ el('span', { class:'field__label', text:'الوصف — يظهر للطالب على البطاقة' }), descrIn ]),
      el('label', { class:'field', style:'margin:0' }, [ el('span', { class:'field__label', text:'اللون' }), swatches ]),
      el('label', { class:'field', style:'margin:0' }, [ el('span', { class:'field__label', text:'الأيقونة' }), icons ]),
      el('label', { class:'field', style:'margin:0' }, [ el('span', { class:'field__label', text:'الترتيب' }), ordIn ])
    ]),
    el('div', { class:'ad-bar', style:'margin:16px 0 0' }, [ save, pub, free ])
  ]);
}

/* ===== المحاور ===== */
function subjTopics(sub, questions, refresh){
  const topics = Array.isArray(sub.topics) ? sub.topics.slice() : [];
  // العدّ من الأسئلة نفسها: يكشف محورًا مكتوبًا في القائمة وليس عليه سؤال واحد
  const counts = {};
  questions.forEach(q => { const t = q.topic || ''; if (t) counts[t] = (counts[t] || 0) + 1; });
  Object.keys(counts).forEach(t => { if (topics.indexOf(t) === -1) topics.push(t); });

  const list = el('div', { class:'stack' });
  function draw(){
    list.innerHTML = '';
    if (!topics.length) { list.appendChild(el('p', { class:'page__sub', text:'لا محاور بعد.' })); return; }
    topics.forEach((t, i) => {
      const up = el('button', { class:'btn btn--sm btn--ghost', type:'button', text:'↑', 'aria-label':'أعلِ ' + t });
      up.addEventListener('click', () => { if (i > 0){ topics.splice(i-1, 0, topics.splice(i,1)[0]); draw(); } });
      const del = el('button', { class:'btn btn--sm btn--ghost', type:'button', text:'✕', 'aria-label':'احذف ' + t });
      del.addEventListener('click', () => {
        if (counts[t]) return AMUSQ.toast('لا يُحذف محور عليه ' + counts[t] + ' سؤالًا — انقلها أولًا');
        topics.splice(i, 1); draw();
      });
      list.appendChild(el('div', { class:'row' }, [
        el('span', { text: t }),
        el('span', { class:'badge num', text: (counts[t] || 0) + ' سؤالًا' }),
        el('span', { class:'spacer' }), up, del
      ]));
    });
  }
  draw();

  const addIn = el('input', { class:'input', placeholder:'اسم محور جديد' });
  const add = el('button', { class:'btn btn--sm', type:'button', text:'أضف' });
  add.addEventListener('click', () => {
    const v = addIn.value.trim();
    if (!v) return;
    if (topics.indexOf(v) !== -1) return AMUSQ.toast('المحور موجود');
    topics.push(v); addIn.value = ''; draw();
  });
  const save = el('button', { class:'btn', type:'button', text:'احفظ المحاور' });
  save.addEventListener('click', async () => {
    const r = await SubjEditor.patchSubject(sub.id, { topics });
    AMUSQ.toast(r.ok ? 'حُفظت المحاور' : 'تعذّر الحفظ');
    if (r.ok && refresh) refresh();
  });

  return el('div', { class:'ad-panel' }, [
    el('div', { class:'ad-panel__h' }, [
      el('h2', { class:'ad-panel__t', text:'المحاور' }),
      el('span', { class:'ad-panel__s', text:'ترتيبها هنا هو ترتيب عرضها للطالب' })
    ]),
    list,
    el('div', { class:'ad-bar', style:'margin:16px 0 0' }, [ addIn, add, save ])
  ]);
}

/* ===== بطاقة سؤال واحد ===== */
function qCard(q, sub, refresh){
  const box = el('div', { class:'ad-q', 'data-qid': q.id });
  const head = el('div', { class:'ad-q__head' }, [
    el('span', { class:'badge num', text:'#' + (q.ord + 1) }),
    q.topic ? el('span', { class:'badge', text: q.topic }) : null,
    q.derived ? el('span', { class:'badge badge--warn', text:'إجابة مستنتجة' }) : null,
    q.opts_built ? el('span', { class:'badge badge--warn', text:'خيارات مبنية' }) : null,
    !q.expl_ar ? el('span', { class:'badge', text:'بلا شرح' }) : null,
    el('span', { class:'spacer' })
  ]);
  const star = el('button', { class:'btn btn--sm btn--ghost', type:'button',
    text: q.important ? '★ مهم' : '☆ علّمه مهمًا', 'aria-pressed': q.important ? 'true' : 'false' });
  star.addEventListener('click', async () => {
    const r = await SubjEditor.patchQuestion(q.id, { important: !q.important });
    if (!r.ok) return AMUSQ.toast('تعذّر التعديل');
    q.important = !q.important;
    star.textContent = q.important ? '★ مهم' : '☆ علّمه مهمًا';
    star.setAttribute('aria-pressed', q.important ? 'true' : 'false');
  });
  head.appendChild(star);

  const more = el('button', { class:'btn btn--sm btn--ghost', type:'button', text:'حرّر' });
  head.appendChild(more);
  box.appendChild(head);

  // النص والخيارات للعرض فقط — لا حقل إدخال عليهما (قاعدة القداسة)
  box.appendChild(el('p', { class:'ad-q__text', text: q.q }));
  const opts = el('div', {});
  (q.options || []).forEach((o, i) => {
    const b = el('button', { class:'ad-q__opt' + (i === q.answer ? ' is-a' : ''), type:'button',
      'data-i': String(i), text: o });
    b.addEventListener('click', async () => {
      if (i === q.answer) return;
      const r = await SubjEditor.patchQuestion(q.id, { answer: i, derived: false });
      if (!r.ok) return AMUSQ.toast('تعذّر تصحيح الإجابة');
      q.answer = i; q.derived = false;
      opts.querySelectorAll('.ad-q__opt').forEach((x, xi) =>
        x.className = 'ad-q__opt' + (xi === i ? ' is-a' : ''));
      AMUSQ.toast('صُحّحت الإجابة');
    });
    opts.appendChild(b);
  });
  box.appendChild(opts);

  // لوح التحرير يُبنى عند الطلب لا مع كل سؤال — القائمة قد تحمل مئات البطاقات
  let panel = null;
  more.addEventListener('click', () => {
    if (panel){ panel.remove(); panel = null; more.textContent = 'حرّر'; return; }
    more.textContent = 'أغلِق';
    const topicSel = el('select', { class:'input' });
    const tops = (Array.isArray(sub.topics) ? sub.topics : []).slice();
    if (q.topic && tops.indexOf(q.topic) === -1) tops.push(q.topic);
    topicSel.appendChild(el('option', { value:'', text:'— بلا محور —' }));
    tops.forEach(t => topicSel.appendChild(el('option', { value:t, text:t, selected: t === q.topic ? 'selected' : null })));
    topicSel.value = q.topic || '';

    const ar = el('textarea', { class:'input', rows:'3' }); ar.value = q.expl_ar || '';
    const en = el('textarea', { class:'input', rows:'2' }); en.value = q.expl_en || '';
    const tr = el('textarea', { class:'input', rows:'2' }); tr.value = q.translation || '';
    const m = q.mnemonic || {};
    const cue  = el('input', { class:'input', value: m.cue || '',  placeholder:'الطُّعم' });
    const key  = el('input', { class:'input', value: m.key || '',  placeholder:'المفتاح' });
    const link = el('input', { class:'input', value: m.link || '', placeholder:'الرابط الذهني' });
    const ordQ = el('input', { class:'input', type:'number', value: String(q.ord), 'aria-label':'ترتيب السؤال' });

    const save = el('button', { class:'btn btn--sm', type:'button', text:'احفظ' });
    save.addEventListener('click', async () => {
      const r = await SubjEditor.patchQuestion(q.id, {
        topic: topicSel.value, expl_ar: ar.value, expl_en: en.value, translation: tr.value,
        mnemonic: { cue: cue.value, key: key.value, link: link.value, strike: m.strike || '' },
        ord: parseInt(ordQ.value || String(q.ord), 10)
      });
      AMUSQ.toast(r.ok ? 'حُفظ السؤال' : 'تعذّر الحفظ');
      if (r.ok && refresh) refresh();
    });

    // الحذف بتأكيد صريح: الضغطة الأولى تحوّل الزر، الثانية تنفّذ
    const del = el('button', { class:'btn btn--sm btn--ghost', type:'button', text:'احذف السؤال' });
    let armed = false;
    del.addEventListener('click', async () => {
      if (!armed){ armed = true; del.textContent = 'اضغط ثانيةً للحذف نهائيًا'; del.className = 'btn btn--sm btn--danger'; return; }
      const r = await SubjEditor.delQuestion(q.id);
      AMUSQ.toast(r.ok ? 'حُذف السؤال' : 'تعذّر الحذف');
      if (r.ok){ if (refresh) refresh(); else box.remove(); }
    });

    panel = el('div', { class:'ad-edit ad-edit--2', style:'margin-top:12px' }, [
      el('label', { class:'field', style:'margin:0' }, [ el('span', { class:'field__label', text:'المحور' }), topicSel ]),
      el('label', { class:'field', style:'margin:0' }, [ el('span', { class:'field__label', text:'الترتيب' }), ordQ ]),
      el('label', { class:'field', style:'margin:0;grid-column:1/-1' }, [ el('span', { class:'field__label', text:'الشرح بالعربية' }), ar ]),
      el('label', { class:'field', style:'margin:0' }, [ el('span', { class:'field__label', text:'الشرح بالإنجليزية' }), en ]),
      el('label', { class:'field', style:'margin:0' }, [ el('span', { class:'field__label', text:'الترجمة' }), tr ]),
      el('label', { class:'field', style:'margin:0' }, [ el('span', { class:'field__label', text:'بطاقة الحفظ — الطُّعم' }), cue ]),
      el('label', { class:'field', style:'margin:0' }, [ el('span', { class:'field__label', text:'المفتاح' }), key ]),
      el('label', { class:'field', style:'margin:0;grid-column:1/-1' }, [ el('span', { class:'field__label', text:'الرابط الذهني' }), link ]),
      el('div', { class:'ad-bar', style:'grid-column:1/-1;margin:0' }, [ save, el('span', { class:'spacer' }), del ])
    ]);
    box.appendChild(panel);
  });
  return box;
}

/* ===== متصفح الأسئلة ===== */
function subjQuestions(sub, questions, refresh){
  const search = el('input', { class:'input', type:'search', placeholder:'ابحث في نص السؤال أو خياراته…' });
  const topicSel = el('select', { class:'input', 'aria-label':'تصفية بالمحور' });
  topicSel.appendChild(el('option', { value:'', text:'كل المحاور' }));
  const seen = {};
  questions.forEach(q => { if (q.topic && !seen[q.topic]){ seen[q.topic] = 1;
    topicSel.appendChild(el('option', { value:q.topic, text:q.topic })); } });
  const onlySel = el('select', { class:'input', 'aria-label':'تصفية بالحالة' });
  [['','كل الأسئلة'],['important','المهمة فقط'],['derived','إجابة مستنتجة'],['noexpl','بلا شرح']]
    .forEach(o => onlySel.appendChild(el('option', { value:o[0], text:o[1] })));

  const count = el('span', { class:'ad-panel__s' });
  const list = el('div', { class:'stack', style:'margin-top:12px' });
  let shown = 40;   // نرسم دفعة أولى فقط: مادة فيها ٣٠٠ سؤال لا تُرسم كلها على جوال

  function draw(){
    const res = SubjEditor.filter(questions, search.value, topicSel.value, onlySel.value);
    count.textContent = res.length + ' من ' + questions.length + ' سؤالًا';
    list.innerHTML = '';
    res.slice(0, shown).forEach(q => list.appendChild(qCard(q, sub, refresh)));
    if (res.length > shown){
      const more = el('button', { class:'btn btn--block btn--soft', type:'button',
        text:'اعرض ' + Math.min(40, res.length - shown) + ' سؤالًا آخر' });
      more.addEventListener('click', () => { shown += 40; draw(); });
      list.appendChild(more);
    }
    if (!res.length) list.appendChild(AMUSQ.views.empty('⌕', 'لا نتائج', 'جرّب كلمة أخرى أو أزل التصفية.'));
  }
  [search, topicSel, onlySel].forEach(x =>
    x.addEventListener('input', () => { shown = 40; draw(); }));
  draw();

  return el('div', { class:'ad-panel' }, [
    el('div', { class:'ad-panel__h' }, [
      el('h2', { class:'ad-panel__t', text:'الأسئلة' }), count
    ]),
    el('p', { class:'page__sub', style:'margin-top:0',
      text:'نصّ السؤال وخياراته لا يُعدَّلان — يُصحَّح الخطأ برفع الملف من جديد. اضغط خيارًا لتجعله الإجابة الصحيحة.' }),
    el('div', { class:'ad-bar' }, [ search, topicSel, onlySel ]),
    list
  ]);
}

/* ===== الشاشة ===== */
const AdminSubjectView = {
  title:'محرر المادة',
  view(route){
    if (!AMUSQ.api.user()) return AMUSQ.views.ViewAdminLogin.view();
    const id = route.rest[0];
    if (!id) return AMUSQ.views.ViewNotFound.view();

    const body = el('div', { class:'stack' }, [ el('p', { class:'page__sub', text:'جارٍ الجلب…' }) ]);
    function load(){
      Promise.all([
        AMUSQ.api.rest('subjects?id=eq.' + id + '&select=*'),
        AMUSQ.api.rest('questions?subject_id=eq.' + id + '&select=*&order=ord')
      ]).then(([sr, qr]) => {
        if (!body.isConnected) return;
        const sub = (sr.ok && sr.data && sr.data[0]) || null;
        body.innerHTML = '';
        if (!sub){
          body.appendChild(AMUSQ.views.empty('⚠', 'لم نجد المادة', 'ربما حُذفت، أو حسابك ليس مشرفًا.'));
          return;
        }
        const questions = (qr.ok && Array.isArray(qr.data)) ? qr.data : [];
        body.appendChild(subjIdentity(sub, load));
        body.appendChild(subjTopics(sub, questions, load));
        body.appendChild(subjQuestions(sub, questions, load));
      });
    }
    load();

    const back = el('a', { class:'btn btn--sm btn--ghost', href:'#/admin/content', text:'→ كل المواد' });
    return AMUSQ.views.page('محرر المادة', 'الهوية والمحاور والأسئلة في مكان واحد.', [back, body]);
  }
};

AMUSQ.admin.subject = SubjEditor;
AMUSQ.views.ViewAdminSubject = AdminSubjectView;
