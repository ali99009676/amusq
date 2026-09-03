'use strict';
/*
  حدود وتبريد — ذاكرة قصيرة للمحوّل.

  ★ ما ينقص provider.js اليوم:
  السقوط عنده يعمل، لكنه بلا ذاكرة. لو نفدت حصّة Gemini اليومية في السؤال
  العاشر من دفعةِ ثلاثمئة، فكل سؤال بعده يجرّب Gemini أولًا، ويفشل، ثم
  ينتقل. تسعون طلبًا ضائعًا وتسعون تأخيرًا لا سبب لها، وطالبٌ ينتظر.
  هذا الملف يجعل المحوّل يتذكّر: «Gemini خارج الخدمة إلى الغد» فيتخطّاه.

  ★ والثاني: لا سقف طلبات ولا تزامن. الرفع اليوم يرمي الطلبات ويلتقط ٤٢٩.
  سيمافورٌ عندنا أرخص من ٤٢٩ عندهم، وأسرع من دورة إعادة محاولة.

  الحالة في الذاكرة لا في قاعدة البيانات: نسخة Vercel الدافئة تحتفظ بها
  طوال الرفع، وهو المدى الذي يهمّ. نسخة باردة جديدة تبدأ نظيفة — وهذا
  مقبول: أسوأ ما يحدث أنها تدفع طلبًا فاشلًا واحدًا فتتعلّم من جديد.
  لا نُعقّد بجدولٍ من أجل طلبٍ واحد.
*/

const MINUTE = 60000;

/* ═══ التبريد ═══ */
const cooling = Object.create(null);   // provider -> { until, why }

function cool(provider, seconds, why) {
  if (!provider || !(seconds > 0)) return;
  cooling[provider] = { until: Date.now() + seconds * 1000, why: why || 'unknown' };
}

function isCooling(provider) {
  const c = cooling[provider];
  if (!c) return false;
  if (Date.now() >= c.until) { delete cooling[provider]; return false; }
  return true;
}

function coolingInfo() {
  const now = Date.now();
  const out = {};
  for (const [p, c] of Object.entries(cooling)) {
    if (c.until > now) out[p] = { seconds: Math.ceil((c.until - now) / 1000), why: c.why };
  }
  return out;
}

/*
  مدّة التبريد من تصنيف الخطأ نفسه الذي يحسبه provider.js.
  · quota_day    — إلى الغد فعليًا. ساعة كافية: أقصر من أن نُجمّد مزوّدًا
                   عاد إلى الخدمة، وأطول من أن نُغرقه بمحاولات عبثية.
  · quota_minute — ما تقوله Google في retryDelay، وإلا دقيقة.
  · overloaded   — نصف دقيقة، فالازدحام يمرّ.
  · auth         — مفتاح مرفوض لا يُصلحه انتظار؛ عشر دقائق تكفي لئلا نطرق
                   بابًا مغلقًا في كل سؤال، وتسمح بالتقاط تدويرِ مفتاحٍ جديد.
*/
const COOL_SECONDS = { quota_day: 3600, quota_minute: 60, overloaded: 30, auth: 600 };

function coolFromError(provider, err) {
  if (!err || !err.kind) return;
  const base = COOL_SECONDS[err.kind];
  if (!base) return;
  const secs = err.kind === 'quota_minute' && err.retryAfter
    ? Math.min(err.retryAfter, 120)
    : base;
  cool(provider, secs, err.kind);
}

/*
  ترتيب المزوّدَين مع احترام التبريد.
  المفضَّل يبقى أولًا ما لم يكن مبرَّدًا والبديل متاحًا — قرار المشرف
  لا يُنقض إلا بسبب.
*/
function preferOrder(primary, secondary, hasKey) {
  const order = [primary, secondary].filter(Boolean);
  const usable = order.filter(p => (hasKey ? hasKey(p) : true));
  if (!usable.length) return order;
  const warm = usable.filter(p => !isCooling(p));
  return warm.length ? warm.concat(usable.filter(p => isCooling(p))) : usable;
}

/* ═══ التزامن ═══ */
class Sem {
  constructor(n) { this.free = Math.max(1, n | 0); this.q = []; }
  async acquire() {
    if (this.free > 0) { this.free--; return; }
    await new Promise(r => this.q.push(r));
  }
  release() { const r = this.q.shift(); if (r) r(); else this.free++; }
}

/* ═══ سقف الطلبات في الدقيقة — نافذة منزلقة ═══ */
class Window {
  constructor(rpm, now) { this.rpm = rpm | 0; this.now = now || Date.now; this.hits = []; }
  waitMs() {
    if (!(this.rpm > 0)) return 0;
    const t = this.now();
    this.hits = this.hits.filter(x => t - x < MINUTE);
    if (this.hits.length < this.rpm) return 0;
    return MINUTE - (t - this.hits[0]) + 1;
  }
  take() { this.hits.push(this.now()); }
}

/*
  تشغيل دفعة مع سقف تزامن وسقف دقيقة.
  onProgress يُنادى بعد كل عنصر — عليه يقوم حفظ المسوّدة وشريط «٨٠ من ٣٠٠».
  عنصرٌ يفشل لا يُسقط الدفعة: يُسجَّل خطؤه ويُكمل الباقي، فالرفع قابل للاستئناف.
*/
async function runBatch(items, worker, opts) {
  opts = opts || {};
  const sem = new Sem(opts.concurrency || 4);
  const win = new Window(opts.rpm || 0, opts.now);
  const sleep = opts.sleep || (ms => new Promise(r => setTimeout(r, ms)));
  const out = new Array(items.length);
  let done = 0;

  await Promise.all(items.map(async (item, i) => {
    await sem.acquire();
    try {
      const wait = win.waitMs();
      if (wait > 0) await sleep(wait);
      win.take();
      out[i] = { ok: true, value: await worker(item, i) };
    } catch (e) {
      out[i] = { ok: false, error: (e && e.message) || String(e), kind: e && e.kind };
    } finally {
      sem.release();
    }
    done++;
    if (opts.onProgress) await opts.onProgress({ done, total: items.length, index: i, result: out[i] });
  }));

  return out;
}

/* للفحوص فقط — يمسح حالة التبريد بين الحالات */
function _reset() { for (const k of Object.keys(cooling)) delete cooling[k]; }

module.exports = {
  cool, isCooling, coolingInfo, coolFromError, preferOrder,
  runBatch, Sem, Window, COOL_SECONDS, _reset,
};
