/*
  ═══════════════════════════════════════════════════════════════════
  كتابة الأسئلة باليد — الطريق الثاني إلى المنصة
  ═══════════════════════════════════════════════════════════════════
  الرفع بملف يفترض أن للطالب ملفًا. وكثيرٌ منهم لا ملف عنده: أسئلةٌ سمعها
  في المحاضرة، أو صوّرها زميله في مجموعة الواتساب، أو كتبها بيده في دفتره.
  كان هؤلاء خارج المنصة كلها — لا لأنهم لا يملكون محتوى، بل لأننا طلبنا
  المحتوى بصيغةٍ واحدة.

  ═══ والحفظ التلقائي شرطٌ لا زينة ═══
  كتابة عشرين سؤالًا بخياراتها عملُ نصف ساعة. وضياعُه بإغلاقٍ عارض أو
  بطاريةٍ نفدت لا يُنسى ولا يُغتفر، ولا يعود صاحبه ليكتبها ثانية. فكل حرف
  يُحفظ في الجهاز لحظةَ كتابته، ويُستعاد كما تُرك.
*/

const Manual = {
  KEY: 'manual_draft',
  MIN_OPTS: 2,
  MAX_OPTS: 6,

  blank(){ return { q:'', options:['', ''], answer:0 }; },

  load(){
    const d = QBANK.store.get(Manual.KEY, null);
    if (d && Array.isArray(d.items) && d.items.length) return d;
    return { name:'', items:[Manual.blank()] };
  },
  save(d){ QBANK.store.set(Manual.KEY, d); },
  clear(){ QBANK.store.remove(Manual.KEY); },

  /*
    ما يصلح للنشر: سؤالٌ له نصّ وخياران فأكثر غيرُ فارغين وإجابةٌ محدَّدة.
    والفلترة لا الرفض: من كتب تسعة أسئلة وترك العاشر نصفَ مكتوب لا يُمنع
    من نشر التسعة — يُنشر ما تمّ ويُقال له كم استُبعد ولماذا.
  */
  valid(it){
    if (!it || !String(it.q || '').trim()) return false;
    const opts = (it.options || []).map(o => String(o || '').trim()).filter(Boolean);
    if (opts.length < Manual.MIN_OPTS) return false;
    const a = it.answer;
    return typeof a === 'number' && a >= 0 && a < (it.options || []).length &&
           !!String(it.options[a] || '').trim();
  },

  /* تحويل ما كُتب إلى شكل المقسّم نفسه — بقية المعالج لا تعرف المصدر */
  toRaw(items){
    return (items || []).filter(Manual.valid).map((it, i) => {
      /* الخيارات الفارغة تُطرح، وموضع الإجابة يُعاد حسابه بعد الطرح —
         وإلا أشار الرقمُ القديم إلى خيارٍ غير الذي اختاره الكاتب. */
      const kept = [];
      let answer = 0;
      (it.options || []).forEach((o, oi) => {
        const t = String(o || '').trim();
        if (!t) return;
        if (oi === it.answer) answer = kept.length;
        kept.push(t);
      });
      return { num: i + 1, q: String(it.q).trim(), options: kept,
               answer: answer, answer_letter: 'ABCDEF'[answer] || null,
               has_options: true };
    });
  },

  /*
    ★ خلطٌ عادل (Fisher–Yates) لا `sort(() => Math.random() - .5)`.
    الثاني شائعٌ ومغشوش: مقارنةٌ عشوائية تخرق شرط الترتيب الثابت، فتخرج
    توزيعةٌ منحازة تُبقي أول العناصر قرب أولها. وهنا الانحياز يعني أن
    ترتيب الكاتب يظل مقروءًا في نتيجته — وهذا نقيض المقصود.
  */
  shuffle(arr, rnd){
    const a = (arr || []).slice();
    const r = rnd || Math.random;
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
};
QBANK.manual = Manual;

/* ═══════════════ الشاشة ═══════════════ */
function manualComposer(onDone, onCancel){
  const st = Manual.load();
  const box = el('div', { class:'stack' });
  const list = el('div', { class:'stack' });
  const msg = el('p', { class:'field__hint', role:'status' });

  const persist = () => Manual.save(st);

  function card(it, idx){
    const c = el('div', { class:'card stack mq' });

    const head = el('div', { class:'row' }, [
      el('span', { class:'badge num', text:'سؤال ' + QBANK.views.arNum(idx + 1) }),
      el('span', { class:'spacer' })
    ]);
    if (st.items.length > 1) {
      const del = el('button', { class:'btn btn--ghost btn--sm', type:'button',
        'aria-label':'احذف السؤال ' + (idx + 1), text:'حذف' });
      del.addEventListener('click', () => {
        st.items.splice(idx, 1); persist(); draw();
      });
      head.appendChild(del);
    }

    const qIn = el('textarea', { class:'input', rows:'2',
      placeholder:'اكتب نصّ السؤال…', 'aria-label':'نص السؤال ' + (idx + 1) });
    qIn.value = it.q || '';
    qIn.addEventListener('input', () => { it.q = qIn.value; persist(); });

    /*
      الخيارات: كلٌّ سطرٌ فيه دائرةُ اختيار «هذه الصحيحة» ثم الحقل.
      والدائرة قبل الحقل لا بعده: العين العربية تقرأ من اليمين، فالعلامة
      أولًا تقول «هنا تُحدَّد الإجابة» قبل أن يُقرأ نصُّها.
    */
    const opts = el('div', { class:'stack mq__opts' });
    (it.options || []).forEach((o, oi) => {
      const pick = el('button', { class:'mq__pick' + (it.answer === oi ? ' is-on' : ''),
        type:'button', role:'radio', 'aria-checked': it.answer === oi ? 'true' : 'false',
        'aria-label':'اجعل الخيار ' + QBANK.views.optLetter(oi) + ' هو الصحيح',
        text: QBANK.views.optLetter(oi) });
      pick.addEventListener('click', () => { it.answer = oi; persist(); draw(); });

      const inp = el('input', { class:'input', value:o || '',
        placeholder:'الخيار ' + QBANK.views.optLetter(oi),
        'aria-label':'نص الخيار ' + QBANK.views.optLetter(oi) });
      inp.addEventListener('input', () => { it.options[oi] = inp.value; persist(); });

      const row = el('div', { class:'mq__row' }, [pick, inp]);
      if ((it.options || []).length > Manual.MIN_OPTS) {
        const x = el('button', { class:'mq__x', type:'button',
          'aria-label':'احذف الخيار ' + QBANK.views.optLetter(oi), text:'×' });
        x.addEventListener('click', () => {
          it.options.splice(oi, 1);
          /* الإجابة تتبع خيارها: حذف خيارٍ قبلها يُنزل موضعها، وحذفها هي
             يُبطل التحديد — ولا نترك مؤشّرًا يشير إلى خيارٍ آخر بصمت. */
          if (it.answer === oi) it.answer = 0;
          else if (it.answer > oi) it.answer -= 1;
          persist(); draw();
        });
        row.appendChild(x);
      }
      opts.appendChild(row);
    });

    const addOpt = el('button', { class:'btn btn--ghost btn--sm', type:'button', text:'+ خيار' });
    addOpt.setAttribute('aria-disabled', (it.options || []).length >= Manual.MAX_OPTS ? 'true' : 'false');
    addOpt.addEventListener('click', () => {
      if ((it.options || []).length >= Manual.MAX_OPTS) return;
      it.options.push(''); persist(); draw();
    });

    c.appendChild(head);
    c.appendChild(qIn);
    c.appendChild(el('span', { class:'field__label', text:'الخيارات — اضغط الحرف لتحديد الصحيح' }));
    c.appendChild(opts);
    c.appendChild(addOpt);
    return c;
  }

  function draw(){
    list.innerHTML = '';
    st.items.forEach((it, i) => list.appendChild(card(it, i)));
    const ok = st.items.filter(Manual.valid).length;
    msg.textContent = ok
      ? 'جاهز للنشر: ' + QBANK.views.arNum(ok) + ' سؤالًا من ' +
        QBANK.views.arNum(st.items.length) + '.'
      : 'اكتب سؤالًا واحدًا على الأقل بخيارين وحدّد الصحيح.';
    done.setAttribute('aria-disabled', ok ? 'false' : 'true');
    done.textContent = ok ? 'تابع بـ ' + QBANK.views.arNum(ok) + ' سؤالًا' : 'تابع';
  }

  const addQ = el('button', { class:'btn btn--soft btn--block', type:'button', text:'+ أضف سؤالًا' });
  addQ.addEventListener('click', () => {
    st.items.push(Manual.blank()); persist(); draw();
    // البؤرة إلى الجديد: من ضغط «أضف» يريد الكتابة الآن لا البحث عن الحقل
    const cards = list.querySelectorAll('.mq textarea');
    if (cards.length) cards[cards.length - 1].focus();
  });

  const done = el('button', { class:'btn btn--block', type:'button', text:'تابع' });
  done.addEventListener('click', () => {
    const raw = Manual.toRaw(st.items);
    if (!raw.length) return;
    const dropped = st.items.length - raw.length;
    onDone(raw, dropped);
  });

  const back = el('button', { class:'btn btn--ghost btn--block', type:'button',
    text:'رجوع إلى رفع ملف' });
  back.addEventListener('click', () => onCancel());

  box.appendChild(el('p', { class:'field__hint', text:
    'اكتب أسئلتك هنا مباشرة — تُحفظ في جهازك أولًا بأول، فلو أُغلقت الصفحة عادت كما تركتها.' }));
  box.appendChild(list);
  box.appendChild(addQ);
  box.appendChild(msg);
  box.appendChild(done);
  box.appendChild(back);
  draw();
  return box;
}
QBANK.views.manualComposer = manualComposer;
