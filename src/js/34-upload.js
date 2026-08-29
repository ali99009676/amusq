/*
  معالج رفع الأسئلة — أربع خطوات ظاهرة للمشرف:
  ١ اقرأ الملف · ٢ افهمه بالذكاء · ٣ راجِع · ٤ انشر.
  المنطق في AMUSQ.admin (قابل للفحص)؛ هنا الواجهة فقط.
*/
let wizard = null;   // حالة المعالج تعيش بين إعادة الرسم داخل الجلسة

function stepsBar(current){
  const names = ['اقرأ الملف','افهمه بالذكاء','راجِع','انشر'];
  return el('ol', { class:'steps' }, names.map((n, i) =>
    el('li', { class:'steps__item' + (i + 1 === current ? ' is-on' : '') + (i + 1 < current ? ' is-done' : ''),
      'aria-current': i + 1 === current ? 'step' : null }, [
      el('span', { class:'steps__num num', text: String(i + 1) }),
      el('span', { text: n })
    ])));
}

/* الخطوة ١: سحب وإفلات أو اختيار ملف */
function stepRead(box, rerender){
  const drop = el('div', { class:'drop', tabindex:'0', role:'button', 'aria-label':'اختر ملف أسئلة' }, [
    el('span', { class:'empty__ico', 'aria-hidden':'true', text:'⇪' }),
    el('p', { class:'empty__title', text:'أسقط ملف الأسئلة هنا أو اضغط للاختيار' }),
    el('p', { class:'empty__text', text:'PDF أو DOCX أو TXT — حتى ١٥ ميغابايت. يفهم شكلين: خيارات A-D، وقوائم سؤال-ثم-إجابة.' })
  ]);
  const fileIn = el('input', { type:'file', accept:'.pdf,.docx,.txt', style:'display:none', 'aria-hidden':'true' });
  const msg = el('p', { class:'field__hint', role:'status' });

  async function handle(file){
    if (!file) return;
    msg.textContent = 'جارٍ قراءة «' + file.name + '»…';
    const b64 = await new Promise(resolve => {
      const rd = new FileReader();
      rd.onload = () => resolve(String(rd.result).split(',')[1] || '');
      rd.readAsDataURL(file);
    });
    wizard = await AMUSQ.admin.wizardIngest(wizard, file.name, b64);
    if (wizard.error) { msg.textContent = '⚠ ' + wizard.error; return; }
    rerender();
  }
  drop.addEventListener('click', () => fileIn.click());
  drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fileIn.click(); });
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('is-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('is-over'); handle(e.dataTransfer.files[0]); });
  fileIn.addEventListener('change', () => handle(fileIn.files[0]));

  box.appendChild(drop); box.appendChild(fileIn); box.appendChild(msg);
}

/* الخطوة ٢: التقدير ثم التشغيل بدفعات مع شريط «٨٠ من ٣٠٠» */
function stepEnrich(box, rerender){
  const est = AMUSQ.admin.estimate(wizard);
  const bar = el('div', { class:'meter', role:'progressbar', 'aria-valuemin':'0',
    'aria-valuemax': String(wizard.total), 'aria-valuenow': String(wizard.done) }, [
    el('div', { class:'meter__fill', style:'width:' + (wizard.total ? wizard.done / wizard.total * 100 : 0) + '%' })
  ]);
  const label = el('p', { class:'page__sub num', text: wizard.done + ' من ' + wizard.total });
  const msg = el('p', { class:'field__hint', role:'status' });
  const go = el('button', { class:'btn btn--block', type:'button',
    text: wizard.done ? 'أكمل من حيث توقفت (' + wizard.done + ')' : 'شغّل الذكاء الآن' });

  go.addEventListener('click', async () => {
    go.setAttribute('aria-disabled','true'); go.textContent = 'جارٍ المعالجة…';
    wizard = await AMUSQ.admin.wizardEnrich(wizard, (done, total) => {
      label.textContent = done + ' من ' + total;
      bar.setAttribute('aria-valuenow', String(done));
      bar.firstChild.style.width = (done / total * 100) + '%';
    });
    if (wizard.error) { msg.textContent = '⚠ ' + wizard.error + ' — المحفوظ لا يضيع، أعد المحاولة.'; go.removeAttribute('aria-disabled'); go.textContent = 'أعد المحاولة'; return; }
    rerender();
  });

  box.appendChild(el('div', { class:'card stack' }, [
    el('h2', { text:'قبل التشغيل — التقدير' }),
    el('div', { class:'row' }, [
      el('span', { class:'badge num', text: est.questions + ' سؤالًا' }),
      el('span', { class:'badge num', text: est.batches + ' دفعة ذكاء' }),
      el('span', { class:'badge', text:'المسوّدة تُحفظ بعد كل دفعة' })
    ]),
    bar, label, go, msg
  ]));
}

/* الخطوة ٣: المراجعة — بطاقة لكل سؤال، تغيير الإجابة بضغطة، وسوم حمراء للمستنتَج */
function stepReview(box, rerender){
  const dups = AMUSQ.admin.findDuplicates(wizard.enriched);
  const dupSet = new Set(dups.map(d => d.index));
  if (dups.length) box.appendChild(el('p', { class:'row' }, [
    el('span', { class:'badge badge--warn num', text: 'تنبيه: ' + dups.length + ' سؤالًا مكررًا — موسوم لا محذوف' })
  ]));

  wizard.enriched.forEach((q, qi) => {
    const opts = el('div', { class:'stack q__opts' }, q.options.map((opt, oi) => {
      const b = el('button', { class:'opt' + (q.answer === oi ? ' is-answer' : ''), type:'button' }, [
        el('span', { class:'opt__mark', 'aria-hidden':'true', text: q.answer === oi ? '✓' : '' }),
        el('span', { class:'ltr', text: opt })
      ]);
      // المشرف يغيّر الإجابة بضغطة على أي خيار — والتغيير يمسح وسم «مستنتجة»
      b.addEventListener('click', () => { q.answer = oi; q.derived = false; rerender(); });
      return b;
    }));
    const badges = el('div', { class:'row' }, [
      el('span', { class:'badge num', text:'س' + (qi + 1) }),
      q.derived ? el('span', { class:'badge badge--bad', text:'⚠ إجابة مستنتجة' }) : null,
      q.opts_built ? el('span', { class:'badge badge--bad', text:'⚠ خيارات مبنية' }) : null,
      dupSet.has(qi) ? el('span', { class:'badge badge--warn', text:'مكرر' }) : null,
      q.topic ? el('span', { class:'badge', text: q.topic }) : null
    ]);
    const impBtn = el('button', { class:'btn btn--sm ' + (q.important ? 'btn--soft' : 'btn--ghost'), type:'button',
      text: q.important ? '★ مهم' : 'وسمه مهمًا' });
    impBtn.addEventListener('click', () => { q.important = !q.important; rerender(); });
    box.appendChild(el('article', { class:'card stack q' }, [
      badges,
      el('p', { class:'ltr q__text', text: q.q }),
      opts,
      el('div', { class:'row' }, [ impBtn ])
    ]));
  });

  const next = el('button', { class:'btn btn--block', type:'button', text:'راجعتُ الكل — تابع للنشر' });
  next.addEventListener('click', async () => { wizard.step = 4; await AMUSQ.admin.saveDraft(wizard); rerender(); });
  box.appendChild(next);
}

/* الخطوة ٤: زران — اعتماد ذرّي أو حفظ مخفي */
function stepPublish(box){
  const derived = wizard.enriched.filter(q => q.derived).length;
  const pub = el('button', { class:'btn btn--block', type:'button', text:'اعتمد وانشر للطلاب' });
  const hide = el('button', { class:'btn btn--ghost btn--block', type:'button', text:'احفظ مخفية' });
  const msg = el('p', { class:'field__hint', role:'status' });
  async function fire(publish){
    const r = await AMUSQ.admin.approve(wizard, publish);
    if (r.ok) { AMUSQ.toast(publish ? 'نُشرت المادة للطلاب' : 'حُفظت مخفية'); wizard = null; AMUSQ.router.go('#/admin/content'); }
    else msg.textContent = '⚠ ' + ((r.data && r.data.message) || 'تعذّر الاعتماد — لم يتغير شيء في قاعدة البيانات.');
  }
  pub.addEventListener('click', () => fire(true));
  hide.addEventListener('click', () => fire(false));
  box.appendChild(el('div', { class:'card stack' }, [
    el('h2', { text:'الاعتماد' }),
    el('p', { class:'page__sub num', text: wizard.total + ' سؤالًا جاهزًا' +
      (derived ? ' — منها ' + derived + ' بإجابة مستنتجة راجعتَها' : '') }),
    el('p', { class:'field__hint', text:'الاعتماد عملية ذرّية: إما تُنشأ المادة وكل أسئلتها أو لا يتغير شيء.' }),
    pub, hide, msg
  ]));
}

const ViewUpload = {
  title:'رفع الأسئلة',
  view(route){
    if (!AMUSQ.api.user()) return AMUSQ.views.ViewAdminLogin.view();
    if (!wizard) wizard = AMUSQ.admin.newWizard();
    // استئناف مسوّدة من القائمة: نجلبها بحمولتها ونقفز للخطوة الصحيحة
    if (route.query.draft && wizard.draftId !== route.query.draft) {
      wizard = AMUSQ.admin.newWizard();
      wizard.draftId = route.query.draft;
      AMUSQ.api.rest('drafts?id=eq.' + route.query.draft + '&select=*').then(r => {
        if (r.ok && r.data && r.data[0]) {
          const d = r.data[0];
          wizard.filename = d.source_name; wizard.enriched = d.payload || [];
          wizard.total = d.total; wizard.done = d.done;
          wizard.step = d.done >= d.total ? 3 : 2;
          AMUSQ.router.render(location.hash);
        }
      });
    }
    const body = el('div', { class:'stack' });
    const rerender = () => AMUSQ.router.render(location.hash);
    [null, stepRead, stepEnrich, stepReview, stepPublish][wizard.step](body, rerender);
    return AMUSQ.views.page('رفع الأسئلة', 'من ملف الدكتور إلى مادة يذاكرها الطلاب — بأربع خطوات.', [
      stepsBar(wizard.step), body
    ]);
  },
  _reset(){ wizard = null; },       // للفحوص
  _get(){ return wizard; },
  _set(w){ wizard = w; }
};
AMUSQ.views.ViewUpload = ViewUpload;
