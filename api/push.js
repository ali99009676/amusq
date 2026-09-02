'use strict';
/*
  /api/push — إشعارات المتصفح.

  GET  → المفتاح العام لـVAPID (يحتاجه المتصفح ليشترك). عامٌّ بطبيعته.
  POST → الإرسال اليومي. تناديه جدولة Vercel صباحًا (vercel.json → crons)،
         ويحرس نفسه بـCRON_SECRET كي لا يُطلق أيُّ زائر إشعارات الناس.

  ═══ ما يُقال ═══
  «١٢ سؤالًا تنتظر مراجعتك اليوم» — أو «اختبار علم السموم بعد ٣ أيام» —
  أو كلاهما. ومن لا شيء عنده لا يُزعَج: إشعارٌ بلا خبر يُعلّم الطالب أن
  يكتم الإشعارات كلها، فنخسر اليوم الذي يكون فيه خبر.

  ═══ الحساب في القاعدة ═══
  push_targets تُعيد لكل اشتراك ما يستحق قوله. الخادم هنا يوقّع ويُرسل
  فقط — ولا يجلب تقدّم ألف طالب ليعدّه بنفسه.
*/
const { rpc } = require('./_lib/supa.js');

function keys(){
  return {
    pub:  process.env.VAPID_PUBLIC_KEY  || '',
    priv: process.env.VAPID_PRIVATE_KEY || '',
    subject: process.env.VAPID_SUBJECT  || 'mailto:stop.shankl@gmail.com'
  };
}

/* رقم اليوم منذ ١٩٧٠ بتوقيت الرياض — كما تحسبه الواجهة (Progress.today) */
function riyadhDay(){
  const now = Date.now() + 3 * 3600 * 1000;
  return Math.floor(now / 86400000);
}

/* الأرقام بالعربية كما في المنصة */
function ar(n){ return String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]); }

/*
  نصّ الإشعار. قصيرٌ لأنه يُقرأ في شريط القفل، ومحدَّد لأنه يُنافس عشرين
  إشعارًا آخر: «١٢ سؤالًا» تُفتح، و«لا تنسَ المراجعة» تُمسح.
*/
function compose(t){
  const due = Number(t.due) || 0;
  const ex = t.exam && typeof t.exam.days === 'number' && t.exam.days <= 7 ? t.exam : null;
  if (!due && !ex) return null;

  let title, body, url = '#/';
  if (ex && ex.days <= 1){
    title = 'اختبارك ' + (ex.days === 0 ? 'اليوم' : 'غدًا') + ' — ' + ex.name;
    body  = due ? ar(due) + ' سؤالًا تعثّرت فيها تنتظرك. راجعها الآن.' : 'راجع أصعب أسئلتك قبل أن تدخل.';
    url   = '#/review';
  } else if (due){
    title = ar(due) + ' سؤالًا تنتظر مراجعتك اليوم';
    body  = ex ? 'واختبار ' + ex.name + ' بعد ' + ar(ex.days) + ' أيام.' : 'خمس دقائق تكفي — التكرار هو ما يُثبّت.';
    url   = '#/review';
  } else {
    title = 'اختبار ' + ex.name + ' بعد ' + ar(ex.days) + ' أيام';
    body  = 'ابدأ المراجعة اليوم لا ليلة الاختبار.';
    url   = '#/';
  }
  return { title, body, url };
}

module.exports = async function handler(req, res){
  const k = keys();

  if (req.method === 'GET'){
    if (!k.pub) return res.status(503).json({ error:'VAPID_PUBLIC_KEY غير مضبوط', ready:false });
    return res.status(200).json({ ready:true, publicKey: k.pub });
  }
  if (req.method !== 'POST') return res.status(405).json({ error:'GET أو POST' });

  /*
    ★ الحارس. Vercel تُرسل Authorization: Bearer <CRON_SECRET> مع كل نداء
    مجدول متى ضُبط المتغيّر. وبدونه يستطيع أي زائر أن يُطلق الإرسال.
  */
  const secret = process.env.CRON_SECRET || '';
  const auth = String(req.headers.authorization || '');
  const given = auth.indexOf('Bearer ') === 0 ? auth.slice(7) : String(req.headers['x-cron-secret'] || '');
  if (!secret || given !== secret) return res.status(401).json({ error:'غير مصرَّح' });
  if (!k.pub || !k.priv) return res.status(503).json({ error:'مفاتيح VAPID غير مضبوطة' });

  let webpush;
  try { webpush = require('web-push'); }
  catch(e){ return res.status(503).json({ error:'حزمة web-push غير مثبّتة — أضفها إلى api/package.json' }); }
  webpush.setVapidDetails(k.subject, k.pub, k.priv);

  let targets = [];
  try { targets = await rpc('push_targets', { p_day: riyadhDay() }); }
  catch(e){ return res.status(500).json({ error:'تعذّر جلب المستهدفين: ' + e.message }); }
  if (!Array.isArray(targets)) targets = [];

  let sent = 0, skipped = 0, failed = 0, dead = 0;
  for (const t of targets){
    const msg = compose(t);
    if (!msg){ skipped++; continue; }
    try {
      await webpush.sendNotification(
        { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } },
        JSON.stringify(msg),
        { TTL: 12 * 3600 }             // إشعارُ الصباح لا يُسلَّم مساءً
      );
      sent++;
      await rpc('push_mark', { p_endpoint: t.endpoint, p_ok: true }).catch(() => {});
    } catch(e){
      /* 404/410 = الاشتراك مات (ألغى الطالب الإذن أو حذف الموقع) — يُحذف
         بعد ثلاث مرات لا فورًا: عطلٌ عابر في خادم Google لا يُفقد الطالب اشتراكه */
      const gone = e && (e.statusCode === 404 || e.statusCode === 410);
      if (gone) dead++; else failed++;
      await rpc('push_mark', { p_endpoint: t.endpoint, p_ok: false }).catch(() => {});
    }
  }
  return res.status(200).json({ ok:true, targets: targets.length, sent, skipped, failed, dead });
};

module.exports.compose = compose;
module.exports.riyadhDay = riyadhDay;
