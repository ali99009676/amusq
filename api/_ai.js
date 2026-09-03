'use strict';

// طبقة مزوّدي الذكاء — مسؤوليتها الوحيدة: إيصال نصّ إلى نموذج وإرجاع نصّ.
//
// لماذا طبقة مستقلة بدل نداء مباشر من خط المحتوى:
// النقطة المجانية (AMD Radeon Cloud) مربوطة ببرنامج مؤقّت وسقف إنفاق دوّار،
// فلا نريد اسمها ولا شكل ردّها ولا حدودها أن تتسرّب إلى بقية الكود.
// التبديل والتناوب يصيران متغيّر بيئة، لا تعديل كود.
//
// لماذا القراءة من البيئة فقط: القاعدة ٢ — لا مفتاح سرّي خارج الخادم.
// لماذا بلا مكتبات: قيد المشروع، و fetch أصلًا داخل Node على Vercel.
//
// تنبيه على قاعدة القداسة: هذه الطبقة تنقل نصًّا فقط ولا تعرف شيئًا عن الأسئلة.
// إعادة نصّ الدكتور الأصلي مكان ما كتبه النموذج مسؤولية خط المحتوى بعد النداء.

const MINUTE = 60000;

// ————— قراءة المزوّدين من البيئة —————
// AI_PROVIDERS=amd,paid  ثم لكل مزوّد AMD_KEY و AMD_BASE_URL و AMD_MODEL ...
function readProviders(env) {
  const ids = String(env.AI_PROVIDERS || '').split(',').map(s => s.trim()).filter(Boolean);
  const out = [];
  for (const id of ids) {
    const P = id.toUpperCase();
    // KEY_ENV يشير إلى اسم متغيّر بيئة آخر يحمل المفتاح.
    // لماذا: مفاتيح موجودة أصلًا (ANTHROPIC_API_KEY مثلًا) تُستعمل كما هي،
    // فلا يُنسخ السرّ في مكانين ولا يُنسى أحدهما عند التدوير.
    const keyEnv = env[`${P}_KEY_ENV`];
    const key = keyEnv ? env[keyEnv] : env[`${P}_KEY`];
    const baseUrl = env[`${P}_BASE_URL`];
    const model = env[`${P}_MODEL`];
    // مزوّد ناقص يُتجاهل بصمت: نقص مفتاح احتياطي لا يجوز أن يُسقط الرفع كلّه
    if (!key || !baseUrl || !model) continue;
    const shape = (env[`${P}_SHAPE`] || 'openai').toLowerCase();
    out.push({
      id,
      key,
      model,
      shape,
      baseUrl: baseUrl.replace(/\/+$/, ''),
      auth: (env[`${P}_AUTH`] || (shape === 'anthropic' ? 'x-api-key' : 'bearer')).toLowerCase(),
      rpm: Number(env[`${P}_RPM`] || 20),
      concurrency: Number(env[`${P}_CONCURRENCY`] || 4),
      // أدوار المزوّد: فارغ = يقبل كل المهام. مثال AMD_ROLES=translate,distractors
      roles: String(env[`${P}_ROLES`] || '').split(',').map(s => s.trim()).filter(Boolean),
      cost: Number(env[`${P}_COST`] || 0), // ٠ = مجاني، يُستعمل في سياسة cheap
    });
  }
  return out;
}

// ————— نافذة منزلقة لحدّ الطلبات في الدقيقة —————
class Window {
  constructor(rpm, now) { this.rpm = rpm; this.now = now; this.hits = []; }
  waitMs() {
    const t = this.now();
    this.hits = this.hits.filter(x => t - x < MINUTE);
    if (this.hits.length < this.rpm) return 0;
    return MINUTE - (t - this.hits[0]) + 1;
  }
  take() { this.hits.push(this.now()); }
}

// ————— سيمافور للتزامن —————
// لماذا سقف من عندنا بدل التقاط ٤٢٩: أرخص وأسرع من دورة إعادة محاولة
class Sem {
  constructor(n) { this.free = n; this.q = []; }
  async acquire() {
    if (this.free > 0) { this.free--; return; }
    await new Promise(r => this.q.push(r));
  }
  release() {
    const r = this.q.shift();
    if (r) r(); else this.free++;
  }
}

// ————— بناء الطلب وقراءة الرد حسب شكل المزوّد —————
function buildRequest(cfg, { system, user, maxTokens, temperature, pdfBase64 }) {
  const headers = { 'Content-Type': 'application/json' };
  if (cfg.auth === 'bearer') headers['Authorization'] = `Bearer ${cfg.key}`;
  else headers['x-api-key'] = cfg.key;

  if (cfg.shape === 'anthropic') {
    headers['anthropic-version'] = '2023-06-01';
    // الصفحة تُرسل كمستند لا كنصّ مستخرج.
    // لماذا: pdftotext يُسقط أرقامًا ويقلب ترتيب الخيارات في العربية،
    // فيكسر قاعدة القداسة قبل أن يرى النموذجُ النصَّ أصلًا.
    const content = pdfBase64
      ? [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
          { type: 'text', text: user },
        ]
      : user;
    return {
      url: `${cfg.baseUrl}/messages`,
      headers,
      body: {
        model: cfg.model,
        max_tokens: maxTokens || 2048,
        ...(system ? { system } : {}),
        messages: [{ role: 'user', content }],
        ...(temperature == null ? {} : { temperature }),
      },
    };
  }
  if (pdfBase64) {
    // مزوّدو الشكل النصّي لا يستقبلون مستندات — نفشل صراحةً بدل إرسال طلب أعمى
    const e = new Error(`${cfg.id}: هذا المزوّد لا يقبل مستندات (shape=${cfg.shape})`);
    e.fatal = true;
    throw e;
  }
  return {
    url: `${cfg.baseUrl}/chat/completions`,
    headers,
    body: {
      model: cfg.model,
      max_tokens: maxTokens || 2048,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content: user },
      ],
      ...(temperature == null ? {} : { temperature }),
    },
  };
}

function readReply(shape, json) {
  if (shape === 'anthropic') {
    const blocks = Array.isArray(json && json.content) ? json.content : [];
    return blocks.filter(b => b && b.type === 'text').map(b => b.text).join('');
  }
  const c = json && json.choices && json.choices[0];
  return (c && c.message && c.message.content) || '';
}

// رسالة الخطأ تختلف بين طبقتي AMD: المنصّة تلفّها في detail، والبوّابة لا
function readError(json) {
  const e = (json && json.error) || (json && json.detail && json.detail.error) || {};
  return String(e.message || '');
}

// ————— المصنع —————
function createAI({ env, fetchImpl, sleep, now } = {}) {
  env = env || process.env;
  const _fetch = fetchImpl || globalThis.fetch;
  const _now = now || (() => Date.now());
  const _sleep = sleep || (ms => new Promise(r => setTimeout(r, ms)));

  const states = readProviders(env).map(cfg => ({
    cfg,
    win: new Window(cfg.rpm, _now),
    sem: new Sem(cfg.concurrency),
    coolUntil: 0,   // مبرَّد إلى هذا الوقت بعد ٤٢٩ أو عطل
    calls: 0,
  }));

  const policy = String(env.AI_POLICY || 'roundrobin').toLowerCase();
  let turn = 0;

  // ترتيب المرشّحين لهذه المهمة. الأدوار تصفية فوق أي سياسة.
  function order(task) {
    const fit = states.filter(s => s.cfg.roles.length === 0 || s.cfg.roles.includes(task));
    const pool = fit.length ? fit : states; // لا نترك المهمة بلا مزوّد لمجرد خطأ إعداد
    if (policy === 'cheap') return [...pool].sort((a, b) => a.cfg.cost - b.cfg.cost);
    if (policy === 'roundrobin') {
      const k = pool.length ? (turn++ % pool.length) : 0;
      return pool.slice(k).concat(pool.slice(0, k));
    }
    return pool; // failover: الترتيب المعلن في AI_PROVIDERS
  }

  function cool(st, ms, why) {
    st.coolUntil = _now() + ms;
    st.lastReason = why;
  }

  async function once(st, payload) {
    const cfg = st.cfg;
    await st.sem.acquire();
    try {
      const wait = st.win.waitMs();
      if (wait > 0) await _sleep(wait);
      st.win.take();
      st.calls++;

      const req = buildRequest(cfg, payload);
      const res = await _fetch(req.url, {
        method: 'POST',
        headers: req.headers,
        body: JSON.stringify(req.body),
      });

      // الرصيد يصل في ترويسة كل رد ناجح، فنعرف قرب نفاده بلا استطلاع
      // غياب الترويسة ليس رصيدًا صفريًا — Number(null) يساوي صفرًا فيجب التحقّق أولًا
      const leftRaw = res.headers && res.headers.get ? res.headers.get('X-RateLimit-Remaining-User-Daily-USD') : null;
      if (leftRaw !== null && leftRaw !== undefined && leftRaw !== '') {
        const left = Number(leftRaw);
        if (Number.isFinite(left) && left <= 0) cool(st, 5 * MINUTE, 'spend-cap');
      }

      if (res.ok) {
        const json = await res.json();
        const text = readReply(cfg.shape, json);
        return { ok: true, text, provider: cfg.id };
      }

      const json = await res.json().catch(() => ({}));
      const msg = readError(json);
      const retryAfter = Number(res.headers && res.headers.get && res.headers.get('Retry-After'));
      const secs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 60;

      if (res.status === 429) {
        // سقف الإنفاق يعطي Retry-After طويلًا، وحدّ التزامن يعطي ثانية واحدة.
        // نحترم الترويسة كما هي بدل اختيار فاصل من عندنا.
        cool(st, secs * 1000, 'rate-limit');
        return { ok: false, retry: true, reason: `${cfg.id}: 429 ${msg}` };
      }
      if (res.status === 401 || res.status === 403) {
        // مفتاح خاطئ أو منتهٍ: يخصّ هذا المزوّد وحده، فنبرّده طويلًا ونحوّل
        cool(st, 10 * MINUTE, 'auth');
        return { ok: false, retry: true, reason: `${cfg.id}: ${res.status} مفتاح مرفوض` };
      }
      if (res.status >= 500) {
        cool(st, 30000, 'server');
        return { ok: false, retry: true, reason: `${cfg.id}: ${res.status} عطل مؤقّت` };
      }
      // ٤٠٠ وأخواته يفشل بنفس الشكل عند الجميع، فلا إعادة ولا تحويل
      const err = new Error(`${cfg.id}: ${res.status} ${msg}`);
      err.fatal = true;
      throw err;
    } catch (e) {
      if (e && e.fatal) throw e;
      cool(st, 30000, 'network');
      return { ok: false, retry: true, reason: `${st.cfg.id}: ${e && e.message}` };
    } finally {
      st.sem.release();
    }
  }

  // task: اسم المهمة (derive / distractors / translate) — يُستعمل للأدوار فقط
  async function call(task, payload, opts) {
    const rounds = (opts && opts.rounds) || 3;
    const reasons = [];
    if (!states.length) throw new Error('لا مزوّد ذكاء مُعرَّف في متغيّرات البيئة');

    for (let round = 0; round < rounds; round++) {
      const cands = order(task);
      let soonest = Infinity;
      for (const st of cands) {
        const t = _now();
        if (st.coolUntil > t) { soonest = Math.min(soonest, st.coolUntil - t); continue; }
        const r = await once(st, payload);
        if (r.ok) return r;
        reasons.push(r.reason);
      }
      // كلّهم مبرَّدون: ننام أقصر مدة تبريد ثم نعيد الكرّة
      if (soonest !== Infinity) await _sleep(Math.min(soonest, MINUTE));
    }
    throw new Error(`تعذّر إتمام الطلب لدى كل المزوّدين — ${reasons.slice(-3).join(' | ')}`);
  }

  // تشغيل دفعات مع تقدّم: الحفظ بعد كل دفعة مسؤولية onProgress
  async function runAll(jobs, { onProgress } = {}) {
    const cap = states.reduce((n, s) => n + s.cfg.concurrency, 0) || 1;
    const out = new Array(jobs.length);
    let i = 0, done = 0;
    const workers = new Array(Math.min(cap, jobs.length)).fill(0).map(async () => {
      while (i < jobs.length) {
        const k = i++;
        const j = jobs[k];
        try {
          out[k] = { ok: true, ...(await call(j.task, j)) };
        } catch (e) {
          out[k] = { ok: false, error: e.message };
        }
        done++;
        if (onProgress) await onProgress({ done, total: jobs.length, index: k, result: out[k] });
      }
    });
    await Promise.all(workers);
    return out;
  }

  function stats() {
    return states.map(s => ({
      id: s.cfg.id,
      calls: s.calls,
      cooling: s.coolUntil > _now(),
      reason: s.lastReason || null,
    }));
  }

  return { call, runAll, stats, policy, providers: states.map(s => s.cfg.id) };
}

module.exports = { createAI, readProviders, buildRequest, readReply, Window, Sem };
