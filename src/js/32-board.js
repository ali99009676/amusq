/*
  لوحة المتصدرين — بيانات مجمّعة فقط من دالة board() في قاعدة البيانات:
  لا يرى طالب تفاصيل طالب آخر، فقط الاسم المعروض وأفضل نسبة.
*/
const ViewBoard = {
  title:'المتصدرون',
  view(){
    const body = el('div', { class:'stack' }, [ el('p', { class:'page__sub', text:'جارٍ الجلب…' }) ]);
    /*
      لوحة جامعتك فوق اللوحة العامة.
      ★ المقارنة داخل الجامعة هي المُحفِّزة: طالب نجران يقارن نفسه بزملائه
      في المقرّر نفسه، لا بمن يذاكر مادة أخرى في بلد آخر — والمقارنة
      الظالمة تُحبط ولا تُحفّز، فتُغلق اللوحة بدل أن تُفتح.
    */
    const campus = QBANK.community ? el('div', { class:'card stack' }, [
      el('h2', { style:'margin:0', text:'متصدّرو جامعتك' }),
      QBANK.community.boardBody()
    ]) : null;
    QBANK.api.rpc('board', { lim: 10 }).then(r => {
      if (!body.isConnected) return;
      body.innerHTML = '';
      if (!r.ok) { body.appendChild(QBANK.views.empty('🏆', 'تعذّر الجلب', r.offline ? 'المتصدرون يحتاجون اتصالًا.' : 'حاول لاحقًا.')); return; }
      if (r.data && r.data.disabled) { body.appendChild(QBANK.views.empty('🏆', 'اللوحة موقوفة', 'أوقفها المشرف مؤقتًا.')); return; }
      const rows = (r.data && r.data.rows) || [];
      body.appendChild(el('p', { class:'row' }, [
        el('span', { class:'badge badge--ok num', text:'● متواجد الآن: ' + ((r.data && r.data.online) || 0) })
      ]));
      if (!rows.length) { body.appendChild(QBANK.views.empty('🏆', 'لا نتائج بعد', 'أول اختبار تجريبي يفتح اللوحة.')); return; }
      body.appendChild(el('div', { class:'card stack' }, rows.map((row, i) => el('div', { class:'row' }, [
        el('span', { class:'badge num', text:'#' + (i + 1) }),
        el('span', { text: (row.avatar || '👤') + ' ' + row.name }),
        el('span', { class:'spacer' }),
        el('span', { class:'badge badge--ok num', text: row.best + '٪' }),
        el('span', { class:'badge num', text: row.attempts + ' اختبار' })
      ]))));
    });
    return QBANK.views.page('المتصدرون', 'أفضل النتائج — بأسماء العرض فقط.',
      [campus, el('h2', { text:'على مستوى المنصة' }), body]);
  }
};
QBANK.views.ViewBoard = ViewBoard;
