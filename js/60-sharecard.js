/*
  ═══════════════════════════════════════════════════════════════════
  بطاقة السؤال كصورة — قناة النموّ الحقيقية
  ═══════════════════════════════════════════════════════════════════
  الطالب العربي لا ينشر روابط، ينشر صورًا: لقطة شاشة في مجموعة الدفعة،
  صورة في ستوري سناب. وهو يفعل ذلك بأسئلتنا الآن بلقطة شاشة مشوّهة لا
  اسم عليها ولا رابط — دعايةٌ نُهديها ونخسر نسبتها.

  فنُعطيه ما يريد مصنوعًا: بطاقةٌ مربّعة بهويّتنا، فيها السؤال وخياراته
  ورابط المنصة أسفلها. وكل سؤال صعب يُشارَك يصير دعوةً لزميل.

  ═══ ولا تُكشف الإجابة ═══
  عمدًا. البطاقة بلا إجابة تحدٍّ يُشارَك ويُناقَش، ومعها إجابةٍ تصير
  معلومةً استُهلكت ولا سبب لفتح الرابط. الفضول هو ما يُعبر الرابط.

  والرسم على canvas في المتصفح: بلا خادم، بلا مكتبة، ويعمل بلا إنترنت.
*/

const ShareCard = {
  W: 1080, H: 1080,   // مربّع: الشكل الذي تقبله سناب وواتساب وإنستغرام معًا

  /*
    لفّ النص على الأسطر بالقياس لا بالتخمين.
    القياس ضروري للعربية خاصة: عرض الحرف يختلف باختلاف موضعه في الكلمة،
    فأي تقدير بعدد المحارف يقطع السطر في غير موضعه.
  */
  wrap(ctx, text, maxW, maxLines){
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '', cutOff = false;
    for (let i = 0; i < words.length; i++) {
      const test = cur ? cur + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width > maxW && cur) {
        lines.push(cur); cur = words[i];
        if (maxLines && lines.length >= maxLines) { cutOff = true; cur = ''; break; }
      } else cur = test;
    }
    if (cur) lines.push(cur);
    if (maxLines && lines.length > maxLines) { lines.length = maxLines; cutOff = true; }
    /* ★ علامة القطع تُوضع كلما قُطع النص — لا حين يتجاوز العدّ وحده.
       الخروج من الحلقة عند بلوغ السقف يترك العدد مساويًا للسقف تمامًا،
       فيمرّ بلا علامة ويظنّ القارئ أن السؤال انتهى عند نصفه. */
    if (cutOff && lines.length) lines[lines.length - 1] += ' …';
    return lines;
  },

  /* عربيٌّ أم لاتيني؟ الاتجاه يُقرَّر من النص لا من لغة الواجهة */
  isRtl(t){ return /[؀-ۿ]/.test(String(t || '')); },

  /*
    رسم البطاقة. الألوان مأخوذة من متغيّرات الهوية إن أمكن قراءتها،
    وإلا سقطت إلى لوحة ليلية ثابتة — الصورة تُرسم مرة ولا تتبع سمة القارئ.
  */
  draw(cv, q, url){
    const W = ShareCard.W, H = ShareCard.H;
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');

    const BG = '#0e1117', CARD = '#151a22', LINE = '#232a35';
    const TXT = '#e8ecf2', DIM = '#9aa6b6', ACC = '#c8a250';

    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);

    // إطار داخلي: يجعل الصورة تُقرأ بطاقةً لا لقطة شاشة
    ctx.fillStyle = CARD;
    ctx.strokeStyle = LINE; ctx.lineWidth = 2;
    const pad = 56, r = 40;
    ShareCard.roundRect(ctx, pad, pad, W - pad * 2, H - pad * 2, r);
    ctx.fill(); ctx.stroke();

    const inner = pad + 56, maxW = W - inner * 2;
    let y = inner + 40;

    // ═══ الترويسة: الاسم ═══
    ctx.textBaseline = 'alphabetic';
    ctx.direction = 'rtl'; ctx.textAlign = 'right';
    ctx.fillStyle = ACC; ctx.font = '700 42px "Noto Kufi Arabic", system-ui, sans-serif';
    ctx.fillText('مراجعة', W - inner, y);
    ctx.fillStyle = DIM; ctx.font = '400 26px "Noto Kufi Arabic", system-ui, sans-serif';
    ctx.fillText('بنك الأسئلة', W - inner, y + 42);
    y += 130;

    // ═══ نص السؤال ═══
    const qt = String(q.q || '');
    const rtl = ShareCard.isRtl(qt);
    ctx.direction = rtl ? 'rtl' : 'ltr';
    ctx.textAlign = rtl ? 'right' : 'left';
    ctx.fillStyle = TXT;
    ctx.font = '600 44px "Noto Kufi Arabic", system-ui, sans-serif';
    const qLines = ShareCard.wrap(ctx, qt, maxW, 6);
    qLines.forEach(line => {
      ctx.fillText(line, rtl ? W - inner : inner, y);
      y += 62;
    });
    y += 26;

    // ═══ الخيارات — بلا كشف الإجابة ═══
    const letters = ['A', 'B', 'C', 'D', 'E'];
    const opts = (q.options || []).slice(0, 5);
    ctx.font = '400 34px "Noto Kufi Arabic", system-ui, sans-serif';
    opts.forEach((o, i) => {
      if (y > H - 240) return;                 // لا نطغى على التذييل
      const ort = ShareCard.isRtl(o);
      const boxY = y - 34;
      ctx.fillStyle = '#1c232d';
      ShareCard.roundRect(ctx, inner, boxY, maxW, 62, 16); ctx.fill();

      ctx.direction = 'ltr'; ctx.textAlign = 'left';
      ctx.fillStyle = ACC;
      ctx.fillText(letters[i], inner + 22, y + 6);

      ctx.direction = ort ? 'rtl' : 'ltr';
      ctx.textAlign = ort ? 'right' : 'left';
      ctx.fillStyle = TXT;
      const line = ShareCard.wrap(ctx, o, maxW - 110, 1)[0] || '';
      ctx.fillText(line, ort ? W - inner - 22 : inner + 76, y + 6);
      y += 78;
    });

    // ═══ التذييل: الدعوة والرابط ═══
    ctx.direction = 'rtl'; ctx.textAlign = 'center';
    ctx.fillStyle = DIM; ctx.font = '400 28px "Noto Kufi Arabic", system-ui, sans-serif';
    ctx.fillText('تعرف الإجابة؟ الشرح وبطاقة الحفظ على', W / 2, H - pad - 82);
    ctx.fillStyle = ACC; ctx.font = '700 32px system-ui, sans-serif';
    ctx.direction = 'ltr';
    ctx.fillText(String(url || 'amsuq.alsoqoor.com').replace(/^https?:\/\//, '').replace(/\/$/, ''),
                 W / 2, H - pad - 36);
    return cv;
  },

  roundRect(ctx, x, y, w, h, r){
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  },

  /* الرابط الذي يُطبع: رابط المادة إن عرفناها، وإلا الرئيسية */
  urlFor(q){
    try {
      const subs = (QBANK.data.pack().subjects) || [];
      const sub = subs.filter(s => s.id === (q._sid || q.subject_id))[0];
      const u = QBANK.api.user();
      if (sub && sub.slug && QBANK.share) return QBANK.share.shareUrl(sub.slug, u && u.id);
    } catch(e){}
    return 'amsuq.alsoqoor.com';
  },

  async blob(q){
    const cv = document.createElement('canvas');
    ShareCard.draw(cv, q, ShareCard.urlFor(q));
    return new Promise(res => {
      if (!cv.toBlob) return res(null);        // بيئة فحص بلا canvas حقيقي
      cv.toBlob(b => res(b), 'image/png');
    });
  },

  /*
    المشاركة: نافذة النظام إن وُجدت، وإلا تنزيل الملف.
    ولا نعِد بما لا نملك: Web Share بالملفات غير مدعوم في كل متصفح،
    فنسأله قبل أن نعرضه — canShare يقول الحقيقة، والافتراض يكذب.
  */
  async share(q){
    const b = await ShareCard.blob(q);
    if (!b) return { ok:false };
    const file = (typeof File !== 'undefined')
      ? new File([b], 'amsuq.png', { type:'image/png' }) : null;
    if (file && navigator.share && navigator.canShare && navigator.canShare({ files:[file] })) {
      try { await navigator.share({ files:[file] }); return { ok:true, via:'share' }; }
      catch(e){ return { ok:false, cancelled:true }; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = 'amsuq-question.png';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return { ok:true, via:'download' };
  },

  button(q){
    const b = el('button', { class:'btn btn--ghost btn--sm', type:'button',
      text:'⤴ شارك السؤال كصورة' });
    b.addEventListener('click', async () => {
      b.setAttribute('aria-disabled','true'); b.textContent = '… تُرسم البطاقة';
      const r = await ShareCard.share(q);
      b.removeAttribute('aria-disabled'); b.textContent = '⤴ شارك السؤال كصورة';
      if (r.ok && r.via === 'download') QBANK.toast('حُفظت الصورة — أرسلها من معرض جهازك');
      else if (!r.ok && !r.cancelled) QBANK.toast('تعذّر إنشاء الصورة');
    });
    return b;
  }
};
QBANK.shareCard = ShareCard;
