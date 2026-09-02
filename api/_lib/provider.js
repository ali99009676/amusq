'use strict';

function pickProvider(){
  const forced = String(process.env.AI_PROVIDER || '').trim().toLowerCase();
  if (forced === 'gemini' || forced === 'anthropic') return forced;
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return 'none';
}

const DEFAULT_MODEL = {
  anthropic: 'claude-haiku-4-5-20251001',
  gemini: 'gemini-3.6-flash'
};

const MODEL_PREFIX = { anthropic: 'claude', gemini: 'gemini' };

function modelFor(provider){
  const want = String(process.env.AI_MODEL || '').trim();
  const pre = MODEL_PREFIX[provider];
  if (want && pre && want.toLowerCase().indexOf(pre) === 0) return want;
  return DEFAULT_MODEL[provider] || '';
}

function suggestedModel(errText){
  const m = String(errText || '')
    .match(/use\s+models\/([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)/);
  return m ? m[1] : null;
}

function parseArray(text){
  const raw = String(text || '').trim();
  const m = raw.match(/\[[\s\S]*\]/);
  let out;
  try { out = JSON.parse(m ? m[0] : raw); }
  catch(e){ throw new Error('ردّ الذكاء ليس JSON صالحًا: ' + raw.slice(0, 200)); }
  if (!Array.isArray(out)) throw new Error('ردّ الذكاء ليس مصفوفة');
  return out;
}

function parseObject(text){
  const raw = String(text || '').trim();
  const m = raw.match(/\{[\s\S]*\}/);
  let out;
  try { out = JSON.parse(m ? m[0] : raw); }
  catch(e){ throw new Error('ردّ الذكاء ليس JSON صالحًا: ' + raw.slice(0, 200)); }
  if (!out || Array.isArray(out) || typeof out !== 'object')
    throw new Error('ردّ الذكاء ليس كائنًا واحدًا');
  return out;
}

function classify(status, body){
  const t = String(body || '');
  if (status === 429) {
    const perDay = /PerDay|per day|daily/i.test(t);
    return { kind: perDay ? 'quota_day' : 'quota_minute', retryable: !perDay };
  }
  if (status === 401 || status === 403) return { kind:'auth', retryable:false };
  if (status === 500 || status === 502 || status === 503 || status === 504)
    return { kind:'overloaded', retryable:true };
  return { kind:'other', retryable:false };
}

function retryAfter(body){
  const m = String(body || '').match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  return m ? Math.ceil(parseFloat(m[1])) : null;
}

const HUMAN = {
  quota_day: 'بلغ الذكاء حصّته اليومية عند المزوّد. المحفوظ لا يضيع — ' +
             'أكمل غدًا من حيث توقفت، أو انشر مادتك الآن بلا إثراء وأثرِها لاحقًا.',
  quota_minute: 'ازدحمت طلبات الذكاء هذه اللحظة. انتظر دقيقة ثم اضغط «أعد المحاولة» — ' +
                'ما أُنجز محفوظ ولن يُعاد.',
  overloaded: 'خادم الذكاء مشغول الآن. أعد المحاولة بعد قليل — المحفوظ لا يضيع.',
  auth: 'مفتاح الذكاء مرفوض أو منتهٍ — أبلغ مشرف المنصة. يمكنك النشر بلا إثراء الآن.'
};

function aiError(status, body, provider){
  const c = classify(status, body);
  const e = new Error(HUMAN[c.kind] ||
    ('تعذّر الاتصال بالذكاء (' + provider + ' ' + status + '). أعد المحاولة — المحفوظ لا يضيع.'));
  e.kind = c.kind; e.retryable = c.retryable; e.status = status;
  e.retryAfter = retryAfter(body);
  return e;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* الوسائط (صور/PDF) مع النص — والشكل يختلف بين المزوّدين فيُبنى هنا وحده */
function withMedia(user, media, prov){
  const list = Array.isArray(media) ? media.filter(m => m && m.base64) : [];
  if (prov === 'gemini'){
    const parts = list.map(m => ({ inline_data: { mime_type: m.mime, data: m.base64 } }));
    parts.push({ text: user });
    return parts;
  }
  if (!list.length) return user;
  const blocks = list.map(m => m.mime === 'application/pdf'
    ? { type:'document', source:{ type:'base64', media_type:'application/pdf', data: m.base64 } }
    : { type:'image',    source:{ type:'base64', media_type: m.mime, data: m.base64 } });
  blocks.push({ type:'text', text: user });
  return blocks;
}

async function callAnthropic(system, user, model, opts){
  opts = opts || {};
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY غير مضبوط في متغيرات البيئة');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{ 'x-api-key': key, 'anthropic-version':'2023-06-01', 'content-type':'application/json' },
    body: JSON.stringify({
      model, max_tokens: opts.maxTokens || 8192,
      system: [{ type:'text', text: system, cache_control:{ type:'ephemeral' } }],
      messages: [{ role:'user', content: withMedia(user, opts.media, 'anthropic') }]
    })
  });
  if (!res.ok) throw aiError(res.status, await res.text(), 'Anthropic');
  const data = await res.json();
  const text = (data.content && data.content[0] && data.content[0].text) || '[]';
  return { items: opts.expectObject ? parseObject(text) : parseArray(text),
           usage: data.usage || null };
}

async function callGemini(system, user, model, retried, opts){
  opts = opts || {};
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY غير مضبوط في متغيرات البيئة');
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
              encodeURIComponent(model) + ':generateContent';
  const res = await fetch(url, {
    method:'POST',
    headers:{ 'x-goog-api-key': key, 'content-type':'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role:'user', parts: withMedia(user, opts.media, 'gemini') }],
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: opts.maxTokens || 8192,
        temperature: 0.2,
        thinkingConfig: opts._noThink ? undefined : { thinkingBudget: 0 }
      }
    }),
    signal: AbortSignal.timeout(opts.timeoutMs || 120000)
  });
  if (!res.ok){
    const body = await res.text();
    const alt = res.status === 404 && !retried ? suggestedModel(body) : null;
    if (alt) return callGemini(system, user, alt, true, opts);
    if (res.status === 400 && !opts._noThink)
      return callGemini(system, user, model, retried,
                        Object.assign({}, opts, { _noThink: true }));
    const cls = classify(res.status, body);
    if (cls.kind === 'quota_minute' && !opts._waited) {
      const wait = Math.min(retryAfter(body) || 12, 25);
      await sleep(wait * 1000);
      return callGemini(system, user, model, retried,
                        Object.assign({}, opts, { _waited: true }));
    }
    throw aiError(res.status, body, 'Gemini');
  }
  const data = await res.json();
  const cand = (data.candidates && data.candidates[0]) || null;
  if (!cand) throw new Error('Gemini لم يُرجع ردًّا' +
    (data.promptFeedback && data.promptFeedback.blockReason
      ? ' — حجبه فلتر المحتوى (' + data.promptFeedback.blockReason + ')' : ''));
  if (cand.finishReason === 'SAFETY' || cand.finishReason === 'PROHIBITED_CONTENT')
    throw new Error('حجب فلتر المحتوى هذه الدفعة — أعد رفعها بعد تقسيمها');
  if (cand.finishReason === 'MAX_TOKENS')
    throw new Error('انقطع الردّ لطول الدفعة — قسّمها إلى دفعتين');
  const text = (cand.content && cand.content.parts || [])
    .map(p => p.text || '').join('');
  const u = data.usageMetadata || null;
  return {
    items: opts.expectObject ? parseObject(text) : parseArray(text),
    model,
    usage: u ? { input_tokens: u.promptTokenCount || 0,
                 output_tokens: u.candidatesTokenCount || 0 } : null
  };
}

async function callAI(system, user, opts){
  opts = opts || {};
  const provider = pickProvider();
  if (provider === 'none')
    throw new Error('لا مفتاح ذكاء مضبوط — أضف GEMINI_API_KEY أو ANTHROPIC_API_KEY ' +
                    'في متغيّرات بيئة Vercel، أو ارفع بلا إثراء');
  const run = async (prov) => {
    const model = modelFor(prov);
    const r = prov === 'gemini'
      ? await callGemini(system, user, model, false, opts)
      : await callAnthropic(system, user, model, opts);
    return { items: r.items, usage: r.usage, model: r.model || model, provider: prov };
  };
  try { return await run(provider); }
  catch(e){
    const other = provider === 'gemini' ? 'anthropic' : 'gemini';
    const otherKey = other === 'gemini' ? process.env.GEMINI_API_KEY : process.env.ANTHROPIC_API_KEY;
    const worthSwitching = e && (e.kind === 'quota_day' || e.kind === 'quota_minute' ||
                                 e.kind === 'overloaded' || e.kind === 'auth');
    if (otherKey && worthSwitching) {
      try { return await run(other); }
      catch(e2){ throw e; }
    }
    throw e;
  }
}

module.exports = { callAI, withMedia, pickProvider, modelFor, parseArray, parseObject,
                   suggestedModel, DEFAULT_MODEL, classify, retryAfter, aiError, HUMAN };
