/*
  الأجزاء النافعة في صفحة الهبوط — لا تسويق بل أدوات يستفيد منها الطالب قبل التسجيل:
  سؤال يجرّبه فعلًا، بطاقة حفظ حيّة، ونصائح مراجعة مبنية على أدلة.
  (حُذف عدّاد الامتحانات: كان يُبنى من مواد جامعة بعينها، والصفحة الأولى
   صارت شرحًا للمنصة لا عرضًا لمحتواها.)
*/

/* ===== ١ · سؤال تجريبي حقيقي — يجيب عنه الزائر ويرى الشرح فورًا =====
   العيّنة تدور بين التخصصات (انظر 39-demos.js)، وموسومة كعيّنة تعليمية
   لا تُنسب لملف دكتور. */
function lpTryQuestion(demo){
  const LP_DEMO = demo || QBANK.demos.at(0);
  const box = el('div', { class:'lp-try' });
  const feedback = el('div', { class:'lp-try__fb', hidden:true, role:'status' });
  let answered = false;

  const opts = el('div', { class:'lp-try__opts' }, LP_DEMO.options.map((text, i) => {
    const b = el('button', { class:'opt', type:'button' }, [
      el('span', { class:'opt__mark', 'aria-hidden':'true' }),
      el('span', { class:'ltr', text })
    ]);
    b.addEventListener('click', () => {
      if (answered) return;
      answered = true;
      const right = i === LP_DEMO.answer;
      // نعلّم كل الخيارات: الصحيح دائمًا، والخاطئ المختار — باللون والأيقونة معًا
      opts.querySelectorAll('.opt').forEach((node, j) => {
        node.disabled = true;
        if (j === LP_DEMO.answer) { node.classList.add('is-answer'); node.firstChild.textContent = '✓'; }
        else if (j === i) { node.classList.add('is-wrong'); node.firstChild.textContent = '✗'; }
      });
      feedback.hidden = false;
      feedback.className = 'lp-try__fb ' + (right ? 'is-ok' : 'is-no');
      feedback.innerHTML = '';
      feedback.appendChild(el('b', { text: right ? '✓ إجابة صحيحة' : '✗ ليست الإجابة الصحيحة' }));
      feedback.appendChild(el('p', { style:'margin:0 0 8px', text: LP_DEMO.why }));
      feedback.appendChild(el('p', { class:'field__hint', style:'margin:0', text: LP_DEMO.wrong }));
    });
    return b;
  }));

  const transBtn = el('button', { class:'btn btn--sm btn--ghost', type:'button', text:'عرض الترجمة' });
  const trans = el('p', { class:'field__hint', hidden:true, text: LP_DEMO.q_ar });
  transBtn.addEventListener('click', () => {
    trans.hidden = !trans.hidden;
    transBtn.textContent = trans.hidden ? 'عرض الترجمة' : 'إخفاء الترجمة';
  });

  box.appendChild(el('div', { class:'row', style:'margin-bottom:12px' }, [
    el('span', { class:'badge', text:'عيّنة تعليمية' }),
    el('span', { class:'badge badge--ok', text: LP_DEMO.tag })
  ]));
  box.appendChild(el('p', { class:'lp-try__q ltr', text: LP_DEMO.q }));
  box.appendChild(opts);
  box.appendChild(feedback);
  box.appendChild(el('div', { class:'row', style:'margin-top:12px' }, [transBtn]));
  box.appendChild(trans);
  return box;
}

/* ===== ٢ · بطاقة حفظ حيّة — يقلبها الزائر ليرى كيف تعمل ===== */
function lpMemoCard(demo){
  const m = (demo || QBANK.demos.at(0)).mnemonic;
  let flipped = false;
  const card = el('div', { class:'lp-memo', tabindex:'0', role:'button', 'aria-label':'بطاقة حفظ — اضغط لقلبها' });

  function paint(){
    card.innerHTML = '';
    if (!flipped) {
      card.appendChild(el('p', { class:'lp-memo__hint', text:'وجه البطاقة · اضغط للقلب' }));
      card.appendChild(el('p', { class:'ltr', style:'font-weight:700;font-size:1.05rem', text: m.cue }));
      card.appendChild(el('p', { class:'field__hint', style:'margin:0', text:'ما الكلمة الدالة التي تربطها بالإجابة؟' }));
    } else {
      card.appendChild(el('p', { class:'lp-memo__hint', text:'الوجه الخلفي' }));
      card.appendChild(el('div', { class:'lp-memo__chain' }, [
        el('span', { class:'ltr', text: m.cue }),
        el('span', { 'aria-hidden':'true', text:'←' }),
        el('span', { class:'lp-memo__k ltr', text: m.key })
      ]));
      card.appendChild(el('p', { class:'field__hint', style:'margin:0', text:'🔗 ' + m.link }));
    }
  }
  const flip = () => { flipped = !flipped; paint(); };
  card.addEventListener('click', flip);
  card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
  paint();
  return card;
}

/* ===== ٣ · نصائح مراجعة مبنية على أدلة ===== */
const LP_TIPS = [
  ['🔁', 'الاسترجاع النشط لا القراءة',
   'أن تسأل نفسك وتحاول التذكر أقوى أثرًا من إعادة قراءة الملف مرات. لهذا «مراجعة» تبدأ بالسؤال لا بالجواب.'],
  ['📆', 'وزّع المراجعة على أيام',
   'ساعة يوميًا لخمسة أيام تثبّت أكثر من خمس ساعات في ليلة. العدّاد التنازلي هنا يساعدك على التوزيع.'],
  ['🎯', 'طارد أخطاءك',
   'السؤال الذي أخطأت فيه هو أنفع سؤال لك. «مراجعة» تقدّمه في الاختبار القادم ويتيح إعادة الأخطاء وحدها.'],
  ['✂️', 'تعلّم شطب المشتتات',
   'نصف الدرجة تأتي من استبعاد الخاطئ لا من معرفة الصحيح. كل بطاقة حفظ تشرح كيف تشطب المشتت في الورقة.']
];

/* ===== ٤ · أسئلة شائعة ===== */
const LP_FAQ = [
  ['هل تُعدَّل نصوص أسئلة الدكتور؟',
   'أبدًا. النص والخيارات كما وصلت حرفًا بحرف — بلا تصحيح إملاء ولا إعادة صياغة ولا تغيير ترتيب. هذه قاعدة ثابتة تُفحص آليًا قبل كل نشر.'],
  ['هل تعمل المنصة بلا إنترنت؟',
   'نعم. افتح المادة مرة واحدة متصلًا فتُخزَّن أسئلتها في جهازك، ثم تراجع بعدها بلا شبكة. تقدّمك يُحفظ محليًا ويتزامن حين تعود.'],
  ['ماذا لو دخلت من جهاز آخر؟',
   'يُدمج تقدّمك بلا حذف: ما راجعته على الجهازين يجتمع، وأفضل نتيجة تبقى. لا تخسر شيئًا أبدًا.'],
  ['من أين تأتي الإجابات والشروح؟',
   'الإجابة التي تصل مع ملف الدكتور تُستخدم كما هي. وما لا إجابة له يُستنتج من المراجع القياسية ويُوسم للمشرف بعلامة تحذير قبل النشر، فلا يصلك سؤال غير مراجَع.'],
  ['هل الاشتراك شهري؟',
   'لا. الطلب موسمي حول الامتحانات، فالاشتراك موسمي: مادة مفردة أو حزمة فصل تنتهي بنهاية الفصل بلا تجديد تلقائي.'],
  ['هل أستطيع حذف حسابي؟',
   'نعم، بزر واحد من صفحة حسابي — يُحذف الحساب وكل بياناته نهائيًا في الحال.']
];

QBANK.views.lpParts = { lpTryQuestion, lpMemoCard, LP_TIPS, LP_FAQ };
