/*
  ═══════════════════════════════════════════════════════════════════
  طلب الشراء داخل المنصة — البيعة بخطوتين بدل خمس
  ═══════════════════════════════════════════════════════════════════
  كان: يحوّل الطالب ← يراسل ← يولّد المشرف رمزًا ← يرسله ← يُدخله الطالب.
  صار: زرّ «حوّلتُ» يُسجّل طلبًا في القاعدة ثم يفتح واتساب — فيرى المشرف
  الطلب في لوحته ويضغط «افتح له». والرمز لم يعد في الطريق ليضيع.

  ★ الطلب يُسجَّل قبل واتساب لا بعده.
  لو انتظرنا رجوع الطالب من واتساب لما رجع كثيرون — أرسلوا الإيصال وأغلقوا.
  والطلب في القاعدة هو ما يجعل الإيصال الذي وصل بلا اسمٍ واضح يجد صاحبه.
*/

const Orders = {
  KEY: 'purchase_requests',
  list(){ return QBANK.store.get(Orders.KEY, []); },

  /*
    نسخة الجهاز تُقرأ فورًا كي لا تومض البطاقة، وتُصحَّح من القاعدة حين
    يصل الردّ — وإن اختلفتا أُعيد الرسم. ولا حلقة: الرسم الثاني يجد
    النسختين متطابقتين فيسكت.
  */
  refresh(onChange){
    if (!QBANK.api.user()) return Promise.resolve(false);
    return QBANK.api.rpc('my_purchase_requests').then(r => {
      if (!r.ok || !Array.isArray(r.data)) return false;
      const before = JSON.stringify(Orders.list());
      const after  = JSON.stringify(r.data);
      if (before === after) return false;
      QBANK.store.set(Orders.KEY, r.data);
      if (onChange) onChange();
      return true;
    });
  },

  pendingFor(subjectId){
    return Orders.list().filter(x => x.subject_id === subjectId && x.status === 'pending')[0] || null;
  },
  lastFor(subjectId){
    return Orders.list().filter(x => x.subject_id === subjectId)[0] || null;
  },

  create(subjectId){
    return QBANK.api.rpc('request_purchase', { p_subject: subjectId }).then(r => {
      const d = (r.ok && r.data) ? r.data : null;
      if (d && d.ok){
        /* نُثبت الطلب محليًا فورًا: الطالب عائدٌ من واتساب بعد ثوانٍ، ويجب
           أن يجد «قيد المراجعة» لا الأزرار نفسها فيظنّ أن شيئًا لم يُسجَّل. */
        const cur = Orders.list().filter(x => !(x.subject_id === subjectId && x.status === 'pending'));
        cur.unshift({ id: d.id, subject_id: subjectId, status:'pending',
                      amount_halalas: d.amount_halalas || 0, at: new Date().toISOString() });
        QBANK.store.set(Orders.KEY, cur);
      }
      return d;
    });
  },

  eta(){
    const s = (QBANK.data.pack().settings) || {};
    return String(s.review_eta || 'قريبًا');
  },

  /* ما يراه الطالب بدل الأزرار بعد أن طلب */
  waitingBand(sub, req){
    const at = req && req.at ? new Date(req.at) : null;
    return el('div', { class:'card orderwait' }, [
      el('span', { class:'orderwait__i', 'aria-hidden':'true', text:'◔' }),
      el('div', { class:'orderwait__x' }, [
        el('p', { class:'orderwait__t', text:'طلبك قيد المراجعة' }),
        el('p', { class:'field__hint', style:'margin:0', text:
          'وصلنا أنك حوّلتَ ثمن «' + sub.name + '». يفتحها لك المشرف ' + Orders.eta() + '.' }),
        at ? el('p', { class:'field__hint num', style:'margin:4px 0 0',
          text:'أُرسل ' + QBANK.admin.charts.ago(at.toISOString()) }) : null,
        el('p', { class:'field__hint', style:'margin:4px 0 0', text:
          'لم ترسل صورة الإيصال بعد؟ أرسلها بالزر أدناه — فبها يُفتح الطلب.' })
      ])
    ]);
  },

  WHY: {
    auth:          'سجّل دخولك أولًا.',
    not_found:     'المادة غير موجودة.',
    already_free:  'هذه المادة مجانية — لا تحتاج شراء.',
    already_owned: 'المادة مفتوحة لك بالفعل.',
    no_price:      'لا سعر لهذه المادة بعد.'
  }
};
QBANK.orders = Orders;

/* ═══════════════ لوحة المشرف: طلبات الشراء ═══════════════ */
function adminOrdersCard(){
  const box = el('div', { class:'card stack' });
  box.appendChild(el('h2', { style:'margin:0', text:'طلبات الشراء' }));
  box.appendChild(el('p', { class:'field__hint', style:'margin:0', text:
    'كل طلب هنا طالبٌ ضغط «حوّلتُ». طابق إيصاله في واتساب، ثم «افتح له» — تُفتح المادة فورًا ويُحتسب نصيب الرافع.' }));

  const list = el('div', { class:'stack' });
  let status = 'pending';
  const chips = el('div', { class:'ex-chips', role:'group', 'aria-label':'تصفية طلبات الشراء' });
  [['pending','معلّقة'],['approved','فُتحت'],['rejected','مرفوضة'],['','الكل']].forEach(t => {
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
  box.appendChild(chips);
  box.appendChild(list);

  const M = h => QBANK.pay ? QBANK.pay.money(h, 'SAR') : String(h);

  let seq = 0;
  function draw(){
    const mine = ++seq;
    list.innerHTML = '';
    list.appendChild(el('p', { class:'field__hint', style:'margin:0', text:'جارٍ التحميل…' }));
    QBANK.api.rpc('admin_purchase_requests', { p_status: status }).then(r => {
      if (mine !== seq || !alive()) return;
      list.innerHTML = '';
      if (!r.ok || !Array.isArray(r.data)){
        list.appendChild(el('p', { class:'field__hint is-bad', style:'margin:0',
          text:'تعذّر الجلب — تأكّد من تنفيذ db/ORDERS.sql.' }));
        return;
      }
      if (!r.data.length){
        list.appendChild(el('p', { class:'field__hint', style:'margin:0',
          text: status === 'pending' ? 'لا طلبات معلّقة — كل من دفع فُتحت له.' : 'لا شيء هنا.' }));
        return;
      }
      r.data.forEach(o => {
        const row = el('div', { class:'payrow' }, [
          el('span', { class:'payrow__t', text: o.name || 'بلا اسم' }),
          el('span', { class:'badge', text: o.subject }),
          el('span', { class:'badge num', text: M(o.amount_halalas) }),
          /*
            ★ علامة التوثيق بجانب الرقم: المشرف يطابق إيصالًا وصله من رقمٍ
            ما بطلبٍ هنا. ورقمٌ موثَّق يجعل المطابقة يقينًا؛ وغير الموثَّق
            يُقال إنه كذلك كي لا يُعامَل كيقين.
          */
          o.phone ? el('span', { class:'badge num ' + (o.phone_verified ? 'badge--ok' : ''),
            title: o.phone_verified ? 'رقم موثَّق' : 'رقم غير موثَّق',
            text: (o.phone_verified ? '✓ ' : '؟ ') +
                  (QBANK.phone ? QBANK.phone.pretty(o.phone) : o.phone) }) : null,
          el('span', { class:'payrow__d num', text: QBANK.admin.charts.ago(o.at) })
        ]);
        const det = el('div', { class:'codeuse' }, [
          el('span', { class:'codeuse__i', 'aria-hidden':'true', text:'↳' }),
          el('span', { class:'codeuse__e num', text: o.email || '' }),
          o.note ? el('span', { class:'codeuse__n', text: o.note }) : null
        ]);
        const blk = el('div', { class:'codeblk' }, [row, det]);

        if (o.status === 'pending'){
          const ok = el('button', { class:'btn btn--sm', type:'button', text:'افتح له',
            'aria-label':'افتح «' + o.subject + '» للطالب ' + (o.name || o.email || '') });
          const no = el('button', { class:'btn btn--ghost btn--sm', type:'button', text:'ارفض',
            'aria-label':'ارفض طلب ' + (o.name || o.email || '') });
          const set = async (yes) => {
            ok.disabled = no.disabled = true;
            const rr = await QBANK.api.rpc('admin_settle_purchase', { p_id: o.id, p_ok: yes, p_note: '' });
            const x = (rr.ok && rr.data) ? rr.data : null;
            if (x && x.ok){ QBANK.toast(yes ? 'فُتحت له المادة' : 'رُفض الطلب'); draw(); return; }
            ok.disabled = no.disabled = false;
            QBANK.toast('تعذّر التعديل');
          };
          ok.addEventListener('click', () => set(true));
          no.addEventListener('click', () => set(false));
          row.appendChild(ok); row.appendChild(no);
        } else {
          const L = { approved:['badge--ok','فُتحت'], rejected:['badge--bad','مرفوض'] };
          const st = L[o.status] || ['', o.status];
          row.appendChild(el('span', { class:'badge ' + st[0], text: st[1] }));
        }
        list.appendChild(blk);
      });
    });
  }
  draw();
  return box;
}
QBANK.views.adminOrdersCard = adminOrdersCard;

/* ═══════════════ صندوق الوارد ═══════════════ */
/*
  ★ أول ما يراه المشرف: ماذا ينتظرني، لا كم زائرًا جاء.
  أربعة طوابير كانت موزّعة على تبويبات لا يعرف ما فيها حتى يفتحها —
  فيفتح «المال» ليكتشف أن الطلبات في «المال» أصلًا لكنه لم يكن يعلم أن
  فيه شيئًا. وصفٌّ واحد بعدّادات يُنهي الجولة.
*/
/*
  ★ «ينتظرك» قائمةُ أفعالٍ لا بلاطات.
  خمس بلاطات متساوية بأرقام أصفار كانت تُقرأ «لا شيء» ولا تقول ما الأعجل.
  الآن: صفٌّ لكل نوعٍ فيه شيء (الأصفار تُخفى)، مرتَّبٌ بالأكثر، وكل صفٍّ
  يقول ماذا وكم ومنذ متى ويفتح مكان المعالجة بضغطة. والفراغ سطرٌ واحد.
*/
function inboxPanel(){
  const box = el('section', { class:'inbox', 'aria-label':'ينتظرك' });
  const items = [
    ['purchases', 'طلب شراء',   '#/admin/money',    '💳', 'يدفع الطالب ولا يُفتح له حتى تعتمد'],
    ['phones',    'توثيق جوال', '#/admin/money',    '☎',  'رسالة واتساب وصلت وتنتظر ضغطة'],
    ['payouts',   'تحويل أرباح','#/admin/money',    '⇄',  'رافعٌ طلب ماله'],
    ['drafts',    'مسوّدة',     '#/admin/content',  '✎',  'مادة رفعها طالب ولم تُنشر بعد'],
    ['reports',   'بلاغ',       '#/admin/quality',  '⚑',  'سؤالٌ أبلغ عنه طالب']
  ];
  box.appendChild(el('p', { class:'field__hint', style:'margin:0', text:'جارٍ العدّ…' }));

  QBANK.api.rpc('admin_inbox').then(r => {
    if (!alive()) return;
    box.innerHTML = '';
    const d = (r.ok && r.data && !r.data.error) ? r.data : null;
    if (!d){
      box.appendChild(el('p', { class:'field__hint', style:'margin:0',
        text:'صندوق الوارد يحتاج db/ORDERS.sql.' }));
      return;
    }
    const N = QBANK.views.arNum;
    const live = items.map(it => [it, Number(d[it[0]]) || 0]).filter(x => x[1] > 0)
                      .sort((a, b) => b[1] - a[1]);
    const total = live.reduce((n, x) => n + x[1], 0);
    box.appendChild(el('div', { class:'inbox__h' }, [
      el('span', { class:'inbox__t', text: total ? 'ينتظرك' : 'لا شيء ينتظرك' }),
      total ? el('span', { class:'badge badge--warn num', text: N(total) }) : null,
      el('span', { class:'spacer' }),
      total ? null : el('span', { class:'inbox__ok', text:'الطابور نظيف ✓' })
    ]));
    if (!total) return;
    const list = el('div', { class:'inbox__list' });
    live.forEach(x => {
      const it = x[0], n = x[1];
      /* عمر أقدم طلب شراء يظهر في صفّه هو — «منذ كم ينتظر» أهمّ من «كم ينتظرون» */
      const age = it[0] === 'purchases' && d.oldest_purchase
        ? 'أقدمها منذ ' + QBANK.admin.charts.ago(d.oldest_purchase) : it[4];
      list.appendChild(el('a', { class:'inbox__i is-on', href: it[2] }, [
        el('span', { class:'inbox__ic', 'aria-hidden':'true', text: it[3] }),
        el('span', { class:'inbox__x' }, [
          el('span', { class:'inbox__l', text: N(n) + ' ' + it[1] }),
          el('span', { class:'inbox__d', text: age })
        ]),
        el('span', { class:'inbox__n num', text: N(n) }),
        el('span', { class:'inbox__go', 'aria-hidden':'true', text:'←' })
      ]));
    });
    box.appendChild(list);
    if (d.oldest_purchase && d.review_eta)
      box.appendChild(el('p', { class:'field__hint', style:'margin:6px 0 0', text:
        'وعدتَ الطلاب: ' + d.review_eta }));
  });
  return box;
}
QBANK.views.inboxPanel = inboxPanel;
