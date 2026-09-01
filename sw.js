'use strict';
/*
  عامل الخدمة — الطبقة الثانية للعمل بلا إنترنت (الأولى: المحتوى في IndexedDB).
  المنصة ملف واحد، فالتخزين بسيط: نسخة من الصفحة تُقدَّم عند انقطاع الشبكة.
  لا يُسجَّل إلا على https — فتح file:// لا يمر من هنا أصلًا.
*/
const CACHE = 'qbank-v3';   /* ★ v3: جوّال علي بقي على نسخة قديمة رغم رفع الجديدة — الرقم الجديد يمحو كل كاش سابق */
const ASSETS = ['./', './index.html', './manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // نداءات Supabase وواجهة الخادم تمر للشبكة دائمًا — البيانات الحية لا تُخبَّأ هنا
  if (url.pathname.indexOf('/api/') === 0 || url.hostname.indexOf('supabase') !== -1) return;
  if (e.request.method !== 'GET') return;
  /*
    ★ التنقلات تتجاوز كاش HTTP نفسه (cache:'no-cache' = تحقّق من الخادم دائمًا).
    الدرس من جوّال علي: «الشبكة أولًا» وحدها قد تُجيب من كاش المتصفح القديم،
    فيعلق الجهاز على نسخة شهرها الماضي وهو «متصل». التحقق الشرطي رخيص
    (٣٠٤ بلا جسد) والعالق على نسخة قديمة غالٍ.
  */
  const req = e.request.mode === 'navigate'
    ? new Request(e.request, { cache: 'no-cache' })
    : e.request;
  e.respondWith(
    fetch(req)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then(m => m || caches.match('./index.html')))
  );
});
