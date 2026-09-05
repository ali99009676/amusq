'use strict';
/*
  حرّاس مشتركة لكل دالة خادم — وُلدت من التدقيق الأمني (سبتمبر ٢٠٢٦).

  ★ لماذا ملف واحد؟ لأن الثغرات الحرجة كلها كانت من نوعٍ واحد: دالةٌ
  تكتب بمفتاح الخدمة أو تنادي الذكاء ولا تسأل من الطارق. حين يكون
  الحارس سطرًا واحدًا يُستدعى في أول كل دالة، لا يُنسى؛ وحين يكون
  عشرين سطرًا تُنسخ، يُنسى في الدالة الحادية عشرة.

  requireUser  — الهوية من Supabase نفسها (لا فكّ JWT محليًا).
  rateLimit    — عدّاد في القاعدة (rate_hit) لأن خادم Vercel بلا ذاكرة
                 بين النداءات؛ وإن لم تكن الدالة منشورة بعد فلا نعطّل
                 الخدمة، نمرّر ونسجّل — الهوية هي الحارس الأول لا هذا.
  fail         — الخطأ للمنادي بلا أحشاء: رسائلنا نحن تمرّ كما هي
                 (لها kind أو status)، وأي شيء آخر يصير رمزًا قصيرًا
                 يُقرأ في سجلّ Vercel لا في متصفح الغريب.
  safeEqual    — مقارنة أسرار بزمن ثابت.
*/
const crypto = require('crypto');
const supa = require('./supa.js');

async function requireUser(req){
  const token = supa.bearer(req);
  const user = await supa.userFromToken(token);
  return user ? { user, token } : null;
}

async function rateLimit(userId, route, max, windowS){
  let ok;
  try {
    ok = await supa.rpc('rate_hit', { p_key: route + ':' + userId, p_max: max, p_window_s: windowS });
  } catch(e){
    console.warn('[rate_hit] ' + route + ' — ' + e.message.slice(0, 120));
    return true;
  }
  if (ok === false){
    const e = new Error('طلبات كثيرة في وقت قصير — انتظر دقائق ثم أعد المحاولة');
    e.status = 429; e.kind = 'rate';
    throw e;
  }
  return true;
}

function fail(res, e, tag){
  const err = e || {};
  const ours = !!(err.kind || err.status);
  const ref = crypto.randomBytes(3).toString('hex');
  console.error('[' + (tag || 'api') + '] ' + ref + ' ' + (err.stack || err.message || err));
  const status = (err.status >= 400 && err.status < 600) ? err.status : 500;
  return res.status(status).json({
    error: ours ? err.message : ('تعذّرت المعالجة — أرسل الرمز ' + ref + ' للدعم'),
    kind: err.kind || 'other',
    ref
  });
}

function safeEqual(a, b){
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  if (!x.length || x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

module.exports = { requireUser, rateLimit, fail, safeEqual };
