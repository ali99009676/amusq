-- ═══════════════════════════════════════════════════════════════════════
--  إصلاح PGRST002 بعد هجرة المخطط amusq ← qbank
--
--  الأعراض: كل نداء REST يرجع 503 مع
--  {"code":"PGRST002","message":"Could not query the database for the schema cache"}
--
--  السبب: إعدادات PostgREST محفوظة على دور authenticator نفسه، وما زالت
--  تشير إلى المخطط القديم amusq الذي لم يعد موجودًا بعد إعادة التسمية.
--  فيحاول بناء ذاكرة المخطط لشيء غير موجود ويفشل ويعيد المحاولة إلى الأبد.
--
--  ألصق الملف كاملًا في SQL Editor واضغط Run.
-- ═══════════════════════════════════════════════════════════════════════

-- ١ · اعرض ما هو مضبوط الآن (للتوثيق — انظر النتيجة قبل وبعد)
select rolname, coalesce(array_to_string(rolconfig, '  |  '), '(لا إعداد)') as current_config
  from pg_roles
 where rolname in ('authenticator', 'anon', 'authenticated');

-- ٢ · صلاحية الاستعمال على المخطط الجديد
--     دور اتصال PostgREST يحتاجها ليبني ذاكرة المخطط أصلًا
grant usage on schema qbank to authenticator, anon, authenticated, service_role;

-- ٣ · وجّه PostgREST إلى المخطط الجديد صراحةً
--     public تبقى في القائمة لأن امتدادات Supabase تسكن فيها
alter role authenticator set pgrst.db_schemas = 'qbank, public';

-- ٤ · وضمان أن المسار الإضافي سليم
alter role authenticator set pgrst.db_extra_search_path = 'public, extensions';

-- ٥ · أبلغه بالتغيير: الإعداد أولًا ثم المخطط
notify pgrst, 'reload config';
notify pgrst, 'reload schema';

-- ٦ · تأكيد
select rolname, array_to_string(rolconfig, '  |  ') as new_config
  from pg_roles where rolname = 'authenticator';
