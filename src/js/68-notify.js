/*
  ═══════════════════════════════════════════════════════════════════
  إشعارات المتصفح — ما يُعيد الطالب
  ═══════════════════════════════════════════════════════════════════
  التكرار المتباعد يحسب «راجع اليوم» ولا أحد يخبر الطالب أن اليوم جاء.
  Web Push يفعل ذلك مجانًا: المتصفح يحمل الإشعار، وخادمنا يوقّعه بمفتاح
  VAPID ويرسله صباحًا لمن عنده ما يُراجَع أو اختبارٌ قريب.

  ★ يُطلب الإذن عند سببٍ لا عند الدخول.
  نافذة «السماح بالإشعارات؟» في أول ثانية تُرفض بلا قراءة، والرفض في
  المتصفح دائم. فنسأل حين يكون للسؤال معنى: بعد أول جلسة مراجعة، أو حين
  يكون له اختبارٌ قريب — وبزرٍّ يضغطه هو، لا بنافذةٍ تقفز.
*/

const Notify = {
  supported(){
    return typeof window !== 'undefined' && 'Notification' in window &&
           'serviceWorker' in navigator && 'PushManager' in window &&
           location.protocol.indexOf('http') === 0;
  },
  permission(){
    try { return (typeof Notification !== 'undefined' && Notification.permission) || 'default'; }
    catch(e){ return 'default'; }
  },

  /* المفتاح العام من الخادم — عامٌّ بطبيعته، ويُخبَّأ في الجهاز بعد أول جلب */
  KEY: 'vapid_pub',
  async publicKey(){
    const cached = QBANK.store.get(Notify.KEY, '');
    if (cached) return cached;
    const r = await QBANK.admin.serverGet('/api/push');
    const k = (r && r.ok && r.data && r.data.publicKey) || '';
    if (k) QBANK.store.set(Notify.KEY, k);
    return k;
  },

  /* المتصفح يريد المفتاح مصفوفة بايتات لا نصًّا */
  toBytes(b64){
    const pad = '='.repeat((4 - b64.length % 4) % 4);
    const s = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(s);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  },

  /* هل هذا الجهاز مشترك؟ — نسأل المتصفح لا القاعدة: هو من يعرف */
  async current(){
    try {
      const reg = await navigator.serviceWorker.ready;
      return await reg.pushManager.getSubscription();
    } catch(e){ return null; }
  },

  async enable(){
    if (!Notify.supported()) return { ok:false, reason:'unsupported' };
    if (!QBANK.api.user()) return { ok:false, reason:'auth' };
    const key = await Notify.publicKey();
    if (!key) return { ok:false, reason:'no_key' };

    let perm = Notify.permission();
    if (perm !== 'granted'){
      try { perm = await Notification.requestPermission(); } catch(e){ perm = 'denied'; }
    }
    if (perm !== 'granted') return { ok:false, reason: perm === 'denied' ? 'denied' : 'dismissed' };

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true, applicationServerKey: Notify.toBytes(key) });
      const j = sub.toJSON();
      const r = await QBANK.api.rpc('save_push_sub', {
        p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth,
        p_ua: (navigator.userAgent || '').slice(0, 80) });
      if (!(r.ok && r.data && r.data.ok)) return { ok:false, reason:'save' };
      QBANK.store.set('push_on', true);
      return { ok:true };
    } catch(e){ return { ok:false, reason:'subscribe', err: e.message }; }
  },

  async disable(){
    const sub = await Notify.current();
    if (sub){
      try { await QBANK.api.rpc('drop_push_sub', { p_endpoint: sub.endpoint }); } catch(e){}
      try { await sub.unsubscribe(); } catch(e){}
    }
    QBANK.store.set('push_on', false);
    return { ok:true };
  },

  WHY: {
    unsupported: 'متصفحك لا يدعم الإشعارات — على آيفون افتح المنصة من الشاشة الرئيسية (أضفها أولًا من زر المشاركة).',
    auth:        'سجّل دخولك أولًا.',
    no_key:      'الإشعارات لم تُفعَّل على الخادم بعد.',
    denied:      'رفضتَ الإشعارات في المتصفح — يمكن تغييره من إعدادات الموقع في المتصفح.',
    dismissed:   'أغلقتَ النافذة بلا اختيار — اضغط الزرّ ثانيةً حين تريد.',
    save:        'تعذّر حفظ الاشتراك — تأكّد من تنفيذ db/PUSH.sql.',
    subscribe:   'تعذّر الاشتراك في هذا المتصفح.'
  },
  why(r){ return Notify.WHY[r] || 'تعذّر تفعيل الإشعارات.'; },

  /*
    ★ متى نعرض الدعوة؟ حين يكون لها سبب.
    - عنده أسئلة مستحقّة أو اختبار خلال أسبوع → الدعوة تقول ما ستذكّره به.
    - لم يرفض من قبل (الرفض في المتصفح دائم، فلا نُلحّ على ما لا يُفتح).
    - لم يُغلق الدعوة بيده مرتين.
  */
  DISMISS_KEY: 'push_dismiss',
  shouldInvite(){
    if (!Notify.supported() || !QBANK.api.user()) return false;
    if (Notify.permission() === 'denied') return false;
    if (QBANK.store.get('push_on', false)) return false;
    if ((QBANK.store.get(Notify.DISMISS_KEY, 0) || 0) >= 2) return false;
    return true;
  },
  reason(){
    const due = QBANK.progress && QBANK.progress.dueAll ? QBANK.progress.dueAll().length : 0;
    const subs = (QBANK.data.pack().subjects || []);
    const soon = subs.filter(s => s.exam_date && (new Date(s.exam_date) - Date.now()) / 86400000 <= 14
                                  && (new Date(s.exam_date) - Date.now()) >= 0)[0];
    if (due) return 'عندك ' + QBANK.views.arNum(due) + ' سؤالًا مستحقًّا اليوم — نذكّرك كل صباح بما ينتظرك.';
    if (soon) return 'اختبار «' + soon.name + '» قريب — نذكّرك قبله ولا نُزعجك بعده.';
    return 'نذكّرك صباحًا بأسئلة اليوم وبموعد اختبارك — لا شيء غيرهما.';
  }
};
QBANK.notify = Notify;

/* ═══════════════ شريط الدعوة في الرئيسية ═══════════════ */
function notifyBanner(){
  if (!Notify.shouldInvite()) return null;
  const box = el('div', { class:'campus-band campus-band--ask notify-band', role:'region',
    'aria-label':'تفعيل الإشعارات' });
  const msg = el('span', { class:'campus-band__d', text: Notify.reason() });
  const go = el('button', { class:'btn btn--sm', type:'button', text:'فعّل التذكير' });
  const no = el('button', { class:'btn btn--ghost btn--sm', type:'button', text:'لاحقًا',
    'aria-label':'أخفِ دعوة الإشعارات' });
  go.addEventListener('click', async () => {
    go.disabled = true; msg.textContent = 'جارٍ التفعيل…';
    const r = await Notify.enable();
    if (r.ok){ msg.textContent = 'تمّ — يصلك التذكير صباحًا حين يكون هناك ما يُراجَع.'; go.hidden = true; no.hidden = true; return; }
    go.disabled = false; msg.textContent = Notify.why(r.reason);
  });
  no.addEventListener('click', () => {
    QBANK.store.set(Notify.DISMISS_KEY, (QBANK.store.get(Notify.DISMISS_KEY, 0) || 0) + 1);
    box.remove();
  });
  box.appendChild(el('span', { class:'campus-band__ico', 'aria-hidden':'true', text:'🔔' }));
  box.appendChild(el('span', { class:'campus-band__x' }, [
    el('span', { class:'campus-band__t', text:'تذكيرٌ صباحي بما يستحق' }), msg ]));
  box.appendChild(el('span', { class:'notify-band__b' }, [go, no]));
  return box;
}
QBANK.views.notifyBanner = notifyBanner;

/* ═══════════════ بطاقة الإعداد في الحساب ═══════════════ */
function notifyCard(){
  const box = el('div', { class:'card stack' });
  box.appendChild(el('h2', { style:'margin:0', text:'الإشعارات' }));
  const msg = el('p', { class:'field__hint', role:'status', style:'margin:0' });
  const btn = el('button', { class:'btn btn--soft', type:'button', text:'…' });
  box.appendChild(el('p', { class:'field__hint', style:'margin:0', text:
    'تذكيرٌ واحد صباحًا: أسئلة اليوم المستحقّة، وموعد اختبارك إن اقترب. لا شيء غيرهما.' }));
  box.appendChild(btn);
  box.appendChild(msg);

  if (!Notify.supported()){
    btn.hidden = true;
    msg.textContent = Notify.WHY.unsupported;
    return box;
  }

  const paint = async () => {
    const sub = await Notify.current();
    const on = !!sub && Notify.permission() === 'granted';
    btn.textContent = on ? 'أوقف الإشعارات' : 'فعّل الإشعارات';
    btn.className = 'btn ' + (on ? 'btn--ghost' : 'btn--soft');
    btn.dataset.on = on ? '1' : '0';
    if (!on && Notify.permission() === 'denied') msg.textContent = Notify.WHY.denied;
  };
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const on = btn.dataset.on === '1';
    const r = on ? await Notify.disable() : await Notify.enable();
    btn.disabled = false;
    msg.textContent = r.ok ? (on ? 'أُوقفت.' : 'تمّ التفعيل — يصلك التذكير صباحًا.') : Notify.why(r.reason);
    paint();
  });
  paint();
  return box;
}
QBANK.views.notifyCard = notifyCard;
