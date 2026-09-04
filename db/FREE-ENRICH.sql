-- توليد المادة بالذكاء صار مجانيًا للجميع.
-- لماذا في الإعدادات لا في الكود؟ لأن هذا قرار تشغيلي قد ينقلب يومًا
-- (لو ثقلت الفاتورة) — والقرار التشغيلي يُدار بصفٍّ لا بنشرة جديدة.
-- الآلة نفسها باقية: المحفظة والحسم والردّ كلها في مكانها، ساكنةً عند صفر.
update qbank.settings set enrich_cost_per_q = 0, enrich_open = true where id = 1;
select enrich_cost_per_q, enrich_open from qbank.settings where id = 1;
