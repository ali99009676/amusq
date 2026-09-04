'use strict';
/*
  فرض قاعدة القداسة في الخادم — الطبقة الثانية من ثلاث.

  نمطان:
  · strict   — الافتراضي وقاعدة المشروع: مهما كتب النموذج، يُعاد النص الأصلي مكانه.
  · enhanced — للمواد التي يرفعها الطالب لنفسه: يُسمح للنموذج بتحسين الصياغة.

  وفي النمطين معًا يُحفظ الأصل في q_original و options_original ولا يُمحى أبدًا.
  هكذا يبقى الفحص النصّي الآلي ذا معنى، ويظل بوسع القارئ رؤية النص كما وصل،
  ويبقى التراجع عن التحسين ممكنًا دون إعادة رفع الملف.
*/

// التحسين يُقبل فقط إن بقي السؤال هو نفسه: نص فارغ أو مبتور أو منتفخ = عبث نرفضه
function acceptable(orig, cand){
  if (typeof cand !== 'string') return false;
  const t = cand.trim();
  if (t.length < 8) return false;                       // لا يُختصر سؤال إلى كلمة
  if (t.length > orig.length * 3 + 80) return false;    // ولا يتضخّم إلى مقال
  return true;
}

const norm = t => String(t).toLowerCase().replace(/[^a-z0-9\u0621-\u064A]+/g, '');

/*
  هل هذا الخيار المحسَّن هو نفس الخيار الأصلي بعد تنظيف الإملاء؟

  هذا أخطر فحص في الملف. موضع الإجابة رقم لا نص، فلو أعاد النموذج ترتيب
  الخيارات — أو استبدل خيارًا بآخر — لبقي الرقم كما هو وأشار إلى إجابة خاطئة،
  وصار الطالب يحفظ الخطأ. فنقبل التنظيف الإملائي فقط: أن يبقى أحد النصين
  محتوى في الآخر بعد التطبيع. أي شيء أبعد من ذلك ⇦ نُبقي الأصل.
*/
function sameOption(orig, cand){
  if (typeof cand !== 'string') return false;
  const a = norm(orig), b = norm(cand.trim());
  if (!b) return false;
  return a === b || (a.length >= 3 && b.indexOf(a) !== -1) || (b.length >= 3 && a.indexOf(b) !== -1);
}

function enforce(original, ai, mode){
  // original: مخرج المقسّم — النص المقدّس
  // ai: ما أرجعه النموذج لهذا السؤال (قد يكون ناقصًا أو عابثًا — لا نثق به في النصوص)
  ai = ai || {};
  const enhanced = mode === 'enhanced';
  const out = {
    // النص الأصلي دائمًا في strict؛ وفي enhanced يُقبل تحسين النموذج إن اجتاز فحص المعقولية
    q: (enhanced && acceptable(original.q, ai.q_enhanced)) ? String(ai.q_enhanced).trim() : original.q,
    q_original: original.q,                        // الأصل محفوظ في الحالتين — لا يُمحى أبدًا
    sanctity_mode: enhanced ? 'enhanced' : 'strict',
    topic: String(ai.topic || ''),
    expl_ar: String(ai.expl_ar || ''),
    /* شرحُ الملف نفسه (Explanation: …) يسبق شرح الذكاء — كلام الدكتور أوثق من كلام النموذج */
    expl_en: String(original.explanation || ai.expl_en || ''),
    translation: String(ai.translation || ''),
    mnemonic: (ai.mnemonic && typeof ai.mnemonic === 'object') ? ai.mnemonic : {},
    important: false
  };

  if (original.has_options) {
    out.options_original = original.options.slice();
    // الخيارات: حرفًا بحرف في strict. وفي enhanced نقبل تنظيفًا إملائيًا فقط،
    // بنفس العدد وبنفس الترتيب، وكل خيار يُقبل أو يُرفض على حدة لا كتلة واحدة.
    if (enhanced && Array.isArray(ai.options_enhanced)
        && ai.options_enhanced.length === original.options.length) {
      out.options = original.options.map((o, i) =>
        sameOption(o, ai.options_enhanced[i]) ? String(ai.options_enhanced[i]).trim() : o);
    } else {
      out.options = original.options.slice();
    }
    out.opts_built = false;
    if (original.answer !== null && original.answer !== undefined
        && original.answer >= 0 && original.answer < out.options.length) {
      out.answer = original.answer;                // إجابة الدكتور تفوز على أي رأي للنموذج
      out.derived = false;
    } else {
      const idx = parseInt(ai.answer_index, 10);
      out.answer = (idx >= 0 && idx < out.options.length) ? idx : 0;
      out.derived = true;                          // مستنتجة — تحذير أحمر للمشرف
    }
  } else {
    // سؤال بلا خيارات: المشتتات من النموذج، وإجابة الدكتور بنصّها الحرفي إن وُجدت
    const distractors = Array.isArray(ai.distractors)
      ? ai.distractors.map(String).slice(0, 3) : [];
    while (distractors.length < 3) distractors.push('—');
    out.options_original = original.answer_text ? [original.answer_text] : [];
    if (original.answer_text) {
      out.options = [original.answer_text].concat(distractors);
      out.answer = 0;                              // موضع رقمي؛ الخلط يحدث عند العرض لا هنا
      out.derived = false;
    } else {
      const ansFromAi = String(ai.answer_text || '—');
      out.options = [ansFromAi].concat(distractors);
      out.answer = 0;
      out.derived = true;
    }
    out.opts_built = true;                         // وسم «خيارات مبنية» للمشرف
  }
  return out;
}

/*
  فحص المطابقة الحرفية — يستعمله الخادم والفحوص الآلية.
  في strict يقارن المعروض بالأصل. وفي enhanced يقارن الأصل المحفوظ بالمصدر:
  فالتحسين مسموح في المعروض، أما ضياع الأصل فليس مسموحًا في أي نمط.
*/
function verbatimOk(original, stored){
  const enhanced = stored.sanctity_mode === 'enhanced';
  if (stored.q_original !== original.q) return false;    // الأصل يجب أن يبقى مهما كان النمط
  if (enhanced){
    // في enhanced يكفي أن يبقى الأصل وأن يبقى عدد الخيارات كما هو (موضع الإجابة رقم)
    if (original.has_options && stored.options.length !== original.options.length) return false;
    return true;
  }
  if (stored.q !== original.q) return false;
  if (original.has_options) {
    if (stored.options.length !== original.options.length) return false;
    for (let i = 0; i < original.options.length; i++)
      if (stored.options[i] !== original.options[i]) return false;
  } else if (original.answer_text) {
    if (stored.options.indexOf(original.answer_text) === -1) return false;
  }
  return true;
}

/* مسار المادة: عربي أو إنجليزي إلى مقطع آمن في الرابط، ولاحقة عشوائية تمنع التصادم */
function slugify(name, rnd){
  const base = String(name || '')
    .trim().toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')          // نزع التشكيل
    .replace(/[^a-z0-9\u0621-\u064A]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const tail = (rnd || Math.random().toString(36).slice(2, 8)).slice(0, 6);
  return (base || 'subject') + '-' + tail;
}

module.exports = { enforce, verbatimOk, slugify, acceptable, sameOption };
