/* ============ ٥٦ · المنصة لكل التخصصات لا الصحية وحدها ============ */
describe('٥٦ · سعة التخصصات');
{
  // لا حصر في أي نص يراه الطالب
  no(html, 'التخصصات الصحية', 'لا حصر بالتخصصات الصحية في الملف المبني');
  const mf = fs.readFileSync(path.join(ROOT,'manifest.webmanifest'), 'utf8');
  no(mf, 'التخصصات الصحية', 'ولا في وصف التطبيق');
  has(mf, 'لكل التخصصات', 'بل «لكل التخصصات» صراحةً');
  const shell = fs.readFileSync(path.join(__dirname,'shell.html'), 'utf8');
  no(shell, 'التخصصات الصحية', 'ولا في وصف الصفحة لمحركات البحث');

  // الكليات في البذرة تغطّي ما يدرسه الطالب العربي فعلًا
  const cat = fs.readFileSync(path.join(ROOT,'db','CATALOG.sql'), 'utf8');
  [['كلية الهندسة','هندسة'], ['كلية علوم الحاسب والمعلومات','حاسب'],
   ['كلية الحقوق','حقوق'], ['كلية إدارة الأعمال','إدارة'],
   ['كلية الشريعة وأصول الدين','شريعة'], ['كلية التربية','تربية'],
   ['كلية الآداب واللغات','آداب'], ['كلية العمارة والتخطيط','عمارة'],
   ['كلية الزراعة والأغذية','زراعة'], ['كلية الإعلام والاتصال','إعلام']]
    .forEach(([c, label]) => has(cat, c, 'البذرة فيها كلية ' + label));
  has(cat, 'كلية الطب', 'والكليات الصحية باقية لم تُحذف');
  // العدد نفسه هو الدليل: ستّ كليات = منصة طبية، وأكثر من عشرين = منصة جامعة
  const colleges = (cat.match(/\('(كلية|الدراسات)[^']*'\)/g) || []);
  ok(colleges.length >= 20, 'عدد الكليات ' + colleges.length + ' — يتجاوز التخصصات الصحية');

  // العيّنات: ثلاثة تخصصات لا واحد
  const A = makeDom().window.QBANK;
  eq(A.demos.list.length, 3, 'ثلاث عيّنات تعليمية');
  const tags = A.demos.list.map(d => d.tag);
  ok(tags.indexOf('طب') !== -1, 'عيّنة طبية');
  ok(tags.indexOf('حاسب') !== -1, 'وعيّنة حاسب');
  ok(tags.indexOf('محاسبة') !== -1, 'وعيّنة محاسبة');

  // كل عيّنة مكتملة — عيّنة ناقصة تكسر الشاشة عند دورها
  A.demos.list.forEach((d, i) => {
    ok(d.q && d.options.length >= 2, 'العيّنة ' + (i+1) + ' فيها سؤال وخيارات');
    ok(d.answer >= 0 && d.answer < d.options.length, 'وموضع إجابتها داخل خياراتها');
    ok(!!d.why && !!d.wrong, 'ولها شرح للصحيح وللخطأ');
    ok(!!(d.mnemonic && d.mnemonic.cue && d.mnemonic.key), 'وبطاقة حفظ كاملة');
    ok(!!d.tag, 'ووسم تخصصها');
  });

  // وواحدة عربية على الأقل — تُظهر أن المنصة تفهم الأسئلة العربية لا الإنجليزية فقط
  ok(A.demos.list.some(d => /[ء-ي]/.test(d.q)), 'عيّنة واحدة على الأقل سؤالها عربي');
}

/* ============ ٥٧ · دوران العيّنات ============ */
describe('٥٧ · دوران العيّنة');
{
  const dom = makeDom(), W = dom.window, doc = W.document, A = W.QBANK;
  A.store.remove('lp_demo');

  // زائر يعود ثلاث مرات يرى ثلاثة تخصصات — الدوران لا العشوائية
  const seen = [A.demos.next(), A.demos.next(), A.demos.next()];
  eq(seen.join(','), '0,1,2', 'الدوران متسلسل: لا تكرار في ثلاث زيارات');
  eq(A.demos.next(), 0, 'ثم يعود إلى الأولى');
  eq(A.demos.at(-1).tag, 'محاسبة', 'والفهرس السالب لا يكسر شيئًا');
  eq(A.demos.at(7).tag, A.demos.list[1].tag, 'وفهرس خارج المدى يلتفّ');

  // السؤال وبطاقة الحفظ من نفس العيّنة — وإلا بدتا غير مترابطتين
  A.api.saveSession(null);
  A.data.savePack({ subjects:[], settings:{} });
  A.store.set('lp_demo', 1);          // عيّنة الحاسب
  A.router.render('#/');
  const t = doc.getElementById('main').textContent;
  has(t, 'حاسب', 'وسم التخصص يتبع العيّنة المعروضة');
  has(t, 'binary search', 'والسؤال منها');
  const memo = doc.querySelector('.lp-memo');
  memo.click();
  has(memo.textContent, 'log n', 'وبطاقة الحفظ من العيّنة نفسها لا من غيرها');
  W.close();
}
