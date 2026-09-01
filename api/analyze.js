'use strict';
/*
  /api/analyze — التحليل الشامل للمادة.

  يستقبل معرّف مادة، يجلب أسئلتها من القاعدة بنفسه (لا من المتصفح — حمولة
  المتصفح تُزوَّر، والقاعدة لا)، يناديها للذكاء ببرومبت علي، يتحقق، ثم يكتب
  النتيجة. من يطلبه: صاحب المادة أو المشرف — يُتحقق من الرمز لدى Supabase.

  يعمل للجميع بلا كوينز: نداءٌ واحد للمادة كلها، رخيص، وهو ما يجعل كل
  مادة على المنصة تخرج كاملة مثل مواد AMSU.
*/
const supa = require('./_lib/supa.js');
const { callAI } = require('./_lib/provider.js');
const A = require('./_lib/analyst.js');

module.exports = async function handler(req, res){
  if (req.method !== 'POST') return res.status(405).json({ error:'POST فقط' });
  try{
    const { subject_id, lang } = req.body || {};
    if (!subject_id) return res.status(400).json({ error:'أرسل subject_id' });

    // من يطلب؟ Supabase يتحقق من الرمز — نحن لا نفكّ JWT بأنفسنا
    const user = await supa.userFromToken(supa.bearer(req));
    if (!user) return res.status(401).json({ error:'سجّل دخولك أولًا' });

    // المادة وأسئلتها بمفتاح الخدمة
    const { url, key } = supa.creds();
    // المفتاح في الترويستين — apikey وحدها تُعامل anon فتحجب غير المنشور
    const H = { 'apikey': key, 'Authorization':'Bearer ' + key, 'Accept-Profile':'qbank' };
    const sres = await fetch(url + '/rest/v1/subjects?id=eq.' + encodeURIComponent(subject_id) +
      '&select=id,name,created_by', { headers: H });
    const sub = ((await sres.json()) || [])[0];
    if (!sub) return res.status(404).json({ error:'المادة غير موجودة' });

    /*
      ★ صاحب المادة أو المشرف — لا غير.
      التحليل يكتب في صفوف الجميع، وبابٌ مفتوح يعني أن أي طالب يعيد توليد
      تحليل مادة غيره فيغيّر ما يذاكر منه الآخرون.
    */
    const pres = await fetch(url + '/rest/v1/profiles?id=eq.' + user.id + '&select=is_admin',
      { headers: H });
    const prof = ((await pres.json()) || [])[0] || {};
    if (sub.created_by !== user.id && !prof.is_admin)
      return res.status(403).json({ error:'هذه ليست مادتك' });

    const qres = await fetch(url + '/rest/v1/questions?subject_id=eq.' +
      encodeURIComponent(subject_id) + '&select=id,q,options,answer&order=ord', { headers: H });
    const items = (await qres.json()) || [];
    if (!items.length) return res.status(400).json({ error:'المادة بلا أسئلة — لا شيء يُحلَّل' });

    /*
      نداء واحد للمادة كلها — هذه نقطة الميزة: البرومبت يحتاج أن يرى البنك
      كاملًا ليجد الفصول والتكرار والأفخاخ. الخرج كبير (جداول HTML) فنرفع
      السقف. temperature منخفضة موروثة من المحوّل.
    */
    const aiLang = lang === 'en' ? 'en' : 'ar';
    const r = await callAI(A.sysFor(aiLang), A.buildUserPayload(sub.name, items),
                           { expectObject: true, maxTokens: 32768 });
    const v = A.validateAnalysis(r.items, items);

    /*
      الكتابة: أعمدة المادة + محور كل سؤال.
      topics في subjects تبقى مصفوفة أسماء (شكلها التاريخي في المنصة)،
      ومحور السؤال يُكتب باسمه العربي — تبويب البنك يجمع عليه.
    */
    const patch = {
      overview: v.overview, memorize: v.memorize, mistakes: v.mistakes,
      name_en: v.name_en, analysis_lang: aiLang,
      analysis_notes: v.notes, analyzed_at: new Date().toISOString(),
      topics: v.topics.map(t => t.name)
    };
    const ures = await fetch(url + '/rest/v1/subjects?id=eq.' + encodeURIComponent(subject_id), {
      method:'PATCH',
      headers: Object.assign({ 'Content-Type':'application/json', 'Content-Profile':'qbank',
                               'Prefer':'return=minimal' }, H),
      body: JSON.stringify(patch)
    });
    if (!ures.ok) throw new Error('كتابة التحليل فشلت: ' + ures.status);

    // محور كل سؤال — تجميع حسب المفتاح ثم PATCH لكل مجموعة (نداءات قليلة)
    const byKey = {};
    items.forEach(q => { (byKey[v.assign[q.id]] = byKey[v.assign[q.id]] || []).push(q.id); });
    const nameOf = {}; v.topics.forEach(t => { nameOf[t.key] = t.name; });
    for (const k of Object.keys(byKey)){
      const tres = await fetch(url + '/rest/v1/questions?id=in.(' + byKey[k].join(',') + ')', {
        method:'PATCH',
        headers: Object.assign({ 'Content-Type':'application/json', 'Content-Profile':'qbank',
                                 'Prefer':'return=minimal' }, H),
        body: JSON.stringify({ topic: nameOf[k] })
      });
      if (!tres.ok) throw new Error('كتابة محاور الأسئلة فشلت: ' + tres.status);
    }

    return res.status(200).json({ ok:true, model: r.model, provider: r.provider,
      usage: r.usage, topics: v.topics.map(t => ({ name: t.name, n: v.counts[t.key] || 0 })),
      name_en: v.name_en, notes: v.notes || null });
  } catch(e){
    return res.status(e.status || 500).json({ error: e.message, kind: e.kind || 'other' });
  }
};
