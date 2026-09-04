/*
  تبويب «مواد الطلاب» — الرقابة والتسعير.
  المشرف لا يحرّر محتوى الطالب من هنا (لذلك محرر المادة)؛ ما يفعله هو
  تحديد السعر، والإيقاف عند المخالفة، ورؤية ما بيع وكم كوينز مُنح.
*/
function ugcRow(u, refresh){
  const priceIn = el('input', { class:'input input--sm', type:'number', min:'0', max:'5000',
    value: String(u.price || 0), 'aria-label':'سعر ' + u.name, style:'max-width:110px' });
  const savePrice = el('button', { class:'btn btn--sm', type:'button', text:'احفظ السعر' });
  savePrice.addEventListener('click', async () => {
    const v = Math.min(5000, Math.max(0, parseInt(priceIn.value || '0', 10) || 0));
    priceIn.value = String(v);
    const r = await QBANK.api.rest('subjects?id=eq.' + u.id,
      { method:'PATCH', body: JSON.stringify({ price: v }) });
    QBANK.toast(r.ok ? 'حُفظ السعر' : 'تعذّر الحفظ');
  });

  const on = u.status === 'published';
  const susp = el('button', { class:'btn btn--sm ' + (on ? 'btn--ghost' : ''), type:'button',
    text: on ? 'أوقف المادة' : 'أعِد تفعيلها' });
  susp.addEventListener('click', async () => {
    const r = await QBANK.api.rest('subjects?id=eq.' + u.id,
      { method:'PATCH', body: JSON.stringify({ status: on ? 'suspended' : 'published' }) });
    QBANK.toast(r.ok ? (on ? 'أُوقفت المادة' : 'أُعيد تفعيلها') : 'تعذّر التعديل');
    if (r.ok && refresh) refresh();
  });

  // الحذف بتأكيدين — يمحو المادة وأسئلتها بالتتابع (on delete cascade)
  const del = el('button', { class:'btn btn--sm btn--ghost', type:'button', text:'احذف' });
  let armed = false;
  del.addEventListener('click', async () => {
    if (!armed){ armed = true; del.textContent = 'اضغط ثانيةً — حذف نهائي'; del.className = 'btn btn--sm btn--danger'; return; }
    const r = await QBANK.api.rest('subjects?id=eq.' + u.id, { method:'DELETE' });
    QBANK.toast(r.ok ? 'حُذفت المادة' : 'تعذّر الحذف');
    if (r.ok && refresh) refresh();
  });

  return el('div', { class:'card stack' }, [
    el('div', { class:'row' }, [
      el('span', { class:'ad-row__main' }, [
        el('span', { class:'ad-row__t', text: u.name }),
        el('span', { class:'ad-row__s', text:'رفعها ' + u.creator_name + ' · ' + (u.q_count || 0) + ' سؤالًا' })
      ]),
      el('span', { class:'modetag modetag--' + (u.sanctity_mode || 'strict'),
        text: u.sanctity_mode === 'enhanced' ? 'صياغة محسَّنة' : 'نص حرفي' }),
      on ? el('span', { class:'badge badge--ok', text:'فعّالة' })
         : el('span', { class:'badge badge--bad', text:'موقوفة' })
    ]),
    el('div', { class:'row' }, [
      el('span', { class:'badge num', text: u.sales + ' بيعة' }),
      el('span', { class:'badge num', text: u.coins + ' كوين' }),
      el('span', { class:'badge num', text: u.attempts + ' اختبار' }),
      u.slug ? el('a', { class:'badge', href:'#s/' + u.slug, text:'الرابط' }) : null
    ]),
    el('div', { class:'ad-bar', style:'margin:0' }, [
      priceIn, savePrice,
      /* ★ «معاينة» قبل «حرّر»: المشرف يرى المادة كما يراها الطالب من داخل اللوحة، ثم يقرّر */
      el('a', { class:'btn btn--sm btn--soft', href:'#/admin/preview/' + u.id, 'aria-label':'عاين ' + u.name },
        [ QBANK.ico('eye', { size:14 }), ' معاينة' ]),
      el('a', { class:'btn btn--sm btn--soft', href:'#/admin/subject/' + u.id, text:'حرّر' }),
      el('span', { class:'spacer' }), susp, del
    ])
  ]);
}

function adminUgcTab(box){
  box.appendChild(el('p', { class:'page__sub', text:'جارٍ الجلب…' }));
  function load(){
    QBANK.api.rpc('admin_ugc').then(r => {
      if (!box.isConnected) return;
      box.innerHTML = '';
      if (!r.ok || !r.data || r.data.error){
        box.appendChild(QBANK.views.empty('⚠', 'تعذّر الجلب',
          'تأكد أن حسابك مشرف وأن ملف UGC-COINS.sql مُشغَّل على القاعدة.'));
        return;
      }
      const rows = Array.isArray(r.data) ? r.data : [];
      if (!rows.length){
        box.appendChild(QBANK.views.empty('⇪', 'لا مواد من الطلاب بعد',
          'حين يرفع طالب بنك أسئلته سيظهر هنا لتسعّره أو توقفه.'));
        return;
      }
      const unpriced = rows.filter(x => !x.price).length;
      box.appendChild(el('div', { class:'ad-kpis' }, [
        QBANK.admin.charts.kpi(rows.length, 'مادة من الطلاب', ''),
        QBANK.admin.charts.kpi(rows.reduce((n, x) => n + Number(x.sales), 0), 'عملية بيع', ''),
        QBANK.admin.charts.kpi(rows.reduce((n, x) => n + Number(x.coins), 0), 'كوين مُنحت', ''),
        QBANK.admin.charts.kpi(unpriced, 'بلا سعر', unpriced ? 'تحتاج تسعيرًا' : 'الكل مسعَّر',
          unpriced ? 'warn' : null)
      ]));
      rows.forEach(u => box.appendChild(ugcRow(u, load)));
    });
  }
  load();
}

QBANK.admin.ugcTab = adminUgcTab;
QBANK.views.ADMIN_TABS.splice(2, 0, { id:'ugc', label:'مواد الطلاب', fill: adminUgcTab });
