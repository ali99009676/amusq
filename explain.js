'use strict';
/*
  /api/explain — «لماذا أخطأتُ أنا؟»

  الشرح المحفوظ مع السؤال يشرح الإجابة الصحيحة للجميع سواء. وهذا نافع،
  لكنه لا يمسّ سبب الخطأ: الطالب الذي اختار «بطء القلب» لم يجهل الكيتامين،
  بل خلطه بالأفيونات. وهذا الخلط بعينه هو ما يجب أن يُعالَج، ولا يعرفه
  إلا من رأى اختياره هو.

  ولحظةُ طلبه هي اللحظة الوحيدة في المذاكرة كلها التي يكون فيها الطالب
  متيقّظًا مستعدًّا للاستماع: أخطأ للتوّ، وفضولُه مفتوح. شرحٌ يصل بعدها
  بثانيتين يُحفَر، وشرحٌ يقرؤه قبل أن يخطئ يمرّ عليه.

  ═══ حرّاسه ═══
  ١) الجلسة شرط: نداءٌ مفتوح للعالم بابٌ لاستنزاف فاتورتنا.
  ٢) سقفٌ للنصوص: لا نمرّر حمولةً بحجم كتاب.
  ٣) خرجٌ قصير: جواب من ثلاث جمل يكفي هنا، والطويل يُملّ ولا يُقرأ.
*/
const supa = require('./_lib/supa.js');
const { callAI } = require('./_lib/provider.js');

const SYS = [
  'أنت معلّم يشرح لطالبٍ أخطأ في سؤال — والخطأ أمامك مع اختياره.',
  '',
  'اشرح له سوء الفهم الذي أوقعه في اختياره هو، لا الإجابة الصحيحة وحدها:',
  '- جملة تقول لماذا بدا خياره صحيحًا (فلكل خطأ منطقٌ في ذهن صاحبه).',
  '- جملة تكشف الفرق الحاسم بين خياره والإجابة الصحيحة.',
  '- جملة تعطيه علامة فارقة يميّز بها بينهما في أي سؤال قادم.',
  '',
  'بالعربية، ثلاث جمل لا أكثر، بلا مقدمات ولا «عزيزي الطالب».',
  'لا تُلقِ عليه اللوم ولا تُبالغ في التشجيع — اشرح فقط.',
  'أعد كائن JSON واحدًا: {"why": "..."} بلا أي نص خارجه.'
].join('\n');

const CAP = 1200;   // حرفًا لكل حقل — أطول سؤالٍ حقيقي دون هذا بكثير
const cut = v => String(v == null ? '' : v).slice(0, CAP);

module.exports = async function handler(req, res){
  if (req.method !== 'POST') return res.status(405).json({ error:'POST فقط' });
  try{
    const user = await supa.userFromToken(supa.bearer(req));
    if (!user) return res.status(401).json({ error:'سجّل دخولك أولًا' });

    const { q, options, correct, chosen, topic } = req.body || {};
    const opts = Array.isArray(options) ? options.slice(0, 8).map(cut) : [];
    if (!q || opts.length < 2)
      return res.status(400).json({ error:'أرسل السؤال وخياراته' });
    const ci = Number(correct), ki = Number(chosen);
    if (!(ci >= 0 && ci < opts.length) || !(ki >= 0 && ki < opts.length))
      return res.status(400).json({ error:'موضع الإجابة أو الاختيار خارج النطاق' });
    /* لا نُنفق نداءً على من أصاب: زرّ «اشرح لي أكثر» لا يظهر له أصلًا،
       وحارسٌ هنا لأن الواجهة تُعدَّل والخادم هو الحدّ الأخير. */
    if (ci === ki) return res.status(400).json({ error:'لا شيء يُشرح — إجابتك صحيحة' });

    const user_msg = JSON.stringify({
      question: cut(q),
      options: opts,
      correct_answer: opts[ci],
      student_answer: opts[ki],
      topic: cut(topic || '')
    });

    const r = await callAI(SYS, user_msg, { maxTokens: 1024, timeoutMs: 60000, expectObject: true });
    const why = r.items && typeof r.items.why === 'string' ? r.items.why.trim() : '';
    if (!why) return res.status(502).json({ error:'لم يصل شرح — أعد المحاولة' });

    return res.status(200).json({ ok:true, why, model: r.model || null });
  } catch(e){
    return res.status(e.status || 500).json({ error: e.message, kind: e.kind || 'other' });
  }
};
module.exports.SYS = SYS;
