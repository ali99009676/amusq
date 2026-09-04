'use strict';
/*
  مقسّم الأسئلة — يعمل في الخادم (Vercel) وفي الفحوص.
  يفهم الشكلين الشائعين في ملفات الدكاترة:
    أ) أسئلة بخيارات A) B) C) D) وقد يأتي معها ANSWER: B
    ب) قوائم «سؤال ثم إجابته» مرقّمة بلا خيارات إطلاقًا
  قاعدة القداسة تبدأ هنا: النصوص تُقتطع كما هي — قصّ أطراف بيضاء فقط، لا تنظيف داخلي.

  ═══ ولماذا وُسِّع؟ ═══
  كان يقرأ اللاتينية وحدها: أرقامًا ١٢٣ لاتينية وخيارات A) B) وكلمة ANSWER.
  وملفات الطلاب العرب مكتوبةٌ بالعربية: «١- ما هو…» و«أ) الكبد» و«الإجابة: ب».
  فكان يعود بصفر أسئلة من ملفٍ سليم تمامًا. وبقاء هذا معلّقًا على الذكاء
  وحده خطأ: الذكاء له حصّة تنفد، والقواعد مجانيةٌ لا تنفد أبدًا — فالملف
  المرتّب يجب أن يُقرأ ولو انقطع الإنترنت عن كل مزوّدي العالم.
*/

/* الأرقام العربية الهندية تُقرأ أرقامًا: «١٢» رقمٌ لا زخرفة */
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
function toLatinDigits(s){
  return String(s || '').replace(/[٠-٩]/g, d => String(AR_DIGITS.indexOf(d)));
}

/* بداية سؤال: رقم (لاتيني أو عربي) متبوع بنقطة/قوس/شرطة، وقد يسبقه Q أو «س» أو «السؤال» */
/* أربع خانات لا ثلاث: بنكٌ من ألف سؤال فأكثر كان يُقرأ ٩٩٩ ثم يلتصق الباقي بآخر سؤال */
const Q_START = /^\s*(?:Q|س|السؤال|سؤال)?\s*\.?\s*([\d٠-٩]{1,4})\s*[).\-:]\s+/i;

/* بداية خيار: حرف لاتيني A-E أو حرف عربي (أ ب ج د هـ) متبوعًا بقوس أو نقطة أو شرطة */
const OPT_START = /^\s*(هـ|[A-Ea-e]|[أابجده])\s*[).\-]\s+/;

/* سطر إجابة معلنة — بالعربية أو الإنجليزية، بحرفٍ لاتيني أو عربي */
const ANS_LINE =
  /^\s*(?:ANSWER|ANS|KEY|CORRECT|الاجابة|الإجابة|الجواب|الحل|الصحيح)\s*(?:الصحيحة?|الصحيح)?\s*(?:هي|هو)?\s*[:\-.]?\s*(هـ|[A-Ea-e]|[أابجده])(?=\s|$|[).,،])/i;

/* علامة «هذا هو الصحيح» بجانب الخيار — نجمة أو صحّ، شائعة في ملفات Word */
const STAR = /\s*[*★✓✔√]\s*$/;
/*
  ★ سطر الشرح ليس من الخيار الأخير.
  «Explanation: …» بعد الخيارات كان يُلحق بالخيار D لأن كل سطرٍ بعد
  الخيارات «تابعٌ لخيارٍ امتد سطرين». فيقرأ الطالب خيارًا فيه إجابته
  وشرحها. الآن يُعرف الشرح بعنوانه ويُحفظ في حقله.
*/
const EXPL_LINE = /^\s*(?:EXPLANATION|EXPLAIN|RATIONALE|WHY|NOTE|الشرح|التعليل|التفسير|السبب|ملاحظة)\s*[:\-.]\s*/i;

/*
  ترتيب الحرف: لاتينيًّا A=0، وعربيًّا أ=0 ب=1 ج=2 د=3 هـ=4.
  الألف بهمزةٍ وبدونها سواء — الطالب لا يفرّق بينهما وهو يكتب.
*/
const AR_LETTERS = { 'أ':0, 'ا':0, 'ب':1, 'ج':2, 'د':3, 'ه':4, 'هـ':4 };
function letterIndex(ch){
  const c = String(ch || '').trim();
  if (Object.prototype.hasOwnProperty.call(AR_LETTERS, c)) return AR_LETTERS[c];
  return 'ABCDE'.indexOf(c.toUpperCase());
}

function splitBlocks(text){
  // نقسم النص إلى كتل، كل كتلة سؤال برقمه — الحدود هي أسطر تبدأ برقم سؤال
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let cur = null;
  lines.forEach(line => {
    const m = line.match(Q_START);
    /*
      ★ رقمُ سؤالٍ لا رقمُ خيار.
      «أ) الكبد» ليست بداية سؤال، لكن «1) الكبد» في ملفٍ خياراته مرقّمة قد
      تبدو كذلك. نفصل بأن بداية السؤال تُفحص بعد استبعاد شكل الخيار.
    */
    if (m && !OPT_START.test(line)) {
      if (cur) blocks.push(cur);
      cur = { num: parseInt(toLatinDigits(m[1]), 10), lines: [line.replace(Q_START, '')] };
    } else if (cur) {
      cur.lines.push(line);
    }
  });
  if (cur) blocks.push(cur);
  return blocks;
}

function parseBlock(block){
  const qLines = [];      // أسطر نص السؤال
  const options = [];     // الخيارات كما وصلت
  let answerLetter = null;
  let starred = -1;       // موضع الخيار المعلَّم بنجمة
  let answerText = null;  // للشكل «سؤال ثم إجابة»
  let mode = 'q';         // q ← نقرأ السؤال، ثم opts أو answer أو expl
  const explLines = [];   // الشرح إن جاء بعنوانه

  block.lines.forEach(line => {
    const ansM = line.match(ANS_LINE);
    if (ansM) { answerLetter = ansM[1]; mode = 'ans'; return; }
    if (EXPL_LINE.test(line)) { mode = 'expl'; explLines.push(line.replace(EXPL_LINE, '').replace(/\s+$/,'')); return; }
    if (mode === 'expl') { if (line.trim()) explLines.push(line.replace(/\s+$/,'')); return; }
    /* بعد سطر الإجابة لا خيارات جديدة — ما يليه شرحٌ بلا عنوان أو ضجيج، لا ذيلٌ للخيار الأخير */
    if (mode === 'ans' && !line.match(OPT_START)) { if (line.trim()) explLines.push(line.replace(/\s+$/,'')); return; }
    const optM = line.match(OPT_START);
    if (optM) {
      mode = 'opts';
      let text = line.replace(OPT_START, '').replace(/\s+$/,'');
      /* النجمة علامةُ تصحيحٍ لا من كلام الخيار — كحرف «A)» تمامًا، تُقشَّر
         ويُحفظ معناها. وإبقاؤها في النص يُري الطالبَ الإجابةَ قبل أن يجيب. */
      if (STAR.test(text)) { starred = options.length; text = text.replace(STAR, ''); }
      options.push({ letter: optM[1], text: text });
      return;
    }
    if (mode === 'opts' && options.length) {
      // سطر تابع لخيار امتد على سطرين — يُلحق بالخيار الأخير كما هو
      if (line.trim()) options[options.length - 1].text += '\n' + line.replace(/\s+$/,'');
      return;
    }
    qLines.push(line);
  });

  const qText = qLines.join('\n').replace(/^\s+|\s+$/g, '');
  if (!qText) return null;

  if (options.length >= 2) {
    // الشكل أ: سؤال بخيارات — الترتيب كما وصل، حرف الإجابة يُحوَّل لموضع رقمي
    const byLetter = answerLetter !== null ? letterIndex(answerLetter) : -1;
    const answer = byLetter >= 0 ? byLetter : (starred >= 0 ? starred : null);
    const out = {
      q: qText,
      options: options.map(o => o.text),
      answer: answer,
      answer_letter: answerLetter,
      has_options: true
    };
    if (explLines.length) out.explanation = explLines.join('\n').trim();
    return out;
  }

  // الشكل ب: سؤال ثم إجابته — آخر جزء غير فارغ بعد السؤال هو الإجابة.
  // نفصل عند أول سطر فارغ: ما قبله سؤال وما بعده إجابة، وإن لم يوجد فالسطر الأخير إجابة.
  const parts = qText.split(/\n\s*\n/);
  if (parts.length >= 2) {
    return { q: parts[0].replace(/\s+$/,''), options: null,
             answer_text: parts.slice(1).join('\n\n').replace(/^\s+/,''), has_options: false };
  }
  const ls = qText.split('\n');
  if (ls.length >= 2) {
    return { q: ls.slice(0, -1).join('\n').replace(/\s+$/,''), options: null,
             answer_text: ls[ls.length - 1].trim(), has_options: false };
  }
  // سؤال بسطر واحد بلا إجابة ظاهرة — يُترك للذكاء، ويُوسم derived لاحقًا
  return { q: qText, options: null, answer_text: null, has_options: false };
}

function parse(text){
  const blocks = splitBlocks(text);
  const out = [];
  blocks.forEach(b => {
    const p = parseBlock(b);
    if (p) { p.num = b.num; out.push(p); }
  });
  return out;
}

module.exports = { parse, splitBlocks, parseBlock, letterIndex, toLatinDigits,
                   Q_START, OPT_START, ANS_LINE, STAR, EXPL_LINE };
