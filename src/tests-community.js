/* ============ ٨٣ · صياغة الوقت والميداليات ============ */
describe('٨٣ · أدوات المجتمع');
{
  const A = makeDom().window.QBANK;
  const C = A.community;
  const h = n => new Date(Date.now() + n * 3600000).toISOString();

  has(C.timeLeft(h(50)), 'يوم', 'ما يزيد على يوم يُقال بالأيام');
  has(C.timeLeft(h(5)),  'ساعة', 'وما دونه بالساعات');
  has(C.timeLeft(h(0.2)),'دقيقة', 'وآخر ساعة بالدقائق');
  eq(C.timeLeft(h(-3)), 'انتهى', 'والمنتهي يُقال صراحةً');
  // ★ الوقت بعبارة لا بتاريخ: الطالب يقرّر بلمحة لا بحساب
  no(C.timeLeft(h(50)), '20', 'ولا تاريخ خام يحسبه الطالب بنفسه');

  eq(C.medal(1), '🥇', 'الأول ذهب');
  eq(C.medal(3), '🥉', 'والثالث برونز');
  eq(C.medal(4), '', '★ ولا ميدالية للرابع — ميدالية للجميع لا تميّز أحدًا');
}

/* ============ ٨٤ · لوحة متصدّري الجامعة ============ */
describe('٨٤ · متصدّرو الجامعة');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  A.api.rpc = () => Promise.resolve({ ok:true, data:{
    ok:true, total:200, days:30,
    rows:[
      { rank:1, name:'سارة', avatar:'🧠', points:420, exams:12, best:96, me:false },
      { rank:2, name:'',     avatar:'',   points:310, exams:9,  best:88, me:false },
      { rank:3, name:'خالد', avatar:'🩺', points:290, exams:8,  best:84, me:false }
    ],
    me:{ rank:47, points:60, exams:2 }
  }});

  const host = doc.createElement('div'); doc.body.appendChild(host);
  host.appendChild(A.community.boardBody());

  pending.push((async () => {
    await until(W, () => host.querySelector('.brd__row'));
    const rows = host.querySelectorAll('.brd__row');
    eq(rows.length, 4, 'ثلاثة صفوف ومعها صفّك أنت');

    has(rows[0].textContent, '🥇', 'الأول بميدالية');
    // ★ من لم يضع اسمًا يظهر «طالب» — لا فراغ ولا بريد
    has(rows[1].textContent, 'طالب', '★ ومن بلا اسم يظهر «طالب» لا فراغًا ولا بريدًا');
    ok(host.textContent.indexOf('@') === -1, 'ولا بريد في اللوحة إطلاقًا');

    // ★ ترتيبك ولو خارج العشرين: الغياب يُحبط، و«٤٧» يُحفّز
    const mine = host.querySelector('.is-mine-out');
    ok(!!mine, '★ وترتيبك يظهر ولو كنت خارج المعروضين');
    has(mine.textContent, '٤٧', 'برقمه');
    has(host.textContent, 'داخل جامعتك', 'والنطاق معلن: جامعتك لا المنصة');
    W.close();
  })());
}

/* ============ ٨٥ · لوحة بلا جامعة ============ */
describe('٨٥ · لوحة بلا انتماء');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  A.api.rpc = () => Promise.resolve({ ok:true, data:{ ok:false, reason:'no_university' } });

  const host = doc.createElement('div'); doc.body.appendChild(host);
  host.appendChild(A.community.boardBody());

  pending.push((async () => {
    await until(W, () => host.textContent.indexOf('حدّد جامعتك') !== -1);
    // ★ الفراغ يُشرح ويُعالَج: «لا جامعة» خطوة ناقصة لا عطل
    has(host.textContent, 'المتصدرون داخل جامعتك', 'يُشرح سبب الفراغ');
    ok(!!host.querySelector('a[href="#/account"]'), '★ ومعه الزر الذي يُصلحه');
    W.close();
  })());
}

/* ============ ٨٦ · التحدّي: إنشاء ورمز ولوحة ============ */
describe('٨٦ · تحدّي الدفعة');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  const made = [];
  A.api.rpc = (name, args) => {
    if (name === 'create_challenge'){ made.push(args); return Promise.resolve({ ok:true, data:{ ok:true, id:'X1', code:'ABC234' } }); }
    return Promise.resolve({ ok:true, data:{} });
  };

  const host = doc.createElement('div'); doc.body.appendChild(host);
  host.appendChild(A.community.challengeBox({ id:'S1', name:'مادة' }));

  const make = Array.prototype.filter.call(host.querySelectorAll('button'),
    b => b.textContent.indexOf('افتح تحدّيًا') !== -1)[0];
  ok(!!make, 'زر فتح التحدّي موجود');
  make.dispatchEvent(new W.Event('click', { bubbles:true }));

  pending.push((async () => {
    await until(W, () => host.querySelector('.chall__code'));
    eq(made[0].p_subject, 'S1', 'التحدّي يُفتح على المادة');
    eq(host.querySelector('.chall__code').textContent, 'ABC234', 'والرمز يُعرض كبيرًا');
    // ★ الرمز بلا حروف ملتبسة: يُملى صوتًا في مجموعة الدفعة
    ok(!/[O0I1]/.test(host.querySelector('.chall__code').textContent),
       '★ ولا حروف ملتبسة (O/0 و I/1) — الرمز يُملى صوتًا لا يُنسخ فقط');
    ok(!!host.querySelector('a[href="#/challenge/ABC234"]'), 'ورابط اللوحة جاهز');
    W.close();
  })());
}

/* ============ ٨٧ · شاشة لوحة التحدّي ============ */
describe('٨٧ · لوحة التحدّي');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  A.api.rpc = (name, args) => {
    if (name !== 'challenge_board') return Promise.resolve({ ok:true, data:{} });
    if (args.p_code === 'NOPE') return Promise.resolve({ ok:true, data:{ ok:false, reason:'not_found' } });
    return Promise.resolve({ ok:true, data:{
      ok:true, code:'ABC234', title:'تحدّي دفعة ٢٠٢٦', subject:'الفسيولوجيا', subject_id:'S1',
      ends_at: new Date(Date.now() + 36e5 * 30).toISOString(), ended:false,
      rows:[{ rank:1, name:'سارة', avatar:'🧠', score:92, me:false },
            { rank:2, name:'أنا',  avatar:'◍', score:80, me:true }]
    }});
  };

  pending.push((async () => {
    await nav(W, '#/challenge/ABC234');
    await until(W, () => doc.querySelector('.brd__row'));
    const t = doc.getElementById('main').textContent;
    has(t, 'تحدّي دفعة ٢٠٢٦', 'عنوان التحدّي');
    has(t, 'الفسيولوجيا', 'والمادة');
    has(t, 'يبقى', 'والوقت المتبقي بعبارة');
    eq(doc.querySelectorAll('.brd__row').length, 2, 'وصفّان في اللوحة');
    ok(!!doc.querySelector('.brd__row.is-me'), 'وصفّك مميَّز');
    ok(!!doc.querySelector('a[href*="challenge=ABC234"]'), 'وزر بدء اختبار التحدّي يحمل رمزه');

    // رمز خاطئ: رسالة تفهم لا شاشة مكسورة
    await nav(W, '#/challenge/NOPE');
    await until(W, () => doc.getElementById('main').textContent.indexOf('لم نجد') !== -1);
    has(doc.getElementById('main').textContent, 'ستة محارف', 'والرمز الخاطئ يشرح الشكل المتوقَّع');
    W.close();
  })());
}

/* ============ ٨٨ · ملف COMMUNITY.sql ============ */
describe('٨٨ · قاعدة المجتمع');
{
  const sql = fs.readFileSync(path.join(ROOT, 'db', 'COMMUNITY.sql'), 'utf8');

  // ★ الخطّ الأحمر الأول: لا بريد ولا معرّف مستخدم يخرج من أي دالة
  no(sql, "'email'", '★ لا بريد في أي مُخرَج');
  no(sql, "'user_id', ", '★ ولا معرّف مستخدم — الاسم والصورة فقط');
  has(sql, "'name', nullif(btrim(p.name)", 'والاسم يُنظَّف قبل عرضه');

  // ★ الخطّ الأحمر الثاني: المقارنة داخل الجامعة
  has(sql, 'p.university_id = uni', '★ والمقارنة داخل الجامعة لا عبر المنصة');
  has(sql, 'p.show_on_board', 'ومن اختار الاختفاء لا يُحسب');
  has(sql, 'add column if not exists show_on_board boolean not null default true',
      'والظهور اختيار بافتراض ظاهر');

  // المعيار يقيس المراجعة لا النقر
  has(sql, 'sum(greatest(coalesce(a.correct, 0), 0))',
      '★ النقاط بالإجابات الصحيحة لا بعدد الاختبارات — نقيس المراجعة لا النقر');
  has(sql, "now() - (least(greatest(coalesce(p_days,30), 1), 365)",
      'ونافذة زمنية تُبقي اللوحة قابلة للفوز');

  // التحدّي
  has(sql, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
      '★ رمز التحدّي بلا O/0 وI/1 — يُملى صوتًا في مجموعة الدفعة');
  has(sql, "reason','ended", 'ولا تُقبل نتيجة بعد انتهاء الوقت');
  has(sql, 'greatest(qbank.challenge_entries.score, excluded.score)',
      '★ وأفضل نتيجة تبقى لا الأخيرة — كي لا يخاف الطالب من محاولة ثانية');

  // العطل الذي وقعنا فيه سابقًا: متغيّر يطابق اسم عمود
  has(sql, 'new_id uuid', 'والمتغيّر new_id لا id — تظليل اسم عمود يُنتج عطلًا صامتًا');
  no(sql, 'into id;', 'ولا returning إلى متغيّر ملتبس');

  const defs = sql.split('create or replace function').slice(1);
  eq(defs.filter(d => d.indexOf('set search_path = qbank, public') === -1).length, 0,
     'وكل دالة تثبّت search_path');
  no(sql, 'drop table', 'ولا حذف جدول');
}
