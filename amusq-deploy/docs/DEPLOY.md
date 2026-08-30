# نشر AMUSQ — من الصفر إلى منصة تعمل

## ١) Supabase (قاعدة البيانات والحسابات)
1. أنشئ مشروعًا في <https://supabase.com> (الخطة المجانية تكفي البداية).
2. من SQL Editor نفّذ بالترتيب: `db/schema.sql` ثم `db/policies.sql` ثم `db/functions.sql`.
3. من Authentication ► Providers فعّل Email (رابط سحري)، وأضف Google وApple عند جاهزيتهما.
4. سجّل حسابك أول مرة من المنصة، ثم في SQL Editor:
   `update public.profiles set is_admin = true where id = (select id from auth.users where email = 'بريدك');`
5. انسخ Project URL و anon key من Settings ► API.

## ٢) Vercel (الاستضافة ودوال الخادم)
1. ارفع المشروع إلى GitHub ثم استورده في <https://vercel.com>.
2. Environment Variables:
   - `ANTHROPIC_API_KEY` — مفتاح الذكاء (للوحة فقط)
   - `AI_MODEL` — مثل `claude-sonnet-4-5`
   - `SUPABASE_URL` و `SUPABASE_SERVICE_KEY` — لدالة verify (المرحلة ٥)
   - `PAYMENT_API_KEY` — مفتاح بوابة الدفع عند تفعيلها
3. أمر البناء: `node src/build.js` — الناتج `index.html` في الجذر.

## ٣) الربط الأول
افتح المنصة ► `#/admin/settings` ► ألصق رابط Supabase والمفتاح العام واحفظ.
(يُحفظ في جهاز المشرف، ويمكن بدلًا من ذلك حقنه وقت البناء بملف config.json.)

## ٤) مزود البريد
بريد Supabase المدمج للتجربة فقط (محدود جدًا). للإنتاج: Resend أو Brevo —
من Authentication ► SMTP Settings ألصق بيانات المزود.

## ٥) PWA والتطبيقات
- المنصة تعمل PWA تلقائيًا على https (المانيفست + عامل الخدمة مرفقان).
  أضف أيقونتي `icon-192.png` و `icon-512.png` في الجذر.
- التطبيقات الأصلية (المرحلة ٦ ب): Capacitor فوق نفس الملف مع مزايا أصلية
  (إشعارات، مشتريات داخل التطبيق). تذكّر: ممنوع إحالة الطالب للموقع للدفع من داخل التطبيق.

## اختبار سريع بعد النشر
- افتح المنصة من متصفح خاص: تظهر المادة المجانية للزائر.
- سجّل ببريد: يصلك الرابط السحري ويعمل الدخول.
- ارفع ملف تجريبيًا من اللوحة: اقرأ ← ذكاء ← راجع ← انشر.
- افصل الإنترنت وأعد الفتح: المنصة تعمل والمحتوى المفتوح سابقًا حاضر.
