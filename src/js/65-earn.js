/*
  ═══════════════════════════════════════════════════════════════════
  أرباح الرافع — نصيبه من كل عملية بيع لمادته
  ═══════════════════════════════════════════════════════════════════
  السعر ١٠٠٪ · التكاليف ٦٠٪ · صافي الربح ٤٠٪ · للرافع ٢٠٪ من السعر.
  و٢٠ من ٤٠ نصفُها — فنصيب الرافع نصفُ صافي الربح.

  ★ ونعرض الرقمين معًا لا أحدهما.
  «٥٠٪ من صافي الربح» صحيحٌ ويُغري، و«٢٠٪ من سعر البيع» صحيحٌ ويُوضّح.
  وعرضُ الأول وحده يجعل الرافع يحسب نصفَ ما دفعه الطالب فيطالب به بعد
  شهر، والخلاف حينها لا يُحسم لأن كلينا يقرأ الجملة نفسها بمعنى مختلف.
  ولذلك يُكتب معهما نصيبُه ريالًا صريحًا من كل عملية — والرقم الصريح لا
  يُختلف عليه، وهو أبلغُ في الإقناع من أي نسبة.
*/

const Earn = {
  data: null,

  load(){
    return QBANK.api.rpc('my_earnings', { p_limit: 20 }).then(r => {
      Earn.data = (r.ok && r.data && !r.data.error) ? r.data : null;
      return { r, d: Earn.data };
    });
  },

  money(h){ return QBANK.pay ? QBANK.pay.money(h, 'SAR') : ((Number(h) || 0) / 100) + ' ريال'; },

  /* نصيب الرافع من سعر مادةٍ بعينها — بالهللات */
  shareOf(priceSar, pct){
    const gross = Math.max(0, Number(priceSar) || 0) * 100;
    return Math.floor(gross * (Number(pct) || 0) / 100);
  },

  /*
    جملة الشرط. تُقرأ من القاعدة لا تُكتب هنا: النسبة قد يغيّرها المشرف،
    ونصٌّ ثابت في الواجهة كان سيقول رقمًا غير الذي يُحسب — وهذا أسوأ من
    ألّا يُقال شيء.
  */
  terms(d){
    if (!d) return '';
    return 'نصيبك ' + QBANK.views.arNum(d.of_net_pct) + '٪ من صافي الربح — ' +
           'أي ' + QBANK.views.arNum(d.share_pct) + '٪ من سعر البيع.';
  },

  /* مثالٌ من مواده هو أصدق من مثالٍ مفترض */
  example(d){
    const u = QBANK.api.user();
    if (!u || !d) return '';
    const mine = (QBANK.data.pack().subjects || [])
      .filter(s => s.created_by === u.id && !s.free && Number(s.price) > 0);
    if (!mine.length) return '';
    const s = mine[0];
    return 'مثال: «' + s.name + '» بـ' + QBANK.views.arNum(s.price) + ' ريالًا — ' +
           'تأخذ ' + Earn.money(Earn.shareOf(s.price, d.share_pct)) + ' من كل عملية.';
  },

  WHY: {
    auth:         'سجّل دخولك أولًا.',
    closed:       'التحويلات موقوفة مؤقتًا — رصيدك محفوظ.',
    no_handle:    'اكتب الآيبان أو رقم STC Pay.',
    below_min:    'المبلغ أقل من الحدّ الأدنى للتحويل.',
    insufficient: 'رصيدك أقل من المبلغ المطلوب.'
  },
  why(reason){ return Earn.WHY[reason] || 'تعذّر إرسال الطلب.'; }
};
QBANK.earn = Earn;

/* ═══════════════ سطر الوعد في شاشة الرفع ═══════════════ */
function earnPromise(){
  const box = el('div', { class:'card earnvow' });
  const line = el('p', { class:'earnvow__t', text:'مادتك قد تُدرّ عليك دخلًا.' });
  const sub = el('p', { class:'field__hint', style:'margin:4px 0 0' });
  box.appendChild(el('span', { class:'earnvow__i', 'aria-hidden':'true', text:'◈' }));
  box.appendChild(el('div', {}, [line, sub]));

  Earn.load().then(({ d }) => {
    if (!alive()) return;
    if (!d) { sub.textContent = 'كل عملية بيع لمادتك تُعطيك نصيبًا يظهر في محفظتك.'; return; }
    sub.textContent = Earn.terms(d) + ' يُضاف إلى رصيدك في المحفظة فور كل عملية.';
  });
  return box;
}
QBANK.views.earnPromise = earnPromise;

/* ═══════════════ بطاقة الأرباح في المحفظة ═══════════════ */
function earnCard(){
  const box = el('div', { class:'card stack' });
  box.appendChild(el('h2', { style:'margin:0', text:'أرباح موادي' }));
  const body = el('div', { class:'stack' });
  box.appendChild(body);
  body.appendChild(el('p', { class:'field__hint', style:'margin:0', text:'جارٍ التحميل…' }));

  Earn.load().then(({ r, d }) => {
    if (!alive()) return;
    body.innerHTML = '';
    if (!d){
      /* دالةٌ غير موجودة تُقال باسم علاجها — لا «تعذّر» يقف بلا باب */
      const m = String((r.data && (r.data.message || r.data.hint)) || '');
      body.appendChild(el('p', { class:'field__hint' + (r.ok ? '' : ' is-bad'), style:'margin:0',
        text: (!r.ok && (/does not exist|Could not find the function/i.test(m) ||
               (r.data && r.data.code === 'PGRST202')))
          ? 'دالة الأرباح غير موجودة في القاعدة — نفّذ ملف db/PAYOUT.sql.'
          : 'تعذّر جلب أرباحك الآن.' }));
      return;
    }

    /* الرصيد أولًا وبأكبر خط: هو الرقم الذي فُتحت الصفحة لأجله */
    body.appendChild(el('div', { class:'earnbal' }, [
      el('span', { class:'earnbal__n num', text: Earn.money(d.balance) }),
      el('span', { class:'earnbal__l', text:'رصيدك القابل للتحويل' })
    ]));

    const facts = el('div', { class:'earnfacts' }, [
      el('span', { class:'badge num', text:'مجموع ما ربحت: ' + Earn.money(d.total) }),
      d.pending ? el('span', { class:'badge badge--warn num',
        text:'قيد التحويل: ' + Earn.money(d.pending) }) : null
    ]);
    body.appendChild(facts);

    body.appendChild(el('p', { class:'field__hint', style:'margin:0', text: Earn.terms(d) }));
    const ex = Earn.example(d);
    if (ex) body.appendChild(el('p', { class:'field__hint', style:'margin:0', text: ex }));

    /* ═══ لكل مادة نصيبها ═══ */
    const bys = Array.isArray(d.by_subject) ? d.by_subject : [];
    if (bys.length){
      body.appendChild(el('h3', { style:'margin:8px 0 0', text:'لكل مادة' }));
      bys.forEach(s => {
        body.appendChild(el('div', { class:'payrow' }, [
          el('span', { class:'payrow__t', text: s.name }),
          el('span', { class:'badge num', text: QBANK.views.arNum(s.sales) + ' عملية' }),
          el('span', { class:'badge badge--ok num', text: Earn.money(s.halalas) })
        ]));
      });
    } else {
      body.appendChild(el('p', { class:'field__hint', style:'margin:0', text:
        'لم تُبَع مادةٌ لك بعد. ارفع مادة وضع لها سعرًا — أو شارك رابطها في دفعتك.' }));
    }

    /* ═══ طلب التحويل ═══ */
    if (!d.open){
      body.appendChild(el('p', { class:'field__hint', style:'margin:0',
        text:'التحويلات موقوفة مؤقتًا. رصيدك محفوظ ولا يتأثر.' }));
    } else if (d.balance < d.min){
      /* ★ الحدّ يُقال بالباقي لا بالحدّ وحده: «١٠٠ ريال» تجعله يحسب،
         و«بقي ٤٢ ريالًا» تقول له كم اقترب. */
      body.appendChild(el('p', { class:'field__hint', style:'margin:0', text:
        'أقل مبلغ للتحويل ' + Earn.money(d.min) + ' — بقي ' +
        Earn.money(d.min - d.balance) + '.' }));
    } else {
      body.appendChild(payoutForm(d));
    }

    /* ═══ طلباتي السابقة ═══ */
    const ps = Array.isArray(d.payouts) ? d.payouts : [];
    if (ps.length){
      body.appendChild(el('h3', { style:'margin:8px 0 0', text:'طلبات التحويل' }));
      const L = { requested:['badge--warn','قيد المراجعة'], paid:['badge--ok','حُوّل'],
                  rejected:['badge--bad','مرفوض'] };
      ps.forEach(p => {
        const st = L[p.status] || ['', p.status];
        body.appendChild(el('div', { class:'payrow' }, [
          el('span', { class:'payrow__t num', text: Earn.money(p.amount) }),
          el('span', { class:'badge ' + st[0], text: st[1] }),
          p.note ? el('span', { class:'field__hint', style:'margin:0', text: p.note }) : null,
          el('span', { class:'payrow__d num',
            text: (function(){ try { return new Date(p.at).toLocaleDateString('ar-SA-u-nu-latn'); }
                               catch(e){ return ''; } })() })
        ]));
      });
    }
  });

  return box;
}

function payoutForm(d){
  const wrap = el('div', { class:'stack' });
  const msg = el('p', { class:'field__hint', role:'status', style:'margin:0' });

  const amtIn = el('input', { class:'input num', type:'number', inputmode:'numeric',
    min: String(Math.ceil(d.min / 100)), max: String(Math.floor(d.balance / 100)),
    value: String(Math.floor(d.balance / 100)), 'aria-label':'المبلغ بالريال' });

  const methodSel = el('select', { class:'input', 'aria-label':'طريقة التحويل' }, [
    el('option', { value:'bank',   text:'تحويل بنكي (آيبان)' }),
    el('option', { value:'stcpay', text:'STC Pay' })
  ]);

  const handleIn = el('input', { class:'input', type:'text', maxlength:'60',
    dir:'ltr', autocomplete:'off', placeholder:'SA00 0000 0000 0000 0000 0000',
    'aria-label':'الآيبان أو رقم STC Pay' });
  const paintHandle = () => {
    handleIn.placeholder = methodSel.value === 'stcpay'
      ? '05XXXXXXXX' : 'SA00 0000 0000 0000 0000 0000';
  };
  methodSel.addEventListener('change', paintHandle); paintHandle();

  const send = el('button', { class:'btn btn--block', type:'button', text:'اطلب التحويل' });
  send.addEventListener('click', async () => {
    const halalas = Math.round((parseFloat(amtIn.value || '0') || 0) * 100);
    send.disabled = true; msg.className = 'field__hint'; msg.textContent = 'جارٍ الإرسال…';
    const r = await QBANK.api.rpc('request_payout', {
      p_amount: halalas, p_method: methodSel.value, p_handle: handleIn.value || '' });
    send.disabled = false;
    const x = (r.ok && r.data) ? r.data : null;
    if (x && x.ok){
      msg.className = 'field__hint is-ok';
      msg.textContent = 'وصل طلبك. يُحوَّل خلال أيام، وستراه هنا «حُوّل».';
      send.hidden = true;
      /* الرصيد نقص فعلًا في القاعدة — نعيد الرسم كي لا يبقى الرقم القديم
         على الشاشة فيطلبه صاحبه مرة أخرى */
      setTimeout(() => QBANK.router.render(location.hash), 1200);
      return;
    }
    msg.className = 'field__hint is-bad';
    msg.textContent = Earn.why(x && x.reason);
  });

  wrap.appendChild(el('h3', { style:'margin:8px 0 0', text:'اطلب تحويل رصيدك' }));
  wrap.appendChild(el('div', { class:'ad-grid2' }, [
    el('label', { class:'field' }, [ el('span', { class:'field__label', text:'المبلغ (ريال)' }), amtIn ]),
    el('label', { class:'field' }, [ el('span', { class:'field__label', text:'الطريقة' }), methodSel ])
  ]));
  wrap.appendChild(el('label', { class:'field' }, [
    el('span', { class:'field__label', text:'الآيبان أو رقم STC Pay' }), handleIn ]));
  wrap.appendChild(send);
  wrap.appendChild(msg);
  return wrap;
}
QBANK.views.earnCard = earnCard;

/* ═══════════════ لوحة المشرف: طلبات التحويل ═══════════════ */
function adminPayoutsCard(){
  const box = el('div', { class:'card stack' });
  box.appendChild(el('h2', { style:'margin:0', text:'أرباح الرافعين والتحويلات' }));
  const sum = el('p', { class:'field__hint', style:'margin:0', role:'status' });
  const list = el('div', { class:'stack' });
  box.appendChild(sum);
  box.appendChild(list);

  let status = 'requested';
  const chips = el('div', { class:'ex-chips', role:'group', 'aria-label':'تصفية طلبات التحويل' });
  [['requested','قيد المراجعة'],['paid','حُوّل'],['rejected','مرفوض'],['','الكل']].forEach(t => {
    const b = el('button', { class:'chip' + (t[0] === status ? ' is-on' : ''), type:'button',
      'data-s': t[0], text: t[1] });
    b.addEventListener('click', () => {
      status = t[0];
      chips.querySelectorAll('.chip').forEach(x =>
        x.classList.toggle('is-on', x.getAttribute('data-s') === status));
      draw();
    });
    chips.appendChild(b);
  });
  box.insertBefore(chips, list);

  function paintSummary(){
    QBANK.api.rpc('admin_earnings_summary').then(r => {
      if (!alive()) return;
      const d = (r.ok && r.data && !r.data.error) ? r.data : null;
      if (!d) { sum.textContent = ''; return; }
      const M = h => Earn.money(h);
      /* ★ «مستحقّ عليك» رقمٌ التزامي لا إحصائي: هو ما في جيوب الرافعين
         عندك، ويجب أن يُرى بجانب ما بِعت لا في صفحة أخرى. */
      sum.textContent = 'مبيعات ' + QBANK.views.arNum(d.sales) + ' · إجمالي ' + M(d.gross) +
        ' · نصيب الرافعين ' + M(d.owed) + ' · أرصدة لديهم ' + M(d.balances) +
        ' · مطلوب تحويله ' + M(d.requested) + ' · حُوّل ' + M(d.paid);
    });
  }
  paintSummary();

  let seq = 0;
  function draw(){
    const mine = ++seq;
    list.innerHTML = '';
    list.appendChild(el('p', { class:'field__hint', style:'margin:0', text:'جارٍ التحميل…' }));
    QBANK.api.rpc('admin_payouts', { p_status: status }).then(r => {
      if (mine !== seq || !alive()) return;
      list.innerHTML = '';
      if (!r.ok || !Array.isArray(r.data)){
        list.appendChild(el('p', { class:'field__hint is-bad', style:'margin:0',
          text:'تعذّر جلب الطلبات — تأكّد من تنفيذ db/PAYOUT.sql.' }));
        return;
      }
      if (!r.data.length){
        list.appendChild(el('p', { class:'field__hint', style:'margin:0',
          text: status === 'requested' ? 'لا طلبات معلّقة.' : 'لا شيء هنا.' }));
        return;
      }
      r.data.forEach(p => {
        const row = el('div', { class:'payrow' }, [
          el('span', { class:'payrow__t', text: (p.name || 'بلا اسم') }),
          el('span', { class:'badge num', text: Earn.money(p.amount) }),
          el('span', { class:'badge', text: p.method === 'stcpay' ? 'STC Pay' : 'آيبان' })
        ]);
        /*
          ★ الآيبان معروض لأنه سبب وجود الصفّ.
          إخفاؤه خلف نقرةٍ يجعل المشرف ينسخ عشرين مرة من عشرين نافذة.
          وهو لا يصل إلا هنا: الجدول بلا سياسة قراءة، والدالة تسأل is_admin.
        */
        const det = el('div', { class:'codeuse' }, [
          el('span', { class:'codeuse__i', 'aria-hidden':'true', text:'↳' }),
          el('span', { class:'codeuse__e num', text: p.handle || '—' }),
          el('span', { class:'codeuse__n', text: p.email || '' })
        ]);
        const blk = el('div', { class:'codeblk' }, [row, det]);

        if (p.status === 'requested'){
          const ok = el('button', { class:'btn btn--sm', type:'button', text:'حُوّل',
            'aria-label':'أكّد تحويل ' + Earn.money(p.amount) + ' إلى ' + (p.name || 'الرافع') });
          const no = el('button', { class:'btn btn--ghost btn--sm', type:'button', text:'ارفض',
            'aria-label':'ارفض طلب ' + (p.name || 'الرافع') + ' وأعد المبلغ إلى رصيده' });
          const set = async (st) => {
            ok.disabled = no.disabled = true;
            const rr = await QBANK.api.rpc('admin_set_payout', { p_id: p.id, p_status: st, p_note: '' });
            if (rr.ok && rr.data && rr.data.ok){
              QBANK.toast(st === 'paid' ? 'سُجّل التحويل' : 'رُفض وأُعيد المبلغ');
              paintSummary(); draw();
            } else {
              ok.disabled = no.disabled = false;
              QBANK.toast('تعذّر التعديل');
            }
          };
          ok.addEventListener('click', () => set('paid'));
          no.addEventListener('click', () => set('rejected'));
          row.appendChild(ok); row.appendChild(no);
        } else {
          const L = { paid:['badge--ok','حُوّل'], rejected:['badge--bad','مرفوض'] };
          const st = L[p.status] || ['', p.status];
          row.appendChild(el('span', { class:'badge ' + st[0], text: st[1] }));
        }
        list.appendChild(blk);
      });
    });
  }
  draw();

  return box;
}
QBANK.views.adminPayoutsCard = adminPayoutsCard;
