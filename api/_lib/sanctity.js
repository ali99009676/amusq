'use strict';
/*
  فرض قاعدة القداسة في الخادم — الطبقة الثانية من ثلاث.
  مهما كتب نموذج الذكاء، يُعاد النص الأصلي مكانه قبل أن يلمس قاعدة البيانات.
  النموذج يضيف فقط: الإجابة المستنتجة، الشرح، الترجمة، البطاقة، المحور، والمشتتات.
*/

function enforce(original, ai){
  // original: مخرج المقسّم — النص المقدّس
  // ai: ما أرجعه النموذج لهذا السؤال (قد يكون ناقصًا أو عابثًا — لا نثق به في النصوص)
  ai = ai || {};
  const out = {
    q: original.q,                                 // النص الأصلي دائمًا — لا نقاش
    topic: String(ai.topic || ''),
    expl_ar: String(ai.expl_ar || ''),
    expl_en: String(ai.expl_en || ''),
    translation: String(ai.translation || ''),
    mnemonic: (ai.mnemonic && typeof ai.mnemonic === 'object') ? ai.mnemonic : {},
    important: false
  };

  if (original.has_options) {
    out.options = original.options.slice();        // الخيارات الأصلية بترتيبها — حرفًا بحرف
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

// فحص مطابقة نصية يستعمله الخادم والاختبارات: هل بقي الأصل سليمًا؟
function verbatimOk(original, stored){
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

module.exports = { enforce, verbatimOk };
