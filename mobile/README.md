# مراجعة — تطبيق آيفون (وأندرويد لاحقًا)

الغلاف الأصلي حول `index.html` المبني نفسه. لا نسخة ثانية من الكود: ما يُفحص على الويب هو ما يصل الطالب في التطبيق.

## كيف يعمل
- `../index.html` يُبنى بـ `node src/build.js` ثم يُنسخ إلى `www/` بـ `node prepare.js`.
- داخل التطبيق يوجد جسر Capacitor (`window.Capacitor`) يحقنه النظام؛ الطبقة `src/js/76-native.js` تكتشفه وتفعّل: الدخول عبر Safari والعودة بالرابط العميق `muraja://auth`، عنوان الخادم `https://amsuq.alsoqoor.com`، الاهتزاز، ورقة المشاركة، شريط الحالة، شاشة البداية. بدون الجسر (المتصفح) لا يتغيّر شيء.
- الأيقونات وشاشة البداية في `assets/` وتُولَّد لكل المقاسات في البناء.
- الهوية: `com.alsoqoor.muraja` · الفريق `327HJYMMD2` · الاسم الظاهر «مراجعة».

## البناء والرفع إلى TestFlight (بلا ماك)
`.github/workflows/ios.yml` يبني على macOS في GitHub ويرفع إلى App Store Connect بالتوقيع السحابي.

### ما يلزم مرةً واحدة
1. **مفتاح App Store Connect API**: App Store Connect → Users and Access → Integrations → App Store Connect API → **Team Keys** → Generate. الاسم: `GitHub Actions`، الدور: **Admin** (التوقيع السحابي يحتاج إنشاء شهادات). نزّل ملف `.p8` (مرة واحدة) وسجّل **Key ID** و**Issuer ID**.
2. **أسرار GitHub**: المستودع → Settings → Secrets and variables → Actions → New repository secret:
   - `ASC_KEY_ID` — معرّف المفتاح
   - `ASC_ISSUER_ID` — Issuer ID
   - `ASC_API_KEY_P8` — محتوى ملف `.p8` كاملًا كما هو (بسطوره الثلاثة: BEGIN/المفتاح/END)
3. **سجلّ التطبيق** — أُنشئ: «مراجعة — بنك الأسئلة» (Apple ID 6808816713، SKU `muraja-ios`، Bundle `com.alsoqoor.muraja`).
4. **الرابط العميق في Supabase** — أُضيف: `muraja://auth` في Redirect URLs.

### التشغيل
GitHub → Actions → **iOS · TestFlight** → Run workflow (رقم الإصدار مثل `1.0.0`). بعد ١٥–٢٥ دقيقة يظهر البناء في App Store Connect → TestFlight، ويُرسل لمختبِريك.

## محليًا على ماك (اختياري)
```
cd mobile && npm install
node ../src/build.js && node prepare.js
npx cap add ios && npx cap sync ios && node ios-patch.js
npx capacitor-assets generate --ios
npx cap open ios
```

## ملاحظات المراجعة (أبل)
- 4.2 الحدّ الأدنى من الوظائف: التطبيق يعمل بلا إنترنت (الأسئلة تُخزَّن في الجهاز)، فيه اهتزاز، مشاركة أصلية، شريط حالة يتبع الوضع — ليس موقعًا في غلاف.
- 4.8 الدخول بحساب آبل مفعَّل لأن الدخول بجوجل وجِتهَب موجودان.
- 5.1.1(v) حذف الحساب من داخل التطبيق: حسابي ← الحساب ← حذف الحساب.
- 3.1.1 الإصدار الأول مجاني بلا شراء داخل التطبيق: داخل التطبيق لا يُعرض شراء ولا رابط دفع خارجي (`QBANK_NATIVE_APP`).
- سياسة الخصوصية: `https://amsuq.alsoqoor.com/#/privacy`
