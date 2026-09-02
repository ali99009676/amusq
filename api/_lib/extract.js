'use strict';

const { unzipSync, strFromU8 } = require('fflate');

function fromTxt(buf){ return buf.toString('utf8'); }

function fromHtml(buf){
  return buf.toString('utf8')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|tr|h[1-6]|br)[^>]*>/gi, '\n')
    .replace(/<br[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/\n{3,}/g, '\n\n');
}

function fromDocx(buf){
  const files = unzipSync(new Uint8Array(buf));
  const doc = files['word/document.xml'];
  if (!doc) throw new Error('ملف DOCX بلا document.xml');
  const xml = strFromU8(doc);
  return xml
    .split(/<w:p[ >]/).slice(1)
    .map(p => (p.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [])
      .map(t => t.replace(/<[^>]+>/g, ''))
      .join(''))
    .join('\n')
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'");
}

function fromPptx(buf){
  const files = unzipSync(new Uint8Array(buf));
  const slides = Object.keys(files)
    .filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => (parseInt(a.match(/(\d+)/)[1], 10) - parseInt(b.match(/(\d+)/)[1], 10)));
  if (!slides.length) throw new Error('ملف PPTX بلا شرائح');
  return slides.map(n => strFromU8(files[n])
      .split(/<a:p[ >]/).slice(1)
      .map(p => (p.match(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g) || [])
        .map(t => t.replace(/<[^>]+>/g, '')).join(''))
      .join('\n'))
    .join('\n\n')
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'");
}

async function fromPdf(buf){
  const pdfParse = require('pdf-parse');
  const r = await pdfParse(buf);
  return r.text || '';
}

const TEXTY = ['txt','text','md','markdown','csv','tsv','rtf','json','log',''];

function looksLikeText(buf){
  const head = buf.slice(0, 4096).toString('utf8');
  if (!head.trim()) return false;
  const bad = (head.match(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g) || []).length;
  return bad / head.length < 0.01;
}

/* الصور صيغةٌ مقبولة — تُقرأ في ingest بالنموذج لا باستخراج نصّ */
const IMAGE_MIME = { png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg',
                     webp:'image/webp', gif:'image/gif', heic:'image/heic', heif:'image/heif' };
function imageMime(filename){
  const ext = String(filename || '').toLowerCase().split('.').pop();
  return IMAGE_MIME[ext] || null;
}
function isImage(filename){ return !!imageMime(filename); }

async function extract(filename, buf){
  const ext = String(filename || '').toLowerCase().split('.').pop();
  if (IMAGE_MIME[ext]) return '';
  if (ext === 'docx') return fromDocx(buf);
  if (ext === 'pptx') return fromPptx(buf);
  if (ext === 'pdf')  return fromPdf(buf);
  if (ext === 'html' || ext === 'htm') return fromHtml(buf);
  if (TEXTY.indexOf(ext) !== -1) return fromTxt(buf);
  if (looksLikeText(buf)) return fromTxt(buf);
  throw new Error('صيغة غير مدعومة: ' + ext +
                  ' — المسموح: PDF أو DOCX أو PPTX أو HTML أو نص أو صور');
}

module.exports = { extract, fromTxt, fromDocx, fromPdf, fromPptx, fromHtml, looksLikeText,
                   imageMime, isImage, IMAGE_MIME };
