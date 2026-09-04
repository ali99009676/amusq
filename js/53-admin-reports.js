/*
  طابور البلاغات — الشاشة التي تُحوّل الشكوى إلى تصحيح.

  المبدأ الحاكم: البلاغ يصل ومعه نص السؤال وخياراته وإجابته المعلَّمة.
  بلا ذلك يضطر المشرف إلى فتح المادة والبحث عن السؤال مع كل بلاغ، فيتراكم
  الطابور ولا يُقرأ — وطابورٌ لا يُقرأ كأنه غير موجود، والبلاغ الذي لا
  يُقرأ أسوأ من غيابه: يمنح الطالب ثقة كاذبة بأن أحدًا يتابع.
*/
function reportCard(r, onDone){
  const card = el('article', { class:'rep', 'data-id': r.id });

  card.appendChild(el('div', { class:'rep__head' }, [
    el('span', { class:'badge badge--warn', text: QBANK.trust.reasonName(r.reason) }),
    el('a', { class:'rep__subj', href:'#/admin/subject/' + r.subject_id, text: r.subject }),
    el('span', { class:'rep__when num', text: new Date(r.created_at).toLocaleDateString('ar') })
  ]));

  // نصّ السؤال كما هو — هو موضوع البلاغ، ولا قرار بلا رؤيته
  if (r.q){
    const opts = Array.isArray(r.options) ? r.options : [];
    card.appendChild(el('div', { class:'rep__q' }, [
      el('p', { class:'rep__qt ltr', text: r.q }),
      opts.length ? el('ol', { class:'rep__opts' }, opts.map((o, i) =>
        el('li', { class: i === r.answer ? 'is-answer' : null }, [
          el('span', { class:'opt__l', 'aria-hidden':'true', text: QBANK.views.optLetter(i) }),
          el('span', { class:'ltr', text: String(o) }),
          i === r.answer ? el('span', { class:'badge badge--ok', text:'المعلَّمة' }) : null
        ]))) : null
    ]));
  } else {
    card.appendChild(el('p', { class:'field__hint', style:'margin:0',
      text:'بلاغ على المادة كلها لا على سؤال بعينه.' }));
  }

  if (r.note) card.appendChild(el('p', { class:'rep__note', text: '«' + r.note + '»' }));

  const adminNote = el('input', { class:'input', placeholder:'ملاحظتك (اختياري)' });
  const msg = el('span', { class:'field__hint', role:'status' });

  const act = (status, label, cls) => {
    const b = el('button', { class:'btn btn--sm ' + cls, type:'button', text: label });
    b.addEventListener('click', () => {
      b.disabled = true; msg.textContent = 'جارٍ الحفظ…';
      QBANK.trust.resolve(r.id, status, adminNote.value).then(res => {
        if (!res.ok || !res.data || res.data.ok === false){
          b.disabled = false; msg.textContent = 'تعذّر — تأكد من صلاحيتك.'; return;
        }
        card.classList.add('is-done');
        card.innerHTML = '';
        card.appendChild(el('p', { class:'field__hint is-ok', style:'margin:0',
          text: (status === 'resolved' ? '✓ عولج: ' : '✕ رُفض: ') + r.subject }));
        if (typeof onDone === 'function') onDone();
      });
    });
    return b;
  };

  if (r.status === 'open')
    card.appendChild(el('div', { class:'rep__act' }, [
      adminNote,
      el('div', { class:'row', style:'gap:8px' }, [
        act('resolved', '✓ عولج', 'btn--soft'),
        act('rejected', '✕ لا مشكلة', 'btn--ghost'),
        msg
      ])
    ]));

  return card;
}

function reportsBody(){
  const wrap = el('div', { class:'stack' });
  const tabs = el('div', { class:'ex-chips', role:'group', 'aria-label':'تصفية البلاغات بالحالة' });
  const list = el('div', { class:'stack' });
  let status = 'open';

  const load = () => {
    list.innerHTML = '';
    list.appendChild(el('p', { class:'page__sub', text:'جارٍ التحميل…' }));
    QBANK.trust.queue(status).then(r => {
      if (!list.isConnected) return;
      list.innerHTML = '';
      const rows = (r.ok && Array.isArray(r.data)) ? r.data : [];
      if (!rows.length){
        list.appendChild(QBANK.views.empty('✓', status === 'open' ? 'لا بلاغات مفتوحة' : 'لا شيء هنا',
          status === 'open'
            ? 'الطابور فارغ — وهذا خبر جيد.'
            : 'لم يُبتّ في بلاغات بهذه الحالة بعد.'));
        return;
      }
      rows.forEach(x => list.appendChild(reportCard(x, load)));
    });
  };

  /*
    ★ شرائح لا تبويبات.
    كانت هنا tabs__btn داخل شريط تبويبات اللوحة — تبويبات داخل تبويبات:
    يرى المشرف صفَّين متطابقين فلا يعرف أيّهما يحدّد أين هو. والشريحة تقول
    «تصفية» بينما التبويب يقول «مكان آخر»، وهذا الفرق هو الصواب هنا.
  */
  [['open','المفتوحة'],['resolved','المعالَجة'],['rejected','المرفوضة']].forEach(t => {
    const b = el('button', { class:'chip' + (t[0] === status ? ' is-on' : ''), type:'button',
      'data-status': t[0], 'aria-pressed': t[0] === status ? 'true' : 'false', text: t[1] });
    b.addEventListener('click', () => {
      status = t[0];
      tabs.querySelectorAll('.chip').forEach(x => {
        const on = x.getAttribute('data-status') === status;
        x.classList.toggle('is-on', on);
        x.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      load();
    });
    tabs.appendChild(b);
  });

  wrap.appendChild(tabs);
  wrap.appendChild(list);
  load();
  return wrap;
}

/*
  لا شاشة مستقلة للبلاغات ولا مسار خاص بها.
  ★ سجّلنا مسار #/admin/reports مستقلًا في البداية، فابتلع التبويبَ ذا
  الاسم نفسه: يضغط المشرف «البلاغات» فيخرج من اللوحة ويفقد شريطها ولا
  يعرف أين هو. الطابور تبويب داخل اللوحة — والموجّه يمرّره إليها.
*/
QBANK.views.reportsBody = reportsBody;
QBANK.views.reportCard = reportCard;

/*
  إدراج «البلاغات» تبويبًا في لوحة المشرف.

  ★ شاشة بلا مدخل غير موجودة عمليًا. بنينا الطابور ثم كاد يبقى بلا رابط
  يقود إليه — وطابور بلاغات لا يفتحه أحد أسوأ من غيابه: يمنح الطالب
  ثقة كاذبة بأن أحدًا يتابع بلاغه.

  ويُدرج قبل «الإعدادات» لا بعدها: الإعدادات آخر ما يُفتح، والبلاغات
  أول ما ينبغي أن يُرى.
*/
if (QBANK.views.ADMIN_TABS && !QBANK.views.ADMIN_TABS.some(t => t.id === 'reports')){
  const tabs = QBANK.views.ADMIN_TABS;
  const at = tabs.findIndex(t => t.id === 'settings');
  const tab = { id:'reports', label:'البلاغات', fill(box){ box.appendChild(reportsBody()); } };
  if (at === -1) tabs.push(tab); else tabs.splice(at, 0, tab);
}
