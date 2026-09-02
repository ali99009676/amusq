/* ============ ٩٩ · القمع ============ */
describe('٩٩ · قمع الطلاب');
{
  const A = makeDom().window.QBANK;
  const f = A.views.funnelPanel({ signed_up:100, has_campus:60, enrolled:40, examined:20, uploaded:5, paid:2 });

  eq(f.querySelectorAll('.fun__row').length, 6, 'ست خطوات');
  const pcts = Array.prototype.map.call(f.querySelectorAll('.fun__p'), n => n.textContent).filter(Boolean);

  /* ★ النسبة من الخطوة السابقة لا من القمة.
     «٢٪ من المسجّلين دفعوا» رقم صحيح لا يقول شيئًا؛ و«٤٠٪ ممن رفعوا دفعوا»
     يقول أين تُكسب المعركة. النسبة من القمة تُخفي موضع التسرّب. */
  eq(pcts[0], '٦٠٪', '★ النسبة من الخطوة السابقة: ٦٠ من ١٠٠');
  eq(pcts[1], '٦٧٪', 'و٤٠ من ٦٠');
  eq(pcts[4], '٤٠٪', 'و٢ من ٥ — لا ٢٪ من ١٠٠');

  eq(f.querySelectorAll('.fun__p.is-low').length, 1, '★ وخطوة واحدة موسومة بالتسرّب (٢٥٪ دون الثلث)');

  const zero = A.views.funnelPanel({ signed_up:0, has_campus:0, enrolled:0, examined:0, uploaded:0, paid:0 });
  eq(zero.querySelectorAll('.fun__row').length, 6, 'ومنصة فارغة لا تنهار');
  eq(zero.querySelectorAll('.fun__p.is-low').length, 0, 'ولا تُوسم كلها بالتسرّب');
  eq(A.admin.pro.step(5, 0), null, 'والقسمة على صفر تُرجع لا شيء لا NaN');
}

/* ============ ١٠٠ · تبويبات اللوحة ============ */
describe('١٠٠ · بنية اللوحة');
{
  const A = makeDom().window.QBANK;
  const ids = A.views.ADMIN_TABS.map(t => t.id);

  eq(ids.join(','), 'dash,students,ugc,content,reports,quality,money,campus,audit,settings',
     'عشرة تبويبات بترتيب ما يستحق أن يُرى');
  // ★ الإعدادات آخرًا دائمًا: آخر ما يُفتح، وتصدُّرها يزاحم ما يحتاج تدخّلًا
  eq(ids[ids.length - 1], 'settings', '★ والإعدادات آخرًا');
  eq(ids[0], 'dash', 'واللوحة أولًا');
  ok(ids.indexOf('reports') < ids.indexOf('settings'), 'وما يحتاج تدخّلًا قبل ما يُضبط مرة');

  eq(A.views.ADMIN_TABS.filter(t => t.id === 'dash')[0].fill, A.views.proDashTab,
     'واللوحة القديمة استُبدلت بالكاملة');
  eq(A.views.ADMIN_TABS.filter(t => t.id === 'students')[0].fill, A.views.proStudentsTab,
     'وتبويب الطلاب صار فيه تحكم');
  eq(A.views.ADMIN_TABS.filter((t, i, arr) => arr.findIndex(x => x.id === t.id) !== i).length, 0,
     'ولا تبويب مكرَّر');
}

/* ============ ١٠١ · التحكم في الطالب ============ */
describe('١٠١ · تحكم الطلاب');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  const sent = [];
  let roleReply = { ok:true };
  A.api.rpc = (n, a) => {
    sent.push({ n, a });
    if (n === 'admin_students_pro') return Promise.resolve({ ok:true, data:[
      { id:'u1', name:'سارة', avatar:'🧠', is_admin:false, coins:250,
        university:'جامعة نجران', attempts:4, uploaded:2, paid:1500 }]});
    if (n === 'admin_set_role') return Promise.resolve({ ok:true, data: roleReply });
    return Promise.resolve({ ok:true, data:{ ok:true, balance:350 } });
  };

  const box = doc.createElement('div'); doc.body.appendChild(box);
  A.views.proStudentsTab(box);

  pending.push((async () => {
    await until(W, () => box.querySelector('.stu'));
    const btn = t => Array.prototype.filter.call(box.querySelectorAll('button'), b => b.textContent === t)[0];

    has(box.textContent, '٢٥٠ كوين', 'رصيد الطالب ظاهر');
    has(box.textContent, '١٥ ريال', 'وما دفعه — لا عدد عملياته وحده');
    has(box.textContent, 'جامعة نجران', 'وجامعته');

    btn('امنح').dispatchEvent(new W.Event('click', { bubbles:true }));
    await until(W, () => box.textContent.indexOf('الرصيد الآن') !== -1);
    const g = sent.filter(x => x.n === 'admin_grant_coins')[0];
    eq(g.a.p_amount, 100, 'المنح يُرسل العدد موجبًا');
    /* ★ الرصيد الجديد يبقى معروضًا: كانت القائمة تُعاد بناؤها فتُمحى الرسالة
       قبل أن يقرأها المشرف — فيشكّ هل وصل المنح ويمنح ثانيةً، وهذا في المال يُكلّف. */
    has(box.textContent, 'الرصيد الآن ٣٥٠', '★ والرصيد الجديد يبقى معروضًا');
    has(box.textContent, '٣٥٠ كوين', 'والشارة تُحدَّث في مكانها');

    btn('اسحب').dispatchEvent(new W.Event('click', { bubbles:true }));
    await until(W, () => sent.filter(x => x.n === 'admin_grant_coins').length > 1);
    eq(sent.filter(x => x.n === 'admin_grant_coins')[1].a.p_amount, -100, 'والسحب يُرسله سالبًا');

    // ★ حارسان يستحقان اسمًا لا «تعذّر»
    W.confirm = () => true;
    roleReply = { ok:false, reason:'last_admin' };
    btn('ارفعه مشرفًا').dispatchEvent(new W.Event('click', { bubbles:true }));
    await until(W, () => box.textContent.indexOf('آخر مشرف') !== -1);
    has(box.textContent, 'ارفع غيره أولًا', '★ ورفض «آخر مشرف» يُشرح بالاسم');

    // ولا يُنفَّذ فعلٌ خطير بلا تأكيد
    W.confirm = () => false;
    const before = sent.filter(x => x.n === 'admin_set_role').length;
    btn('ارفعه مشرفًا').dispatchEvent(new W.Event('click', { bubbles:true }));
    eq(sent.filter(x => x.n === 'admin_set_role').length, before,
       '★ ورفض التأكيد يمنع الترقية — لا صلاحية تُمنح بضغطة واحدة');
    W.close();
  })());
}

/* ============ ١٠٢ · ردّ الدفعة يقول حدوده ============ */
describe('١٠٢ · ردّ الدفعة');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  let asked = '';
  A.api.rpc = (n) => {
    if (n === 'admin_payments') return Promise.resolve({ ok:true, data:[
      { id:'P1', kind:'coins', coins:300, amount_halalas:1500, status:'paid',
        created_at:new Date().toISOString(), student:'سارة' }]});
    if (n === 'admin_coins') return Promise.resolve({ ok:true, data:{ ok:true, by_kind:[
      { kind:'signup', n:12, coins:600 }, { kind:'spend', n:30, coins:-900 }] } });
    return Promise.resolve({ ok:true, data:{ ok:true } });
  };
  W.confirm = t => { asked = t; return false; };

  const box = doc.createElement('div'); doc.body.appendChild(box);
  A.views.proMoneyTab(box);

  pending.push((async () => {
    await until(W, () => box.querySelector('.payrow'));
    has(box.textContent, 'منحة تسجيل', 'دفتر الكوينز يفصل المنحة عن الشراء');
    has(box.textContent, 'إنفاق على الإثراء', 'والإنفاق بابٌ مستقل');

    const rb = Array.prototype.filter.call(box.querySelectorAll('button'), b => b.textContent === 'ردّ')[0];
    ok(!!rb, 'وللدفعة المدفوعة زر ردّ');
    rb.dispatchEvent(new W.Event('click', { bubbles:true }));
    /* ★ الوهم هنا يعني طالبًا ينتظر مالًا لن يصله: نحن لا نملك سحب مال من
       بطاقة، فنقولها في نص التأكيد بدل أن ندع المشرف يفترض. */
    has(asked, 'لوحة Tap', '★ والتأكيد يقول صراحةً إن إعادة المال تتم في لوحة البوابة');
    has(asked, 'هذه لا تفعلها', 'وأن هذا الزر لا يفعلها');
    W.close();
  })());
}

/* ============ ١٠٣ · ملف ADMIN-PRO.sql ============ */
describe('١٠٣ · قاعدة اللوحة');
{
  const sql = fs.readFileSync(path.join(ROOT, 'db', 'ADMIN-PRO.sql'), 'utf8');

  has(sql, 'create table if not exists qbank.admin_actions', 'سجل التدقيق موجود');
  // ★ سجلٌّ يستطيع صاحبه محوَه ليس سجلًّا
  no(sql, 'create policy audit_insert', '★ ولا سياسة إدراج عليه — يُكتب بالدالة وحدها');
  no(sql, 'create policy audit_delete', 'ولا حذف');
  no(sql, 'create policy audit_update', 'ولا تعديل');

  // كل فعل خطير يُسجَّل
  ['grant_coins','set_role','refund','merge_university','grant_entitlement'].forEach(a =>
    has(sql, "log_admin('" + a + "'", 'الفعل «' + a + '» يُسجَّل'));

  // ★ حارسا الصلاحية
  has(sql, "reason','self_demote", '★ لا يُنزل المشرف نفسه — لن يبقى من يرفعه');
  has(sql, "reason','last_admin", '★ ولا يُترك آخر مشرف بلا خلف');

  // ★ قائمة بيضاء لتعديل المادة
  has(sql, "coalesce((p_patch->>'published')::boolean, published)",
      'تعديل المادة بقائمة بيضاء صريحة');
  no(sql, 'q_count = coalesce', '★ ولا يُكتب q_count — عمود يُحسب، وكتابته تجعل كل إحصاء يكذب');
  no(sql, 'rating_avg = coalesce', 'ولا متوسط التقييم');
  no(sql, 'created_by = coalesce', 'ولا هوية الرافع');

  // القمع والالتزام
  has(sql, "'coins_outstanding'", '★ والكوينز غير المنفقة معروضة — التزام قادم يغيب عن أكثر اللوحات');
  has(sql, "'funnel', jsonb_build_object", 'والقمع محسوب في القاعدة لا في المتصفح');

  // الأسئلة الصعبة من المصدر الحقيقي
  has(sql, "jsonb_each(coalesce(per.sdata->'wrong'", 'وتقرير الأسئلة الصعبة يقرأ تقدّم الطلاب فعلًا');
  has(sql, 'count(distinct per.user_id)',
      '★ ويعدّ الطلاب لا المرات — تكرار طالب واحد لا يجعل السؤال أصعب على غيره');
  has(sql, 'sn.n >= 5', 'وبحدّ أدنى خمسة طلاب: نسبة من طالبين ضوضاء');

  const defs = sql.split('create or replace function').slice(1);
  eq(defs.filter(d => d.indexOf('set search_path = qbank, public') === -1).length, 0,
     'وكل دالة تثبّت search_path');
  eq(defs.filter(d => d.indexOf('qbank.is_admin()') === -1 && d.indexOf('log_admin') === -1).length, 0,
     '★ وكل دالة تتحقق من الصلاحية — عدا مسجّل التدقيق نفسه');
  no(sql, 'drop table', 'ولا حذف جدول');
}

/* ============ ١٠٤ · لا تُنشر مادة فارغة ============ */
describe('١٠٤ · حارس المادة الفارغة');
{
  /*
    ★ هذا الفحص وُلد من عطل حقيقي في الإنتاج.
    رُفع ملف لم يتعرّف المحلّل على سؤال واحد فيه، فتقدّم المعالج صامتًا
    إلى «راجع» — شاشة فارغة تحتها زر «انشر» — فأُنشئت مادة منشورة بصفر
    أسئلة ظهرت في «استكشف» ولا شيء فيها.

    الصمت هنا أسوأ من الفشل: الفشل يُصلَح، والصمت يُنشر.
    ولذلك أربعة أقفال لا قفل واحد: كل باب يؤدي إلى النشر يحتاج قفله،
    والخامس في القاعدة لأن الواجهة تُخدع والقاعدة لا تُخدع.
  */
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  const pl = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'u1', email:'a@a.a' }))));
  A.api.auth.captureFromHash('#access_token=h.' + pl + '.s&refresh_token=r&expires_in=9999');
  A.api.rpc = () => new Promise(() => {});

  // ★ القفل الأول: الاستيراد
  A.admin.server = async () => ({ ok:true, data:{ questions:[], total:0, subject_name:'س', slug:'s' } });
  pending.push((async () => {
    const w = await A.admin.wizardIngest(A.admin.newWizard(), 'f.txt', 'x');
    eq(w.step, 1, '★ ملفٌ بصفر أسئلة لا يتقدّم من الخطوة الأولى');
    has(w.error, 'لم نتعرّف على سؤال واحد', 'ويقول السبب لا «تعذّر» وحدها');
    has(w.error, 'قالب بنك الأسئلة', 'ويدلّ على القالب — الطالب يحتاج مخرجًا لا تشخيصًا');
    eq(w.total, 0, 'ولا يدّعي عددًا');

    // ★ القفل الثاني: المسار المجاني
    const w2 = A.admin.newWizard(); w2.raw = []; w2.total = 0;
    const out = A.admin.plainEnrich(w2);
    ok(out.error, '★ والمسار المجاني لا يتقدّم بلا سؤال — «مجاني» لا يعني «فارغ»');
    ok(out.step !== 3, 'ولا يقفز إلى المراجعة');

    // ★ القفل الثالث: شاشة المراجعة
    const w3 = A.admin.newWizard(); w3.step = 3; w3.enriched = []; w3.raw = [];
    A.views.ViewUpload._set(w3);
    A.router.render('#/upload');
    const t = doc.getElementById('main').textContent;
    has(t, 'لا أسئلة في هذه المسوّدة', '★ والمراجعة الفارغة تُعلن نفسها');
    no(t, 'تابع للنشر', '★ ولا زرّ نشر تحتها — كان هذا هو الباب المفتوح');
    has(t, 'ارجع وارفع ملفًا آخر', 'بل مخرجٌ يعيده للرفع');

    // ★ القفل الرابع: خطوة النشر
    const w4 = A.admin.newWizard(); w4.step = 4; w4.enriched = [];
    A.views.ViewUpload._set(w4);
    A.router.render('#/upload');
    has(doc.getElementById('main').textContent, 'لا شيء يُنشر', '★ وخطوة النشر مقفلة كذلك');

    A.views.ViewUpload._reset();
    W.close();
  })());
}

/* ============ ١٠٥ · قفل القاعدة ============ */
describe('١٠٥ · approve_draft يحرس نفسه');
{
  const sql = fs.readFileSync(path.join(ROOT, 'db', 'FIX-EMPTY-SUBJECT.sql'), 'utf8');

  has(sql, 'jsonb_array_length(coalesce(d.payload', 'القاعدة تعدّ الأسئلة قبل الإنشاء');
  has(sql, 'لا يمكن نشر بنك فارغ', '★ وترفض بنكًا فارغًا برسالة مفهومة');
  has(sql, 'update qbank.subjects set q_count = i where id = sid',
      '★ والعدّاد من الصفوف المُدرَجة فعلًا — الرقم الوحيد الذي لا يكذب');

  // ★ التنظيف يُخفي ولا يحذف
  /* ★ الحالة من القيم التي يقبلها قيد القاعدة لا من اختراعنا.
     كتبتُ 'hidden' فرفضها subjects_status_ck — وحالةٌ لا يعرفها النظام
     لا يجوز أن تدخله، والقيد كان محقًّا. */
  has(sql, "set published = false, status = 'suspended'",
      '★ وما نُشر فارغًا يُوقف لا يُحذف — قد ينتظره صاحبه');
  no(sql, "status = 'hidden'", 'ولا حالة خارج ما يقبله القيد');
  no(sql, 'delete from qbank.subjects', 'ولا حذف لمادة أحد');
  has(sql, 'where s.q_count <> (select count(*)', 'وكل عدّاد لا يطابق الواقع يُصحَّح');
  has(sql, 'qbank.is_admin()', 'والدالة تبقى محروسة');
  has(sql, 'set search_path = qbank, public', 'ومسار البحث مثبّت');
}
