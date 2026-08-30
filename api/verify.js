'use strict';
/*
  /api/verify — التحقق من المشتريات (المرحلة ٥).
  المبدأ الثابت: العميل لا يمنح نفسه استحقاقًا أبدًا — الخادم يتحقق من البوابة
  بمفتاح الخدمة (يتجاوز RLS) ثم يكتب صف entitlements بنفسه.
  القنوات: بوابة سعودية للموقع (مدى/Apple Pay)، ومشتريات آبل وجوجل داخل التطبيق لاحقًا.
*/
const { rpc } = require('./_lib/supa.js');

async function grant(userId, subjectId, kind, source, expiresAt){
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;   // مفتاح الخدمة — خادم فقط
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY غير مضبوطين');
  const res = await fetch(url + '/rest/v1/entitlements', {
    method:'POST',
    headers:{ 'apikey': key, 'Authorization':'Bearer ' + key, 'Content-Type':'application/json' },
    body: JSON.stringify({ user_id: userId, subject_id: subjectId, kind, source, expires_at: expiresAt })
  });
  if (!res.ok) throw new Error('فشل تسجيل الاستحقاق: ' + res.status);
  return true;
}

// التحقق حسب المصدر — كل بوابة لها آلية تحقق من جهة الخادم
const verifiers = {
  // بوابة الموقع (مثل Moyasar): نستعلم عن حالة الدفعة بمعرّفها لدى البوابة نفسها
  async web(payload){
    const key = process.env.PAYMENT_API_KEY;
    if (!key) throw new Error('PAYMENT_API_KEY غير مضبوط');
    const res = await fetch('https://api.moyasar.com/v1/payments/' + encodeURIComponent(payload.payment_id), {
      headers:{ 'Authorization':'Basic ' + Buffer.from(key + ':').toString('base64') }
    });
    if (!res.ok) throw new Error('تعذّر الاستعلام عن الدفعة');
    const p = await res.json();
    if (p.status !== 'paid') throw new Error('الدفعة غير مكتملة: ' + p.status);
    return { amount: p.amount, currency: p.currency };
  },
  // مشتريات آبل وجوجل: تُبنى مع مرحلة التطبيقات — نرفض بوضوح حتى تكتمل
  async apple(){ throw new Error('تحقق آبل يُبنى مع مرحلة التطبيقات'); },
  async google(){ throw new Error('تحقق جوجل يُبنى مع مرحلة التطبيقات'); }
};

module.exports = async function handler(req, res){
  if (req.method !== 'POST') return res.status(405).json({ error:'POST فقط' });
  try{
    const { source, user_id, subject_id, kind, payload, ref } = req.body || {};
    if (!verifiers[source]) return res.status(400).json({ error:'مصدر غير معروف' });
    if (!user_id || !kind) return res.status(400).json({ error:'بيانات ناقصة' });

    await verifiers[source](payload || {});

    // الصلاحية: نهاية الفصل الدراسي الحالي (تقريب: ٥ أشهر) — لا اشتراك شهري
    const expires = new Date(Date.now() + 150 * 86400000).toISOString();
    await grant(user_id, subject_id || null, kind, source, expires);

    /*
      مكافأة المنشئ — بعد تأكيد الدفعة لا قبلها، وبمفتاح الخدمة لأنها تكتب
      في رصيد شخص آخر. القاعدة تتحقق أن رابط الإحالة يخصّ منشئ المادة فعلًا،
      فرابط مزوّر لا يحوّل المكافأة لغريب. وفشلها لا يُبطل شراءً تم.
    */
    let coins = null;
    if (subject_id){
      try{
        coins = await rpc('award_referral_coins',
          { sid: subject_id, buyer: user_id, ref: ref || null });
      } catch(e){ coins = { ok:false, reason:'award_failed', detail:e.message }; }
    }
    return res.status(200).json({ ok:true, expires_at: expires, coins });
  } catch(e){
    return res.status(402).json({ error: e.message });
  }
};
module.exports._verifiers = verifiers;
