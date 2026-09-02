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

  /*
    ★ إعادة رسم الشاشة بعد فتحٍ ناجح — لا يعرفها المنادي فنُوفّرها هنا.
    الطالب يُفعّل رمزه فتصير المادة له، وتبقى بطاقة القفل أمامه لأن الشاشة
    رُسمت قبل الفتح. فيظنّ التفعيل فشل ويُدخل رمزًا آخر ويُنفق اثنين مكان
    واحد. الرسم الجديد هو ما يجعل النجاح مرئيًا.
  */
  reopen(){ try { QBANK.router.render(location.hash); } catch(e){} },

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

  /*
    بطاقة الشراء — تحترم قاعدة المتاجر: داخل التطبيق لا إحالة للموقع.

    ★ ولا تنتهي عند زرٍّ واحد.
    كان فيها زرّ «اشترِ» وحده، وهو يقود إلى بوابة Tap التي لم تُفعَّل بعد —
    فينتهي الطالب إلى «الدفع غير مفعَّل بعد على هذا الخادم» ولا يبقى أمامه
    شيء يفعله. والبطاقة التي تعرض ثمنًا ولا تعرض طريقًا لدفعه بابٌ مرسوم
    على جدار. فصار فيها ثلاثة طرق: البوابة إن عملت، ورمز تفعيل يُدخله من
    اشترى بأي وسيلة أخرى، وطلبٌ مباشر لمن لا يملك رمزًا.
  */
  paywallCard(sub, onOpen){
    const kids = [
      el('span', { class:'empty__ico', 'aria-hidden':'true', text:'🔒' }),
      el('p', { class:'empty__title', text:'«' + sub.name + '» مادة مدفوعة' }),
      el('p', { class:'empty__text', text:'اشترِ المادة وحدها أو حزمة الفصل كاملة — صالحة حتى نهاية الفصل، بلا اشتراك شهري.' })
    ];

    /*
      ★ السعر سطرٌ قائم بذاته لا نصٌّ داخل زرّ.
      كان مكتوبًا في زرّ الشراء وحده — وذلك الزرّ يُخفي نفسه حين تكون
      بوابة الدفع غير مفعَّلة. فيبقى الطالب أمام بطاقةٍ تقول «مادة مدفوعة»
      ولا تقول بكم، ثم يُطلب منه أن يُحوّل مبلغًا لا يعرفه.
    */
    const priceTxt = QBANK.codes ? QBANK.codes.priceText(sub) : '';
    if (priceTxt)
      kids.push(el('p', { class:'paywall__price num', text:'سعرها ' + priceTxt }));

    kids.push(Gate.buyButton(sub));

    const C = QBANK.codes;
    if (C){
      kids.push(QBANK.views.redeemBox(onOpen || Gate.reopen));
      const s = C.support();
      /* النصّ بعد إبدال النائبات — {السعر} و{المادة} تصيران قيمتيهما.
         ★ وقبل الأزرار لا بعدها: تعليماتُ الدفع تُقرأ ثم يُنقر، وترتيبٌ
         يعكسهما يجعل الطالب يفتح واتساب ثم يعود ليقرأ. */
      const note = C.note(sub);
      if (note) kids.push(el('p', { class:'field__hint paywall__note', text: note }));

      /*
        ★ زرّان لا زرّ: «كيف أدفع؟» و«حوّلتُ، افتحها لي» حالتان مختلفتان.
        ودمجُهما في واحد يجعل المشرف يقرأ رسالةً لا يدري من أيّهما هي،
        فيسأل «هل حوّلتَ؟» — سؤالٌ كان يجب ألّا يُسأل. ورسالةُ ما بعد
        التحويل هي الأولى بالبروز، لأن صاحبها دفع فعلًا.
        وكلاهما في المتصفح فقط وبشرط رقمٍ مكتوب: زرٌّ يفتح واتساب بلا
        رقم يفتح لا شيء.
      */
      if (!C.isApp() && s.wa){
        const O = QBANK.orders;
        const pending = O ? O.pendingFor(sub.id) : null;

        /*
          ★ طلبٌ قائم يُعرض حالًا لا أزرارًا.
          الطالب العائد من واتساب بعد ثوانٍ يجب أن يجد «قيد المراجعة» — لا
          الزرّ نفسه فيظنّ أن شيئًا لم يُسجَّل ويضغطه ثانيةً ثم ثالثة.
        */
        if (pending) kids.push(O.waitingBand(sub, pending));

        const paid = el('a', { class:'btn btn--block' + (pending ? ' btn--soft' : ''),
          target:'_blank', rel:'noopener', href: C.paidUrl(sub),
          text: pending ? 'أرسل الإيصال على واتساب' : 'حوّلتُ — أرسل الإيصال للمشرف' });
        /*
          ★ الطلب يُسجَّل في القاعدة لحظةَ الضغط، والرابط يمضي إلى واتساب
          كما هو. لا ننتظر الرد — انتظاره يُوقف الانتقال ويكسره على بعض
          الجوّالات (حاجب النوافذ). ولو سقط التسجيل بقي الإيصال وصل، وللمشرف
          أن يفتح المادة يدويًا من ملف الطالب.
        */
        if (O && !pending) paid.addEventListener('click', () => {
          O.create(sub.id).then(() => {
            /* نُعيد الرسم بعد لحظة كي يجد الطالب الحال الجديدة حين يعود */
            setTimeout(() => Gate.reopen(), 800);
          });
        });
        kids.push(paid);
        if (!pending)
          kids.push(el('p', { class:'field__hint', style:'margin:2px 0 0', text:
            'تُفتح محادثة واتساب برسالة جاهزة فيها المادة والمبلغ وحسابك — أرفق صورة الإيصال وأرسلها.' }));
        kids.push(el('a', { class:'btn btn--ghost btn--block', target:'_blank',
          rel:'noopener', href: C.askUrl(sub), text:'عندي سؤال قبل التحويل' }));

        /* ونُصحّح من القاعدة: طلبٌ فُتح أو رُفض بينما الشاشة مفتوحة يُرى فورًا.
           ★ والاستحقاقات تُجدَّد قبل الرسم: «فُتحت» بلا استحقاقٍ في الجهاز
           تُعيد رسم القفل نفسه، فيقرأ الطالب «فُتحت لك» فوق بابٍ مغلق. */
        if (O) O.refresh(() => Gate.refresh().then(() => Gate.reopen()));
      }
    }

    kids.push(el('p', { class:'field__hint', text:'لديك حساب اشترى من قبل؟ سجّل دخولك وسيُفتح المحتوى تلقائيًا.' }));
    return el('div', { class:'card', style:'text-align:center' }, kids);
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
