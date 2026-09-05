'use strict';
/*
  /api/ai — الخطوة ٢ «افهمه بالذكاء»:
  يستقبل دفعة أسئلة (لا الملف كله — الدفعات تحمي من المهلة وتسمح باستئناف الرفع)،
  ينادي Claude، ثم يفرض قاعدة القداسة على الرد قبل إعادته.
  المفتاح في process.env حصرًا — لا يصل المتصفح أبدًا.
*/
const { enforce, verbatimOk } = require('./_lib/sanctity.js');
const { callAI } = require('./_lib/provider.js');
const supa = require('./_lib/supa.js');
const guard = require('./_lib/guard.js');

/*
  برومبتان لا واحد. السبب أن البرومبت الصارم يقول للنموذج «لا تلمس النص»،
  فلو استعملناه في النمط المحسَّن لن يحسّن شيئًا. ولو استعملنا المتساهل في
  الصارم لأتعبنا الطبقة الثانية بردود ترفضها كلها.
*/
/*
  ★ معيار AMSU — لا وصفٌ مجرّد بل مثالٌ من مواد علي نفسها.
  الوصف المجرّد («شرح مركز في جملتين») أنتج شرحًا فقيرًا: جملة تكرّر
  الإجابة ولا تعلّم. والنموذج يقلّد ما يرى أدقّ مما يُوصف له، فوضعنا له
  مثالًا حقيقيًا من AMSU بأطوالها المقيسة (شرح ~٥٠٠ حرف، حيلة ~٨٥).
  هذا هو ما يجعل مادة الطالب تخرج بمستوى مواد علي بلا يدٍ بشرية.
*/
const GOLD = JSON.stringify({
  answer_index: 1,
  expl_ar: 'الكيتامين مخدّر انفصالي يعمل بحصر مستقبلات NMDA، فيفصل الإدراك عن الإحساس ويظهر المريض شاخصًا غائبًا عن محيطه. الإسهال الشديد ليس من صورته إطلاقًا، وبطء القلب خاطئ لأن الكيتامين يرفع النبض والضغط بتنشيطه الودّي، وتضيّق الحدقة علامة الأفيونات لا الكيتامين الذي يوسّع الحدقة. المعلومة المفتاحية: الانفصال + توسّع الحدقة + تسرّع القلب = كيتامين.',
  expl_en: 'Ketamine is a dissociative anaesthetic acting through NMDA-receptor blockade, separating perception from sensation; the patient appears awake yet detached. Severe diarrhea is unrelated, bradycardia is wrong because ketamine raises heart rate and blood pressure via sympathetic stimulation, and miosis belongs to opioids while ketamine causes mydriasis. Key point: dissociation + dilated pupils + tachycardia = ketamine.',
  translation: 'أي علامة سريرية هي الأكثر تميّزًا لتسمّم الكيتامين؟',
  topic: 'المهلوسات والمواد النفسية',
  mnemonic: {
    cue: 'ketamine',
    key: 'Dissociation',
    link: 'كيتامين ⟵ اسمها فيها «كِتْ» يعني يقطع. يقطع العقل عن الجسم ⟵ Dissociation. المريض عينه مفتوحة بس هو مو موجود.',
    strike: 'شوف كلمة ketamine وامسك Dissociation فورًا. اشطب Severe diarrhea و Bradycardia و Miosis — الكيتامين يوسّع الحدقة ويسرّع القلب لا يبطّئه.'
  }
});

const SYS_COMMON = [
  'لكل سؤال أعد كائن JSON بهذه الحقول بالضبط:',
  'answer_index (رقم يبدأ من 0 للاجابة الصحيحة)،',
  'expl_ar، expl_en، translation، topic، mnemonic{cue,key,link,strike}.',
  '',
  'هذا مثال على المستوى المطلوب حرفيًا — قلّده في العمق والأسلوب والطول:',
  GOLD,
  '',
  'قواعد الجودة:',
  '- expl_ar من ٣ إلى ٤ جمل (٤٠٠ حرف فأكثر): جملة تشرح آلية الإجابة الصحيحة،',
  '  ثم جملة تمرّ على كل خيار خاطئ وتقول لماذا هو خطأ تحديدًا، ثم تختم بسطر',
  '  يبدأ بـ«المعلومة المفتاحية:» يلخّص ما يجب أن يبقى في ذهن الطالب.',
  '- expl_en: نفس المضمون بالإنجليزية الطبية، ينتهي بـ"Key point:".',
  '- translation: ترجمة عربية دقيقة لنص السؤال (وإن كان السؤال عربيًا فأعده كما هو).',
  '- mnemonic.link: حيلة حفظ منحوتة من الكلمة نفسها — اشتقاق أو تشابه صوتي أو',
  '  صورة ذهنية، بالعامية البيضاء المفهومة، لا إعادة صياغة للإجابة.',
  '- mnemonic.strike: كيف يشطب الطالب المشتتات في الامتحان، مع ذكرها بأسمائها.',
  '- topic: اسم محور عربي مختصر يجمع الأسئلة المتشابهة (وحّد التسمية بين الأسئلة).',
  '- للسؤال بلا خيارات: أضف distractors (ثلاثة مشتتات معقولة من نفس المجال وبنفس لغة الاجابة).',
  '',
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

/*
  الاسم بقي callClaude ولم يعد يعني Claude وحدها — يمرّ عبر المحوّل،
  والمزوّد يُختار من متغيّرات البيئة. أبقيناه لأن اختباراتٍ ومستدعياتٍ
  تعرفه بهذا الاسم، وتغيير اسمٍ لا يشتري شيئًا يكسر ما يعمل.
*/
async function callClaude(batch, mode){
  const user = JSON.stringify(batch.map(q => ({
    q: q.q,
    options: q.has_options ? q.options : null,
    teacher_answer_letter: q.answer_letter || null,
    teacher_answer_text: q.answer_text || null
  })));
  /*
    ★ سقف الخرج ٣٢ ألفًا لا الافتراضي ٨.
    بعد رفع المعيار صار كل سؤال ينتج ~٩٠٠ حرف (شرحان وترجمة وحيلتان)،
    فدفعة ٤٠ سؤالًا تحتاج أضعاف السقف القديم — وتجاوزه يقطع الردّ في
    منتصف سؤال فتُهدر الدفعة كلها. المهلة كذلك: التوليد الطويل أبطأ.
  */
  /* ★ الدفعة صارت ١٢ سؤالًا (33-admin.js) فيكفيها ١٦ ألفًا، والمهلة ٥٥ ثانية:
     خادم Vercel يقطع عند الدقيقة — دفعةٌ تنجو في ٤٠ ثانية خيرٌ من دفعةٍ
     أطول تُقطع فتُهدر كلها. */
  const r = await callAI(mode === 'enhanced' ? SYS_ENHANCED : SYS_STRICT, user,
                         { maxTokens: 16384, timeoutMs: 55000 });
  const parsed = r.items;
  /* الاستهلاك والنموذج والمزوّد كما أبلغ عنه الخادم لا كما نخمّن.
     غير قابلة للعدّ كي لا تختلط بعناصر المصفوفة عند أي map لاحق. */
  Object.defineProperty(parsed, '_usage',    { value: r.usage,    enumerable: false });
  Object.defineProperty(parsed, '_model',    { value: r.model,    enumerable: false });
  Object.defineProperty(parsed, '_provider', { value: r.provider, enumerable: false });
  return parsed;
}

/*
  ★ الخصم في الخادم لا في المتصفح.
  كان المتصفح يخصم الرصيد (spend_credits) ثم ينادي هذا المسار — ولا شيء
  يربط النداءين: من يتجاوز الخصم يُثري مجانًا على فاتورة المنصة، وكانت
  الدالة نفسها بلا جلسة أصلًا (تدقيق H-02). الآن: الهوية من Supabase، ثم
  الخصم بمفتاح الخدمة (spend_credits_for — لا تُنادى إلا من الخادم، والسعر
  من الإعدادات لا من الطلب)، ثم الذكاء، وإن سقط الذكاء رُدّ الرصيد هنا.
*/
async function debit(userId, count, draftId){
  let pay;
  try {
    pay = await supa.rpc('spend_credits_for', { p_user: userId, p_questions: count, p_draft: draftId || null });
  } catch(e){
    /* الدالة غير منشورة بعد = الباب مغلق لا مفتوح: لا إثراء بلا خصم */
    const err = new Error('الإثراء متوقف مؤقتًا — نفّذ db/HARDEN-1.sql على القاعدة');
    err.status = 503; err.kind = 'setup';
    throw err;
  }
  if (!pay || !pay.ok){
    const d = pay || {};
    const err = new Error(d.reason === 'insufficient'
      ? 'رصيدك ' + (d.balance || 0) + ' كوين ولا يكفي — يلزم ' + (d.needed || count)
      : d.reason === 'closed' ? 'الإثراء موقوف مؤقتًا' : 'تعذّر حسم الرصيد');
    err.status = 402; err.kind = d.reason || 'credits';
    err.balance = d.balance || 0; err.needed = d.needed || 0;
    throw err;
  }
  return pay;
}

async function refund(userId, n, draftId){
  try { await supa.rpc('refund_credits', { p_user: userId, n, p_reason:'تعذّرت الدفعة', p_draft: draftId || null }); }
  catch(e){ console.error('[ai] refund failed ' + e.message.slice(0, 120)); }
}

module.exports = async function handler(req, res){
  if (req.method !== 'POST') return res.status(405).json({ error:'POST فقط' });
  try{
    const who = await guard.requireUser(req);
    if (!who) return res.status(401).json({ error:'جلسة غير صالحة', kind:'auth' });
    const { user } = who;
    await guard.rateLimit(user.id, 'ai', 90, 600);

    const { questions, sanctity_mode, draft_id } = req.body || {};
    if (!Array.isArray(questions) || !questions.length)
      return res.status(400).json({ error:'أرسل مصفوفة questions' });
    // ٤٠ بدل ٢٥: التعليمات تُرسل مرة لكل دفعة، فالدفعة الأكبر توزّعها على أسئلة أكثر
    if (questions.length > 40)
      return res.status(400).json({ error:'حد الدفعة ٤٠ سؤالًا — قسّم الملف دفعات' });
    // أي قيمة غير معروفة تسقط إلى strict: الافتراض الآمن هو عدم المساس بالنص
    const mode = sanctity_mode === 'enhanced' ? 'enhanced' : 'strict';
    const draft = /^[0-9a-f-]{36}$/i.test(String(draft_id || '')) ? draft_id : null;

    const pay = await debit(user.id, questions.length, draft);

    let aiOut;
    try { aiOut = await callClaude(questions, mode); }
    catch(e){ if (pay.spent > 0) await refund(user.id, pay.spent, draft); throw e; }

    // الطبقة الثانية من قاعدة القداسة: الأصل يُحفظ دائمًا، ويفوز على النموذج في strict
    let enforced;
    try {
      enforced = questions.map((orig, i) => {
        const item = enforce(orig, aiOut[i] || {}, mode);
        if (!verbatimOk(orig, item))
          throw Object.assign(new Error('فشل فحص المطابقة الحرفية للسؤال ' + (i + 1) + ' — أُوقفت الدفعة'),
                              { status: 422, kind: 'sanctity' });
        return item;
      });
    } catch(e){ if (pay.spent > 0) await refund(user.id, pay.spent, draft); throw e; }
    /* ★ كان هنا `model` مجرّدًا — متغيّرٌ محليٌّ داخل callClaude لا يراه هذا
       النطاق، فكان كل نجاحٍ ينتهي بـ ReferenceError يُلتقط أدناه ويُعاد ٥٠٠.
       أي أن المسار لم يكن ليعمل حتى بمفتاحٍ سليم. */
    return res.status(200).json({ ok:true, sanctity_mode: mode,
                                 model: aiOut._model || null,
                                 provider: aiOut._provider || null,
                                 usage: aiOut._usage || null, questions: enforced,
                                 spent: pay.spent || 0, balance: pay.balance });
  } catch(e){
    /* ★ ٥٠٠ لكل شيء تكذب على المنادي: نفادُ حصّةٍ ليس عطلًا في خادمنا،
       والواجهة تحتاج أن تفرّق كي تعرض المخرج المناسب لا «حاول ثانية».
       والرصيد يرافق خطأ النقص كي تعرضه الواجهة رقمًا. */
    if (e && e.kind === 'insufficient')
      return res.status(402).json({ error: e.message, kind: e.kind, balance: e.balance, needed: e.needed });
    return guard.fail(res, e, 'ai');
  }
};
module.exports.callClaude = callClaude;
module.exports.SYS_STRICT = SYS_STRICT;
module.exports.SYS_ENHANCED = SYS_ENHANCED;
