/* ============ ٦١ · اتّساق لوحة المشرف ============ */
describe('٦١ · اتّساق اللوحة');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  const pl = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'adm', email:'a@a.a' }))));
  A.api.auth.captureFromHash('#access_token=h.' + pl + '.s&refresh_token=r&expires_in=9999');

  A.api.rpc = name => {
    if (name === 'admin_stats') return Promise.resolve({ ok:true,
      data:{ students:42, active_7d:9, attempts:120, avg_pct:74 } });
    if (name === 'admin_students') return Promise.resolve({ ok:true,
      data:{ rows:[{ id:'u1', name:'سعد', avatar:'👤', attempts:12, best:88 }] } });
    if (name === 'admin_dashboard') return Promise.resolve({ ok:true, data:{
      kpi:{ students:42, active_7d:9, online:2, attempts:120, avg_pct:74, subjects:5,
            published:5, questions:252, derived:0, drafts:0, enrollments:0 },
      series:[], buckets:[], subjects:[], recent:[] } });
    return Promise.resolve({ ok:true, data:[] });
  };
  A.api.rest = p => {
    if (p.indexOf('subjects?select') === 0) return Promise.resolve({ ok:true, data:[
      { id:'s1', name:'التسمم', icon:'☤', q_count:45, published:true, free:true, ord:0, exam_date:null },
      { id:'s2', name:'مخفية', icon:'▤', q_count:10, published:false, free:false, ord:1, exam_date:null } ] });
    if (p.indexOf('drafts?select') === 0) return Promise.resolve({ ok:true, data:[
      { id:'d1', name:'مسوّدة جاهزة', status:'reviewing', total:30, done:30 },
      { id:'d2', name:'مسوّدة معتمدة', status:'approved', total:10, done:10 } ] });
    return Promise.resolve({ ok:true, data:[] });
  };

  const TABS = ['dash','students','ugc','content','settings'];
  eq(A.views.ADMIN_TABS.length, 5, 'خمسة تبويبات في اللوحة');
  eq(A.views.ADMIN_TABS.map(t => t.id).join(','), TABS.join(','), 'وترتيبها ثابت ومعروف');

  pending.push((async () => {
    // ★ لا يبقى مكوّن من النظام القديم في أي تبويب — التفاوت يجعلها صفحات لا لوحة
    for (const t of TABS){
      await nav(W, '#/admin/' + t);
      await until(W, () => {
        const m = doc.getElementById('main');
        return m && m.textContent.indexOf('جارٍ') === -1;
      }, 6000);
      const main = doc.getElementById('main');
      ok(!main.querySelector('.card.row'), 'تبويب «' + t + '» بلا صفوف النظام القديم');
      ok(!main.querySelector('.stat__num'), 'وبلا مؤشرات النظام القديم');
      ok(!!main.querySelector('.tabs__btn[aria-selected="true"]'), 'وتبويبه المُفعَّل معلَّم');
    }

    // تبويب الطلاب يستعمل نفس مؤشرات اللوحة
    await nav(W, '#/admin/students');
    await until(W, () => doc.querySelector('.ad-kpi'));
    eq(doc.querySelectorAll('.ad-kpi').length, 4, 'أربعة مؤشرات للطلاب بنفس مكوّن اللوحة');
    ok(!!doc.querySelector('.ad-panel'), 'والقائمة داخل لوحة معنونة');
    ok(!!doc.querySelector('.ad-row'), 'وصفوفها بلغة الصفوف الموحّدة');
    has(doc.getElementById('main').textContent, 'أفضل 88٪', 'وأفضل نتيجة للطالب ظاهرة');

    // تبويب المحتوى: المسوّدات المعتمدة لا تُعرض — ليست عملًا معلّقًا
    await nav(W, '#/admin/content');
    await until(W, () => doc.querySelector('.ad-panel'));
    const t2 = doc.getElementById('main').textContent;
    has(t2, 'مسوّدة جاهزة', 'المسوّدة المعلّقة معروضة');
    no(t2, 'مسوّدة معتمدة', 'والمعتمدة لا تزاحم — انتهى عملها');
    has(t2, 'غير معتمدة', 'وعددها معلن في عنوان اللوحة');
    has(t2, 'لا يراها الطالب', 'ويوضّح أنها غير ظاهرة للطالب');
    has(t2, 'مادة على المنصة', 'والمواد في لوحتها المعنونة');
    ok(!!doc.querySelector('a[href="#/admin/subject/s1"]'), 'ولكل مادة زر تحرير يقود لمحررها');
    has(t2, 'اعرض ما يراه الطالب', 'وللمشرف طريق سريع لرؤية المنصة كطالب');
    W.close();
  })());
}

/* ============ ٦٢ · بوابة المشرف نفسها ============ */
describe('٦٢ · بوابة الدخول');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  A.api.saveSession(null);

  // بلا جلسة: شاشة دخول لا شاشة فارغة ولا خطأ
  A.router.render('#/admin');
  const t = doc.getElementById('main').textContent;
  has(t, 'دخول المشرف', 'بلا جلسة تظهر بوابة دخول واضحة');
  has(t, 'is_admin', 'وتشرح أن التحقق في قاعدة البيانات لا في المتصفح');
  ok(!!doc.querySelector('input[type="email"], #adminEmail'), 'وفيها حقل بريد');

  // الإعدادات وحدها تعمل بلا جلسة — بها يُضبط الربط أول مرة
  A.router.render('#/admin/settings');
  has(doc.getElementById('main').textContent, 'ربط الخادم',
      'الإعدادات تُفتح بلا جلسة — بها يُضبط الربط أول مرة');
  W.close();
}
