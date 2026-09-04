/*
  المجتمع — الدفعة تراجع معًا.

  المذاكرة وحدها تنقطع. ومن يعرف أن ثلاثين من دفعته يراجعون المادة نفسها
  الليلة يُكمل، ومن يظنّ نفسه وحده يتوقّف.

  قاعدتان تحكمان كل ما هنا:
  ١ · المقارنة داخل الجامعة لا عبر المنصة — طالب نجران لا يُقارَن بمن
      يذاكر مقرّرًا آخر في بلد آخر. المقارنة الظالمة تُحبط ولا تُحفّز.
  ٢ · الاسم والصورة فقط. لا بريد ولا معرّف يخرج من أي دالة.
*/
const Community = {
  board(uni, days){
    return QBANK.api.rpc('university_board', {
      p_uni: uni || null, p_days: days || 30, p_limit: 20 });
  },
  pulse(subjectId){ return QBANK.api.rpc('subject_pulse', { p_subject: subjectId, p_days: 7 }); },
  createChallenge(subjectId, title, hours){
    return QBANK.api.rpc('create_challenge', {
      p_subject: subjectId, p_title: title || '', p_hours: hours || 48 });
  },
  submitChallenge(code, score, correct){
    return QBANK.api.rpc('submit_challenge', {
      p_code: code, p_score: score, p_correct: correct || 0 });
  },
  challengeBoard(code){ return QBANK.api.rpc('challenge_board', { p_code: code }); },

  /* الوقت المتبقي بعبارة يفهمها الطالب بلمحة، لا بتاريخ يحسبه */
  timeLeft(endsAt){
    const ms = new Date(endsAt).getTime() - Date.now();
    if (!(ms > 0)) return 'انتهى';
    const h = Math.floor(ms / 3600000);
    if (h >= 24) return 'يبقى ' + QBANK.views.arNum(Math.floor(h / 24)) + ' يوم';
    if (h >= 1)  return 'يبقى ' + QBANK.views.arNum(h) + ' ساعة';
    return 'يبقى ' + QBANK.views.arNum(Math.max(1, Math.floor(ms / 60000))) + ' دقيقة';
  },

  /* الميدالية للثلاثة الأوائل فقط — ولو منحناها للجميع لما ميّزت أحدًا */
  medal(rank){ return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : ''; }
};

function boardRow(r){
  const cls = 'brd__row' + (r.me ? ' is-me' : '') + (r.rank <= 3 ? ' is-top' : '');
  return el('div', { class: cls }, [
    el('span', { class:'brd__rank num', text: Community.medal(r.rank) || QBANK.views.arNum(r.rank) }),
    el('span', { class:'brd__av', 'aria-hidden':'true', text: r.avatar || '◍' }),
    // ★ من لم يضع اسمًا يظهر «طالب» لا فراغًا ولا بريدًا
    el('span', { class:'brd__name', text: (r.name || 'طالب') + (r.me ? ' (أنت)' : '') }),
    el('span', { class:'brd__pts num', text: QBANK.views.arNum(r.points) + ' نقطة' })
  ]);
}

function boardBody(){
  const wrap = el('div', { class:'stack' });
  const list = el('div', { class:'brd' });
  wrap.appendChild(el('p', { class:'field__hint', style:'margin:0',
    text:'نقطة لكل إجابة صحيحة في اختبارات آخر ٣٠ يومًا — داخل جامعتك وحدها.' }));
  wrap.appendChild(list);

  list.appendChild(el('p', { class:'page__sub', text:'جارٍ التحميل…' }));
  Community.board(null, 30).then(r => {
    if (!list.isConnected) return;
    list.innerHTML = '';
    const d = r.ok ? r.data : null;

    if (!d || d.ok === false){
      // ★ سبب الفراغ يُقال: «لا جامعة» ليست عطلًا بل خطوة ناقصة
      list.appendChild(QBANK.views.empty('⌕', 'حدّد جامعتك أولًا',
        'المتصدرون داخل جامعتك — فنحتاج أن نعرف أيّها.',
        el('a', { class:'btn', href:'#/account', text:'حدّد جامعتي' })));
      return;
    }
    const rows = Array.isArray(d.rows) ? d.rows : [];
    if (!rows.length){
      list.appendChild(QBANK.views.empty('◇', 'لا اختبارات بعد هذا الشهر',
        'أول من يختبر يتصدّر. افتح مادة وابدأ اختبارًا.',
        el('a', { class:'btn', href:'#/', text:'إلى موادي' })));
      return;
    }
    rows.forEach(x => list.appendChild(boardRow(x)));

    /* ترتيبك ولو كنت خارج العشرين: «٤٧ من ٢٠٠» يُحفّز، والغياب يُحبط */
    const mine = d.me;
    if (mine && !rows.some(x => x.me))
      list.appendChild(el('div', { class:'brd__row is-me is-mine-out' }, [
        el('span', { class:'brd__rank num', text: QBANK.views.arNum(mine.rank) }),
        el('span', { class:'brd__av', 'aria-hidden':'true', text:'◍' }),
        el('span', { class:'brd__name', text:'ترتيبك أنت' }),
        el('span', { class:'brd__pts num', text: QBANK.views.arNum(mine.points) + ' نقطة' })
      ]));
  });
  return wrap;
}

/* نبض المادة: كم من دفعتك راجعوها هذا الأسبوع */
function pulseBand(subjectId){
  const box = el('div', { hidden:true });
  Community.pulse(subjectId).then(r => {
    if (!box.isConnected || !r.ok || !r.data || r.data.ok === false) return;
    const d = r.data;
    if (!d.week) return;                       // صفر لا يُعرض: «٠ يراجعون» تُحبط
    box.hidden = false;
    box.className = 'pulse';
    box.appendChild(el('span', { class:'pulse__dot', 'aria-hidden':'true' }));
    box.appendChild(el('span', { class:'pulse__t', text:
      d.campus
        ? QBANK.views.arNum(d.campus) + ' من جامعتك راجعوها هذا الأسبوع'
        : QBANK.views.arNum(d.week) + ' طالبًا راجعوها هذا الأسبوع' }));
  });
  return box;
}

/* ═══ التحدّي ═══ */
function challengeBox(sub){
  const box = el('div', { class:'card stack' });
  const msg = el('p', { class:'field__hint', role:'status', style:'margin:0' });

  const title = el('input', { class:'input', placeholder:'اسم التحدّي — مثال: تحدّي دفعة ٢٠٢٦' });
  const hours = el('select', { class:'input', 'aria-label':'مدة التحدي' });
  [[24,'يوم واحد'],[48,'يومان'],[72,'ثلاثة أيام'],[168,'أسبوع']].forEach(h =>
    hours.appendChild(el('option', { value:String(h[0]), text:h[1], selected: h[0] === 48 ? 'selected' : null })));

  const make = el('button', { class:'btn btn--sm', type:'button', text:'افتح تحدّيًا' });
  make.addEventListener('click', () => {
    make.disabled = true; msg.className = 'field__hint'; msg.textContent = 'جارٍ الإنشاء…';
    Community.createChallenge(sub.id, title.value, parseInt(hours.value, 10)).then(r => {
      make.disabled = false;
      if (!r.ok || !r.data || r.data.ok === false){
        msg.className = 'field__hint is-bad'; msg.textContent = 'تعذّر — تأكد من الاتصال.'; return;
      }
      showCode(r.data.code);
    });
  });

  const codeIn = el('input', { class:'input', dir:'ltr', placeholder:'ABC234',
    'aria-label':'رمز تحدٍّ للانضمام' });
  const join = el('button', { class:'btn btn--ghost btn--sm', type:'button', text:'انضم برمز' });
  join.addEventListener('click', () => {
    const c = (codeIn.value || '').trim().toUpperCase();
    if (c.length < 4){ msg.className = 'field__hint is-bad'; msg.textContent = 'اكتب الرمز كاملًا.'; return; }
    QBANK.router.go('#/challenge/' + c);
  });

  function showCode(code){
    box.innerHTML = '';
    box.appendChild(el('h2', { style:'margin:0', text:'تحدّيك جاهز' }));
    // ★ الرمز بحروف كبيرة متباعدة: يُملى صوتًا في مجموعة الدفعة لا يُنسخ فقط
    box.appendChild(el('p', { class:'chall__code ltr', text: code }));
    box.appendChild(el('p', { class:'field__hint', style:'margin:0',
      text:'أرسل الرمز لدفعتك — كل من يدخله يختبر على نفس المادة وتُقارَن نتائجكم.' }));
    const go = el('a', { class:'btn btn--sm', href:'#/challenge/' + code, text:'افتح لوحة التحدّي' });
    const copy = el('button', { class:'btn btn--soft btn--sm', type:'button', text:'انسخ الرابط' });
    copy.addEventListener('click', () => {
      const url = location.href.split('#')[0] + '#/challenge/' + code;
      const done = () => { copy.textContent = '✓ نُسخ'; setTimeout(() => { copy.textContent = 'انسخ الرابط'; }, 1800); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, done);
      else done();
    });
    box.appendChild(el('div', { class:'row', style:'gap:8px' }, [go, copy]));
  }

  box.appendChild(el('h2', { style:'margin:0', text:'تحدَّ دفعتك' }));
  box.appendChild(el('p', { class:'field__hint', style:'margin:0',
    text:'افتح تحدّيًا على هذه المادة، وأرسل رمزه لمجموعتكم — تُقارَن نتائجكم حتى ينتهي وقته.' }));
  box.appendChild(el('div', { class:'ad-edit ad-edit--2' }, [
    el('label', { class:'field', style:'margin:0' }, [ el('span', { class:'field__label', text:'اسم التحدّي' }), title ]),
    el('label', { class:'field', style:'margin:0' }, [ el('span', { class:'field__label', text:'المدة' }), hours ])
  ]));
  box.appendChild(el('div', { class:'row', style:'gap:8px' }, [make]));
  box.appendChild(el('hr', { class:'divider' }));
  box.appendChild(el('div', { class:'row', style:'gap:8px' }, [codeIn, join]));
  box.appendChild(msg);
  return box;
}

function ViewChallengeRender(route){
  const code = ((route.rest && route.rest[0]) || '').toUpperCase();
  const body = el('div', { class:'stack' });
  body.appendChild(el('p', { class:'page__sub', text:'جارٍ التحميل…' }));

  if (code) Community.challengeBoard(code).then(r => {
    if (!body.isConnected) return;
    body.innerHTML = '';
    const d = r.ok ? r.data : null;
    if (!d || d.ok === false){
      body.appendChild(QBANK.views.empty('؟', 'لم نجد هذا التحدّي',
        'تأكد من الرمز — ستة محارف كما وصلك.'));
      return;
    }
    body.appendChild(el('div', { class:'card stack' }, [
      el('h2', { style:'margin:0', text: d.title || ('تحدّي ' + (d.subject || '')) }),
      el('div', { class:'row' }, [
        el('span', { class:'badge', text: d.subject || '' }),
        el('span', { class: 'badge ' + (d.ended ? 'badge--bad' : 'badge--ok'),
          text: d.ended ? 'انتهى' : Community.timeLeft(d.ends_at) }),
        el('span', { class:'chall__code chall__code--sm ltr', text: d.code })
      ]),
      d.ended ? null : el('a', { class:'btn btn--sm',
        href:'#/exam/' + d.subject_id + '?challenge=' + d.code, text:'ابدأ اختبار التحدّي' })
    ]));

    const rows = Array.isArray(d.rows) ? d.rows : [];
    if (!rows.length){
      body.appendChild(QBANK.views.empty('◇', 'لا نتائج بعد',
        d.ended ? 'انتهى التحدّي بلا مشاركين.' : 'كن أول من يختبر — اسمك سيتصدّر اللوحة.'));
      return;
    }
    const list = el('div', { class:'brd' });
    rows.forEach(x => list.appendChild(el('div', {
      class:'brd__row' + (x.me ? ' is-me' : '') + (x.rank <= 3 ? ' is-top' : '') }, [
      el('span', { class:'brd__rank num', text: Community.medal(x.rank) || QBANK.views.arNum(x.rank) }),
      el('span', { class:'brd__av', 'aria-hidden':'true', text: x.avatar || '◍' }),
      el('span', { class:'brd__name', text: (x.name || 'طالب') + (x.me ? ' (أنت)' : '') }),
      el('span', { class:'brd__pts num', text: QBANK.views.arNum(x.score) + '٪' })
    ])));
    body.appendChild(list);
  });

  return QBANK.views.page('التحدّي', null, [body]);
}

const ViewChallenge = { title:'التحدّي', view: ViewChallengeRender };

QBANK.community = Community;
QBANK.community.boardBody = boardBody;
QBANK.community.boardRow = boardRow;
QBANK.community.pulseBand = pulseBand;
QBANK.community.challengeBox = challengeBox;
QBANK.views.ViewChallenge = ViewChallenge;
