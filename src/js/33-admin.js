/*
  لوحة تحكم المشرف — قلب المشروع.
  البوابة الحقيقية هي قاعدة البيانات (RLS + is_admin)؛ الواجهة هنا مجرد مرآة:
  حتى لو عبث أحد بالمتصفح فلن يقرأ صفًا واحدًا ليس له.
*/
const Admin = {
  /* هل الجلسة الحالية لمشرف؟ نسأل قاعدة البيانات مرة ونخزّن الجواب للجلسة */
  async check(){
    /* ★ نقرأ المستخدم مرة واحدة: النداء غير متزامن، والجلسة قد تُمحى
       أثناءه (خروج، انتهاء صلاحية) — فقراءة ثانية بعد await تنفجر على null */
    const u0 = QBANK.api.user();
    if (!u0) return false;
    const cached = QBANK.store.get('is_admin_check', null);
    if (cached && cached.uid === u0.id) return cached.ok;
    const r = await QBANK.api.myProfile();
    const ok = !!(r.ok && r.data && r.data.is_admin);
    QBANK.store.set('is_admin_check', { uid: u0.id, ok });
    return ok;
  },

  /* رابط دوال الخادم: على Vercel هو نفس الأصل، ومن file:// يضبطه المشرف مرة واحدة */
  apiBase(){
    const c = QBANK.store.get('api_base', '');
    if (c) return c.replace(/\/+$/,'');
    return (typeof location !== 'undefined' && location.protocol.indexOf('http') === 0) ? '' : null;
  },
  /*
    ★ هوية الطالب تُرفق مع كل نداء للخادم.
    كان النداء بلا Authorization، فيردّ /api/pay بـ٤٠١ «جلسة غير صالحة»
    قبل أن يصل إلى حال البوابة (٥٠٣) — والطالب المسجَّل يقرأ أن جلسته
    فاسدة وهي سليمة. والجلسة تُجدَّد قبل الإرسال إن شارفت على الانتهاء،
    كما تفعل QBANK.api.raw، وإلا حمل الطلب رمزًا منتهيًا فعاد الخطأ نفسه.
  */
  async authHeader(){
    const A = QBANK.api;
    let s = A.session();
    if (s && s.refresh_token && s.expires_abs && Date.now() > s.expires_abs - 60000 && A.auth && A.auth.refresh){
      try { await A.auth.refresh(); } catch(e){}
      s = A.session();
    }
    return (s && s.access_token) ? { 'Authorization': 'Bearer ' + s.access_token } : {};
  },
  async server(path, body){
    const base = Admin.apiBase();
    const f = QBANK.api.fetchFn();
    if (base === null || !f) return { ok:false, offline:true };
    try{
      const res = await f(base + path, {
        method:'POST',
        headers: Object.assign({ 'Content-Type':'application/json' }, await Admin.authHeader()),
        body: JSON.stringify(body || {})
      });
      const data = await res.json().catch(() => null);
      return { ok: res.ok, status: res.status, data };
    } catch(e){ return { ok:false, offline:true, err:e.message }; }
  },

  /* GET إلى الخادم — للمفتاح العام ونحوه مما لا جسم له */
  async serverGet(path){
    const base = Admin.apiBase();
    const f = QBANK.api.fetchFn();
    if (base === null || !f) return { ok:false, offline:true };
    try{
      const res = await f(base + path, { method:'GET', headers: await Admin.authHeader() });
      const data = await res.json().catch(() => null);
      return { ok: res.ok, status: res.status, data };
    } catch(e){ return { ok:false, offline:true, err:e.message }; }
  },

  /* ===== معالج الرفع — أربع خطوات، حالته قابلة للفحص بمعزل عن الواجهة ===== */
  // ٤٠ لا ٢٥: تعليمات النظام تُرسل مرة لكل دفعة، فالدفعة الأكبر توزّع كلفتها
  // على أسئلة أكثر. والسقف يبقى دون مهلة الخادم ويسمح باستئناف الرفع.
  /* ★ ١٢ لا ٤٠: دفعة الأربعين تُخرج ~٤٠ ألف حرف فتتجاوز دقيقة Vercel وتُقطع
     كلها. اثنتا عشرة تنجو في نصف دقيقة، وتُعالَج اثنتان معًا فلا يطول الزمن. */
  BATCH: 12,
  chunk(arr, n){
    const out = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
  },
  newWizard(){
    // strict افتراضًا: قاعدة القداسة هي الأصل، والتحسين اختيار صريح من الرافع
    /* ★ enrich=true افتراضًا: المادة الكاملة هي ما يريده الطالب فعلًا —
       رفع ليذاكر لا ليخزّن نصًّا. ومن أراد المجاني يختاره بضغطة واحدة،
       والافتراض يجب أن يكون أفضل مخرَج لا أرخصه. */
    /* ★ enrich:false افتراضًا (بطلب علي): الأسئلة والأجوبة كما رُفعت — فورًا وبلا حشو.
       الإثراء بالذكاء (شرح، ترجمة، بطاقات) اختيارٌ صريح يأخذ وقته حين يُطلب. */
    const w = { step:1, filename:'', subjectName:'', slug:'', mode:'strict', enrich:false,
                country:'', university:'', college:'', courseCode:'',
                raw:[], enriched:[], draftId:null, done:0, total:0, error:'' };
    /*
      ★ يرث انتماء الطالب عند الإنشاء لا عند الرسم.
      عند الرسم كان يُملأ في الخطوة الأولى وحدها، فمن استأنف مسوّدة أو قفز
      خطوة وجد الخانات فارغة. وإعادة كتابة اسم الجامعة ليست إزعاجًا فحسب:
      هي المصدر الأول لتهجئات مختلفة تفتّت الجامعة الواحدة إلى عدّة.
    */
    const mine = QBANK.campus ? QBANK.campus.cached() : null;
    if (mine && mine.university_id){
      w.country    = mine.country || '';
      w.university = mine.university || '';
      w.college    = mine.college || '';
    }
    return w;
  },
  // تقدير التكلفة قبل التشغيل: عدد الأسئلة والدفعات — يقرّر المشرف على بيّنة
  estimate(w){
    return { questions: w.raw.length, batches: Admin.chunk(w.raw, Admin.BATCH).length };
  },

  /*
    forceAi: «أعد القراءة بالذكاء» — طريقُ نجاةٍ بيد الرافع نفسه.
    الخادم يقرّر وحده في الحالة العادية، لكن قراره تقديرٌ قد يخطئ: ملفٌ
    تلتقط منه القواعدُ عشرين سؤالًا من ثمانين تبدو «سليمة» فلا يُستدعى
    الذكاء. فمن رأى العدد أقلّ مما يعرف عن ملفه، له أن يأمر بالقراءة ثانية.
  */
  /*
    الصور: تُرسل مصفوفةً في طلبٍ واحد — لا صورةً صورة. ورقةٌ صُوِّرت على
    ثلاث لقطات قد يقع سؤالٌ على حدّ اثنتين، والنموذج الذي يراهما معًا
    يقرؤه كاملًا. والنتيجة بشكل المعالج نفسه فلا يعرف ما بعده المصدر.
  */
  async wizardIngestImages(w, images){
    const r = await Admin.server('/api/ingest', { images,
      subject_name: w.subjectName || '', sanctity_mode: w.mode || 'strict' });
    if (!r.ok) { w.error = (r.data && r.data.error) || 'تعذّر الاتصال بالخادم'; return w; }
    const got = Array.isArray(r.data.questions) ? r.data.questions : [];
    if (!got.length) {
      w.error = 'لم نقرأ سؤالًا واحدًا من الصور. تأكّد أنها واضحة ومضاءة وغير مقلوبة، ' +
                'أو صوّرها أقرب — وجرّب صورةً واحدة أولًا.';
      w.raw = []; w.total = 0;
      return w;
    }
    w.filename = (images[0] && images[0].filename) || 'صور';
    w.raw = got; w.total = r.data.total;
    w.readBy = 'ai';
    w.fromImages = r.data.from_images || images.length;
    w.unverified = r.data.unverified || 0;
    w.fileB64 = null;           // لا «أعد القراءة» — الصور لا تُعاد قراءتها بالقواعد
    w.subjectName = w.subjectName || r.data.subject_name || '';
    w.slug = w.slug || r.data.slug || '';
    w.step = 2;
    return w;
  },

  /*
    ★ الملف فوق ٣٫٥ ميغابايت يُرفع إلى مخزن Supabase مباشرة (bucket: uploads)
    ثم يُرسل مساره — لا جسمه. Vercel يرفض الجسم فوق ٤٫٥ ميغابايت بلا رسالة
    مفهومة، وكان PDF الدكتور يسقط عندها بصمت. المسار يبدأ بمعرّف الطالب
    فلا يقرأ الخادم إلا ملفاته. يحتاج db/UPLOADS.sql مرة واحدة.
  */
  BIG_FILE: 3.5 * 1024 * 1024,
  async storageUpload(file){
    const c = QBANK.config.get(), s = QBANK.api.session(), f = QBANK.api.fetchFn();
    const u = QBANK.api.user();
    if (!c || !s || !u || !f) return { ok:false, error:'لا جلسة' };
    const safe = String(file.name || 'file').replace(/[^\w.\-\u0600-\u06FF]+/g, '_').slice(-80);
    const path = u.id + '/' + Date.now() + '-' + safe;
    try {
      const res = await f(c.url + '/storage/v1/object/uploads/' + path.split('/').map(encodeURIComponent).join('/'), {
        method:'POST',
        /* بلا x-upsert: الاستبدال يحتاج سياسة قراءة لا نمنحها، والمسار فريد
           بالطابع الزمني أصلًا — فالإدراج البسيط يكفي ويمرّ من RLS */
        headers:{ 'Authorization':'Bearer ' + s.access_token, 'apikey': c.anonKey,
                  'Content-Type': file.type || 'application/octet-stream' },
        body: file
      });
      if (!res.ok){
        const t = await res.text().catch(() => '');
        return { ok:false, error: res.status === 404 || /Bucket not found/i.test(t)
          ? 'مخزن الملفات الكبيرة غير مهيّأ بعد (نفّذ db/UPLOADS.sql) — أو ارفع ملفًا أصغر من ٣٫٥ ميغابايت.'
          : 'تعذّر رفع الملف إلى المخزن (' + res.status + ')' };
      }
      return { ok:true, path };
    } catch(e){ return { ok:false, error:'تعذّر الاتصال بالمخزن' }; }
  },

  /*
    ★ قراءة الأجزاء متوازيةً من المتصفح.
    الخادم يعيد الأجزاء حين يحتاج الملفُ الذكاءَ؛ ثلاثة نداءات معًا، كلٌّ
    قصير. onPart يُعلم الشاشة كي يرى الطالب «قُرئ ٤ من ١٢» لا سطرًا جامدًا.
    التكرار الناتج عن تراكب الأجزاء يُطوى بالنص المطبَّع.
  */
  async readParts(parts, onPart){
    const results = new Array(parts.length);
    let next = 0, done = 0, lastErr = null;
    const worker = async () => {
      while (next < parts.length){
        const i = next++;
        const r = await Admin.server('/api/ingest', { text_part: parts[i] });
        if (r.ok && r.data && Array.isArray(r.data.questions)) results[i] = r.data.questions;
        else { results[i] = []; lastErr = (r.data && r.data.error) || 'تعذّر جزء'; }
        done++; if (onPart) onPart(done, parts.length);
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, parts.length) }, worker));
    const seen = Object.create(null), out = [];
    const norm = t => String(t || '').replace(/[\u064B-\u0652\u0640]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    results.forEach(list => (list || []).forEach(q => {
      const k = norm(q.q); if (!k || seen[k]) return; seen[k] = 1; q.num = out.length + 1; out.push(q);
    }));
    return { questions: out, error: out.length ? null : lastErr };
  },

  async wizardIngest(w, filename, base64, forceAi, opts){
    const o = opts || {};
    const body = { filename, subject_name: w.subjectName || '', sanctity_mode: w.mode || 'strict', force_ai: forceAi === true };
    if (o.storagePath) body.storage_path = o.storagePath; else body.content_base64 = base64;
    const r = await Admin.server('/api/ingest', body);
    if (!r.ok) { w.error = (r.data && r.data.error) || 'تعذّر الاتصال بالخادم'; return w; }

    /* الملف الكبير الذي يحتاج الذكاء: الخادم قسّمه — نقرأ الأجزاء هنا متوازيةً */
    if (r.data && r.data.need_ai && Array.isArray(r.data.parts)){
      const rp = await Admin.readParts(r.data.parts, o.onPart);
      const rules = Array.isArray(r.data.rules_questions) ? r.data.rules_questions : [];
      const best = rp.questions.length > rules.length ? rp.questions : rules;
      r.data.questions = best; r.data.total = best.length;
      r.data.read_by = best === rules ? 'rules' : 'ai';
      r.data.unverified = best.filter(q => q.unverified).length;
      if (!best.length && rp.error) { w.error = rp.error; w.raw = []; w.total = 0; return w; }
    }

    /*
      ★ الحارس الذي كان ناقصًا.
      كان المعالج يتقدّم مهما كان عدد الأسئلة — حتى صفرًا. فملفٌ لم يتعرّف
      عليه المحلّل يمرّ بصمت إلى «راجع» فيراها الطالب فارغة، ثم يضغط «انشر»
      فتُنشأ مادة بصفر أسئلة تظهر في «استكشف» ولا يفتحها أحد.
      وقع هذا فعلًا. الصمت هنا أسوأ من الفشل: الفشل يُصلَح، والصمت يُنشر.
    */
    const got = Array.isArray(r.data.questions) ? r.data.questions : [];
    if (!got.length) {
      w.error = 'لم نتعرّف على سؤال واحد في هذا الملف — وقد جرّبنا القواعد والذكاء معًا. ' +
                'الأرجح أن الأسئلة صورٌ ممسوحة ضوئيًا لا نصّ؛ صدّرها نصًّا وأعد الرفع، ' +
                'وانظر «قالب بنك الأسئلة» أسفل الصفحة.';
      w.raw = []; w.total = 0;
      return w;
    }

    w.filename = filename; w.raw = got; w.total = r.data.total;
    // كيف قُرئ؟ وكم سؤالًا لم نجد نصّه حرفًا بحرف؟ — يُعرضان للرافع لا يُخبآن
    w.readBy = r.data.read_by || 'rules';
    w.unverified = r.data.unverified || 0;
    w.fileB64 = base64;          // نحتفظ به لإعادة القراءة بلا رفعٍ ثانٍ
    w.subjectName = w.subjectName || r.data.subject_name || '';
    w.slug = r.data.slug || '';
    w.step = 2; w.error = '';
    return w;
  },

  // «افهمه بالذكاء» على دفعات: المسوّدة تُحفظ بعد كل دفعة فيمكن إغلاق الصفحة والعودة
  /*
    المسار المجاني: نبني الأسئلة من المقسّم مباشرة بلا نداء ذكاء.
    ما ينقصها هو الشرح والترجمة وبطاقة الحفظ — والسؤال بلا إجابة معلنة
    يبقى بلا إجابة، فنوسمه ليصحّحه صاحبه بيده في المحرر.
  */
  plainEnrich(w){
    /*
      ★ حتى المسار المجاني لا يتقدّم بلا سؤال.
      «مجاني» يصف الثمن لا المحتوى: مادة بلا أسئلة ليست بنكًا مجانيًا،
      هي عطل. وبدون هذا السطر كانت raw الفارغة تمرّ إلى الخطوة ٣ صامتة.
    */
    if (!Array.isArray(w.raw) || !w.raw.length) {
      w.error = 'لا أسئلة في هذه المسوّدة — أعد رفع الملف من الخطوة الأولى.';
      return w;
    }
    w.enriched = w.raw.map(q => ({
      q: q.q, q_original: q.q, sanctity_mode: 'strict',
      options: q.has_options ? q.options.slice() : [String(q.answer_text || '—')],
      options_original: q.has_options ? q.options.slice() : [],
      answer: (q.has_options && typeof q.answer === 'number' && q.answer >= 0) ? q.answer : 0,
      derived: !(q.has_options && typeof q.answer === 'number' && q.answer >= 0),
      opts_built: !q.has_options,
      expl_ar:'', expl_en:'', translation:'', mnemonic:{}, topic:'', important:false
    }));
    w.done = w.total; w.step = 3; w.error = '';
    return w;
  },

  /*
    كم كوينًا يلزم لإثراء هذا الملف.
    ★ `costPerQ || 1` كان يبتلع الصفر: الصفر قيمةٌ كاذبة في جافاسكربت،
    فمنصةٌ قرّرت أن تجعل الإثراء مجانيًا كانت تُحاسِب بكوين للسؤال رغمًا
    عنها. الصفر هنا قرارٌ لا نقصان بيانات، فنميّزه صراحةً.
  */
  costPerQ(credits){
    const c = credits && credits.cost_per_q;
    return (typeof c === 'number' && c >= 0) ? c : 1;
  },
  creditsNeeded(w, costPerQ){
    const c = (typeof costPerQ === 'number' && costPerQ >= 0) ? costPerQ : 1;
    return Math.max(0, (w.raw.length - w.done)) * c;
  },

  async wizardEnrich(w, onProgress){
    // المسار المجاني لا يمرّ بالخادم إطلاقًا — لا تكلفة ولا انتظار
    if (!w.enrich) {
      const r = Admin.plainEnrich(w);
      if (r.error) return r;
      await Admin.saveDraft(r);
      return r;
    }

    const batches = Admin.chunk(w.raw, Admin.BATCH);
    /*
      ★ دفعتان معًا لا واحدةٌ بعد واحدة.
      كل دفعة مستقلة: تحسم رصيدها، تنادي الخادم، وتكتب في موضعها هي
      (لا بالإلحاق — الإلحاق ضاعف الأسئلة يومًا عند الاستئناف). فلا شيء
      يمنع تشغيل اثنتين متوازيتين سوى العادة. الخطأ في إحداهما يوقف
      جدولة ما بعدها ويُترك ما بدأ يكمل.
    */
    let nextI = 0, stop = false;
    w.error = ''; w.errorKind = '';   // خطأ جولةٍ سابقة لا يُبقي الاستئناف عالقًا
    const runBatch = async (i) => {
      if (w.done >= (i + 1) * Admin.BATCH && w.enriched[i * Admin.BATCH]) return;   // مكتملة من استئناف سابق
      if (onProgress) onProgress(w.done, w.total, { batch: i + 1, batches: batches.length, running: true });

      const cpq = (typeof w.costPerQ === 'number' && w.costPerQ >= 0) ? w.costPerQ : 1;
      const need = batches[i].length * cpq;
      const pay = need > 0
        ? await QBANK.api.rpc('spend_credits',
            { n: need, p_reason: 'إثراء ' + batches[i].length + ' سؤالًا', p_draft: w.draftId })
        : { ok:true, data:{ ok:true, spent:0 } };
      if (!pay.ok || !pay.data || !pay.data.ok) {
        const d = (pay.data) || {};
        w.error = d.reason === 'insufficient'
          ? 'رصيدك ' + (d.balance || 0) + ' كوين ولا يكفي — يلزم ' + need
          : (d.reason === 'closed' ? 'الإثراء موقوف مؤقتًا' : 'تعذّر حسم الرصيد');
        w.needCoins = d.reason === 'insufficient' ? need - (d.balance || 0) : 0;
        stop = true; return;
      }

      const r = await Admin.server('/api/ai', { questions: batches[i], sanctity_mode: w.mode || 'strict' });
      if (!r.ok) {
        if (need > 0)
          await QBANK.api.rpc('refund_credits', { n: need, p_reason: 'تعذّرت الدفعة', p_draft: w.draftId });
        w.error = (r.data && r.data.error) || 'انقطعت الدفعة ' + (i + 1) + ' — رُدّ رصيدها';
        w.errorKind = (r.data && r.data.kind) || 'other';
        stop = true; return;
      }
      const at = i * Admin.BATCH;
      const got = r.data.questions || [];
      for (let k = 0; k < got.length; k++) w.enriched[at + k] = got[k];
      w.done = Math.min(w.enriched.filter(Boolean).length, w.total);
      if (r.data.usage) w.usage = r.data.usage;
      await Admin.saveDraft(w);
      if (onProgress) onProgress(w.done, w.total, { batch: i + 1, batches: batches.length, running: false });
    };
    const worker = async () => { while (!stop && nextI < batches.length) await runBatch(nextI++); };
    await Promise.all([worker(), worker()]);
    if (stop) return w;
    if (w.done >= w.total) { w.step = 3; w.error = ''; }
    return w;
  },

  /*
    ★ من صاحب المسوّدة؟ الرافع الذي اختاره المشرف، وإلا من يرفع.
    المشرف يرفع بنكًا أرسله له طالب ويُسنده إليه — فتُكتب المسوّدة باسم
    الطالب من أولها: يراها في «مسوّداتي» ويستأنفها إن شاء، وapprove_draft
    تكتب المادة والمدّة له لا للمشرف. الطالب لا يملك هذا الحقل — السياسة
    تمنعه من كتابة اسم غيره.
  */
  ownerOf(w){
    const u = QBANK.api.user() || {};
    return (w && w.uploader && w.uploader.id) || u.id || null;
  },

  async saveDraft(w){
    const body = {
      name: w.subjectName || w.filename.replace(/\.[^.]+$/, ''),
      source_name: w.filename,
      status: w.done >= w.total ? 'reviewing' : 'processing',
      payload: w.enriched, total: w.total, done: w.done,
      updated_at: new Date().toISOString()
    };
    if (w.draftId) {
      /* المشرف قد يغيّر الرافع بعد إنشاء المسوّدة — يُكتب مع كل حفظ */
      if (w.uploader && QBANK.store.get('is_admin_check', {}).ok) body.created_by = Admin.ownerOf(w);
      return QBANK.api.rest('drafts?id=eq.' + w.draftId, { method:'PATCH', body: JSON.stringify(body) });
    }
    body.created_by = Admin.ownerOf(w);
    const r = await QBANK.api.rest('drafts?select=id', {
      method:'POST',
      headers: Object.assign(QBANK.api.headers(), { 'Prefer':'return=representation' }),
      body: JSON.stringify(body)
    });
    if (r.ok && r.data && r.data[0]) { w.draftId = r.data[0].id; w.draftError = ''; }
    else {
      /*
        ★ فشل الحفظ يُسجَّل ولا يُبتلع.
        كان يُهمَل تمامًا، فيمضي المعالج إلى «راجع» ثم «انشر» بمسوّدة لم
        تُنشأ قط — والأسئلة كلها في المتصفح فتبدو الشاشة سليمة. ثم يضغط
        الطالب «انشر» فيُقال له «المسوّدة غير موجودة»: جملة صادقة لا تدلّ
        على السبب، بعد أن أنفق دقائق وانتظر الذكاء.
      */
      w.draftError = (r.data && (r.data.message || r.data.error)) ||
                     (r.offline ? 'لا اتصال بالخادم' : 'تعذّر حفظ المسوّدة');
    }
    return r;
  },

  /*
    الاعتماد: نداء واحد ذرّي في قاعدة البيانات — إما كل شيء أو لا شيء.

    ★ ومحاولةُ إنقاذٍ قبله: إن لم تُحفظ المسوّدة (انقطاع، أو صلاحية كانت
    ناقصة) فالأسئلة ما زالت في المتصفح كاملة، فنحاول حفظها الآن بدل أن
    نردّ الطالب خائبًا. ما دام ما يلزم موجودًا فالفشل اختيارٌ لا قدر.
  */
  async approve(w, publish){
    if (!w.draftId) {
      await Admin.saveDraft(w);
      if (!w.draftId) {
        return { ok:false, data:{ message:
          'تعذّر حفظ مادتك على الخادم' + (w.draftError ? ' — ' + w.draftError : '') +
          '. تحقق من اتصالك وأعد المحاولة؛ أسئلتك لم تضِع.' } };
      }
    }
    return QBANK.api.rpc('approve_draft', { draft_id: w.draftId, publish });
  },

  /*
    بعد الاعتماد نختم المادة بهوية رافعها: من رفعها، وبأي نمط، وبأي مسار.
    نداء منفصل عن approve_draft عمدًا كي لا نغيّر توقيع دالة معتمدة تعمل،
    وفشله لا يُبطل مادة أُنشئت — يبقى المشرف قادرًا على ضبط الباقي بيده.
  */
  /*
    ★ الرابط يُقرأ من الخادم لا يُخمَّن.
    كنّا نبني رابط المشاركة من `w.slug` الذي حسبه ‎/api/ingest‎ في المتصفح،
    ثم نفترض أنه كُتب في الصف. وحين تفشل كتابته (صلاحية، أو تصادم اسم)
    يبقى الصفّ بلا slug فيفتح الرابطُ «المادة غير متاحة» — وهي متاحة،
    والرافع هو من أنشأها قبل ثانية. أسوأ لحظة تكذب فيها المنصة على صاحبها.
  */
  async realSlug(subjectId){
    if (!subjectId) return null;
    const r = await QBANK.api.rest('subjects?id=eq.' + subjectId + '&select=slug');
    return (r.ok && r.data && r.data[0] && r.data[0].slug) || null;
  },

  async stamp(subjectId, w, publish){
    if (!subjectId) return { ok:false };
    const body = {
      /* الرافع المختار لا من ضغط الزرّ — وإلا عادت المادة إلى المشرف بعد أن كتبتها القاعدة للطالب */
      created_by: Admin.ownerOf(w),
      sanctity_mode: w.mode === 'enhanced' ? 'enhanced' : 'strict',
      course_code: w.courseCode || ''
    };
    /*
      ★ الحالة لا تُكتب هنا إلا عند النشر.
      كان الختم يكتب 'published' دائمًا — فمن ضغط «احفظ مخفية» وجد مادته
      منشورة بعد ثانية: approve_draft أوقفتها، والختم أعادها. الآن الختم
      يؤكّد النشر إن نُشرت، ويترك المخفية كما تركتها القاعدة.
    */
    if (publish !== false) body.status = 'published';
    /*
      ★ الحقل الفارغ يُحذف ولا يُرسل صفرًا.
      كان يُرسل `slug: w.slug || null` دائمًا. والقاعدة تولّد الرابط عند
      الإنشاء، فيأتي هذا التحديث بعده بثانية ويكتب null فوقه فيمحوه —
      وتصير المادة «غير متاحة» وهي منشورة سليمة.

      ومتى يكون فارغًا؟ حين تُستأنف مسوّدة: الاستئناف يجلب الأسئلة ولا
      يجلب الرابط، فيبدأ المعالج بحقلٍ خالٍ. فالملفات الكبيرة — التي
      تُحفظ مسوّداتها وتُستأنف — كانت أكثرها عرضةً لهذا.

      والقاعدة العامة: PATCH جزئيٌّ يرسل ما يعرفه فقط. وإرسال null معناه
      «امحُ ما هناك»، وهذا ليس ما نقصد حين لا نعرف.
    */
    if (w.slug) body.slug = w.slug;
    // الجامعة والكلية تُنشآن في الخادم إن لم تكونا موجودتين — والتطبيع يمنع التكرار
    if (w.country && w.university){
      const r = await QBANK.api.rpc('ensure_university', { p_country: w.country, p_name: w.university });
      if (r.ok && r.data && typeof r.data === 'string'){
        body.university_id = r.data;
        if (w.college){
          const c = await QBANK.api.rpc('ensure_college', { p_university: r.data, p_name: w.college });
          if (c.ok && c.data && typeof c.data === 'string') body.college_id = c.data;
        }
      }
    }
    return QBANK.api.rest('subjects?id=eq.' + subjectId, { method:'PATCH', body: JSON.stringify(body) });
  },

  // كشف المكرر بتشابه نصي بسيط: نفس الأحرف الدنيا بعد إزالة الفراغات — يوسم لا يحذف
  findDuplicates(questions){
    const seen = new Map(), dups = [];
    questions.forEach((q, i) => {
      const key = String(q.q || '').toLowerCase().replace(/\s+/g, ' ').trim();
      if (seen.has(key)) dups.push({ index: i, firstIndex: seen.get(key) });
      else seen.set(key, i);
    });
    return dups;
  }
};

/* ===== الواجهة =====
   كل تبويبات اللوحة تستعمل مكوّنات واحدة: ad-kpi للمؤشرات، ad-panel للأقسام،
   ad-row للصفوف. التفاوت بين التبويبات يجعل اللوحة تبدو مجموعة صفحات لا لوحة. */
function adminPanel(title, sub, body){
  return el('section', { class:'ad-panel' }, [
    el('div', { class:'ad-panel__h' }, [
      el('h2', { class:'ad-panel__t', text:title }),
      sub ? el('span', { class:'ad-panel__s', text:sub }) : null
    ]),
    body
  ]);
}

function adminStudentsTab(box){
  box.appendChild(el('p', { class:'page__sub', text:'جارٍ الجلب…' }));
  Promise.all([ QBANK.api.rpc('admin_stats'), QBANK.api.rpc('admin_students', { page:0, page_size:50, search:'' }) ])
    .then(([st, rows]) => {
      if (!box.isConnected) return;   // غادر المشرف الشاشة قبل وصول الرد
      box.innerHTML = '';
      if (!st.ok || (st.data && st.data.error)) {
        box.appendChild(QBANK.views.empty('⚠', 'تعذّر الجلب', st.offline ? 'لا اتصال بالإنترنت.' : 'تأكد أن حسابك مشرف وأن قاعدة البيانات مجهزة.'));
        return;
      }
      const s = st.data;
      const K = QBANK.admin.charts.kpi;
      box.appendChild(el('div', { class:'ad-kpis' }, [
        K(s.students, 'طالبًا', 'مسجَّل'),
        K(s.active_7d, 'نشط', 'آخر ٧ أيام', s.active_7d > 0 ? 'live' : null),
        K(s.attempts, 'اختبارًا', 'منذ الإطلاق'),
        K(s.avg_pct + '٪', 'متوسط النتائج', s.avg_pct >= 70 ? 'فوق حدّ النجاح' : 'تحت حدّ النجاح',
          s.avg_pct >= 70 ? 'live' : (s.avg_pct > 0 ? 'warn' : null))
      ]));
      const list = (rows.ok && rows.data && rows.data.rows) || [];
      if (!list.length) { box.appendChild(QBANK.views.empty('👥', 'لا طلاب بعد', 'سيظهر الطلاب هنا فور تسجيلهم.')); return; }
      const tbl = el('div', { class:'ad-table' }, list.map(r => {
        const row = el('button', { class:'ad-row', type:'button' }, [
          el('span', { class:'ad-feed__av', text: r.avatar || '👤' }),
          el('span', { class:'ad-row__main' }, [
            el('span', { class:'ad-row__t', text: r.name || 'بلا اسم' }),
            el('span', { class:'ad-row__s', text: r.attempts + ' اختبار' })
          ]),
          el('span', { class:'badge num ' + (r.best >= 70 ? 'badge--ok' : ''),
            text: 'أفضل ' + Math.round(r.best) + '٪' })
        ]);
        row.addEventListener('click', async () => {
          const at = await QBANK.api.rpc('admin_attempts', { uid: r.id });
          const items = (at.ok && Array.isArray(at.data)) ? at.data : [];
          const det = el('div', { class:'ad-sub' },
            items.length ? items.map(a => el('div', { class:'ad-feed__i' }, [
              el('span', { class:'ad-row__main' }, [ el('span', { class:'ad-row__t', text: a.subject }) ]),
              el('span', { class:'badge num ' + (a.pct >= 70 ? 'badge--ok' : 'badge--warn'),
                text: Math.round(a.pct) + '٪' }),
              el('span', { class:'ad-feed__t', text: Math.round(a.duration_s / 60) + ' د' })
            ])) : [el('p', { class:'page__sub', style:'margin:0', text:'لا محاولات لهذا الطالب.' })]);
          row.parentNode.insertBefore(det, row.nextSibling);
        }, { once:true });
        return row;
      }));
      box.appendChild(el('div', { class:'ad-panels', style:'margin-top:22px' }, [
        adminPanel('الطلاب', list.length + ' طالبًا · اضغط أيًّا منهم لمحاولاته', tbl)
      ]));
    });
}

function adminContentTab(box){
  const upBtn = el('a', { class:'btn', href:'#/admin/upload', text:'⇪ ارفع ملف أسئلة' });
  box.appendChild(el('div', { class:'ad-bar' }, [
    upBtn,
    el('a', { class:'btn btn--ghost', href:'#/explore', text:'⌕ اعرض ما يراه الطالب' })
  ]));
  const listBox = el('div', { class:'ad-panels' });
  box.appendChild(listBox);
  listBox.appendChild(el('p', { class:'page__sub', text:'جارٍ الجلب…' }));

  Promise.all([
    /* ★ السعر في الجلب: بلا العمود يبدأ كل حقلٍ في القائمة بصفرٍ كاذب،
       فيحفظه المشرف بلا قصدٍ ويُمحى سعرُ مادةٍ كان صحيحًا. */
    QBANK.api.rest('subjects?select=id,name,color,icon,q_count,published,free,price,ord,exam_date,created_by,owner_edit&order=ord'),
    // قوائم المسوّدات بلا payload — الحمولة كبيرة ولا تلزم القائمة
    QBANK.api.rest('drafts?select=id,name,status,total,done,updated_at,created_by&order=updated_at.desc')
  ]).then(async ([subs, drs]) => {
    if (!listBox.isConnected) return;
    const subjects = (subs.ok && subs.data) || [];
    const drafts = (drs.ok && drs.data) || [];

    /*
      ★ «رفعها فلان» في القائمة.
      بعد أن صار الإسناد ممكنًا يجب أن يُرى: المشرف يمرّ على الصفوف فيعرف
      أيّها مواد الطلاب وأيّها مواده. جلبٌ واحد لأسماء كل الرافعين — لا نداء
      لكل صف. وفشله لا يُعطّل القائمة: تُرسم بلا أسماء.
    */
    const names = {};
    const me = (QBANK.api.user() || {}).id;
    const ids = {};
    subjects.concat(drafts).forEach(x => { if (x.created_by && x.created_by !== me) ids[x.created_by] = 1; });
    const idList = Object.keys(ids);
    if (idList.length){
      try {
        const pr = await QBANK.api.rest('profiles?select=id,name&id=in.(' + idList.join(',') + ')');
        ((pr.ok && Array.isArray(pr.data)) ? pr.data : []).forEach(p => { names[p.id] = String(p.name || '').trim() || 'طالب بلا اسم'; });
      } catch(e){ /* القائمة تُرسم بلا أسماء */ }
    }
    const by = x => !x.created_by ? '' : (x.created_by === me ? 'أنا' : (names[x.created_by] || 'طالب'));
    if (!listBox.isConnected) return;
    listBox.innerHTML = '';

    /*
      ★ زرّ حذفٍ لكل مسوّدة ولكل مادة (بطلب علي).
      مسوّدةٌ انقطع رفعها، أو مادةٌ رُفعت خطأً — كانتا تبقيان في القائمة
      بلا مخرج إلا SQL. الحذف بضغطتين: الأولى تسلّح الزرّ وتُسمّي الفعل،
      والثانية تنفّذ. والقاعدة تحذف ما يتبعها (الأسئلة، المحاولات) بالتتابع.
    */
    const armedDelete = (label, onDo) => {
      const b = el('button', { class:'btn btn--sm btn--ghost', type:'button', text:'احذف', 'aria-label': label });
      let armed = false, t = null;
      b.addEventListener('click', async () => {
        if (!armed){ armed = true; b.textContent = 'اضغط ثانيةً — حذف نهائي'; b.className = 'btn btn--sm btn--danger';
          t = setTimeout(() => { armed = false; b.textContent = 'احذف'; b.className = 'btn btn--sm btn--ghost'; }, 6000); return; }
        clearTimeout(t); b.disabled = true; b.textContent = '… يُحذف';
        await onDo();
      });
      return b;
    };
    const stale = d => d.status !== 'reviewing' && d.status !== 'approved'
                    && (Date.now() - new Date(d.updated_at).getTime()) > 3600 * 1000;

    const pending = drafts.filter(d => d.status !== 'approved');
    if (pending.length) {
      listBox.appendChild(adminPanel('المسوّدات', pending.length + ' غير معتمدة — لا يراها الطالب',
        el('div', { class:'ad-table' }, pending.map(d =>
          el('div', { class:'ad-row', style:'cursor:default' }, [
            el('span', { class:'ad-row__main' }, [
              el('span', { class:'ad-row__t', text: d.name || 'بلا اسم' }),
              el('span', { class:'ad-row__s', text:
                (d.status === 'reviewing' ? 'اكتملت المعالجة — بانتظار مراجعتك'
                  : (stale(d) ? 'عالقة منذ ' + QBANK.admin.charts.ago(d.updated_at) + ' — '
                              : 'قيد المعالجة: ') + d.done + ' من ' + d.total)
                + (by(d) && by(d) !== 'أنا' ? ' · رفعها ' + by(d) : '') })
            ]),
            el('span', { class:'badge ' + (d.status === 'reviewing' ? 'badge--warn' : (stale(d) ? 'badge--bad' : '')),
              text: d.status === 'reviewing' ? 'راجِعها' : (stale(d) ? 'عالقة' : 'تُعالَج') }),
            el('a', { class:'btn btn--sm btn--soft', href:'#/admin/upload?draft=' + d.id, text:'أكمل' }),
            armedDelete('احذف مسوّدة ' + (d.name || ''), async () => {
              const r = await QBANK.api.rest('drafts?id=eq.' + d.id, { method:'DELETE' });
              QBANK.toast(r.ok ? 'حُذفت المسوّدة' : 'تعذّر الحذف');
              if (r.ok) QBANK.router.render('#/admin/content');
            })
          ])))));
    }

    if (!subjects.length) {
      listBox.appendChild(QBANK.views.empty('▤', 'لا مواد بعد', 'ارفع أول ملف أسئلة وسيظهر هنا بعد الاعتماد.'));
      return;
    }
    const subTable = el('div', { class:'ad-table' });
    subjects.forEach(sub => {
      const pubBtn = el('button', { class:'btn btn--sm ' + (sub.published ? 'btn--soft' : ''), type:'button',
        text: sub.published ? 'أخفِ' : 'انشر' });
      pubBtn.addEventListener('click', async () => {
        const r = await QBANK.api.rest('subjects?id=eq.' + sub.id,
          { method:'PATCH', body: JSON.stringify({ published: !sub.published }) });
        QBANK.toast(r.ok ? 'تم' : 'تعذّر التعديل');
        if (r.ok) QBANK.router.render('#/admin/content');
      });
      const dateIn = el('input', { class:'input input--sm', type:'date',
        value: sub.exam_date ? String(sub.exam_date).slice(0,10) : '', 'aria-label':'موعد اختبار ' + sub.name });
      dateIn.addEventListener('change', async () => {
        await QBANK.api.rest('subjects?id=eq.' + sub.id,
          { method:'PATCH', body: JSON.stringify({ exam_date: dateIn.value || null }) });
        QBANK.toast('حُفظ الموعد');
      });
      const freeBtn = el('button', { class:'btn btn--sm btn--ghost', type:'button',
        text: sub.free ? '★ مجانية' : 'اجعلها مجانية' });
      freeBtn.addEventListener('click', async () => {
        // الوسم يجرّ السعر: مجانيةٌ بسعرٍ تناقضٌ يراه الطالب في مكانين
        const goFree = !sub.free;
        await QBANK.api.rest('subjects?id=eq.' + sub.id, { method:'PATCH',
          body: JSON.stringify({ free: goFree,
            price: goFree ? 0 : (Number(sub.price) > 0 ? sub.price : 29) }) });
        QBANK.router.render('#/admin/content');
      });

      /*
        ★ السعر في القائمة لا في المحرّر وحده.
        التسعير عملٌ يُقارَن: المشرف يمرّ على عشرين مادة فيرفع هذه ويخفض
        تلك. وفتحُ محرّرٍ كامل لكل واحدة ثم العودة يجعل المقارنة مستحيلة.
      */
      const priceIn = el('input', { class:'input num', type:'number', min:'0', max:'999',
        inputmode:'numeric', style:'width:86px', value: String(sub.price == null ? 0 : sub.price),
        'aria-label':'سعر «' + sub.name + '» بالريال' });
      priceIn.addEventListener('change', async () => {
        const price = Math.max(0, Math.min(999, parseInt(priceIn.value || '0', 10) || 0));
        priceIn.value = String(price);
        const r = await QBANK.api.rest('subjects?id=eq.' + sub.id, { method:'PATCH',
          body: JSON.stringify({ price: price, free: price === 0 }) });
        QBANK.toast(r.ok ? (price ? 'السعر ' + QBANK.views.arNum(price) + ' ريالًا'
                                  : 'صارت مجانية') : 'تعذّر الحفظ');
        if (r.ok) QBANK.router.render('#/admin/content');
      });
      const priceWrap = el('label', { class:'ad-inline' }, [
        el('span', { class:'ad-inline__l', text:'السعر ﷼' }), priceIn ]);
      /* ★ صلاحية جديدة: إعادة توليد التحليل الشامل لأي مادة بضغطة —
         بعد تصحيح أسئلة أو ضم مادة قديمة، بدل انتظار قادح البُطلان */
      const anaBtn = el('button', { class:'btn btn--sm btn--ghost', type:'button', text:'⟳ حلّل' });
      anaBtn.addEventListener('click', async () => {
        if (!QBANK.analysis) return QBANK.toast('التحليل غير محمّل');
        anaBtn.setAttribute('aria-disabled','true'); anaBtn.textContent = '… يحلَّل';
        const r = await QBANK.analysis.generate(sub.id, 'ar');
        anaBtn.removeAttribute('aria-disabled'); anaBtn.textContent = '⟳ حلّل';
        QBANK.toast(r && r.ok ? 'اكتمل التحليل: ' + ((r.data && r.data.topics) || []).length + ' محاور'
                              : 'تعذّر التحليل — ' + ((r && r.data && r.data.error) || 'حاول ثانية'));
      });
      subTable.appendChild(el('div', { class:'ad-row', style:'cursor:default;flex-wrap:wrap' }, [
        el('span', { text: sub.icon || '▤' }),
        el('span', { class:'ad-row__main' }, [
          el('span', { class:'ad-row__t', text: sub.name }),
          el('span', { class:'ad-row__s', text: sub.q_count + ' سؤالًا' + (by(sub) ? ' · رفعها ' + by(sub) : '') })
        ]),
        sub.published ? el('span', { class:'badge badge--ok', text:'منشورة' })
                      : el('span', { class:'badge', text:'مخفية' }),
        /* الرافع يعدّل بعد النشر؟ — يُرى هنا كي لا يُفتح المفتاح ويُنسى */
        (sub.published && sub.owner_edit) ? el('span', { class:'badge badge--warn', text:'الرافع يعدّل' }) : null,
        el('a', { class:'btn btn--sm btn--soft', href:'#/admin/subject/' + sub.id, text:'حرّر' }),
        pubBtn,
        el('span', { class:'ad-sub', style:'flex:1 0 100%' }, [
          el('label', { class:'ad-inline' }, [
            el('span', { class:'ad-inline__l', text:'موعد الاختبار' }), dateIn ]),
          priceWrap, freeBtn, anaBtn,
          armedDelete('احذف مادة ' + sub.name, async () => {
            const r = await QBANK.api.rest('subjects?id=eq.' + sub.id, { method:'DELETE' });
            QBANK.toast(r.ok ? 'حُذفت «' + sub.name + '» وأسئلتها' : 'تعذّر الحذف — ' + ((r.data && r.data.message) || ''));
            if (r.ok){ try { await QBANK.data.refreshPack(); } catch(e){} QBANK.router.render('#/admin/content'); }
          })
        ])
      ]));
    });
    listBox.appendChild(adminPanel('المواد', subjects.length + ' مادة على المنصة', subTable));
  });
}

function adminSettingsTab(box){
  // إعداد الربط: يعمل حتى قبل الدخول — هو أول ما يفعله المشرف عند التركيب
  const c = QBANK.config.get() || {};
  const urlIn = el('input', { class:'input', dir:'ltr', id:'cfgUrl', value: c.url || '', placeholder:'https://xxxx.supabase.co' });
  const keyIn = el('input', { class:'input', dir:'ltr', id:'cfgKey', value: c.anonKey || '', placeholder:'anon key' });
  const apiIn = el('input', { class:'input', dir:'ltr', id:'cfgApi', value: QBANK.store.get('api_base',''), placeholder:'https://qbank.vercel.app (اتركه فارغًا على نفس الموقع)' });
  const saveCfg = el('button', { class:'btn btn--block', type:'button', text:'احفظ الربط' });
  saveCfg.addEventListener('click', () => {
    const r = QBANK.config.set(urlIn.value.trim(), keyIn.value.trim());
    QBANK.store.set('api_base', apiIn.value.trim());
    QBANK.toast(r.ok ? 'حُفظ الربط — المنصة موصولة' : r.err);
  });
  box.appendChild(el('div', { class:'card stack' }, [
    el('h2', { text:'ربط الخادم' }),
    el('label', { class:'field', style:'margin:0' }, [ el('span', { class:'field__label', text:'رابط Supabase' }), urlIn ]),
    el('label', { class:'field', style:'margin:0' }, [ el('span', { class:'field__label', text:'المفتاح العام (anon) — عام بطبيعته، والحماية في RLS' }), keyIn ]),
    el('label', { class:'field', style:'margin:0' }, [ el('span', { class:'field__label', text:'رابط دوال الخادم (Vercel)' }), apiIn ]),
    saveCfg
  ]));

  // إعدادات المنصة من قاعدة البيانات
  const setBox = el('div', { class:'card stack' }, [ el('h2', { text:'إعدادات المنصة' }),
    el('p', { class:'page__sub', text:'جارٍ الجلب…' }) ]);
  box.appendChild(setBox);
  QBANK.api.rest('settings?id=eq.1').then(r => {
    if (!setBox.isConnected) return;
    const s = (r.ok && r.data && r.data[0]) || null;
    setBox.innerHTML = '';
    setBox.appendChild(el('h2', { text:'إعدادات المنصة' }));
    if (!s) { setBox.appendChild(el('p', { class:'page__sub', text:'تُجلب بعد ربط الخادم والدخول كمشرف.' })); return; }
    const welcome = el('textarea', { class:'input', rows:'3', id:'setWelcome' }); welcome.value = s.welcome_text || '';
    const boardBtn = el('button', { class:'btn btn--sm ' + (s.board_enabled ? 'btn--soft' : 'btn--ghost'), type:'button',
      text: s.board_enabled ? 'لوحة المتصدرين: مفعّلة' : 'لوحة المتصدرين: موقوفة' });
    const limitIn = el('input', { class:'input', type:'number', min:'1', max:'10', value: String(s.device_limit || 3), 'aria-label':'حد الأجهزة' });
    let boardOn = !!s.board_enabled;
    boardBtn.addEventListener('click', () => {
      boardOn = !boardOn;
      boardBtn.textContent = boardOn ? 'لوحة المتصدرين: مفعّلة' : 'لوحة المتصدرين: موقوفة';
    });
    const save = el('button', { class:'btn btn--block', type:'button', text:'احفظ الإعدادات' });
    save.addEventListener('click', async () => {
      const rr = await QBANK.api.rest('settings?id=eq.1', { method:'PATCH', body: JSON.stringify({
        welcome_text: welcome.value, board_enabled: boardOn, device_limit: parseInt(limitIn.value || '3', 10)
      }) });
      QBANK.toast(rr.ok ? 'حُفظت الإعدادات' : 'تعذّر الحفظ');
    });
    setBox.appendChild(el('label', { class:'field', style:'margin:0' }, [ el('span', { class:'field__label', text:'نص الترحيب' }), welcome ]));
    setBox.appendChild(boardBtn);
    setBox.appendChild(el('label', { class:'field', style:'margin:0' }, [ el('span', { class:'field__label', text:'حد الأجهزة لكل حساب' }), limitIn ]));
    setBox.appendChild(save);
  });
}

const ADMIN_TABS = [
  // تُحقن «اللوحة» من 42-admin-dash.js في المقدمة — أبقيناها منفصلة كي يبقى هذا الملف قابلًا للفحص وحده
  { id:'students', label:'الطلاب',   fill: adminStudentsTab },
  { id:'content',  label:'المحتوى',  fill: adminContentTab },
  { id:'settings', label:'الإعدادات', fill: adminSettingsTab }
];

/* أيقونة كل تبويب — بالمعرّف لا بالموضع، فالملفات اللاحقة تُدخل تبويباتها حيث تشاء */
Admin.ICONS = {
  dash:'layout', students:'users', content:'book', ugc:'upload', reports:'flag', quality:'checkCircle',
  money:'coins', campus:'school', audit:'list', settings:'settings'
};

const AdminView = {
  title:'لوحة التحكم',
  view(route){
    const u = QBANK.api.user();
    // بلا جلسة: نعرض دخول المشرف — إلا الإعدادات فهي تعمل محليًا لضبط الربط الأول
    if (!u && route.rest[0] !== 'settings') return QBANK.views.ViewAdminLogin.view();

    const active = ADMIN_TABS.some(t => t.id === route.rest[0]) ? route.rest[0] : ADMIN_TABS[0].id;

    /*
      ★ شريط اللوحة — رأس عالم المشرف المستقل.
      غلاف الطالب مخفيّ هنا (is-admin على الجسد)، فهذا الشريط هو التنقّل
      كله: هوية اللوحة، وكل التبويبات، ومخرج واحد صريح «افتح المنصة»
      يفتح واجهة الطالب في تبويب جديد — فلا يفقد المشرف مكانه أبدًا.
    */
    /* رأسٌ واحد مضغوط: كان فوقه عنوان الصفحة «لوحة التحكم» وشرحه، ثم هذا
       الشريط يقول الشيء نفسه — شاشةٌ كاملة على الجوال قبل أول رقم. عنوان
       الصفحة يُخفى على مسارات اللوحة (CSS)، والشريط يحمل الهوية والمخرج. */
    const head = el('div', { class:'ad-shell' }, [
      el('span', { class:'ad-shell__mark', 'aria-hidden':'true' }, [ QBANK.ico('shield', { size:18 }) ]),
      el('div', { class:'ad-shell__x' }, [
        el('strong', { class:'ad-shell__t', text:'لوحة المشرف' }),
        el('span', { class:'ad-shell__s', text: (u && u.email) || '' })
      ]),
      el('span', { class:'spacer' }),
      el('a', { class:'btn btn--ghost btn--sm', href:'#/', target:'_blank', rel:'noopener',
        text:'افتح المنصة ↗' })
    ]);

    /*
      ★ التبويبات بأيقونة وشارة عدّ.
      عشرة تبويبات نصّية متساوية لا تقول أيّها ينتظر. الأيقونة تُقرأ قبل
      الكلمة، والشارة الذهبية تقول «هنا ثلاثة ينتظرون» قبل أن يفتح
      المشرف صندوق الوارد أصلًا — الأرقام من admin_inbox نفسه.
    */
    const tabs = el('div', { class:'tabs tabs--admin', role:'tablist' },
      ADMIN_TABS.map(t => el('button', {
        class:'tabs__btn', type:'button', role:'tab', 'data-tab':t.id,
        'aria-selected': t.id === active ? 'true' : 'false' }, [
        el('span', { class:'tabs__ico', 'aria-hidden':'true' }, [ QBANK.ico(Admin.ICONS[t.id] || 'circle', { size:16 }) ]),
        el('span', { text: t.label }),
        el('span', { class:'tabs__n', 'data-n': t.id, hidden: true })
      ])));
    if (u && QBANK.api.rpc) QBANK.api.rpc('admin_inbox').then(r => {
      const d = (r && r.ok && r.data && !r.data.error) ? r.data : null;
      if (!d || !alive()) return;
      const counts = {
        money:   (Number(d.purchases) || 0) + (Number(d.phones) || 0) + (Number(d.payouts) || 0),
        content: Number(d.drafts) || 0,
        quality: Number(d.reports) || 0
      };
      Object.keys(counts).forEach(id => {
        const b = tabs.querySelector('[data-n="' + id + '"]');
        if (!b || !counts[id]) return;
        b.textContent = QBANK.views.arNum(counts[id]); b.hidden = false;
      });
    }).catch(() => {});
    tabs.addEventListener('click', e => {
      const b = e.target.closest('[data-tab]');
      if (b) QBANK.router.go('#/admin/' + b.getAttribute('data-tab'));
    });
    const body = el('div', { class:'stack', id:'adminBody' });
    ADMIN_TABS.filter(t => t.id === active)[0].fill(body);

    /*
      ★ حارس الصلاحية — يظهر لا يصمت.
      RLS تحمي البيانات فعلًا، لكن طالبًا فتح ‎#/admin كان يرى هيكل لوحةٍ
      فارغة «معطوبة» في ظنّه. نسأل القاعدة، فإن لم يكن مشرفًا استبدلنا
      اللوحة برسالة تسمّي الحال وبابًا يعيده لعالمه.
    */
    /* الطرد عند جوابٍ صريح فقط (is_admin === false): فشلُ الجلب أو انقطاعه
       لا يطرد — RLS تحمي البيانات أصلًا، وطردُ مشرفٍ لعطل شبكة عابر أسوأ
       من ترك هيكلٍ فارغ لطالبٍ فضولي لحظة. */
    if (u) QBANK.api.myProfile().then(r => {
      const notAdmin = r && r.ok && r.data && r.data.is_admin === false;
      if (!notAdmin || !body.isConnected) return;
      const page0 = body.closest('.page');
      if (!page0) return;
      page0.innerHTML = '';
      page0.appendChild(QBANK.views.empty('⛨', 'هذه اللوحة للمشرف',
        'حسابك مسجَّل لكنه بلا صلاحية إشراف. إن كنت المشرف فادخل بالبريد الصحيح.',
        el('a', { class:'btn', href:'#/', text:'العودة إلى المنصة' })));
    });

    /*
      ★ هيكل اللوحة: على الحاسوب شريطٌ جانبي ثابت والمحتوى بجانبه، وعلى
      الجوال الشريطُ نفسه صفٌّ أفقي يلتصق تحت الشريط العلوي. عنصرٌ واحد
      (tabs) بمظهرين — لا قائمتين تُصانان معًا.
    */
    const layout = el('div', { class:'ad-layout' }, [ el('aside', { class:'ad-side' }, [tabs]), el('div', { class:'ad-main' }, [body]) ]);
    return QBANK.views.page('لوحة التحكم', 'كل ما يظهر للطالب يمرّ من هنا أولًا.', [head, layout]);
  }
};

Object.assign(Admin, QBANK.admin || {});   // نحفظ ما ألحقته الملفات اللاحقة (charts وغيرها)
QBANK.admin = Admin;
QBANK.views.ADMIN_TABS = ADMIN_TABS;
QBANK.views.ViewAdmin = AdminView;
