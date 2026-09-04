/*
  ═══════════════════════════════════════════════════════════════════
  لوحة المتصدرين — ثلاثة نطاقات وستة أقسام
  ═══════════════════════════════════════════════════════════════════
  النطاقات: كل الجامعات · جامعة بعينها · مادة بعينها — دالة واحدة في
  القاعدة (board_full) وشاشة واحدة هنا تُبنى مرة.

  ★ المبدأ الحاكم: كل رقم يراه الطالب رقمٌ حقيقي.
  لا عدّاد مبدئي مضخَّم ولا اسم وهمي. الرقم الصغير يُخفى لا يُكبَّر:
  بطاقة «نشطون هذا الأسبوع» لا تُعرض دون عشرة، وتُقدَّم بدلها التراكميات
  التي تكبر بسرعة. والطالب يعرف زملاءه بالاسم — رقم مكذوب يُكتشف في يوم
  ويسقط معه كل رقم صادق.

  «المتصلون الآن» = من نبض جهازه خلال آخر ٤ ساعات (بطلب علي)، ويُقال
  للطالب أنهم «الآن» مع بيان النافذة في التلميح — صدقًا لا تضخيمًا.

  الترتيب الافتراضي عدد المحاولات لا أعلى نسبة: التصدّر بكثرة التدريب
  مكافأة على الاجتهاد ويُنافَس عليه؛ و«١٠٠٪ في اختبار من سؤال» حظٌّ.
*/

const Board = {
  MIN_ACTIVE: 10,          // قاعدة الصدق: تحت العشرة تُخفى البطاقة
  sortMode: 'tries',
  scope: 'all',            // all | university | subject
  scopeId: null,
  _cache: null,

  N(n){ return QBANK.views.arNum(n == null ? 0 : n); },
  fmtTime(sec){
    const h = Math.floor((sec || 0) / 3600), m = Math.round(((sec || 0) % 3600) / 60);
    return h ? Board.N(h) + ' س ' + Board.N(m) + ' د' : Board.N(m) + ' دقيقة';
  },
  ago(ts){
    const t = typeof ts === 'number' ? ts : Math.floor(new Date(ts).getTime() / 1000);
    const d = Math.floor(Date.now() / 1000) - t;
    if (d < 3600) return 'قبل قليل';
    if (d < 86400) return 'اليوم';
    if (d < 172800) return 'أمس';
    return 'قبل ' + Board.N(Math.floor(d / 86400)) + ' يومًا';
  },

  /* الفرز في المتصفح بلا نداء جديد */
  sorted(rows){
    const r = rows.slice();
    if (Board.sortMode === 'acc')  return r.sort((a, b) => (b.accuracy - a.accuracy) || (b.questions - a.questions));
    if (Board.sortMode === 'qs')   return r.sort((a, b) => (b.questions - a.questions) || (b.accuracy - a.accuracy));
    if (Board.sortMode === 'best') return r.sort((a, b) => (b.best - a.best) || (b.tries - a.tries));
    return r.sort((a, b) => (b.tries - a.tries) || (b.best - a.best));
  },

  load(scope, id){
    return QBANK.api.rpc('board_full', { p_scope: scope || 'all', p_id: id || null, p_limit: 200 });
  },

  /* لون المادة من فهرس المواد — ومادةٌ غير معروفة تأخذ لونًا محايدًا بأمان */
  colorOf(c){ return c && /^subject-\d$/.test(c) ? 'var(--' + c + ')' : 'var(--brand)'; },

  /* «متصل الآن» — شارة واحدة تُستعمل في كل مكان، والتلميح يقول النافذة */
  onlineBadge(n, small){
    return el('span', { class:'badge badge--ok num lb-online' + (small ? ' lb-online--sm' : ''),
      title:'حضورٌ خلال آخر ٤ ساعات', 'aria-label': Board.N(n) + ' متصل الآن (خلال آخر ٤ ساعات)' }, [
      el('i', { class:'lb-online__dot', 'aria-hidden':'true' }),
      el('span', { text: Board.N(n) + ' متصل الآن' })
    ]);
  }
};
QBANK.board = Board;

/* ═══ ١) بطاقات الملخّص — التراكمي أولًا ═══ */
function lbKpis(S){
  const N = Board.N;
  const cards = [
    ['الأسئلة المُجابة', N(S.questions)],
    ['الاختبارات', N(S.exams)],
    ['دقة المنصة', N(S.accuracy) + '٪'],
    ['ساعات المراجعة', N(S.hours)]
  ];
  /* ★ قاعدة الصدق: «نشطون هذا الأسبوع» لا تُعرض ما لم يتجاوز العدد عشرة */
  if ((S.active7d || 0) >= Board.MIN_ACTIVE) cards.push(['نشطون هذا الأسبوع', N(S.active7d)]);
  cards.push(['الطلاب', N(S.students)]);
  return el('div', { class:'lb-kpis' }, cards.map(c => el('div', { class:'lb-kpi' }, [
    el('span', { class:'lb-kpi__n num', text: c[1] }),
    el('span', { class:'lb-kpi__l', text: c[0] })
  ])));
}

/* ═══ ٢) شريط الحركة — يُكرَّر المحتوى مرتين لتصير الحركة دائرية بلا قفزة ═══ */
function lbFeed(feed){
  const items = (feed || []).slice(0, 12);
  if (!items.length) return null;
  const mk = f => el('span', { class:'lb-feed__i', style:'--acc:' + Board.colorOf(f.color) }, [
    el('b', { text: f.n }),
    el('span', { text: ' أنهى ' + (f.subject || 'اختبارًا') + ' · ' }),
    el('span', { class:'num', text: Board.N(f.p) + '٪' })
  ]);
  return el('div', { class:'lb-feed', 'aria-label':'آخر ما فعله زملاؤك' }, [
    el('div', { class:'lb-feed__track' }, items.map(mk).concat(items.map(mk)))
  ]);
}

/* ═══ ٣) بطاقتك أنت — أهمّ قسم ═══ */
function lbMe(me, S){
  if (!me) return null;
  const N = Board.N;
  const pctile = Math.max(1, Math.round(100 - (me.rank - 1) * 100 / Math.max(1, me.of)));
  const cmpAcc = (me.accuracy || 0) - (S.accuracy || 0);
  return el('div', { class:'card lb-me' }, [
    el('div', { class:'lb-me__rank' }, [
      el('span', { class:'lb-me__n num', text:'#' + N(me.rank) }),
      el('span', { class:'lb-me__l', text:'من ' + N(me.of) })
    ]),
    el('div', { class:'lb-me__x' }, [
      el('strong', { text: me.rank === 1 ? 'أنت المتصدّر' : 'أعلى من ' + N(pctile) + '٪ من الطلاب' }),
      el('span', { class:'field__hint', text:
        'دقّتك ' + N(me.accuracy) + '٪ — ' +
        (cmpAcc > 0 ? 'أعلى من متوسط المنصة بـ' + N(cmpAcc) + ' نقطة' :
         cmpAcc < 0 ? 'أقل من متوسط المنصة بـ' + N(-cmpAcc) + ' نقطة' : 'على متوسط المنصة تمامًا') +
        ' · راجعت ' + Board.fmtTime(me.seconds) + ' في ' + N(me.tries) + ' اختبارًا.' })
    ])
  ]);
}

/* ═══ ٤) المنصّة — الأول أعلى وأكبر بترتيب بصري [2,1,3] ═══ */
function lbPodium(rows){
  if (rows.length < 3) return null;
  const order = [rows[1], rows[0], rows[2]];
  return el('div', { class:'lb-podium' }, order.map((r, i) => {
    const place = i === 1 ? 1 : i === 0 ? 2 : 3;
    return el('div', { class:'lb-podium__p lb-podium__p--' + place }, [
      el('span', { class:'lb-podium__av', text: r.avatar_url ? '' : (r.avatar || '👤') },
        r.avatar_url ? [ el('img', { src: r.avatar_url, alt:'' }) ] : null),
      el('span', { class:'lb-podium__name' + (r.blocked ? ' blk' : ''), text: r.name }),
      el('span', { class:'lb-podium__n num', text: Board.N(r.tries) + ' اختبارًا' }),
      el('span', { class:'lb-podium__rank num', 'aria-label':'المركز ' + Board.N(place), text: Board.N(place) })
    ]);
  }));
}

/* ═══ ٥) أبطال المواد — ومع كل مادة عدد المتصلين الآن فيها ═══ */
function lbChampions(ch, onPick){
  if (!ch || !ch.length) return null;
  return el('div', { class:'lb-champs' }, ch.map(c => {
    const card = el('button', { class:'lb-champ', type:'button', style:'--acc:' + Board.colorOf(c.color),
      'aria-label':'متصدّرو مادة ' + c.subject }, [
      el('span', { class:'lb-champ__ico', 'aria-hidden':'true' }, [ QBANK.subjIcon(c.icon, 20) ]),
      el('span', { class:'lb-champ__x' }, [
        el('span', { class:'lb-champ__s', text: c.subject }),
        el('span', { class:'lb-champ__w' + (c.blocked ? ' blk' : ''), text: c.name ? '🏆 ' + c.name + ' · ' + Board.N(c.pct) + '٪' : '—' })
      ]),
      Board.onlineBadge(c.online_now || 0, true)
    ]);
    card.addEventListener('click', () => onPick(c.subject_id));
    return card;
  }));
}

/* ═══ ٦) الجدول الكامل — بأربعة أوضاع فرز، وصفّك مميَّز بشارة «أنت» ═══ */
function lbTable(rows, meId){
  const wrap = el('div', { class:'lb-tablewrap' });
  const modes = [['tries','الاختبارات'], ['best','أعلى نسبة'], ['acc','الدقة'], ['qs','الأسئلة']];
  const chips = el('div', { class:'row lb-sort', role:'group', 'aria-label':'الفرز' }, modes.map(m => {
    const b = el('button', { class:'chip' + (Board.sortMode === m[0] ? ' is-on' : ''), type:'button',
      'data-sort': m[0], text: m[1] });
    b.addEventListener('click', () => {
      Board.sortMode = m[0];
      chips.querySelectorAll('.chip').forEach(x => x.classList.toggle('is-on', x.getAttribute('data-sort') === m[0]));
      draw();
    });
    return b;
  }));
  const list = el('div', { class:'lb-rows' });
  function draw(){
    list.innerHTML = '';
    Board.sorted(rows).forEach((r, i) => {
      const mine = meId && r.id === meId;
      list.appendChild(el('div', { class:'lb-row' + (mine ? ' is-me' : '') + (r.blocked ? ' is-blk' : '') }, [
        el('span', { class:'lb-row__rank num', text: Board.N(i + 1) }),
        el('span', { class:'lb-row__av', 'aria-hidden':'true', text: r.avatar_url ? '' : (r.avatar || '👤') },
          r.avatar_url ? [ el('img', { src: r.avatar_url, alt:'' }) ] : null),
        el('span', { class:'lb-row__x' }, [
          el('span', { class:'lb-row__name' + (r.blocked ? ' blk' : ''), text: r.name }, [
            mine ? el('span', { class:'badge badge--gold', text:'أنت' }) : null,
            r.blocked ? el('span', { class:'badge badge--bad', text:'محظور' }) : null,
            r.online ? el('i', { class:'lb-online__dot', title:'متصل الآن', 'aria-label':'متصل الآن' }) : null
          ]),
          el('span', { class:'lb-row__sub', text: (r.university ? r.university + ' · ' : '') + 'آخر نشاط ' + Board.ago(r.last) })
        ]),
        el('span', { class:'lb-row__stats num' }, [
          el('b', { text: Board.N(r.tries) }), el('small', { text:'اختبار' }),
          el('b', { text: Board.N(r.best) + '٪' }), el('small', { text:'أعلى' }),
          el('b', { text: Board.N(r.accuracy) + '٪' }), el('small', { text:'دقة' }),
          el('b', { text: Board.N(r.questions) }), el('small', { text:'سؤال' })
        ])
      ]));
    });
  }
  draw();
  wrap.appendChild(chips); wrap.appendChild(list);
  return wrap;
}

/* ═══ اختيار النطاق: كل الجامعات · جامعة · مادة ═══ */
function lbScopeBar(d, onChange){
  const bar = el('div', { class:'lb-scope' });
  const tabs = el('div', { class:'tabs', role:'tablist' });
  const mk = (id, label, ico) => {
    const b = el('button', { class:'tabs__btn', type:'button', role:'tab', 'data-scope': id,
      'aria-selected': Board.scope === id ? 'true' : 'false' }, [
      el('span', { class:'tabs__ico', 'aria-hidden':'true', text: ico }), el('span', { text: label }) ]);
    b.addEventListener('click', () => onChange(id, null));
    return b;
  };
  tabs.appendChild(mk('all', 'كل الجامعات', '🌍'));
  tabs.appendChild(mk('university', 'جامعة', '⌂'));
  tabs.appendChild(mk('subject', 'مادة', '▤'));
  bar.appendChild(tabs);

  /* في نطاق الجامعة: قائمة الجامعات التي فيها متصدّرون — جامعتي أولًا */
  if (Board.scope === 'university'){
    const unis = d.universities || [];
    const sel = el('select', { class:'input', 'aria-label':'اختر جامعة' });
    const mine = QBANK.campus && QBANK.campus.cached() ? QBANK.campus.cached().university_id : null;
    unis.forEach(u => sel.appendChild(el('option', { value: u.id, text: u.name + ' — ' + Board.N(u.students) + ' طالبًا' })));
    if (!unis.length) sel.appendChild(el('option', { value:'', text:'لا جامعة فيها اختبارات بعد' }));
    const cur = Board.scopeId || (d.target && d.target.id) || mine || (unis[0] && unis[0].id) || '';
    sel.value = cur;
    sel.addEventListener('change', () => onChange('university', sel.value || null));
    bar.appendChild(sel);
  }
  if (Board.scope === 'subject'){
    const subs = (QBANK.data.pack().subjects || []);
    const sel = el('select', { class:'input', 'aria-label':'اختر مادة' });
    subs.forEach(s => sel.appendChild(el('option', { value: s.id, text: s.name })));
    const cur = Board.scopeId || (d.target && d.target.id) || (subs[0] && subs[0].id) || '';
    sel.value = cur;
    sel.addEventListener('change', () => onChange('subject', sel.value || null));
    bar.appendChild(sel);
  }
  return bar;
}

const ViewBoard = {
  title:'المتصدرون',
  view(route){
    /* المسار يحمل النطاق: #/board/subject/<id> أو #/board/university/<id> */
    const rest = (route && route.rest) || [];
    if (rest[0] === 'subject' || rest[0] === 'university'){ Board.scope = rest[0]; Board.scopeId = rest[1] || null; }
    else if (rest[0] === 'all'){ Board.scope = 'all'; Board.scopeId = null; }

    const body = el('div', { class:'stack lb' }, [ el('p', { class:'page__sub', text:'جارٍ الجلب…' }) ]);
    const go = (scope, id) => {
      Board.scope = scope; Board.scopeId = id;
      QBANK.router.go('#/board/' + scope + (id ? '/' + id : ''));
    };

    Board.load(Board.scope, Board.scopeId).then(r => {
      if (!alive()) return;
      body.innerHTML = '';
      const d = r.ok && r.data;
      if (!d){ body.appendChild(QBANK.views.empty('🏆', 'تعذّر الجلب', r.offline ? 'المتصدرون يحتاجون اتصالًا.' : 'حاول لاحقًا.')); return; }
      if (d.disabled){ body.appendChild(QBANK.views.empty('🏆', 'اللوحة موقوفة', 'أوقفها المشرف مؤقتًا.')); return; }
      body.appendChild(lbScopeBar(d, go));
      if (!d.ok){
        body.appendChild(QBANK.views.empty('⌂', d.reason === 'no-university' ? 'حدّد جامعتك أولًا' : 'اختر مادة',
          d.reason === 'no-university' ? 'من حسابك ← جامعتي — ثم تعود هنا لترى متصدّري جامعتك.' : 'من القائمة أعلاه.',
          d.reason === 'no-university' ? el('a', { class:'btn', href:'#/account', text:'حدّد جامعتي' }) : null));
        return;
      }
      Board._cache = d;
      const S = d.summary || {}, rows = d.board || [], meId = d.me && d.me.id;

      /* رأس النطاق: الاسم + «المتصلون الآن» — الأربع ساعات في التلميح */
      const T = d.target || {};
      body.appendChild(el('div', { class:'lb-head', style: T.color ? '--acc:' + Board.colorOf(T.color) : null }, [
        el('div', { class:'lb-head__x' }, [
          el('h2', { class:'lb-head__t', text: Board.scope === 'all' ? 'كل الجامعات' : (T.name || '') }),
          el('span', { class:'field__hint', text:
            Board.scope === 'subject' ? 'متصدّرو هذه المادة — والمتصلون فيها الآن'
            : Board.scope === 'university' ? 'متصدّرو الجامعة بين زملائك في المقرّرات نفسها'
            : 'المنصة كلها — وكل جامعة تُقارَن بنفسها من تبويب «جامعة»' })
        ]),
        Board.onlineBadge(S.online_now || 0)
      ]));

      if (!rows.length){
        body.appendChild(QBANK.views.empty('🏆', 'كن أول من يؤدّي اختبارًا', 'أول اختبار تجريبي يفتح هذه اللوحة.',
          el('a', { class:'btn', href:'#/', text:'اختر مادة' })));
        return;
      }
      body.appendChild(lbKpis(S));
      const feed = lbFeed(d.feed); if (feed) body.appendChild(feed);
      const me = lbMe(d.me, S); if (me) body.appendChild(me);
      const pod = lbPodium(Board.sorted(rows)); if (pod) body.appendChild(pod);
      if (Board.scope !== 'subject'){
        const ch = lbChampions(d.champions, sid => go('subject', sid));
        if (ch){ body.appendChild(el('h2', { text:'أبطال المواد' })); body.appendChild(ch); }
      }
      body.appendChild(el('h2', { text:'الجدول الكامل' }));
      body.appendChild(lbTable(rows, meId));

      if (QBANK.pulse) QBANK.pulse.feed(d.feed || []);
    });
    return QBANK.views.page('المتصدرون', 'أرقام حقيقية من اختبارات زملائك — بأسماء العرض فقط.', [body]);
  }
};
QBANK.views.ViewBoard = ViewBoard;

/*
  ═══ Pulse — إشعارات حركة الزملاء ═══
  بطاقة صغيرة تنزلق في زاوية الشاشة: «عبدالرحمن أنهى علم السموم · ٨٠٪»
  وزر «جرّبها» يفتح المادة نفسها. هذا ما يحوّل اللوحة من صفحةٍ تُزار إلى
  حافزٍ يلاحق الطالب. الأرقام مضبوطة بالتجربة — تغييرها يقلبها إزعاجًا.
  أربع قواعد: لا يُقاطَع طالب داخل اختبار، واحد في كل مرة، لا حدث الطالب
  نفسه، وزر × يوقفها نهائيًا ويُحفظ الاختيار.
*/
const Pulse = {
  FIRST: 12000, GAP: 45000, LIFE: 7000, MAX: 6,
  KEY: 'pulse_off',
  shown: 0, _items: [], _timer: null,
  off(){ return !!QBANK.store.get(Pulse.KEY, false); },
  setOff(v){ QBANK.store.set(Pulse.KEY, !!v); if (v) Pulse.stop(); },
  inExam(){
    try { const p = QBANK.router.current && QBANK.router.current.path; return p === '#/exam' || p === '#/review'; }
    catch(e){ return false; }
  },
  feed(items){
    const u = QBANK.api.user();
    Pulse._items = (items || []).filter(f => !(u && f.uid === u.id) && !f.blocked);
    if (!Pulse._timer && !Pulse.off() && Pulse._items.length) Pulse.start();
  },
  start(){
    if (Pulse._timer) return;
    Pulse._timer = setTimeout(Pulse.tick, Pulse.FIRST);
  },
  stop(){ if (Pulse._timer){ clearTimeout(Pulse._timer); Pulse._timer = null; } },
  tick(){
    Pulse._timer = null;
    if (Pulse.off() || Pulse.shown >= Pulse.MAX) return;
    if (!Pulse.inExam() && !document.querySelector('.pulse') && Pulse._items.length){
      const f = Pulse._items[Pulse.shown % Pulse._items.length];
      Pulse.show(f);
    }
    if (Pulse.shown < Pulse.MAX) Pulse._timer = setTimeout(Pulse.tick, Pulse.GAP + Math.random() * 15000);
  },
  show(f){
    if (document.querySelector('.pulse')) return null;
    Pulse.shown++;
    const box = el('div', { class:'pulse', role:'status', style:'--acc:' + Board.colorOf(f.color) }, [
      el('span', { class:'pulse__t' }, [ el('b', { text: f.n }), el('span', { text:' أنهى ' + (f.subject || 'اختبارًا') + ' · ' + Board.N(f.p) + '٪' }) ]),
      f.s ? el('a', { class:'btn btn--sm', href:'#/subject/' + f.s, text:'جرّبها' }) : null,
      el('button', { class:'pulse__x', type:'button', 'aria-label':'أوقف هذه الإشعارات', text:'×' })
    ]);
    box.querySelector('.pulse__x').addEventListener('click', () => { Pulse.setOff(true); box.remove(); });
    document.body.appendChild(box);
    setTimeout(() => { if (box.isConnected) box.classList.add('is-out'); setTimeout(() => box.remove(), 400); }, Pulse.LIFE);
    return box;
  }
};
QBANK.pulse = Pulse;

/* «المتصلون الآن» في بطاقات المواد على الرئيسية — نداء واحد لكل المواد */
QBANK.board.decorateCards = function(root){
  QBANK.api.rpc('subjects_online').then(r => {
    if (!alive() || !r.ok || !r.data) return;
    const m = r.data;
    (root || document).querySelectorAll('.sub-card[data-id]').forEach(c => {
      const n = Number(m[c.getAttribute('data-id')]) || 0;
      if (!n || c.querySelector('.lb-online')) return;
      const foot = c.querySelector('.foot') || c;
      foot.appendChild(Board.onlineBadge(n, true));
    });
  });
};
