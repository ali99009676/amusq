/*
  الملف العام وتقييم الزملاء.

  لماذا يُقيَّم الطالب أصلًا؟ لأن المحتوى هنا من الطلاب، وبنكٌ نافع يستحق
  أن يُعرف صاحبه. السمعة تجعل الرفع الجيد مربحًا اجتماعيًا لا ماليًا فقط.
  وحُصر التقييم في من رفع مادة (شرطٌ في القاعدة) كي يبقى عن العطاء لا عن
  الأشخاص — فلا يصير ساحة تصفية حسابات.
*/
const Peer = {
  profile(id){ return QBANK.api.rpc('public_profile', { p_user: id }); },
  rate(id, stars, note){
    return QBANK.api.rpc('rate_student', { p_target:id, p_stars:stars, p_note: note || '' });
  },
  uploader(subjectId){ return QBANK.api.rpc('uploader_of', { p_subject: subjectId }); },
  href(id){ return '#/p/' + id; },   // ‎#/u‎ لقسم الجامعة — لا تصادم

  /* نجوم مقروءة: اللون والشكل معًا، ومكتوبة للقارئ الآلي */
  stars(avg, n){
    const a = Number(avg) || 0, full = Math.round(a);
    return el('span', { class:'peer-stars', 'aria-label': a ? a + ' من ٥ من ' + (n||0) + ' تقييم' : 'بلا تقييم' }, [
      el('span', { class:'peer-stars__s', 'aria-hidden':'true', text:'★'.repeat(full) + '☆'.repeat(5 - full) }),
      el('span', { class:'peer-stars__n num', text: n ? (a.toFixed(1) + ' · ' + QBANK.views.arNum(n)) : 'جديد' })
    ]);
  },

  /* صورة الطالب: المرفوعة إن وُجدت، وإلا الرمزية — دالة واحدة لكل المنصة */
  face(p, cls){
    if (p && p.avatar_url)
      return el('img', { class:'peer-face ' + (cls || ''), src: p.avatar_url, alt: p.name || 'طالب' });
    return el('span', { class:'peer-face peer-face--emo ' + (cls || ''), 'aria-hidden':'true',
      text: (p && p.avatar) || '◍' });
  }
};

/* ═══ ودجت التقييم ═══ */
function peerRateCard(p, onDone){
  const me = QBANK.api.user();
  if (!me) return el('div', { class:'card' }, [
    el('p', { class:'page__sub', text:'سجّل دخولك لتقييم زملائك.' }),
    el('a', { class:'btn btn--soft btn--block', href:'#/login', text:'دخول' })
  ]);
  if (me.id === p.id) return null;                       // لا يقيّم نفسه
  if (!Number(p.uploads)) return el('div', { class:'card' }, [
    el('p', { class:'field__hint', style:'margin:0',
      text:'يُقيَّم الطالب بعد أن يرفع مادة — التقييم هنا عن العطاء لا عن الأشخاص.' })
  ]);

  const mine = p.mine || {};
  let picked = Number(mine.stars) || 0;
  const msg = el('p', { class:'field__hint', role:'status', style:'margin:8px 0 0' });
  const row = el('div', { class:'rate__stars', role:'radiogroup', 'aria-label':'قيّم هذا الطالب' });
  const btns = [];
  const paint = () => btns.forEach((b, i) => {
    b.textContent = i < picked ? '★' : '☆';
    b.classList.toggle('is-on', i < picked);
    b.setAttribute('aria-checked', (i + 1) === picked ? 'true' : 'false');
  });
  for (let i = 1; i <= 5; i++){
    const b = el('button', { class:'rate__star', type:'button', role:'radio',
      'aria-checked':'false', 'aria-label': i + ' من ٥', text:'☆' });
    b.addEventListener('click', () => { picked = i; paint(); });
    btns.push(b); row.appendChild(b);
  }
  paint();

  const note = el('textarea', { class:'input', rows:'2',
    placeholder:'كلمة عن بنوكه: هل نفعتك؟ (اختياري)' });
  note.value = mine.note || '';

  const send = el('button', { class:'btn btn--block', type:'button',
    text: mine.stars ? 'حدّث تقييمي' : 'أرسل التقييم' });
  send.addEventListener('click', async () => {
    if (!picked){ msg.className = 'field__hint is-bad'; msg.textContent = 'اختر عدد النجوم أولًا.'; return; }
    send.setAttribute('aria-disabled','true'); send.textContent = 'جارٍ…';
    const r = await Peer.rate(p.id, picked, note.value.trim());
    send.removeAttribute('aria-disabled'); send.textContent = 'حدّث تقييمي';
    const ok = r.ok && r.data && r.data.ok;
    if (!ok){
      const why = (r.data && r.data.reason) || '';
      msg.className = 'field__hint is-bad';
      msg.textContent = why === 'no_uploads' ? 'يُقيَّم الطالب بعد أن يرفع مادة.'
                      : why === 'self' ? 'لا تقيّم نفسك.'
                      : 'تعذّر الإرسال — تحقق من الاتصال.';
      return;
    }
    msg.className = 'field__hint is-ok';
    msg.textContent = 'شكرًا — متوسطه الآن ' + Number(r.data.avg).toFixed(1);
    QBANK.toast('سُجّل تقييمك');
    if (onDone) onDone();
  });

  return el('div', { class:'card stack' }, [
    el('h2', { style:'margin:0', text: mine.stars ? 'تقييمك له' : 'قيّم هذا الطالب' }),
    el('p', { class:'field__hint', style:'margin:0',
      text:'تقييمك يساعد الطلاب على معرفة البنوك النافعة وأصحابها.' }),
    row, note, send, msg
  ]);
}

/* ═══ الشاشة العامة ═══ */
const ViewPeer = {
  title:'ملف الطالب',
  view(route){
    const id = route.rest[0];
    if (!id) return QBANK.views.ViewNotFound.view();

    const box = el('div', { class:'stack' }, [ el('p', { class:'page__sub', text:'جارٍ الجلب…' }) ]);
    function load(){
      Peer.profile(id).then(r => {
        if (!box.isConnected) return;
        const p = (r.ok && r.data && !r.data.error) ? r.data : null;
        box.innerHTML = '';
        if (!p){
          box.appendChild(QBANK.views.empty('؟', 'لم نجد هذا الطالب',
            'ربما حُذف حسابه، أو الرابط غير صحيح.',
            el('a', { class:'btn', href:'#/', text:'الرئيسية' })));
          return;
        }

        /* البطل: وجهه واسمه وسمعته وعطاؤه */
        const me = QBANK.api.user();
        const isMe = me && me.id === p.id;
        box.appendChild(el('div', { class:'card pf-hero' }, [
          el('div', { class:'pf-hero__avwrap' }, [ Peer.face(p, 'peer-face--lg') ]),
          el('div', { class:'pf-hero__x' }, [
            el('strong', { class:'pf-hero__n', text: p.name || 'طالب مراجعة' }),
            el('span', { class:'pf-hero__mail', text:
              [p.university, p.college].filter(Boolean).join(' · ') || 'بلا جامعة محدّدة' }),
            Peer.stars(p.rating_avg, p.rating_n),
            p.bio ? el('p', { class:'pf-hero__bio', text: p.bio }) : null,
            isMe ? el('a', { class:'btn btn--sm btn--soft', href:'#/account/profile',
              style:'margin-top:8px', text:'هذا ملفك — حرّره' }) : null,
            /* ★ ملفٌ لا يُرسَل لا يُرى. سمعةُ الرافع تُبنى بمن يفتح ملفه،
               ولا أحد يفتحه ما لم يصل إليه رابطٌ من صاحبه أو من زميل. */
            QBANK.share ? el('div', { style:'margin-top:10px' }, [
              QBANK.share.shareButton({
                url: QBANK.share.profileUrl(p.id),
                title: (p.name || 'طالب') + ' على مراجعة',
                text: isMe ? 'هذا ملفي على منصة مراجعة'
                           : 'شوف ملف ' + (p.name || 'هذا الطالب') + ' على مراجعة',
                label: isMe ? '⤴ انشر ملفك' : '⤴ انشر الملف' })
            ]) : null
          ])
        ]));

        /* عطاؤه بالأرقام */
        box.appendChild(el('div', { class:'peer-stats' }, [
          el('div', { class:'peer-stat' }, [
            el('b', { class:'num', text: QBANK.views.arNum(p.uploads || 0) }),
            el('span', { text:'مادة مرفوعة' }) ]),
          el('div', { class:'peer-stat' }, [
            el('b', { class:'num', text: QBANK.views.arNum(p.questions || 0) }),
            el('span', { text:'سؤالًا أهداه' }) ]),
          el('div', { class:'peer-stat' }, [
            el('b', { class:'num', text: Number(p.rating_avg) ? Number(p.rating_avg).toFixed(1) : '—' }),
            el('span', { text: p.rating_n ? 'من ' + QBANK.views.arNum(p.rating_n) + ' تقييم' : 'بلا تقييم بعد' }) ]),
          /* ★ «كم اشترى منه غيري» — الرقم الذي يسبق تحويلًا بنكيًا إلى غريب */
          el('div', { class:'peer-stat' }, [
            el('b', { class:'num', text: QBANK.views.arNum(p.sales || 0) }),
            el('span', { text:'طالبًا اشتروا منه' }) ])
        ]));

        /* شارات الثقة: تُقال كلمةً لا رقمًا حين تكون كلمة */
        const trust = [];
        if (p.phone_verified) trust.push(el('span', { class:'badge badge--ok', text:'✓ رقم جوال موثَّق' }));
        if (Number(p.exam_tagged) > 0)
          trust.push(el('span', { class:'badge badge--gold', text:
            QBANK.views.arNum(p.exam_tagged) + ' سؤالًا جاء في اختبارات سابقة' }));
        if (trust.length) box.appendChild(el('div', { class:'row', style:'gap:6px' }, trust));

        /* مواده: بطاقات حقيقية تُفتح */
        const subs = p.subjects || [];
        box.appendChild(el('h2', { style:'margin:8px 0 0',
          text: subs.length ? 'مواده المرفوعة' : 'لم يرفع مادة بعد' }));
        if (subs.length){
          box.appendChild(el('div', { class:'grid' }, subs.map(s =>
            QBANK.views.subjectCard(Object.assign({ topics:[], exam_date:null }, s)))));
        } else {
          box.appendChild(el('p', { class:'field__hint',
            text:'حين يرفع بنك أسئلة يظهر هنا لكل زملائه.' }));
        }

        /* آراء زملائه */
        const rates = p.ratings || [];
        if (rates.length){
          box.appendChild(el('h2', { style:'margin:8px 0 0', text:'آراء الزملاء' }));
          box.appendChild(el('div', { class:'stack' }, rates.map(x =>
            el('div', { class:'card peer-op' }, [
              el('div', { class:'row' }, [
                Peer.face({ avatar: x.by_avatar, avatar_url: x.by_avatar_url, name: x.by }, 'peer-face--sm'),
                x.by_id ? el('a', { class:'peer-op__n', href: Peer.href(x.by_id), text: x.by || 'طالب' })
                        : el('span', { class:'peer-op__n', text: x.by || 'طالب' }),
                el('span', { class:'spacer' }),
                el('span', { class:'badge badge--warn', 'aria-label': x.stars + ' من ٥',
                  text: '★'.repeat(x.stars) + '☆'.repeat(5 - x.stars) })
              ]),
              x.note ? el('p', { style:'margin:6px 0 0', text: x.note }) : null
            ]))));
        }

        const card = peerRateCard(p, load);
        if (card) box.appendChild(card);
      });
    }
    load();
    return QBANK.views.page('ملف الطالب', null, [box]);
  }
};

/* ═══ سطر «رفعها فلان» — يُلحق بصفحة المادة ═══ */
function uploaderLine(subjectId){
  const wrap = el('div');
  Peer.uploader(subjectId).then(r => {
    const p = (r.ok && r.data && r.data.id) ? r.data : null;
    if (!p || !wrap.isConnected) return;
    wrap.appendChild(el('a', { class:'peer-by', href: Peer.href(p.id) }, [
      Peer.face(p, 'peer-face--sm'),
      el('span', { class:'peer-by__x' }, [
        el('span', { class:'peer-by__l', text:'رفعها' }),
        el('span', { class:'peer-by__n', text: p.name || 'طالب' })
      ]),
      Peer.stars(p.rating_avg, p.rating_n),
      el('span', { class:'peer-by__go', 'aria-hidden':'true', text:'←' })
    ]));
  });
  return wrap;
}

QBANK.peer = Peer;
QBANK.views.ViewPeer = ViewPeer;
QBANK.views.peerRateCard = peerRateCard;
QBANK.views.uploaderLine = uploaderLine;
