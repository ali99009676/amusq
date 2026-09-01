'use strict';
/*
  محوّل بوابة الدفع — Tap Payments.

  معزول في ملف واحد عمدًا: تبديل البوابة يومًا ما يجب أن يمسّ هذا الملف
  وحده. بقية النظام يعرف ثلاثة أشياء فقط: أنشئ عملية، اسأل عن حالتها،
  وهل هي مدفوعة.

  ★ المفتاح السري لا يغادر الخادم أبدًا. لا يُرسل إلى المتصفح ولا يُسجَّل
  في أي سطر، ولو ظهر في سجل خطأ لصار من يقرأ السجلات قادرًا على سحب
  أموال الحساب.
*/
const TAP_BASE = 'https://api.tap.company/v2';

function secret(){
  const k = process.env.TAP_SECRET_KEY;
  if (!k) throw new Error('TAP_SECRET_KEY غير مضبوط');
  return k;
}

/* هل الخادم مهيّأ للدفع أصلًا؟ نسأل قبل أن نَعِد الطالب بشاشة دفع */
function ready(){ return !!process.env.TAP_SECRET_KEY; }

async function tap(path, method, body){
  const res = await fetch(TAP_BASE + path, {
    method,
    headers: {
      'Authorization': 'Bearer ' + secret(),
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (e) { data = null; }
  /*
    ★ لا نُمرّر نصّ خطأ البوابة إلى المتصفح كما هو.
    قد يحوي تفاصيل حساب أو مفاتيح جزئية، والطالب لا ينتفع بها. نُسجّله
    عندنا ونُعطيه رسالة يفهمها.
  */
  if (!res.ok) {
    console.error('tap ' + method + ' ' + path + ' → ' + res.status + ' ' + text.slice(0, 300));
    return { ok:false, status: res.status, data };
  }
  return { ok:true, status: res.status, data };
}

/*
  إنشاء عملية دفع.
  amountHalalas: عدد صحيح بالهللات — نحوّله لريالات بمنزلتين، لأن Tap
  تتعامل بالوحدة الكبرى. القسمة هنا هي الموضع الوحيد الذي يقبل كسرًا.
*/
async function createCharge(opts){
  const amount = Math.round(opts.amountHalalas) / 100;
  const r = await tap('/charges', 'POST', {
    amount,
    currency: opts.currency || 'SAR',
    threeDSecure: true,
    save_card: false,
    description: opts.title || 'شراء',
    // مرجعنا يسافر مع العملية ويعود معها — به نعرف أي صفّ نُسوّي
    reference: { transaction: opts.paymentId },
    metadata: { payment_id: opts.paymentId },
    customer: {
      first_name: opts.name || 'طالب',
      email: opts.email || undefined
    },
    source: { id: 'src_all' },
    redirect: { url: opts.redirectUrl },
    post: opts.webhookUrl ? { url: opts.webhookUrl } : undefined
  });
  if (!r.ok || !r.data || !r.data.id) return { ok:false };
  const url = r.data.transaction && r.data.transaction.url;
  if (!url) return { ok:false };
  return { ok:true, chargeId: r.data.id, url };
}

/*
  ★ سؤال البوابة بنفسنا — هذا هو مصدر الحقيقة الوحيد.
  لا نثق برسالة العودة في المتصفح ولا بجسم الإشعار: كلاهما يستطيع أي أحد
  تزويره. نأخذ منهما المعرّف فقط، ثم نسأل Tap: هل قُبضت فعلًا وكم؟
*/
async function retrieveCharge(chargeId){
  const r = await tap('/charges/' + encodeURIComponent(chargeId), 'GET');
  if (!r.ok || !r.data) return { ok:false };
  const d = r.data;
  const paid = String(d.status || '').toUpperCase() === 'CAPTURED';
  return {
    ok: true,
    paid,
    status: d.status,
    // نُعيده هللات صحيحة: المقارنة بالأعداد الصحيحة لا بالكسور العشرية،
    // فمقارنة 15.00 بـ 14.999999 تفشل بلا سبب مفهوم
    amountHalalas: Math.round(Number(d.amount || 0) * 100),
    currency: d.currency,
    paymentId: (d.metadata && d.metadata.payment_id) ||
               (d.reference && d.reference.transaction) || null
  };
}

module.exports = { ready, createCharge, retrieveCharge };
