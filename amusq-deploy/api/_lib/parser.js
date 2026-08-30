'use strict';
/*
  مقسّم الأسئلة — يعمل في الخادم (Vercel) وفي الفحوص.
  يفهم الشكلين الشائعين في ملفات الدكاترة:
    أ) أسئلة بخيارات A) B) C) D) وقد يأتي معها ANSWER: B
    ب) قوائم «سؤال ثم إجابته» مرقّمة بلا خيارات إطلاقًا
  قاعدة القداسة تبدأ هنا: النصوص تُقتطع كما هي — قصّ أطراف بيضاء فقط، لا تنظيف داخلي.
*/

// بداية سؤال جديد: رقم متبوع بنقطة/قوس، أو Q مع رقم
const Q_START = /^\s*(?:Q\s*\.?\s*)?(\d{1,3})\s*[).\-:]\s+/i;
// بداية خيار: حرف A-E متبوعًا بقوس أو نقطة
const OPT_START = /^\s*([A-Ea-e])\s*[).]\s+/;
// سطر إجابة معلنة: ANSWER: B أو Ans- C أو Answer C
const ANS_LINE = /^\s*(?:ANSWER|ANS|KEY|الاجابة|الإجابة)\s*[:\-.]?\s*([A-Ea-e])\b/i;

function splitBlocks(text){
  // نقسم النص إلى كتل، كل كتلة سؤال برقمه — الحدود هي أسطر تبدأ برقم سؤال
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let cur = null;
  lines.forEach(line => {
    const m = line.match(Q_START);
    if (m) {
      if (cur) blocks.push(cur);
      cur = { num: parseInt(m[1], 10), lines: [line.replace(Q_START, '')] };
    } else if (cur) {
      cur.lines.push(line);
    }
  });
  if (cur) blocks.push(cur);
  return blocks;
}

function letterIndex(ch){ return 'ABCDE'.indexOf(String(ch || '').toUpperCase()); }

function parseBlock(block){
  const qLines = [];      // أسطر نص السؤال
  const options = [];     // الخيارات كما وصلت
  let answerLetter = null;
  let answerText = null;  // للشكل «سؤال ثم إجابة»
  let mode = 'q';         // q ← نقرأ السؤال، ثم opts أو answer

  block.lines.forEach(line => {
    const ansM = line.match(ANS_LINE);
    if (ansM) { answerLetter = ansM[1].toUpperCase(); return; }
    const optM = line.match(OPT_START);
    if (optM) {
      mode = 'opts';
      options.push({ letter: optM[1].toUpperCase(), text: line.replace(OPT_START, '').replace(/\s+$/,'') });
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
    return {
      q: qText,
      options: options.map(o => o.text),
      answer: answerLetter !== null ? letterIndex(answerLetter) : null,
      answer_letter: answerLetter,
      has_options: true
    };
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

module.exports = { parse, splitBlocks, parseBlock, letterIndex, Q_START, OPT_START, ANS_LINE };
