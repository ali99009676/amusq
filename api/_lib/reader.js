'use strict';
/*
  قارئ الملفات بالذكاء — الشبكة التي تلتقط ما يسقط من المقسّم.

  لماذا وُجد؟ لأن `parser.js` يفهم شكلين اثنين ويطلبهما بحرفية: رقمٌ في أول
  السطر ثم نقطة أو قوس، وخياراتٌ بحروف A) B). وملفات الدكاترة لا تعرف هذا
  الانضباط: ترقيم عربي ١. أو نقاط تعداد أو بلا ترقيم إطلاقًا، خيارات بـ«أ)»
  أو «1-» أو شرطات، وإجابة مكتوبة «الصحيح هو الثالث». فكان الطالب يرفع ملفًا
  صحيحًا تمامًا فيُقال له «لم نتعرّف على سؤال واحد» — وهو محقّ في أن يغضب.

  والحل ليس توسيع التعابير النمطية إلى ما لا نهاية: كل نمط جديد يفتح بابًا
  لخطأ جديد، ولا تنتهي أشكال البشر. الذكاء يقرأ الشكل كما يقرؤه إنسان.

  ═══ لكن قاعدة القداسة لا تُعلَّق هنا ═══
  الذكاء يقرأ ولا يؤلّف. فكل سؤال يعود منه نبحث عن نصّه في الملف الأصلي:
  إن وُجد حرفًا بحرف (بعد تطبيع المسافات والتشكيل وحدها) فهو منقول، وإن لم
  يوجد وسمناه `unverified` ليراه الرافع بعينه قبل النشر. لا نحذفه — فقد
  يكون التقاطًا صحيحًا لجدولٍ تشوّه نصُّه عند الاستخراج — ولا نمرّره صامتًا.
*/

/* ٦٠٠٠ حرفًا للدفعة: تكفي ~١٥ سؤالًا بخياراتها، وتبقى بعيدة عن سقف الخرج.
   الأكبر منها يجعل الردّ يُقطع في منتصف سؤال فتُهدر الدفعة كلها. */
const CHUNK = 6000;
/* تراكبٌ بين الدفعات: سؤالٌ يقع على الحدّ يُقرأ مرتين، والتكرار يُزال بعدُ.
   والضياع لا يُزال. */
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

/*
  تطبيعٌ للمقارنة وحده — لا يُكتب في القاعدة أبدًا.
  نُسقط التشكيل والتطويل (يضيفهما الاستخراج ويُسقطهما، بلا معنى دلالي)،
  ونوحّد الأرقام العربية واللاتينية، والاقتباسات، وكل بياضٍ إلى مسافة.
*/
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
function norm(s){
  return String(s || '')
    .replace(/[ً-ْٰـ]/g, '')          // تشكيل وتطويل
    .replace(/[٠-٩]/g, d => String(AR_DIGITS.indexOf(d)))
    .replace(/[«»""''`]/g, '"')
    .replace(/[‐-―]/g, '-')                      // شرطات مطبعية
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/* هل هذا النص منقولٌ من الملف فعلًا؟ */
function verbatimIn(normalizedSource, text){
  const t = norm(text);
  if (!t) return false;
  return normalizedSource.indexOf(t) !== -1;
}

/*
  التقطيع على حدود الأسطر لا على عدّ الحروف الأعمى:
  القطع في منتصف سطرٍ يشطر سؤالًا نصفين فيُقرأ نصفًا في كل دفعة.
*/
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

/* تحويل ما يعيده الذكاء إلى شكل المقسّم نفسه — المستهلك واحد لا يعرف المصدر */
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
    /* ★ وسم القداسة: هل وجدنا نصّه في الملف حرفًا بحرف؟ */
    unverified: !verbatimIn(normalizedSource, q)
  };
}

/*
  القراءة بالذكاء. تُحقن `callAI` من الخارج كي تُفحص هذه الدالة بلا شبكة —
  ولأن اختيار المزوّد ليس شأن القارئ.
*/
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
      /*
        دفعةٌ تسقط لا تُسقط الملف كله. ملفٌ من عشرين دفعة تعطّلت واحدة منه
        يعطي الطالب تسعة أعشار مادته — وهذا أنفع له بكثير من صفحة خطأ.

        ★ لكنّا نحتفظ بالعطل. كان يُبتلع كليًّا، فإذا سقطت كل الدفعات عاد
        القارئ بصفر أسئلة صامتًا، فيُقال للطالب «لم نتعرّف على سؤال واحد
        في ملفك» — وملفُه سليم، والعطل عندنا: نفدت حصّة الذكاء. اتهامُ
        البريء أسوأ من الاعتراف بالعجز.
      */
      lastErr = e;
      continue;
    }
    const items = Array.isArray(r && r.items) ? r.items : [];
    items.forEach(it => {
      const s = shape(it, normalizedSource, out.length);
      if (!s) return;
      const k = norm(s.q);
      if (seen[k]) return;         // التراكب يُنتج تكرارًا مقصودًا — نطويه هنا
      seen[k] = 1;
      out.push(s);
    });
  }

  // إعادة الترقيم بعد إزالة المكرر كي يوافق الرقمُ الترتيبَ الحقيقي
  out.forEach((q, i) => { q.num = i + 1; });
  return { questions: out, chunks: parts.length, error: out.length ? null : lastErr };
}

/*
  ═══ القراءة من الصور والـPDF الممسوح ═══
  ★ لا نصَّ مصدرٍ هنا فلا مقارنةَ حرفٍ بحرف — والقداسة تُحفظ بطريقةٍ أخرى:
  كل سؤالٍ من صورة يُوسم `ocr` ويُعدّ `unverified`، فيراه الرافع في خطوة
  المراجعة بعلامته ويقرؤه بعينه قبل النشر. الصمت هنا هو ما يُخالف القاعدة،
  لا الوسم.

  والصور تُرسل كلها في نداءٍ واحد ما دامت دون السقف: ورقةُ أسئلةٍ صُوِّرت
  على ثلاث لقطات قد يقع سؤالٌ على حدّ اثنتين منها، والنموذج الذي يراهما
  معًا يقرؤه، والذي يراهما منفصلتين يقرأ نصفين.
*/
const MEDIA_SYS = SYS + '\n\n' + [
  'المصدر هنا صورٌ أو ملف PDF ممسوح لا نصّ. اقرأ ما فيها كما هو مكتوب،',
  'بالترتيب من أعلى إلى أسفل ومن الصورة الأولى إلى الأخيرة.',
  'إن كان سؤالٌ مقطوعًا بين صورتين فاجمع نصفيه.',
  'إن كانت الصورة غير مقروءة أو لا أسئلة فيها فأعد مصفوفة فارغة.',
  'لا تُترجم ولا تُصحّح إملاءً — انقل الحروف كما تراها.'
].join('\n');

/* سقف الدفعة الواحدة من الوسائط — فوقه تُقسَّم دفعتين */
const MEDIA_BATCH_BYTES = 12 * 1024 * 1024;

async function aiReadMedia(media, callAI){
  const list = (Array.isArray(media) ? media : []).filter(m => m && m.base64);
  if (!list.length) return { questions: [], chunks: 0 };

  // دفعات بحسب الحجم لا العدد: ثلاث صور من جوّال قد تفوق عشر لقطات شاشة
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
      s.unverified = true;      // لا مصدر نصّي نقارن به — يُراجَع بالعين
      s.ocr = true;             // والسبب مسمّى: منسوخ من صورة
      out.push(s);
    });
  }
  out.forEach((q, i) => { q.num = i + 1; });
  return { questions: out, chunks: batches.length, error: out.length ? null : lastErr };
}

module.exports = { aiRead, aiReadMedia, chunkText, shape, norm, verbatimIn, SYS, MEDIA_SYS, CHUNK };
