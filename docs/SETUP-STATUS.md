# AMUSQ — حالة الإعداد الحي ✅ مكتمل

آخر تحقق: ٢٩ أغسطس ٢٠٢٦ · مشروع Supabase: `gbgjadqwqzxxyhydlgtj`

## كل شيء يعمل — تحقق حي لا ادّعاء
| البند | الدليل |
|---|---|
| مخطط `amusq` مستقل بجداوله العشرة | ✅ |
| RLS على كل الجداول + `amusq.is_admin()` | ✅ |
| دوال RPC العشر | ✅ `content_pack()` ترد فعليًا |
| ترقية `stop.shankl@gmail.com` مشرفًا عند أول دخول | ✅ مدمجة في trigger |
| Data API على مخطط amusq فقط | ✅ |
| المنصة تبدأ فارغة (لا محتوى مدمج) | ✅ `subjects: []` |
| **عزل نظام المحاماة القائم** | ✅ `clients` غير موجود عبر REST |
| الدخول بالبريد (رابط سحري) | ✅ مفعّل |
| الربط محقون في index.html | ✅ |

رد `content_pack()` الحي:
```json
{"settings":{"welcome_text":"","board_enabled":true},"subjects":[],"fetched_at":"2026-08-29T19:41:12Z"}
```

## ابدأ الآن
1. افتح `index.html` (نقرة مزدوجة).
2. «دخول» ← اكتب `stop.shankl@gmail.com` ← «أرسل رابط الدخول».
3. افتح بريدك واضغط الرابط ← تدخل **مشرفًا** تلقائيًا.
4. `#/admin` ← تبويب **المحتوى** ← «ارفع ملف أسئلة جديدًا».

## ما يحتاج خطوة إضافية منك لاحقًا
- **رفع الأسئلة بالذكاء** يحتاج نشر دوال `api/` على Vercel + متغير `ANTHROPIC_API_KEY` (دليل `docs/DEPLOY.md`). بقية المنصة تعمل الآن بلا Vercel.
- بريد Supabase المدمج محدود جدًا — للإنتاج اربط Resend أو Brevo من Authentication ► SMTP.
- Google/Apple للدخول: يُفعّلان من Authentication ► Providers عند جاهزية الحسابات.
