/* ============ ١٠٦ · محوّل المزوّدين ============ */
describe('١٠٦ · اختيار المزوّد');
{
  const P = require(path.join(ROOT, 'api', '_lib', 'provider.js'));
  const save = { p: process.env.AI_PROVIDER, g: process.env.GEMINI_API_KEY,
                 a: process.env.ANTHROPIC_API_KEY, m: process.env.AI_MODEL };
  const clear = () => { delete process.env.AI_PROVIDER; delete process.env.GEMINI_API_KEY;
                        delete process.env.ANTHROPIC_API_KEY; delete process.env.AI_MODEL; };

  clear();
  eq(P.pickProvider(), 'none', 'بلا مفتاح لا مزوّد');

  process.env.ANTHROPIC_API_KEY = 'x';
  eq(P.pickProvider(), 'anthropic', 'ومفتاح واحد يكفي لاختياره');

  /* ★ الاستنتاج من المفتاح الموجود يحذف متغيّرًا من الإعداد. كل متغيّر
     يدويّ بابُ عطلٍ صامت: يُضبط المفتاح ويُنسى المزوّد فيبدو كأن المفتاح
     خاطئ. الأقلّ إعدادًا أقلّ عطلًا. */
  process.env.GEMINI_API_KEY = 'y';
  eq(P.pickProvider(), 'gemini', '★ ووجود مفتاح Gemini يختاره بلا متغيّر ثانٍ');

  process.env.AI_PROVIDER = ' ANTHROPIC ';
  eq(P.pickProvider(), 'anthropic', 'والصريح يفوز، ويتحمّل الفراغ واختلاف الحالة');
  process.env.AI_PROVIDER = 'مجهول';
  eq(P.pickProvider(), 'gemini', 'وقيمة لا نعرفها تسقط للاستنتاج لا للانهيار');
  delete process.env.AI_PROVIDER;

  eq(P.modelFor('gemini'), 'gemini-3.6-flash', '★ Flash لا Pro — حصته المجانية ثلاثون ضعفًا');
  ok(P.modelFor('anthropic').indexOf('haiku') > -1, 'وHaiku لـ Anthropic — ثلث كلفة Sonnet');

  process.env.AI_MODEL = 'gemini-3.6-pro';
  eq(P.modelFor('gemini'), 'gemini-3.6-pro', 'ومتغيّر البيئة يتجاوز الافتراض');

  /* ★ متغيّر واحد لمزوّدين: AI_MODEL ضُبط لـ Anthropic قبل يومين، ولو طُبّق
     على Gemini لطلبنا من Google نموذج Claude — عطلٌ محيّر سببه إعدادٌ كان
     صحيحًا في زمنه. الغريب يُهمَل بصمت لا يُمرَّر. */
  process.env.AI_MODEL = 'claude-sonnet-4-5';
  eq(P.modelFor('gemini'), 'gemini-3.6-flash', '★ ونموذج مزوّد آخر يُهمَل لا يُمرَّر');
  eq(P.modelFor('anthropic'), 'claude-sonnet-4-5', 'ويُطاع عند مزوّده');

  clear();
  Object.keys(save).forEach(k => {
    const name = { p:'AI_PROVIDER', g:'GEMINI_API_KEY', a:'ANTHROPIC_API_KEY', m:'AI_MODEL' }[k];
    if (save[k] !== undefined) process.env[name] = save[k];
  });
}

describe('١٠٧ · انتزاع ردّ الذكاء');
{
  const P = require(path.join(ROOT, 'api', '_lib', 'provider.js'));

  eq(P.parseArray('[{"a":1}]').length, 1, 'مصفوفة عارية');
  eq(P.parseArray('```json\n[1,2]\n```').length, 2, 'ومصفوفة داخل سياج كود');
  eq(P.parseArray('تفضل: [1,2,3] انتهى').length, 3, 'ومصفوفة مسبوقة بكلام');

  /* ★ «فشل التحليل» وحدها تترك المشرف بلا خيط: لا يعرف أرفض النموذج،
     أم انقطع الردّ، أم ردّ باعتذار. عرضُ ما وصل فعلًا يحسم ذلك في ثانية. */
  let msg = '';
  try { P.parseArray('عذرًا لا أستطيع'); } catch(e){ msg = e.message; }
  has(msg, 'عذرًا لا أستطيع', '★ وخطأ التحليل يعرض ما وصل فعلًا');

  msg = '';
  try { P.parseArray('{"a":1}'); } catch(e){ msg = e.message; }
  has(msg, 'ليس مصفوفة', 'وكائنٌ مفرد يُرفض — الترتيب هو ما يربط السؤال بجوابه');
}

/* ★ كتلتا ١٠٨ و١١٠ تستبدلان global.fetch ومتغيّرات البيئة — وكلاهما عالميّ
   واحد. لو جرتا معًا في Promise.all سحبت نهاية إحداهما مُزيَّف الأخرى.
   والأهم: التزييف نفسه يجب أن يقع داخل الدور لا عند تعريف الكتلة، وإلا
   نصّبت الكتلة الثانية مُزيَّفها قبل أن تبدأ الأولى أصلًا. */
let fetchLock = Promise.resolve();
const serial = fn => { fetchLock = fetchLock.then(fn); pending.push(fetchLock); };

/* يحفظ البيئة والشبكة، ينفّذ، ثم يعيد كل شيء مهما حدث */
const withFakeNet = (fetchImpl, env, body) => serial(async () => {
  const keys = ['AI_PROVIDER','AI_MODEL','ANTHROPIC_API_KEY','GEMINI_API_KEY'];
  const save = {}; keys.forEach(k => { save[k] = process.env[k]; delete process.env[k]; });
  const savedFetch = global.fetch;
  Object.keys(env).forEach(k => { process.env[k] = env[k]; });
  global.fetch = fetchImpl;
  try { await body(); }
  finally {
    global.fetch = savedFetch;
    keys.forEach(k => { if (save[k] === undefined) delete process.env[k];
                        else process.env[k] = save[k]; });
  }
});

describe('١٠٨ · نداء Gemini');
{
  const P = require(path.join(ROOT, 'api', '_lib', 'provider.js'));
  let seen = null;
  const okNet = async (u, o) => { seen = { u, o }; return { ok:true, json: async () => ({
    candidates: [{ content: { parts: [{ text: '[{"expl_ar":"شرح"}]' }] } }],
    usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 22 }
  }) }; };

  withFakeNet(okNet, { GEMINI_API_KEY:'K123' }, async () => {
    const r = await P.callAI('نظام', 'مستخدم');

    has(seen.u, 'gemini-3.6-flash:generateContent', 'المسار يحمل النموذج');
    /* ★ مفتاحٌ في المسار مفتاحٌ في السجلّ: كل وسيط بينك وبين Google يدوّن
       سطر الطلب كاملًا، وGoogle نفسها تدوّنه. الترويسة لا تُدوَّن. */
    ok(seen.u.indexOf('K123') === -1, '★ والمفتاح ليس في المسار — المسارات تُسجَّل');
    eq(seen.o.headers['x-goog-api-key'], 'K123', 'بل في الترويسة');
    eq(JSON.parse(seen.o.body).generationConfig.responseMimeType, 'application/json',
       'وJSON مفروض من المزوّد لا مرجوّ في التعليمات');

    eq(r.provider, 'gemini', 'والردّ يقول من أجاب');
    eq(r.model, 'gemini-3.6-flash', 'وبأي نموذج');
    /* ★ أسماء موحّدة: بقية المنصة تعرض الاستهلاك للمشرف، ولو حملت أسماء
       Google لانكسرت لحظة تبديل المزوّد — وهذا نقيض غاية المحوّل. */
    eq(r.usage.input_tokens, 11, '★ والاستهلاك بأسماء موحّدة لا بأسماء Google');
    eq(r.usage.output_tokens, 22, 'دخلًا وخرجًا');
    eq(r.items[0].expl_ar, 'شرح', 'والمحتوى وصل');
  });

  /* ★ ثلاثة أعطال يسمّيها المحوّل: حجبٌ، وانقطاعُ طول، وغيابُ مفتاح.
     كلها كانت ستصل للطالب كـ «تعذّر» واحدة لا تدلّ على فعل. */
  withFakeNet(async () => ({ ok:true, json: async () => ({
      promptFeedback: { blockReason: 'SAFETY' } }) }),
    { GEMINI_API_KEY:'K' }, async () => {
      let e = ''; try { await P.callAI('a','b'); } catch(x){ e = x.message; }
      has(e, 'فلتر المحتوى', '★ وحجب الفلتر يُسمّى — أسئلة الجرعات تُحجب أحيانًا');
    });

  withFakeNet(async () => ({ ok:true, json: async () => ({
      candidates: [{ finishReason:'MAX_TOKENS', content:{ parts:[{ text:'[1' }] } }] }) }),
    { GEMINI_API_KEY:'K' }, async () => {
      let e = ''; try { await P.callAI('a','b'); } catch(x){ e = x.message; }
      has(e, 'قسّمها', 'وانقطاع الطول يقول الحلّ لا العطل');
    });

  withFakeNet(async () => { throw new Error('ما كان يجب أن نطلب شيئًا'); }, {}, async () => {
    let e = ''; try { await P.callAI('a','b'); } catch(x){ e = x.message; }
    has(e, 'ارفع بلا إثراء', '★ وغياب كل مفتاح يدلّ على المسار المجاني — لا يوصد الباب');
  });
}

describe('١٠٩ · ai.js لا يعد بما لا يملك');
{
  const src = fs.readFileSync(path.join(ROOT, 'api', 'ai.js'), 'utf8');

  /* ★ كان الردّ يحمل `model` مجرّدًا — متغيّرٌ محليّ داخل callClaude لا يراه
     نطاق الـ handler. فكل نجاحٍ ينتهي بـ ReferenceError يُلتقط ويُعاد ٥٠٠:
     المسار لم يكن ليعمل حتى بمفتاحٍ سليم. */
  ok(!/\bmodel,\s*$/m.test(src) && !/{\s*ok:true[^}]*\bmodel,/.test(src),
     '★ ولا يُعاد `model` مجرّدًا — متغيّر خارج نطاقه كان يُسقط كل نجاح');
  has(src, 'model: aiOut._model', 'بل يُقرأ مما أرجعه المحوّل');
  has(src, 'provider: aiOut._provider', 'ومعه اسم المزوّد — المشرف يحتاج معرفة من أجاب');

  has(src, "require('./_lib/provider.js')", 'والنداء يمرّ بالمحوّل');
  // ★ لا عنوان مزوّد مكتوب في ai.js: الطبقة التي تعرف «ماذا نسأل» لا تعرف «مَن»
  ok(src.indexOf('api.anthropic.com') === -1 && src.indexOf('generativelanguage') === -1,
     '★ ولا عنوان مزوّد في ai.js — الفصل هو الفائدة كلها');

  const prov = fs.readFileSync(path.join(ROOT, 'api', '_lib', 'provider.js'), 'utf8');
  // المفاتيح تُقرأ عند النداء ولا تُصدَّر ولا تُسجَّل
  ok(prov.indexOf('console.log') === -1, 'ولا طباعة في المحوّل — المفاتيح تمرّ فيه');
  ok(/module\.exports\s*=\s*{[^}]*}/.test(prov) && prov.indexOf('API_KEY:') === -1,
     'ولا مفتاح مُصدَّر');

  const built = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  ok(built.indexOf('GEMINI_API_KEY') === -1, '★ ولا أثر لـ GEMINI_API_KEY في ملف المتصفح');
  ok(built.indexOf('x-goog-api-key') === -1, 'ولا لترويسته');
}

describe('١١٠ · تقاعُد النموذج لا يُسقط المنصة');
{
  const P = require(path.join(ROOT, 'api', '_lib', 'provider.js'));

  eq(P.suggestedModel('This model models/gemini-2.5-flash is no longer available to new ' +
     'users. Please update your code to use models/gemini-3.6-flash for the latest features.'),
     'gemini-3.6-flash', 'البديل يُنتزع من نصّ الرفض');
  eq(P.suggestedModel('quota exceeded'), null, 'ورفضٌ بلا بديل لا يخترع واحدًا');
  /* ★ النقطة تفصل أجزاء الاسم ولا تُنهيه. لو ابتلعناها لطلبنا «x-1.» فيُردّ
     بـ ٤٠٤ ثانيةً، فيبدو البديلُ عاطلًا وهو سليم. */
  eq(P.suggestedModel('use models/gemini-4.1-flash.'), 'gemini-4.1-flash',
     '★ والنقطة الختامية ليست من الاسم — والداخلية منه');

  const asked = [];
  withFakeNet(async (u) => {
    asked.push(String(u).split('/models/')[1].split(':')[0]);
    if (asked.length === 1) return { ok:false, status:404, text: async () =>
      'This model models/gemini-3.6-flash is no longer available. ' +
      'Please update your code to use models/gemini-4-flash.' };
    return { ok:true, json: async () => ({
      candidates:[{ content:{ parts:[{ text:'[{"expl_ar":"ش"}]' }] } }],
      usageMetadata:{ promptTokenCount:5, candidatesTokenCount:6 } }) };
  }, { GEMINI_API_KEY:'K' }, async () => {
    /* ★ Google تُقاعد أسماء النماذج وتذكر البديل في نصّ الرفض. بلا هذا،
       يوم التقاعد يوقف كل رفعٍ على المنصة حتى أنتبه أنا وأعدّل وأنشر —
       وطالبٌ ليلة اختباره لا يعنيه أن اسمًا تغيّر. */
    const r = await P.callAI('نظام', 'مستخدم');
    eq(asked.length, 2, '★ ورفض ٤٠٤ يُعاد مرة واحدة بالبديل');
    eq(asked[1], 'gemini-4-flash', 'وبالاسم الذي سمّته Google');
    eq(r.model, 'gemini-4-flash', '★ والمُبلَّغ هو ما أجاب فعلًا لا ما طُلب');
  });

  // ★ مرةً واحدة: رفضٌ متكرر لا يدور بلا نهاية
  const again = [];
  withFakeNet(async (u) => { again.push(u); return { ok:false, status:404, text: async () =>
      'no longer available. Please update your code to use models/x-1.' }; },
    { GEMINI_API_KEY:'K' }, async () => {
      let err = ''; try { await P.callAI('a','b'); } catch(e){ err = e.message; }
      eq(again.length, 2, '★ ومحاولتان لا أكثر — لا دوران بلا نهاية');
      has(err, '404', 'ثم يُرفع الخطأ كما هو');
    });
}

/* ============ ١١١ · مادة أحدث من قائمة الجهاز ============ */
describe('١١١ · «غير موجودة» تُقال بعد السؤال لا قبله');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  const SID = 'new-sub-1';
  let asked = 0;

  // قائمة هذا الجهاز لا تعرف المادة — كما لو أُقلع التطبيق قبل نشرها
  A.store.set('pack', { subjects: [], settings: {} });
  A.api.rpc = (n) => {
    if (n === 'content_pack'){
      asked++;
      return Promise.resolve({ ok:true, data:{ subjects:[
        { id:SID, name:'فسيولوجي', slug:'physio', q_count:40, free:true, status:'published' }
      ], settings:{} } });
    }
    return Promise.resolve({ ok:true, data:[] });
  };

  const box = doc.createElement('div'); doc.body.appendChild(box);
  box.appendChild(A.views.ViewSubject.view({ rest:[SID], query:{} }));

  /* ★ لا نقول «غير موجودة» ونحن لم نسأل: قائمة المواد تُجلب مرة عند الإقلاع،
     فمادةٌ نُشرت بعدها — نشرها الطالب قبل ثانية، أو أرسل زميله رابطها —
     ليست فيها. كان الرافع يُنشئ مادته ثم يراها «غير موجودة». */
  ok(box.textContent.indexOf('غير موجودة') === -1,
     '★ لا حكم قبل السؤال — ولا كلمة «غير موجودة» في أول لحظة');
  has(box.textContent, 'جارٍ تحديث', 'بل يُقال إننا نتحقق');

  pending.push((async () => {
    // ننتظر وصول القائمة لا مجرّد إرسال الطلب — وإلا قِسنا سباقنا لا المنتج
    await until(W, () => A.data.pack().subjects.length > 0);
    eq(asked, 1, '★ والقائمة تُجدَّد من الخادم مرة واحدة');
    ok(A.data.pack().subjects.some(s => s.id === SID), 'ثم تعرفها القائمة');
    const again = A.views.ViewSubject.view({ rest:[SID], query:{} });
    has(again.textContent, 'فسيولوجي', 'وتُفتح باسمها');

    /* ★ الغياب بعد السؤال يُقال بلغة أخرى: «غير متاحة» لا «غير موجودة»،
       ومعها بابٌ يُفتح — «استكشف» — لا طريق مسدود. */
    A.store.set('pack', { subjects: [], settings: {} });
    A.api.rpc = () => Promise.resolve({ ok:true, data:{ subjects:[], settings:{} } });
    const miss = doc.createElement('div'); doc.body.appendChild(miss);
    miss.appendChild(A.views.ViewSubject.view({ rest:['ghost'], query:{} }));
    await until(W, () => miss.textContent.indexOf('جارٍ تحديث') === -1);
    has(miss.textContent, 'غير متاحة', '★ وبعد السؤال يُقال «غير متاحة»');
    has(miss.innerHTML, '#/explore', 'ومعها باب لا طريق مسدود');

    // ★ انقطاع الشبكة ليس غيابًا: الأول يُعاد فيه، والثاني يُيئِس
    A.api.rpc = () => Promise.resolve({ ok:false, offline:true });
    const off = doc.createElement('div'); doc.body.appendChild(off);
    off.appendChild(A.views.ViewSubject.view({ rest:['ghost2'], query:{} }));
    await until(W, () => off.textContent.indexOf('جارٍ تحديث') === -1);
    has(off.textContent, 'تعذّر الوصول', '★ وبلا اتصال يُقال «تعذّر الوصول» لا «غير متاحة»');
    W.close();
  })());
}

/* ============ ١١٢ · النشر يُجدّد القائمة قبل أن يعد ============ */
describe('١١٢ · النشر لا يعد بما لا تراه القائمة');
{
  const up = fs.readFileSync(path.join(ROOT, 'src', 'js', '34-upload.js'), 'utf8');
  /* ★ الرافع أولى الناس بألا تختفي مادته: يضغط «انشر» فيُعطى زر «افتح
     المادة» — ولو لم نُجدّد القائمة قاده زرّنا إلى «غير موجودة». */
  has(up, 'QBANK.data.refreshPack()', '★ والنشر يُجدّد القائمة قبل عرض الرابط');
  ok(up.indexOf('refreshPack') < up.indexOf('showShare(box'),
     'قبل شاشة المشاركة لا بعدها');

  const sub = fs.readFileSync(path.join(ROOT, 'src', 'js', '35-subject.js'), 'utf8');
  const exam = fs.readFileSync(path.join(ROOT, 'src', 'js', '36-examview.js'), 'utf8');
  // العلاج في مكان واحد يخدم البابين: صفحة المادة وصفحة الاختبار
  has(exam, 'refetchThenSubject(sid', 'وشاشة الاختبار تُعالَج بالعلاج نفسه');
  ok(sub.indexOf("'المادة غير موجودة'") === -1 && exam.indexOf("'المادة غير موجودة'") === -1,
     '★ ولم تبقَ عبارة «غير موجودة» في أيٍّ منهما');
}
