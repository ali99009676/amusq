'use strict';
/*
  استخراج النص من الملفات المرفوعة — TXT مباشرة، DOCX بفكّ الضغط وقراءة XML،
  وPDF عبر pdf-parse. كل هذا في الخادم؛ المتصفح يرسل الملف base64 فقط.
*/
const { unzipSync, strFromU8 } = require('fflate');

/* خطأٌ يقرؤه الطالب — لا عطلٌ يُخفى برمز (guard.fail يمرّر ما له kind) */
function fileError(msg){ return Object.assign(new Error(msg), { status: 422, kind: 'file' }); }

/*
  ★ فكّ الضغط بسقف — قنبلة الضغط.
  DOCX من أربعة ميغابايت قد ينتفخ إلى غيغابايتات (ملف XML من أصفارٍ
  ينضغط ألف مرة)، وunzipSync يفكّ كل مدخلٍ في الذاكرة فيسقط الخادم.
  فلا نفكّ إلا ما نقرؤه فعلًا (document.xml أو الشرائح)، ولا مدخلًا فوق
  ٢٥ ميغابايت ولا مجموعًا فوق ٦٠ (تدقيق M-04).
*/
const MAX_ENTRY = 25 * 1024 * 1024, MAX_TOTAL = 60 * 1024 * 1024;
function safeUnzip(buf, want){
  let total = 0;
  return unzipSync(new Uint8Array(buf), { filter(f){
    if (!want.test(f.name)) return false;
    total += f.originalSize || 0;
    if ((f.originalSize || 0) > MAX_ENTRY || total > MAX_TOTAL)
      throw fileError('الملف المضغوط أكبر من المسموح بعد فكّه');
    return true;
  } });
}

function fromTxt(buf){ return buf.toString('utf8'); }

/* HTML/HTM: صفحةُ أسئلةٍ حُفظت من المتصفح — شائعة جدًا، وكانت تُرفض */
function fromHtml(buf){
  return buf.toString('utf8')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    // كل وسمٍ يُغلق سطرًا: بنية الأسطر هي ما يقوم عليه المقسّم
    .replace(/<\/(p|div|li|tr|h[1-6]|br)[^>]*>/gi, '\n')
    .replace(/<br[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/\n{3,}/g, '\n\n');
}

function fromDocx(buf){
  // DOCX = أرشيف zip وفيه word/document.xml — الفقرات <w:p> والنص داخل <w:t>
  const files = safeUnzip(buf, /^word\/document\.xml$/);
  const doc = files['word/document.xml'];
  if (!doc) throw fileError('ملف DOCX بلا document.xml');
  const xml = strFromU8(doc);
  // كل فقرة سطر — نحافظ على بنية الأسطر لأن المقسّم يعتمد عليها
  return xml
    .split(/<w:p[ >]/).slice(1)
    .map(p => (p.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [])
      .map(t => t.replace(/<[^>]+>/g, ''))
      .join(''))
    .join('\n')
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'");
}

/*
  PPTX: محاضرةٌ فيها أسئلة المراجعة في آخر الشرائح — يرفعها الطلاب كثيرًا.
  كل شريحة ملفُ XML مستقل، ونصّها في <a:t>، فنقرأ الشرائح بترتيبها الرقمي.
*/
function fromPptx(buf){
  const files = safeUnzip(buf, /^ppt\/slides\/slide\d+\.xml$/);
  const slides = Object.keys(files)
    .sort((a, b) => (parseInt(a.match(/(\d+)/)[1], 10) - parseInt(b.match(/(\d+)/)[1], 10)));
  if (!slides.length) throw fileError('ملف PPTX بلا شرائح');
  return slides.map(n => strFromU8(files[n])
      .split(/<a:p[ >]/).slice(1)
      .map(p => (p.match(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g) || [])
        .map(t => t.replace(/<[^>]+>/g, '')).join(''))
      .join('\n'))
    .join('\n\n')
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'");
}

/*
  PDF بسقفٍ للصفحات ومهلة: محلّل pdf.js القديم داخل pdf-parse بلا مهلة،
  وملفٌ من آلاف الصفحات أو بجداول xref معطوبة يشغله حتى تقطعه Vercel.
  ١٥٠ صفحة تكفي أي بنك أسئلة؛ وما بعدها يُرفع أجزاءً.
*/
const PDF_MAX_PAGES = 150, PDF_TIMEOUT_MS = 25000;
async function fromPdf(buf){
  const pdfParse = require('pdf-parse');
  let timer;
  const bomb = new Promise((_, rej) => { timer = setTimeout(() =>
    rej(fileError('قراءة PDF طالت أكثر من اللازم — جرّب ملفًا أصغر أو صدّره نصًّا')), PDF_TIMEOUT_MS); });
  try {
    const r = await Promise.race([pdfParse(buf, { max: PDF_MAX_PAGES }), bomb]);
    return r.text || '';
  } finally { clearTimeout(timer); }
}

/*
  ★ الصيغ النصية الصريحة، ثم حارسٌ أخير.
  كان الامتداد المجهول يُرفض فورًا — فملفٌ اسمه «أسئلة.text» أو «bank.md»
  أو نُسخةٌ حُفظت بلا امتداد تُردّ وهي نصٌّ سليم. فبدل الرفض نسأل المحتوى
  نفسه: إن قُرئ نصًّا صالحًا بلا حروف تحكّم فهو نص، ومن حقّه أن يُقرأ.
*/
const TEXTY = ['txt','text','md','markdown','csv','tsv','rtf','json','log',''];

function looksLikeText(buf){
  const head = buf.slice(0, 4096).toString('utf8');
  if (!head.trim()) return false;
  // محارف تحكّم (عدا الجدولة والسطر والإرجاع) دليلُ ملفٍ ثنائي
  const bad = (head.match(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g) || []).length;
  return bad / head.length < 0.01;
}

/*
  ★ الصور صيغةٌ مقبولة لا مرفوضة.
  أسئلة الدفعات تعيش في لقطات شاشة وتصوير أوراق — وهذا أكثر ما يملكه
  الطلاب، وكان أول ما نردّه. الامتداد يقول إنها صورة، ونوعها يُقال للنموذج.
*/
const IMAGE_MIME = { png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg',
                     webp:'image/webp', gif:'image/gif', heic:'image/heic', heif:'image/heif' };
function imageMime(filename){
  const ext = String(filename || '').toLowerCase().split('.').pop();
  return IMAGE_MIME[ext] || null;
}
function isImage(filename){ return !!imageMime(filename); }

async function extract(filename, buf){
  const ext = String(filename || '').toLowerCase().split('.').pop();
  if (IMAGE_MIME[ext]) return '';       // لا نصَّ يُستخرج — تُقرأ صورةً في ingest
  if (ext === 'docx') return fromDocx(buf);
  if (ext === 'pptx') return fromPptx(buf);
  if (ext === 'pdf')  return fromPdf(buf);
  if (ext === 'html' || ext === 'htm') return fromHtml(buf);
  if (TEXTY.indexOf(ext) !== -1) return fromTxt(buf);
  if (looksLikeText(buf)) return fromTxt(buf);
  throw fileError('صيغة غير مدعومة: ' + ext +
                  ' — المسموح: PDF أو DOCX أو PPTX أو HTML أو نص');
}

module.exports = { extract, fromTxt, fromDocx, fromPdf, fromPptx, fromHtml, looksLikeText,
                   imageMime, isImage, IMAGE_MIME, safeUnzip, MAX_ENTRY, MAX_TOTAL, PDF_MAX_PAGES };
