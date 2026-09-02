/*
  الجودة والثقة — الطبقة التي تجعل الرفع المفتوح آمنًا.

  حين يفتح الرفع لكل طالب يدخل الرديء مع الجيد. وبنك فيه إجابة خاطئة أسوأ
  من لا بنك: الطالب يحفظ الخطأ ويدخل به الامتحان واثقًا. فثلاث طبقات:
  تقييم يرفع الجيد، وبلاغ يُسقط الخاطئ، ووسم «موثّق» لما راجعه إنسان.
*/
const REASONS = [
  ['wrong_answer', 'الإجابة المعلَّمة خاطئة'],
  ['typo',         'خطأ في نص السؤال أو الخيارات'],
  ['duplicate',    'سؤال مكرَّر'],
  ['offensive',    'محتوى مخالف'],
  ['other',        'شيء آخر']
];
const REASON_AR = {};
REASONS.forEach(r => { REASON_AR[r[0]] = r[1]; });

const Trust = {
  reasons: REASONS,
  reasonName(k){ return REASON_AR[k] || k; },

  rate(subjectId, stars, note){
    return QBANK.api.rpc('rate_subject', { p_subject: subjectId, p_stars: stars, p_note: note || '' });
  },
  mine(subjectId){ return QBANK.api.rpc('my_rating', { p_subject: subjectId }); },
  report(subjectId, questionId, reason, note){
    return QBANK.api.rpc('report_issue', {
      p_subject: subjectId, p_question: questionId || null,
      p_reason: reason || 'other', p_note: note || '' });
  },
  queue(status){ return QBANK.api.rpc('admin_reports', { p_status: status || 'open', p_limit: 100 }); },
  resolve(id, status, note){
    return QBANK.api.rpc('resolve_report', { p_report: id, p_status: status, p_note: note || '' });
  },
  similar(name, universityId){
    return QBANK.api.rpc('find_similar', { p_name: name || '', p_university: universityId || null });
  },

  /* عرض التقييم: النجوم مع العدد. بلا العدد يبدو ٥٫٠ من تقييم واحد
     كأنه إجماع — وهو رأي شخص واحد. */
  starsText(avg, n){
    if (!n) return 'لم يُقيَّم بعد';
    /*
      الرقم بأرقام عربية وفاصلة عربية (٫) كبقية المنصة.
      كان يخرج «4.5» وسط نصّ عربي — والخلط يكسر الاتجاه بصريًا ويجعل
      السطر يقفز في المتصفحات ثنائية الاتجاه.
    */
    const ar = QBANK.views.arNum(Number(avg).toFixed(1)).replace('.', '٫');
    return '★ ' + ar + ' · ' + QBANK.views.arNum(n) + (n === 1 ? ' تقييم' : ' تقييمات');
  }
};

/* شارة الجودة على بطاقة/ترويسة المادة */
function trustBadges(sub){
  const out = [];
  if (sub.verified)
    out.push(el('span', { class:'badge badge--ok', title:'راجعها مشرف المنصة', text:'✓ موثّقة' }));
  if (sub.rating_n)
    out.push(el('span', { class:'badge badge--star num', text: Trust.starsText(sub.rating_avg, sub.rating_n) }));
  return out;
}

/* ═══ ودجة التقييم ═══
   خمس نجوم قابلة للّمس مع تعليق اختياري. التعليق اختياري عمدًا:
   إلزامه يُسقط تسعة من كل عشرة تقييمات، والنجمة وحدها تكفي للترتيب. */
function ratingWidget(sub, onDone){
  const box = el('div', { class:'rate' });
  const msg = el('p', { class:'field__hint', role:'status', style:'margin:8px 0 0' });
  let picked = 0;

  const row = el('div', { class:'rate__stars', role:'radiogroup', 'aria-label':'قيّم هذه المادة' });
  const btns = [];
  for (let i = 1; i <= 5; i++){
    const b = el('button', { class:'rate__star', type:'button', role:'radio',
      'aria-checked':'false', 'aria-label': i + ' من ٥', 'data-star': String(i), text:'☆' });
    b.addEventListener('click', () => setStars(i));
    btns.push(b); row.appendChild(b);
  }
  function setStars(n){
    picked = n;
    btns.forEach((b, i) => {
      const on = i < n;
      b.textContent = on ? '★' : '☆';
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', i === n - 1 ? 'true' : 'false');
    });
  }

  const note = el('textarea', { class:'input', rows:'2',
    placeholder:'ما الذي أفادك أو نقصك فيها؟ (اختياري)', 'aria-label':'تعليق' });

  const send = el('button', { class:'btn btn--sm', type:'button', text:'أرسل تقييمي' });
  send.addEventListener('click', () => {
    if (!picked){ msg.className = 'field__hint is-bad'; msg.textContent = 'اختر عدد النجوم أولًا.'; return; }
    send.disabled = true; msg.className = 'field__hint'; msg.textContent = 'جارٍ الإرسال…';
    Trust.rate(sub.id, picked, note.value).then(r => {
      send.disabled = false;
      if (!r.ok || !r.data || r.data.ok === false){
        // ★ سبب الرفض يُقال بالاسم: «تعذّر» وحدها تجعل الطالب يعيد المحاولة بلا فائدة
        const why = r.data && r.data.reason === 'not_enrolled'
          ? 'افتح المادة وراجع منها أولًا — التقييم لمن جرّبها.'
          : 'تعذّر الإرسال. تأكد من الاتصال.';
        msg.className = 'field__hint is-bad'; msg.textContent = why; return;
      }
      msg.className = 'field__hint is-ok';
      msg.textContent = 'شكرًا — صار متوسطها ' + Number(r.data.avg).toFixed(1);
      if (typeof onDone === 'function') onDone(r.data);
    });
  });

  box.appendChild(row);
  box.appendChild(note);
  box.appendChild(el('div', { class:'row', style:'margin-top:8px' }, [send]));
  box.appendChild(msg);

  // تقييمه السابق يظهر محدَّدًا: يعدّله لا يبدأ من الصفر
  Trust.mine(sub.id).then(r => {
    if (!box.isConnected || !r.ok || !r.data || !r.data.stars) return;
    setStars(r.data.stars);
    note.value = r.data.note || '';
    msg.textContent = 'تقييمك السابق — عدّله متى شئت.';
  });

  return box;
}

/* ═══ زرّ الإبلاغ ═══
   يُلحق بكل سؤال. البلاغ على سؤال بعينه لا على المادة: «فيها خطأ» بلا
   تحديد بلاغٌ لا يستطيع المشرف التصرف فيه. */
function reportButton(subjectId, questionId){
  const b = el('button', { class:'qitem__flag', type:'button',
    title:'أبلغ عن مشكلة في هذا السؤال', 'aria-label':'أبلغ عن مشكلة', text:'⚑' });
  b.addEventListener('click', e => {
    e.stopPropagation(); e.preventDefault();
    openReport(subjectId, questionId, b);
  });
  return b;
}

function openReport(subjectId, questionId, anchor){
  const sel = el('select', { class:'input', 'aria-label':'سبب البلاغ' });
  REASONS.forEach(r => sel.appendChild(el('option', { value:r[0], text:r[1] })));
  const note = el('textarea', { class:'input', rows:'2',
    placeholder:'وضّح المشكلة — ما الإجابة الصحيحة في رأيك؟ (اختياري)' });
  const msg = el('p', { class:'field__hint', role:'status', style:'margin:0' });

  const send = el('button', { class:'btn btn--sm', type:'button', text:'أرسل البلاغ' });
  const box = el('div', { class:'report card stack' }, [
    el('h3', { style:'margin:0', text:'أبلغ عن مشكلة' }),
    sel, note,
    el('div', { class:'row', style:'gap:8px' }, [send,
      (function(){
        const c = el('button', { class:'btn btn--ghost btn--sm', type:'button', text:'إلغاء' });
        c.addEventListener('click', () => box.remove());
        return c;
      })()
    ]),
    msg
  ]);

  send.addEventListener('click', () => {
    send.disabled = true; msg.className = 'field__hint'; msg.textContent = 'جارٍ الإرسال…';
    Trust.report(subjectId, questionId, sel.value, note.value).then(r => {
      if (!r.ok || !r.data || r.data.ok === false){
        send.disabled = false;
        msg.className = 'field__hint is-bad'; msg.textContent = 'تعذّر الإرسال — تأكد من الاتصال.';
        return;
      }
      box.innerHTML = '';
      box.appendChild(el('p', { class:'field__hint is-ok', style:'margin:0',
        text:'وصل بلاغك. يراجعه المشرف، ويبقى السؤال ظاهرًا حتى يُبتّ فيه.' }));
      setTimeout(() => box.remove(), 3200);
    });
  });

  if (anchor && anchor.parentNode) anchor.parentNode.appendChild(box);
  return box;
}

QBANK.trust = Trust;
QBANK.trust.badges = trustBadges;
QBANK.trust.ratingWidget = ratingWidget;
QBANK.trust.reportButton = reportButton;
QBANK.trust.openReport = openReport;
