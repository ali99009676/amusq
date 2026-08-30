'use strict';
/*
  ناقل محتوى AMSU إلى AMUSQ.
  المبدأ الحاكم: قاعدة القداسة — نص السؤال والخيارات يُنقل حرفًا بحرف بلا أي تعديل.
  ننفّذ ملف AMSU داخل vm ونلتقط كائنات البيانات مباشرة بدل تحليل نصّي هشّ.
*/
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync(process.argv[2], 'utf8');

/*
  الملف سكربت واحد ضخم فيه بيانات وواجهة معًا؛ تشغيله كاملًا يتعثّر عند أول نداء DOM.
  لذلك نقتطع تعريفات البيانات وحدها بمطابقة الأقواس، فنشغّل ما نحتاجه فقط.
*/
function sliceDecl(src, name){
  const at = src.indexOf('const ' + name + ' =');
  if (at === -1) return '';
  let i = src.indexOf('{', at), depth = 0, inStr = null, esc = false;
  if (i === -1) return '';
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (esc) { esc = false; continue; }
    if (inStr) { if (c === '\\') esc = true; else if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(at, j + 1) + ';'; }
  }
  return '';
}
const NAMES = ['DATA_TOX','DATA_RESP','DATA_CDM','DATA_HS','DATA_ENT',
               'IDENTITY','EXAMS','SMART_TOX','SMART_RESP','SMART_CDM','SMART_HS'];
const blob = NAMES.map(n => {
  const d = sliceDecl(html, n);
  // نحوّل «const X = {...};» إلى «globalThis.X = {...};» لتبقى مقروءة من خارج السياق
  return d ? d.replace('const ' + n + ' =', 'globalThis.' + n + ' =') : '';
}).filter(Boolean).join('\n');

const ctx = { window:{}, document:{ addEventListener(){}, querySelector(){ return null; },
  querySelectorAll(){ return []; }, createElement(){ return { style:{}, classList:{ add(){}, remove(){} },
  setAttribute(){}, appendChild(){} }; }, getElementById(){ return null; }, documentElement:{ style:{}, setAttribute(){} },
  body:{ classList:{ add(){}, remove(){} }, appendChild(){} } },
  localStorage:{ getItem(){ return null; }, setItem(){}, removeItem(){} },
  navigator:{ userAgent:'node' }, location:{ hash:'', href:'', origin:'', pathname:'' },
  setTimeout(){}, setInterval(){}, clearTimeout(){}, clearInterval(){},
  matchMedia(){ return { matches:false, addEventListener(){} }; },
  console, JSON, Math, Date, Object, Array, String, Number, Boolean, RegExp, isNaN, parseInt, parseFloat };
ctx.globalThis = ctx; ctx.self = ctx;

try { vm.runInNewContext(blob, ctx, { timeout: 20000 }); }
catch (e) { console.error('خطأ في تنفيذ البيانات:', e.message); process.exit(1); }

const DATA = ['DATA_TOX','DATA_RESP','DATA_CDM','DATA_HS','DATA_ENT']
  .map(k => ctx[k]).filter(Boolean);
const IDENTITY = ctx.IDENTITY || {};
const EXAMS = ctx.EXAMS || {};
const SMART = Object.assign({}, ctx.SMART_TOX, ctx.SMART_RESP, ctx.SMART_CDM, ctx.SMART_HS);

if (!DATA.length) { console.error('لم تُلتقط بيانات المواد'); process.exit(1); }

// لوحة ألوان AMUSQ — نُسند لكل مادة أقرب لون من نظام التصميم لا لونًا حرًّا
const COLOR_MAP = { tox:'subject-4', resp:'subject-2', cdm:'subject-3', hs:'subject-5', ent:'subject-1' };
const ICON_MAP  = { tox:'☠️', resp:'🫁', cdm:'🧠', hs:'🛡️', ent:'💡' };

const out = DATA.map((s, idx) => {
  const ex = EXAMS[s.id] || {};
  const topics = s.topics || {};
  const qs = (s.questions || []).map((q, i) => {
    // النص الأصلي: الإنجليزي إن وُجد وإلا العربي — كما تعرضه AMSU تمامًا
    const qText = q.en || q.ar;
    const opts  = (q.opts || []).map(o => o.en || o.ar);
    const sm = SMART[q.id] || {};   // شفرة الحفظ الذكي مفهرسة بمعرّف السؤال
    return {
      ord: i + 1,
      q: qText,
      options: opts,
      // اسم الحقل في AMSU هو correct — نتحقق منه صراحةً ولا نفترض صفرًا صامتًا
      answer: (typeof q.correct === 'number') ? q.correct
            : (typeof q.ans === 'number') ? q.ans
            : (() => { throw new Error('سؤال بلا إجابة: ' + (q.id || qText)); })(),
      expl_ar: q.exp || '',
      expl_en: q.expEn || '',
      translation: q.en ? (q.ar || '') : '',
      topic: topics[q.topic] || q.topic || '',
      mnemonic: (sm.cue || sm.key) ? { cue: sm.cue || '', key: sm.key || '', link: sm.link || '', strike: sm.strike || '' } : {},
      derived: false,      // كل الإجابات جاءت مع ملف المادة الأصلي
      opts_built: false,
      important: !!q.important
    };
  });
  return {
    name: ex.name || s.name,
    color: COLOR_MAP[s.id] || 'subject-1',
    icon: ICON_MAP[s.id] || '▤',
    descr: (s.overview || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600),
    topics: Object.values(topics),
    exam_date: ex.examAt || null,
    ord: idx,
    questions: qs
  };
});

fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1), 'utf8');
console.log('المواد:', out.length);
out.forEach(s => console.log(' -', s.name, '·', s.questions.length, 'سؤالًا ·', s.topics.length, 'محاور ·', s.exam_date || 'بلا موعد'));
console.log('الإجمالي:', out.reduce((n,s)=>n+s.questions.length,0), 'سؤالًا');
