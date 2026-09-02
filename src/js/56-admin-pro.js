/*
  لوحة الإشراف الكاملة — إحصاء دقيق وتحكم كامل.

  مبدأ الشاشة: كل رقم هنا يجب أن يُغيّر قرارًا.
  رقمٌ لا يُغيّر ما تفعله غدًا زينةٌ تُزاحم ما يُغيّره. لهذا لا «إجمالي
  الزيارات» ولا «متوسط زمن الجلسة»: أرقام تُطمئن ولا تُوجّه.
*/
const Pro = {
  overview(days){ return QBANK.api.rpc('admin_overview', { p_days: days || 30 }); },
  coins(days){ return QBANK.api.rpc('admin_coins', { p_days: days || 30 }); },
  hard(){ return QBANK.api.rpc('admin_hard_questions', { p_limit: 30 }); },
  campus(){ return QBANK.api.rpc('admin_campus'); },
  payments(status){ return QBANK.api.rpc('admin_payments', { p_status: status || '', p_limit: 50 }); },
  audit(){ return QBANK.api.rpc('admin_audit', { p_limit: 60 }); },

  grantCoins(user, amount, note){
    return QBANK.api.rpc('admin_grant_coins', { p_user:user, p_amount:amount, p_note:note || '' }); },
  setRole(user, isAdmin){
    return QBANK.api.rpc('admin_set_role', { p_user:user, p_admin:isAdmin }); },
  grantEntitlement(user, subject, days){
    return QBANK.api.rpc('admin_grant_entitlement', { p_user:user, p_subject:subject, p_days:days || 180 }); },
  setSubject(id, patch){
    return QBANK.api.rpc('admin_set_subject', { p_subject:id, p_patch:patch }); },
  mergeUniversity(from, into){
    return QBANK.api.rpc('admin_merge_university', { p_from:from, p_into:into }); },
  verifyUniversity(id, on){
    return QBANK.api.rpc('admin_verify_university', { p_uni:id, p_on:on }); },
  refund(payment, note){
    return QBANK.api.rpc('admin_refund', { p_payment:payment, p_note:note || '' }); },

  money(h){ return QBANK.pay ? QBANK.pay.money(h, 'SAR') : String(h); },
  n(v){ return QBANK.views.arNum(Number(v) || 0); },

  /* النسبة من الخطوة السابقة لا من القمة: «٤٠٪ من المسجّلين اشتركوا»
     مفيدة، و«٤٪ من المسجّلين دفعوا» تُخفي أين وقع التسرّب فعلًا. */
  step(n, prev){
    if (!prev) return null;
    return Math.round((Number(n) || 0) * 100 / prev);
  }
};

/* ═══ القمع ═══ */
function funnelPanel(f){
  const steps = [
    ['سجّل',        f.signed_up],
    ['حدّد جامعته', f.has_campus],
    ['فتح مادة',    f.enrolled],
    ['اختبر نفسه',  f.examined],
    ['رفع مادة',    f.uploaded],
    ['دفع',         f.paid]
  ];
  const top = Math.max(1, Number(f.signed_up) || 1);
  return el('div', { class:'fun' }, steps.map((s, i) => {
    const v = Number(s[1]) || 0;
    const pct = Math.round(v * 100 / top);
    const drop = i > 0 ? Pro.step(v, Number(steps[i-1][1]) || 0) : null;
    return el('div', { class:'fun__row' }, [
      el('span', { class:'fun__l', text: s[0] }),
      el('span', { class:'fun__bar' }, [
        el('span', { class:'fun__fill', style:'width:' + Math.max(pct, 2) + '%' })
      ]),
      el('span', { class:'fun__n num', text: Pro.n(v) }),
      // ★ نسبة التحويل من الخطوة السابقة — هي التي تكشف موضع التسرّب
      /* ★ دون الثلث يُلوَّن: خطوةٌ يسقط فيها ثلثا الطلاب هي عمل الغد.
         والحدّ مكتوب هنا مرة واحدة كي لا يتفرّق تقديره على الشاشات. */
      drop !== null ? el('span', { class:'fun__p num' + (drop < 30 ? ' is-low' : ''),
        title:'من الخطوة السابقة', text: Pro.n(drop) + '٪' }) : el('span', { class:'fun__p' })
    ]);
  }));
}

/* ═══ الشاشة الأولى ═══ */
function proDashTab(box){
  let days = 30;
  const head = el('div', { class:'ad-bar' });
  const body = el('div', { class:'stack' });
  const onlineBox = el('div', {});
  /* المتصلون فوق كل شيء: أول ما يريد المشرف معرفته «من هنا الآن؟» —
     وخارج body كي لا يمحوه تبديل المدى الزمني */
  /* ★ صندوق الوارد قبل كل شيء — «ماذا ينتظرني» يسبق «من هنا» و«كم بعنا» */
  if (QBANK.views.inboxPanel) box.appendChild(QBANK.views.inboxPanel());
  box.appendChild(head); box.appendChild(onlineBox); box.appendChild(body);

  [7, 30, 90].forEach(d => {
    const b = el('button', { class:'chip' + (d === days ? ' is-on' : ''), type:'button',
      'data-d': String(d), text: Pro.n(d) + ' يومًا' });
    b.addEventListener('click', () => {
      days = d;
      head.querySelectorAll('.chip').forEach(x =>
        x.classList.toggle('is-on', x.getAttribute('data-d') === String(d)));
      load();
    });
    head.appendChild(b);
  });

  const legacy = el('div', { class:'ad-legacy' });

  /*
    ★ المتصلون الآن — بالاسم والإيميل وآخر نبضة.
    «الآن» = نبضة جهاز خلال ربع الساعة الأخيرة، والقائمة تتجدد كل دقيقة
    ما دامت اللوحة مفتوحة. الإيميل من دالة لا تجيب إلا مشرفًا.
  */
  /*
    عَلَم البلد من رمزه: حرفان لاتينيان يُحوَّلان إلى محرفَي «رمز إقليمي»
    فيرسمهما النظام علمًا. لا صور ولا مكتبة — والنظام الذي لا يعرفها
    يعرض حرفين، وهما مفهومان أيضًا.
  */
  function flagOf(cc){
    const c = String(cc || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(c)) return '';
    return String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65,
                                0x1F1E6 + c.charCodeAt(1) - 65);
  }

  function drawOnline(){
    QBANK.api.rpc('admin_online', {}).then(r => {
      if (!onlineBox.isConnected) return;
      onlineBox.innerHTML = '';
      const rows = (r.ok && Array.isArray(r.data)) ? r.data : [];
      const P = QBANK.presence;
      const list = rows.length
        ? el('div', { class:'ad-feed' }, rows.map(u => el('div', { class:'ad-feed__i' }, [
            el('span', { class:'ad-feed__av', text: u.avatar || '👤' }),
            el('span', { class:'ad-feed__x' }, [
              el('span', { class:'ad-row__t', text: u.name || 'بلا اسم' }),
              /*
                ★ سطر الحال فوق البريد.
                البريد يقول من هو، والحال يقول ما الذي يفعله الآن — وهذا
                ما يُبنى عليه قرار. فيأخذ السطر الأول ولونَ التمييز.
              */
              el('span', { class:'ad-feed__place',
                text: u.place || 'يتصفّح' }),
              el('span', { class:'stu__mail ltr', text: u.email || '' })
            ]),
            el('span', { class:'ad-feed__meta' }, [
              /* الجهاز والبلد علامتان تُقرآن بلمحة في قائمة طويلة */
              el('span', { class:'ad-feed__dev', title: P ? P.kindName(u.kind) : '',
                'aria-label': P ? P.kindName(u.kind) : '',
                text: P ? P.kindIcon(u.kind) : '' }),
              u.country ? el('span', { class:'ad-feed__flag',
                title: (QBANK.explore && QBANK.explore.countryName)
                       ? QBANK.explore.countryName(u.country) : u.country,
                text: flagOf(u.country) }) : null
            ]),
            el('span', { class:'ad-feed__t', text: QBANK.admin.charts.ago(u.last_seen) })
          ])))
        : QBANK.views.empty('◌', 'لا أحد متصل الآن', 'تُحسب النبضات خلال آخر ١٥ دقيقة.');
      onlineBox.appendChild(QBANK.admin.dashParts.dashPanel(
        'المتصلون الآن', rows.length ? rows.length + ' متصل' : null, list));
    });
  }
  drawOnline();
  const onlineTimer = setInterval(() => {
    if (!onlineBox.isConnected) return clearInterval(onlineTimer);   // غادر المشرف — لا نبض في الخلفية
    drawOnline();
  }, 60000);

  function load(){
    body.innerHTML = '';
    body.appendChild(el('p', { class:'page__sub', text:'جارٍ الحساب…' }));
    Pro.overview(days).then(r => {
      if (!body.isConnected) return;
      body.innerHTML = '';
      const d = (r.ok && r.data && r.data.ok) ? r.data : null;
      if (!d){
        body.appendChild(QBANK.views.empty('⚠', 'تعذّر الجلب',
          'تأكد من تشغيل ADMIN-PRO.sql على القاعدة، ومن أن حسابك مشرف.'));
        return;
      }
      const C = QBANK.admin.charts;
      const m = d.money, a = d.activity, c = d.content, q = d.quality;

      body.appendChild(el('div', { class:'ad-kpis' }, [
        C.kpi(Pro.money(m.revenue), 'دخل المدة', Pro.n(m.paid_n) + ' عملية', m.revenue > 0 ? 'live' : null),
        C.kpi(Pro.n(a.active), 'طالبًا نشطًا', Pro.n(a.new_users) + ' جديد'),
        C.kpi(Pro.n(a.attempts), 'اختبارًا', 'متوسط ' + Pro.n(a.avg_pct) + '٪'),
        C.kpi(Pro.n(c.published), 'مادة منشورة', Pro.n(c.verified) + ' موثّقة'),
        C.kpi(Pro.n(q.reports_open), 'بلاغًا مفتوحًا',
          q.reports_open ? 'تحتاج بتًّا' : 'الطابور نظيف', q.reports_open ? 'warn' : 'live'),
        /* ★ الالتزام القادم: كوينز في الجيوب لم تُنفق — كلٌّ منها تكلفة ذكاء قادمة */
        C.kpi(Pro.n(m.coins_outstanding), 'كوين لم يُنفَق', 'التزامك القادم',
          m.coins_outstanding > 5000 ? 'warn' : null)
      ]));

      body.appendChild(el('section', { class:'ad-panel' }, [
        el('div', { class:'ad-panel__h' }, [
          el('h2', { class:'ad-panel__t', text:'قمع الطلاب' }),
          el('span', { class:'ad-panel__s', text:'النسبة من الخطوة التي قبلها' })
        ]),
        funnelPanel(d.funnel)
      ]));

      /* الرسم اليومي — نُعيد استعمال chartActivity بدل رسم ثانٍ.
         مكوّن رسم واحد في المنصة يعني مقياسًا واحدًا وعينًا متعوّدة عليه. */
      const S = Array.isArray(d.series) ? d.series : [];
      if (S.length > 1 && C.chartActivity){
        const mk = (key, title) => el('section', { class:'ad-panel' }, [
          el('div', { class:'ad-panel__h' }, [
            el('h2', { class:'ad-panel__t', text: title }),
            el('span', { class:'ad-panel__s', text: Pro.n(S.reduce((t,x) => t + Number(x[key]||0), 0)) + ' في المدة' })
          ]),
          C.chartActivity(S.map(x => ({ d: x.d, n: Number(x[key]) || 0 })))
        ]);
        body.appendChild(mk('attempts', 'الاختبارات يوميًا'));
        body.appendChild(mk('users', 'التسجيلات يوميًا'));
        if (S.some(x => Number(x.revenue) > 0))
          body.appendChild(el('section', { class:'ad-panel' }, [
            el('div', { class:'ad-panel__h' }, [
              el('h2', { class:'ad-panel__t', text:'الدخل يوميًا' }),
              el('span', { class:'ad-panel__s', text: Pro.money(S.reduce((t,x) => t + Number(x.revenue||0), 0)) })
            ]),
            // بالريال لا بالهللات: مقياسٌ بالهللات يجعل كل عمود جبلًا
            C.chartActivity(S.map(x => ({ d: x.d, n: Math.round(Number(x.revenue||0) / 100) })))
          ]));
      }

      const warn = [];
      if (c.drafts)  warn.push(['▤', Pro.n(c.drafts) + ' مسوّدة تنتظر اعتمادك', '#/admin/ugc']);
      if (c.orphan)  warn.push(['⌂', Pro.n(c.orphan) + ' مادة بلا جامعة — لا يجدها أحد في «استكشف»', '#/admin/content']);
      if (q.low_rated) warn.push(['★', Pro.n(q.low_rated) + ' مادة تقييمها دون ٣ من ٥', '#/admin/content']);
      if (m.pending_n) warn.push(['◔', Pro.n(m.pending_n) + ' دفعة معلّقة لم تُسوَّ', '#/admin/money']);
      if (warn.length)
        body.appendChild(el('section', { class:'ad-panel ad-panel--warn' }, [
          el('div', { class:'ad-panel__h' }, [ el('h2', { class:'ad-panel__t', text:'يحتاج انتباهك' }) ]),
          el('div', { class:'stack' }, warn.map(w =>
            el('a', { class:'ad-warn', href: w[2] }, [
              el('span', { text: w[0] + ' ' + w[1] }),
              el('span', { class:'ad-warn__go', text:'←' })
            ])))
        ]));

      /*
        لوحات النسخة السابقة: توزيع النتائج وأداء المواد وآخر النشاط.
        تُجلب بنداء ثانٍ لأنها من مصدر آخر (admin_dashboard)، وتُلحق كما هي —
        فما بُني صحيحًا لا يُلقى لأن شيئًا جديدًا وُضع فوقه.
      */
      const P = QBANK.admin.dashParts;
      if (P) QBANK.api.rpc('admin_dashboard', { days }).then(rr => {
        if (!body.isConnected || !rr.ok || !rr.data || rr.data.error) return;
        const dd = rr.data;
        const total = (dd.series || []).reduce((n, x) => n + Number(x.n), 0);
        legacy.innerHTML = '';
        legacy.appendChild(el('div', { class:'ad-panels ad-panels--2' }, [
          P.dashPanel('النشاط اليومي', total + ' اختبارًا خلال ' + days + ' يومًا',
            C.chartActivity(dd.series || [])),
          P.dashPanel('توزيع النتائج', 'الخط البرتقالي = متوسط النتيجة',
            C.chartBuckets(dd.buckets || []))
        ]));
        legacy.appendChild(el('div', { class:'ad-panels' }, [
          P.dashPanel('أداء المواد', 'اضغط مادة لفتح محررها', P.dashSubjects(dd.subjects || [])),
          P.dashPanel('آخر النشاط', null, P.dashRecent(dd.recent || []))
        ]));
      });

      body.appendChild(el('section', { class:'ad-panel' }, [
        el('div', { class:'ad-panel__h' }, [ el('h2', { class:'ad-panel__t', text:'أرقام المنصة' }) ]),
        el('div', { class:'ad-grid2' }, [
          ['أسئلة', Pro.n(c.questions) + ' منها ' + Pro.n(c.derived) + ' مستنتجة'],
          ['جامعات فيها محتوى', Pro.n(d.community.universities)],
          ['كليات', Pro.n(d.community.colleges)],
          ['تحديات جارية', Pro.n(d.community.challenges)],
          ['تقييمات', Pro.n(q.ratings) + ' بمتوسط ' + q.avg_rating],
          ['دخل منذ الإطلاق', Pro.money(m.revenue_all)],
          ['دفعات فاشلة', Pro.n(m.failed_n)],
          ['متصل الآن', Pro.n(a.online)]
        ].map(x => el('div', { class:'ad-fact' }, [
          el('span', { class:'ad-fact__l', text: x[0] }),
          el('span', { class:'ad-fact__v num', text: x[1] })
        ])))
      ]));

      body.appendChild(legacy);
    });
  }
  load();
}

/* ═══ تبويب المال ═══ */
function proMoneyTab(box){
  const body = el('div', { class:'stack' });
  box.appendChild(body);
  let status = '';

  const chips = el('div', { class:'ex-chips', role:'group', 'aria-label':'تصفية الدفعات' });
  [['','الكل'],['paid','مدفوعة'],['pending','معلّقة'],['failed','فاشلة']].forEach(t => {
    const b = el('button', { class:'chip' + (t[0] === status ? ' is-on' : ''), type:'button',
      'data-s': t[0], text: t[1] });
    b.addEventListener('click', () => {
      status = t[0];
      chips.querySelectorAll('.chip').forEach(x => x.classList.toggle('is-on', x.getAttribute('data-s') === status));
      draw();
    });
    chips.appendChild(b);
  });
  box.insertBefore(chips, body);

  /*
    ★ مولّد الأكواد فوق سجلّ الدفعات لا تحته.
    السجلّ يقول ماذا حدث، والمولّد هو ما يجعل شيئًا يحدث. وحين لا تكون
    بوابة الدفع مفعَّلة بعد فهو قناة البيع الوحيدة العاملة — ووضعُ القناة
    العاملة أسفلَ صفحةٍ طويلة يجعلها كأنها غير موجودة.
  */
  if (QBANK.views.adminCodesCard) box.insertBefore(QBANK.views.adminCodesCard(), chips);
  /* والتحويلات فوقها: مالٌ مستحقٌّ على المنصة لا يُترك أسفل صفحة */
  if (QBANK.views.adminPayoutsCard) box.insertBefore(QBANK.views.adminPayoutsCard(), box.firstChild);
  /* ★ وطلبات التوثيق فوق الجميع: هي وحدها التي يقف صاحبها منتظرًا الآن.
     المال يُراجَع متى شئت، والطالب الذي أرسل رمزه ينظر إلى شاشته. */
  if (QBANK.views.adminPhoneCard) box.insertBefore(QBANK.views.adminPhoneCard(), box.firstChild);
  /* ★ وطلبات الشراء أولَ الكل: مالٌ دُفع فعلًا وصاحبه يقف على بابٍ مغلق */
  if (QBANK.views.adminOrdersCard) box.insertBefore(QBANK.views.adminOrdersCard(), box.firstChild);

  function draw(){
    body.innerHTML = '';
    body.appendChild(el('p', { class:'page__sub', text:'جارٍ التحميل…' }));
    Promise.all([Pro.payments(status), Pro.coins(30)]).then(([p, c]) => {
      if (!body.isConnected) return;
      body.innerHTML = '';

      const coins = (c.ok && c.data && c.data.ok) ? c.data : null;
      if (coins){
        /* ★ الكوين يدخل من أبواب مختلفة: منحة (تكلفة تسويق)، شراء (إيراد)،
           إحالة (تكلفة اكتساب). جمعها في رقم واحد يجعل كل تحليل ربحية كاذبًا. */
        const KIND = { signup:'منحة تسجيل', purchase:'شراء', referral:'مكافأة إحالة',
                       spend:'إنفاق على الإثراء', refund:'ردّ', admin:'تعديل مشرف' };
        body.appendChild(el('section', { class:'ad-panel' }, [
          el('div', { class:'ad-panel__h' }, [
            el('h2', { class:'ad-panel__t', text:'دفتر الكوينز' }),
            el('span', { class:'ad-panel__s', text:'آخر ٣٠ يومًا' })
          ]),
          el('div', { class:'ad-grid2' }, (coins.by_kind || []).map(k =>
            el('div', { class:'ad-fact' }, [
              el('span', { class:'ad-fact__l', text: KIND[k.kind] || k.kind }),
              el('span', { class:'ad-fact__v num' + (Number(k.coins) < 0 ? ' is-out' : ''),
                text: Pro.n(k.coins) + ' كوين · ' + Pro.n(k.n) + ' حركة' })
            ])))
        ]));
      }

      const rows = (p.ok && Array.isArray(p.data)) ? p.data : [];
      if (!rows.length){
        body.appendChild(QBANK.views.empty('◇', 'لا دفعات', 'ستظهر هنا فور أول عملية.'));
        return;
      }
      const lbl = { paid:['badge--ok','مدفوعة'], pending:['badge--warn','معلّقة'], failed:['badge--bad','فاشلة'] };
      body.appendChild(el('div', { class:'stack' }, rows.map(x => {
        const st = lbl[x.status] || ['', x.status];
        const row = el('div', { class:'payrow' }, [
          el('span', { class:'payrow__t', text: (x.student || 'طالب') + ' — ' +
            (x.kind === 'coins' ? Pro.n(x.coins) + ' كوين' : (x.subject || 'مادة')) }),
          el('span', { class:'badge num', text: Pro.money(x.amount_halalas) }),
          el('span', { class:'badge ' + st[0], text: st[1] }),
          el('span', { class:'payrow__d num', text: new Date(x.created_at).toLocaleDateString('ar') })
        ]);
        if (x.status === 'paid'){
          const rb = el('button', { class:'btn btn--sm btn--ghost', type:'button', text:'ردّ' });
          rb.addEventListener('click', () => {
            /* ★ نقول صراحةً إن هذا لا يُعيد المال إلى البطاقة — الردّ المالي
               في لوحة البوابة. الوهم هنا يعني طالبًا ينتظر مالًا لن يصله. */
            if (!confirm('سيُسحب ما مُنح لهذا الطالب ويُسجَّل الردّ عندنا.\n' +
                         'أمّا إعادة المال إلى بطاقته فتتم في لوحة Tap — هذه لا تفعلها.\nأتريد المتابعة؟')) return;
            rb.disabled = true;
            Pro.refund(x.id, '').then(res => {
              const ok = res.ok && res.data && res.data.ok;
              QBANK.toast(ok ? 'سُجّل الردّ' : 'تعذّر');
              if (ok) draw();
            });
          });
          row.appendChild(rb);
        }
        if (x.fail_reason) row.appendChild(el('span', { class:'field__hint', text: x.fail_reason }));
        return row;
      })));
    });
  }
  draw();
}

/* ═══ تبويب الجودة: أصعب الأسئلة ═══ */
function proQualityTab(box){
  const body = el('div', { class:'stack' });
  box.appendChild(el('p', { class:'field__hint',
    text:'سؤالٌ يخطئ فيه أكثر الطلاب إمّا صعبٌ جدًا وإمّا إجابته المعلَّمة خاطئة — والثاني لا يُبلّغ عنه أحد لأن كلًّا يظن أنه هو المخطئ.' }));
  box.appendChild(body);
  body.appendChild(el('p', { class:'page__sub', text:'جارٍ الحساب…' }));

  Pro.hard().then(r => {
    if (!body.isConnected) return;
    body.innerHTML = '';
    const rows = (r.ok && Array.isArray(r.data)) ? r.data : [];
    if (!rows.length){
      body.appendChild(QBANK.views.empty('✓', 'لا أسئلة مريبة',
        'لا سؤال أخطأ فيه ٦٠٪ فأكثر ممن رآه (بحدّ أدنى ٥ طلاب).'));
      return;
    }
    rows.forEach(x => {
      const card = el('article', { class:'rep' }, [
        el('div', { class:'rep__head' }, [
          el('span', { class:'badge badge--bad num', text: Pro.n(x.wrong_pct) + '٪ خطأ' }),
          el('a', { class:'rep__subj', href:'#/admin/subject/' + x.subject_id, text: x.subject }),
          el('span', { class:'rep__when num', text: Pro.n(x.seen) + ' طالبًا' })
        ]),
        el('p', { class:'rep__qt ltr', text: x.q }),
        // ★ «مستنتجة» هي أهم إشارة: إجابة لم تأتِ من ملف الدكتور وأخطأ فيها الأكثرون
        x.derived
          ? el('p', { class:'field__hint is-bad', style:'margin:0',
              text:'⚠ إجابتها مستنتجة لا من ملف الدكتور — راجعها أولًا.' })
          : el('p', { class:'field__hint', style:'margin:0',
              text:'إجابتها من ملف الدكتور. قد يكون السؤال صعبًا فعلًا.' })
      ]);
      body.appendChild(card);
    });
  });
}

/* ═══ تبويب الجامعات ═══ */
function proCampusTab(box){
  const body = el('div', { class:'stack' });
  box.appendChild(body);

  function draw(){
    body.innerHTML = '';
    body.appendChild(el('p', { class:'page__sub', text:'جارٍ التحميل…' }));
    Pro.campus().then(r => {
      if (!body.isConnected) return;
      body.innerHTML = '';
      const d = (r.ok && r.data && r.data.ok) ? r.data : null;
      if (!d){ body.appendChild(QBANK.views.empty('⚠', 'تعذّر الجلب', 'شغّل ADMIN-PRO.sql.')); return; }

      const unis = d.universities || [];
      body.appendChild(el('section', { class:'ad-panel' }, [
        el('div', { class:'ad-panel__h' }, [
          el('h2', { class:'ad-panel__t', text:'الجامعات' }),
          el('span', { class:'ad-panel__s', text: Pro.n(unis.length) + ' جامعة' })
        ]),
        el('div', { class:'stack' }, unis.map(u => {
          const row = el('div', { class:'payrow' }, [
            el('span', { class:'payrow__t', text: u.name }),
            el('span', { class:'badge num', text: Pro.n(u.subjects) + ' مادة' }),
            el('span', { class:'badge num', text: Pro.n(u.students) + ' طالب' }),
            u.verified ? el('span', { class:'badge badge--ok', text:'موثّقة' }) : null
          ]);
          const v = el('button', { class:'btn btn--sm btn--ghost', type:'button',
            text: u.verified ? 'أزل التوثيق' : 'وثّقها' });
          v.addEventListener('click', () => {
            v.disabled = true;
            Pro.verifyUniversity(u.id, !u.verified).then(() => draw());
          });
          const mg = el('button', { class:'btn btn--sm btn--ghost', type:'button', text:'ادمجها في…' });
          mg.addEventListener('click', () => {
            /* ★ الدمج هو الإصلاح الذي ستحتاجه حتمًا: توحيد الإملاء يمنع أكثر
               التكرار لا كلّه — «جامعة الملك سعود» و«KSU» لا تجمعهما خوارزمية. */
            const names = unis.filter(x => x.id !== u.id).map((x, i) => (i+1) + ') ' + x.name).join('\n');
            const pick = prompt('ادمج «' + u.name + '» في أيّ جامعة؟ اكتب رقمها:\n' + names);
            const idx = parseInt(pick, 10);
            const target = unis.filter(x => x.id !== u.id)[idx - 1];
            if (!target) return;
            if (!confirm('ستنتقل كل مواد وكليات وطلاب «' + u.name + '» إلى «' + target.name +
                         '»، وتُحذف «' + u.name + '».\nلا رجعة في هذا. أتتابع؟')) return;
            Pro.mergeUniversity(u.id, target.id).then(res => {
              QBANK.toast(res.ok && res.data && res.data.ok ? 'تمّ الدمج' : 'تعذّر الدمج');
              draw();
            });
          });
          row.appendChild(v); row.appendChild(mg);
          return row;
        }))
      ]));

      const cr = d.top_creators || [];
      if (cr.length)
        body.appendChild(el('section', { class:'ad-panel' }, [
          el('div', { class:'ad-panel__h' }, [ el('h2', { class:'ad-panel__t', text:'أكثر الرافعين' }) ]),
          el('div', { class:'stack' }, cr.map((c, i) => el('div', { class:'brd__row' }, [
            el('span', { class:'brd__rank num', text: Pro.n(i + 1) }),
            el('span', { class:'brd__name', text: c.name || 'طالب' }),
            el('span', { class:'brd__pts num', text: Pro.n(c.subjects) + ' مادة · ' + Pro.n(c.questions) + ' سؤال' })
          ])))
        ]));
    });
  }
  draw();
}

/* ═══ تبويب السجل ═══ */
function proAuditTab(box){
  const body = el('div', { class:'stack' });
  box.appendChild(el('p', { class:'field__hint',
    text:'كل فعل إداري يُسجَّل ولا يُمحى — منح كوينز وردّ دفعة وترقية مشرف ودمج جامعة.' }));
  box.appendChild(body);
  body.appendChild(el('p', { class:'page__sub', text:'جارٍ التحميل…' }));

  const AR = { grant_coins:'منح كوينز', set_role:'تغيير صلاحية', refund:'ردّ دفعة',
               merge_university:'دمج جامعة', verify_university:'توثيق جامعة',
               set_subject:'تعديل مادة', grant_entitlement:'منح استحقاق' };
  Pro.audit().then(r => {
    if (!body.isConnected) return;
    body.innerHTML = '';
    const rows = (r.ok && Array.isArray(r.data)) ? r.data : [];
    if (!rows.length){
      body.appendChild(QBANK.views.empty('◷', 'لا أفعال بعد', 'سيظهر هنا كل تدخّل إداري.'));
      return;
    }
    rows.forEach(x => body.appendChild(el('div', { class:'payrow' }, [
      el('span', { class:'badge', text: AR[x.action] || x.action }),
      el('span', { class:'payrow__t', text: JSON.stringify(x.detail) }),
      el('span', { class:'badge num', text: x.actor || 'مشرف' }),
      el('span', { class:'payrow__d num', text: new Date(x.created_at).toLocaleString('ar') })
    ])));
  });
}

QBANK.admin.pro = Pro;
QBANK.views.proDashTab = proDashTab;
QBANK.views.proMoneyTab = proMoneyTab;
QBANK.views.proQualityTab = proQualityTab;
QBANK.views.proCampusTab = proCampusTab;
QBANK.views.proAuditTab = proAuditTab;
QBANK.views.funnelPanel = funnelPanel;

/*
  ترتيب التبويبات = ترتيب ما يستحق أن يُرى.
  اللوحة أولًا (الحال العام)، ثم ما يحتاج تدخلًا (مسوّدات، بلاغات، جودة)،
  ثم المال، ثم البنية (جامعات)، ثم السجل، ثم الإعدادات آخرًا.
*/
if (QBANK.views.ADMIN_TABS){
  const T = QBANK.views.ADMIN_TABS;
  const dash = T.filter(t => t.id === 'dash')[0];
  if (dash) dash.fill = proDashTab;          // نستبدل اللوحة القديمة بالكاملة

  const add = (id, label, fill, before) => {
    if (T.some(t => t.id === id)) return;
    const at = T.findIndex(t => t.id === before);
    const tab = { id, label, fill };
    if (at === -1) T.push(tab); else T.splice(at, 0, tab);
  };
  add('quality', 'الجودة', proQualityTab, 'settings');
  add('money',   'المال',   proMoneyTab,   'settings');
  add('campus',  'الجامعات', proCampusTab, 'settings');
  add('audit',   'السجل',   proAuditTab,   'settings');
}

/* ═══ تبويب الطلاب: عرض وتحكم ═══ */
function proStudentsTab(box){
  const search = el('input', { class:'input', type:'search', placeholder:'ابحث باسم الطالب…' });
  const list = el('div', { class:'stack' });
  box.appendChild(el('div', { class:'ad-bar' }, [search]));
  box.appendChild(list);

  let timer = null;
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(draw, 400); });

  function studentCard(r){
    const card = el('article', { class:'stu' });
    const head = el('div', { class:'stu__h' }, [
      el('span', { class:'stu__av', 'aria-hidden':'true', text: r.avatar || '◍' }),
      el('div', { class:'stu__x' }, [
        el('span', { class:'stu__n', text: (r.name || 'بلا اسم') + (r.is_admin ? ' · مشرف' : '') }),
        /* ★ الإيميل سطرٌ بذاته قابل للتحديد والنسخ — هو مفتاح التواصل والدعم */
        r.email ? el('span', { class:'stu__mail ltr', text: r.email }) : null,
        el('span', { class:'stu__s', text: [
          r.university || 'بلا جامعة',
          Pro.n(r.attempts) + ' اختبار',
          Pro.n(r.uploaded) + ' مادة مرفوعة',
          r.phone ? r.phone : null
        ].filter(Boolean).join(' · ') })
      ]),
      el('span', { class:'badge num', text: Pro.n(r.coins) + ' كوين' }),
      Number(r.paid) > 0 ? el('span', { class:'badge badge--ok num', text: Pro.money(r.paid) }) : null
    ]);
    card.appendChild(head);

    const msg = el('span', { class:'field__hint', role:'status' });
    const amount = el('input', { class:'input', type:'number', value:'100',
      'aria-label':'عدد الكوينز', style:'max-width:8em' });

    /*
      ★ التحديث في مكانه لا إعادة بناء القائمة.
      كانت تُنادى draw() بعد المنح فتُمحى الرسالة التي تقول «الرصيد الآن
      ٣٥٠» قبل أن يقرأها المشرف — فيشكّ هل وصل المنح ويمنح ثانيةً.
      وهذا في المال خطأٌ يُكلّف. فنُحدّث الشارة والرسالة ونُبقي البطاقة.
    */
    const coinBadge = head.querySelector('.badge.num');
    const applyCoins = (delta, label) => {
      const n = parseInt(amount.value, 10);
      if (!n){ msg.className = 'field__hint is-bad'; msg.textContent = 'اكتب عددًا.'; return; }
      msg.className = 'field__hint'; msg.textContent = 'جارٍ…';
      Pro.grantCoins(r.id, delta * Math.abs(n), label).then(res => {
        const ok = res.ok && res.data && res.data.ok;
        if (!ok){ msg.className = 'field__hint is-bad'; msg.textContent = 'تعذّر'; return; }
        r.coins = res.data.balance;
        if (coinBadge) coinBadge.textContent = Pro.n(r.coins) + ' كوين';
        msg.className = 'field__hint is-ok';
        msg.textContent = 'الرصيد الآن ' + Pro.n(res.data.balance);
      });
    };

    const give = el('button', { class:'btn btn--sm btn--soft', type:'button', text:'امنح' });
    give.addEventListener('click', () => applyCoins(1, 'منح يدوي'));

    const take = el('button', { class:'btn btn--sm btn--ghost', type:'button', text:'اسحب' });
    take.addEventListener('click', () => applyCoins(-1, 'سحب يدوي'));

    const role = el('button', { class:'btn btn--sm btn--ghost', type:'button',
      text: r.is_admin ? 'أنزله من الإشراف' : 'ارفعه مشرفًا' });
    role.addEventListener('click', () => {
      if (!confirm(r.is_admin
            ? 'سيفقد ' + (r.name || 'هذا الطالب') + ' كل صلاحيات الإشراف.'
            : 'سيصير ' + (r.name || 'هذا الطالب') + ' مشرفًا: يرى كل البيانات ويعدّل كل شيء.')) return;
      role.disabled = true;
      Pro.setRole(r.id, !r.is_admin).then(res => {
        role.disabled = false;
        const d = res.data || {};
        if (d.ok){ draw(); return; }
        /* ★ سببان يستحقان اسمًا: لا تُنزل نفسك، ولا تترك المنصة بلا مشرف.
           «تعذّر» وحدها تجعل المشرف يظنّ عطلًا وهو حارس متعمَّد. */
        msg.textContent = d.reason === 'self_demote' ? 'لا تُنزل نفسك — لن يبقى من يرفعك.'
          : d.reason === 'last_admin' ? 'هذا آخر مشرف — ارفع غيره أولًا.'
          : 'تعذّر';
      });
    });

    card.appendChild(el('div', { class:'stu__act' }, [
      amount, give, take, role, msg
    ]));
    return card;
  }

  function draw(){
    list.innerHTML = '';
    list.appendChild(el('p', { class:'page__sub', text:'جارٍ الجلب…' }));
    QBANK.api.rpc('admin_students_pro', { p_search: search.value || '', p_limit: 50 }).then(r => {
      if (!list.isConnected) return;
      list.innerHTML = '';
      const rows = (r.ok && Array.isArray(r.data)) ? r.data : [];
      if (!rows.length){
        list.appendChild(QBANK.views.empty('◍', 'لا طلاب',
          search.value ? 'لا مطابقة لبحثك.' : 'سيظهرون هنا فور تسجيلهم.'));
        return;
      }
      rows.forEach(x => list.appendChild(studentCard(x)));
    });
  }
  draw();
}

QBANK.views.proStudentsTab = proStudentsTab;
if (QBANK.views.ADMIN_TABS){
  const st = QBANK.views.ADMIN_TABS.filter(t => t.id === 'students')[0];
  if (st) st.fill = proStudentsTab;
}
