'use strict';
/* فحوص _lib/limits.js — بلا شبكة وبلا مفاتيح. */

const L = require('./limits.js');

let pass = 0, fail = 0; const failures = [];
const t = (n, fn) => Promise.resolve().then(() => { L._reset(); return fn(); })
  .then(() => { pass++; }, e => { fail++; failures.push(`${n} — ${e && e.message}`); });
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m || ''} توقّعنا ${JSON.stringify(b)} فجاء ${JSON.stringify(a)}`); };
const ok = (c, m) => { if (!c) throw new Error(m || 'شرط لم يتحقّق'); };

const hasBoth = () => true;
const P = [];

P.push(t('التبريد يبدأ وينتهي', () => {
  ok(!L.isCooling('gemini'));
  L.cool('gemini', 60, 'quota_minute');
  ok(L.isCooling('gemini'));
  L.cool('gemini', -5, 'x');            // مدّة غير صالحة لا تغيّر شيئًا
  ok(L.isCooling('gemini'));
}));

P.push(t('حصّة اليوم تبرّد ساعة، والدقيقة تحترم retryDelay', () => {
  L.coolFromError('gemini', { kind: 'quota_day' });
  eq(L.coolingInfo().gemini.why, 'quota_day');
  ok(L.coolingInfo().gemini.seconds > 3000, 'ساعة تقريبًا');

  L._reset();
  L.coolFromError('gemini', { kind: 'quota_minute', retryAfter: 27 });
  ok(L.coolingInfo().gemini.seconds <= 27, `توقّعنا ٢٧ ثانية فجاء ${L.coolingInfo().gemini.seconds}`);
}));

P.push(t('retryDelay مبالغ فيه يُقصّ', () => {
  L.coolFromError('gemini', { kind: 'quota_minute', retryAfter: 99999 });
  ok(L.coolingInfo().gemini.seconds <= 120, 'السقف دقيقتان');
}));

P.push(t('خطأ بلا تصنيف لا يبرّد أحدًا', () => {
  L.coolFromError('gemini', new Error('عطل شبكة'));
  eq(L.coolingInfo(), {});
}));

P.push(t('other لا يبرّد — قد يكون خطأ في طلبنا لا في المزوّد', () => {
  L.coolFromError('gemini', { kind: 'other' });
  eq(L.coolingInfo(), {});
}));

P.push(t('الترتيب يحترم اختيار المشرف ما لم يكن مبرَّدًا', () => {
  eq(L.preferOrder('gemini', 'anthropic', hasBoth), ['gemini', 'anthropic']);
  L.cool('gemini', 60, 'quota_day');
  eq(L.preferOrder('gemini', 'anthropic', hasBoth), ['anthropic', 'gemini'],
     'المبرَّد يتأخّر ولا يُحذف');
}));

P.push(t('المبرَّدان معًا: نجرّب بدل أن نستسلم', () => {
  L.cool('gemini', 60, 'quota_day');
  L.cool('anthropic', 60, 'overloaded');
  eq(L.preferOrder('gemini', 'anthropic', hasBoth).length, 2);
}));

P.push(t('مزوّد بلا مفتاح يسقط من الترتيب', () => {
  const only = p => p === 'anthropic';
  eq(L.preferOrder('gemini', 'anthropic', only), ['anthropic']);
}));

P.push(t('التزامن لا يتجاوز السقف', async () => {
  let live = 0, peak = 0;
  await L.runBatch([1, 2, 3, 4, 5, 6, 7, 8], async () => {
    live++; peak = Math.max(peak, live);
    await new Promise(r => setImmediate(r));
    live--;
  }, { concurrency: 3 });
  ok(peak <= 3, `الذروة ${peak}`);
}));

P.push(t('سقف الدقيقة ينتظر ولا يفشل', async () => {
  let clock = 1000;
  const now = () => clock;
  const sleep = async ms => { clock += ms; };
  const t0 = clock;
  const out = await L.runBatch([1, 2, 3], async () => 'ok',
    { concurrency: 1, rpm: 2, now, sleep });
  eq(out.filter(r => r.ok).length, 3, 'كلها نجحت');
  ok(clock - t0 >= 60000, `انتظر النافذة (${clock - t0}ms)`);
}));

P.push(t('فشل عنصر لا يُسقط الدفعة، والاستئناف ممكن', async () => {
  const out = await L.runBatch([1, 2, 3, 4], async n => {
    if (n === 3) { const e = new Error('حصّة'); e.kind = 'quota_day'; throw e; }
    return n * 2;
  }, { concurrency: 2 });
  eq(out.filter(r => r.ok).length, 3);
  eq(out[2].ok, false);
  eq(out[2].kind, 'quota_day', 'التصنيف يصل للمنادي ليقرّر');
  eq(out[0].value, 2);
}));

P.push(t('التقدّم يُبلَّغ بعد كل عنصر بالترتيب', async () => {
  const seen = [];
  await L.runBatch([1, 2, 3, 4, 5], async n => n,
    { concurrency: 2, onProgress: p => { seen.push(p.done); } });
  eq(seen, [1, 2, 3, 4, 5], 'عدّاد «٨٠ من ٣٠٠» يتصاعد بلا قفزات');
}));

P.push(t('دفعة فارغة لا تنهار', async () => {
  eq(await L.runBatch([], async () => 1, {}), []);
}));

Promise.all(P).then(() => {
  for (const f of failures) console.log('  ✗ ' + f);
  console.log(`\n${pass}/${pass + fail} ناجح`);
  process.exit(fail ? 1 : 0);
});
