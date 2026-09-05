/*
  ═══════════════════════════════════════════════════════════════════
  المتصدرون في صفحة البداية — نافذةٌ صغيرة على اللوحة الكاملة
  ═══════════════════════════════════════════════════════════════════
  اللوحة كانت لها صفحة (#/board) بلا بابٍ يُرى: لا في الرئيسية ولا في
  صفحة الزائر ولا في شريط التنقّل. ما لا يُرى في أول شاشة لا يوجد.

  ★ نافذة واحدة للزائر والطالب معًا (board_full مسموحة لـanon):
  الزائر يرى أن المنصة حيّة — أسماءً حقيقية وعدّاد «متصل الآن» — قبل أن
  يسجّل، والطالب يرى ترتيبه هو. والفراغُ لا يُخفى: «كن أول من يؤدّي
  اختبارًا» دعوةٌ أصدق من بطاقةٍ مختفية.
*/
function boardMini(opts){
  const o = opts || {};
  const B = QBANK.board;
  const box = el('section', { class:'lb-mini card', 'aria-label':'المتصدرون' });
  const head = el('div', { class:'lb-mini__h' }, [
    el('span', { class:'lb-mini__ico', 'aria-hidden':'true' }, [ QBANK.ico('trophy', { size:22 }) ]),
    el('div', { class:'lb-mini__x' }, [
      el('h2', { class:'lb-mini__t', text: o.title || 'المتصدرون' }),
      el('span', { class:'lb-mini__s', text:'أرقام حقيقية من اختبارات زملائك — بأسماء العرض فقط' })
    ]),
    el('span', { class:'lb-mini__on' }),
    el('a', { class:'btn btn--sm btn--ghost', href:'#/board', text:'اللوحة كاملة ←' })
  ]);
  const body = el('div', { class:'lb-mini__b' }, [ el('p', { class:'field__hint', style:'margin:0', text:'جارٍ الجلب…' }) ]);
  box.appendChild(head); box.appendChild(body);

  B.load('all').then(r => {
    if (!alive()) return;
    body.innerHTML = '';
    const d = (r.ok && r.data && r.data.ok) ? r.data : null;
    if (!d){
      /* لا نداء ولا بيانات: النافذة لا تُترك برسالة خطأ في أول شاشة — تختفي بصمت */
      box.remove();
      return;
    }
    const S = d.summary || {};
    if (Number(S.online_now) > 0) head.querySelector('.lb-mini__on').appendChild(B.onlineBadge(S.online_now, true));

    const rows = d.board || [];
    if (!rows.length){
      /* ★ الفراغ دعوة: أول اختبارٍ يفتح اللوحة — والزرّ يقود إلى مادة لا إلى شرح */
      body.appendChild(el('div', { class:'lb-mini__empty' }, [
        el('span', { text:'لا أحد على اللوحة بعد — أول اختبار تجريبي يفتحها.' }),
        el('a', { class:'btn btn--sm', href: QBANK.api.user() ? '#/' : '#/login', text:'كن أول المتصدرين' })
      ]));
      return;
    }
    if (rows.length >= 3 && typeof lbPodium === 'function') body.appendChild(lbPodium(rows.slice(0, 3)));
    /* الصفوف بعد المنصّة — أو كلها إن كانوا أقل من ثلاثة */
    const rest = rows.length >= 3 ? rows.slice(3, 6) : rows.slice(0, 3);
    if (rest.length) body.appendChild(el('ol', { class:'lb-mini__list', start: rows.length >= 3 ? 4 : 1 }, rest.map(x =>
      el('li', { class:'lb-mini__row' }, [
        el('span', { class:'lb-mini__av', text: x.avatar || '👤' }),
        el('a', { class:'lb-mini__n lb-link' + (x.blocked ? ' blk' : ''), href: QBANK.peer.href(x.id), text: x.name }),
        x.online ? el('i', { class:'lb-online__dot', title:'متصل الآن', 'aria-label':'متصل الآن' }) : null,
        el('span', { class:'spacer' }),
        el('span', { class:'lb-mini__k', text: B.N(x.tries) + ' اختبارًا · ' + B.N(x.best) + '٪' })
      ]))));
    /* ترتيبي أنا — إن كنتُ مسجَّلًا وعلى اللوحة */
    if (d.me && d.me.rank)
      body.appendChild(el('p', { class:'lb-mini__me', text:
        'ترتيبك: ' + B.N(d.me.rank) + ' من ' + B.N(d.me.of) + ' — ' + B.N(d.me.tries) + ' اختبارًا' }));
  });
  return box;
}
QBANK.views.boardMini = boardMini;
