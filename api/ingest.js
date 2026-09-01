'use strict';
/*
  /api/ingest — الخطوة ١ «اقرأ الملف»:
  يستقبل الملف base64، يستخرج نصه، يقسّمه أسئلة، ويعيدها للمشرف كما هي.

  ★ للقراءة طريقان لا طريق واحد:
    ١) القواعد (parser.js): مجانية وفورية، لكنها تشترط انضباطًا في الشكل.
    ٢) الذكاء (reader.js): يقرأ أي شكل كما يقرؤه إنسان.

  والقواعد تُجرَّب أولًا دائمًا — لا لأنها أدقّ بل لأنها أرخص وأسرع، وملفٌ
  مرتّب لا يستحق انتظار الذكاء. فإن عجزت أو جاءت بحصادٍ مشبوه، قرأ الذكاء.
  كان الطالب قبل هذا يُردّ بـ«لم نتعرّف على سؤال واحد» وملفُه سليم — يخسر
  المنصةَ عند أول احتكاك بها، وهي أسوأ لحظة يمكن أن تخسره فيها.
*/
const { extract } = require('./_lib/extract.js');
const { parse } = require('./_lib/parser.js');
const { slugify } = require('./_lib/sanctity.js');
const { aiRead } = require('./_lib/reader.js');
const { callAI, pickProvider } = require('./_lib/provider.js');

/*
  متى نثق بالقواعد فلا نزعج الذكاء؟
  حين تجد عددًا معتبرًا من الأسئلة وأغلبها بخيارات — وهذه بصمة الملف
  المرتّب الذي كُتب أصلًا بالشكل الذي تفهمه. أما ثلاثة أسئلة من ملفٍ من
  عشرين صفحة، أو أسئلةٌ كلُّها بلا خيارات، فحصادٌ يقول إن الشكل فاتها.
*/
function rulesLookSound(qs){
  if (qs.length < 3) return false;
  const withOpts = qs.filter(q => q.has_options).length;
  return (withOpts / qs.length) >= 0.6;
}

module.exports = async function handler(req, res){
  if (req.method !== 'POST') return res.status(405).json({ error:'POST فقط' });
  try{
    const { filename, content_base64, subject_name, sanctity_mode, force_ai } = req.body || {};
    if (!filename || !content_base64) return res.status(400).json({ error:'أرسل filename و content_base64' });
    const buf = Buffer.from(content_base64, 'base64');
    if (buf.length > 15 * 1024 * 1024) return res.status(413).json({ error:'الملف أكبر من ١٥ ميغابايت' });

    const text = await extract(filename, buf);

    /*
      نصٌّ فارغ = ملفٌ مصوَّر (سكانر أو لقطات شاشة داخل PDF). الذكاء لا يفيد
      هنا لأنه لا يرى صورًا في هذا المسار، فنقولها صريحة بدل أن نرسل فراغًا.
    */
    if (!String(text || '').trim())
      return res.status(422).json({ error:
        'الملف لا يحتوي نصًّا يمكن قراءته — يبدو أنه صور ممسوحة ضوئيًا. ' +
        'صدّره نصًّا (Word أو PDF نصّي) وأعد رفعه.' });

    let questions = parse(text);
    let readBy = 'rules';

    const wantAi = force_ai === true || !rulesLookSound(questions);
    if (wantAi && pickProvider() !== 'none') {
      const r = await aiRead(text, callAI);
      /*
        ★ الأكثر يفوز — لا «الذكاء دائمًا».
        القواعد أحيانًا تقرأ ملفًا مرتّبًا أنظفَ من الذكاء، فلو أزحناها
        بلا مقارنة لخسرنا حصادًا أفضل. والمقارنة بالعدد لأنها الوحيدة
        الموضوعية هنا: سؤالٌ التُقط خيرٌ من سؤالٍ ضاع.
      */
      if (r.questions.length > questions.length) {
        questions = r.questions;
        readBy = 'ai';
      }
    }

    if (!questions.length)
      return res.status(422).json({ error:
        'لم نتعرّف على سؤال واحد في هذا الملف. تأكد أن الأسئلة نصٌّ لا صور، ' +
        'وأن كل سؤال يليه خياراته — وانظر «قالب بنك الأسئلة» أسفل الصفحة.' });

    // اسم المادة من الطالب إن أعطاه، وإلا من اسم الملف بلا امتداده
    const name = String(subject_name || '').trim() || filename.replace(/\.[^.]+$/, '');
    return res.status(200).json({
      ok: true,
      filename,
      subject_name: name,
      slug: slugify(name),
      sanctity_mode: sanctity_mode === 'enhanced' ? 'enhanced' : 'strict',
      read_by: readBy,
      total: questions.length,
      with_options: questions.filter(q => q.has_options).length,
      with_answers: questions.filter(q => q.answer !== null && q.answer !== undefined || q.answer_text).length,
      // كم سؤالًا لم نجد نصّه حرفًا بحرف في الملف — يراه الرافع ويراجعه
      unverified: questions.filter(q => q.unverified).length,
      questions
    });
  } catch(e){
    return res.status(500).json({ error:'تعذّرت قراءة الملف: ' + e.message });
  }
};
module.exports.rulesLookSound = rulesLookSound;
