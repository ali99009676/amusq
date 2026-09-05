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
const { extract, imageMime } = require('./_lib/extract.js');
const { parse } = require('./_lib/parser.js');
const { slugify } = require('./_lib/sanctity.js');
const { aiRead, aiReadPart, aiReadMedia, chunkText } = require('./_lib/reader.js');
const { callAI, pickProvider } = require('./_lib/provider.js');
const supa = require('./_lib/supa.js');
const guard = require('./_lib/guard.js');

/*
  ★ الملف الكبير يأتي من مخزن Supabase لا في جسم الطلب.
  Vercel يرفض جسمًا فوق ٤٫٥ ميغابايت — فكان PDF الدكتور ذو الثلاثين صفحة
  يُردّ بصمت. المتصفح يرفعه إلى المخزن مباشرةً (حدّه ٥٠ ميغابايت) ويرسل
  مساره، والخادم يجلبه بمفتاح الخدمة. المسار يبدأ بمعرّف الرافع، والحارس
  الوحيد الذي نحتاجه هنا: أن يكون الطالب المسجَّل هو صاحب المجلد.
*/
/*
  ★ ومنذ «ارفعها عنّي» لم يعد المجلد وحده هو الحكم.
  المشرف يرفع بنكًا أرسله له طالب، فالملف في مجلد الطالب لا في مجلده. لكن
  «هل هو مشرف؟» سؤالٌ لا يُصدَّق فيه العميل — نسأله القاعدةَ برمز صاحب
  الجلسة نفسه (can_read_upload تقرأ auth.uid من الرمز، فلا تُزوَّر).
  وإن لم تكن الدالة منشورة بعد بقي الحكم القديم كما هو: مجلده وحده.
*/
async function canReadUpload(clean, userId, token){
  if (userId && clean.slice(0, 37) === userId + '/') return true;
  try { return (await supa.rpc('can_read_upload', { p_path: clean }, token)) === true; }
  catch(e){ return false; }
}

/*
  ★ شكل المسار واحدٌ لا غير: <uuid>/<اسم ملف واحد> — كما يكتبه storageUpload
  في المتصفح (معرّف الرافع، شرطة مائلة واحدة، ثم اسمٌ من حروف وأرقام ونقاط).
  كان الحكم «يبدأ بمعرّفي» فيمرّ «معرّفي/../../auth/v1/admin/users»: النقطتان
  لا يُرمّزهما encodeURIComponent، ومحلّل الروابط في fetch يطويهما — فيقرأ
  الخادم بمفتاح الخدمة أي مسارٍ في المشروع لا ملفًا في المخزن (تدقيق C-02).
  فالمسار يُرفض قبل أن يلمس الشبكة إن خرج عن الشكل، ثم يُحكم على الرابط
  بعد تطبيعه: نفس الأصل ونفس المجلد وإلا لا طلب.
*/
const SAFE_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[\w.\-\u0600-\u06FF]{1,120}$/i;
const UPLOADS = '/storage/v1/object/uploads/';
function safeStoragePath(storagePath){
  const clean = String(storagePath || '').replace(/^\/+/, '');
  if (!SAFE_PATH.test(clean)) return null;
  const name = clean.split('/')[1];
  if (name === '.' || name === '..') return null;
  return clean;
}

async function fetchFromStorage(storagePath, userId, token, fetchFn){
  const { url, key } = supa.creds();
  const clean = safeStoragePath(storagePath);
  if (!clean) throw Object.assign(new Error('مسار الملف غير صالح'), { status: 400, kind: 'file' });
  if (!(await canReadUpload(clean, userId, token)))
    throw Object.assign(new Error('مسار الملف ليس لصاحب الجلسة'), { status: 403, kind: 'file' });
  const target = new URL(UPLOADS + clean.split('/').map(encodeURIComponent).join('/'), url);
  if (target.origin !== new URL(url).origin || target.pathname.indexOf(UPLOADS) !== 0 || target.search || target.hash)
    throw Object.assign(new Error('مسار الملف غير مسموح'), { status: 400, kind: 'file' });
  const r = await (fetchFn || fetch)(target.href, {
    headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
  });
  if (!r.ok) throw new Error('تعذّر جلب الملف من المخزن (' + r.status + ')');
  return Buffer.from(await r.arrayBuffer());
}

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

/* سقف الصور في الطلب الواحد: ورقةٌ مصوَّرة من زوايا، لا ألبومًا كاملًا */
const MAX_IMAGES = 16;

module.exports = async function handler(req, res){
  if (req.method !== 'POST') return res.status(405).json({ error:'POST فقط' });
  try{
    /*
      ★ الهوية أولًا — قبل أي قراءة. كانت الجلسة تُطلب في مسار المخزن وحده
      لأنه الوحيد الذي يحتاج «من هو»؛ لكن قراءة الصور والأجزاء بالذكاء أغلى
      ما في المنصة، وبابٌ بلا جلسة فاتورةٌ يدفعها علي عن غرباء (تدقيق H-03).
    */
    const who = await guard.requireUser(req);
    if (!who) return res.status(401).json({ error:'جلسة غير صالحة', kind:'auth' });
    const { user, token } = who;
    await guard.rateLimit(user.id, 'ingest', 150, 600);

    const { filename, subject_name, sanctity_mode, force_ai, images, storage_path, text_part } = req.body || {};
    let content_base64 = (req.body || {}).content_base64;

    if (Array.isArray(images) && images.length > MAX_IMAGES)
      return res.status(400).json({ error:'حدّ الصور ' + MAX_IMAGES + ' في الطلب الواحد — أرسل الباقي في طلبٍ آخر', kind:'file' });

    /*
      ═══ وضع الجزء: قراءةُ نصٍّ واحدٍ بالذكاء ═══
      المتصفح يرسل الأجزاء التي أعادها الخادم واحدًا واحدًا (ثلاثة معًا).
      نداءٌ قصير لا يقارب مهلة Vercel، ولا يحمل الملف.
    */
    if (typeof text_part === 'string'){
      if (pickProvider() === 'none') return res.status(503).json({ error:'لا مفتاح ذكاء على الخادم', kind:'no_ai' });
      const r = await aiReadPart(text_part.slice(0, 60000), callAI);
      return res.status(200).json({ ok:true, questions: r.questions, usage: r.usage || null });
    }

    /* ملفٌ في المخزن بدل الجسم — المسار يُفحص شكلًا وملكيةً قبل أي جلب */
    if (storage_path && !content_base64){
      const buf0 = await fetchFromStorage(storage_path, user.id, token);
      content_base64 = buf0.toString('base64');
    }

    /*
      ═══ الصور: بابٌ كان مغلقًا ═══
      ★ أكثر ما يملكه الطلاب لقطات شاشة وتصوير أوراق — وكان أول ما نردّه
      بـ«صدّرها نصًّا». والنموذج يقرأ الصورة أصلًا؛ الناقص كان أن نمرّرها.

      تصل الصور بإحدى صورتين: مصفوفة `images` (عدة لقطات لورقة واحدة —
      وتُرسل معًا كي يُجمع سؤالٌ مقطوع بين لقطتين)، أو ملفٌ واحد بامتداد
      صورة في content_base64. وملف PDF بلا نصٍّ مستخرَج هو مسحٌ ضوئي،
      فيُرسل PDFًا كما هو — النموذج يقرؤه صفحةً صفحة.
    */
    const media = [];
    if (Array.isArray(images)) images.forEach(im => {
      const mime = im && imageMime(im.filename || '');
      if (mime && im.content_base64) media.push({ mime, base64: String(im.content_base64) });
    });
    if (!media.length && filename && content_base64 && imageMime(filename))
      media.push({ mime: imageMime(filename), base64: String(content_base64) });

    if (!media.length && (!filename || !content_base64))
      return res.status(400).json({ error:'أرسل filename و content_base64' });

    const totalBytes = media.length
      ? media.reduce((n, m) => n + Math.floor(m.base64.length * 0.75), 0)
      : Buffer.from(content_base64, 'base64').length;
    if (totalBytes > 15 * 1024 * 1024) return res.status(413).json({ error:'الملف أكبر من ١٥ ميغابايت' });

    let text = '';
    let buf = null;
    if (!media.length){
      buf = Buffer.from(content_base64, 'base64');
      text = await extract(filename, buf);
      // PDF بلا نصّ = مسحٌ ضوئي: يُرسل للنموذج ملفًا لا نصًّا
      if (!String(text || '').trim() && /\.pdf$/i.test(filename))
        media.push({ mime:'application/pdf', base64: String(content_base64) });
    }

    const mediaName = media.length
      ? (filename || (Array.isArray(images) && images[0] && images[0].filename) || 'صور')
      : filename;

    /* ═══ مسار الوسائط: لا قواعد — الذكاء وحده يرى ═══ */
    if (media.length){
      if (pickProvider() === 'none')
        return res.status(503).json({ error:
          'قراءة الصور تحتاج مفتاح ذكاء على الخادم — أو ارفع الأسئلة نصًّا.', kind:'no_ai' });
      const r = await aiReadMedia(media, callAI);
      if (!r.questions.length)
        return res.status(r.error ? (r.error.status || 503) : 422).json({
          error: r.error ? r.error.message
            : 'لم نقرأ سؤالًا واحدًا من الصور — تأكّد أنها واضحة ومضاءة وغير مقلوبة، أو ارفع لقطةً أقرب.',
          kind: r.error ? (r.error.kind || 'other') : 'file' });
      const name = String(subject_name || '').trim() || String(mediaName).replace(/\.[^.]+$/, '');
      return res.status(200).json({
        ok: true, filename: mediaName, subject_name: name, slug: slugify(name),
        sanctity_mode: sanctity_mode === 'enhanced' ? 'enhanced' : 'strict',
        read_by: 'ai', from_images: media.length,
        total: r.questions.length,
        with_options: r.questions.filter(q => q.has_options).length,
        with_answers: r.questions.filter(q => q.answer !== null && q.answer !== undefined || q.answer_text).length,
        /* ★ كلها «غير موثَّقة» بالمعنى الحرفي: لا نصَّ نقارن به. والرافع
           يراها بعلامتها ويقرؤها بعينه — هذا هو التوثيق هنا. */
        unverified: r.questions.length,
        questions: r.questions
      });
    }

    /*
      نصٌّ فارغ من ملفٍ ليس PDF ولا صورة: DOCX فارغ أو نصٌّ أبيض
    */
    if (!String(text || '').trim())
      return res.status(422).json({ error:
        'الملف لا يحتوي نصًّا يمكن قراءته. إن كانت الأسئلة صورًا فارفعها صورًا مباشرة — صرنا نقرؤها.' });

    let questions = parse(text);
    let readBy = 'rules';

    let aiErr = null;
    const wantAi = force_ai === true || !rulesLookSound(questions);
    /*
      ★ الملف الذي يحتاج الذكاء لا يُقرأ هنا — يُقسَّم ويُعاد.
      نصٌّ من ثلاثين صفحة يعني عشرين دفعة؛ قراءتها في نداءٍ واحد تصطدم
      بمهلة الخادم مهما وازينا. فنعيد الأجزاء وما التقطته القواعد، والمتصفح
      يقرأ الأجزاء متوازيةً بنداءاتٍ قصيرة (وضع text_part أعلاه). الملف
      الصغير (≤ ٤ أجزاء) يُقرأ هنا مباشرةً — رحلةٌ واحدة أرخص من خمس.
    */
    if (wantAi && pickProvider() !== 'none') {
      const parts = chunkText(text);
      if (parts.length > 4){
        const name0 = String(subject_name || '').trim() || filename.replace(/\.[^.]+$/, '');
        return res.status(200).json({
          ok:true, need_ai:true, filename, subject_name: name0, slug: slugify(name0),
          sanctity_mode: sanctity_mode === 'enhanced' ? 'enhanced' : 'strict',
          parts, rules_questions: questions, text_len: text.length
        });
      }
      const r = await aiRead(text, callAI);
      aiErr = r.error || null;
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

    /*
      ★ العطل عندنا يُقال إنه عندنا.
      إن عجزت القواعد ثم عجز الذكاء لعطلٍ فيه — لا لعيبٍ في الملف — فإلقاء
      اللوم على ملف الطالب كذبٌ يجعله يعيد تنسيق ملفٍ سليم مرارًا بلا فائدة.
    */
    if (!questions.length && aiErr)
      return res.status(aiErr.status || 503).json({
        error: aiErr.message, kind: aiErr.kind || 'other' });

    if (!questions.length)
      return res.status(422).json({ error:
        'لم نتعرّف على سؤال واحد في هذا الملف. تأكد أن كل سؤال يليه خياراته — ' +
        'وانظر «قالب بنك الأسئلة» أسفل الصفحة. وإن كانت الأسئلة صورًا فارفعها صورًا.',
        kind:'file' });

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
    return guard.fail(res, e, 'ingest');
  }
};
module.exports.rulesLookSound = rulesLookSound;
module.exports.fetchFromStorage = fetchFromStorage;
module.exports.safeStoragePath = safeStoragePath;
module.exports.SAFE_PATH = SAFE_PATH;
