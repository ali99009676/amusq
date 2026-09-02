/* ============ ٧٧ · عرض التقييم ============ */
describe('٧٧ · نجوم التقييم');
{
  const A = makeDom().window.QBANK;
  const T = A.trust;

  // ★ العدد يُعرض مع المتوسط دائمًا: ٥٫٠ من تقييم واحد ليس إجماعًا
  has(T.starsText(5, 1), 'تقييم', 'المتوسط يُعرض ومعه عدد المقيّمين');
  has(T.starsText(5, 1), '٥٫٠', 'والمتوسط برقم عربي بمنزلة واحدة');
  has(T.starsText(4.25, 12), '٤٫٣', 'ويُقرَّب لمنزلة واحدة');
  has(T.starsText(4.25, 12), 'تقييمات', 'والجمع يُصاغ صحيحًا');
  eq(T.starsText(0, 0), 'لم يُقيَّم بعد', 'وبلا تقييمات لا يُعرض صفر مضلِّل');

  eq(T.reasonName('wrong_answer'), 'الإجابة المعلَّمة خاطئة', 'أسباب البلاغ بالعربية');
  eq(T.reasonName('شيء'), 'شيء', 'وسبب غير معروف يُعرض كما هو بلا انهيار');
  eq(T.reasons.length, 5, 'خمسة أسباب محدَّدة');
  ok(T.reasons.some(r => r[0] === 'wrong_answer'),
     '★ ومنها «الإجابة خاطئة» — وهو البلاغ الوحيد الذي يمنع تعلّم خطأ');
}

/* ============ ٧٨ · شارات الثقة ============ */
describe('٧٨ · شارات الجودة');
{
  const A = makeDom().window.QBANK;
  const B = s => A.trust.badges(s).map(n => n.textContent).join(' | ');

  has(B({ verified:true, rating_n:0 }), 'موثّقة', 'الموثّقة تُوسم');
  eq(B({ verified:false, rating_n:0 }), '', 'وغير الموثّقة بلا تقييم: لا شارة — لا وسم سلبي');
  has(B({ verified:false, rating_avg:4.5, rating_n:8 }), '٤٫٥', 'والمقيَّمة تعرض نجومها');
  has(B({ verified:true, rating_avg:5, rating_n:3 }), 'موثّقة', 'والاثنتان معًا ممكنتان');
  eq(A.trust.badges({ verified:true, rating_n:2, rating_avg:4 }).length, 2, 'شارتان حين تجتمعان');
}

/* ============ ٧٩ · زر الإبلاغ عند السؤال ============ */
describe('٧٩ · الإبلاغ');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  const sent = [];
  A.api.rpc = (name, args) => {
    if (name === 'report_issue'){ sent.push(args); return Promise.resolve({ ok:true, data:{ ok:true } }); }
    return Promise.resolve({ ok:true, data:{} });
  };

  const host = doc.createElement('div');
  doc.body.appendChild(host);
  const btn = A.trust.reportButton('S1', 'Q7');
  host.appendChild(btn);

  eq(btn.getAttribute('aria-label'), 'أبلغ عن مشكلة', 'الزر موصوف لقارئ الشاشة');
  btn.dispatchEvent(new W.Event('click', { bubbles:true }));

  const form = host.querySelector('.report');
  ok(!!form, 'الضغط يفتح نموذج البلاغ عند السؤال نفسه');
  eq(form.querySelectorAll('option').length, 5, 'بخمسة أسباب');

  const send = Array.prototype.filter.call(form.querySelectorAll('button'),
    b => b.textContent.indexOf('أرسل') !== -1)[0];
  send.dispatchEvent(new W.Event('click', { bubbles:true }));

  pending.push((async () => {
    await until(W, () => sent.length > 0);
    // ★ البلاغ يحمل معرّف السؤال لا المادة وحدها: «فيها خطأ» بلاغ لا يُتصرَّف فيه
    eq(sent[0].p_subject, 'S1', 'البلاغ يحمل معرّف المادة');
    eq(sent[0].p_question, 'Q7', '★ ومعرّف السؤال — بدونه لا يستطيع المشرف التصرّف');
    ok(sent[0].p_reason, 'وسببًا');
    W.close();
  })());
}

/* ============ ٨٠ · التقييم لمن جرّب المادة ============ */
describe('٨٠ · حارس التقييم');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  A.api.rpc = (name) => name === 'rate_subject'
    ? Promise.resolve({ ok:true, data:{ ok:false, reason:'not_enrolled' } })
    : Promise.resolve({ ok:true, data:{} });

  const host = doc.createElement('div'); doc.body.appendChild(host);
  host.appendChild(A.trust.ratingWidget({ id:'S1', name:'مادة' }));

  eq(host.querySelectorAll('.rate__star').length, 5, 'خمس نجوم');
  const send = Array.prototype.filter.call(host.querySelectorAll('button'),
    b => b.textContent.indexOf('أرسل تقييمي') !== -1)[0];

  // بلا اختيار نجوم: رسالة لا إرسال فارغ
  send.dispatchEvent(new W.Event('click', { bubbles:true }));
  has(host.querySelector('[role="status"]').textContent, 'اختر عدد النجوم', 'لا يُرسل تقييم بلا نجوم');

  host.querySelectorAll('.rate__star')[3].dispatchEvent(new W.Event('click', { bubbles:true }));
  eq(host.querySelectorAll('.rate__star.is-on').length, 4, 'اختيار ٤ يُضيء أربع نجوم');
  send.dispatchEvent(new W.Event('click', { bubbles:true }));

  pending.push((async () => {
    await until(W, () => host.querySelector('[role="status"]').textContent.indexOf('راجع') !== -1);
    // ★ سبب الرفض بالاسم: «تعذّر» وحدها تجعله يعيد المحاولة بلا فائدة
    has(host.querySelector('[role="status"]').textContent, 'التقييم لمن جرّبها',
        '★ ورفض «لم يفتحها» يُشرح بالاسم لا بـ«تعذّر»');
    W.close();
  })());
}

/* ============ ٨١ · طابور بلاغات المشرف ============ */
describe('٨١ · طابور البلاغات');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  const resolved = [];
  A.api.rpc = (name, args) => {
    if (name === 'admin_reports') return Promise.resolve({ ok:true, data:[{
      id:'R1', reason:'wrong_answer', note:'الإجابة الصحيحة هي ج', status:'open',
      created_at: new Date().toISOString(), subject_id:'S1', subject:'الفسيولوجيا',
      question_id:'Q1', q:'What is the normal heart rate?',
      options:['40–60','60–100','100–140','140–180'], answer:0
    }]});
    if (name === 'resolve_report'){ resolved.push(args); return Promise.resolve({ ok:true, data:{ ok:true } }); }
    return Promise.resolve({ ok:true, data:[] });
  };
  A.store.set('is_admin_check', { uid:'x', ok:true });

  const host = doc.createElement('div'); doc.body.appendChild(host);
  host.appendChild(A.views.reportsBody());

  pending.push((async () => {
    await until(W, () => host.querySelector('.rep'));
    const t = host.textContent;

    // ★ نصّ السؤال داخل البلاغ: بدونه يفتح المشرف المادة مع كل بلاغ فيتراكم الطابور
    has(t, 'normal heart rate', '★ نصّ السؤال يصل مع البلاغ — لا حاجة لفتح المادة');
    has(t, 'المعلَّمة', 'والإجابة المعلَّمة موسومة');
    has(t, 'الإجابة المعلَّمة خاطئة', 'وسبب البلاغ بالعربية');
    has(t, 'الإجابة الصحيحة هي ج', 'وملاحظة الطالب معروضة');
    has(t, 'الفسيولوجيا', 'واسم المادة');

    const ok1 = Array.prototype.filter.call(host.querySelectorAll('button'),
      b => b.textContent.indexOf('عولج') !== -1)[0];
    ok1.dispatchEvent(new W.Event('click', { bubbles:true }));
    await until(W, () => resolved.length > 0);
    eq(resolved[0].p_report, 'R1', 'المعالجة تُرسل معرّف البلاغ');
    eq(resolved[0].p_status, 'resolved', 'وحالته الجديدة');
    W.close();
  })());
}

/* ============ ٨٢ · ملف TRUST.sql ============ */
describe('٨٢ · قاعدة الثقة');
{
  const sql = fs.readFileSync(path.join(ROOT, 'db', 'TRUST.sql'), 'utf8');

  has(sql, 'check (stars between 1 and 5)', 'النجوم محصورة بين ١ و٥ في القاعدة لا في الواجهة فقط');
  has(sql, 'primary key (subject_id, user_id)', '★ تقييم واحد لكل طالب لكل مادة — لا حشد أصوات');
  has(sql, "reason = any(ok_reason)", 'وسبب البلاغ من قائمة مغلقة');

  // ★ أرخص هجوم على منصة محتواها من المستخدمين: إغراق منافس بنجمة واحدة
  has(sql, "reason','not_enrolled", '★ لا يُقيّم إلا من فتح المادة — يمنع إغراق منافس بتقييمات زائفة');
  has(sql, 'qbank.enrollments', 'والتحقق من الاشتراك');
  has(sql, 'qbank.subject_trials', 'أو من التجربة');

  has(sql, 'reports_once', 'وبلاغ واحد مفتوح لكل طالب لكل سؤال');
  has(sql, "where status = 'open'", 'والفهرس الفريد على المفتوحة وحدها — يُعاد الإبلاغ بعد البتّ');

  // التوثيق قرار إنسان: لو مُنح تلقائيًا بعدد تقييمات لصار وسمًا يُشترى
  has(sql, 'qbank.is_admin()', 'والتوثيق للمشرف وحده');
  no(sql, 'verified = true where rating_n', '★ ولا توثيق تلقائي بعدد التقييمات — وسمٌ يُشترى لا يعني شيئًا');

  // لا سياسة تعديل للطالب على البلاغ
  no(sql, 'create policy reports_update on qbank.reports for update',
     '★ ولا يُغلق الطالب بلاغه بنفسه — يُغلقه المشرف عبر الدالة');

  has(sql, 'create or replace function qbank.find_similar', 'وكشف المكرر موجود');
  has(sql, 'is not distinct from s.university_id',
      '★ والمطابقة داخل الجامعة وحدها — «فيزياء ١» في نجران ليست تكرارًا لمثيلتها في القاهرة');

  const defs = sql.split('create or replace function').slice(1);
  eq(defs.filter(d => d.indexOf('set search_path = qbank, public') === -1).length, 0,
     'وكل دالة تثبّت search_path');
  no(sql, 'drop table', 'ولا حذف جدول');
}

/* ============ ٨٩ · التوثيق ومدخل الطابور ============ */
describe('٨٩ · وسم موثّق');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;

  /* ★ شاشة بلا مدخل غير موجودة عمليًا: بنينا الطابور وكاد يبقى بلا رابط،
     وطابور بلاغات لا يفتحه أحد يمنح الطالب ثقة كاذبة بأن أحدًا يتابع. */
  const ids = A.views.ADMIN_TABS.map(t => t.id);
  ok(ids.indexOf('reports') !== -1, '★ «البلاغات» تبويب في لوحة المشرف — للطابور مدخل');
  ok(ids.indexOf('reports') < ids.indexOf('settings'),
     'وقبل الإعدادات: الإعدادات آخر ما يُفتح والبلاغات أول ما يُرى');

  const sent = [];
  A.api.rpc = (name, args) => {
    if (name === 'set_verified'){ sent.push(args); return Promise.resolve({ ok:true, data:{ ok:true, verified:args.p_on } }); }
    return Promise.resolve({ ok:true, data:[] });
  };
  A.store.set('is_admin_check', { uid:'x', ok:true });

  const host = doc.createElement('div'); doc.body.appendChild(host);
  const sub = { id:'S1', name:'مادة', q_count:10, topics:[], color:'subject-1', icon:'▤',
                verified:false, rating_n:4, rating_avg:4.5, reports_open:2 };
  host.appendChild(A.views.subjIdentity(sub, () => {}));

  const btn = Array.prototype.filter.call(host.querySelectorAll('button'),
    b => b.textContent.indexOf('وثّق') !== -1)[0];
  ok(!!btn, 'زر التوثيق موجود في محرّر المادة');
  has(host.textContent, '٤٫٥', 'وتقييم المادة معروض للمشرف');

  // ★ توثيق مادة عليها بلاغ مفتوح يمنح خطأً محتملًا ختم المراجعة
  const link = host.querySelector('a[href="#/admin/reports"]');
  ok(!!link, '★ ومادة عليها بلاغات تعرض بابًا إلى طابورها');
  has(link.textContent, '٢', 'بعددها');

  let asked = false;
  W.confirm = () => { asked = true; return false; };
  btn.dispatchEvent(new W.Event('click', { bubbles:true }));
  ok(asked, '★ ويُسأل المشرف قبل توثيق مادة عليها بلاغ مفتوح');
  eq(sent.length, 0, 'ورفضه يوقف التوثيق');

  W.confirm = () => true;
  btn.dispatchEvent(new W.Event('click', { bubbles:true }));
  pending.push((async () => {
    await until(W, () => sent.length > 0);
    eq(sent[0].p_on, true, 'وقبوله يوثّقها');
    eq(sent[0].p_subject, 'S1', 'بمعرّفها');
    W.close();
  })());
}
