/*
  الدفع — الطبقة التي تحوّل المنصة من مشروع إلى عمل.

  ثلاثة مبادئ في هذا الملف:

  ١ · لا يُرسل المتصفح مبلغًا قط. يقول «هذه الباقة» أو «هذه المادة»،
      والقاعدة تحسب السعر وتُجمّده. مبلغٌ يأتي من المتصفح يعني مادة بريال.

  ٢ · شاشة العودة تسأل الخادم لا نفسها. الطالب قد يعود بعنوان يقول
      «نجح» وهو لم يدفع — والحقيقة عند البوابة وحدها.

  ٣ · كل مبلغ يُعرض بالريال لا بالهللات. الهللة وحدة تخزين لا وحدة عرض.
*/
const Pay = {
  /* الهللات وحدة تخزين — نخزّن بها كي لا نجمع كسورًا عشرية، ونعرض بالريال */
  money(halalas, currency){
    const v = (Number(halalas) || 0) / 100;
    const s = QBANK.views.arNum(v % 1 === 0 ? String(v) : v.toFixed(2)).replace('.', '٫');
    return s + ' ' + (currency === 'SAR' || !currency ? 'ريال' : currency);
  },

  options(){ return QBANK.api.rpc('pay_options'); },
  history(){ return QBANK.api.rpc('my_payments', { p_limit: 20 }); },
  status(id){ return QBANK.api.rpc('payment_status', { p_payment: id }); },

  /* ★ مصدر واحد للإحالة: مخزن البوابة نفسه الذي يلتقطها من #s/slug?ref=…
     مفتاحٌ ثانٍ يعني إحالة تُلتقط ولا تُقرأ، ومكافأةً لا تصل صاحبها. */
  referrer(){ return (QBANK.gate && QBANK.gate.ref && QBANK.gate.ref()) || null; },

  /* الأصل الذي تعود إليه البوابة — بنفس حارس shareUrl */
  origin(){
    try {
      if (typeof location !== 'undefined' && location.protocol.indexOf('http') === 0)
        return location.href.split('#')[0].replace(/\/$/, '');
    } catch(e){}
    return 'https://amsuq.alsoqoor.com';
  },

  /*
    الانتقال إلى صفحة البوابة.
    ★ يُنادى داخل .then بعد رحلة شبكة — وقد يكون المستند قد فُكِّك في
    تلك الأثناء (أغلق الطالب التبويب، أو انتقل قبل أن يعود الردّ).
    والكتابة على وصف مفكَّك ترمي استثناءً يُسقط كل ما يليه.
  */
  goTo(url){
    try { location.href = url; return true; } catch(e){ return false; }
  },

  async start(payload){
    return QBANK.admin.server('/api/pay',
      Object.assign({ origin: Pay.origin(), ref: Pay.referrer() }, payload));
  },

  async confirm(chargeId){
    return QBANK.admin.server('/api/pay', { action:'confirm', charge_id: chargeId });
  },

  /* قيمة الباقة: كم سؤالًا يُثري بها الطالب — الرقم الذي يفهمه فعلًا */
  questionsFor(coins, costPerQ){
    const c = Math.max(1, Number(costPerQ) || 1);
    return Math.floor((Number(coins) || 0) / c);
  }
};

/* ═══ متجر الكوينز ═══ */
function coinShop(){
  const box = el('div', { class:'card stack' });
  const msg = el('p', { class:'field__hint', role:'status', style:'margin:0' });
  const grid = el('div', { class:'lp-grid lp-grid--3' });

  box.appendChild(el('h2', { style:'margin:0', text:'اشترِ رصيدًا' }));
  box.appendChild(el('p', { class:'field__hint', style:'margin:0',
    text:'الرصيد يُنفَق على إثراء موادك بالشرح وبطاقات الحفظ. والنشر بلا إثراء مجاني دائمًا.' }));
  box.appendChild(grid);
  box.appendChild(msg);

  grid.appendChild(el('p', { class:'page__sub', text:'جارٍ التحميل…' }));
  Pay.options().then(r => {
    if (!grid.isConnected) return;
    grid.innerHTML = '';
    const d = (r.ok && r.data) ? r.data : null;
    if (!d || !d.open){
      // ★ نقول «موقوف» لا نُخفي الزر: الطالب الذي يبحث عن الشراء ولا يجده يظنّه عطلًا
      grid.appendChild(QBANK.views.empty('◔', 'الشراء موقوف مؤقتًا',
        'رصيدك الحالي يبقى كما هو، وما اشتريته سابقًا لا يتأثر.'));
      return;
    }
    const packs = Array.isArray(d.packages) ? d.packages : [];
    if (!packs.length){
      grid.appendChild(QBANK.views.empty('◔', 'لا باقات معروضة', 'يضبطها المشرف من الإعدادات.'));
      return;
    }
    // الأكبر «الأوفر»: نحسبها ولا نكتبها يدويًا كي لا تكذب حين تتغير الأسعار
    const best = packs.reduce((a, b) =>
      (b.halalas / b.coins) < (a.halalas / a.coins) ? b : a, packs[0]);

    packs.forEach(p => {
      const isBest = p.coins === best.coins && packs.length > 1;
      const card = el('div', { class:'pack' + (isBest ? ' pack--best' : '') }, [
        isBest ? el('span', { class:'pack__tag', text:'الأوفر' }) : null,
        el('span', { class:'pack__n num', text: QBANK.views.arNum(p.coins) }),
        el('span', { class:'pack__u', text:'كوين' }),
        el('span', { class:'pack__q', text:'≈ ' + QBANK.views.arNum(Pay.questionsFor(p.coins, d.cost_per_q)) + ' سؤالًا مُثرى' }),
        el('span', { class:'pack__p', text: Pay.money(p.halalas, d.currency) })
      ]);
      const buy = el('button', { class:'btn btn--sm btn--block', type:'button', text:'اشترِ' });
      buy.addEventListener('click', () => {
        buy.disabled = true; msg.className = 'field__hint'; msg.textContent = 'جارٍ فتح صفحة الدفع…';
        Pay.start({ kind:'coins', coins: p.coins }).then(r => {
          buy.disabled = false;
          if (r.ok && r.data && r.data.url){ Pay.goTo(r.data.url); return; }
          msg.className = 'field__hint is-bad';
          msg.textContent = (r.data && r.data.error) || 'تعذّر فتح صفحة الدفع.';
        });
      });
      card.appendChild(buy);
      grid.appendChild(card);
    });
  });
  return box;
}

/* ═══ زرّ شراء مادة ═══ */
function buySubjectButton(sub){
  if (!sub || sub.free || !sub.price) return null;
  /*
    ★ المُحيل سمةٌ على الزر لا في جسم الطلب وحده.
    الطلب يحمله فعلًا، لكن السمة تجعل الإحالة مرئية في الصفحة: تُفحَص
    آليًا، ويُشخَّص «لماذا لم تصل كوينز فلان؟» بالنظر لا بالتخمين.
  */
  const b = el('button', { class:'btn btn--block', type:'button',
    'data-buy': sub.id, 'data-ref': Pay.referrer() || null,
    text:'اشترِ المادة — ' + Pay.money(Number(sub.price) * 100, 'SAR') });
  const msg = el('p', { class:'field__hint', role:'status', style:'margin:8px 0 0' });
  b.addEventListener('click', () => {
    b.disabled = true; msg.className = 'field__hint'; msg.textContent = 'جارٍ فتح صفحة الدفع…';
    Pay.start({ kind:'subject', subject_id: sub.id }).then(r => {
      b.disabled = false;
      if (r.ok && r.data && r.data.url){ Pay.goTo(r.data.url); return; }
      /*
        ★ بوابة غير مفعَّلة ليست خطأً عابرًا يُعاد بعده المحاولة.
        الخادم يردّ ٥٠٣ حين لا يكون TAP_SECRET_KEY مضبوطًا، وذلك حالٌ يدوم
        أيامًا حتى يُفتح الحساب التجاري. فإبقاء الزرّ يدعو الطالب إلى ضغطةٍ
        لن تنجح مهما كرّرها. نُخفيه ونُحيله إلى الطريق الذي يعمل اليوم.
      */
      if (r.status === 503){
        Pay.gatewayOff = true;
        b.hidden = true;
        msg.className = 'field__hint';
        msg.textContent = 'الدفع المباشر لم يُفتح بعد — فعّل المادة برمز، أو اطلبه من المشرف بالزر أدناه.';
        return;
      }
      msg.className = 'field__hint is-bad';
      msg.textContent = (r.data && r.data.error) || 'تعذّر فتح صفحة الدفع.';
    });
  });
  return el('div', {}, [b, msg]);
}

/* ═══ سجل الدفعات ═══ */
function payHistory(){
  const box = el('div', { class:'card stack' });
  box.appendChild(el('h2', { style:'margin:0', text:'مشترياتي' }));
  const list = el('div', { class:'stack' });
  box.appendChild(list);

  Pay.history().then(r => {
    if (!list.isConnected) return;
    const rows = (r.ok && Array.isArray(r.data)) ? r.data : [];
    if (!rows.length){
      list.appendChild(el('p', { class:'field__hint', style:'margin:0', text:'لا مشتريات بعد.' }));
      return;
    }
    const label = { paid:['badge--ok','مدفوعة'], pending:['badge--warn','معلّقة'], failed:['badge--bad','فاشلة'] };
    rows.forEach(p => {
      const st = label[p.status] || ['', p.status];
      list.appendChild(el('div', { class:'payrow' }, [
        el('span', { class:'payrow__t', text: p.kind === 'coins'
          ? QBANK.views.arNum(p.coins) + ' كوين' : (p.subject || 'مادة') }),
        el('span', { class:'badge num', text: Pay.money(p.amount_halalas, p.currency) }),
        el('span', { class:'badge ' + st[0], text: st[1] }),
        el('span', { class:'payrow__d num', text: new Date(p.created_at).toLocaleDateString('ar') })
      ]));
    });
  });
  return box;
}

/* ═══ شاشة العودة من البوابة ═══ */
function ViewPayReturn(route){
  const id = (route.rest && route.rest[0]) || '';
  const box = el('div', { class:'card stack', style:'text-align:center' });
  box.appendChild(el('p', { class:'page__sub', text:'نتحقق من دفعتك…' }));

  /*
    ★ لا نصدّق العنوان.
    Tap تُعيد الطالب بمعامل tap_id، وقد يكتب أي أحد عنوانًا يقول «نجح».
    فنُرسل المعرّف إلى خادمنا، وهو يسأل Tap مباشرة ثم يُسوّي. ثم نسأل
    القاعدة عن حالة الصفّ — والقاعدة لا تُغيّرها إلا التسوية المؤكدة.
  */
  const tapId = route.query && (route.query.tap_id || route.query.charge_id);

  const paint = d => {
    box.innerHTML = '';
    if (d && d.status === 'paid'){
      box.appendChild(el('p', { style:'font-size:2.4rem;margin:0', text:'✓' }));
      box.appendChild(el('h2', { style:'margin:0', text:'تمّت العملية' }));
      box.appendChild(el('p', { class:'field__hint', style:'margin:0', text: d.kind === 'coins'
        ? 'أُضيف ' + QBANK.views.arNum(d.coins) + ' كوين إلى رصيدك.'
        : 'صارت المادة متاحة لك.' }));
      box.appendChild(el('a', { class:'btn', href: d.kind === 'coins' ? '#/account' : ('#/subject/' + d.subject_id),
        text: d.kind === 'coins' ? 'إلى محفظتي' : 'افتح المادة' }));
      QBANK.data.sync && QBANK.data.sync();
      return;
    }
    if (d && d.status === 'failed'){
      box.appendChild(el('p', { style:'font-size:2.4rem;margin:0', text:'✕' }));
      box.appendChild(el('h2', { style:'margin:0', text:'لم تكتمل العملية' }));
      box.appendChild(el('p', { class:'field__hint', style:'margin:0',
        text: d.reason || 'لم يُخصم منك شيء. جرّب مرة أخرى.' }));
      box.appendChild(el('a', { class:'btn btn--ghost', href:'#/account', text:'إلى محفظتي' }));
      return;
    }
    // معلّقة: البوابة قد تتأخر ثوانيَ — نقول ذلك ولا ندّعي فشلًا
    box.appendChild(el('p', { style:'font-size:2.4rem;margin:0', text:'◔' }));
    box.appendChild(el('h2', { style:'margin:0', text:'دفعتك قيد التأكيد' }));
    box.appendChild(el('p', { class:'field__hint', style:'margin:0',
      text:'قد تستغرق البوابة لحظات. سيصلك ما اشتريته تلقائيًا فور تأكيدها — لا تدفع مرة أخرى.' }));
    const again = el('button', { class:'btn btn--ghost btn--sm', type:'button', text:'تحقّق الآن' });
    again.addEventListener('click', () => run());
    box.appendChild(again);
  };

  function run(){
    const after = () => Pay.status(id).then(s => {
      if (!box.isConnected) return;
      paint(s.ok && s.data && s.data.ok ? s.data : null);
    });
    if (tapId) Pay.confirm(tapId).then(after, after);
    else after();
  }
  if (id) run(); else paint(null);

  return QBANK.views.page('الدفع', null, [box]);
}

/*
  ★ أسماء التصدير لا تدهس أسماء الجلب.
  كان هنا QBANK.pay.history = payHistory فدهس Pay.history — دالة جلب
  السجل من القاعدة — فصارت payHistory تنادي نفسها بلا نهاية وتنهار
  الصفحة كاملة. الفرق حرفٌ في اسم، والأثر شاشة بيضاء.
*/
QBANK.pay = Pay;
QBANK.pay.coinShop = coinShop;
QBANK.pay.buySubjectButton = buySubjectButton;
QBANK.pay.historyCard = payHistory;
QBANK.views.ViewPayReturn = { title:'الدفع', view: ViewPayReturn };
