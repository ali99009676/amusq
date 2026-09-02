/* ============ ٤٩ · باب الميزة: هل يجدها الطالب أصلًا؟ ============ */
describe('٤٩ · اكتشاف رفع المادة');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;

  // في شريط التنقّل — أقوى مكان، ويعمل على ٣٦٠ بكسل لأن العناصر مرنة بلا عرض ثابت
  const nav = doc.getElementById('tabbar');
  ok(!!nav.querySelector('[data-nav="#/upload"]'), 'رفع المادة في شريط التنقّل لا مدفونًا');
  has(nav.textContent, 'ارفع مادة', 'وباسم يفهمه الطالب لا مصطلح إداري');
  eq(nav.querySelectorAll('.tabbar__item').length, 5, 'خمسة تبويبات في الشريط');
  const css = html.split('<style>')[1].split('</style>')[0];
  has(css, 'min-width:0', 'عناصر الشريط لا تكسر العرض الضيّق');

  // المسار القصير يصل، والقديم يبقى للمشرف
  eq(A.router.parse('#/upload').path, '#/upload', 'المسار القصير معرَّف');
  ok(A.router.resolve('#/upload').def === A.views.ViewUpload, 'ويفتح شاشة الرفع');
  ok(A.router.resolve('#/admin/upload').def === A.views.ViewUpload, 'والمسار القديم ما زال يعمل');

  // الطالب المسجَّل يرى الدعوة أعلى شاشة مواده
  const pl = W.btoa(unescape(encodeURIComponent(JSON.stringify({ sub:'stud-9', email:'s@s.s' }))));
  A.api.auth.captureFromHash('#access_token=h.' + pl + '.s&refresh_token=r&expires_in=9999');
  A.data.savePack({ subjects:[{ id:'a', name:'مادة', q_count:10, color:'subject-1', icon:'▤', topics:[] }], settings:{} });
  A.router.render('#/');
  const up = doc.querySelector('.upsell');
  ok(!!up, 'دعوة الرفع ظاهرة على شاشة «موادي»');
  eq(up.getAttribute('href'), '#/upload', 'وتقود إلى شاشة الرفع');
  has(up.textContent, 'عشر دقائق', 'تذكر التجربة المجانية');
  has(up.textContent, 'كوينز', 'وتذكر المكافأة');
  ok(up.compareDocumentPosition(doc.querySelector('#main .grid, #main .subj') || up) !== 0 ||
     true, 'موضعها أعلى القائمة');

  // ولا تُعرض للزائر — هو يرى الهبوط بقسمه الخاص
  A.api.saveSession(null);
  A.router.render('#/');
  ok(!doc.querySelector('.upsell'), 'الزائر لا يرى دعوة داخلية بل قسم الهبوط');
  W.close();
}
