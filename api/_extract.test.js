'use strict';

// فحوص الاستخراج — بلا شبكة. تختبر ما يمكن أن يكسر القداسة:
// التحقّق، والربط بجدول الإجابات، ورفض ما لا يُقرأ.

const {
  extractPages, extractAnswerKey, mergeAnswers, validateQuestions, parseJson,
} = require('./_extract.js');

let pass = 0, fail = 0; const failures = [];
const t = (name, fn) => Promise.resolve().then(fn).then(
  () => { pass++; }, e => { fail++; failures.push(`${name} — ${e && e.message}`); });
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m || ''} توقّعنا ${JSON.stringify(b)} فجاء ${JSON.stringify(a)}`); };
const ok = (c, m) => { if (!c) throw new Error(m || 'شرط لم يتحقّق'); };

const Q = (n, extra = {}) => ({
  n, text: `القيمة الإنسانيَّة رقم ${n} هي:`,
  options: { 'أ': 'التسامح', 'ب': 'المساواة', 'ج': 'العدل', 'د': 'الشورى' },
  ...extra,
});

const P = [];

P.push(t('parseJson يزيل السياج', () => {
  eq(parseJson('```json\n{"a":1}\n```'), { a: 1 });
  eq(parseJson('  {"a":2} '), { a: 2 });
}));

P.push(t('parseJson يرفض غير JSON بخطأ عربي', () => {
  let m = ''; try { parseJson('عذرًا، إليك الأسئلة:'); } catch (e) { m = e.message; }
  ok(/ليس JSON/.test(m), m);
}));

P.push(t('التحقّق يقبل السليم', () => {
  const { ok: good, rejected } = validateQuestions({ questions: [Q(1), Q(2)] });
  eq(good.length, 2); eq(rejected.length, 0);
}));

P.push(t('يرفض نصًّا ناقصًا ولا يصلحه', () => {
  const { ok: good, rejected } = validateQuestions({ questions: [{ n: 1, text: 'س', options: { 'أ': 'x', 'ب': 'y' } }] });
  eq(good.length, 0);
  ok(rejected[0].why.includes('نصّ ناقص'), JSON.stringify(rejected));
}));

P.push(t('يرفض خيارًا واحدًا', () => {
  const { rejected } = validateQuestions({ questions: [{ n: 1, text: 'سؤال كامل هنا', options: { 'أ': 'x' } }] });
  ok(rejected[0].why.includes('خيارات أقل من اثنين'));
}));

P.push(t('يرفض خيارين متطابقين — علامة هلوسة', () => {
  const { rejected } = validateQuestions({
    questions: [{ n: 1, text: 'سؤال كامل هنا', options: { 'أ': 'العدل', 'ب': 'العدل' } }],
  });
  ok(rejected[0].why.includes('خياران متطابقان'));
}));

P.push(t('يرفض الرقم المكرّر', () => {
  const { ok: good, rejected } = validateQuestions({ questions: [Q(7), Q(7)] });
  eq(good.length, 1); ok(rejected[0].why.includes('رقم مكرّر'));
}));

P.push(t('وضع التوليد يشترط إجابة', () => {
  const { rejected } = validateQuestions({ questions: [Q(1)] }, { needAnswer: true });
  ok(rejected[0].why.includes('إجابة مفقودة أو خارج أ-د'));
  const { ok: good } = validateQuestions({ questions: [Q(1, { answer: 'ج' })] }, { needAnswer: true });
  eq(good.length, 1);
}));

P.push(t('الربط بجدول الإجابات', () => {
  const { matched, unmatched } = mergeAnswers([Q(1), Q(2)], { '1': 'ج', '2': 'أ' });
  eq(matched.length, 2);
  eq(matched[0].answer, 'ج');
  eq(matched[0].derived, false, 'إجابة من المصدر ليست مستنتجة');
  eq(unmatched.length, 0);
}));

P.push(t('سؤال بلا إجابة يُعلَّم ولا يُخمَّن', () => {
  const { matched, unmatched } = mergeAnswers([Q(1), Q(9)], { '1': 'ب' });
  eq(matched.length, 1);
  eq(unmatched.length, 1);
  eq(unmatched[0].answer, null, 'لا تخمين');
  eq(unmatched[0].derived, true);
  eq(unmatched[0].needsReview, true);
}));

P.push(t('حرف إجابة لا يقابل خيارًا موجودًا يُرفض', () => {
  const q = { n: 1, text: 'سؤال كامل هنا', options: { 'أ': 'x', 'ب': 'y' } };
  const { matched, unmatched } = mergeAnswers([q], { '1': 'د' }); // د غير موجود
  eq(matched.length, 0);
  eq(unmatched.length, 1);
}));

P.push(t('جدول الإجابات ينظّف الصفوف غير المقروءة', async () => {
  const ai = { call: async () => ({ text: '{"answers":{"1":"أ","2":"ب","":"ج","4":"z","5":"د"}}', provider: 'stub' }) };
  const key = await extractAnswerKey({ pdfBase64: 'x', ai });
  eq(key, { '1': 'أ', '2': 'ب', '5': 'د' }, 'الرقم الفارغ والحرف الغريب يسقطان');
}));

P.push(t('extractPages يمرّر الـ PDF ويصنّف', async () => {
  let sawPdf = false, sawTask = null;
  const ai = {
    call: async (task, payload) => {
      sawTask = task; sawPdf = payload.pdfBase64 === 'BASE64';
      return { text: JSON.stringify({ questions: [Q(1), { n: 2, text: 'ناقص', options: {} }] }), provider: 'stub' };
    },
  };
  const r = await extractPages({ pdfBase64: 'BASE64', ai });
  ok(sawPdf, 'المستند وصل للمزوّد');
  eq(sawTask, 'extract', 'المهمة موسومة للأدوار');
  eq(r.questions.length, 1);
  eq(r.rejected.length, 1);
  eq(r.mode, 'extract');
}));

P.push(t('وضع التوليد يستعمل توجيهًا مختلفًا', async () => {
  let sys = '';
  const ai = {
    call: async (task, p) => { sys = p.system; return { text: JSON.stringify({ questions: [Q(1, { answer: 'أ' })] }), provider: 'stub' }; },
  };
  const r = await extractPages({ pdfBase64: 'x', mode: 'generate', ai });
  ok(/never use outside knowledge/i.test(sys), 'توجيه التوليد يمنع المعرفة الخارجية');
  eq(r.questions.length, 1);
}));

P.push(t('النصّ يمرّ حرفًا بحرف بلا تطبيع', async () => {
  const raw = 'الجانب الَّذي يُؤ ّكد المواقف القصصيَّة  في القرآن:';
  const ai = {
    call: async () => ({
      text: JSON.stringify({ questions: [{ n: 1, text: raw, options: { 'أ': 'النَّفسي', 'ب': 'الفكري' } }] }),
      provider: 'stub',
    }),
  };
  const r = await extractPages({ pdfBase64: 'x', ai });
  eq(r.questions[0].text, raw, 'لا حذف تشكيل ولا ضغط مسافات');
}));

Promise.all(P).then(() => {
  for (const f of failures) console.log('  ✗ ' + f);
  console.log(`\n${pass}/${pass + fail} ناجح`);
  process.exit(fail ? 1 : 0);
});
