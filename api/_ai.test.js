'use strict';

// فحوص طبقة المزوّدين — بلا شبكة حقيقية وبلا مفاتيح.
// لماذا ساعة مزيّفة: اختبار حدّ الطلبات في الدقيقة والتبريد لا يجوز أن يأخذ دقيقة حقيقية.

const { createAI, readProviders, buildRequest, readReply } = require('./_ai.js');

let pass = 0, fail = 0;
const failures = [];
function t(name, fn) {
  return Promise.resolve().then(fn).then(
    () => { pass++; },
    e => { fail++; failures.push(`${name} — ${e && e.message}`); }
  );
}
function eq(a, b, m) {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error(`${m || ''} توقّعنا ${B} فجاء ${A}`);
}
function ok(c, m) { if (!c) throw new Error(m || 'شرط لم يتحقّق'); }

// ————— بيئة وأدوات مزيّفة —————
const ENV = {
  AI_PROVIDERS: 'amd,paid',
  AMD_BASE_URL: 'https://developer.amd.com.cn/radeon/api/v1',
  AMD_KEY: 'rc-fake', AMD_MODEL: 'DeepSeek-V4-Flash',
  AMD_RPM: '20', AMD_CONCURRENCY: '8', AMD_COST: '0',
  PAID_BASE_URL: 'https://api.example.com/v1',
  PAID_KEY: 'sk-fake', PAID_MODEL: 'paid-model',
  PAID_RPM: '60', PAID_CONCURRENCY: '8', PAID_COST: '1',
};

function clock() {
  let t = 1000;
  return { now: () => t, sleep: async ms => { t += ms; }, jump: ms => { t += ms; } };
}
function res(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: k => (headers[k] !== undefined ? String(headers[k]) : null) },
    json: async () => body,
  };
}
const OKBODY = { choices: [{ message: { content: 'مرحبا' } }] };

function spyFetch(handler) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return handler(url, init, calls.length);
  };
  f.calls = calls;
  return f;
}

const P = [];

// ١) قراءة المزوّدين، وتجاهل الناقص
P.push(t('قراءة المزوّدين', () => {
  const list = readProviders({ ...ENV, AI_PROVIDERS: 'amd,paid,ghost' });
  eq(list.map(p => p.id), ['amd', 'paid'], 'المزوّد الناقص يُتجاهل');
  eq(list[0].rpm, 20);
}));

// ٢) شكل openai يُبنى صحيحًا مع Bearer
P.push(t('بناء طلب openai', () => {
  const cfg = readProviders(ENV)[0];
  const r = buildRequest(cfg, { system: 'س', user: 'ص', maxTokens: 10 });
  ok(r.url.endsWith('/chat/completions'), 'المسار');
  eq(r.headers.Authorization, 'Bearer rc-fake');
  eq(r.body.messages.length, 2);
}));

// ٣) شكل anthropic يُبنى ويُقرأ صحيحًا
P.push(t('شكل anthropic', () => {
  const cfg = readProviders({ ...ENV, AMD_SHAPE: 'anthropic' })[0];
  const r = buildRequest(cfg, { system: 'س', user: 'ص' });
  ok(r.url.endsWith('/messages'), 'مسار الرسائل');
  eq(r.headers['x-api-key'], 'rc-fake');
  eq(r.body.system, 'س');
  eq(readReply('anthropic', { content: [{ type: 'text', text: 'أ' }, { type: 'text', text: 'ب' }] }), 'أب');
}));

// ٤) التناوب الحقيقي بين المزوّدين
P.push(t('التناوب يوزّع بالتساوي', async () => {
  const c = clock();
  const f = spyFetch(() => res(200, OKBODY));
  const ai = createAI({ env: { ...ENV, AI_POLICY: 'roundrobin' }, fetchImpl: f, ...c });
  const used = [];
  for (let i = 0; i < 4; i++) used.push((await ai.call('derive', { user: 'x' })).provider);
  eq(used, ['amd', 'paid', 'amd', 'paid'], 'التناوب');
}));

// ٥) سياسة الأرخص أولًا
P.push(t('سياسة cheap تبدأ بالمجاني', async () => {
  const c = clock();
  const f = spyFetch(() => res(200, OKBODY));
  const ai = createAI({ env: { ...ENV, AI_PROVIDERS: 'paid,amd', AI_POLICY: 'cheap' }, fetchImpl: f, ...c });
  eq((await ai.call('derive', { user: 'x' })).provider, 'amd');
}));

// ٦) الأدوار تحصر المهمة في مزوّد بعينه
P.push(t('الأدوار: الاستنتاج للمدفوع', async () => {
  const c = clock();
  const f = spyFetch(() => res(200, OKBODY));
  const ai = createAI({
    env: { ...ENV, AI_POLICY: 'roundrobin', AMD_ROLES: 'translate,distractors' },
    fetchImpl: f, ...c,
  });
  eq((await ai.call('derive', { user: 'x' })).provider, 'paid');
  eq((await ai.call('derive', { user: 'x' })).provider, 'paid');
  ok(['amd', 'paid'].includes((await ai.call('translate', { user: 'x' })).provider), 'الترجمة مسموحة للاثنين');
}));

// ٧) ٤٢٩ على المجاني ينتقل للمدفوع في نفس الطلب بلا فشل
P.push(t('٤٢٩ يسقط على المدفوع', async () => {
  const c = clock();
  const f = spyFetch(url => url.includes('amd.com.cn')
    ? res(429, { detail: { error: { message: 'rate' } } }, { 'Retry-After': 60 })
    : res(200, OKBODY));
  const ai = createAI({ env: { ...ENV, AI_POLICY: 'failover' }, fetchImpl: f, ...c });
  const r = await ai.call('derive', { user: 'x' });
  eq(r.provider, 'paid', 'التحويل');
  eq(f.calls.length, 2, 'نداءان لا أكثر');
}));

// ٨) المزوّد المبرَّد لا يُنادى قبل انتهاء مدته
P.push(t('التبريد يُحترم', async () => {
  const c = clock();
  const f = spyFetch(url => url.includes('amd.com.cn')
    ? res(429, {}, { 'Retry-After': 60 })
    : res(200, OKBODY));
  const ai = createAI({ env: { ...ENV, AI_POLICY: 'roundrobin' }, fetchImpl: f, ...c });
  await ai.call('derive', { user: 'x' });
  const before = f.calls.length;
  await ai.call('derive', { user: 'x' });
  await ai.call('derive', { user: 'x' });
  const amdCalls = f.calls.filter(x => x.url.includes('amd.com.cn')).length;
  eq(amdCalls, 1, 'لم يُنادَ المبرَّد ثانية');
  ok(f.calls.length > before, 'المدفوع استمر');
}));

// ٩) انتهاء التبريد يعيد المزوّد للخدمة
P.push(t('عودة المزوّد بعد التبريد', async () => {
  const c = clock();
  let hard = true;
  const f = spyFetch(url => (url.includes('amd.com.cn') && hard)
    ? res(429, {}, { 'Retry-After': 60 })
    : res(200, OKBODY));
  const ai = createAI({ env: { ...ENV, AI_POLICY: 'failover' }, fetchImpl: f, ...c });
  await ai.call('derive', { user: 'x' });
  hard = false;
  c.jump(61000);
  eq((await ai.call('derive', { user: 'x' })).provider, 'amd', 'رجع بعد انقضاء المدة');
}));

// ١٠) سقف الإنفاق يبرّد المزوّد بالمدة القادمة من الترويسة
P.push(t('سقف الإنفاق', async () => {
  const c = clock();
  const f = spyFetch(url => url.includes('amd.com.cn')
    ? res(429, { error: { message: 'Daily usage limit exceeded' } }, { 'Retry-After': 3600 })
    : res(200, OKBODY));
  const ai = createAI({ env: { ...ENV, AI_POLICY: 'failover' }, fetchImpl: f, ...c });
  await ai.call('derive', { user: 'x' });
  c.jump(120000); // بعد دقيقتين ما زال مبرَّدًا
  await ai.call('derive', { user: 'x' });
  eq(f.calls.filter(x => x.url.includes('amd.com.cn')).length, 1);
  eq(ai.stats().find(s => s.id === 'amd').reason, 'rate-limit');
}));

// ١١) ٤٠٠ لا يُعاد ولا يُحوَّل — يفشل بنفس الشكل عند الجميع
P.push(t('٤٠٠ يتوقّف فورًا', async () => {
  const c = clock();
  const f = spyFetch(() => res(400, { error: { message: 'bad body' } }));
  const ai = createAI({ env: { ...ENV, AI_POLICY: 'failover' }, fetchImpl: f, ...c });
  let threw = false;
  try { await ai.call('derive', { user: 'x' }); } catch (e) { threw = true; ok(/400/.test(e.message)); }
  ok(threw, 'رمى خطأ');
  eq(f.calls.length, 1, 'نداء واحد بلا تحويل');
}));

// ١٢) ٤٠١ يبرّد المفتاح ويحوّل
P.push(t('٤٠١ يحوّل', async () => {
  const c = clock();
  const f = spyFetch(url => url.includes('amd.com.cn') ? res(401, {}) : res(200, OKBODY));
  const ai = createAI({ env: { ...ENV, AI_POLICY: 'failover' }, fetchImpl: f, ...c });
  eq((await ai.call('derive', { user: 'x' })).provider, 'paid');
}));

// ١٣) عطل الشبكة يُعامل كتبريد لا كفشل نهائي
P.push(t('عطل الشبكة يحوّل', async () => {
  const c = clock();
  const f = spyFetch(url => {
    if (url.includes('amd.com.cn')) throw new Error('ECONNRESET');
    return res(200, OKBODY);
  });
  const ai = createAI({ env: { ...ENV, AI_POLICY: 'failover' }, fetchImpl: f, ...c });
  eq((await ai.call('derive', { user: 'x' })).provider, 'paid');
}));

// ١٤) حدّ الطلبات في الدقيقة يُحترم بالانتظار لا بالفشل
P.push(t('حدّ الدقيقة', async () => {
  const c = clock();
  const f = spyFetch(() => res(200, OKBODY));
  const ai = createAI({
    env: { ...ENV, AI_PROVIDERS: 'amd', AMD_RPM: '2', AMD_CONCURRENCY: '1', AI_POLICY: 'failover' },
    fetchImpl: f, ...c,
  });
  const t0 = c.now();
  await ai.call('derive', { user: 'x' });
  await ai.call('derive', { user: 'x' });
  await ai.call('derive', { user: 'x' });
  ok(c.now() - t0 >= 60000, `انتظر النافذة (${c.now() - t0}ms)`);
  eq(f.calls.length, 3, 'كلها نجحت');
}));

// ١٥) التزامن لا يتجاوز السقف
P.push(t('سقف التزامن', async () => {
  const c = clock();
  let live = 0, peak = 0;
  const f = spyFetch(async () => {
    live++; peak = Math.max(peak, live);
    await new Promise(r => setImmediate(r));
    live--;
    return res(200, OKBODY);
  });
  const ai = createAI({
    env: { ...ENV, AI_PROVIDERS: 'amd', AMD_CONCURRENCY: '2', AMD_RPM: '100' },
    fetchImpl: f, ...c,
  });
  await Promise.all(new Array(8).fill(0).map(() => ai.call('derive', { user: 'x' })));
  ok(peak <= 2, `الذروة ${peak} تجاوزت السقف`);
}));

// ١٦) runAll يوزّع ويبلّغ بالتقدّم بعد كل عنصر
P.push(t('runAll والتقدّم', async () => {
  const c = clock();
  const f = spyFetch(() => res(200, OKBODY));
  const ai = createAI({ env: { ...ENV, AI_POLICY: 'roundrobin' }, fetchImpl: f, ...c });
  const jobs = new Array(10).fill(0).map((_, i) => ({ task: 'derive', user: `س${i}` }));
  const seen = [];
  const out = await ai.runAll(jobs, { onProgress: p => { seen.push(p.done); } });
  eq(out.length, 10);
  ok(out.every(r => r.ok), 'كلها نجحت');
  eq(seen.length, 10, 'بلاغ بعد كل عنصر');
  eq(seen[seen.length - 1], 10, 'العدّاد يصل للنهاية');
  const byProv = {};
  for (const r of out) byProv[r.provider] = (byProv[r.provider] || 0) + 1;
  ok(byProv.amd > 0 && byProv.paid > 0, 'استُعمل المزوّدان');
}));

// ١٧) فشل عنصر واحد لا يُسقط الدفعة كلها
P.push(t('فشل جزئي لا يوقف الرفع', async () => {
  const c = clock();
  const f = spyFetch((url, init) => JSON.parse(init.body).messages.some(m => /س3/.test(m.content))
    ? res(400, { error: { message: 'bad' } })
    : res(200, OKBODY));
  const ai = createAI({ env: ENV, fetchImpl: f, ...c });
  const jobs = new Array(6).fill(0).map((_, i) => ({ task: 'derive', user: `س${i}` }));
  const out = await ai.runAll(jobs);
  eq(out.filter(r => r.ok).length, 5);
  eq(out.filter(r => !r.ok).length, 1);
}));

// ١٨) لا يظهر أي مفتاح سرّي في رسائل الخطأ أو في stats
P.push(t('لا تسريب مفاتيح', async () => {
  const c = clock();
  const f = spyFetch(() => res(500, { error: { message: 'boom' } }, { 'Retry-After': 1 }));
  const ai = createAI({ env: ENV, fetchImpl: f, ...c });
  let msg = '';
  try { await ai.call('derive', { user: 'x' }); } catch (e) { msg = e.message; }
  ok(!/rc-fake|sk-fake/.test(msg), 'الخطأ نظيف');
  ok(!/rc-fake|sk-fake/.test(JSON.stringify(ai.stats())), 'stats نظيف');
}));

// ١٩) بلا مزوّد مُعرَّف: خطأ عربي واضح لا انهيار غامض
P.push(t('بلا مزوّد', async () => {
  const ai = createAI({ env: { AI_PROVIDERS: '' }, fetchImpl: spyFetch(() => res(200, OKBODY)), ...clock() });
  let msg = '';
  try { await ai.call('derive', { user: 'x' }); } catch (e) { msg = e.message; }
  ok(/لا مزوّد/.test(msg), msg);
}));

// ٢٠) سقوط الجميع: خطأ يذكر السبب ولا يعلّق
P.push(t('سقوط الجميع', async () => {
  const c = clock();
  const f = spyFetch(() => res(429, {}, { 'Retry-After': 60 }));
  const ai = createAI({ env: ENV, fetchImpl: f, ...c });
  let msg = '';
  try { await ai.call('derive', { user: 'x' }); } catch (e) { msg = e.message; }
  ok(/كل المزوّدين/.test(msg), msg);
  ok(/429/.test(msg), 'يذكر السبب');
}));

// ٢١) ترويسة رصيد صفرية تبرّد المزوّد استباقيًا قبل أن يبدأ الرفض
P.push(t('رصيد صفر يبرّد استباقيًا', async () => {
  const c = clock();
  const f = spyFetch(url => url.includes('amd.com.cn')
    ? res(200, OKBODY, { 'X-RateLimit-Remaining-User-Daily-USD': '0' })
    : res(200, OKBODY));
  const ai = createAI({ env: { ...ENV, AI_POLICY: 'failover' }, fetchImpl: f, ...c });
  eq((await ai.call('derive', { user: 'x' })).provider, 'amd', 'الطلب الأول ينجح');
  eq((await ai.call('derive', { user: 'x' })).provider, 'paid', 'ثم يتحوّل بلا انتظار رفض');
}));

// ٢٢) انحدار: غياب الترويسة ليس رصيدًا صفريًا
P.push(t('غياب ترويسة الرصيد لا يبرّد', async () => {
  const c = clock();
  const f = spyFetch(() => res(200, OKBODY)); // بلا أي ترويسة
  const ai = createAI({ env: { ...ENV, AI_POLICY: 'failover' }, fetchImpl: f, ...c });
  eq((await ai.call('derive', { user: 'x' })).provider, 'amd');
  eq((await ai.call('derive', { user: 'x' })).provider, 'amd', 'ما زال يعمل');
  ok(!ai.stats().find(s => s.id === 'amd').cooling, 'غير مبرَّد');
}));

// ٢٣) KEY_ENV يقرأ المفتاح من متغيّر قائم بلا تكرار السرّ
P.push(t('KEY_ENV يشير إلى مفتاح قائم', () => {
  const list = readProviders({
    AI_PROVIDERS: 'paid',
    ANTHROPIC_API_KEY: 'sk-real',
    PAID_KEY_ENV: 'ANTHROPIC_API_KEY',
    PAID_BASE_URL: 'https://api.anthropic.com/v1',
    PAID_MODEL: 'm', PAID_SHAPE: 'anthropic',
  });
  eq(list.length, 1);
  eq(list[0].key, 'sk-real');
  eq(list[0].auth, 'x-api-key', 'شكل anthropic يختار الترويسة الصحيحة');
}));

// ٢٤) KEY_ENV يشير إلى متغيّر غير موجود ← يُسقط المزوّد بدل استعمال مفتاح خاطئ
P.push(t('KEY_ENV معطوب يُسقط المزوّد', () => {
  const list = readProviders({
    AI_PROVIDERS: 'paid',
    PAID_KEY: 'sk-wrong',              // موجود، لكن KEY_ENV هو المرجع
    PAID_KEY_ENV: 'DOES_NOT_EXIST',
    PAID_BASE_URL: 'https://x/v1', PAID_MODEL: 'm',
  });
  eq(list.length, 0, 'لا يسقط على المفتاح المباشر خلسة');
}));

Promise.all(P).then(() => {
  const total = pass + fail;
  for (const f of failures) console.log('  ✗ ' + f);
  console.log(`\n${pass}/${total} ناجح`);
  process.exit(fail ? 1 : 0);
});
