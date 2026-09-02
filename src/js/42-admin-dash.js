/*
  تبويب «اللوحة» — كل ما يحتاجه المشرف ليعرف حال المنصة في نظرة واحدة.
  نداء واحد إلى admin_dashboard يجلب كل شيء دفعةً واحدة: أرخص من ست نداءات،
  وأدق لأن الأرقام كلها من نفس اللحظة.
*/
function dashSkeleton(){
  return el('div', { class:'ad-kpis' }, [1,2,3,4,5,6].map(() =>
    el('div', { class:'ad-kpi' }, [ el('span', { class:'skel skel--line' }) ])));
}

function dashKpis(k){
  const C = QBANK.admin.charts;
  return el('div', { class:'ad-kpis' }, [
    C.kpi(k.students, 'طالبًا', k.active_7d + ' نشط هذا الأسبوع'),
    C.kpi(k.online, 'متصل الآن', 'آخر ٤ ساعات', k.online > 0 ? 'live' : null),
    C.kpi(k.attempts, 'اختبارًا', 'منذ الإطلاق'),
    C.kpi(k.avg_pct + '٪', 'متوسط النتائج', k.avg_pct >= 70 ? 'فوق حدّ النجاح' : 'تحت حدّ النجاح',
      k.avg_pct >= 70 ? 'live' : (k.avg_pct > 0 ? 'warn' : null)),
    C.kpi(k.questions, 'سؤالًا', k.derived + ' مشتق'),
    C.kpi(k.published + '/' + k.subjects, 'مادة منشورة', k.drafts ? k.drafts + ' مسوّدة معلّقة' : 'لا مسوّدات',
      k.drafts ? 'warn' : null)
  ]);
}

function dashPanel(title, sub, body, extraClass){
  return el('section', { class:'ad-panel' + (extraClass ? ' ' + extraClass : '') }, [
    el('div', { class:'ad-panel__h' }, [
      el('h2', { class:'ad-panel__t', text:title }),
      sub ? el('span', { class:'ad-panel__s', text:sub }) : null
    ]),
    body
  ]);
}

function dashSubjects(subjects){
  if (!subjects.length) return QBANK.views.empty('▤', 'لا مواد بعد', 'ارفع أول ملف أسئلة.');
  // الترتيب حسب المحاولات: المادة التي يدرسها الطلاب فعلًا تستحق الصدارة
  const rows = subjects.slice().sort((a, b) => Number(b.attempts) - Number(a.attempts));
  return el('div', { class:'ad-table' }, rows.map(s => {
    const row = el('button', { class:'ad-row', type:'button' }, [
      el('span', { text: s.icon || '▤' }),
      el('span', { class:'ad-row__main' }, [
        el('span', { class:'ad-row__t', text: s.name }),
        el('span', { class:'ad-row__s', text: s.q_count + ' سؤالًا · ' + s.students + ' مشترك' })
      ]),
      el('span', { class:'badge num', text: s.attempts + ' اختبار' }),
      el('span', { class:'badge num ' + (Number(s.avg_pct) >= 70 ? 'badge--ok' : Number(s.avg_pct) > 0 ? 'badge--warn' : ''),
        text: Math.round(s.avg_pct) + '٪' }),
      s.published ? el('span', { class:'badge badge--ok', text:'منشورة' }) : el('span', { class:'badge', text:'مخفية' })
    ]);
    row.addEventListener('click', () => QBANK.router.go('#/admin/subject/' + s.id));
    return row;
  }));
}

function dashRecent(recent){
  if (!recent.length) return QBANK.views.empty('◷', 'لا نشاط بعد', 'سيظهر هنا كل اختبار فور انتهائه.');
  const C = QBANK.admin.charts;
  return el('div', { class:'ad-feed' }, recent.map(a => el('div', { class:'ad-feed__i' }, [
    el('span', { class:'ad-feed__av', text: a.avatar || '👤' }),
    el('span', { class:'ad-feed__x' }, [
      el('span', { class:'ad-row__t', text: a.student }),
      el('span', { class:'ad-row__s', text: a.subject + ' · ' + a.correct + ' من ' + a.total })
    ]),
    el('span', { class:'badge num ' + (Number(a.pct) >= 70 ? 'badge--ok' : 'badge--warn'), text: Math.round(a.pct) + '٪' }),
    el('span', { class:'ad-feed__t', text: C.ago(a.created_at) })
  ])));
}

function adminDashTab(box){
  const C = QBANK.admin.charts;
  let days = QBANK.store.get('ad_days', 14);

  const rangeBar = el('div', { class:'ad-bar' },
    [7, 14, 30].map(d => {
      const b = el('button', { class:'btn btn--sm ' + (d === days ? '' : 'btn--ghost'), type:'button',
        text: d + ' يومًا' });
      b.addEventListener('click', () => { QBANK.store.set('ad_days', d); days = d; load(); });
      return b;
    }));
  const wrap = el('div', {});
  box.appendChild(rangeBar);
  box.appendChild(wrap);

  function load(){
    // نعيد بناء شريط المدى ليعكس الاختيار الجديد
    rangeBar.querySelectorAll('button').forEach((b, i) => {
      b.className = 'btn btn--sm ' + ([7,14,30][i] === days ? '' : 'btn--ghost');
    });
    wrap.innerHTML = '';
    wrap.appendChild(dashSkeleton());
    QBANK.api.rpc('admin_dashboard', { days }).then(r => {
      if (!wrap.isConnected) return;     // غادر المشرف قبل وصول الرد
      wrap.innerHTML = '';
      if (!r.ok || !r.data || r.data.error) {
        wrap.appendChild(QBANK.views.empty('⚠', 'تعذّر الجلب',
          r.offline ? 'لا اتصال بالإنترنت.'
                    : 'تأكد أن حسابك مشرف وأن ملف ADMIN-DASHBOARD.sql مُشغَّل على قاعدة البيانات.'));
        return;
      }
      const d = r.data;
      const total = (d.series || []).reduce((n, s) => n + Number(s.n), 0);
      wrap.appendChild(dashKpis(d.kpi));
      wrap.appendChild(el('div', { class:'ad-panels ad-panels--2' }, [
        dashPanel('النشاط اليومي', total + ' اختبارًا خلال ' + days + ' يومًا',
          C.chartActivity(d.series || [])),
        dashPanel('توزيع النتائج', 'الخط البرتقالي = متوسط النتيجة',
          C.chartBuckets(d.buckets || []))
      ]));
      wrap.appendChild(el('div', { class:'ad-panels' }, [
        dashPanel('أداء المواد', 'اضغط مادة لفتح محررها', dashSubjects(d.subjects || [])),
        dashPanel('آخر النشاط', null, dashRecent(d.recent || []))
      ]));
    });
  }
  load();
}

/*
  نُصدّر أجزاء اللوحة القديمة لا الشاشة وحدها.
  ★ اللوحة الجديدة تُضيف القمع والمال والتحذيرات، لكن «أداء المواد» و«آخر
  النشاط» و«توزيع النتائج» نافعة كما هي — واستبدال شاشة بأخرى يُلقي عملًا
  صحيحًا لا لعيب فيه بل لأنه قديم. فتُدمج بدل أن تُرمى.
*/
QBANK.admin.dashTab = adminDashTab;
QBANK.admin.dashParts = { dashKpis, dashPanel, dashSubjects, dashRecent, dashSkeleton };
QBANK.views.ADMIN_TABS.unshift({ id:'dash', label:'اللوحة', fill: adminDashTab });
