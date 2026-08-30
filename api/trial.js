'use strict';
/*
  /api/trial — بوابة الوصول ونبضة التجربة.

  القرار كله في القاعدة (subject_access + rpc_record_trial_heartbeat)، وهذا غلاف
  يمرّر رمز الطالب كما هو — لا مفتاح الخدمة — كي تبقى auth.uid() هي هويته الحقيقية.
  لو مرّرنا مفتاح الخدمة لضاعت الهوية وصارت الدوال بلا صاحب.
  المتصفح ينادي القاعدة مباشرة عادةً؛ هذا المسار للتطبيق الأصلي ولأي تحقق من جهة الخادم.

  action=access    → هل يُسمح بالمادة؟ ولماذا؟ وكم بقي من التجربة؟
  action=heartbeat → نبضة كل ٣٠ ثانية تستهلك من رصيد التجربة.
*/
const { rpc, userFromToken, bearer } = require('./_lib/supa.js');

module.exports = async function handler(req, res){
  if (req.method !== 'POST') return res.status(405).json({ error:'POST فقط' });
  try{
    const { action, subject_id, interval_seconds } = req.body || {};
    if (!subject_id) return res.status(400).json({ error:'أرسل subject_id' });

    const token = bearer(req);
    const user = await userFromToken(token);
    if (!user) return res.status(401).json({ error:'جلسة غير صالحة' });

    if (action === 'heartbeat'){
      // السقف مفروض في القاعدة أيضًا؛ القصّ هنا يوفّر رحلة لا أكثر
      const secs = Math.min(Math.max(parseInt(interval_seconds, 10) || 30, 0), 60);
      const out = await rpc('rpc_record_trial_heartbeat',
        { subject_id, interval_seconds: secs }, token);
      return res.status(200).json({ ok:true, trial: out });
    }

    const access = await rpc('subject_access', { sid: subject_id }, token);
    return res.status(200).json({ ok:true, access });
  } catch(e){
    return res.status(500).json({ error: e.message });
  }
};
