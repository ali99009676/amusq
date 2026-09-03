'use strict';
/*
  فحص تكاملي لـ callAI بعد إضافة التبريد — بشبكة مزيّفة وبلا مفاتيح حقيقية.
  يختبر ما لا تختبره limits.test.js: أن المحوّل نفسه يتصرّف بالذاكرة الجديدة.

  تسلسليًا لا توازيًا: الحالات تتشارك global.fetch وذاكرة التبريد،
  والتوازي هنا يخلط حالةَ فحصٍ بفحص فيكذب النتيجة.
*/

const path = require('path');
const L = require(path.join(__dirname, 'limits.js'));

const CASES = [];
const t = (name, fn) => CASES.push([name, fn]);
const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(`${m || ''} توقّعنا ${JSON.stringify(b)} فجاء ${JSON.stringify(a)}`);
};
const ok = (c, m) => { if (!c) throw new Error(m || 'شرط لم يتحقّق'); };

// ————— شبكة مزيّفة —————
let calls = [];
function stubFetch(handler) {
  global.fetch = async (url) => {
    const who = String(url).includes('googleapis') ? 'gemini' : 'anthropic';
    calls.push(who);
    return handler(who);
  };
}
const okBody = who => ({
  ok: true, status: 200,
  json: async () => who === 'gemini'
    ? { candidates: [{ content: { parts: [{ text: '[{"i":1}]' }] } }], usageMetadata: {} }
    : { content: [{ text: '[{"i":1}]' }], usage: {} },
  text: async () => '',
});
const failBody = (status, body) => ({
  ok: false, status, text: async () => body, json: async () => ({}),
});

const QUOTA_DAY = JSON.stringify({ error: { code: 429, message: 'quota exceeded PerDay' } });

function setup() {
  L._reset();
  calls = [];
  process.env.GEMINI_API_KEY = 'g-fake';
  process.env.ANTHROPIC_API_KEY = 'a-fake';
  process.env.AI_PROVIDER = 'gemini';
  delete process.env.AI_MODEL;
  delete require.cache[require.resolve(path.join(__dirname, 'provider.js'))];
  return require(path.join(__dirname, 'provider.js'));
}

t('الحالة السليمة: المزوّد المختار يُنادى وحده', async () => {
  const { callAI } = setup();
  stubFetch(who => okBody(who));
  const r = await callAI('s', 'u');
  eq(calls, ['gemini']);
  eq(r.provider, 'gemini');
});

t('حصّة اليوم: يسقط على الثاني ثم يتذكّر', async () => {
  const { callAI } = setup();
  stubFetch(who => (who === 'gemini' ? failBody(429, QUOTA_DAY) : okBody(who)));

  const r1 = await callAI('s', 'u');
  eq(r1.provider, 'anthropic', 'السقوط عمل');
  eq(calls, ['gemini', 'anthropic']);

  // ★ جوهر الإضافة: النداء الثاني لا يطرق باب Gemini أصلًا
  calls = [];
  const r2 = await callAI('s', 'u');
  eq(r2.provider, 'anthropic');
  eq(calls, ['anthropic'], 'المبرَّد لم يُنادَ ثانيةً');
  eq(L.coolingInfo().gemini.why, 'quota_day');
});

t('عشرون سؤالًا: نداء ضائع واحد لا عشرون', async () => {
  const { callAI } = setup();
  stubFetch(who => (who === 'gemini' ? failBody(429, QUOTA_DAY) : okBody(who)));
  for (let i = 0; i < 20; i++) await callAI('s', 'u');
  const wasted = calls.filter(c => c === 'gemini').length;
  eq(wasted, 1, `أهدرنا ${wasted} نداءً على المبرَّد`);
  eq(calls.filter(c => c === 'anthropic').length, 20);
});

t('انقضاء التبريد يعيد المزوّد للخدمة', async () => {
  const { callAI } = setup();
  stubFetch(who => (who === 'gemini' ? failBody(429, QUOTA_DAY) : okBody(who)));
  await callAI('s', 'u');
  ok(L.coolingInfo().gemini, 'مبرَّد الآن');

  L._reset();                        // يحاكي انقضاء المدّة
  calls = [];
  stubFetch(who => okBody(who));
  const r = await callAI('s', 'u');
  eq(r.provider, 'gemini', 'رجع صاحب الأولوية');
});

t('عطل من عندنا لا يبرّد ولا يحوّل', async () => {
  const { callAI } = setup();
  // ٤٠٠ يصنَّف other: خطأ في طلبنا لا في المزوّد.
  // Gemini يعيد المحاولة مرة بلا حقل التفكير، فنداءان متوقّعان لا واحد.
  stubFetch(() => failBody(400, '{"error":{"message":"bad request"}}'));
  let threw = false;
  try { await callAI('s', 'u'); } catch (e) { threw = true; }
  ok(threw, 'رمى خطأ');
  eq(L.coolingInfo(), {}, 'لا تبريد على خطأ من عندنا');
  eq(calls.includes('anthropic'), false, 'لا تحويل على خطأ من عندنا');
});

t('سقوط المزوّدين معًا: رسالة عربية، والاثنان مبرَّدان', async () => {
  const { callAI } = setup();
  stubFetch(() => failBody(429, QUOTA_DAY));
  let msg = '';
  try { await callAI('s', 'u'); } catch (e) { msg = e.message; }
  ok(msg.length > 0, 'رسالة للطالب');
  ok(/حصّته اليومية/.test(msg), `الرسالة عربية مفهومة: ${msg}`);
  const info = L.coolingInfo();
  ok(info.gemini && info.anthropic, `الاثنان مبرَّدان: ${JSON.stringify(info)}`);
});

t('مزوّد واحد بمفتاح: لا يُختلق ثانٍ', async () => {
  const { callAI } = setup();
  delete process.env.ANTHROPIC_API_KEY;
  stubFetch(who => (who === 'gemini' ? failBody(429, QUOTA_DAY) : okBody(who)));
  let threw = false;
  try { await callAI('s', 'u'); } catch (e) { threw = true; }
  ok(threw);
  eq(calls.includes('anthropic'), false, 'لم يُنادَ مزوّد بلا مفتاح');
  process.env.ANTHROPIC_API_KEY = 'a-fake';
});

(async () => {
  let pass = 0, fail = 0; const failures = [];
  for (const [name, fn] of CASES) {
    try { await fn(); pass++; }
    catch (e) { fail++; failures.push(`${name} — ${e && e.message}`); }
  }
  for (const f of failures) console.log('  ✗ ' + f);
  console.log(`\n${pass}/${pass + fail} ناجح`);
  process.exit(fail ? 1 : 0);
})();
