'use strict';

const CHUNK = 6000;
const OVERLAP = 600;

const SYS = [
  'أنت قارئ ملفات أسئلة. مهمتك استخراج الأسئلة من نصٍّ خام كما هي، لا تأليفها.',
  '',
  'القواعد المطلقة:',
  '- انسخ نص السؤال وخياراته حرفًا بحرف كما وردت في النص. ممنوع إعادة الصياغة',
  '  أو التصحيح الإملائي أو الترجمة أو الاختصار. أي تغيير يجعل السؤال مرفوضًا.',
  '- لا تخترع سؤالًا غير موجود، ولا تكمل سؤالًا ناقصًا.',
  '- احذف أرقام الترقيم وعلامات الخيارات (١. أ) A) - •) من النص المنسوخ،',
  '  فهي زخرفة الملف لا من كلام السؤال.',
  '',
  'لكل سؤال أعد كائنًا بهذه الحقول:',
  '  q            نص السؤال كما هو',
  '  options      مصفوفة نصوص الخيارات كما هي بترتيبها، أو null إن لم يكن له خيارات',
  '  answer_index رقم موضع الإجابة الصحيحة يبدأ من 0 إن كانت معلنة في الملف، وإلا null',
  '  answer_text  نص الإجابة إن كان السؤال مقاليًا بلا خيارات، وإلا null',
  '',
  'الإجابة قد تُعلَن بأشكال شتى: ANSWER: B أو «الإجابة: ج» أو نجمة بجانب الخيار',
  'أو لونٌ ضاع عند الاستخراج أو سطرٌ في آخر الملف يجمع الإجابات. خذها أينما وجدتها،',
  'وإن لم تجدها فاجعل answer_index = null ولا تخمّن.',
  '',
  'تجاهل ما ليس سؤالًا: العناوين وأسماء الدكاترة وأرقام الصفحات والفهارس.',
  'أعد مصفوفة JSON واحدة بترتيب ورودها في النص، بلا أي نص خارجها.'
].join('\n');

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
function norm(s){
  return String(s || '')
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[٠-٩]/g, d => String(AR_DIGITS.indexOf(d)))
    .replace(/[«»“”‘’`]/g, '"')
    .replace(/[‐-―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function verbatimIn(normalizedSource, text){
  const t = norm(text);
  if (!t) return false;
  return normalizedSource.indexOf(t) !== -1;
}

function chunkText(text){
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let cur = '', tail = '';
  lines.forEach(line => {
    if (cur.length + line.length + 1 > CHUNK && cur) {
      out.push(tail + cur);
      tail = cur.slice(-OVERLAP);
      cur = '';
    }
    cur += line + '\n';
  });
  if (cur.trim()) out.push(tail + cur);
  return out.length ? out : [''];
}

function shape(item, normalizedSource, ord){
  const q = String((item && item.q) || '').trim();
  if (!q) return null;
  const rawOpts = Array.isArray(item.options) ? item.options : null;
  const options = rawOpts
    ? rawOpts.map(o => String(o == null ? '' : o).trim()).filter(Boolean)
    : null;
  const hasOptions = !!(options && options.length >= 2);
  const ai = item.answer_index;
  const answer = (typeof ai === 'number' && ai >= 0 && hasOptions && ai < options.length) ? ai : null;
  return {
    num: ord + 1,
    q: q,
    options: hasOptions ? options : null,
    answer: answer,
    answer_letter: (answer !== null) ? 'ABCDE'[answer] || null : null,
    answer_text: hasOptions ? null : (item.answer_text ? String(item.answer_text).trim() : null),
    has_options: hasOptions,
    unverified: !verbatimIn(normalizedSource, q)
  };
}

async function aiRead(text, callAI, opts){
  const o = opts || {};
  const src = String(text || '');
  if (!src.trim()) return { questions: [], chunks: 0 };
  const normalizedSource = norm(src);
  const parts = chunkText(src);
  const seen = Object.create(null);
  const out = [];
  let lastErr = null;
  for (let i = 0; i < parts.length; i++) {
    let r;
    try {
      r = await callAI(SYS, parts[i], { maxTokens: 32768, timeoutMs: 240000 });
    } catch (e) {
      lastErr = e;
      continue;
    }
    const items = Array.isArray(r && r.items) ? r.items : [];
    items.forEach(it => {
      const s = shape(it, normalizedSource, out.length);
      if (!s) return;
      const k = norm(s.q);
      if (seen[k]) return;
      seen[k] = 1;
      out.push(s);
    });
  }
  out.forEach((q, i) => { q.num = i + 1; });
  return { questions: out, chunks: parts.length, error: out.length ? null : lastErr };
}

const MEDIA_SYS = SYS + '\n\n' + [
  'المصدر هنا صورٌ أو ملف PDF ممسوح لا نصّ. اقرأ ما فيها كما هو مكتوب،',
  'بالترتيب من أعلى إلى أسفل ومن الصورة الأولى إلى الأخيرة.',
  'إن كان سؤالٌ مقطوعًا بين صورتين فاجمع نصفيه.',
  'إن كانت الصورة غير مقروءة أو لا أسئلة فيها فأعد مصفوفة فارغة.',
  'لا تُترجم ولا تُصحّح إملاءً — انقل الحروف كما تراها.'
].join('\n');

const MEDIA_BATCH_BYTES = 12 * 1024 * 1024;

async function aiReadMedia(media, callAI){
  const list = (Array.isArray(media) ? media : []).filter(m => m && m.base64);
  if (!list.length) return { questions: [], chunks: 0 };
  const batches = [];
  let cur = [], size = 0;
  list.forEach(m => {
    const b = Math.floor(m.base64.length * 0.75);
    if (cur.length && size + b > MEDIA_BATCH_BYTES){ batches.push(cur); cur = []; size = 0; }
    cur.push(m); size += b;
  });
  if (cur.length) batches.push(cur);
  const seen = Object.create(null);
  const out = [];
  let lastErr = null;
  for (let i = 0; i < batches.length; i++){
    let r;
    try {
      r = await callAI(MEDIA_SYS,
        'استخرج كل الأسئلة من هذه ' + (batches[i].length > 1 ? 'الصور' : 'الصورة') + '.',
        { maxTokens: 32768, timeoutMs: 240000, media: batches[i] });
    } catch (e) { lastErr = e; continue; }
    const items = Array.isArray(r && r.items) ? r.items : [];
    items.forEach(it => {
      const s = shape(it, '', out.length);
      if (!s) return;
      const k = norm(s.q);
      if (seen[k]) return;
      seen[k] = 1;
      s.unverified = true;
      s.ocr = true;
      out.push(s);
    });
  }
  out.forEach((q, i) => { q.num = i + 1; });
  return { questions: out, chunks: batches.length, error: out.length ? null : lastErr };
}

module.exports = { aiRead, aiReadMedia, chunkText, shape, norm, verbatimIn, SYS, MEDIA_SYS, CHUNK };
