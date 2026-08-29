# قاعدة البيانات — Supabase / Postgres
تُبنى في المرحلة ١. الجداول المخططة: profiles · progress · attempts · enrollments ·
subjects · questions · drafts · devices · entitlements.
صلاحيات RLS إلزامية على كل جدول، والمشرف يقرأ عبر is_admin() بـ security definer.
