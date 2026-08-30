/*
  حاسبة التكلفة — كم سيكلّف إثراء هذا الملف، قبل تشغيله لا بعده.

  لماذا في الواجهة؟ لأن المشرف اليوم يضغط «شغّل الذكاء» وهو لا يعرف إن كان
  سيدفع ريالًا أو عشرين. الرقم المعروض تقدير مبني على أسعار معلنة وعلى متوسط
  أرصدناه من ملفات حقيقية — ويظهر بعده الاستهلاك الفعلي الذي يبلّغ به الخادم،
  فيصحّح المشرف تقديره بنفسه مع الوقت.
*/
const AI_PRICES = {
  // دولار لكل مليون رمز — من صفحة أسعار Anthropic
  'claude-haiku-4-5':  { in: 1,  out: 5,  label: 'Haiku 4.5' },
  'claude-sonnet-5':   { in: 2,  out: 10, label: 'Sonnet 5' },
  'claude-sonnet-4-5': { in: 3,  out: 15, label: 'Sonnet 4.5' },
  'claude-opus-5':     { in: 5,  out: 25, label: 'Opus 5' }
};
const AI_DEFAULT = 'claude-haiku-4-5';

/*
  متوسطات لكل سؤال. مبنية على ملفات AMSU الحقيقية:
  سؤال بخياراته ≈ ١٥٠ رمز دخلًا، والإخراج (شرح عربي + ترجمة + بطاقة حفظ + محور)
  ≈ ٣٥٠ رمزًا. السؤال بلا خيارات يخرج أكثر لأن الذكاء يبني له ثلاثة مشتتات.
*/
const TOK_IN = 150, TOK_OUT = 350, TOK_OUT_BUILT = 470;
const SYS_TOKENS = 420;            // تعليمات النظام، تُرسل مرة لكل دفعة
const USD_SAR = 3.75;              // الريال مربوط بالدولار — سعر ثابت لا يتغيّر

function estimateCost(opts){
  const n = Math.max(0, opts.questions || 0);
  const built = Math.max(0, Math.min(opts.withoutOptions || 0, n));
  const batch = Math.max(1, opts.batchSize || 40);
  const p = AI_PRICES[opts.model || AI_DEFAULT] || AI_PRICES[AI_DEFAULT];
  const batches = Math.ceil(n / batch) || 0;

  const inQ  = n * TOK_IN;
  const outQ = (n - built) * TOK_OUT + built * TOK_OUT_BUILT;

  /*
    التعليمات: الدفعة الأولى كتابة ذاكرة (‎1.25x‎) والباقي قراءة (‎0.1x‎).
    بلا تخزين كانت تُحسب كاملة مع كل دفعة — والفرق يكبر مع كبر الملف.
  */
  const sysFirst = batches ? SYS_TOKENS * 1.25 : 0;
  const sysRest  = batches > 1 ? SYS_TOKENS * 0.1 * (batches - 1) : 0;
  const sysNoCache = batches * SYS_TOKENS;

  const usd = ((inQ + sysFirst + sysRest) * p.in + outQ * p.out) / 1e6;
  const usdNoCache = ((inQ + sysNoCache) * p.in + outQ * p.out) / 1e6;

  return {
    model: p.label, batches,
    usd, sar: usd * USD_SAR,
    saved: Math.max(0, usdNoCache - usd),          // ما وفّره التخزين المؤقت
    tokensIn: Math.round(inQ + sysFirst + sysRest),
    tokensOut: outQ
  };
}

/* مقارنة النماذج — يرى المشرف ثمن اختياره بدل أن يخمّنه */
function compareModels(opts){
  return Object.keys(AI_PRICES).map(k => {
    const c = estimateCost(Object.assign({}, opts, { model: k }));
    return { id: k, label: c.model, usd: c.usd, sar: c.sar };
  }).sort((a, b) => a.usd - b.usd);
}

/* عرض المبلغ: الريال أولًا لأنه عملة الطالب، والدولار بين قوسين للمرجع */
function money(c){
  const sar = c.sar < 1 ? c.sar.toFixed(2) : c.sar.toFixed(1);
  return sar + ' ريال (' + (c.usd < 1 ? '$' + c.usd.toFixed(3) : '$' + c.usd.toFixed(2)) + ')';
}

QBANK.cost = { estimate: estimateCost, compare: compareModels, money,
               prices: AI_PRICES, DEFAULT: AI_DEFAULT };
