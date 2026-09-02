/* ============ ٣٨ · نمطا القداسة: strict و enhanced ============ */
describe('٣٨ · نمطا المعالجة');
{
  const { enforce, verbatimOk, slugify, acceptable } = require('../api/_lib/sanctity.js');
  const ai = require('../api/ai.js');
  const ORIG = { q:'Which antidote is used for paracetmol overdose?', has_options:true,
    options:['N-acetylcysteine','Naloxone','Atropine','Flumazenil'], answer:0 };

  // strict: مهما كتب النموذج، الأصل يفوز — الطبقة الثانية
  const st = enforce(ORIG, { q_enhanced:'REWRITTEN', options_enhanced:['a','b','c','d'], topic:'سموم' }, 'strict');
  eq(st.q, ORIG.q, 'strict: نص السؤال لم يتغيّر رغم محاولة النموذج');
  eq(st.options.join('|'), ORIG.options.join('|'), 'strict: الخيارات لم تتغيّر');
  eq(st.sanctity_mode, 'strict', 'strict: النمط مسجَّل مع السؤال');
  ok(verbatimOk(ORIG, st), 'strict: فحص المطابقة الحرفية يمرّ');

  // النمط غير المعروف يسقط إلى strict — الافتراض الآمن
  const unknown = enforce(ORIG, { q_enhanced:'REWRITTEN' }, 'حسّن-لي-كل-شيء');
  eq(unknown.q, ORIG.q, 'نمط مجهول يسقط إلى strict لا إلى التحسين');

  // enhanced: التحسين مقبول، والأصل محفوظ
  const better = 'Which antidote is used for paracetamol overdose?';
  const en = enforce(ORIG, { q_enhanced: better, topic:'سموم' }, 'enhanced');
  eq(en.q, better, 'enhanced: الصياغة المحسَّنة هي المعروضة');
  eq(en.q_original, ORIG.q, 'enhanced: النص الأصلي محفوظ ولم يُمحَ');
  eq(en.sanctity_mode, 'enhanced', 'enhanced: النمط مسجَّل');
  ok(verbatimOk(ORIG, en), 'enhanced: الفحص يمرّ لأن الأصل باقٍ');

  // الأصل محفوظ في النمطين — هذا ما يبقي الفحص النصّي ذا معنى
  eq(st.q_original, ORIG.q, 'strict يحفظ الأصل أيضًا');
  eq(st.options_original.join('|'), ORIG.options.join('|'), 'الخيارات الأصلية محفوظة');

  // enhanced لا يعني السماح بأي شيء
  eq(enforce(ORIG, { q_enhanced:'؟' }, 'enhanced').q, ORIG.q, 'enhanced يرفض نصًا مبتورًا');
  eq(enforce(ORIG, { q_enhanced:'x'.repeat(5000) }, 'enhanced').q, ORIG.q, 'enhanced يرفض نصًا منتفخًا');
  eq(enforce(ORIG, { q_enhanced: 42 }, 'enhanced').q, ORIG.q, 'enhanced يرفض ما ليس نصًا');
  ok(!acceptable('abcdefghij', ''), 'المعقولية ترفض الفارغ');

  // ★ الأخطر: إعادة ترتيب الخيارات تجعل موضع الإجابة يشير لخيار خاطئ
  const shuffled = enforce(ORIG, { options_enhanced:['Naloxone','N-acetylcysteine','Atropine','Flumazenil'] }, 'enhanced');
  eq(shuffled.options[shuffled.answer], 'N-acetylcysteine', 'enhanced: الإجابة تبقى صحيحة مهما فعل النموذج بالترتيب');
  const fewer = enforce(ORIG, { options_enhanced:['a','b'] }, 'enhanced');
  eq(fewer.options.length, 4, 'enhanced يرفض تغيير عدد الخيارات — موضع الإجابة رقم');

  // وفقدان الأصل يُكشف مهما كان النمط
  ok(!verbatimOk(ORIG, Object.assign({}, en, { q_original:'ضاع الأصل' })), 'ضياع الأصل يُرصد في enhanced');
  ok(!verbatimOk(ORIG, Object.assign({}, st, { q:'عبث' })), 'تغيّر المعروض يُرصد في strict');

  // البرومبتان مختلفان فعلًا — وإلا لما حسّن النموذج شيئًا
  ok(ai.SYS_STRICT.indexOf('لا تعدل نص السؤال') !== -1, 'برومبت strict يمنع التعديل صراحة');
  ok(ai.SYS_ENHANCED.indexOf('q_enhanced') !== -1, 'برومبت enhanced يطلب حقل التحسين');
  ok(ai.SYS_ENHANCED.indexOf('اعادة ترتيب الخيارات ممنوعة') !== -1, 'برومبت enhanced يمنع إعادة الترتيب');
  ok(ai.SYS_STRICT !== ai.SYS_ENHANCED, 'البرومبتان ليسا نسخة واحدة');

  // المسار: آمن في الرابط وفريد
  ok(/^[a-z0-9ء-ي-]+$/.test(slugify('Emergency Care! 2026','abc123')), 'المسار بلا رموز تكسر الرابط');
  ok(slugify('فيزيولوجيا','x1').indexOf('فيزيولوجيا') === 0, 'المسار العربي يبقى مقروءًا');
  ok(slugify('نفس الاسم') !== slugify('نفس الاسم'), 'اسمان متطابقان يعطيان مسارين مختلفين');
  eq(slugify('   ', 'zz9999'), 'subject-zz9999', 'الاسم الفارغ لا يعطي مسارًا فارغًا');
}

/* ============ ٣٩ · عدّاد التجربة والقفل ============ */
describe('٣٩ · تجربة العشر دقائق');
{
  const sqlU = fs.readFileSync(path.join(ROOT,'db','UGC-COINS.sql'), 'utf8');
  has(sqlU, 'select 600', 'سقف التجربة ٦٠٠ ثانية معرَّف في القاعدة');
  has(sqlU, 'least(greatest(coalesce(interval_seconds, 30), 0), 60)', 'النبضة تُقصّ في الخادم — لا حقن أرقام');
  has(sqlU, 'creator is null or creator <> uid', 'التجربة للمنشئ وحده — الشرط في القاعدة');
  has(sqlU, 'security definer', 'دوال التجربة والكوينز security definer');
  has(sqlU, 'coins_once_uidx', 'فهرس فريد يمنع تكرار مكافأة نفس المشتري');
  has(sqlU, 'ref <> creator', 'رابط إحالة مزوّر مرفوض في القاعدة');
  ok(sqlU.indexOf('drop table') === -1 && sqlU.indexOf('drop column') === -1, 'الملف لا يحذف جدولًا ولا عمودًا');

  const dom = makeDom(), W = dom.window, doc = W.document, A = W.AMUSQ;
  const T = A.trial;
  eq(T.CAP, 600, 'سقف الواجهة يطابق سقف القاعدة');
  eq(T.fmt(600), '10:00', 'التنسيق: ٦٠٠ث = 10:00');
  eq(T.fmt(65), '1:05', 'التنسيق يُصفّر الثواني الآحادية');
  eq(T.fmt(-5), '0:00', 'الوقت السالب يُعرض صفرًا لا بإشارة');

  const pl = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'creator-1', email:'c@c.c' }))));
  A.api.auth.captureFromHash('#access_token=h.' + pl + '.s&refresh_token=r&expires_in=9999');

  // نُحاكي القاعدة: كل نبضة تستهلك ٣٠ ثانية من ٦٠٠
  let used = 540;   // بقيت دقيقة — نصل للقفل بسرعة
  const beats = [];
  A.api.rpc = (name, args) => {
    if (name === 'rpc_record_trial_heartbeat'){
      beats.push(args);
      used = Math.min(600, used + Math.min(args.interval_seconds, 60));
      return Promise.resolve({ ok:true, data:{ eligible:true, seconds_used:used,
        seconds_left: 600 - used, cap:600, expired: used >= 600 } });
    }
    return Promise.resolve({ ok:false, data:null });
  };

  let fired = '';
  const bar = T.start('s1', 60, reason => { fired = reason; });
  doc.body.appendChild(bar);
  has(bar.textContent, '1:00', 'الشريط يعرض الوقت المتبقي');
  ok(bar.className.indexOf('is-low') !== -1, 'أقل من دقيقتين ⇦ لون تحذير');
  eq(bar.querySelector('.trialbar__f').style.width, '10.0%', 'المؤشر يعكس النسبة المتبقية');
  eq(bar.getAttribute('aria-live'), 'polite', 'قارئ الشاشة يسمع تغيّر الوقت');
  eq(T.BEAT_MS, 30000, 'النبضة كل ٣٠ ثانية كما هو مطلوب');

  pending.push((async () => {
    await until(W, () => fired === 'expired', 8000);
    eq(fired, 'expired', 'العدّاد يقفل المادة عند بلوغ العشر دقائق');
    eq(T.state, null, 'العدّاد يتوقف بعد القفل — لا نبض بلا فائدة');

    // الزميل: القاعدة تقول eligible=false ⇦ لا تجربة
    let out = '';
    A.api.rpc = () => Promise.resolve({ ok:true, data:{ eligible:false, seconds_used:0, seconds_left:0, cap:600 } });
    const b2 = T.start('s2', 600, r => { out = r; });
    doc.body.appendChild(b2);
    await until(W, () => out === 'ineligible', 8000);
    eq(out, 'ineligible', 'من ليست مادته يُوقف عدّاده فورًا');
    T.stop();
    W.close();
  })());
}

/* ============ ٤٠ · الزميل يشتري ولا يُجرّب ============ */
describe('٤٠ · الزميل والرابط والكوينز');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.AMUSQ;
  const G = A.gate;

  // رابط الإحالة يُحفظ ليصمد عبر التنقّل والتسجيل
  eq(G.captureRef({ ref:'creator-9' }), 'creator-9', 'رابط الإحالة يُلتقط من ?ref=');
  eq(G.ref(), 'creator-9', 'ويُحفظ فيبقى بعد التنقّل والتسجيل');
  eq(G.captureRef({}), 'creator-9', 'زيارة بلا ref لا تمسح مُحيلًا محفوظًا');

  const SUB = { id:'s9', name:'فيزيولوجيا', slug:'physio-x1', price:49, free:false,
                created_by:'creator-9', q_count:40, published:true, status:'published' };
  // زائر بلا جلسة
  A.api.saveSession(null);
  eq(G.localGuess(SUB).reason, 'anon', 'الزائر يُوجَّه للدخول');

  // المنشئ نفسه ⇦ تجربة
  const mk = id => W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:id, email:'x@x.x' }))));
  A.api.auth.captureFromHash('#access_token=h.' + mk('creator-9') + '.s&refresh_token=r&expires_in=9999');
  eq(G.localGuess(SUB).reason, 'trial', 'المنشئ يدخل بالتجربة');

  // الزميل ⇦ شراء مباشر بلا تجربة (جوهر الطلب)
  A.api.auth.captureFromHash('#access_token=h.' + mk('mate-7') + '.s&refresh_token=r&expires_in=9999');
  const mate = G.localGuess(SUB);
  eq(mate.allowed, false, 'الزميل لا يدخل المحتوى');
  eq(mate.reason, 'paywall', 'الزميل يذهب للشراء لا للتجربة');

  // ومن اشترى يدخل
  G.save([{ subject_id:'s9', kind:'subject', expires_at:new Date(Date.now()+9e8).toISOString() }]);
  eq(G.localGuess(SUB).reason, 'entitled', 'من اشترى يدخل باستحقاقه');
  G.save([]);

  // زر الشراء يحمل السعر والمُحيل
  const btn = G.buyButton(SUB);
  has(btn.textContent, '49 ريال', 'زر الشراء يعرض السعر');
  eq(btn.getAttribute('data-ref'), 'creator-9', 'زر الشراء يحمل المُحيل كي تصله كوينزه');

  // رابط المشاركة بالشكل المطلوب تمامًا
  const url = A.share.shareUrl('physio-x1', 'creator-9');
  has(url, '#s/physio-x1?ref=creator-9', 'الرابط بالشكل ‎#s/slug?ref=USER_ID');
  eq(A.share.shareUrl('physio-x1', ''), url.split('?')[0], 'بلا مُحيل: رابط نظيف');

  // الموجّه يقبل الصيغتين — الرابط القصير هو ما يُشارَك فعلًا
  eq(A.router.parse('#s/physio-x1?ref=u1').path, '#/s', 'الموجّه يلتقط ‎#s/slug');
  eq(A.router.parse('#s/physio-x1?ref=u1').rest[0], 'physio-x1', 'المسار يصل للشاشة');
  eq(A.router.parse('#s/physio-x1?ref=u1').query.ref, 'u1', 'المُحيل يُفكّ من الرابط');
  eq(A.router.parse('#/s/physio-x1').rest[0], 'physio-x1', 'والصيغة الطويلة تعمل أيضًا');

  // شاشة الرابط: الزميل يرى الشراء لا المحتوى
  A.api.rest = p2 => p2.indexOf('subjects?slug=eq.physio-x1') === 0
    ? Promise.resolve({ ok:true, data:[SUB] }) : Promise.resolve({ ok:true, data:[] });
  pending.push((async () => {
    await nav(W, '#s/physio-x1?ref=creator-9');
    await until(W, () => doc.getElementById('main').textContent.indexOf('فيزيولوجيا') !== -1);
    const t = doc.getElementById('main').textContent;
    has(t, 'مادة مدفوعة', 'الزميل يرى بطاقة الشراء');
    has(t, '40 سؤالًا', 'وصفحة تعريفية بما في المادة');
    no(t, 'تجربتك', 'ولا يُعرض عليه عدّاد تجربة إطلاقًا');
    ok(!doc.querySelector('.trialbar'), 'لا شريط تجربة للزميل');

    // المنشئ على نفس الرابط يرى أداة المشاركة
    A.api.auth.captureFromHash('#access_token=h.' + mk('creator-9') + '.s&refresh_token=r&expires_in=9999');
    A.router.render('#s/physio-x1');
    await until(W, () => doc.getElementById('main').textContent.indexOf('هذه مادتك') !== -1);
    has(doc.getElementById('main').textContent, 'كوينز', 'المنشئ يُذكَّر بمكافأة المشاركة');
    ok(!!doc.querySelector('.sharebox input'), 'حقل الرابط جاهز للنسخ');
    ok(doc.querySelector('.sharebox input').value.indexOf('#s/physio-x1?ref=creator-9') !== -1,
       'الرابط المعروض يحمل معرّف المنشئ');
    W.close();
  })());
}

/* ============ ٤١ · رفع الطالب ومحفظته ============ */
describe('٤١ · رفع الطالب والمحفظة');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.AMUSQ;
  const mk = id => W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:id, email:'s@s.s' }))));
  A.api.auth.captureFromHash('#access_token=h.' + mk('stud-1') + '.s&refresh_token=r&expires_in=9999');

  eq(A.admin.newWizard().mode, 'strict', 'النمط الافتراضي strict — القداسة هي الأصل');

  pending.push((async () => {
    A.views.ViewUpload._reset();
    await nav(W, '#/admin/upload');
    const main = doc.getElementById('main');
    // طالب عادي (ليس مشرفًا) يصل لشاشة الرفع — هذه هي الميزة
    has(main.textContent, 'أسقط ملف الأسئلة', 'الرفع مفتوح لكل مسجَّل لا للمشرف وحده');
    has(main.textContent, 'اسم المادة', 'يختار اسم مادته');
    eq(doc.querySelectorAll('[data-mode]').length, 2, 'نمطان معروضان للاختيار');
    eq(doc.querySelector('[data-mode="strict"]').getAttribute('aria-checked'), 'true', 'strict محدَّد ابتداءً');
    has(main.textContent, 'لا يُغيَّر حرف', 'شرح strict صريح للطالب');
    has(main.textContent, 'النص الأصلي يبقى محفوظًا', 'وشرح enhanced يطمئنه أن الأصل باقٍ');

    doc.querySelector('[data-mode="enhanced"]').dispatchEvent(new W.Event('click', { bubbles:true }));
    eq(A.views.ViewUpload._get().mode, 'enhanced', 'اختيار النمط يُسجَّل في المعالج');
    eq(doc.querySelector('[data-mode="strict"]').getAttribute('aria-checked'), 'false', 'الاختيار متبادل لا متراكم');

    // المحفظة
    A.api.rpc = name => name === 'my_wallet' ? Promise.resolve({ ok:true, data:{
      balance:150, sales:3, earned:150,
      subjects:[{ id:'a', name:'فيزيولوجيا', slug:'physio-x1', status:'published', price:49, q_count:40, sales:3 },
                { id:'b', name:'تشريح', slug:'anat-y2', status:'suspended', price:0, q_count:20, sales:0 }],
      ledger:[{ amount:50, reason:'بيع مادة عبر رابطك', created_at:new Date(Date.now()-3600000).toISOString() }]
    } }) : Promise.resolve({ ok:false });

    await nav(W, '#/account');
    await until(W, () => doc.querySelector('.wallet'));
    const t = doc.getElementById('main').textContent;
    has(t, '150', 'الرصيد معروض');
    has(t, 'بانتظار التسعير', 'المادة بلا سعر تُنبَّه لا تُترك صامتة');
    has(t, 'موقوفة', 'المادة الموقوفة موسومة للطالب');
    has(t, 'بيع مادة عبر رابطك', 'سجل الكوينز يشرح مصدر كل حركة');
    eq(doc.querySelectorAll('.sharebox').length, 2, 'رابط نسخ لكل مادة رفعها');
    W.close();
  })());
}

/* ============ ٤٢ · تبويب مواد الطلاب عند المشرف ============ */
describe('٤٢ · إدارة مواد الطلاب');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.AMUSQ;
  const pl = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'adm', email:'a@a.a' }))));
  A.api.auth.captureFromHash('#access_token=h.' + pl + '.s&refresh_token=r&expires_in=9999');
  const sent = [];
  A.api.rest = (p2, opt) => { if (opt) sent.push({ path:p2, method:opt.method, body: JSON.parse(opt.body||'{}') });
    return Promise.resolve({ ok:true, data:[] }); };
  A.api.rpc = name => name === 'admin_ugc' ? Promise.resolve({ ok:true, data:[
    { id:'u1', name:'فيزيولوجيا', slug:'physio-x1', status:'published', price:0, published:true,
      q_count:40, sanctity_mode:'enhanced', creator_name:'سعد', sales:3, coins:150, attempts:12,
      created_at:new Date().toISOString(), created_by:'stud-1' },
    { id:'u2', name:'تشريح', slug:'anat-y2', status:'suspended', price:35, published:true,
      q_count:20, sanctity_mode:'strict', creator_name:'ريم', sales:0, coins:0, attempts:0,
      created_at:new Date().toISOString(), created_by:'stud-2' }
  ] }) : Promise.resolve({ ok:false });

  pending.push((async () => {
    await nav(W, '#/admin/ugc');
    await until(W, () => doc.querySelector('.modetag'));
    const main = doc.getElementById('main');
    has(main.textContent, 'رفعها سعد', 'اسم رافع المادة ظاهر للمشرف');
    has(main.textContent, 'صياغة محسَّنة', 'نمط المعالجة موسوم — يعرف المشرف ما مُسّ');
    has(main.textContent, 'نص حرفي', 'والنمط الصارم موسوم أيضًا');
    has(main.textContent, '150 كوين', 'مجموع الكوينز الممنوحة لكل مادة');
    has(main.textContent, '3 بيعة', 'عدد مرات الشراء');
    has(main.textContent, 'بلا سعر', 'المشرف يُنبَّه لما لم يُسعَّر بعد');

    // التسعير
    const price = doc.querySelector('input[type="number"]');
    price.value = '9999';
    Array.prototype.filter.call(doc.querySelectorAll('button'), b => b.textContent === 'احفظ السعر')[0]
      .dispatchEvent(new W.Event('click', { bubbles:true }));
    await until(W, () => sent.some(x => x.method === 'PATCH' && 'price' in x.body));
    eq(sent.filter(x => 'price' in x.body)[0].body.price, 5000, 'سعر ٩٩٩٩ يُقصّ إلى السقف قبل الإرسال');

    // الإيقاف
    Array.prototype.filter.call(doc.querySelectorAll('button'), b => b.textContent === 'أوقف المادة')[0]
      .dispatchEvent(new W.Event('click', { bubbles:true }));
    await until(W, () => sent.some(x => x.body && x.body.status === 'suspended'));
    ok(sent.some(x => x.body.status === 'suspended'), 'الإيقاف يرسل status=suspended');
    ok(!!Array.prototype.filter.call(doc.querySelectorAll('button'), b => b.textContent === 'أعِد تفعيلها')[0],
       'الموقوفة يمكن إعادة تفعيلها');

    // الحذف بتأكيدين
    const del = Array.prototype.filter.call(doc.querySelectorAll('button'), b => b.textContent === 'احذف')[0];
    del.dispatchEvent(new W.Event('click', { bubbles:true }));
    ok(sent.every(x => x.method !== 'DELETE'), 'الضغطة الأولى لا تحذف مادة طالب');
    del.dispatchEvent(new W.Event('click', { bubbles:true }));
    await until(W, () => sent.some(x => x.method === 'DELETE'));
    ok(sent.some(x => x.method === 'DELETE'), 'الضغطة الثانية تحذف');
    W.close();
  })());
}

/* ============ ٤٣ · منح الكوينز يتم في الخادم لا في المتصفح ============ */
describe('٤٣ · أمان الكوينز');
{
  // القاعدة الحاسمة: لا يمنح المتصفح كوينز لنفسه — الدالة لـ service_role وحده
  const sqlU = fs.readFileSync(path.join(ROOT,'db','UGC-COINS.sql'), 'utf8');
  has(sqlU, 'grant execute on function amusq.award_referral_coins(uuid, uuid, uuid) to service_role',
      'منح الكوينز محصور في مفتاح الخدمة — لا ينادى من المتصفح');
  has(sqlU, 'revoke all on function amusq.award_referral_coins(uuid, uuid, uuid) from public',
      'وصلاحية العموم منزوعة صراحة');
  has(sqlU, 'buyer = creator', 'شراء المنشئ لمادته لا يمنحه كوينز');
  has(sqlU, 'coins_balance >= 0', 'الرصيد لا يصير سالبًا');

  // ولا مفتاح خدمة في الملف المبني
  no(html, 'SUPABASE_SERVICE_KEY', 'لا اسم لمفتاح الخدمة في ملف المتصفح');
  no(html, 'award_referral_coins', 'المتصفح لا يعرف دالة منح الكوينز أصلًا');

  const verify = fs.readFileSync(path.join(ROOT,'api','verify.js'), 'utf8');
  ok(verify.indexOf('award_referral_coins') > verify.indexOf('await verifiers[source]'),
     'الكوينز تُمنح بعد تأكيد الدفعة لا قبلها');
  has(verify, 'coins = { ok:false', 'فشل المكافأة لا يُبطل شراءً تمّ');

  const supa = fs.readFileSync(path.join(ROOT,'api','_lib','supa.js'), 'utf8');
  has(supa, '/auth/v1/user', 'هوية الرمز تُسأل من Supabase لا تُفكّ محليًا');
  const trial = fs.readFileSync(path.join(ROOT,'api','trial.js'), 'utf8');
  has(trial, ', token)', 'مسار التجربة يمرّر رمز الطالب لا مفتاح الخدمة');
  no(trial, 'SERVICE', 'ولا يلمس مفتاح الخدمة إطلاقًا');
}
