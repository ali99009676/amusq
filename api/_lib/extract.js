'use strict';
/*
  استخراج النص من الملفات المرفوعة — TXT مباشرة، DOCX بفكّ الضغط وقراءة XML،
  وPDF عبر pdf-parse. كل هذا في الخادم؛ المتصفح يرسل الملف base64 فقط.
*/
const { unzipSync, strFromU8 } = require('fflate');

function fromTxt(buf){ return buf.toString('utf8'); }

function fromDocx(buf){
  // DOCX = أرشيف zip وفيه word/document.xml — الفقرات <w:p> والنص داخل <w:t>
  const files = unzipSync(new Uint8Array(buf));
  const doc = files['word/document.xml'];
  if (!doc) throw new Error('ملف DOCX بلا document.xml');
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

async function fromPdf(buf){
  const pdfParse = require('pdf-parse');
  const r = await pdfParse(buf);
  return r.text || '';
}

async function extract(filename, buf){
  const ext = String(filename || '').toLowerCase().split('.').pop();
  if (ext === 'txt')  return fromTxt(buf);
  if (ext === 'docx') return fromDocx(buf);
  if (ext === 'pdf')  return fromPdf(buf);
  throw new Error('صيغة غير مدعومة: ' + ext + ' — المسموح: PDF أو DOCX أو TXT');
}

module.exports = { extract, fromTxt, fromDocx, fromPdf };
