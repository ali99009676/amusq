/* ============ ١١٣ · محلّل المادة: البرومبت والتحقق ============ */
describe('١١٣ · برومبت التحليل وتحقّقه');
{
  const AN = require(path.join(ROOT, 'api', '_lib', 'analyst.js'));

  // البرومبت هو برومبت علي — علاماته المميزة فيه
  has(AN.SYS_ANALYST, 'قاعدة القداسة', 'قاعدة القداسة في صدر البرومبت');
  has(AN.SYS_ANALYST, 'أنت لا تؤلّف منهجًا — أنت تحلّل بنكًا', '★ ومبدؤه الحاكم كما صاغه علي');
  has(AN.SYS_ANALYST, 'الملاحظة الأهم امتحانيًا', 'والملاحظة الأهم امتحانيًا');
  has(AN.SYS_ANALYST, 'كلمة منحوتة عربية', 'وحيلة الحفظ المنحوتة');
  has(AN.SYS_ANALYST, 'فخ الصياغة المنفية', 'وأنماط الأفخاخ');
  has(AN.SYS_ANALYST, 'لا تخترع فخًا', '★ والفخ يُقتبس من خيار موجود لا يُخترع');
  has(AN.SYS_ANALYST, 'ثلاثة أسئلة فأكثر', 'وعتبة «تكررت» مرقّمة');
  has(AN.sysFor('en'), 'English', 'واختيار الإنجليزية يُلحق استثناء اللغة');
  ok(AN.sysFor('ar') === AN.SYS_ANALYST, 'والعربية هي الأصل بلا زيادة');

  /* ★ التعقيم: التحليل يُحقن في صفحات كل الطلاب — سطر سكربت فيه يعني XSS
     على المنصة كلها. البرومبت وعدٌ، والتعقيم قانون. */
  const dirty = '<section onclick="x()"><p style="color:red">نص</p>' +
    '<script>alert(1)</script><a href="http://evil">رابط</a>' +
    '<table><tr><td>خلية</td></tr></table></section>';
  const clean = AN.sanitizeHtml(dirty);
  ok(clean.indexOf('<script') === -1, '★ السكربت يُمحى');
  ok(clean.indexOf('onclick') === -1, 'والحدث يُنزع');
  ok(clean.indexOf('style=') === -1, 'والنمط المضمّن يُنزع');
  ok(clean.indexOf('<a') === -1 && clean.indexOf('رابط') > -1,
     'والرابط يذوب — وسمه يسقط ونصّه يبقى');
  has(clean, '<td>خلية</td>', 'والجدول المسموح يمرّ');

  // التحقق: كل سؤال في محور ولا محور شبح
  const items = [ { id:'q-1', q:'أ', options:['1','2'] }, { id:'q-2', q:'ب', options:['1','2'] } ];
  const good = { name_en:'X', overview:'<p>' + 'م'.repeat(100) + '</p>',
    memorize:'<section><p>' + 'ح'.repeat(100) + '</p></section>', mistakes:'<p>خ</p>',
    topics:[{ key:'a', name:'محور أ' }], assign:{ 'q-1':'a', 'q-2':'a' }, notes:'' };
  const v = AN.validateAnalysis(good, items);
  eq(v.counts.a, 2, 'العدّ من الإسناد الفعلي');

  let e1 = '';
  try { AN.validateAnalysis(Object.assign({}, good, { assign:{ 'q-1':'a' } }), items); }
  catch(x){ e1 = x.message; }
  has(e1, 'q-2', '★ سؤال بلا محور يُرفض ويُسمّى — لا يسقط بصمت من البنك المقسَّم');

  let e2 = '';
  try { AN.validateAnalysis(Object.assign({}, good, { assign:{ 'q-1':'a', 'q-2':'ghost' } }), items); }
  catch(x){ e2 = x.message; }
  has(e2, 'ghost', 'ومحور غير معرّف يُرفض بالاسم');

  let e3 = '';
  try { AN.validateAnalysis(Object.assign({}, good, { overview:'<p>قصير</p>' }), items); }
  catch(x){ e3 = x.message; }
  has(e3, 'أقصر', '★ ونظرة عامة هزيلة تُرفض — سطران ليسا تحليلًا');

  // الحمولة: الأسئلة كما هي بلا شروح تلوّث التحليل
  const payload = JSON.parse(AN.buildUserPayload('مادة', [
    { id:'q-1', q:'نص السؤال', options:['أ','ب'], answer:1, expl_ar:'شرح قديم' } ]));
  eq(payload.questions[0].text, 'نص السؤال', 'النص يمرّ حرفيًا');
  eq(payload.questions[0].answer, 1, 'والإجابة');
  ok(!('expl_ar' in payload.questions[0]), 'والشرح القديم لا يُرسل — يلوّث تحليلًا جديدًا');
}

/* ============ ١١٤ · نقطة النهاية analyze ============ */
describe('١١٤ · analyze.js يحرس بابه');
{
  const src = fs.readFileSync(path.join(ROOT, 'api', 'analyze.js'), 'utf8');

  has(src, 'userFromToken', 'الهوية من Supabase لا من فكّ JWT محلي');
  /* ★ صاحب المادة أو المشرف — التحليل يكتب في صفوف يقرؤها الجميع،
     وبابٌ مفتوح يعني أن أي طالب يعيد كتابة ما يذاكر منه الآخرون. */
  has(src, 'created_by !== user.id', '★ وغير المالك يُصدّ');
  has(src, 'is_admin', 'إلا المشرف');
  has(src, 'هذه ليست مادتك', 'برسالة تسمّي السبب');
  has(src, 'expectObject: true', 'والردّ كائن مادة لا مصفوفة');
  has(src, 'maxTokens: 32768', '★ وسقف خرج يتّسع لجداول مادة كاملة');
  has(src, "order=ord", 'والأسئلة بترتيبها — الترتيب دليل الفصول');
  ok(src.indexOf('req.body.questions') === -1,
     '★ والأسئلة من القاعدة لا من المتصفح — حمولة المتصفح تُزوَّر');

  const prov = fs.readFileSync(path.join(ROOT, 'api', '_lib', 'provider.js'), 'utf8');
  has(prov, 'opts.maxTokens || 8192', 'والمحوّل يقبل سقفًا مخصصًا');
  has(prov, 'function parseObject', 'ويعرف الكائن المفرد');
}

/* ============ ١١٥ · قاعدة التحليل ============ */
describe('١١٥ · ANALYZE.sql');
{
  const sql = fs.readFileSync(path.join(ROOT, 'db', 'ANALYZE.sql'), 'utf8');

  ['overview','memorize','mistakes','name_en','analyzed_at'].forEach(c =>
    has(sql, 'add column if not exists ' + c, 'عمود ' + c));

  /* ★ تحليل أقدم من أسئلته يكذب: «تكرر في ٤ أسئلة» وقد صارت ٧.
     أي تغيير محتوى يمسح analyzed_at فيُعاد التوليد تلقائيًا. */
  has(sql, 'update of q, options, answer', '★ القادح يراقب المحتوى');
  has(sql, 'or delete', 'والحذف كذلك');
  /* ★ لكن كتابة التحليل تحدّث topic — لو راقبناه لدار التوليد بلا نهاية:
     يكتب فيبطل فيكتب. التصنيف من التحليل لا من المادة. */
  ok(!/update of[^;]*topic/.test(sql), '★ وtopic خارج المراقبة — وإلا دار التوليد بلا نهاية');

  has(sql, "'stale', (s.analyzed_at is null", 'والبُطلان معلن في القراءة');
  has(sql, 'create or replace function qbank.subject_analysis', 'ودالة القراءة موجودة');
  has(sql, 'to authenticated, anon', 'مفتوحة للجميع — كما اختار علي');
}

/* ============ ١١٦ · واجهة التحليل ============ */
describe('١١٦ · العرض والتعقيم الثاني');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;

  /* ★ الدفاع في العمق: الخادم عقّم، والمتصفح يعقّم ثانية — القاعدة قد
     تُكتب من طريق آخر يومًا، والمتصفح لا يثق حتى بقاعدته. */
  const node = A.views.analysisHtml('<section><p onclick="hack()">نص</p>' +
    '<script>alert(1)</script><table><tr><td>خ</td></tr></table>' +
    '<div class="x">داخل div</div></section>');
  eq(node.querySelectorAll('script').length, 0, '★ السكربت لا يصل DOM');
  eq(node.querySelectorAll('[onclick]').length, 0, 'ولا حدث');
  eq(node.querySelectorAll('div').length, 0, 'وdiv الغريب يذوب');
  has(node.textContent, 'داخل div', 'ونصّه يبقى');
  eq(node.querySelectorAll('td').length, 1, 'والجدول يمرّ');

  // بطاقة المحاور بعدّاداتها
  const tc = A.views.topicsCard({ topics:[ { name:'الابتكار التسويقي', n:11 }, { name:'القيادة', n:10 } ] });
  has(tc.textContent, 'الابتكار التسويقي', 'اسم المحور');
  has(tc.textContent, '١١ سؤالًا', 'وعدّاده بالهندية');
  eq(A.views.topicsCard({ topics:[] }), null, 'وبلا محاور لا بطاقة فارغة');
  W.close();
}

/* ============ ١١٧ · عدّاد الاختبار — لكل طالب موعده ============ */
describe('١١٧ · عدّاد الاختبار');
{
  const dom = makeDom(), W = dom.window, A = W.QBANK;
  const E = A.examDate;

  E.set('s1', '2099-01-01T10:00:00.000Z');
  eq(E.get('s1'), '2099-01-01T10:00:00.000Z', 'الموعد يُحفظ');
  E.set('s2', '2099-02-01T10:00:00.000Z');
  eq(E.get('s1'), '2099-01-01T10:00:00.000Z', 'ولكل مادة موعدها المستقل');
  E.set('s1', null);
  eq(E.get('s1'), null, 'والإزالة تعمل');

  /* ★ بالساعات الكلية لا بالأيام: «متبقٍ ٤٥:١٢:٠٩» يوقظ، و«يومان» يخدّر */
  const base = new Date('2026-01-01T00:00:00Z').getTime();
  const L = E.left(new Date(base + (45*3600 + 12*60 + 9) * 1000).toISOString(), base);
  has(L.text, '٤٥:١٢:٠٩', '★ ساعات كلية:دقائق:ثوانٍ بالهندية');
  ok(!L.over, 'ولم يفت');
  ok(E.left(new Date(base - 1000).toISOString(), base).over, 'والفائت يُعلن');
  has(E.left(new Date(base - 1000).toISOString(), base).text, 'بالتوفيق', 'بدعاء لا بصفر أحمر');
  eq(E.left('ليس تاريخًا'), null, 'والتالف لا يكسر الشاشة');
  W.close();
}

/* ============ ١١٨ · الرفع ينتهي بتحليل ============ */
describe('١١٨ · التحليل خطوة في النشر');
{
  const up = fs.readFileSync(path.join(ROOT, 'src', 'js', '34-upload.js'), 'utf8');

  /* ★ بعد النشر لا قبله: لو حجزنا زرّ النشر نصف دقيقة لظنّ الرافع أن
     النشر علق. المادة تُنشر فورًا والتحليل يلحقها بسطر حالة صادق. */
  has(up, 'QBANK.analysis.generate(newId', '★ التوليد يبدأ تلقائيًا بعد النشر');
  ok(up.indexOf('showShare') < up.indexOf('يجري تحليل مادتك'),
     'وسطر الحالة داخل شاشة المشاركة');
  has(up, 'سيُعاد تلقائيًا', 'وفشله يَعِد بالمحاولة عند فتح المادة — لا طريق مسدود');
  has(up, "analysisLang", 'ولغة التحليل يختارها الرافع');

  const subj = fs.readFileSync(path.join(ROOT, 'src', 'js', '35-subject.js'), 'utf8');
  has(subj, 'maybeRefresh', 'وصفحة المادة تعيد توليد الباطل تلقائيًا');
  has(subj, 'examDate.band', 'وفيها عدّاد الطالب');

  const an = fs.readFileSync(path.join(ROOT, 'src', 'js', '57-analysis.js'), 'utf8');
  /* ★ الباطل يُجدّده صاحبه لا زائره: الزائر يرى آخر نسخة صالحة ولا
     يدفع كلفة توليدٍ ليس له */
  has(an, 'sub.created_by === u.id', '★ maybeRefresh لصاحب المادة');
  has(an, 'clearInterval', 'والعدّاد يوقف نفسه عند تفكيك الوثيقة');

  const pr = fs.readFileSync(path.join(ROOT, 'src', 'js', '37-print.js'), 'utf8');
  has(pr, "value:'full'", 'والطباعة تعرف «المادة كاملة»');
  has(pr, 'opts.analysis.memorize', 'وتضم طريقة الحفظ');
}
