/*
  بوابة المحتوى — تفصل المجاني عن المدفوع (المرحلة ٥).
  القرار النهائي في قاعدة البيانات (can_access + RLS)؛ نسخة العميل هنا
  للعرض فقط: تخفي أزرار ما لا يملكه الطالب وتعرض بطاقة الشراء بدلها.
  النموذج: مادة مفردة أو حزمة فصل تنتهي بنهاية الفصل — لا اشتراك شهري.
*/
const Gate = {
  KEY: 'entitlements',
  list(){ return AMUSQ.store.get(Gate.KEY, []); },
  save(rows){ AMUSQ.store.set(Gate.KEY, rows || []); },

  async refresh(){
    const u = AMUSQ.api.user();
    if (!u) return { ok:false };
    const r = await AMUSQ.api.rest('entitlements?select=subject_id,kind,expires_at&expires_at=gt.' + new Date().toISOString());
    if (r.ok && Array.isArray(r.data)) { Gate.save(r.data); return { ok:true }; }
    return r;
  },

  // متاحة؟ مجانية للجميع، أو استحقاق ساري المفعول (مادة مفردة أو حزمة فصل)
  canAccess(sub, now){
    if (!sub) return false;
    if (sub.free) return true;
    if (AMUSQ.store.get('is_admin_check', {}).ok) return true;
    const t = now || Date.now();
    return Gate.list().some(e =>
      new Date(e.expires_at).getTime() > t &&
      (e.kind === 'semester' || e.subject_id === sub.id));
  },

  // بطاقة الشراء — تحترم قاعدة المتاجر: داخل التطبيق لا إحالة للموقع
  paywallCard(sub){
    const isApp = !!(typeof window !== 'undefined' && window.AMUSQ_NATIVE_APP);
    return el('div', { class:'card', style:'text-align:center' }, [
      el('span', { class:'empty__ico', 'aria-hidden':'true', text:'🔒' }),
      el('p', { class:'empty__title', text:'«' + sub.name + '» مادة مدفوعة' }),
      el('p', { class:'empty__text', text:'اشترِ المادة وحدها أو حزمة الفصل كاملة — صالحة حتى نهاية الفصل، بلا اشتراك شهري.' }),
      isApp
        ? el('button', { class:'btn btn--block', type:'button', 'data-buy': sub.id, text:'اشترِ من داخل التطبيق' })
        : el('a', { class:'btn btn--block', href:'https://www.alsoqoor.com', target:'_blank', rel:'noopener noreferrer', text:'اشترِ من الموقع (مدى / Apple Pay)' }),
      el('p', { class:'field__hint', text:'لديك حساب اشترى من قبل؟ سجّل دخولك وسيُفتح المحتوى تلقائيًا.' })
    ]);
  }
};
AMUSQ.gate = Gate;
