/*
  ═══════════════════════════════════════════════════════════════════
  معاينة المادة من اللوحة — «هكذا يراها الطالب»
  ═══════════════════════════════════════════════════════════════════
  كان المشرف يفتح المادة من محرّرها: أسئلةٌ في صفوف وحقول — لا يعرف منها
  كيف تبدو للطالب فعلًا: الرأس، التبويبات، الشرح، ترتيب البنك. ولرؤيتها
  كان يغادر اللوحة إلى واجهة الطالب ثم يعود ويبحث عن المادة من جديد —
  ولا سبيل أصلًا لرؤية مادةٍ مخفية قبل نشرها.

  ★ الصفحة هي صفحة الطالب نفسها (renderSubject) لا نسخةً «تشبهها»: ما
  يراه المشرف هنا هو ما سيصل الطالب حرفًا بحرف. وفوقها شريطٌ واحد يقول
  إنها معاينة، ويحمل بابَي التحرير والعودة — فالمشرف يقرأ، يلمح خطأً،
  يضغط «حرّر»، يصلح، ويعود يعاين. دورةٌ كاملة بلا مغادرة اللوحة.
*/
function previewBar(sub){
  const N = QBANK.views.arNum;
  const by = el('span', { class:'badge', hidden:true });
  if (sub.created_by && QBANK.uploader)
    QBANK.uploader.nameOf(sub.created_by).then(n => { if (n && alive()){ by.textContent = 'رفعها ' + n; by.hidden = false; } });

  return el('div', { class:'card ad-preview-bar' }, [
    el('div', { class:'ad-preview-bar__x' }, [
      el('span', { class:'ad-preview-bar__eye', 'aria-hidden':'true' }, [ QBANK.ico('eye', { size:18 }) ]),
      el('span', { class:'ad-preview-bar__t', text:'معاينة — هكذا يراها الطالب' }),
      sub.published ? el('span', { class:'badge badge--ok', text:'منشورة' })
                    : el('span', { class:'badge badge--warn', text:'مخفية — لا يراها الطالب بعد' }),
      el('span', { class:'badge num', text: N(sub.q_count || 0) + ' سؤالًا' }),
      by
    ]),
    el('div', { class:'ad-preview-bar__acts' }, [
      el('a', { class:'btn btn--sm', href:'#/admin/subject/' + sub.id, text:'✎ حرّر المادة' }),
      /* «افتح كطالب» للمنشورة وحدها: المخفية ليست في قائمة الطالب أصلًا */
      sub.published ? el('a', { class:'btn btn--sm btn--ghost', href:'#/subject/' + sub.id, text:'افتح كطالب ↗' }) : null,
      el('a', { class:'btn btn--sm btn--ghost', href:'#/admin/ugc', text:'→ مواد الطلاب' })
    ])
  ]);
}

const ViewAdminPreview = {
  title:'معاينة المادة',
  view(route){
    if (!QBANK.api.user()) return QBANK.views.ViewAdminLogin.view();
    const id = route.rest[0];
    if (!id) return QBANK.views.ViewNotFound.view();

    const wrap = el('div', { class:'stack ad-preview' }, [ el('p', { class:'page__sub', text:'جارٍ الجلب…' }) ]);
    /* من القاعدة مباشرةً لا من قائمة المنشور: المخفية تُعاين قبل نشرها */
    QBANK.api.rest('subjects?id=eq.' + encodeURIComponent(id) + '&select=*').then(r => {
      if (!wrap.isConnected) return;
      const sub = (r.ok && r.data && r.data[0]) || null;
      wrap.innerHTML = '';
      if (!sub){
        wrap.appendChild(QBANK.views.empty('⚠', 'لم نجد المادة', 'ربما حُذفت، أو حسابك ليس مشرفًا.',
          el('a', { class:'btn', href:'#/admin/ugc', text:'→ مواد الطلاب' })));
        return;
      }
      wrap.appendChild(previewBar(sub));
      wrap.appendChild(QBANK.views.renderSubject(sub, route, {
        preview: true, base:'#/admin/preview/' + id, back:'#/admin/ugc', backLabel:'مواد الطلاب'
      }));
    });
    return wrap;
  }
};

/* المسار يُسجَّل هنا: الملف مستقلّ ولا يلمس 40-app */
QBANK.router.add('#/admin/preview', ViewAdminPreview);
QBANK.views.ViewAdminPreview = ViewAdminPreview;
QBANK.views.previewBar = previewBar;
