'use strict';
/*
  محوّل المزوّدين — طبقة واحدة تفصل «ماذا نسأل الذكاء» عن «مَن نسأله».

  السبب أعمق من توفير المال: منصةٌ تعرف مزوّدًا واحدًا يملك ذلك المزوّد
  خنقَها — يرفع سعره أو يقفل حسابك أو يسقط ساعتين في ليلة الاختبار، فتسقط
  معه. المحوّل يجعل التبديل متغيّرَ بيئة لا إعادةَ كتابة.

  ولا يُصدّر أي مفتاح: كلٌّ يُقرأ من process.env عند الاستدعاء، ولا يُسجَّل،
  ولا يظهر في رسالة خطأ.
*/

/* ═══ اكتشاف المزوّد ═══
   الترتيب مقصود: AI_PROVIDER يفوز إن ضُبط صراحةً، وإلا نستنتج من المفتاح
   الموجود. الاستنتاج يحذف خطوةً من الإعداد — ومتغيّرٌ أقل يعني عطلًا أقل. */
function pickProvider(){
  const forced = String(process.env.AI_PROVIDER || '').trim().toLowerCase();
  if (forced === 'gemini' || forced === 'anthropic') return forced;
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return 'none';
}

const DEFAULT_MODEL = {
  /*
    Haiku 4.5: ‎$1/‎$5 لكل مليون رمز — ثلث كلفة Sonnet. والمهمة هنا شرحٌ
    وترجمةٌ وبطاقةُ حفظ، عملٌ مباشر لا استدلال معقّد.
  */
  anthropic: 'claude-haiku-4-5-20251001',
  /*
    Flash لا Pro: حصة Pro المجانية ٥٠ طلبًا يوميًا (= ٢٠٠٠ سؤال)، وFlash
    ‎١٥٠٠‎ طلب (= ٦٠ ألف سؤال). ثلاثون ضعفًا مقابل فارقٍ لا يظهر في مهمة
    بهذا الوضوح.
  */
  gemini: 'gemini-3.6-flash'
};

/* ★ بادئة اسم كل مزوّد — الحارس أدناه يقوم عليها */
const MODEL_PREFIX = { anthropic: 'claude', gemini: 'gemini' };

/*
  ★ AI_MODEL لا يُطاع إلا إن كان لهذا المزوّد.
  كان متغيّرًا واحدًا لمزوّدين: ضُبط لـ Anthropic قبل يومين، ولو طُبّق على
  Gemini لطلبنا من Google نموذج Claude — عطلٌ محيّر سببه إعدادٌ قديم صحيح
  في زمنه. المتغيّر الغريب يُهمَل بصمت لا يُمرَّر.
*/
function modelFor(provider){
  const want = String(process.env.AI_MODEL || '').trim();
  const pre = MODEL_PREFIX[provider];
  if (want && pre && want.toLowerCase().indexOf(pre) === 0) return want;
  return DEFAULT_MODEL[provider] || '';
}

/*
  ★ اسم النموذج يتقاعد، والمنصة لا يجوز أن تتقاعد معه.
  Google تُخرج النماذج من الخدمة وتذكر البديل في نصّ الرفض نفسه. نلتقط
  البديل ونعيد المحاولة مرة واحدة — مرةً لا أكثر، كي لا ندور بلا نهاية
  إن ردّت برفضٍ لا بديل فيه. طالبٌ ليلة اختباره لا يعنيه أن اسمًا تغيّر.
*/
function suggestedModel(errText){
  /* النقطة تفصل أجزاء الاسم ولا تُنهيه — «models/x-1.» في آخر الجملة
     اسمه x-1، والنقطة علامة ترقيم. طلبُ نموذجٍ باسمٍ فيه نقطة زائدة
     يُردّ بـ ٤٠٤ ثانيةً، فيبدو البديل عاطلًا وهو سليم. */
  const m = String(errText || '')
    .match(/use\s+models\/([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)/);
  return m ? m[1] : null;
}

/* ═══ انتزاع المصفوفة من ردٍّ قد يكون ملفوفًا ═══
   النماذج تلفّ JSON بسياج ```json أحيانًا، وتسبقه بجملة أحيانًا. نأخذ أول
   مصفوفة كاملة في النص. وإن فشل التحليل نرفع خطأً يقول ماذا وصل فعلًا —
   «فشل التحليل» وحدها تترك المشرف بلا خيط. */
function parseArray(text){
  const raw = String(text || '').trim();
  const m = raw.match(/\[[\s\S]*\]/);
  let out;
  try { out = JSON.parse(m ? m[0] : raw); }
  catch(e){ throw new Error('ردّ الذكاء ليس JSON صالحًا: ' + raw.slice(0, 200)); }
  if (!Array.isArray(out)) throw new Error('ردّ الذكاء ليس مصفوفة');
  return out;
}

/* الكائن المفرد — للتحليل الشامل الذي يُرجع مادةً واحدة لا قائمة */
function parseObject(text){
  const raw = String(text || '').trim();
  const m = raw.match(/\{[\s\S]*\}/);
  let out;
  try { out = JSON.parse(m ? m[0] : raw); }
  catch(e){ throw new Error('ردّ الذكاء ليس JSON صالحًا: ' + raw.slice(0, 200)); }
  if (!out || Array.isArray(out) || typeof out !== 'object')
    throw new Error('ردّ الذكاء ليس كائنًا واحدًا');
  return out;
}

/* ═══ Anthropic ═══ */
async function callAnthropic(system, user, model, opts){
  opts = opts || {};
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY غير مضبوط في متغيرات البيئة');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{ 'x-api-key': key, 'anthropic-version':'2023-06-01', 'content-type':'application/json' },
    body: JSON.stringify({
      model, max_tokens: opts.maxTokens || 8192,
      /*
        تخزين التعليمات مؤقتًا: ملفٌ من ٣٠٠ سؤال يُقسَّم دفعات كلها ترسل
        التعليمات نفسها. الكتابة الأولى ‎1.25x‎ ثم كل قراءة ‎0.1x‎.
      */
      system: [{ type:'text', text: system, cache_control:{ type:'ephemeral' } }],
      messages: [{ role:'user', content: user }]
    })
  });
  if (!res.ok) throw new Error('ردّ Anthropic ' + res.status + ': ' + (await res.text()).slice(0, 300));
  const data = await res.json();
  const text = (data.content && data.content[0] && data.content[0].text) || '[]';
  return { items: opts.expectObject ? parseObject(text) : parseArray(text),
           usage: data.usage || null };
}

/* ═══ Gemini ═══ */
async function callGemini(system, user, model, retried, opts){
  opts = opts || {};
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY غير مضبوط في متغيرات البيئة');
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
              encodeURIComponent(model) + ':generateContent';
  const res = await fetch(url, {
    method:'POST',
    /* المفتاح في الترويسة لا في المسار: مسارُ الطلب يُسجَّل في كل وسيطٍ
       بينك وبين Google، ومفتاحٌ في سجلّ ليس سرًّا. */
    headers:{ 'x-goog-api-key': key, 'content-type':'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role:'user', parts: [{ text: user }] }],
      generationConfig: {
        // JSON إلزامًا من المزوّد نفسه — أوثق من الرجاء في نصّ التعليمات
        responseMimeType: 'application/json',
        maxOutputTokens: opts.maxTokens || 8192,
        temperature: 0.2,
        /*
          ★ التفكير مطفأ.
          نماذج Flash الحديثة «تفكّر» قبل الردّ، وفي مهمة استخراجية بهذا
          الوضوح يلتهم التفكيرُ دقائقَ ومهلةَ الخادم معًا — تحليلُ ١٢ سؤالًا
          استغرق ٢٦٧ ثانية ثم قُتل. صفرُ ميزانيةٍ يجعله يجيب لا يتأمل.
        */
        thinkingConfig: opts._noThink ? undefined : { thinkingBudget: 0 }
      }
    }),
    // مهلة مسماة قبل أن تقتلنا بوابة Vercel بصمت
    signal: AbortSignal.timeout(opts.timeoutMs || 120000)
  });
  if (!res.ok){
    const body = await res.text();
    // ★ تقاعُد النموذج: نأخذ البديل من نصّ الرفض ونعيد مرة واحدة
    const alt = res.status === 404 && !retried ? suggestedModel(body) : null;
    if (alt) return callGemini(system, user, alt, true, opts);
    /* نموذجٌ يرفض حقل التفكير؟ نعيد بدونه مرة واحدة.
       الشرط أي ٤٠٠ لا كلمة «thinking»: Google تردّ أحيانًا بـ
       INVALID_ARGUMENT عارية بلا ذكر الحقل المرفوض — رأيناها حيًّا. */
    if (res.status === 400 && !opts._noThink)
      return callGemini(system, user, model, retried,
                        Object.assign({}, opts, { _noThink: true }));
    throw new Error('ردّ Gemini ' + res.status + ': ' + body.slice(0, 300));
  }
  const data = await res.json();
  const cand = (data.candidates && data.candidates[0]) || null;
  /* حاجزُ الأمان قد يبتلع الردّ كله: سؤالٌ عن جرعةٍ دوائية أو تشريحٍ قد
     يُصنَّف طبيًّا حساسًا. نقولها باسمها بدل «ردّ فارغ». */
  if (!cand) throw new Error('Gemini لم يُرجع ردًّا' +
    (data.promptFeedback && data.promptFeedback.blockReason
      ? ' — حجبه فلتر المحتوى (' + data.promptFeedback.blockReason + ')' : ''));
  if (cand.finishReason === 'SAFETY' || cand.finishReason === 'PROHIBITED_CONTENT')
    throw new Error('حجب فلتر المحتوى هذه الدفعة — أعد رفعها بعد تقسيمها');
  if (cand.finishReason === 'MAX_TOKENS')
    throw new Error('انقطع الردّ لطول الدفعة — قسّمها إلى دفعتين');
  const text = (cand.content && cand.content.parts || [])
    .map(p => p.text || '').join('');
  const u = data.usageMetadata || null;
  return {
    items: opts.expectObject ? parseObject(text) : parseArray(text),
    // ★ النموذج الذي أجاب فعلًا لا الذي طلبناه — قد يكون البديل بعد التقاعد
    model,
    // نوحّد أسماء الحقول كي لا تعرف بقية المنصة أيَّ مزوّد تكلّمنا
    usage: u ? { input_tokens: u.promptTokenCount || 0,
                 output_tokens: u.candidatesTokenCount || 0 } : null
  };
}

/* ═══ الواجهة الموحّدة ═══
   opts.maxTokens: إثراء دفعةٍ يكفيه ٨١٩٢، وتحليل مادةٍ كاملة (نظرة عامة
   وحفظ وأخطاء شائعة بجداولها) يحتاج أضعاف ذلك — فالسقف معامِلٌ لا ثابت.
   opts.expectObject: التحليل يُرجع كائنًا واحدًا لا مصفوفة. */
async function callAI(system, user, opts){
  opts = opts || {};
  const provider = pickProvider();
  if (provider === 'none')
    throw new Error('لا مفتاح ذكاء مضبوط — أضف GEMINI_API_KEY أو ANTHROPIC_API_KEY ' +
                    'في متغيّرات بيئة Vercel، أو ارفع بلا إثراء');
  const model = modelFor(provider);
  const r = provider === 'gemini'
    ? await callGemini(system, user, model, false, opts)
    : await callAnthropic(system, user, model, opts);
  // ما أجاب فعلًا يفوز على ما طلبناه — وإلا كذب سجلّ المشرف بعد أي بديل
  return { items: r.items, usage: r.usage, model: r.model || model, provider };
}

module.exports = { callAI, pickProvider, modelFor, parseArray, parseObject,
                   suggestedModel, DEFAULT_MODEL };
