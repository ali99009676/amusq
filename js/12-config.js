/*
  الإعداد: رابط Supabase والمفتاح العام (anon) فقط.
  المفتاح العام مصمَّم ليكون في المتصفح — RLS هي الحماية الحقيقية.
  أما مفاتيح الخدمة والذكاء فلا تقترب من هذا الملف: مكانها متغيرات بيئة Vercel حصرًا.
*/
const Config = {
  KEY: 'config',
  get(){
    // الأولوية: ما حُقن وقت البناء (config.json) ثم ما حفظه المشرف في الجهاز
    const injected = (typeof window !== 'undefined' && window.QBANK_INJECTED_CONFIG) || null;
    return injected || QBANK.store.get(Config.KEY, null);
  },
  set(url, anonKey){
    if (!/^https:\/\//.test(url || '')) return { ok:false, err:'الرابط يجب أن يبدأ بـ https://' };
    if (!anonKey || anonKey.length < 20) return { ok:false, err:'المفتاح العام غير صحيح' };
    QBANK.store.set(Config.KEY, { url: url.replace(/\/+$/,''), anonKey });
    return { ok:true };
  },
  ready(){ const c = Config.get(); return !!(c && c.url && c.anonKey); }
};
QBANK.config = Config;
