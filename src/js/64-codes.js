/*
  ═══════════════════════════════════════════════════════════════════
  أكواد التفعيل — الطريق الثاني إلى المادة المدفوعة
  ═══════════════════════════════════════════════════════════════════
  كان زرّ «اشترِ المادة» ينتهي إلى /api/pay، و/api/pay يشترط بوابة Tap
  لم تُفعَّل بعد. فالضغطة الوحيدة التي تفصل الطالب عن الدفع كانت تنتهي
  برسالة «الدفع غير مفعَّل بعد على هذا الخادم» — وهي رسالةُ عطلٍ في وجه
  من قرّر أن يشتري.

  الآن للطالب طريقان دائمًا: رمزٌ يُدخله فتُفتح المادة في ثانية، وطريقُ
  طلبٍ واضح إن لم يكن عنده رمز. والبوابة حين تجهز تُضاف فوقهما ولا تُلغيهما.
*/

const Codes = {
  /* ما يصل من الطالب: لصقٌ فيه مسافات، أو شرطات، أو حروف صغيرة. كلّها
     الرمز نفسه — والتطبيع هنا وفي القاعدة معًا، لأن أحدهما قد يُتجاوَز. */
  norm(s){ return String(s || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase(); },

  /* عرضٌ بأربعات: العين تقرأ AB12-CD34-EF ولا تقرأ AB12CD34EF */
  pretty(s){
    const n = Codes.norm(s);
    return n ? (n.match(/.{1,4}/g) || [n]).join('-') : '';
  },

  MIN: 6,
  looksLike(s){ return Codes.norm(s).length >= Codes.MIN; },

  redeem(code){ return QBANK.api.rpc('redeem_code', { p_code: Codes.norm(code) }); },

  /*
    ★ لكل رفضٍ نصُّه.
    «رمز غير صحيح» جوابٌ واحد لسبع حالات، ويجعل الطالب يعيد المحاولة على
    رمزٍ استُهلك، أو يشكو من رمزٍ سبق أن استعمله هو. والنص الذي يقول
    «ماذا حدث وماذا تفعل الآن» يوفّر رسالةً إلى المشرف.
  */
  WHY: {
    auth:                'سجّل دخولك أولًا ثم فعّل الرمز.',
    not_found:           'لا يوجد رمز بهذا الشكل — تأكّد من الحروف والأرقام.',
    disabled:            'أُوقف هذا الرمز. تواصل مع من أعطاك إياه.',
    expired:             'انتهت صلاحية هذا الرمز.',
    used_up:             'استُهلك هذا الرمز بالكامل.',
    already_used_by_you: 'فعّلتَ هذا الرمز من قبل — المادة عندك بالفعل.',
    already_owned:       'هذه المادة مفتوحة لك أصلًا، فلا تُنفق الرمز عليها.',
    already_free:        'صارت هذه المادة مجانية للجميع — لا تحتاج رمزًا.',
    subject_gone:        'المادة المرتبطة بهذا الرمز لم تعد موجودة.'
  },
  why(reason){ return Codes.WHY[reason] || 'تعذّر تفعيل الرمز. حاول مرة أخرى.'; },

  /*
    ★ «تعذّر التوليد» ليست رسالة، بل صمتٌ بصيغة جملة.
    كتبتُها أول مرة فسقطت الدالة في القاعدة لسببٍ محدّد — امتدادٌ خارج
    مسار البحث — ولم يصل من ذلك السبب حرفٌ واحد إلى الشاشة. فأمضى المشرف
    وقته يعيد تنفيذ ملف SQL نجح تنفيذه أصلًا. وحين يكون العطل في القاعدة
    فالقاعدة قالت سببه بنصّه، وإخفاؤه اختيارُنا نحن لا نقصُ معلومة.

    فنُفرّق: سببٌ نعرفه له نصٌّ عربي، ونداءٌ سقط يُظهر ما قالته القاعدة،
    ودالةٌ مفقودة تُقال باسمها لأن علاجها معروف: نفّذ ملف CODES.sql.
  */
  ADMIN_WHY: {
    forbidden:  'هذه اللوحة للمشرف وحده — تأكّد أن حسابك مشرف.',
    no_subject: 'اختر المادة أولًا.',
    not_found:  'المادة المختارة لم تعد موجودة — حدّث الصفحة.'
  },
  failText(r){
    const d = r && r.data;
    if (d && d.reason && Codes.ADMIN_WHY[d.reason]) return Codes.ADMIN_WHY[d.reason];
    if (r && r.offline) return 'لا اتصال بالخادم.';
    const m = String((d && (d.message || d.hint)) || '');
    /* PGRST202 = الدالة غير موجودة في ذاكرة المخطط */
    if ((d && d.code === 'PGRST202') || /does not exist|Could not find the function/i.test(m))
      return 'دالة الأكواد غير موجودة في القاعدة — نفّذ ملف db/CODES.sql في محرّر Supabase.';
    if (m) return 'القاعدة ردّت: ' + m;
    return 'تعذّر التوليد' + (r && r.status ? ' (' + r.status + ')' : '') + '.';
  },

  /* رقم التواصل وسطر طريقة الدفع — يكتبهما المشرف في الإعدادات */
  support(){
    const s = (QBANK.data.pack().settings) || {};
    return { wa: String(s.whatsapp || '').replace(/[^0-9]/g, ''),
             note: String(s.pay_note || '') };
  },

  /* السعر كما يُقرأ: «٢٩ ريال» لا «29» */
  priceText(sub){
    const p = Number(sub && sub.price) || 0;
    if (p <= 0) return '';
    return QBANK.pay ? QBANK.pay.money(p * 100, 'SAR')
                     : QBANK.views.arNum(p) + ' ريال';
  },

  /*
    ★ نصٌّ واحد في الإعدادات، وأسعارٌ مختلفة لكل مادة.
    لو كتب المشرف «حوّل ٢٩ ريالًا» لقرأها طالبُ مادةٍ ثمنها خمسون، فحوّل
    تسعةً وعشرين وانتظر رمزًا لن يأتي — ثم اتّهم المنصة لا النص. فالنائبات
    تجعل النصّ الواحد يصحّ في كل مادة: {السعر} و{المادة} تُبدَّلان لحظة العرض.
  */
  note(sub){
    const raw = Codes.support().note;
    if (!raw) return '';
    return raw
      .replace(/\{\s*السعر\s*\}/g, Codes.priceText(sub) || 'المبلغ المطلوب')
      .replace(/\{\s*المادة\s*\}/g, (sub && sub.name) || 'المادة')
      .replace(/\{\s*price\s*\}/gi, Codes.priceText(sub) || 'المبلغ المطلوب')
      .replace(/\{\s*subject\s*\}/gi, (sub && sub.name) || 'المادة');
  },

  /*
    ★ داخل التطبيق لا رابط خارجي إطلاقًا.
    قاعدة متجر آبل تمنع إحالة المستخدم إلى قناة دفع خارجية، ومخالفتها
    تُرفض بها النسخة كلها. فالزرّ يختفي في التطبيق ويبقى في المتصفح.
  */
  isApp(){ return !!(typeof window !== 'undefined' && window.QBANK_NATIVE_APP); },

  /*
    ★ رقمٌ مرجعي قصير من معرّف الحساب.
    المشرف يستقبل الرسالة على واتساب، ثم عليه أن يجد صاحبها في لوحته.
    والبريد يكفي غالبًا، لكن الطالب قد يكتبه بحرفٍ ناقص، وقد يراسله من
    رقمٍ لا يعرفه. وستّة محارف من معرّفه لا تُخطئ ولا تكشف شيئًا.
  */
  ref6(){
    const u = QBANK.api.user();
    return u && u.id ? String(u.id).replace(/-/g, '').slice(0, 6).toUpperCase() : '';
  },

  /* اسم الطالب من ملفه المخزّن — والبريد حين لا اسم له */
  who(){
    const u = QBANK.api.user() || {};
    const p = QBANK.store.get('profile', null) || {};
    const name = String(p.name || '').trim();
    const lines = [];
    if (name) lines.push('الاسم: ' + name);
    if (u.email) lines.push('الحساب: ' + u.email);
    const r = Codes.ref6();
    if (r) lines.push('الرقم المرجعي: ' + r);
    return lines.join('\n');
  },

  /*
    رسالتان لا واحدة، لأن الحالتين مختلفتان:

    السؤال قبل الدفع: «كيف أدفع؟» — يريد الأرقام.
    والإبلاغ بعده: «حوّلتُ، هذا إيصالي» — يريد أن يُفتح له.

    ودمجُهما في زرٍّ واحد يجعل المشرف يقرأ رسالةً لا يعرف من أي الحالتين
    هي، فيسأل «هل حوّلتَ؟» — وهو سؤالٌ كان يجب ألّا يُسأل.
  */
  askText(sub){
    const price = Codes.priceText(sub);
    return 'السلام عليكم، أريد تفعيل مادة «' + ((sub && sub.name) || '') + '»' +
           (price ? ' (' + price + ')' : '') + '.\n' + Codes.who();
  },

  /*
    ★ الرسالة تحمل المبلغ والمادة والحساب — الثلاثة التي بلا واحدةٍ منها
    لا يستطيع المشرف أن يُصدر رمزًا.

    وتقول «سأرفق الإيصال» لا «أرفقتُه»: واتساب لا يقبل صورةً مع نصٍّ
    مُهيّأ من رابط، فالإرفاق فعلُ الطالب بعد أن تُفتح المحادثة. ووعدٌ في
    الرسالة بشيءٍ لم يحدث يجعل المشرف ينتظر صورةً لن تصل.
  */
  paidText(sub){
    const price = Codes.priceText(sub);
    return 'السلام عليكم، حوّلتُ ' + (price || 'المبلغ') +
           ' لفتح مادة «' + ((sub && sub.name) || '') + '».\n' +
           Codes.who() + '\nوسأرفق صورة الإيصال هنا.';
  },

  waUrl(text){
    const wa = Codes.support().wa;
    if (!wa) return '';
    return 'https://wa.me/' + wa + '?text=' + encodeURIComponent(text);
  },
  askUrl(sub){ return Codes.waUrl(Codes.askText(sub)); },
  paidUrl(sub){ return Codes.waUrl(Codes.paidText(sub)); }
};
QBANK.codes = Codes;

/* ═══════════════ صندوق التفعيل للطالب ═══════════════ */
/* لا يأخذ مادة: الرمز يقول بنفسه ماذا يفتح، والصندوق واحد في صفحة المادة
   وفي المحفظة — وصندوقان بسلوكين هما موضعان للعطل لا موضع واحد. */
function redeemBox(onDone){
  const box = el('div', { class:'stack', style:'margin-top:12px' });
  const msg = el('p', { class:'field__hint', role:'status', style:'margin:0' });

  const inp = el('input', { class:'input num', type:'text', autocomplete:'off',
    spellcheck:'false', maxlength:'24', placeholder:'ABCD-EFGH-JK',
    'aria-label':'رمز التفعيل' });

  /* التجميل أثناء الكتابة، مع إبقاء المؤشر في آخر النص — إعادةُ المؤشر
     إلى الأول عند كل حرف تجعل الحقل غير قابل للكتابة عمليًا */
  inp.addEventListener('input', () => {
    const atEnd = inp.selectionStart === inp.value.length;
    inp.value = Codes.pretty(inp.value).slice(0, 24);
    if (atEnd) { try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch(e){} }
    go.setAttribute('aria-disabled', Codes.looksLike(inp.value) ? 'false' : 'true');
  });

  const go = el('button', { class:'btn btn--soft', type:'button', text:'فعّل' });
  go.setAttribute('aria-disabled', 'true');

  const run = () => {
    if (!Codes.looksLike(inp.value)) return;
    go.disabled = true; msg.className = 'field__hint'; msg.textContent = 'جارٍ التحقق…';
    Codes.redeem(inp.value).then(r => {
      go.disabled = false;
      const d = (r.ok && r.data) ? r.data : null;
      if (d && d.ok){
        msg.className = 'field__hint is-ok';
        msg.textContent = d.kind === 'semester'
          ? 'فُتحت مواد الفصل كلها.' : 'فُتحت «' + (d.subject || 'المادة') + '».';
        inp.value = '';
        /* الاستحقاق الجديد لا يظهر حتى تُحدَّث نسخة الجهاز — وبلا ذلك
           يبقى القفل على الشاشة بعد تفعيلٍ نجح، فيظنّه الطالب فشلًا. */
        QBANK.gate.refresh().then(() => { if (onDone) onDone(d); });
        return;
      }
      /* رفضٌ مفهوم من القاعدة له نصّه، وسقوطُ النداء نفسِه شيء آخر —
         والخلط بينهما يجعل الطالب يعيد رمزًا سليمًا على خادمٍ صامت. */
      msg.className = 'field__hint is-bad';
      msg.textContent = (d && d.reason) ? Codes.why(d.reason) : Codes.failText(r);
    });
  };
  go.addEventListener('click', run);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); run(); } });

  box.appendChild(el('span', { class:'field__label', text:'عندك رمز تفعيل؟' }));
  box.appendChild(el('div', { class:'redeem' }, [inp, go]));
  box.appendChild(msg);
  return box;
}
QBANK.views.redeemBox = redeemBox;

/* ═══════════════ لوحة المشرف: توليد الأكواد ═══════════════ */
function adminCodesCard(){
  const box = el('div', { class:'card stack' });
  box.appendChild(el('h2', { style:'margin:0', text:'أكواد التفعيل' }));
  box.appendChild(el('p', { class:'field__hint', style:'margin:0', text:
    'رمزٌ يفتح مادة أو مواد الفصل كلها. تبيعه بالطريقة التي تقبضها فعلًا، ' +
    'ويُدخله الطالب في صفحة المادة فتُفتح فورًا — بلا بوابة دفع.' }));

  const kindSel = el('select', { class:'input', 'aria-label':'نوع الرمز' }, [
    el('option', { value:'subject',  text:'مادة واحدة' }),
    el('option', { value:'semester', text:'مواد الفصل كلها' })
  ]);
  const subSel = el('select', { class:'input', 'aria-label':'المادة' });
  const countIn = el('input', { class:'input num', type:'number', min:'1', max:'200',
    value:'10', inputmode:'numeric', 'aria-label':'عدد الأكواد' });
  const daysIn = el('input', { class:'input num', type:'number', min:'1', max:'3650',
    value:'180', inputmode:'numeric', 'aria-label':'مدة الفتح بالأيام' });
  const usesIn = el('input', { class:'input num', type:'number', min:'1', max:'5000',
    value:'1', inputmode:'numeric', 'aria-label':'كم طالبًا يستعمل الرمز الواحد' });
  const noteIn = el('input', { class:'input', type:'text', maxlength:'120',
    placeholder:'مثال: دفعة ٢٠٤٦ — تحويل بنكي', 'aria-label':'ملاحظة الدفعة' });

  const subs = (QBANK.data.pack().subjects || []).filter(s => !s.free);
  if (!subs.length) subSel.appendChild(el('option', { value:'', text:'لا مواد مدفوعة' }));
  subs.forEach(s => subSel.appendChild(el('option', { value:s.id, text:s.name })));

  const subWrap = el('label', { class:'field' }, [
    el('span', { class:'field__label', text:'المادة' }), subSel ]);
  const paintKind = () => { subWrap.hidden = kindSel.value === 'semester'; };
  kindSel.addEventListener('change', paintKind); paintKind();

  const out = el('div', { class:'stack' });
  const msg = el('p', { class:'field__hint', role:'status', style:'margin:0' });

  const make = el('button', { class:'btn btn--block', type:'button', text:'ولّد الأكواد' });
  make.addEventListener('click', async () => {
    const kind = kindSel.value;
    if (kind === 'subject' && !subSel.value){
      msg.className = 'field__hint is-bad';
      msg.textContent = 'لا توجد مادة مدفوعة — ضع سعرًا لمادة أولًا.';
      return;
    }
    make.disabled = true; msg.className = 'field__hint'; msg.textContent = 'جارٍ التوليد…';
    const r = await QBANK.api.rpc('admin_make_codes', {
      p_kind: kind,
      p_subject: kind === 'subject' ? subSel.value : null,
      p_count: Math.max(1, Math.min(200, parseInt(countIn.value || '1', 10) || 1)),
      p_days: Math.max(1, Math.min(3650, parseInt(daysIn.value || '180', 10) || 180)),
      p_max_uses: Math.max(1, Math.min(5000, parseInt(usesIn.value || '1', 10) || 1)),
      p_note: noteIn.value || '',
      p_valid_days: 0
    });
    make.disabled = false;
    const d = (r.ok && r.data) ? r.data : null;
    if (!d || !d.ok){
      msg.className = 'field__hint is-bad';
      msg.textContent = Codes.failText(r);
      return;
    }
    msg.className = 'field__hint is-ok';
    msg.textContent = 'وُلّدت ' + QBANK.views.arNum((d.codes || []).length) + ' رمزًا · دفعة ' + d.batch;
    paintCodes(d.codes || []);
    /* القائمة والموجز يتبعان التوليد فورًا — لا يُطلب من المشرف تحديث الصفحة
       ليرى ما ولّده قبل ثانية */
    paintSummary(); draw();
  });

  /*
    ★ الأكواد تُعرض للنسخ دفعةً واحدة.
    نسخُ عشرين رمزًا واحدًا واحدًا من جدولٍ عملٌ يُخطئ فيه الإنسان، والخطأ
    هنا يعني رمزًا أُرسل لطالبٍ ولا يعمل. فسطرٌ لكل رمز في مربّع واحد،
    وزرٌّ ينسخها كلها.
  */
  function paintCodes(list){
    out.innerHTML = '';
    if (!list.length) return;
    const text = list.map(Codes.pretty).join('\n');
    const ta = el('textarea', { class:'input num', rows: String(Math.min(12, list.length)),
      readonly:'readonly', 'aria-label':'الأكواد المولّدة' });
    ta.value = text;
    const copy = el('button', { class:'btn btn--soft btn--sm', type:'button', text:'انسخ الكل' });
    copy.addEventListener('click', () => {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText)
          navigator.clipboard.writeText(text).then(() => QBANK.toast('نُسخت'));
        else { ta.select(); document.execCommand('copy'); QBANK.toast('نُسخت'); }
      } catch(e){ QBANK.toast('انسخها يدويًا'); }
    });
    out.appendChild(ta);
    out.appendChild(copy);
  }

  const grid = el('div', { class:'ad-grid2' }, [
    el('label', { class:'field' }, [ el('span', { class:'field__label', text:'النوع' }), kindSel ]),
    subWrap,
    el('label', { class:'field' }, [ el('span', { class:'field__label', text:'كم رمزًا' }), countIn ]),
    el('label', { class:'field' }, [ el('span', { class:'field__label', text:'مدة الفتح (يوم)' }), daysIn ]),
    el('label', { class:'field' }, [ el('span', { class:'field__label', text:'استخدامات الرمز الواحد' }), usesIn ]),
    el('label', { class:'field' }, [ el('span', { class:'field__label', text:'ملاحظة' }), noteIn ])
  ]);

  box.appendChild(grid);
  box.appendChild(make);
  box.appendChild(msg);
  box.appendChild(out);

  /* ═══ الأكواد القائمة ═══ */
  /*
    ★ ثلاثة أسئلة يسألها المشرف، لا سؤال واحد:
    «كم رمزًا بقي عندي أبيعه؟» و«هذا الرمز — هل فُعِّل؟» و«من فعّله؟».
    قائمةٌ واحدة بلا مرشّح تُجيب عن الثالث بعد بحثٍ بالعين في ستين صفًّا،
    ولا تُجيب عن الأول أبدًا. فصار لها موجزٌ فوقها، ومرشّحاتٌ تفصل غير
    المستعمل عن المُفعَّل، وكلُّ رمزٍ مُفعَّل يحمل تحته حسابَ من فعّله.
  */
  box.appendChild(el('h3', { style:'margin:8px 0 0', text:'الأكواد' }));

  const sum = el('p', { class:'field__hint', style:'margin:0', role:'status' });
  const listBox = el('div', { class:'stack' });
  let state = '';

  const chips = el('div', { class:'ex-chips', role:'group', 'aria-label':'تصفية الأكواد' });
  [['','الكل'],['unused','لم يُستعمل'],['used','مُفعَّل'],['off','موقوف']].forEach(t => {
    const b = el('button', { class:'chip' + (t[0] === state ? ' is-on' : ''), type:'button',
      'data-s': t[0], text: t[1] });
    b.addEventListener('click', () => {
      state = t[0];
      chips.querySelectorAll('.chip').forEach(x =>
        x.classList.toggle('is-on', x.getAttribute('data-s') === state));
      draw();
    });
    chips.appendChild(b);
  });

  box.appendChild(sum);
  box.appendChild(chips);
  box.appendChild(listBox);

  /*
    الموجز مرة واحدة عند الفتح، ويُعاد بعد كل توليد — لا مع كل مرشّح.

    ★ ولا حارس isConnected هنا ولا في القائمة.
    البطاقة تُبنى ثم تُدرَج في تبويبها، فقد تكون منفصلةً عن المستند لحظةَ
    النداء وتُدرَج بعده بأجزاء من الثانية. وحارسٌ يمنع الكتابة على عقدةٍ
    منفصلة كان سيُفرغ الشاشة نهائيًا في ذلك الترتيب — ورأيتُه فارغًا فعلًا.
    والكتابة على عقدةٍ منفصلة لا تضرّ أصلًا؛ الذي يضرّ هو ردٌّ متأخّر يدهس
    ردًّا أحدث، وذاك يمنعه العدّاد أدناه لا الاتصال بالمستند.
  */
  function paintSummary(){
    QBANK.api.rpc('admin_codes_summary').then(r => {
      if (!alive()) return;
      const d = (r.ok && r.data && !r.data.error) ? r.data : null;
      if (!d) { sum.textContent = ''; return; }
      const n = QBANK.views.arNum;
      sum.textContent = 'الجملة ' + n(d.total) + ' · لم يُستعمل ' + n(d.unused) +
                        ' · مُفعَّل ' + n(d.used) + ' · موقوف ' + n(d.off) +
                        ' · مرات التفعيل ' + n(d.redeemed);
    });
  }
  paintSummary();

  function when(iso){
    try { return new Date(iso).toLocaleDateString('ar-SA-u-nu-latn'); }
    catch(e){ return ''; }
  }

  /* ★ عدّاد الطلبات: ضغطتان سريعتان على مرشّحين يعودان بأي ترتيب، والأبطأ
     يدهس الأسرع فيرى المشرف نتيجة مرشّحٍ لم يعد مختارًا. الأحدث وحده يرسم. */
  let seq = 0;
  function draw(){
    const mine = ++seq;
    listBox.innerHTML = '';
    listBox.appendChild(el('p', { class:'field__hint', style:'margin:0', text:'جارٍ التحميل…' }));
    QBANK.api.rpc('admin_codes', { p_limit: 200, p_state: state }).then(r => {
      if (mine !== seq || !alive()) return;
      listBox.innerHTML = '';
      /* ★ «لا أكواد بعد» و«تعذّر الجلب» حالتان لا حالة واحدة.
         قائمةٌ فارغة تقول «كل شيء سليم ولم تولّد بعد»، ونداءٌ سقط يقول
         «شيءٌ مكسور» — وعرضُ الأولى مكان الثانية يُخفي العطل تمامًا. */
      if (!r.ok || !Array.isArray(r.data)){
        listBox.appendChild(el('p', { class:'field__hint is-bad', style:'margin:0',
          text: Codes.failText(r) }));
        return;
      }
      const rows = r.data;
      if (!rows.length){
        listBox.appendChild(el('p', { class:'field__hint', style:'margin:0', text:
          state === 'unused' ? 'لا رمز غير مستعمل — ولّد دفعة جديدة.'
          : state === 'used' ? 'لم يُفعَّل رمزٌ بعد.'
          : state === 'off'  ? 'لا رمز موقوف.'
          : 'لا أكواد بعد.' }));
        return;
      }

      rows.forEach(c => {
        const uses = Array.isArray(c.uses) ? c.uses : [];
        const spent = c.used_count >= c.max_uses;
        const off = !c.active || spent;
        const row = el('div', { class:'payrow' }, [
          el('span', { class:'payrow__t num', text: Codes.pretty(c.code) }),
          el('span', { class:'badge', text: c.kind === 'semester' ? 'الفصل' : (c.subject || 'مادة') }),
          el('span', { class:'badge num' + (spent ? ' badge--warn' : ''),
            text: QBANK.views.arNum(c.used_count) + '/' + QBANK.views.arNum(c.max_uses) }),
          el('span', { class:'badge ' + (off ? 'badge--bad' : 'badge--ok'),
            text: off ? (spent ? 'مستهلَك' : 'موقوف') : (uses.length ? 'مُفعَّل' : 'جاهز') })
        ]);
        if (!spent){
          const t = el('button', { class:'btn btn--ghost btn--sm', type:'button',
            text: c.active ? 'أوقف' : 'فعّل',
            'aria-label': (c.active ? 'أوقف الرمز ' : 'فعّل الرمز ') + Codes.pretty(c.code) });
          t.addEventListener('click', async () => {
            t.disabled = true;
            const rr = await QBANK.api.rpc('admin_set_code', { p_id: c.id, p_active: !c.active });
            t.disabled = false;
            if (rr.ok && rr.data && rr.data.ok){
              c.active = !c.active;
              t.textContent = c.active ? 'أوقف' : 'فعّل';
              QBANK.toast(c.active ? 'صار فعّالًا' : 'أُوقف');
              paintSummary();
            } else QBANK.toast('تعذّر التعديل');
          });
          row.appendChild(t);
        }

        const wrap = el('div', { class:'codeblk' }, [row]);

        /*
          ★ الحسابات تحت رمزها لا في جدولٍ منفصل.
          سؤال المشرف دائمًا «هذا الرمز — من أخذه؟»، وجدولٌ ثانٍ يجعل
          الجواب عمليةَ مطابقةٍ بين قائمتين. والبريد ظاهر لأنه هو ما
          يبحث به الطالب عن نفسه حين يقول «فعّلتُه ولم يُفتح».
        */
        uses.forEach(u => {
          wrap.appendChild(el('div', { class:'codeuse' }, [
            el('span', { class:'codeuse__i', 'aria-hidden':'true', text:'↳' }),
            el('span', { class:'codeuse__n', text: u.name || 'بلا اسم' }),
            el('span', { class:'codeuse__e num', text: u.email || '' }),
            el('span', { class:'codeuse__d num', text: when(u.used_at) })
          ]));
        });

        listBox.appendChild(wrap);
      });
    });
  }
  draw();

  return box;
}
QBANK.views.adminCodesCard = adminCodesCard;
