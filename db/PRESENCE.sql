-- ═══════════════════════════════════════════════════════════════════
-- الحضور الحيّ: أين كلُّ طالبٍ الآن، وبأي جهاز، ومن أي بلد
-- ═══════════════════════════════════════════════════════════════════
-- كانت «المتصلون الآن» تقول من دخل خلال ربع ساعة ولا تقول ماذا يفعل.
-- وهذا نصفُ خبر: أن يكون عشرون طالبًا متصلين معلومةٌ لا تُبنى عليها
-- قرارات، أما أن يكون خمسةَ عشرَ منهم عالقين في صفحة الدخول فخبرٌ يُوقظك.
--
-- ═══ وحدودُ ما نجمعه مقصودة ═══
-- شاشاتُ التطبيق فقط: أي مسارٍ يفتحه واسمُ المادة إن كان فيها. لا نصوصَ
-- يكتبها، ولا إجاباتِه، ولا موقعًا جغرافيًا من الجهاز. والبلد من الحقل
-- الذي كتبه هو في ملفه أو من منطقته الزمنية — تقريبٌ يكفي للتشغيل ولا
-- يقترب من عنوانه. ونوع الجهاز صنفٌ من ثلاثة، لا بصمةٌ تُميّز جهازًا بعينه.

-- ═══ ١) أعمدة الحضور ═══
alter table qbank.devices
  add column if not exists place   text not null default '',  -- «في اختبار: علم السموم»
  add column if not exists kind    text not null default '',  -- ios | android | desktop
  add column if not exists country text not null default '';  -- SA, EG …

create index if not exists devices_seen_kind_idx on qbank.devices (last_seen desc);

-- ═══ ٢) نبضة تحمل الحال لا الوجود فقط ═══
/*
  التوقيع القديم `heartbeat(device_label text)` يبقى صالحًا: نُضيف وسائط
  لها قيم افتراضية، فالنسخة القديمة من الواجهة تظل تعمل بلا كسر حتى
  ينتشر البناء الجديد. تغييرُ توقيعِ دالةٍ حيّة يكسر كل من لم يُحدِّث بعد.
*/
create or replace function qbank.heartbeat(
  device_label text default '',
  p_place   text default '',
  p_kind    text default '',
  p_country text default ''
) returns void language plpgsql security definer set search_path = qbank, public as $$
declare
  lbl text := left(coalesce(device_label, ''), 60);
begin
  if auth.uid() is null then return; end if;

  -- جهاز واحد لكل (مستخدم، تسمية): نحدّث آخر ظهور بدل تكديس صفوف
  update qbank.devices
     set last_seen = now(),
         place   = left(coalesce(p_place, ''), 120),
         kind    = left(coalesce(p_kind, ''), 12),
         country = upper(left(coalesce(p_country, ''), 2))
   where user_id = auth.uid() and label = lbl;

  if not found then
    insert into qbank.devices (user_id, label, last_seen, place, kind, country)
    values (auth.uid(), lbl, now(),
            left(coalesce(p_place,''), 120),
            left(coalesce(p_kind,''), 12),
            upper(left(coalesce(p_country,''), 2)));
  end if;

  -- لا نُبقي أكثر من عشرة أجهزة للمستخدم الواحد
  delete from qbank.devices d
   where d.user_id = auth.uid()
     and d.id not in (select id from qbank.devices
                       where user_id = auth.uid()
                       order by last_seen desc limit 10);
end $$;
revoke all on function qbank.heartbeat(text, text, text, text) from public;
grant execute on function qbank.heartbeat(text, text, text, text) to authenticated;

-- ═══ ٣) «المتصلون الآن» تحمل الحال ═══
create or replace function qbank.admin_online()
returns jsonb language sql stable security definer set search_path = qbank, public as $$
  select case when not qbank.is_admin() then jsonb_build_object('error','admin only') else
  coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', nullif(btrim(p.name),''),
        'avatar', p.avatar, 'avatar_url', p.avatar_url,
        'email', u.email, 'last_seen', d.last_seen,
        'place', d.place, 'kind', d.kind,
        /* البلد من نبضة الجهاز، وإن غاب فمن جامعة الطالب — والملف أوثق
           من التخمين حين يوجد. */
        'country', coalesce(nullif(d.country,''), un.country, '')
      ) order by d.last_seen desc)
    from (
      select distinct on (user_id) user_id, last_seen, place, kind, country
        from qbank.devices
       where last_seen > now() - interval '15 minutes'
       order by user_id, last_seen desc
    ) d
    join qbank.profiles p on p.id = d.user_id
    join auth.users     u on u.id = d.user_id
    left join qbank.universities un on un.id = p.university_id
  ), '[]'::jsonb) end
$$;
revoke all on function qbank.admin_online() from public;
grant execute on function qbank.admin_online() to authenticated;

-- ═══ تحقّق ═══
select count(*) as أجهزة,
       count(*) filter (where place <> '') as بحالٍ_معلوم
  from qbank.devices;
