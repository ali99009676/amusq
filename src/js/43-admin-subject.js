/*
  محرر المادة — كل ما يخصّ مادة واحدة في شاشة واحدة: هويتها، محاورها،
  محتواها التحليلي، وأسئلتها.

  قاعدة القداسة تخصّ الآلة: لا يجوز لنموذجٍ أو خط معالجة أن يغيّر حرفًا من
  نص الدكتور. أما المشرف البشري فمالك القرار — يحرّر النص والخيارات بوعي،
  خلف بابٍ صريح يذكّره أن ما يكتبه يصبح هو «الأصل» الذي يذاكر منه الجميع.
*/
const SUBJ_COLORS = ['subject-1','subject-2','subject-3','subject-4','subject-5','subject-6'];
const SUBJ_ICONS  = ['▤','☤','✚','♥','◈','⚕','☣','◐','⌁','⚗'];

const SubjEditor = {
  patchSubject(id, body){
    return QBANK.api.rest('subjects?id=eq.' + id, { method:'PATCH', body: JSON.stringify(body) });
  },
  patchQuestion(id, body){
    return QBANK.api.rest('questions?id=eq.' + id, { method:'PATCH', body: JSON.stringify(body) });
  },
  delQuestion(id){
    return QBANK.api.rest('questions?id=eq.' + id, { method:'DELETE' });
  },
  /* ★ سؤال جديد يدويًا: المشرف مؤلّف أيضًا لا ناقلًا فقط.
     يُوسم أنه من تأليف المنصة (derived=false، بلا وسم قداسة) وq_count
     يتزامن بقادح القاعدة فلا نلمسه. */
  addQuestion(subjectId, ord){
    return QBANK.api.rest('questions', { method:'POST', body: JSON.stringify({
      subject_id: subjectId, ord: ord,
      q: 'سؤال جديد — حرّر نصّه', options: ['الخيار الأول','الخيار الثاني','الخيار الثالث','الخيار الرابع'],
      answer: 0, derived: false, important: false,
      expl_ar:'', expl_en:'', translation:'', mnemonic:{}, topic:''
    }) });
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
/*
  ★ بطاقةٌ واحدة للمشرف وللرافع (opts.owner).
  الرافع يعدّل مادته قبل النشر من محرّره هو، بالمكوّن نفسه لا بنسخةٍ ثانية
  تتباعد مع الوقت — فقط بلا ما لا يملكه: السعر والمجانية والتوثيق والإسناد.
  والقاعدة تحرس ذلك أيضًا؛ الإخفاء هنا كي لا تعِد الشاشة بما سيُرفض.
*/
function subjIdentity(sub, refresh, opts){
  const owner = !!(opts && opts.owner);
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

  /*
    ★ السعر — حقلٌ كان ناقصًا تمامًا.
    العمود في القاعدة منذ البداية، والبوابةُ تقرؤه وتعرضه للطالب، ولا شاشة
    واحدة في المنصة تضبطه. فكل مادة مدفوعة كانت تأخذ سعرها من قيمةٍ كُتبت
    عند الاستيراد ولا سبيل إلى تغييرها إلا بـSQL. ميزةٌ نصفُها مبنيّ: تعمل
    آليّتها ولا يملك أحدٌ مفتاحها.

    والصفر يعني «مجانية» — فالسعر والمجانية وجهان لرقمٍ واحد، ولا نجعلهما
    إعدادين متناقضين يسأل المشرف أيهما يغلب.
  */
  const priceIn = el('input', { class:'input num', type:'number', min:'0', max:'999', step:'1',
    inputmode:'numeric', value: String(sub.price == null ? 0 : sub.price),
    'aria-label':'سعر المادة بالريال' });
  const priceHint = el('p', { class:'field__hint', style:'margin:4px 0 0' });
  const paintPrice = () => {
    const v = parseInt(priceIn.value || '0', 10) || 0;
    priceHint.textContent = v > 0
      ? 'يدفع الطالب ' + QBANK.views.arNum(v) + ' ريالًا لفتحها.'
      : 'صفر = مجانية للجميع.';
  };
  priceIn.addEventListener('input', paintPrice);
  paintPrice();

  /*
    ★ الجامعة والكلية — من اللوحة لا من SQL (بطلب علي).
    المادة بلا جامعة لا تظهر في «استكشف» لأحد، والرافع قد ينسى أو يخطئ.
    قائمتان: الجامعات كلّها (list_universities) ثم كلياتُ المختارة
    (list_colleges)، و«+ جديدة» يكتب اسمًا فتُنشأ إن لم توجد (ensure_*)
    بالمطابقة المعيارية — فلا تتكرّر «جامعة الملك سعود» بهمزةٍ أو بدونها.
  */
  const uniSel = el('select', { class:'input', 'aria-label':'الجامعة' });
  const colSel = el('select', { class:'input', 'aria-label':'الكلية' });
  const uniNew = el('input', { class:'input input--sm', placeholder:'+ جامعة جديدة (اكتب اسمها)', hidden:true });
  const colNew = el('input', { class:'input input--sm', placeholder:'+ كلية جديدة (اكتب اسمها)', hidden:true });
  const uniCountry = el('select', { class:'input input--sm', 'aria-label':'دولة الجامعة الجديدة', hidden:true });
  (QBANK.explore && QBANK.explore.COUNTRIES ? QBANK.explore.COUNTRIES :
    ['SA','EG','JO','AE','KW','QA','BH','OM','IQ','MA','DZ','TN','SD','YE','LY','SY','LB','PS']).forEach(c =>
    uniCountry.appendChild(el('option', { value:c, text: QBANK.explore && QBANK.explore.countryName ? QBANK.explore.countryName(c) : c })));
  const campusHint = el('p', { class:'field__hint', style:'margin:4px 0 0' });
  const fillCols = async (uniId, keep) => {
    colSel.innerHTML = '';
    colSel.appendChild(el('option', { value:'', text:'— بلا كلية —' }));
    if (uniId){
      const r = await QBANK.api.rpc('list_colleges', { p_university: uniId });
      ((r.ok && Array.isArray(r.data)) ? r.data : []).forEach(c =>
        colSel.appendChild(el('option', { value:c.id, text:c.name, selected: c.id === keep ? true : null })));
    }
    colSel.appendChild(el('option', { value:'__new', text:'+ كلية جديدة…' }));
  };
  uniSel.appendChild(el('option', { value:'', text:'جارٍ جلب الجامعات…' }));
  QBANK.api.rpc('list_universities', { q:'', p_country:'' }).then(async r => {
    uniSel.innerHTML = '';
    uniSel.appendChild(el('option', { value:'', text:'— بلا جامعة (لا تظهر في استكشف) —' }));
    ((r.ok && Array.isArray(r.data)) ? r.data : []).forEach(u =>
      uniSel.appendChild(el('option', { value:u.id, text: u.name + (u.country ? ' · ' + u.country : ''),
        selected: u.id === sub.university_id ? true : null })));
    uniSel.appendChild(el('option', { value:'__new', text:'+ جامعة جديدة…' }));
    if (!sub.university_id) campusHint.textContent = 'المادة بلا جامعة الآن — لن يجدها أحد في «استكشف» حتى تُحدَّد.';
    await fillCols(sub.university_id || null, sub.college_id || null);
  });
  uniSel.addEventListener('change', () => {
    const isNew = uniSel.value === '__new';
    uniNew.hidden = !isNew; uniCountry.hidden = !isNew;
    fillCols(isNew ? null : (uniSel.value || null), null);
  });
  colSel.addEventListener('change', () => { colNew.hidden = colSel.value !== '__new'; });
  /* يعيد {university_id, college_id} بعد إنشاء ما يلزم — أو خطأً نصيًا */
  async function resolveCampus(){
    let uni = uniSel.value || null, col = colSel.value || null;
    if (uni === '__new'){
      const nm = uniNew.value.trim();
      if (!nm) return { error:'اكتب اسم الجامعة الجديدة' };
      const r = await QBANK.api.rpc('ensure_university', { p_country: uniCountry.value, p_name: nm });
      if (!r.ok || !r.data) return { error:'تعذّر إنشاء الجامعة' };
      uni = r.data;
    }
    if (col === '__new'){
      const nm = colNew.value.trim();
      if (!uni) return { error:'اختر الجامعة أولًا ثم الكلية' };
      if (!nm) return { error:'اكتب اسم الكلية الجديدة' };
      const r = await QBANK.api.rpc('ensure_college', { p_university: uni, p_name: nm });
      if (!r.ok || !r.data) return { error:'تعذّر إنشاء الكلية' };
      col = r.data;
    }
    if (!uni) col = null;   // كليةٌ بلا جامعة لا معنى لها
    return { university_id: uni, college_id: col };
  }

  const save = el('button', { class:'btn', type:'button', text:'احفظ الهوية' });
  save.addEventListener('click', async () => {
    const campus = await resolveCampus();
    if (campus.error){ campusHint.textContent = '⚠ ' + campus.error; return; }
    /* السعر يُقصّ إلى نطاقٍ معقول قبل الحفظ: حقلُ رقمٍ في متصفح يقبل
       أي شيء، والقيمة السالبة أو الخيالية تُفسد البوابة لا الحقل. */
    const price = Math.max(0, Math.min(999, parseInt(priceIn.value || '0', 10) || 0));
    priceIn.value = String(price); paintPrice();
    const body = {
      name: nameIn.value.trim() || sub.name, descr: descrIn.value, color, icon,
      ord: parseInt(ordIn.value || '0', 10), exam_date: dateIn.value || null,
      university_id: campus.university_id, college_id: campus.college_id
    };
    /* السعر للمشرف وحده — الرافع لا يرسله أصلًا، والقاعدة تعيده لو أُرسل */
    if (!owner){
      body.price = price;
      /* والمجانية تتبع السعر لا تناقضه: صفرٌ يعني مجانية، وأكثرُ منه مدفوعة */
      body.free = price === 0;
    }
    const r = await SubjEditor.patchSubject(sub.id, body);
    QBANK.toast(r.ok ? 'حُفظت هوية المادة'
      : '⚠ ' + ((r.data && r.data.message) || 'تعذّر الحفظ'));
    if (r.ok && refresh) refresh();
  });

  const pub = el('button', { class:'btn btn--sm ' + (sub.published ? 'btn--soft' : ''), type:'button',
    text: sub.published ? 'منشورة — أخفِها' : 'مخفية — انشرها' });
  pub.addEventListener('click', async () => {
    const r = await SubjEditor.patchSubject(sub.id, { published: !sub.published });
    QBANK.toast(r.ok ? (sub.published ? 'أُخفيت المادة' : 'نُشرت المادة') : 'تعذّر التعديل');
    if (r.ok && refresh) refresh();
  });
  /* ★ الزرّ يضبط الرقم لا وسمًا بجانبه: كانا إعدادين مستقلّين، فمادةٌ
     «مجانية» بسعر ٢٩ تخرج لصاحبها بلا أن يعرف أيّهما يغلب. */
  const free = el('button', { class:'btn btn--sm btn--ghost', type:'button',
    text: sub.free ? '★ مجانية للتجربة' : 'اجعلها مجانية' });
  free.addEventListener('click', async () => {
    /* والوسم يجرّ السعر معه: مجانيةٌ بسعر ٢٩ تناقضٌ يراه الطالب في مكانين
       مختلفين. ورفعُ المجانية يعيد السعر الافتراضي لا يتركه صفرًا. */
    const goFree = !sub.free;
    const r = await SubjEditor.patchSubject(sub.id, {
      free: goFree,
      price: goFree ? 0 : (Number(sub.price) > 0 ? sub.price : 29)
    });
    QBANK.toast(r.ok ? (goFree ? 'صارت مجانية' : 'صارت مدفوعة') : 'تعذّر التعديل');
    if (r.ok && refresh) refresh();
  });


  /*
    ★ التوثيق قرار إنسان لا نتيجة حساب.
    لو مُنح تلقائيًا بعدد تقييمات لصار وسمًا يُشترى بحسابات وهمية. فالمشرف
    يفتح المادة، يقرأ عيّنة منها، ثم يسمها بيده — والوسم يقول للطالب:
    «نظر فيها إنسان» لا «أعجبت كثيرين».
  */
  const verify = el('button', { class:'btn btn--sm ' + (sub.verified ? 'btn--soft' : 'btn--ghost'), type:'button',
    text: sub.verified ? '✓ موثّقة — أزل التوثيق' : 'وثّق هذه المادة' });
  verify.addEventListener('click', async () => {
    // ★ تحذير لا منع: البلاغ قد يكون خاطئًا، لكن توثيق مادة عليها بلاغ مفتوح
    //   يمنح خطأً محتملًا ختمَ المراجعة — وهو أسوأ ما تفعله طبقة الثقة بنفسها.
    if (!sub.verified && Number(sub.reports_open) > 0 &&
        !confirm('على هذه المادة ' + sub.reports_open + ' بلاغًا مفتوحًا لم يُبتّ فيه.\nتوثيقها الآن يمنح خطأً محتملًا ختمَ المراجعة. أتريد المتابعة؟'))
      return;
    verify.disabled = true;
    const r = await QBANK.api.rpc('set_verified', { p_subject: sub.id, p_on: !sub.verified });
    verify.disabled = false;
    const ok = r.ok && r.data && r.data.ok !== false;
    QBANK.toast(ok ? (sub.verified ? 'أُزيل التوثيق' : 'وُثّقت المادة') : 'تعذّر — تأكد من صلاحيتك');
    if (ok) refresh();
  });

  return el('div', { class:'ad-panel' }, [
    el('div', { class:'ad-panel__h' }, [
      el('h2', { class:'ad-panel__t', text:'هوية المادة' }),
      el('span', { class:'ad-panel__s', text: sub.q_count + ' سؤالًا' }),
      sub.verified ? el('span', { class:'badge badge--ok', text:'✓ موثّقة' }) : null,
      Number(sub.rating_n) > 0 && QBANK.trust
        ? el('span', { class:'badge badge--star num', text: QBANK.trust.starsText(sub.rating_avg, sub.rating_n) })
        : null
    ]),
    el('div', { class:'ad-edit ad-edit--2' }, [
      el('label', { class:'field', style:'margin:0' }, [ el('span', { class:'field__label', text:'الاسم' }), nameIn ]),
      el('label', { class:'field', style:'margin:0' }, [ el('span', { class:'field__label', text:'موعد الاختبار' }), dateIn ]),
      el('label', { class:'field', style:'margin:0;grid-column:1/-1' }, [ el('span', { class:'field__label', text:'الوصف — يظهر للطالب على البطاقة' }), descrIn ]),
      el('label', { class:'field', style:'margin:0' }, [ el('span', { class:'field__label', text:'اللون' }), swatches ]),
      el('label', { class:'field', style:'margin:0' }, [ el('span', { class:'field__label', text:'الأيقونة' }), icons ]),
      el('label', { class:'field', style:'margin:0' }, [ el('span', { class:'field__label', text:'الترتيب' }), ordIn ]),
      owner ? null : el('label', { class:'field', style:'margin:0' }, [
        el('span', { class:'field__label', text:'السعر بالريال' }), priceIn, priceHint ]),
      el('div', { class:'field', style:'margin:0' }, [
        el('span', { class:'field__label', text:'الجامعة — تظهر المادة في قسمها بـ«استكشف»' }), uniSel, uniCountry, uniNew, campusHint ]),
      el('div', { class:'field', style:'margin:0' }, [
        el('span', { class:'field__label', text:'الكلية (اختياري)' }), colSel, colNew ]),
      /* الرافع: المشرف يختار من رفعها ويقرّر إن كان يعدّل بعد النشر */
      (!owner && QBANK.views.uploaderField) ? QBANK.views.uploaderField(sub, refresh) : null
    ]),
    /* الرافع ينشر ويُخفي من شريط الحال فوق المحرّر — زرّ واحد لا اثنان */
    el('div', { class:'ad-bar', style:'margin:16px 0 0' }, owner ? [ save ] : [ save, pub, free, verify ]),
    /* بابٌ من المادة إلى بلاغاتها: المشرف الذي يفتحها ليوثّقها يرى أولًا ما عليها */
    (!owner && Number(sub.reports_open) > 0)
      ? el('a', { class:'ad-warn', href:'#/admin/reports' }, [
          el('span', { text:'⚑ عليها ' + QBANK.views.arNum(sub.reports_open) +
            (Number(sub.reports_open) === 1 ? ' بلاغ مفتوح' : ' بلاغات مفتوحة') }),
          el('span', { class:'ad-warn__go', text:'افتح الطابور ←' })
        ])
      : null
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
        if (counts[t]) return QBANK.toast('لا يُحذف محور عليه ' + counts[t] + ' سؤالًا — انقلها أولًا');
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
    if (topics.indexOf(v) !== -1) return QBANK.toast('المحور موجود');
    topics.push(v); addIn.value = ''; draw();
  });
  const save = el('button', { class:'btn', type:'button', text:'احفظ المحاور' });
  save.addEventListener('click', async () => {
    const r = await SubjEditor.patchSubject(sub.id, { topics });
    QBANK.toast(r.ok ? 'حُفظت المحاور' : 'تعذّر الحفظ');
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
    if (!r.ok) return QBANK.toast('تعذّر التعديل');
    q.important = !q.important;
    star.textContent = q.important ? '★ مهم' : '☆ علّمه مهمًا';
    star.setAttribute('aria-pressed', q.important ? 'true' : 'false');
  });
  head.appendChild(star);

  /*
    ★ «جاء في اختبار سابق» — حقلٌ صغير في رأس السؤال لا في نافذة التحرير.
    الوسم عملٌ يُفعل لعشرين سؤالًا متتابعة بعد الاختبار مباشرة، ونافذةٌ
    تُفتح وتُغلق لكلٍّ منها تجعله لا يُفعل. حقلٌ في الصفّ يُكتب ويُغادَر.
  */
  const tagIn = el('input', { class:'input input--sm num', type:'text', maxlength:'16',
    value: q.exam_tag || '', placeholder:'اختبار ٢٠٢٥ ف١',
    'aria-label':'جاء في اختبار سابق — اكتب السنة والفصل' });
  tagIn.addEventListener('change', async () => {
    const v = tagIn.value.trim().slice(0, 16);
    const r = await SubjEditor.patchQuestion(q.id, { exam_tag: v });
    if (!r.ok) return QBANK.toast('تعذّر الحفظ');
    q.exam_tag = v;
    QBANK.toast(v ? 'وُسم: ' + v : 'أُزيل الوسم');
  });
  head.appendChild(el('label', { class:'ad-inline' }, [
    el('span', { class:'ad-inline__l', text:'اختبار سابق' }), tagIn ]));

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
      if (!r.ok) return QBANK.toast('تعذّر تصحيح الإجابة');
      q.answer = i; q.derived = false;
      opts.querySelectorAll('.ad-q__opt').forEach((x, xi) =>
        x.className = 'ad-q__opt' + (xi === i ? ' is-a' : ''));
      QBANK.toast('صُحّحت الإجابة');
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
      const patch = {
        topic: topicSel.value, expl_ar: ar.value, expl_en: en.value, translation: tr.value,
        mnemonic: { cue: cue.value, key: key.value, link: link.value, strike: m.strike || '' },
        ord: parseInt(ordQ.value || String(q.ord), 10)
      };
      /* النص والخيارات يُرفقان فقط إن فُتح بابهما — الإغلاق يعني «لم أقصد» */
      if (textDetails.open){
        const newOpts = optInputs.map(i2 => i2.value);
        if (!String(qTxt.value).trim()) return QBANK.toast('السؤال بلا نص لا يُحفظ');
        if (newOpts.some(o => !String(o).trim())) return QBANK.toast('خيار فارغ — املأه أو احذفه');
        patch.q = qTxt.value; patch.options = newOpts;
        patch.answer = Math.min(q.answer, newOpts.length - 1);
      }
      const r = await SubjEditor.patchQuestion(q.id, patch);
      QBANK.toast(r.ok ? 'حُفظ السؤال' : 'تعذّر الحفظ');
      if (r.ok && refresh) refresh();
    });

    // الحذف بتأكيد صريح: الضغطة الأولى تحوّل الزر، الثانية تنفّذ
    const del = el('button', { class:'btn btn--sm btn--ghost', type:'button', text:'احذف السؤال' });
    let armed = false;
    del.addEventListener('click', async () => {
      if (!armed){ armed = true; del.textContent = 'اضغط ثانيةً للحذف نهائيًا'; del.className = 'btn btn--sm btn--danger'; return; }
      const r = await SubjEditor.delQuestion(q.id);
      QBANK.toast(r.ok ? 'حُذف السؤال' : 'تعذّر الحذف');
      if (r.ok){ if (refresh) refresh(); else box.remove(); }
    });

    /*
      ★ تحرير النص والخيارات — باب التأليف الواعي.
      خلف مطوية صريحة لا حقلًا مكشوفًا: تعديل نص الدكتور قرارٌ يُتّخذ لا
      حركةُ سهو. ما يُحفظ هنا يصبح الأصل الذي يذاكر منه كل طالب.
    */
    const qTxt = el('textarea', { class:'input ltr', rows:'3' }); qTxt.value = q.q || '';
    const optWrap = el('div', { class:'stack', style:'gap:6px' });
    const optInputs = [];
    const drawOpts = () => {
      optWrap.innerHTML = ''; optInputs.length = 0;
      (q.options || []).forEach((o, i) => {
        const inp = el('input', { class:'input ltr', value: o, 'aria-label':'الخيار ' + (i + 1) });
        optInputs.push(inp);
        const rm = el('button', { class:'btn btn--sm btn--ghost', type:'button', text:'✕', 'aria-label':'احذف الخيار ' + (i + 1) });
        rm.addEventListener('click', () => {
          if ((q.options || []).length <= 2) return QBANK.toast('سؤال بلا خيارين ليس سؤالًا');
          q.options.splice(i, 1);
          if (q.answer >= q.options.length) q.answer = 0;
          drawOpts();
        });
        optWrap.appendChild(el('div', { class:'row', style:'flex-wrap:nowrap' }, [
          el('span', { class:'badge' + (i === q.answer ? ' badge--ok' : ''), text: QBANK.views.optLetter(i) }), inp, rm ]));
      });
      const addOpt = el('button', { class:'btn btn--sm btn--ghost', type:'button', text:'+ خيار' });
      addOpt.addEventListener('click', () => { q.options.push(''); drawOpts(); });
      optWrap.appendChild(addOpt);
    };
    const textDetails = el('details', { class:'fold' }, [
      el('summary', { text:'تحرير النص والخيارات — ما تحفظه يصبح الأصل' }),
      el('div', { class:'stack', style:'margin-top:8px' }, [
        el('label', { class:'field', style:'margin:0' }, [ el('span', { class:'field__label', text:'نص السؤال' }), qTxt ]),
        el('span', { class:'field__label', text:'الخيارات (احذف وأضف كما تشاء — الإجابة تُختار من العرض أعلاه)' }),
        optWrap
      ])
    ]);
    textDetails.addEventListener('toggle', () => { if (textDetails.open) drawOpts(); });

    panel = el('div', { class:'ad-edit ad-edit--2', style:'margin-top:12px' }, [
      el('div', { style:'grid-column:1/-1' }, [textDetails]),
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
    if (!res.length) list.appendChild(QBANK.views.empty('⌕', 'لا نتائج', 'جرّب كلمة أخرى أو أزل التصفية.'));
  }
  [search, topicSel, onlySel].forEach(x =>
    x.addEventListener('input', () => { shown = 40; draw(); }));
  draw();

  /* ★ التأليف اليدوي: سؤال جديد من الصفر يظهر أول القائمة جاهزًا للتحرير */
  const addBtn = el('button', { class:'btn btn--sm', type:'button', text:'+ أضف سؤالًا' });
  addBtn.addEventListener('click', async () => {
    const maxOrd = questions.reduce((n, x) => Math.max(n, x.ord || 0), -1);
    const r = await SubjEditor.addQuestion(sub.id, maxOrd + 1);
    QBANK.toast(r.ok ? 'أُضيف — حرّر نصّه الآن' : 'تعذّرت الإضافة');
    if (r.ok && refresh) refresh();
  });

  return el('div', { class:'ad-panel' }, [
    el('div', { class:'ad-panel__h' }, [
      el('h2', { class:'ad-panel__t', text:'الأسئلة' }), count, el('span', { class:'spacer' }), addBtn
    ]),
    el('p', { class:'page__sub', style:'margin-top:0',
      text:'اضغط خيارًا لتجعله الإجابة الصحيحة. تحرير النص نفسه خلف «حرّر» — بوعي: ما تحفظه يصبح الأصل.' }),
    el('div', { class:'ad-bar' }, [ search, topicSel, onlySel ]),
    list
  ]);
}

/* ===== محرر المحتوى التحليلي — تأليف يدوي فوق ما ولّده الذكاء ===== */
function subjContent(sub, refresh){
  const mk = (label, val, rows) => {
    const t = el('textarea', { class:'input ltr', rows: String(rows || 6), dir:'rtl',
      style:'direction:rtl;text-align:right;font-family:var(--font-num);font-size:.85rem' });
    t.value = val || '';
    return { t, box: el('label', { class:'field', style:'margin:0' }, [
      el('span', { class:'field__label', text: label }), t ]) };
  };
  const ov  = mk('عن المادة (HTML: p, strong, h3, table…)', sub.overview, 7);
  const mem = mk('طريقة الحفظ', sub.memorize, 10);
  const mis = mk('الأخطاء الشائعة', sub.mistakes, 7);

  const prev = el('div', { class:'card', hidden:true });
  const prevBtn = el('button', { class:'btn btn--sm btn--ghost', type:'button', text:'عاين' });
  prevBtn.addEventListener('click', () => {
    prev.hidden = !prev.hidden;
    if (!prev.hidden){
      prev.innerHTML = '';
      /* المعاينة بنفس معقّم العرض — ما يمرّ هنا هو ما يصل الطالب حرفيًا */
      prev.appendChild(QBANK.views.analysisHtml(ov.t.value));
      prev.appendChild(QBANK.views.analysisHtml(mem.t.value));
      prev.appendChild(QBANK.views.analysisHtml(mis.t.value));
    }
  });

  const save = el('button', { class:'btn btn--sm', type:'button', text:'احفظ المحتوى' });
  save.addEventListener('click', async () => {
    /*
      ★ analyzed_at تُختم مع الحفظ اليدوي — وإلا بقيت المادة «باطلة»
      فأعاد التوليد التلقائي الكتابة فوق تأليف علي أول ما تُفتح صفحتها.
      الختم يقول للقادح: هذا المحتوى مقصود، لا تلمسه حتى تتغير الأسئلة.
    */
    const r = await SubjEditor.patchSubject(sub.id, {
      overview: ov.t.value, memorize: mem.t.value, mistakes: mis.t.value,
      analyzed_at: new Date().toISOString()
    });
    QBANK.toast(r.ok ? 'حُفظ المحتوى — وهو الآن ما يراه الطالب' : 'تعذّر الحفظ');
    if (r.ok && refresh) refresh();
  });

  const regen = el('button', { class:'btn btn--sm btn--ghost', type:'button', text:'⟳ ولّده بالذكاء من جديد' });
  regen.addEventListener('click', async () => {
    if (!QBANK.analysis) return;
    regen.setAttribute('aria-disabled','true'); regen.textContent = '… يولَّد';
    const r = await QBANK.analysis.generate(sub.id, sub.analysis_lang || 'ar');
    regen.removeAttribute('aria-disabled'); regen.textContent = '⟳ ولّده بالذكاء من جديد';
    QBANK.toast(r && r.ok ? 'اكتمل التوليد' : 'تعذّر التوليد');
    if (r && r.ok && refresh) refresh();
  });

  return el('div', { class:'ad-panel' }, [
    el('div', { class:'ad-panel__h' }, [
      el('h2', { class:'ad-panel__t', text:'المحتوى التحليلي' }),
      el('span', { class:'ad-panel__s', text:'ما يظهر في «نظرة عامة» و«طريقة الحفظ» و«الأخطاء الشائعة»' })
    ]),
    el('div', { class:'stack' }, [ ov.box, mem.box, mis.box,
      el('div', { class:'ad-bar', style:'margin:0' }, [ save, prevBtn, el('span', { class:'spacer' }), regen ]),
      prev ])
  ]);
}

/* ===== الشاشة ===== */
const AdminSubjectView = {
  title:'محرر المادة',
  view(route){
    if (!QBANK.api.user()) return QBANK.views.ViewAdminLogin.view();
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
          body.appendChild(QBANK.views.empty('⚠', 'لم نجد المادة', 'ربما حُذفت، أو حسابك ليس مشرفًا.'));
          return;
        }
        const questions = (qr.ok && Array.isArray(qr.data)) ? qr.data : [];
        body.appendChild(subjIdentity(sub, load));
        body.appendChild(subjContent(sub, load));
        body.appendChild(subjTopics(sub, questions, load));
        body.appendChild(subjQuestions(sub, questions, load));
      });
    }
    load();

    const back = el('a', { class:'btn btn--sm btn--ghost', href:'#/admin/content', text:'→ كل المواد' });
    /* من المحرّر إلى المعاينة بضغطة: يصلح ثم يرى ما أصلحه كما يراه الطالب */
    const prev = el('a', { class:'btn btn--sm btn--soft', href:'#/admin/preview/' + id, 'aria-label':'عاين المادة كما يراها الطالب' },
      [ QBANK.ico('eye', { size:14 }), ' عاين كما يراها الطالب' ]);
    return QBANK.views.page('محرر المادة', 'الهوية والمحاور والأسئلة في مكان واحد.', [
      el('div', { class:'row' }, [back, prev]), body ]);
  }
};

QBANK.admin.subject = SubjEditor;
QBANK.views.ViewAdminSubject = AdminSubjectView;
QBANK.views.subjIdentity = subjIdentity;
/* اللوحات نفسها يستعملها محرّر المالك (#/edit) — مكوّن واحد لا نسختان */
QBANK.views.subjContent   = subjContent;
QBANK.views.subjTopics    = subjTopics;
QBANK.views.subjQuestions = subjQuestions;
