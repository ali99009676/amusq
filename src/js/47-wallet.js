/*
  محفظة الكوينز — ما ربحه الطالب من رفع مادته ومشاركتها.
  نداء واحد (my_wallet) يجلب الرصيد والمبيعات والمواد والسجل: شاشة الحساب
  تُفتح كثيرًا، وأربعة نداءات لها ثمن على شبكة الجوال.
*/
function walletSubjectRow(s){
  const u = QBANK.api.user() || {};
  const link = s.slug ? QBANK.share.shareUrl(s.slug, u.id) : '';
  const head = el('div', { class:'row' }, [
    el('span', { class:'ad-row__t', text: s.name }),
    el('span', { class:'badge num', text: (s.q_count || 0) + ' سؤالًا' }),
    s.price ? el('span', { class:'badge num', text: s.price + ' ريال' })
            : el('span', { class:'badge badge--warn', text:'بانتظار التسعير' }),
    el('span', { class:'badge num ' + (s.sales > 0 ? 'badge--ok' : ''), text: s.sales + ' عملية بيع' }),
    s.status !== 'published' ? el('span', { class:'badge badge--bad', text:'موقوفة' }) : null
  ]);
  return el('div', { class:'card stack' }, [ head, link ? QBANK.share.copyRow(link) : null ]);
}

function walletBody(){
  const box = el('div', { class:'stack' }, [ el('p', { class:'page__sub', text:'جارٍ جلب المحفظة…' }) ]);
  QBANK.api.rpc('my_wallet').then(r => {
    if (!box.isConnected) return;
    box.innerHTML = '';
    if (!r.ok || !r.data || r.data.error){
      box.appendChild(el('p', { class:'field__hint', text:'المحفظة تظهر بعد الاتصال بالخادم.' }));
      return;
    }
    const w = r.data;
    box.appendChild(el('div', { class:'wallet' }, [
      el('span', {}, [ el('span', { class:'wallet__n', text: String(w.balance) }),
                       el('span', { class:'wallet__l', text:'كوين' }) ]),
      el('span', {}, [ el('span', { class:'wallet__n', text: String(w.sales) }),
                       el('span', { class:'wallet__l', text:'عملية بيع' }) ]),
      el('span', {}, [ el('span', { class:'wallet__n', text: String((w.subjects || []).length) }),
                       el('span', { class:'wallet__l', text:'مادة رفعتها' }) ])
    ]));

    const subs = w.subjects || [];
    if (!subs.length){
      box.appendChild(QBANK.views.empty('⇪', 'لم ترفع مادة بعد',
        'ارفع بنك أسئلتك، وجرّبه عشر دقائق مجانًا، وشاركه مع زملائك.',
        el('a', { class:'btn', href:'#/admin/upload', text:'ارفع مادتك الأولى' })));
    } else {
      box.appendChild(el('h2', { text:'موادي' }));
      subs.forEach(s => box.appendChild(walletSubjectRow(s)));
      box.appendChild(el('a', { class:'btn btn--soft btn--block', href:'#/admin/upload', text:'⇪ ارفع مادة أخرى' }));
    }

    const led = w.ledger || [];
    if (led.length){
      box.appendChild(el('h2', { text:'سجل الكوينز' }));
      box.appendChild(el('div', { class:'card stack' }, led.map(t => el('div', { class:'row' }, [
        el('span', { class:'badge num ' + (t.amount > 0 ? 'badge--ok' : 'badge--bad'),
          text: (t.amount > 0 ? '+' : '') + t.amount }),
        el('span', { text: t.reason || '—' }),
        el('span', { class:'spacer' }),
        el('span', { class:'ad-feed__t', text: QBANK.admin.charts.ago(t.created_at) })
      ]))));
    }
  });
  return box;
}

/* المتصدرون خرجوا من شريط التنقّل ليتّسع للاستكشاف — فبابهم هنا */
function walletLinks(){
  return el('div', { class:'row', style:'margin-top:16px' }, [
    el('a', { class:'btn btn--soft', href:'#/board', text:'🏆 لوحة المتصدرين' }),
    el('a', { class:'btn btn--ghost', href:'#/explore', text:'⌕ استكشف المواد' })
  ]);
}

/*
  المتجر والسجل يُبنيان في 55-pay.js — نُلحقهما هنا كي تبقى المحفظة مكانًا واحدًا.

  ★ وصندوق الرمز معهما، لأن رمز الفصل لا مادة له.
  رمزُ مادةٍ يُدخله الطالب في صفحتها، أما رمز «مواد الفصل كلها» فلا صفحة
  واحدة يخصّها — ولو لم يكن له مكان هنا لبقي بيد صاحبه بلا باب يُدخله منه.
*/
function walletWithShop(){
  const codeCard = QBANK.views.redeemBox
    ? el('div', { class:'card stack' }, [
        el('h2', { style:'margin:0', text:'تفعيل برمز' }),
        el('p', { class:'field__hint', style:'margin:0', text:
          'رمزُ مادةٍ أو رمزُ الفصل كامل — أدخله هنا وتُفتح لك فورًا.' }),
        QBANK.views.redeemBox(() => QBANK.router.render(location.hash))
      ])
    : null;
  return el('div', { class:'stack' }, [
    walletBody(),
    /* ★ توثيق الجوال قبل المال: هو ما يربط الحساب بصاحبه، وكل ما تحته
       — أرباحٌ وتحويلاتٌ ومشتريات — يتّكئ على أن الحساب لصاحبه فعلًا. */
    QBANK.views.phoneCard ? QBANK.views.phoneCard() : null,
    QBANK.views.notifyCard ? QBANK.views.notifyCard() : null,
    /* ★ الأرباح قبل المتجر: المحفظة تُفتح لسؤال «كم لي؟» قبل «بكم أشتري؟» */
    QBANK.views.earnCard ? QBANK.views.earnCard() : null,
    codeCard,
    QBANK.pay ? QBANK.pay.coinShop() : null,
    QBANK.pay ? QBANK.pay.historyCard() : null
  ]);
}

QBANK.wallet = { body: walletWithShop, subjectRow: walletSubjectRow, links: walletLinks };
