'use strict';
/*
  /api/ai — الخطوة ٢ «افهمه بالذكاء»:
  يستقبل دفعة أسئلة (لا الملف كله — الدفعات تحمي من المهلة وتسمح باستئناف الرفع)،
  ينادي Claude، ثم يفرض قاعدة القداسة على الرد قبل إعادته.
  المفتاح في process.env حصرًا — لا يصل المتصفح أبدًا.
*/
const { enforce, verbatimOk } = require('./_lib/sanctity.js');

/*
  برومبتان لا واحد. السبب أن البرومبت الصارم يقول للنموذج «لا تلمس النص»،
  فلو استعملناه في النمط المحسَّن لن يحسّن شيئًا. ولو استعملنا المتساهل في
  الصارم لأتعبنا الطبقة الثانية بردود ترفضها كلها.
*/
const SYS_COMMON = [
  'لكل سؤال أعد JSON فقط بالحقول:',
  'answer_index (رقم يبدأ من 0 للاجابة الصحيحة من المراجع القياسية)،',
  'expl_ar (شرح عربي: لماذا الاجابة صحيحة ولماذا غيرها خاطئ)، expl_en (الشرح بالانجليزية)،',
  'translation (ترجمة عربية لنص السؤال)، topic (محور المادة الانسب)،',
  'mnemonic (بطاقة حفظ: {cue: الكلمة الدالة في السؤال, key: الكلمة المفتاحية في الاجابة, link: رابط ذهني قصير, strike: كيف يشطب المشتتات})،',
  'وللسؤال بلا خيارات: distractors (ثلاثة مشتتات معقولة من نفس المجال بنفس لغة الاجابة).',
  'أعد مصفوفة JSON واحدة بترتيب الاسئلة نفسه، بلا أي نص خارجها.'
].join('\n');

const SYS_STRICT = [
  'أنت مساعد محتوى طبي تعليمي لمنصة مراجعة لطلاب التخصصات الصحية.',
  'القاعدة المقدسة: لا تعدل نص السؤال ولا الخيارات إطلاقا - ستتجاهل المنظومة أي تعديل منك عليها.',
  SYS_COMMON
].join('\n');

const SYS_ENHANCED = [
  'أنت مساعد محتوى طبي تعليمي لمنصة مراجعة لطلاب التخصصات الصحية.',
  'صاحب البنك طالب رفع ملفه ليراجع منه، وطلب تحسين الصياغة.',
  'أضف حقل q_enhanced: نفس السؤال بصياغة أوضح - صحح الاملاء والترقيم واكمل المختصرات الغامضة.',
  'ممنوع تغيير معنى السؤال او صعوبته او الاجابة الصحيحة. لو كان النص واضحا اصلا فأعده كما هو.',
  'وأضف options_enhanced: نفس الخيارات بنفس العدد وبنفس الترتيب تماما بعد تنظيف الاملاء فقط.',
  'اعادة ترتيب الخيارات ممنوعة منعا باتا - موضع الاجابة رقم، واي ترتيب جديد يجعله يشير لخيار خاطئ.',
  SYS_COMMON
].join('\n');

async function callClaude(batch, mode){
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY غير مضبوط في متغيرات البيئة');
  const model = process.env.AI_MODEL || 'claude-sonnet-4-5';
  const user = JSON.stringify(batch.map(q => ({
    q: q.q,
    options: q.has_options ? q.options : null,
    teacher_answer_letter: q.answer_letter || null,
    teacher_answer_text: q.answer_text || null
  })));
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{
      'x-api-key': key,
      'anthropic-version':'2023-06-01',
      'content-type':'application/json'
    },
    body: JSON.stringify({
      model, max_tokens: 8192,
      system: mode === 'enhanced' ? SYS_ENHANCED : SYS_STRICT,
      messages: [{ role:'user', content: user }]
    })
  });
  if (!res.ok) throw new Error('رد الذكاء ' + res.status + ': ' + (await res.text()).slice(0, 300));
  const data = await res.json();
  const text = (data.content && data.content[0] && data.content[0].text) || '[]';
  // النموذج قد يلفّ الرد بسياج كود — ننتزع المصفوفة
  const m = text.match(/\[[\s\S]*\]/);
  return JSON.parse(m ? m[0] : text);
}

module.exports = async function handler(req, res){
  if (req.method !== 'POST') return res.status(405).json({ error:'POST فقط' });
  try{
    const { questions, sanctity_mode } = req.body || {};
    if (!Array.isArray(questions) || !questions.length)
      return res.status(400).json({ error:'أرسل مصفوفة questions' });
    if (questions.length > 25)
      return res.status(400).json({ error:'حد الدفعة ٢٥ سؤالًا — قسّم الملف دفعات' });
    // أي قيمة غير معروفة تسقط إلى strict: الافتراض الآمن هو عدم المساس بالنص
    const mode = sanctity_mode === 'enhanced' ? 'enhanced' : 'strict';

    const aiOut = await callClaude(questions, mode);

    // الطبقة الثانية من قاعدة القداسة: الأصل يُحفظ دائمًا، ويفوز على النموذج في strict
    const enforced = questions.map((orig, i) => {
      const item = enforce(orig, aiOut[i] || {}, mode);
      if (!verbatimOk(orig, item))
        throw new Error('فشل فحص المطابقة الحرفية للسؤال ' + (i + 1) + ' — أُوقفت الدفعة');
      return item;
    });
    return res.status(200).json({ ok:true, sanctity_mode: mode, questions: enforced });
  } catch(e){
    return res.status(500).json({ error: e.message });
  }
};
module.exports.callClaude = callClaude;
module.exports.SYS_STRICT = SYS_STRICT;
module.exports.SYS_ENHANCED = SYS_ENHANCED;
