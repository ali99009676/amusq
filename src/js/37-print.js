/*
  الطباعة / PDF — تنسيق مستقل تمامًا عن الشاشة:
  يبني وثيقة داخل حاوية مخفية تظهر وحدها عند الطباعة، بترويسة بلون المادة،
  وأسئلة لا تنقسم بين صفحتين، وتذييل يتكرر أسفل كل صفحة.
*/
function buildPrintDoc(sub, questions, opts){
  const root = el('div', { class:'print-root' + (opts.economic ? ' print--eco' : ''), dir:'rtl' });
  root.appendChild(el('header', { class:'print-head', style: opts.economic ? '' :
    'border-color:' + QBANK.views.subjectColor(sub.color) }, [
    el('h1', { text: sub.name }),
    el('p', { text: { bank:'بنك الأسئلة', explain:'الشرح', memo:'بطاقات الحفظ', overview:'نظرة عامة' }[opts.what] })
  ]));

  let qs = questions;
  if (opts.range === 'important') qs = qs.filter(q => q.important);
  if (opts.range === 'starred') {
    const star = QBANK.progress.forSubject(sub.id).star;
    qs = qs.filter(q => star[q.id]);
  }

  if (opts.what === 'overview') {
    root.appendChild(el('p', { text: sub.descr || '' }));
    (sub.topics || []).forEach(t => root.appendChild(el('p', { text:'• ' + t })));
  } else if (opts.what === 'memo') {
    qs.forEach((q, i) => {
      const m = q.mnemonic || {};
      if (!m.cue && !m.key) return;
      root.appendChild(el('div', { class:'q print-q' }, [
        el('p', { text: (i + 1) + ') ' + (m.cue || '') + ' ← ' + (m.key || '') }),
        m.link ? el('p', { text:'🔗 ' + m.link }) : null
      ]));
    });
  } else {
    qs.forEach((q, i) => {
      const block = el('div', { class:'q print-q' }, [
        el('p', { class:'ltr', style:'font-weight:700', text: (i + 1) + ') ' + q.q })
      ]);
      q.options.forEach((o, oi) => {
        const isAns = oi === q.answer && opts.answers;
        block.appendChild(el('p', { class:'ltr print-opt' + (isAns ? ' print-ans' : ''),
          text: String.fromCharCode(65 + oi) + ') ' + o + (isAns ? '  ✓' : '') }));
      });
      if (opts.expl && q.expl_ar) block.appendChild(el('p', { class:'print-expl', text: q.expl_ar }));
      if (opts.translation && q.translation) block.appendChild(el('p', { class:'print-expl', text: q.translation }));
      root.appendChild(block);
    });
  }

  // التذييل الثابت أسفل كل صفحة — يفرضه تنسيق الطباعة
  root.appendChild(el('footer', { class:'print-foot', text:'برمجة وتصميم علي الصقور' }));
  return root;
}

function openPrintDialog(sub){
  const old = document.querySelector('.print-root, .print-dialog');
  if (old) old.remove();

  const what = el('select', { class:'input' }, [
    el('option', { value:'bank', text:'بنك الأسئلة' }),
    el('option', { value:'explain', text:'الشرح' }),
    el('option', { value:'memo', text:'بطاقات الحفظ' }),
    el('option', { value:'overview', text:'نظرة عامة' })
  ]);
  const range = el('select', { class:'input' }, [
    el('option', { value:'all', text:'كل الأسئلة' }),
    el('option', { value:'important', text:'المهمة فقط' }),
    el('option', { value:'starred', text:'ما ميّزته بنجمة' })
  ]);
  function check(label, checked){
    const c = el('input', { type:'checkbox' });
    c.checked = checked;
    return { node: el('label', { class:'row' }, [c, el('span', { text: label })]), input: c };
  }
  const ans = check('إظهار الإجابات', true);
  const expl = check('إظهار الشرح', false);
  const trans = check('إظهار الترجمة', false);
  const eco = check('وضع اقتصادي (حبر أقل)', false);

  const go = el('button', { class:'btn btn--block', type:'button', text:'اطبع الآن' });
  const cancel = el('button', { class:'btn btn--ghost btn--block', type:'button', text:'إلغاء' });
  const dialog = el('div', { class:'card print-dialog', role:'dialog', 'aria-label':'خيارات الطباعة' }, [
    el('h2', { text:'طباعة / PDF' }),
    el('label', { class:'field' }, [ el('span', { class:'field__label', text:'ماذا تطبع؟' }), what ]),
    el('label', { class:'field' }, [ el('span', { class:'field__label', text:'النطاق' }), range ]),
    ans.node, expl.node, trans.node, eco.node, go, cancel
  ]);
  cancel.addEventListener('click', () => dialog.remove());
  go.addEventListener('click', async () => {
    const r = await QBANK.data.subjectQuestions(sub.id);
    const doc = buildPrintDoc(sub, r.data, {
      what: what.value, range: range.value,
      answers: ans.input.checked, expl: expl.input.checked,
      translation: trans.input.checked, economic: eco.input.checked
    });
    document.body.appendChild(doc);
    dialog.remove();
    window.print();
    // بعد الطباعة تُزال الوثيقة كي لا تبقى في DOM
    setTimeout(() => doc.remove(), 500);
  });
  document.body.appendChild(dialog);
}

QBANK.views.openPrintDialog = openPrintDialog;
QBANK.views.buildPrintDoc = buildPrintDoc;
