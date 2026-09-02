/*
  بوابة المحتوى — تفصل المجاني عن المدفوع (المرحلة ٥).
  القرار النهائي في قاعدة البيانات (can_access + RLS)؛ نسخة العميل هنا
  للعرض فقط: تخفي أزرار ما لا يملكه الطالب وتعرض بطاقة الشراء بدلها.
  النموذج: مادة مفردة أو حزمة فصل تنتهي بنهاية الفصل — لا اشتراك شهري.
*/
const Gate = {
  KEY: 'entitlements',
  list(){ return QBANK.store.get(Gate.KEY, []); },
  save(rows){ QBANK.store.set(Gate.KEY, rows || []); },

  async refresh(){
    const u = QBANK.api.user();
    if (!u) return { ok:false };
    const r = await QBANK.api.rest('entitlements?select=subject_id,kind,expires_at&expires_at=gt.' + new Date().toISOString());
    if (r.ok && Array.isArray(r.data)) { Gate.save(r.data); return { ok:true }; }
    return r;
  },

  // متاحة؟ مجانية للجميع، أو استحقاق ساري المفعول (مادة مفردة أو حزمة فصل)
  canAccess(sub, now){
    if (!sub) return false;
    if (sub.free) return true;
    if (QBANK.store.get('is_admin_check', {}).ok) return true;
    const t = now || Date.now();
    return Gate.list().some(e =>
      new Date(e.expires_at).getTime() > t &&
      (e.kind === 'semester' || e.subject_id === sub.id));
  },

  /*
    رابط الإحالة: يصل في ?ref=  فنحفظه، لأن الطالب قد يسجّل دخوله أولًا
    ويعود بعد جولة في المنصة — ولو ضاع المُحيل ضاعت مكافأة من أوصله.
  */
  REF_KEY: 'ref_by',
  captureRef(query){
    const ref = (query && query.ref) || '';
    if (ref) QBANK.store.set(Gate.REF_KEY, ref);
    return ref || QBANK.store.get(Gate.REF_KEY, '');
  },
  ref(){ return QBANK.store.get(Gate.REF_KEY, ''); },

  // زر الشراء وحده — تُعيد استعماله بطاقة القفل وبطاقة انتهاء التجربة
  buyButton(sub){
    const isApp = !!(typeof window !== 'undefined' && window.QBANK_NATIVE_APP);
    const price = sub.price ? ' — ' + sub.price + ' ريال' : '';
    return isApp
      ? el('button', { class:'btn btn--block', type:'button', 'data-buy': sub.id,
          'data-ref': Gate.ref() || null, text:'اشترِ من داخل التطبيق' + price })
      /* ★ صار دفعًا حقيقيًا لا رابطًا خارجيًا.
         كان يفتح alsoqoor.com — أي أن الطالب يغادر المنصة عند أهم لحظة
         فيها، وهي اللحظة التي يقرّر فيها أن يدفع. والآن يشتري في مكانه. */
      /*
        ★ مادة مقفلة بلا سعر حالةٌ حقيقية — لا حالة فحص.
        كان الرابط الخارجي يخفيها: يظهر زر شراء لمادة لا ثمن لها، فيضغطه
        الطالب فلا يجد شيئًا يشتريه. الآن تُقال بصراحة، لأنها خطأ محتوى
        على المشرف إصلاحه لا لغزٌ على الطالب حلّه.
      */
      : (QBANK.pay && QBANK.pay.buySubjectButton(sub)) ||
        el('p', { class:'field__hint', 'data-noprice':'1',
          text:'لم يُحدَّد سعر هذه المادة بعد — تواصل مع مشرف المنصة.' });
  },

  // بطاقة الشراء — تحترم قاعدة المتاجر: داخل التطبيق لا إحالة للموقع
  paywallCard(sub){
    return el('div', { class:'card', style:'text-align:center' }, [
      el('span', { class:'empty__ico', 'aria-hidden':'true', text:'🔒' }),
      el('p', { class:'empty__title', text:'«' + sub.name + '» مادة مدفوعة' }),
      el('p', { class:'empty__text', text:'اشترِ المادة وحدها أو حزمة الفصل كاملة — صالحة حتى نهاية الفصل، بلا اشتراك شهري.' }),
      Gate.buyButton(sub),
      el('p', { class:'field__hint', text:'لديك حساب اشترى من قبل؟ سجّل دخولك وسيُفتح المحتوى تلقائيًا.' })
    ]);
  },

  /*
    القرار المعتمد يأتي من القاعدة (subject_access)، وهذه نسخة محلية للعرض الفوري
    قبل وصول الرد — كي لا تومض الشاشة. لا تُمنح بها صلاحية: القاعدة ترفض من لا حق له
    حتى لو كذبت هذه الدالة، والفحوص تثبت ذلك.
  */
  localGuess(sub, now){
    if (!sub) return { allowed:false, reason:'missing' };
    if (sub.free) return { allowed:true, reason:'free' };
    if (QBANK.store.get('is_admin_check', {}).ok) return { allowed:true, reason:'admin' };
    const u = QBANK.api.user();
    if (!u) return { allowed:false, reason:'anon' };
    const t = now || Date.now();
    if (Gate.list().some(e => new Date(e.expires_at).getTime() > t &&
        (e.kind === 'semester' || e.subject_id === sub.id)))
      return { allowed:true, reason:'entitled' };
    /*
      ★ مادته هو — يفتحها بلا سؤال.
      من كتب البنك بيده لا يليق أن يُطلب منه ثمنُ فتحه. والقاعدة تكتب له
      استحقاقًا لحظة النشر، لكنه قد لا يكون وصل إلى هذا الجهاز بعد، فنُقرّر
      محليًا ولا ننتظر: صاحب المادة أولى الناس بها.
      و`pending` باقية لأن القاعدة هي من يعرف متى تنتهي مدّته.
    */
    if (sub.created_by && sub.created_by === u.id)
      return { allowed:true, reason:'owner', pending:true };
    return { allowed:false, reason:'paywall' };
  }
};
QBANK.gate = Gate;
