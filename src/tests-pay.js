/* ============ ٩٠ · عرض المبالغ ============ */
describe('٩٠ · الريال والهللة');
{
  const A = makeDom().window.QBANK;
  const P = A.pay;

  // الهللة وحدة تخزين لا وحدة عرض: نخزّن بها كي لا نجمع كسورًا، ونعرض بالريال
  eq(P.money(1500, 'SAR'), '١٥ ريال', 'المبلغ الصحيح بلا كسر زائد');
  has(P.money(750, 'SAR'), '٧٫٥٠', 'والكسر بفاصلة عربية');
  eq(P.money(0, 'SAR'), '٠ ريال', 'والصفر يُعرض صفرًا');
  no(P.money(1500, 'SAR'), '1500', '★ ولا تظهر الهللات للطالب إطلاقًا');

  eq(P.questionsFor(300, 1), 300, '★ الكوين وحدة داخلية — نترجمها أسئلةً يفهمها الطالب');
  eq(P.questionsFor(300, 2), 150, 'وتتبع تكلفة السؤال');
  eq(P.questionsFor(300, 0), 300, 'وتكلفة صفر لا تُنتج قسمة على صفر');
  eq(P.questionsFor(0, 1), 0, 'وصفر كوين صفر سؤال');
}

/* ============ ٩١ · لا يُرسل المتصفح مبلغًا ============ */
describe('٩١ · السعر من القاعدة');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  const sent = [];
  A.admin.server = (path, body) => { sent.push({ path, body });
    return Promise.resolve({ ok:true, data:{ ok:true, url:'https://tap.test/pay/1', payment_id:'P1' } }); };
  A.api.rpc = () => Promise.resolve({ ok:true, data:{
    open:true, currency:'SAR', cost_per_q:1,
    packages:[{ coins:300, halalas:1500 }, { coins:700, halalas:3000 }] } });

  const host = doc.createElement('div'); doc.body.appendChild(host);
  host.appendChild(A.pay.coinShop());

  pending.push((async () => {
    await until(W, () => host.querySelector('.pack'));
    eq(host.querySelectorAll('.pack').length, 2, 'الباقتان معروضتان');
    has(host.textContent, '١٥ ريال', 'بأسعارها بالريال');
    has(host.textContent, 'سؤالًا مُثرى', 'وبقيمتها بالأسئلة لا بالكوين وحده');

    // ★ «الأوفر» محسوبة لا مكتوبة: لو كُتبت يدويًا لكذبت عند أول تغيير سعر
    const best = host.querySelector('.pack--best');
    ok(!!best, 'والأوفر موسومة');
    has(best.textContent, '٧٠٠', '★ وهي الأقل سعرًا للكوين — محسوبة لا مكتوبة');

    const buy = Array.prototype.filter.call(host.querySelectorAll('button'),
      b => b.textContent === 'اشترِ')[0];
    buy.dispatchEvent(new W.Event('click', { bubbles:true }));
    await until(W, () => sent.length > 0);

    eq(sent[0].path, '/api/pay', 'الشراء يمرّ بالخادم');
    eq(sent[0].body.kind, 'coins', 'ونوعه معلن');
    eq(sent[0].body.coins, 300, 'ومعه رقم الباقة');
    // ★ الفحص الذي يمنع «مادة بريال»
    ok(!('amount' in sent[0].body) && !('halalas' in sent[0].body) && !('price' in sent[0].body),
       '★ ولا مبلغ في الطلب إطلاقًا — القاعدة تحسبه، ولو أرسله المتصفح لاشترى بما يشاء');
    W.close();
  })());
}

/* ============ ٩٢ · الشراء موقوف ============ */
describe('٩٢ · إيقاف الشراء');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  A.api.rpc = () => Promise.resolve({ ok:true, data:{ open:false, packages:[] } });
  const host = doc.createElement('div'); doc.body.appendChild(host);
  host.appendChild(A.pay.coinShop());

  pending.push((async () => {
    await until(W, () => host.textContent.indexOf('موقوف') !== -1);
    // ★ نقول «موقوف» ولا نُخفي القسم: من يبحث عن الشراء ولا يجده يظنّه عطلًا فيغادر
    has(host.textContent, 'رصيدك الحالي يبقى كما هو',
        '★ والطالب يُطمأن أن رصيده وما اشتراه لا يتأثران');
    W.close();
  })());
}

/* ============ ٩٣ · زر شراء المادة ============ */
describe('٩٣ · شراء مادة');
{
  const dom = makeDom(), W = dom.window, A = W.QBANK;
  eq(A.pay.buySubjectButton({ id:'s', free:true, price:20 }), null, 'المجانية بلا زر شراء');
  eq(A.pay.buySubjectButton({ id:'s', price:0 }), null, 'وبلا سعر كذلك');
  eq(A.pay.buySubjectButton(null), null, 'ومدخل فارغ لا يُنتج انهيارًا');
  const b = A.pay.buySubjectButton({ id:'s', price:20 });
  ok(!!b, 'وذات السعر لها زر');
  has(b.textContent, '٢٠ ريال', '★ والسعر مكتوب على الزر — لا مفاجأة بعد الضغط');

  /* ★ زر الشراء صار دفعًا داخل المنصة لا رابطًا خارجيًا:
     كان يفتح موقعًا آخر عند أهم لحظة في المنصة — لحظة قرار الدفع. */
  const gate = A.gate.buyButton({ id:'s', name:'مادة', price:20 });
  ok(gate.querySelector ? !gate.querySelector('a[href^="http"]') : true,
     '★ ولا رابط خارجي في بوابة الشراء');
  W.close();
}

/* ============ ٩٤ · شاشة العودة لا تصدّق العنوان ============ */
describe('٩٤ · العودة من البوابة');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  const calls = [];
  A.admin.server = (path, body) => { calls.push(body); return Promise.resolve({ ok:true, data:{ ok:true } }); };
  A.api.rpc = (n, args) => {
    if (n !== 'payment_status') return Promise.resolve({ ok:true, data:{} });
    return Promise.resolve({ ok:true, data:{ ok:true, status:'paid', kind:'coins', coins:300 } });
  };

  pending.push((async () => {
    await nav(W, '#/pay/P1?tap_id=chg_777');
    await until(W, () => doc.getElementById('main').textContent.indexOf('تمّت') !== -1);
    const t = doc.getElementById('main').textContent;
    has(t, 'تمّت العملية', 'النجاح يُعلن');
    has(t, '٣٠٠', 'وعدد الكوينز الواصل');

    // ★ لا نصدّق العنوان: نُرسل المعرّف إلى خادمنا ليسأل البوابة بنفسه
    eq(calls[0].action, 'confirm', '★ الشاشة تطلب تحققًا من الخادم');
    eq(calls[0].charge_id, 'chg_777', 'بمعرّف العملية القادم من البوابة');
    W.close();
  })());
}

/* ============ ٩٥ · دفعة معلّقة وأخرى فاشلة ============ */
describe('٩٥ · حواف الدفع');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  let status = 'pending';
  A.admin.server = () => Promise.resolve({ ok:true, data:{ ok:false } });
  A.api.rpc = (n) => n === 'payment_status'
    ? Promise.resolve({ ok:true, data:{ ok:true, status, kind:'coins', coins:300,
        reason: status === 'failed' ? 'المبلغ المدفوع أقل من المطلوب' : '' } })
    : Promise.resolve({ ok:true, data:{} });

  pending.push((async () => {
    await nav(W, '#/pay/P2');
    await until(W, () => doc.getElementById('main').textContent.indexOf('قيد التأكيد') !== -1);
    // ★ المعلّقة ليست فاشلة: ادّعاء الفشل يدفع الطالب إلى الدفع مرتين
    has(doc.getElementById('main').textContent, 'لا تدفع مرة أخرى',
        '★ والمعلّقة تُحذّر من الدفع مرتين — لا تُعلن فشلًا لم يحدث');

    status = 'failed';
    await nav(W, '#/pay/P3');
    await until(W, () => doc.getElementById('main').textContent.indexOf('لم تكتمل') !== -1);
    has(doc.getElementById('main').textContent, 'المبلغ المدفوع أقل من المطلوب',
        'والفاشلة تقول سببها');
    W.close();
  })());
}

/* ============ ٩٦ · ملف PAY.sql ============ */
describe('٩٦ · قاعدة الدفع');
{
  const sql = fs.readFileSync(path.join(ROOT, 'db', 'PAY.sql'), 'utf8');

  // ★ السعر يُحسم في القاعدة
  has(sql, "(x->>'coins')::int = p_coins",
      '★ باقة الكوينز تُطابَق بقائمة معلنة — لا عدد حر يرسله المتصفح');
  has(sql, "reason','bad_package", 'وباقة غير معروفة تُرفض');
  has(sql, 'greatest(coalesce(sub.price, 0), 0) * 100',
      '★ وسعر المادة من صفّها لا من الطلب');
  has(sql, "reason','already_owned", 'ولا يُدفع ثمن مادة يملكها');

  // ★ التسوية بمفتاح الخدمة وحده
  has(sql, 'grant execute on function qbank.settle_payment(uuid, text, int, text) to service_role',
      '★ التسوية لمفتاح الخدمة وحده');
  no(sql, 'grant execute on function qbank.settle_payment(uuid, text, int, text) to authenticated',
      '★ ولو مُنحت للطالب لمنح نفسه ما يشاء بنداء واحد');

  // ★ لا تكرار ولا نقص
  has(sql, 'payments_provider_ref', 'ومرجع الدفعة فريد — الإشعار المكرر لا يمنح مرتين');
  has(sql, "if pay.status = 'paid'", 'والصف المدفوع يُرجع نجاحًا بلا منح ثانٍ');
  has(sql, 'p_paid_halalas, 0) < pay.amount_halalas',
      '★ ومبلغ أقل من المطلوب لا يُسوّى — حزام ثانٍ لو خُدعت البوابة');

  // ★ لا كتابة للطالب على جدول الدفعات
  no(sql, 'create policy payments_insert', '★ ولا سياسة إدراج للطالب — صفٌّ يكتبه يعني رصيدًا مجانيًا');
  no(sql, 'create policy payments_update', 'ولا تعديل');
  has(sql, 'for update', 'والتسوية تقفل الصف قبل قراءته — إشعاران متزامنان لا يمنحان مرتين');

  // الإحالة لا تُبطل شراءً دُفع ثمنه
  has(sql, 'exception when others then', '★ وفشل مكافأة الإحالة لا يُبطل شراءً دُفع ثمنه');
  has(sql, 'when p_ref = uid then null', 'ولا يُحيل الطالب نفسه');

  const defs = sql.split('create or replace function').slice(1);
  eq(defs.filter(d => d.indexOf('set search_path = qbank, public') === -1).length, 0,
     'وكل دالة تثبّت search_path');
  no(sql, 'drop table', 'ولا حذف جدول');
}

/* ============ ٩٧ · خادم الدفع ============ */
describe('٩٧ · api/pay');
{
  const js = fs.readFileSync(path.join(ROOT, 'api', 'pay.js'), 'utf8');
  const gw = fs.readFileSync(path.join(ROOT, 'api', '_lib', 'gateway.js'), 'utf8');

  // ★ الخادم لا يقرأ مبلغًا من الطلب
  no(js, 'body.amount', '★ الخادم لا يقرأ مبلغًا من الطلب');
  no(js, 'body.price', 'ولا سعرًا');
  has(js, "rpc('create_payment'", 'بل ينادي القاعدة لتحسبه');

  // ★ الدليل الوحيد هو سؤال البوابة
  has(js, 'gateway.retrieveCharge', '★ والتسوية بعد سؤال البوابة مباشرة');
  has(js, "reason:'not_paid'", 'وغير المقبوضة تُرفض');
  has(gw, "=== 'CAPTURED'", 'والحالة المقبولة واحدة معلنة');

  // ★ المفتاح السري لا يُسرَّب
  has(gw, 'process.env.TAP_SECRET_KEY', 'المفتاح من البيئة');
  no(gw, 'console.log(secret', 'ولا يُسجَّل');
  no(js, 'TAP_SECRET', '★ ولا يظهر في مسار الطلب إطلاقًا');

  // webhook وconfirm معًا: أحدهما قد لا يصل
  has(js, "action === 'webhook'", 'وإشعار البوابة مسموع');
  has(js, 'req.query && req.query.hook', '★ ويُتعرَّف عليه بلا اشتراط حقل ترسله البوابة');
  has(js, 'res.status(200).json({ received:true', 'ويُردّ عليه ٢٠٠ دائمًا كي لا يتكرر بلا نهاية');

  // المقارنة بالأعداد الصحيحة
  has(gw, 'Math.round(Number(d.amount || 0) * 100)',
      '★ والمبلغ يُقارَن هللاتٍ صحيحة لا كسورًا عشرية');
}

/* ============ ٩٨ · التصدير لا يدهس الجلب ============ */
describe('٩٨ · أسماء الوحدة');
{
  const A = makeDom().window.QBANK;
  /*
    ★ كان QBANK.pay.history يُصدَّر فوق Pay.history — دالة جلب السجل —
    فصارت دالة البناء تنادي نفسها بلا نهاية وتنهار الصفحة كاملة.
    شاشة بيضاء كاملة سببها حرفٌ في اسم.
  */
  ok(typeof A.pay.history === 'function', 'دالة جلب السجل باقية');
  ok(typeof A.pay.historyCard === 'function', 'وبناء البطاقة باسم آخر');
  ok(A.pay.history !== A.pay.historyCard, '★ ولا يدهس أحدهما الآخر');
  ok(A.pay.options !== A.pay.coinShop, 'وكذلك الخيارات والمتجر');
  eq(typeof A.pay.status, 'function', 'وحالة الدفعة دالة جلب');

  /* ★ الانتقال إلى البوابة يقع داخل .then بعد رحلة شبكة — وقد يكون
     المستند فُكِّك حينها، فالكتابة على وصفه ترمي وتُسقط ما بعدها. */
  eq(typeof A.pay.goTo, 'function', 'والانتقال إلى البوابة عبر حارس');
}
