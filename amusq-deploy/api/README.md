# دوال الخادم — Vercel /api
- `ingest.js` قراءة PDF/DOCX/TXT وتقسيم الأسئلة (الشكلان: خيارات A-D، وسؤال-ثم-إجابة).
- `ai.js` نداء Claude بدفعات ≤ ٢٥ سؤالًا، مع فرض قاعدة القداسة على الرد في `_lib/sanctity.js`.
- `verify.js` التحقق من المشتريات (المرحلة ٥).
متغيرات البيئة: `ANTHROPIC_API_KEY` · `AI_MODEL` · `SUPABASE_URL` · `SUPABASE_SERVICE_KEY`.
لا يصل أي مفتاح إلى المتصفح إطلاقًا.
