/* ============ ٦٨ · vercel.json يجتاز مخطط Vercel ============ */
/*
  لماذا هذا الفحص موجود:
  أضفتُ مرة مفتاح "_تعليق" عربيًا داخل vercel.json أشرح فيه قرارًا تقنيًا.
  ومخطط Vercel صارم — يرفض أي مفتاح خارج قائمته. فشل كل نشر بعدها،
  وظلّ الموقع يقدّم بناءً قديمًا ساعتين ونحن نظنّه محدَّثًا. الملف كان
  سليم الصياغة JSON، فلم يلتقطه شيء عندنا. هذا الفحص هو ما كان ناقصًا.
*/
describe('٦٨ · صحة إعدادات النشر');
{
  const vjPath = path.join(ROOT, 'vercel.json');
  const rawVj = fs.readFileSync(vjPath, 'utf8');

  let vj = null;
  try { vj = JSON.parse(rawVj); } catch (e) { vj = null; }
  ok(vj !== null, 'vercel.json صالح JSON');

  // القائمة المسموحة في مخطط Vercel — أي مفتاح خارجها يُفشل النشر كاملًا
  const ALLOWED = ['$schema','buildCommand','devCommand','installCommand','ignoreCommand',
    'outputDirectory','framework','public','regions','functions','routes','rewrites',
    'redirects','headers','cleanUrls','trailingSlash','crons','images','git','builds',
    'name','version','env','build','github','functionFailoverRegions'];

  const unknown = Object.keys(vj || {}).filter(k => ALLOWED.indexOf(k) === -1);
  eq(unknown.length, 0, 'لا مفتاح خارج مخطط Vercel' +
     (unknown.length ? ' — وُجد: ' + unknown.join('، ') : ''));

  // ★ الحارس المباشر: لا تعليقات عربية ولا مفاتيح بشرطة سفلية. التوثيق مكانه ملف .md
  ok(!/"_/.test(rawVj), 'لا مفتاح يبدأ بشرطة سفلية — التعليق مكانه ملف توثيق لا ملف إعداد');
  ok(!/[؀-ۿ]/.test(rawVj), 'ولا نص عربي داخل الملف إطلاقًا');

  // القرار الذي كان التعليق يشرحه — نُثبته فحصًا بدل أن نشرحه نصًّا
  eq(vj.buildCommand, undefined,
     'لا buildCommand: index.html يُبنى ويُختبر محليًا، فما يُرفع هو ما يُقدَّم');
  eq(vj.outputDirectory, '.', 'ومجلد الإخراج هو الجذر');

  /*
    ★ نصف الحقيقة الذي كلّفنا ساعة:
    حذف buildCommand وحده لا يوقف البناء. حين لا يجد Vercel أمر بناء في
    vercel.json يسقط تلقائيًا إلى scripts.build في package.json وينفّذه.
    فبقي ينفّذ `node src/build.js` ويعيد توليد index.html من src داخل خادمه،
    فيدهس الملف المبنيّ والمفحوص الذي رفعناه. رفعنا index.html صحيحًا
    ٢٦٨ ألف حرف فقدّم الموقع ٢٧٢ ألفًا — بناءً من مصادر أقدم.
    الفحص التالي هو المنفذ الذي كان مفتوحًا.
  */
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const scripts = pkg.scripts || {};
  eq(scripts.build, undefined,
     'ولا سكربت باسم build في package.json — وإلا نفّذه Vercel وبنى فوق ما رفعناه');
  ok(!!scripts.site, 'والبناء المحلي باسم لا يلتقطه Vercel: npm run site');
  eq(scripts.site, 'node src/build.js', 'وهو نفسه أمر البناء');
  ok(!scripts.vercel_build && !scripts['vercel-build'],
     'ولا vercel-build — وهو منفذ آخر يلتقطه Vercel تلقائيًا');

  // الرؤوس التي تمنع تقديم صفحة قديمة من الكاش
  const srcs = (vj.headers || []).map(h => h.source);
  ok(srcs.indexOf('/index.html') !== -1, 'وindex.html له رأس تحقّق يمنع كاشًا قديمًا');
  ok(srcs.indexOf('/sw.js') !== -1, 'وعامل الخدمة لا يُخبَّأ أبدًا');
}

/* ============ ٦٩ · سلامة بنية CSS ============ */
/*
  لماذا هذا الفحص موجود:
  وجدتُ في 50-landing.css كتلة @media فقد سطرُ فتحها، فصار
  `animation:none` مطبَّقًا على كل زائر لا على من طلب تقليل الحركة.
  ثم صنعتُ العطل نفسه بيدي حين حذفتُ سطور محدِّدات وتركت أجسامها يتيمة.
  المشترك بينهما أن CSS لا ينهار عند الخطأ — يتجاوزه المتصفح بصمت،
  فيبقى الخلل شهورًا. الأقواس هي ما يكشفه، فنعدّها.
*/
describe('٦٩ · سلامة بنية CSS');
{
  const dir = path.join(ROOT, 'src', 'css');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.css')).sort();
  ok(files.length > 0, 'ملفات CSS موجودة');

  files.forEach(f => {
    const s = fs.readFileSync(path.join(dir, f), 'utf8');
    // نُسقط التعليقات أولًا: قوس داخل تعليق عربي لا يعني شيئًا للمتصفح
    const code = s.replace(/\/\*[\s\S]*?\*\//g, '');

    let depth = 0, wentNegative = false;
    for (let i = 0; i < code.length; i++){
      if (code[i] === '{') depth++;
      else if (code[i] === '}'){ depth--; if (depth < 0) wentNegative = true; }
    }
    ok(!wentNegative, f + ': لا قوس إغلاق يتيم — لا كتلة فقدت سطر فتحها');
    eq(depth, 0, f + ': الأقواس متوازنة تمامًا');

    // كتلة بلا محدِّد: سطر إعلانات يلي } مباشرة، وهو أثر الحذف السطري
    ok(!/}\s*\n\s+[a-z-]+\s*:[^;{]*;/i.test(code),
       f + ': ولا جسم إعلانات بلا محدِّد يسبقه');
  });

  // ★ ولا لون ثابت من الهوية القديمة: الظلال والألوان تأتي من المتغيّرات
  const landing = fs.readFileSync(path.join(dir, '50-landing.css'), 'utf8');
  no(landing, 'rgba(18,128,92', 'ولا أثر للأخضر الطبي القديم بعد تحوّل الهوية للعنّابي');
}
