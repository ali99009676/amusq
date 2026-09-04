-- ═══════════════════════════════════════════════════════════════════
-- مخزن الملفات الكبيرة — uploads
-- ═══════════════════════════════════════════════════════════════════
-- لماذا؟ خادم Vercel يرفض جسم طلبٍ فوق ٤٫٥ ميغابايت بلا رسالة مفهومة،
-- فكان PDF من ثلاثين صفحة يسقط بصمت عند «اقرأ الملف». المتصفح يرفع الملف
-- الكبير إلى هذا المخزن مباشرةً (حدّه ٥٠ ميغابايت) ويرسل مساره للخادم،
-- والخادم يجلبه بمفتاح الخدمة ويقرؤه كما لو وصل في الجسم.
--
-- الحدود: خاصٌّ (لا رابط عام)، وكلُّ طالبٍ يكتب في مجلده هو فقط
-- (<uid>/...)، ولا يقرأ أحدٌ من المتصفح — القراءة للخادم وحده.
-- آمن التكرار.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('uploads', 'uploads', false, 52428800, null)
on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists "uploads_insert_own" on storage.objects;
create policy "uploads_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "uploads_update_own" on storage.objects;
create policy "uploads_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "uploads_delete_own" on storage.objects;
create policy "uploads_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);

-- لا سياسة select للطلاب عمدًا: الملف يُقرأ من الخادم بمفتاح الخدمة فقط.

-- ═══ تحقّق ═══
select id, public, file_size_limit from storage.buckets where id = 'uploads';
