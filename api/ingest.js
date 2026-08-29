'use strict';
/*
  /api/ingest — الخطوة ١ «اقرأ الملف»:
  يستقبل الملف base64، يستخرج نصه، يقسّمه أسئلة، ويعيدها للمشرف كما هي.
  لا ذكاء هنا — القراءة والتقسيم فقط، كي يرى المشرف العدد والتقدير قبل أي تكلفة.
*/
const { extract } = require('./_lib/extract.js');
const { parse } = require('./_lib/parser.js');

module.exports = async function handler(req, res){
  if (req.method !== 'POST') return res.status(405).json({ error:'POST فقط' });
  try{
    const { filename, content_base64 } = req.body || {};
    if (!filename || !content_base64) return res.status(400).json({ error:'أرسل filename و content_base64' });
    const buf = Buffer.from(content_base64, 'base64');
    if (buf.length > 15 * 1024 * 1024) return res.status(413).json({ error:'الملف أكبر من ١٥ ميغابايت' });

    const text = await extract(filename, buf);
    const questions = parse(text);
    return res.status(200).json({
      ok: true,
      filename,
      total: questions.length,
      with_options: questions.filter(q => q.has_options).length,
      with_answers: questions.filter(q => q.answer !== null && q.answer !== undefined || q.answer_text).length,
      questions
    });
  } catch(e){
    return res.status(500).json({ error:'تعذّرت قراءة الملف: ' + e.message });
  }
};
