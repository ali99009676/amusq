'use strict';

// فحص سريع لمفتاح Inception: هل يعمل، وكم يتأخّر، وما حدوده الحقيقية، وكيف عربيته.
//
// لماذا منفصل عن eval_providers: هذا يفحص الأنبوب لا الجودة —
// يُشغَّل مرة واحدة بعد إضافة أي مفتاح جديد، وقبل أي تقييم.
//
// التشغيل (المفتاح في الصدفة لا في ملف):
//   export INCEPTION_KEY='...'
//   node tools/smoke_inception.js
//
// المخرجات آمنة للمشاركة: المفتاح لا يُطبع ولا جزء منه.

const KEY = process.env.INCEPTION_KEY;
const BASE = process.env.INCEPTION_BASE_URL || 'https://api.inceptionlabs.ai/v1';
const MODEL = process.env.INCEPTION_MODEL || 'mercury-2';

if (!KEY) {
  console.error('INCEPTION_KEY غير موجود في البيئة. صدّره في الصدفة ولا تكتبه في ملف.');
  process.exit(2);
}

// ترويسات الحصّة والحدود تختلف تسميتها بين المزوّدين، فنطبع كل ما يشبهها
function quotaHeaders(res) {
  const out = {};
  res.headers.forEach((v, k) => {
    if (/ratelimit|retry-after|quota|credit|token/i.test(k)) out[k] = v;
  });
  return out;
}

async function ask(user, maxTokens) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: user }],
      max_tokens: maxTokens,
    }),
  });
  const ms = Date.now() - t0;
  let body = null;
  try { body = await res.json(); } catch { /* رد غير JSON */ }
  return { status: res.status, ms, body, headers: quotaHeaders(res) };
}

function text(body) {
  const c = body && body.choices && body.choices[0];
  return (c && c.message && c.message.content || '').trim();
}

(async () => {
  console.log(`النموذج: ${MODEL}\nالعنوان: ${BASE}\n`);

  // ١) اتصال ومصادقة
  const ping = await ask('Reply with the single word: ok', 8);
  console.log(`١) الاتصال: ${ping.status} · ${ping.ms}ms · "${text(ping.body)}"`);
  if (ping.status === 401) return console.error('   المفتاح مرفوض. تحقّق أنك نسخت الجديد كاملًا.');
  if (ping.status !== 200) return console.error('   الرد:', JSON.stringify(ping.body).slice(0, 300));
  if (Object.keys(ping.headers).length) console.log('   الحدود:', ping.headers);
  else console.log('   الحدود: لا ترويسات حصّة — الرصيد يُتابَع من اللوحة فقط');

  // ٢) العربية — السؤال الحاسم الذي لم أجد له جوابًا منشورًا
  const ar = await ask(
    'Translate into Modern Standard Arabic. Output only the translation.\n\n' +
    'Which of the following is the primary mechanism of action of beta-blockers in the treatment of hypertension?',
    400
  );
  console.log(`\n٢) العربية: ${ar.status} · ${ar.ms}ms`);
  console.log('   ' + text(ar.body));

  // ٣) الحدود الحقيقية: ثمانية طلبات متوازية تكشف سقف التزامن
  console.log('\n٣) ثمانية طلبات متوازية:');
  const t0 = Date.now();
  const burst = await Promise.all(
    new Array(8).fill(0).map(() => ask('Reply with: ok', 8).catch(e => ({ status: 'ERR', ms: 0, err: e.message })))
  );
  const codes = {};
  for (const r of burst) codes[r.status] = (codes[r.status] || 0) + 1;
  const times = burst.filter(r => r.ms).map(r => r.ms);
  console.log('   الحالات:', codes);
  console.log(`   الزمن الكلي ${Date.now() - t0}ms · أبطأ طلب ${Math.max(...times)}ms`);
  const limited = burst.find(r => r.status === 429);
  if (limited) console.log('   ٤٢٩ ظهر — أنزل INCEPTION_CONCURRENCY، وRetry-After:', limited.headers['retry-after']);
  else console.log('   لا ٤٢٩ — التزامن ٨ آمن، ويمكن رفع INCEPTION_CONCURRENCY');

  console.log('\nالخلاصة صالحة للنسخ واللصق — لا مفتاح فيها.');
})().catch(e => { console.error('فشل الفحص:', e.message); process.exit(1); });
