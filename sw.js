'use strict';
/*
  عامل الخدمة — الطبقة الثانية للعمل بلا إنترنت (الأولى: المحتوى في IndexedDB).
  المنصة ملف واحد، فالتخزين بسيط: نسخة من الصفحة تُقدَّم عند انقطاع الشبكة.
  لا يُسجَّل إلا على https — فتح file:// لا يمر من هنا أصلًا.
*/
const CACHE = 'qbank-v2';   /* رُفعت مع تغيير الهوية: يجبر المتصفح على جلب البناء الجديد لا الصفحة القديمة */
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
  // الصفحة: الشبكة أولًا (تحديثات فورية) والكاش عند الانقطاع
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then(m => m || caches.match('./index.html')))
  );
});
