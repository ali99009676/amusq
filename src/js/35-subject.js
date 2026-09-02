/*
  صفحة المادة — أربعة تبويبات: نظرة عامة · الشرح · بنك الأسئلة · طريقة الحفظ.
  الأسئلة تُجلب مرة واحدة ثم من جهاز الطالب (IndexedDB) — تعمل بعدها بلا إنترنت.
  البنك مصمَّم لخمسمئة سؤال: عرض على دفعات، وأقسام مطوية افتراضيًا.
*/
const SUBJ_TABS = [
  { id:'overview', label:'نظرة عامة' },
  { id:'explain',  label:'الشرح' },
  { id:'bank',     label:'بنك الأسئلة' },
  { id:'memo',     label:'طريقة الحفظ' }
];
const BANK_PAGE = 50;   // دفعة العرض — التمرير يطلب المزيد بدل رسم ٥٠٠ عنصر دفعة واحدة

function findSubject(sid){
  return (QBANK.data.pack().subjects || []).filter(s => s.id === sid)[0] || null;
}

/* شريط سؤال واحد في البنك (وضع القائمة) */
function bankRow(sub, q, prog){
  const starred = !!prog.star[q.id];
  const starBtn = el('button', { class:'iconbtn', type:'button',
    'aria-label': starred ? 'أزل النجمة' : 'ميّز بنجمة', 'aria-pressed': String(starred) }, [
    el('span', { class:'iconbtn__ico', text: starred ? '★' : '☆',
      style: starred ? 'color:var(--star)' : '' })
  ]);
  starBtn.addEventListener('click', () => {
    QBANK.progress.toggleStar(sub.id, q.id);
    QBANK.router.render(location.hash);
  });

  const opts = el('div', { class:'stack q__opts', hidden:true },
    q.options.map((opt, oi) => {
      const right = oi === q.answer;
      return el('div', { class:'opt' + (right ? ' is-answer' : '') }, [
        el('span', { class:'opt__l', 'aria-hidden':'true', text: QBANK.views.optLetter(oi) }),
        el('span', { class:'ltr', text: opt }),
        right ? el('span', { class:'opt__tag', text:'الإجابة' }) : null,
        el('span', { class:'opt__mark', 'aria-hidden':'true', text: right ? '✓' : '' })
      ]);
    }));
  const trans = el('p', { class:'field__hint', hidden:true, text: q.translation || 'لا ترجمة بعد.' });
  const transBtn = el('button', { class:'btn btn--sm btn--ghost', type:'button', text:'عرض الترجمة' });
  transBtn.addEventListener('click', () => {
    trans.hidden = !trans.hidden;
    transBtn.textContent = trans.hidden ? 'عرض الترجمة' : 'إخفاء الترجمة';
  });

  const head = el('button', { class:'rowbtn', type:'button', 'aria-expanded':'false' }, [
    el('span', { class:'ltr q__text', text: q.q })
  ]);
  // رقم السؤال في الهامش — يُقرأ بصوت مسموع: «افتح سؤال ٤٧»
  const num = el('span', { class:'qitem__n', 'aria-hidden':'true',
    text: QBANK.views.arNum((q.ord || 0) + 1) });
  head.addEventListener('click', () => {
    const open = opts.hidden;
    opts.hidden = !open;
    head.setAttribute('aria-expanded', String(open));
    if (open) QBANK.progress.markSeen(sub.id, q.id);   // فتح السؤال = رُوجع
  });

  return el('article', { class:'q qitem', 'data-qid': q.id }, [
    num,
    el('div', { class:'row' }, [
      head, starBtn,
      // ★ البلاغ عند السؤال نفسه لا في آخر الصفحة: من يرى الخطأ يراه هنا،
      //   وزرٌّ بعيد عن موضع المشكلة لا يُضغط
      QBANK.trust ? QBANK.trust.reportButton(sub.id, q.id) : null,
      prog.wrong[q.id] ? el('span', { class:'badge badge--bad num', text:'أخطأت ×' + prog.wrong[q.id] }) : null,
      q.important ? el('span', { class:'badge badge--warn', text:'مهم' }) : null,
      /* ★ الشارة التي يدفع الطلاب لأجلها: سؤالٌ جاء فعلًا في اختبار */
      q.exam_tag ? el('span', { class:'badge badge--gold', text:'جاء في ' + q.exam_tag }) : null
    ]),
    opts, el('div', { class:'row' }, [transBtn]), trans
  ]);
}

/* بطاقة مقلوبة (وضع البطاقات) */
function flipCard(sub, q){
  const card = el('div', { class:'flip', tabindex:'0', role:'button', 'aria-label':'بطاقة: اضغط لقلبها' }, [
    el('div', { class:'flip__in' }, [
      el('div', { class:'flip__face' }, [ el('p', { class:'ltr q__text', text: q.q }) ]),
      el('div', { class:'flip__face flip__face--back' }, [
        el('p', { class:'ltr', style:'font-weight:700', text: q.options[q.answer] }),
        q.expl_ar ? el('p', { class:'field__hint', text: q.expl_ar }) : null
      ])
    ])
  ]);
  const flip = () => {
    card.classList.toggle('is-flipped');
    QBANK.progress.markSeen(sub.id, q.id);
  };
  card.addEventListener('click', flip);
  card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
  return card;
}

/* تبويب البنك: بحث + فلاتر + وضعان + أقسام مطوية بالمحاور */
function bankTab(sub, questions){
  const state = QBANK.store.get('bank_ui', { filter:'all', mode:'list' });
  const prog = QBANK.progress.forSubject(sub.id);
  const box = el('div', { class:'stack' });

  const search = el('input', { class:'input', type:'search', id:'bankSearch',
    placeholder:'ابحث في ' + questions.length + ' سؤالًا…', 'aria-label':'بحث في بنك الأسئلة' });

  const FILTERS = [
    ['all','الكل'], ['unseen','لم أراجعه'], ['wrong','أخطأت فيه'], ['star','بنجمة']
  ];
  const filters = el('div', { class:'row', role:'group', 'aria-label':'تصفية الأسئلة' },
    FILTERS.map(([id, label]) => {
      const b = el('button', { class:'btn btn--sm ' + (state.filter === id ? 'btn--soft' : 'btn--ghost'),
        type:'button', 'aria-pressed': String(state.filter === id), text: label });
      b.addEventListener('click', () => {
        state.filter = id; QBANK.store.set('bank_ui', state);
        QBANK.router.render(location.hash);
      });
      return b;
    }));

  const modeBtn = el('button', { class:'btn btn--sm btn--ghost', type:'button',
    text: state.mode === 'list' ? 'وضع البطاقات ▦' : 'وضع القائمة ☰' });
  modeBtn.addEventListener('click', () => {
    state.mode = state.mode === 'list' ? 'cards' : 'list';
    QBANK.store.set('bank_ui', state);
    QBANK.router.render(location.hash);
  });
  filters.appendChild(el('span', { class:'spacer' }));
  filters.appendChild(modeBtn);

  const listBox = el('div', { class:'stack', id:'bankList' });

  function applyFilters(){
    const term = (search.value || '').trim().toLowerCase();
    return questions.filter(q => {
      if (state.filter === 'unseen' && prog.seen[q.id]) return false;
      if (state.filter === 'wrong' && !prog.wrong[q.id]) return false;
      if (state.filter === 'star' && !prog.star[q.id]) return false;
      if (term && (q.q + ' ' + q.options.join(' ')).toLowerCase().indexOf(term) === -1) return false;
      return true;
    });
  }

  function render(){
    listBox.innerHTML = '';
    const filtered = applyFilters();
    if (!filtered.length) {
      listBox.appendChild(QBANK.views.empty('؟', 'لا نتائج', 'جرّب فلترًا آخر أو كلمة بحث أقصر.'));
      return;
    }
    // أقسام حسب المحاور — مطوية افتراضيًا مع عدد أسئلة كل قسم
    const topics = {};
    filtered.forEach(q => { const t = q.topic || 'عام'; (topics[t] = topics[t] || []).push(q); });
    Object.keys(topics).forEach(t => {
      const qs = topics[t];
      const inner = el('div', { class: state.mode === 'cards' ? 'grid grid--2' : 'stack' });
      let shown = 0;
      const more = el('button', { class:'btn btn--soft btn--block', type:'button' });
      function fill(){
        // دفعات العرض: ٥٠ سؤالًا في كل طلب — البنك يظل سلسًا على ٥٠٠ سؤال
        const next = qs.slice(shown, shown + BANK_PAGE);
        next.forEach(q => inner.appendChild(state.mode === 'cards' ? flipCard(sub, q) : bankRow(sub, q, prog)));
        shown += next.length;
        more.textContent = 'عرض المزيد (' + (qs.length - shown) + ' متبقٍ)';
        more.hidden = shown >= qs.length;
      }
      more.addEventListener('click', fill);
      fill();
      const fold = el('details', { class:'fold' }, [
        el('summary', {}, [ t + ' ', el('span', { class:'badge num', text: qs.length + ' سؤالًا' }) ]),
        inner, more
      ]);
      if (Object.keys(topics).length === 1) fold.setAttribute('open','');
      listBox.appendChild(fold);
    });
  }
  let debounce = null;
  search.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(render, 150); });

  render();
  box.appendChild(search); box.appendChild(filters); box.appendChild(listBox);
  return box;
}

/* تبويب الشرح: مطوي لكل سؤال — لماذا الصحيح صحيح ولماذا غيره خاطئ */
function explainTab(sub, questions){
  return el('div', { class:'stack' }, questions.map((q, i) =>
    el('details', { class:'fold card card--flat' }, [
      el('summary', {}, [ el('span', { class:'badge num', text:'س' + (i + 1) }), ' ',
        el('span', { class:'ltr', text: q.q.slice(0, 90) + (q.q.length > 90 ? '…' : '') }) ]),
      el('div', { class:'stack' }, [
        el('p', { class:'ltr', style:'font-weight:700;color:var(--ok)', text:'✓ ' + q.options[q.answer] }),
        el('p', { text: q.expl_ar || 'الشرح يُضاف من لوحة التحكم.' }),
        q.expl_en ? el('p', { class:'ltr field__hint', text: q.expl_en }) : null
      ])
    ])));
}

/* تبويب طريقة الحفظ: التحليل الشامل أولًا ثم بطاقات الأسئلة */
function memoTab(sub, questions){
  const box = el('div', { class:'stack' });

  /*
    ★ «طريقة الحفظ» الشاملة قبل البطاقات الفردية.
    الجداول والحيل المنحوتة («مُتّت»، «قهأب») تُلخّص المادة كلها — يقرؤها
    الطالب أولًا فتعطيه الهيكل، ثم بطاقات الأسئلة تملؤه. عكس الترتيب يغرقه
    في التفاصيل قبل الخريطة.
  */
  const slot = el('div', { class:'stack' });
  box.appendChild(slot);
  if (QBANK.analysis) QBANK.analysis.get(sub.id).then(a => {
    if (!slot.isConnected || !a) return;
    if (a.memorize) slot.appendChild(el('div', { class:'card' }, [ QBANK.views.analysisHtml(a.memorize) ]));
    if (a.mistakes) slot.appendChild(el('div', { class:'card stack' }, [
      el('h2', { text:'الأخطاء الشائعة' }),
      QBANK.views.analysisHtml(a.mistakes)
    ]));
  });

  const withMemo = questions.filter(q => q.mnemonic && (q.mnemonic.cue || q.mnemonic.key));
  if (!withMemo.length){
    box.appendChild(QBANK.views.empty('🧠', 'لا بطاقات حفظ للأسئلة بعد', 'تُبنى بطاقات الحفظ مع معالجة الذكاء وتظهر هنا.'));
    return box;
  }
  box.appendChild(el('div', { class:'stack' }, withMemo.map(q => {
    const m = q.mnemonic;
    return el('div', { class:'card stack' }, [
      el('div', { class:'row' }, [
        el('span', { class:'badge', text:'الكلمة الدالة' }),
        el('span', { class:'ltr', style:'font-weight:700', text: m.cue || '—' }),
        el('span', { 'aria-hidden':'true', text:'←' }),
        el('span', { class:'badge badge--ok', text:'المفتاح' }),
        el('span', { class:'ltr', style:'font-weight:700', text: m.key || '—' })
      ]),
      m.link ? el('p', { style:'margin:0', text:'🔗 ' + m.link }) : null,
      m.strike ? el('p', { class:'field__hint', style:'margin:0', text:'✂ ' + m.strike }) : null
    ]);
  })));
  return box;
}

/* تبويب النظرة العامة */
function overviewTab(sub, questions){
  const prog = QBANK.progress.forSubject(sub.id);
  const pct = QBANK.progress.pctDone(sub.id, questions.length);

  /* «عن المادة» المحلَّلة والمحاور بعدّاداتها — تصل غير متزامنة فتملأ فتحتها */
  const aSlot = el('div', { class:'stack' });
  if (QBANK.analysis) QBANK.analysis.get(sub.id).then(a => {
    if (!aSlot.isConnected || !a) return;
    if (a.overview){
      aSlot.appendChild(el('div', { class:'card stack' }, [
        el('h2', { text:'عن المادة' }),
        QBANK.views.analysisHtml(a.overview)
      ]));
      /* الاحتياط (الوصف القصير وشارات المحاور) ينسحب حين يصل الأصل */
      const root = aSlot.parentNode;
      if (root) root.querySelectorAll('[data-fallback]').forEach(x => x.remove());
    }
    const tc = QBANK.views.topicsCard(a);
    if (tc) aSlot.appendChild(tc);
    /* تحليل بَطَل (أُضيفت أسئلة بعده) يُعاد توليده تلقائيًا لصاحبه */
    QBANK.analysis.maybeRefresh(sub, a, () => {
      QBANK.analysis.get(sub.id, true).then(() => {
        if (aSlot.isConnected) QBANK.router.render(location.hash);
      });
    });
  });

  return el('div', { class:'stack' }, [
    aSlot,
    sub.descr ? el('div', { class:'card', 'data-fallback':'1' }, [ el('p', { style:'margin:0', text: sub.descr }) ]) : null,
    el('div', { class:'card stack' }, [
      el('h2', { text:'تقدّمك' }),
      el('div', { class:'subj__meter' }, [ el('div', { style:'width:' + pct + '%;background:' + QBANK.views.subjectColor(sub.color) }) ]),
      el('div', { class:'row' }, [
        el('span', { class:'badge num', text:'راجعت ' + Object.keys(prog.seen).length + ' من ' + questions.length }),
        el('span', { class:'badge badge--bad num', text:'أخطاء ' + Object.keys(prog.wrong).length }),
        el('span', { class:'badge num', text:'اختبارات ' + prog.exams }),
        prog.best ? el('span', { class:'badge badge--ok num', text:'أفضل نتيجة ' + prog.best + '٪' }) : null
      ])
    ]),
    /* شارات المحاور القديمة احتياطٌ لمادة بلا تحليل — topicsCard أغنى منها */
    (sub.topics && sub.topics.length) ? el('div', { class:'card', 'data-fallback':'1' }, [
      el('h2', { text:'المحاور' }),
      el('div', { class:'row' }, sub.topics.map(t => el('span', { class:'badge', text: t })))
    ]) : null,
    /* نبض المادة: الرقم الذي يُبقي الطالب مستيقظًا ليلة الامتحان */
    QBANK.community ? QBANK.community.pulseBand(sub.id) : null,
    QBANK.community ? QBANK.community.challengeBox(sub) : null,
    /* التقييم أسفل الشاشة لا أعلاها: يُقيّم من راجع، ومن راجع وصل إلى هنا */
    QBANK.trust ? el('div', { class:'card stack' }, [
      el('div', { class:'row', style:'justify-content:space-between;align-items:center' }, [
        el('h2', { style:'margin:0', text:'قيّم هذه المادة' }),
        el('div', { class:'row' }, QBANK.trust.badges(sub))
      ]),
      el('p', { class:'field__hint', style:'margin:0',
        text:'تقييمك يرفع البنوك النافعة إلى أعلى نتائج زملائك — ويُنزل ما دونها.' }),
      QBANK.trust.ratingWidget(sub)
    ]) : null
  ]);
}

/*
  تجديد القائمة ثم إعادة المحاولة — مرة واحدة.
  لو أخفقنا ثانيةً فالمادة غير متاحة فعلًا (أُخفيت، أو لم تُشترَ بعد، أو
  الرابط خطأ)، وحينها فقط نقولها. والفشل بلا اتصال يُقال باسمه: «تعذّر
  الوصول» غير «غير موجودة» — الأولى تُعاد المحاولة فيها، والثانية تُيئِس.
*/
function refetchThenSubject(sid, title){
  const box = el('div', { class:'stack' }, [
    el('p', { class:'page__sub', text:'جارٍ تحديث قائمة المواد…' }) ]);

  QBANK.data.refreshPack().then(r => {
    if (!box.isConnected) return;                 // غادر الطالب — لا نلمس شاشة أخرى
    if (findSubject(sid)){
      // نُعيد رسم المسار نفسه — لا نُنقل الطالب، فهو حيث أراد أن يكون
      try { return void QBANK.router.render(location.hash || '#/'); }
      catch(e){ return; }
    }
    box.innerHTML = '';
    box.appendChild(r && r.ok === false && r.offline
      ? QBANK.views.empty('⚡', 'تعذّر الوصول',
          'لا اتصال الآن. المادة قد تكون موجودة — أعد المحاولة حين يعود الإنترنت.',
          el('a', { class:'btn', href:'#/', text:'الرئيسية' }))
      : QBANK.views.empty('؟', 'المادة غير متاحة',
          'ربما أوقفها المشرف، أو تغيّر رابطها، أو لم تُنشر بعد.',
          el('a', { class:'btn', href:'#/explore', text:'استكشف المواد' })));
  });

  return QBANK.views.page(title || 'المادة', null, [box]);
}

const ViewSubject = {
  title:'المادة',
  view(route){
    const sid = route.rest[0];
    const sub = findSubject(sid);
    /*
      ★ «غير موجودة» ليست حقيقة عن القاعدة — هي حقيقة عن نسخةٍ في هذا الجهاز.
      قائمة المواد تُجلب مرة عند الإقلاع وتبقى في التخزين المحلي. فمادةٌ
      نُشرت بعدها — نشرتَها أنت قبل ثوانٍ، أو نشرها زميلك وأرسل لك رابطها،
      أو أضفتَها من جوّالك وفتحتها على حاسوبك — ليست فيها. فكنّا نقول
      للطالب «غير موجودة» ونحن لم نسأل الخادم أصلًا.
      نسأل مرة، ثم نحكم.
    */
    if (!sub) return refetchThenSubject(sid);

    QBANK.gate.captureRef(route.query);          // ?ref= يُحفظ قبل أي شيء آخر
    QBANK.trial.stop();                          // مغادرة مادة توقف عدّادها

    // بوابة المحتوى: مادة غير مملوكة تعرض بطاقة الشراء لا المحتوى.
    // نعرض بالتخمين المحلي فورًا (لا وميض)، ثم نصحّح بقرار القاعدة حين يصل.
    const guess = QBANK.gate.localGuess(sub);
    if (!guess.allowed) {
      const box = el('div', {}, [ QBANK.gate.paywallCard(sub) ]);
      return QBANK.views.page(sub.name, null, [box]);
    }

    const active = SUBJ_TABS.some(t => t.id === route.rest[1]) ? route.rest[1] : 'overview';
    const tabs = el('div', { class:'tabs', role:'tablist' }, SUBJ_TABS.map(t =>
      el('button', { class:'tabs__btn', type:'button', role:'tab', 'data-tab': t.id,
        'aria-selected': String(t.id === active), text: t.label })));
    tabs.addEventListener('click', e => {
      const b = e.target.closest('[data-tab]');
      if (b) QBANK.router.go('#/subject/' + sid + '/' + b.getAttribute('data-tab'));
    });

    const body = el('div', { class:'stack', id:'subjBody' },
      [ el('p', { class:'page__sub', text:'جارٍ تجهيز الأسئلة…' }) ]);

    // شريط التجربة يُعلَّق فوق التبويبات متى قالت القاعدة إن الوصول بالتجربة
    const trialSlot = el('div', {});
    QBANK.trial.access(sid).then(a => {
      if (!trialSlot.isConnected || !a) return;   // null = تعذّر السؤال، لا رفض
      if (a.reason === 'trial'){
        trialSlot.appendChild(QBANK.trial.start(sid, Number(a.seconds_left), () => {
          QBANK.router.render(location.hash);    // انتهت: نعيد الرسم فتظهر شاشة الشراء
        }));
      } else if (a.reason === 'entitled' && a.owner && a.hours_left != null){
        /* ★ مدّةٌ تنتهي بلا إعلان تبدو خيانة.
           الرافع يفتح مادته اليوم فيظنّها ملكه أبدًا، فإن أُقفلت غدًا فجأة
           شعر أنه أُخذ منه شيء. الرقم المعلن يجعلها اتفاقًا لا مفاجأة. */
        trialSlot.appendChild(el('div', { class:'card ownerband' }, [
          el('p', { style:'margin:0', text:'▣ هذه مادتك — رفعتَها أنت.' }),
          el('p', { class:'field__hint', style:'margin:0', text:
            Number(a.hours_left) > 0
              ? 'وصولك المجاني ينتهي بعد ' + QBANK.views.arNum(Number(a.hours_left)) + ' ساعة.'
              : 'وصولك المجاني ينتهي قريبًا.' })
        ]));
      } else if (!a.allowed){
        // القاعدة رفضت رغم تخميننا — قرارها هو النافذ
        const p = trialSlot.closest('#main') || trialSlot.parentNode;
        if (p){
          p.innerHTML = '';
          p.appendChild(a.reason === 'trial_expired'
            ? QBANK.trial.expiredCard(sub) : QBANK.gate.paywallCard(sub));
        }
      }
    });

    QBANK.data.subjectQuestions(sid).then(r => {
      if (!body.isConnected) return;
      body.innerHTML = '';
      if (!r.ok && !r.data.length) {
        body.appendChild(QBANK.views.empty('⇣', 'الأسئلة لم تُنزَّل بعد',
          'افتح المادة مرة واحدة بإنترنت لتُخزَّن أسئلتها في جهازك، ثم تعمل بلا اتصال.'));
        return;
      }
      const qs = r.data;
      const fill = { overview: overviewTab, explain: explainTab, bank: bankTab, memo: memoTab }[active];
      body.appendChild(fill(sub, qs));
    });

    const printBtn = el('button', { class:'copybtn', type:'button', text:'🖨 طباعة / PDF' });
    printBtn.addEventListener('click', () => QBANK.views.openPrintDialog(sub));
    /*
      ★ «انشر» لا «انسخ».
      النسخ يطلب من الطالب ثلاث خطوات: ينسخ، ويفتح واتساب، ويلصق — ويسقط
      بعضهم في كل واحدة. ونافذة النظام تفعلها بضغطة وتعرض تطبيقاته كلها.
      والرابط يحمل معرّف الرافع (ref) فتُنسب إليه الإحالة كما كان.
    */
    const shareBtn = el('button', { class:'copybtn', type:'button', text:'⤴ انشر المادة' });
    shareBtn.addEventListener('click', async () => {
      const me = QBANK.api.user();
      const url = (sub.slug && QBANK.share)
        ? QBANK.share.shareUrl(sub.slug, me && me.id)
        : QBANK.share.absUrl('#/subject/' + sid);
      const r = await QBANK.share.sharePlain(url, sub.name,
        'بنك أسئلة «' + sub.name + '» على مراجعة');
      if (r.ok && r.via === 'copy') QBANK.toast('نُسخ رابط المادة');
      else if (!r.ok && !r.cancelled) QBANK.toast('تعذّرت المشاركة');
    });

    /*
      رأس AMSU: تدرّج بلون المادة من حافة الشاشة لحافتها، أيقونة في صندوق
      زجاجي، الاسم وتحته الإنجليزي، رقائق إحصائية، وزر الاختبار على الطرف.
    */
    const nTopics = (sub.topics && sub.topics.length) || 0;
    const hero = el('section', { class:'sub-hero', style:'--acc:' + subjectColor(sub.color) }, [
      el('div', { class:'wrap' }, [
        el('div', { class:'herotop' }, [
          el('a', { class:'backbtn', href:'#/', text:'‹ كل المواد' }),
          el('div', { class:'topacts' }, [shareBtn, printBtn])
        ]),
        el('div', { class:'inner' }, [
          el('div', { class:'figwrap', 'aria-hidden':'true' }, [
            el('span', { class:'fig', text: sub.icon || '▤' })
          ]),
          el('div', { class:'hx' }, [
            el('h2', { text: sub.name }),
            sub.name_en ? el('div', { class:'sub ltr', text: sub.name_en }) : null,
            el('div', { class:'stats num' }, [
              el('span', { class:'stat', text: QBANK.views.arNum(sub.q_count || 0) + ' سؤالًا' }),
              nTopics ? el('span', { class:'stat', text: QBANK.views.arNum(nTopics) + ' محاور' }) : null,
              sub.free ? el('span', { class:'stat', text:'مجانية' }) : null
            ])
          ]),
          el('a', { class:'hero-exam', href:'#/exam/' + sid }, [
            el('span', {}, [
              document.createTextNode('اختبار تجريبي'),
              el('small', { text:'في هذه المادة' })
            ])
          ])
        ])
      ])
    ]);

    return el('div', { class:'page page--subject' }, [
      hero,
      /* ★ «رفعها فلان» — المحتوى من الطلاب، فليُعرف صاحبه ويُقيَّم */
      QBANK.views.uploaderLine ? QBANK.views.uploaderLine(sid) : null,
      trialSlot,
      /* عدّاد كل طالبٍ لموعده هو — الشُّعب تختلف، وموعدك لا يخص زميلك */
      QBANK.examDate ? QBANK.examDate.band(sid) : null,
      tabs, body
    ]);
  }
};
QBANK.views.ViewSubject = ViewSubject;
QBANK.views.bankTab = bankTab;
