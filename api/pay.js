'use strict';
/*
  /api/pay — بوابة الدفع.

  ثلاثة أفعال، وكلٌّ منها يحرس نفسه:

  start   — ينشئ نيّة الشراء (القاعدة تحسب السعر) ثم يفتح عملية لدى Tap.
  confirm — يُنادى عند عودة الطالب: نسأل Tap عن العملية ثم نُسوّي.
  webhook — إشعار Tap المستقل عن المتصفح: نفس التحقق تمامًا.

  ★ الفصل بين confirm وwebhook مقصود ولا غنى عنه:
  الطالب قد يُغلق المتصفح بعد الدفع مباشرة فلا يصل confirm أبدًا، والإشعار
  قد يتأخر أو يسقط. فوجودهما معًا يضمن وصول ما دُفع ثمنه، وتفرّد
  provider_ref في القاعدة يضمن ألّا يُمنح مرتين مهما وصل الاثنان.
*/
const { rpc, userFromToken, bearer } = require('./_lib/supa.js');
const gateway = require('./_lib/gateway.js');

/*
  التسوية المشتركة بين confirm وwebhook.
  ★ لا تأخذ من مُناديها إلا معرّف العملية لدى Tap. كل ما عداه — المبلغ،
  الحالة، أي دفعة — يأتي من Tap نفسها. فلو زوّر أحدٌ نداءً كاملًا لهذا
  المسار بمعرّف عملية لم تُدفع، سألنا Tap فأجابت بأنها لم تُقبض.
*/
async function settleFromCharge(chargeId){
  if (!chargeId) return { ok:false, reason:'no_charge' };

  const ch = await gateway.retrieveCharge(chargeId);
  if (!ch.ok) return { ok:false, reason:'gateway_unreachable' };
  if (!ch.paid) return { ok:false, reason:'not_paid', status: ch.status };
  if (!ch.paymentId) return { ok:false, reason:'no_reference' };

  // مفتاح الخدمة هنا فقط، وبعد أن صار الدفع مؤكدًا من مصدره
  const out = await rpc('settle_payment', {
    p_payment: ch.paymentId,
    p_provider_ref: chargeId,
    p_paid_halalas: ch.amountHalalas,
    p_provider: 'tap'
  });
  return out || { ok:false, reason:'settle_failed' };
}

module.exports = async function handler(req, res){
  if (req.method !== 'POST') return res.status(405).json({ error:'POST فقط' });
  try {
    const body = req.body || {};
    /*
      ★ Tap لا ترسل action: تُرسل جسم العملية كما هو إلى العنوان الذي أعطيناها.
      فنتعرّف على الإشعار بعلامتيه: المعامل hook=1 في العنوان، أو معرّف عملية
      يبدأ بـ chg_ في الجسم. اشتراط action هنا كان سيجعل كل إشعار يسقط صامتًا
      — والطالب يدفع ولا يصله شيء إن أغلق متصفحه.
    */
    const isHook = !!(req.query && req.query.hook) ||
                   /^chg_/.test(String(body.id || ''));
    const action = isHook ? 'webhook' : (body.action || 'start');

    if (action === 'webhook'){
      const chargeId = body.id || (body.charge && body.charge.id) || body.charge_id;
      const out = await settleFromCharge(chargeId);
      // ٢٠٠ دائمًا: خطأٌ عندنا يجعل Tap تُعيد الإشعار بلا نهاية
      return res.status(200).json({ received:true, settled: !!(out && out.ok) });
    }

    const token = bearer(req);
    const user = await userFromToken(token);
    if (!user) return res.status(401).json({ error:'جلسة غير صالحة' });

    if (action === 'confirm'){
      const out = await settleFromCharge(body.charge_id);
      return res.status(200).json({ ok: !!(out && out.ok), result: out });
    }

    /* ═══ بدء الشراء ═══ */
    if (!gateway.ready())
      return res.status(503).json({ error:'الدفع غير مفعَّل بعد على هذا الخادم' });

    // ★ السعر من القاعدة لا من الطلب: لا نقرأ amount من body إطلاقًا
    const intent = await rpc('create_payment', {
      p_kind: body.kind === 'subject' ? 'subject' : 'coins',
      p_subject: body.subject_id || null,
      p_coins: parseInt(body.coins, 10) || 0,
      p_ref: body.ref || null
    }, token);

    if (!intent || !intent.ok){
      const why = {
        closed:'الشراء موقوف مؤقتًا',
        bad_package:'باقة غير معروفة',
        not_found:'المادة غير موجودة',
        already_owned:'المادة عندك بالفعل',
        already_free:'هذه المادة مجانية',
        no_price:'لا سعر لهذه المادة'
      }[intent && intent.reason] || 'تعذّر بدء العملية';
      return res.status(400).json({ error: why, reason: intent && intent.reason });
    }

    const origin = body.origin || ('https://' + (req.headers.host || ''));
    const charge = await gateway.createCharge({
      amountHalalas: intent.amount_halalas,
      currency: intent.currency,
      title: intent.title,
      paymentId: intent.payment_id,
      email: user.email,
      redirectUrl: origin + '/#/pay/' + intent.payment_id,
      webhookUrl: origin + '/api/pay?hook=1'
    });

    if (!charge.ok)
      return res.status(502).json({ error:'تعذّر فتح صفحة الدفع — حاول بعد قليل' });

    return res.status(200).json({
      ok:true, url: charge.url, payment_id: intent.payment_id,
      amount_halalas: intent.amount_halalas, currency: intent.currency
    });

  } catch(e){
    console.error('pay: ' + e.message);
    return res.status(500).json({ error:'خطأ في الخادم' });
  }
};
