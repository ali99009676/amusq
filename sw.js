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
  if (url.pathname.indexOf('/api/') === 0 || url.hostname.indexOf('supabase') !== -1) return;
  if (e.request.method !== 'GET') return;
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

/*
  ═══ الإشعارات ═══
  الخادم يُرسل {title, body, url} موقّعًا بـVAPID، والمتصفح يوقظ هذا
  العامل ليعرضه — ولو كانت المنصة مغلقة.
*/
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch(err){ d = { title: e.data ? e.data.text() : 'مراجعة' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'مراجعة', {
    body: d.body || '',
    icon: './icon-192.png',
    badge: './icon-192.png',
    dir: 'rtl',
    lang: 'ar',
    tag: 'amusq-daily',
    data: { url: d.url || '#/' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || '#/';
  e.waitUntil(self.clients.matchAll({ type:'window', includeUncontrolled:true }).then(list => {
    for (const c of list){
      if ('focus' in c){ c.navigate ? c.navigate(target).catch(() => {}) : null; return c.focus(); }
    }
    return self.clients.openWindow(target);
  }));
});
