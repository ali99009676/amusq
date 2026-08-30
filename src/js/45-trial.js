/*
  تجربة العشر دقائق — مكافأة من يرفع مادته، لا عيّنة مجانية للجميع.

  الوقت يُحسب في الخادم لا هنا: المتصفح يرسل نبضة كل ٣٠ ثانية والقاعدة تجمعها
  وتقصّها عند السقف. لو أغلق الطالب الصفحة أو عبث بالساعة أو فتح خمس ألسنة،
  فالمجموع في القاعدة هو الحكم. العدّاد المعروض تقدير محلي للطمأنة فقط.
*/
const Trial = {
  CAP: 600,          // عشر دقائق — نفس الرقم في qbank.trial_cap()
  BEAT_MS: 30000,    // نبضة كل ٣٠ ثانية: تكفي لدقة نصف دقيقة بلا إغراق الشبكة
  state: null,       // { sid, left, cap, timer, tick, onExpire }

  fmt(sec){
    const s = Math.max(0, Math.round(sec));
    const m = Math.floor(s / 60);
    return m + ':' + String(s % 60).padStart(2, '0');
  },

  /*
    سؤال القاعدة: هل يُسمح؟ ولماذا؟
    نُرجع null عند تعذّر الوصول للخادم — لا «ممنوع». انقطاع الشبكة ليس دليل
    عدم أحقية، ولو أغلقنا المادة عند كل تعثّر لحُرم طالب دفع ثمنها من مذاكرته
    في الطائرة. القاعدة تحرس القراءة الفعلية للأسئلة على كل حال.
  */
  async access(sid){
    const r = await QBANK.api.rpc('subject_access', { sid });
    if (r && r.ok && r.data && !r.data.error) return r.data;
    return null;
  },

  stop(){
    if (!Trial.state) return;
    clearInterval(Trial.state.timer);
    clearInterval(Trial.state.tick);
    Trial.state = null;
  },

  /* يبدأ العدّ ويُرجع الشريط الجاهز للإلحاق */
  start(sid, secondsLeft, onExpire){
    Trial.stop();
    const bar = el('div', { class:'trialbar', role:'status', 'aria-live':'polite' });
    const label = el('span', { class:'trialbar__t' });
    const meter = el('span', { class:'trialbar__m' }, [ el('span', { class:'trialbar__f' }) ]);
    const buy = el('button', { class:'btn btn--sm', type:'button', text:'اشترِ الآن' });
    buy.addEventListener('click', () => { if (onExpire) onExpire('buy'); });
    bar.appendChild(el('span', { class:'trialbar__ico', 'aria-hidden':'true', text:'◷' }));
    bar.appendChild(label); bar.appendChild(meter); bar.appendChild(buy);

    const st = { sid, left: secondsLeft, cap: Trial.CAP, onExpire, bar };
    Trial.state = st;

    function paint(){
      const pct = Math.max(0, Math.min(100, st.left / st.cap * 100));
      label.textContent = 'تجربتك: ' + Trial.fmt(st.left) + ' متبقية';
      meter.firstChild.style.width = pct.toFixed(1) + '%';
      // آخر دقيقتين بلون التحذير — الطالب يستحق إنذارًا قبل القفل لا مفاجأة
      bar.className = 'trialbar' + (st.left <= 120 ? ' is-low' : '');
    }
    paint();

    // عدّاد العرض كل ثانية — تقدير محلي، والحقيقة تأتي مع كل نبضة
    st.tick = setInterval(() => {
      if (!bar.isConnected) return Trial.stop();
      st.left = Math.max(0, st.left - 1);
      paint();
      if (st.left <= 0){ Trial.stop(); if (onExpire) onExpire('expired'); }
    }, 1000);

    st.timer = setInterval(async () => {
      if (!bar.isConnected) return Trial.stop();
      const r = await QBANK.api.rpc('rpc_record_trial_heartbeat',
        { subject_id: sid, interval_seconds: Trial.BEAT_MS / 1000 });
      if (!r.ok || !r.data || r.data.error) return;      // انقطاع مؤقت: العدّاد المحلي يكمل
      const d = r.data;
      if (d.eligible === false){ Trial.stop(); if (onExpire) onExpire('ineligible'); return; }
      st.left = Number(d.seconds_left);                  // الخادم هو الحكم — نصحّح المحلي منه
      paint();
      if (d.expired){ Trial.stop(); if (onExpire) onExpire('expired'); }
    }, Trial.BEAT_MS);

    return bar;
  },

  /* شاشة انتهاء التجربة — تفتح الشراء لا تتركه في فراغ */
  expiredCard(sub){
    return el('div', { class:'card', style:'text-align:center' }, [
      el('span', { class:'empty__ico', 'aria-hidden':'true', text:'◷' }),
      el('p', { class:'empty__title', text:'انتهت تجربتك المجانية' }),
      el('p', { class:'empty__text',
        text:'استفدت من عشر دقائق كاملة في «' + sub.name + '». افتحها الآن حتى نهاية الفصل.' }),
      QBANK.gate.buyButton(sub)
    ]);
  }
};
QBANK.trial = Trial;
