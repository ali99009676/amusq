'use strict';

// استخراج الأسئلة من ملف PDF.
//
// لماذا نموذج بصري لا pdftotext:
// جُرّب الاستخراج النصّي على بنك عربي حقيقي فأسقط أرقامًا من جدول الإجابات
// (٢٥ صارت ٥، و٣٠ صارت ٣) وقلب ترتيب الخيارات وفكّك حروفًا.
// والصفحة نفسها سليمة تمامًا. فالخلل في الاستخراج النصّي لا في الملف،
// وهو يكسر قاعدة القداسة بصمت — وهذا أسوأ من أن يكسرها بصوت.
//
// وضعان:
//   extract  — الملف بنك أسئلة جاهز. الإجابات من المصدر ← derived = false.
//   generate — الملف فصل دراسي نصّي. الأسئلة والإجابات من النموذج ← derived = true.

const { createAI } = require('./_ai.js');

// ————— المخطّط المتفق عليه —————
// النموذج يردّ JSON فقط. أي حرف خارجه يُرفض ولا يُصلَّح،
// لأن «الإصلاح» هو بالضبط الباب الذي يدخل منه التحريف.

const SCHEMA = `{"questions":[{"n":<رقم السؤال كما هو مطبوع>,"text":"<نصّ السؤال حرفًا بحرف>","options":{"أ":"...","ب":"...","ج":"...","د":"..."}}]}`;

const EXTRACT_SYSTEM = `You transcribe exam questions from a PDF page image.
Rules, in order of importance:
1. Copy Arabic text EXACTLY as printed: same wording, same spelling, same diacritics, same punctuation. Never correct, normalise, translate, or reorder.
2. Keep each option under its printed letter (أ ب ج د). Do not reorder options.
3. Use the question number exactly as printed on the page.
4. If a question is cut off, partially covered by a watermark, or you cannot read it with certainty, OMIT it entirely. A missing question is recoverable; a wrong one is not.
5. Output ONLY JSON matching this schema, no markdown fence, no commentary:
${SCHEMA}`;

const ANSWERKEY_SYSTEM = `You read an answer-key table from a PDF page image.
The table maps question numbers to answer letters (أ ب ج د).
Read every row. Numbers are Western digits; do not guess a number you cannot read clearly — omit that row instead.
Output ONLY JSON, no fence, no commentary:
{"answers":{"<number>":"<letter>"}}`;

const GENERATE_SYSTEM = `You write multiple-choice questions from Arabic course material.
Rules:
1. Every question must be answerable from the supplied pages alone. Never use outside knowledge.
2. Quote terminology exactly as the material uses it.
3. Four options, exactly one correct, three plausible distractors drawn from the material.
4. Output ONLY JSON, no fence, no commentary:
{"questions":[{"n":<index from 1>,"text":"...","options":{"أ":"...","ب":"...","ج":"...","د":"..."},"answer":"<letter>"}]}`;

// ————— قراءة رد النموذج —————
function parseJson(raw) {
  let s = String(raw).trim();
  // بعض النماذج تلفّه بسياج رغم المنع — نزيل السياج ولا نصلح شيئًا آخر
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) s = fence[1].trim();
  try {
    return JSON.parse(s);
  } catch (e) {
    throw new Error(`رد النموذج ليس JSON صالحًا: ${s.slice(0, 120)}`);
  }
}

const LETTERS = ['أ', 'ب', 'ج', 'د'];

// ————— التحقّق: يرفض ولا يُصلح —————
function validateQuestions(payload, { needAnswer } = {}) {
  if (!payload || !Array.isArray(payload.questions)) throw new Error('لا مصفوفة questions في الرد');
  const ok = [];
  const rejected = [];
  const seen = new Set();

  for (const q of payload.questions) {
    const why = [];
    if (!Number.isInteger(q && q.n)) why.push('رقم غير صحيح');
    else if (seen.has(q.n)) why.push('رقم مكرّر');
    if (!q || typeof q.text !== 'string' || q.text.trim().length < 5) why.push('نصّ ناقص');
    const opts = (q && q.options) || {};
    const present = LETTERS.filter(L => typeof opts[L] === 'string' && opts[L].trim());
    if (present.length < 2) why.push('خيارات أقل من اثنين');
    const values = present.map(L => opts[L].trim());
    if (new Set(values).size !== values.length) why.push('خياران متطابقان');
    if (needAnswer && !LETTERS.includes(q && q.answer)) why.push('إجابة مفقودة أو خارج أ-د');

    if (why.length) rejected.push({ n: q && q.n, why });
    else { seen.add(q.n); ok.push(q); }
  }
  return { ok, rejected };
}

// ————— ربط الأسئلة بجدول الإجابات —————
// السؤال بلا إجابة في الجدول لا يُخمَّن له جواب، بل يُعلَّم للمشرف.
function mergeAnswers(questions, answers) {
  const matched = [];
  const unmatched = [];
  for (const q of questions) {
    const a = answers[String(q.n)];
    if (LETTERS.includes(a) && q.options[a]) matched.push({ ...q, answer: a, derived: false });
    else unmatched.push({ ...q, answer: null, derived: true, needsReview: true });
  }
  return { matched, unmatched };
}

// ————— الواجهة —————
async function extractPages({ pdfBase64, mode = 'extract', env, ai }) {
  const client = ai || createAI({ env: env || process.env });
  const system = mode === 'generate' ? GENERATE_SYSTEM : EXTRACT_SYSTEM;
  const user = mode === 'generate'
    ? 'Write questions from these pages. JSON only.'
    : 'Transcribe every complete question on these pages. JSON only.';

  const r = await client.call('extract', { system, user, pdfBase64, maxTokens: 8000, temperature: 0 });
  const parsed = parseJson(r.text);
  const { ok, rejected } = validateQuestions(parsed, { needAnswer: mode === 'generate' });
  return { questions: ok, rejected, provider: r.provider, mode };
}

async function extractAnswerKey({ pdfBase64, env, ai }) {
  const client = ai || createAI({ env: env || process.env });
  const r = await client.call('extract', {
    system: ANSWERKEY_SYSTEM,
    user: 'Read the answer key table. JSON only.',
    pdfBase64, maxTokens: 4000, temperature: 0,
  });
  const parsed = parseJson(r.text);
  const out = {};
  for (const [k, v] of Object.entries((parsed && parsed.answers) || {})) {
    if (/^\d+$/.test(k) && LETTERS.includes(v)) out[k] = v;
  }
  return out;
}

module.exports = {
  extractPages, extractAnswerKey, mergeAnswers,
  validateQuestions, parseJson,
  EXTRACT_SYSTEM, ANSWERKEY_SYSTEM, GENERATE_SYSTEM,
};
function t(){
  const s = 'ok';
  return {a:[1,2]};
}
// تعليق عربي
'use strict';

// استخراج الأسئلة من ملف PDF.
//
// لماذا نموذج بصري لا pdftotext:
// جُرّب الاستخراج النصّي على بنك عربي حقيقي فأسقط أرقامًا من جدول الإجابات
// (٢٥ صارت ٥، و٣٠ صارت ٣) وقلب ترتيب الخيارات وفكّك حروفًا.
// والصفحة نفسها سليمة تمامًا. فالخلل في الاستخراج النصّي لا في الملفٌ
// وهو يكسر قاعدة القداسة بصمت — وهذا أسوأ من أن يكسرها بصوت.
//
// وضعان:
//   extract  — الملف بنك أسئلة جاهز. الإجابات من المصدر ← derived = false.
//   generate — الملف فصل دراسي نصّي. الأسئلة والإجابات من النموذج ← derived = true.

const { createAI } = require('./_ai.js');

// ————— المخطّط المتفق عليه —————
// النموذج يردّ JSON فقط. أي حرف خارجه يُرفض ولا يُصلَّح،
// لأن «الإصلاح» هو بالضبط الباب الذي يدخل منه التحريف.

const SCHEMA = `{"questions":[{"n":<رقم السؤال كما هو مطبوع>,"text":"<نصّ السؤال حرفًا بحرف>","options":{"أ":"...","ب":"...","ج":"...","د":"..."}}]}`;

const EXTRACT_SYSTEM = `You transcribe exam questions from a PDF page image.
Rules, in order of importance:
1. Copy Arabic text EXACTLY as printed: same wording, same spelling, same diacritics, same punctuation. Never correct, normalise, translate, or reorder.
2. Keep each option under its printed letter (أ ب ج د). Do not reorder options.
3. Use the question number exactly as printed on the page.
4. If a question is cut off, partially covered by a watermark, or you cannot read it with certainty, OMIT it entirely. A missing question is recoverable; a wrong one is not.
5. Output ONLY JSON matching this schema, no markdown fence, no commentary:
${SCHEMA}`;

const ANSWERKEY_SYSTEM = `You read an answer-key table from a PDF page image.
The table maps question numbers to answer letters (أ ب ج د).
Read every row. Numbers are Western digits; do not guess a number you cannot read clearly — omit that row instead.
Output ONLY JSON, no fence, no commentary:
{"answers":{"<number>":"<letter>"}}`;

const GENERATE_SYSTEM = `You write multiple-choice questions from Arabic course material.
Rules:
1. Every question must be answerable from the supplied pages alone. Never use outside knowledge.
2. Quote terminology exactly as the material uses it.
3. Four options, exactly one correct, three plausible distractors drawn from the material.
4. Output ONLY JSON, no fence, no commentary:
{"questions":[{"n":<index from 1>,"text":"...","options":{"أ":"...","ب":"...","ج":"...","د":"..."},"answer":"<letter>"}]}`;

// ————— قراءة رد النموذج —————
function parseJson(raw) {
  let s = String(raw).trim();
  // بعض النماذج تلفّه بسياج رغم المنع — نزيل السياج ولا نصلح شيئًا آخر
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) s = fence[1].trim();
  try {
    return JSON.parse(s);
  } catch (e) {
    throw new Error(`رد النموذج ليس JSON صالحًا: ${s.slice(0, 120)}`);
  }
}

const LETTERS = ['أ', 'ب', 'ج', 'د'];

// ————— التحقّق: يرفض ولا يُصلح —————
function validateQuestions(payload, { needAnswer } = {}) {
  if (!payload || !Array.isArray(payload.questions)) throw new Error('لا مصفوفة questions في الرد');
  const ok = [];
  const rejected = [];
  const seen = new Set();

  for (const q of payload.questions) {
    const why = [];
    if (!Number.isInteger(q && q.n)) why.push('رقم غير صحيح');
    else if (seen.has(q.n)) why.push('رقم مكرّر');
    if (!q || typeof q.text !== 'string' || q.text.trim().length < 5) why.push('نصّ ناقص');
    const opts = (q && q.options) || {};
    const present = LETTERS.filter(L => typeof opts[L] === 'string' && opts[L].trim());
    if (present.length < 2) why.push('خيارات أقل من اثنين');
    const values = present.map(L => opts[L].trim());
    if (new Set(values).size !== values.length) why.push('خياران متطابقان');
    if (needAnswer && !LETTERS.includes(q && q.answer)) why.push('إجابة مفقودة أو خارج أ-د');

    if (why.length) rejected.push({ n: q && q.n, why });
    else { seen.add(q.n); ok.push(q); }
  }
  return { ok, rejected };
}

// ————— ربط الأسئلة بجدول الإجابات —————
// السؤال بلا إجابة في الجدول لا يُخمَّن له جواب، بل يُعلَّم للمشرف.
function mergeAnswers(questions, answers) {
  const matched = [];
  const unmatched = [];
  for (const q of questions) {
    const a = answers[String(q.n)];
    if (LETTERS.includes(a) && q.options[a]) matched.push({ ...q, answer: a, derived: false });
    else unmatched.push({ ...q, answer: null, derived: true, needsReview: true });
  }
  return { matched, unmatched };
}

// ————— الواجهة —————
async function extractPages({ pdfBase64, mode = 'extract', env, ai }) {
  const client = ai || createAI({ env: env || process.env });
  const system = mode === 'generate' ? GENERATE_SYSTEM : EXTRACT_SYSTEM;
  const user = mode === 'generate'
    ? 'Write questions from these pages. JSON only.'
    : 'Transcribe every complete question on these pages. JSON only.';

  const r = await client.call('extract', { system, user, pdfBase64, maxTokens: 8000, temperature: 0 });
  const parsed = parseJson(r.text);
  const { ok, rejected } = validateQuestions(parsed, { needAnswer: mode === 'generate' });
  return { questions: ok, rejected, provider: r.provider, mode };
}

async function extractAnswerKey({ pdfBase64, env, ai }) {
  const client = ai || createAI({ env: env || process.env });
  const r = await client.call('extract', {
    system: ANSWERKEY_SYSTEM,
    user: 'Read the answer key table. JSON only.',
    pdfBase64, maxTokens: 4000, temperature: 0,
  });
  const parsed = parseJson(r.text);
  const out = {};
  for (const [k, v] of Object.entries((parsed && parsed.answers) || {})) {
    if (/^\d+$/.test(k) && LETTERS.includes(v)) out[k] = v;
  }
  return out;
}

module.exports = {
  extractPages, extractAnswerKey, mergeAnswers,
  validateQuestions, parseJson,
  EXTRACT_SYSTEM, ANSWERKEY_SYSTEM, GENERATE_SYSTEM,
};
