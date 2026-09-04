/*
  قسم الجامعة — البيت الذي تنتمي إليه كل مادة.

  لماذا وُجد: الطالب يرفع مادته فتذهب إلى قائمة عامة تختلط فيها مقرّرات
  الجامعات. فلا يجد زميله ما رفعه، ولا تتراكم فائدة داخل الدفعة الواحدة.
  القسم يعطي كل جامعة صفحة ورابطًا يُشارَك في مجموعة الدفعة.

  والانتماء يُحفظ في حساب الطالب مرة واحدة، فيفتح المنصة على قسم جامعته
  لا على قائمة عامة، وتُملأ له خانات الجامعة والكلية تلقائيًا عند الرفع.
*/
const Campus = {
  KEY: 'campus',                 // نسخة محلية تُقرأ فورًا قبل وصول الخادم
  _loading: null,

  /* المخزَّن محليًا: يُستعمل للرسم الفوري، والخادم هو المرجع */
  cached(){ return QBANK.store.get(Campus.KEY, null); },

  remember(c){
    if (c && c.university_id) QBANK.store.set(Campus.KEY, c);
    else QBANK.store.remove(Campus.KEY);
    return c;
  },

  /* جلب من الخادم مع منع النداءات المتوازية — الشاشة الواحدة قد تطلبه مرتين */
  load(){
    if (!QBANK.api.user()) return Promise.resolve(null);
    if (Campus._loading) return Campus._loading;
    Campus._loading = QBANK.api.rpc('my_campus').then(r => {
      Campus._loading = null;
      if (r.ok && r.data && r.data.university_id) return Campus.remember(r.data);
      return null;
    }).catch(() => { Campus._loading = null; return null; });
    return Campus._loading;
  },

  save(country, university, college){
    return QBANK.api.rpc('set_my_campus', {
      p_country: country || '', p_university: university || '', p_college: college || ''
    }).then(r => {
      if (!r.ok || !r.data) return null;
      // ★ نمسح المخزَّن عند المسح لا نُبقي القديم — وإلا رأى الطالب جامعة تركها
      return r.data.university_id ? Campus.remember(r.data) : (QBANK.store.remove(Campus.KEY), null);
    });
  },

  href(id){ return '#/u/' + id; }
};

/* ═══ منتقي الجامعة والكلية ═══
   لا قائمة منسدلة مغلقة: الطالب الأول في جامعته لن يجدها فيها. فحقل حر
   مع اقتراحات — يختار الموجود أو يكتب الجديد، والخادم يوحّد الإملاء. */
function campusPicker(current, onSaved){
  const cur = current || {};
  const box = el('div', { class:'campus-pick' });
  const msg = el('p', { class:'field__hint', role:'status', style:'margin:0' });

  const countrySel = el('select', { class:'input', 'aria-label':'الدولة' });
  const COUNTRIES = QBANK.explore && QBANK.explore.countryName ? [
    'SA','EG','JO','AE','KW','QA','BH','OM','IQ','MA','DZ','TN','SD','YE','LY','SY','LB','PS'
  ] : ['SA'];
  countrySel.appendChild(el('option', { value:'', text:'اختر الدولة' }));
  COUNTRIES.forEach(c => countrySel.appendChild(el('option', {
    value:c, text: QBANK.explore ? QBANK.explore.countryName(c) : c,
    selected: c === cur.country ? 'selected' : null })));
  if (cur.country) countrySel.value = cur.country;

  const uniList = el('datalist', { id:'campusUniList' });
  const uniIn = el('input', { class:'input', value: cur.university || '', list:'campusUniList',
    placeholder:'اكتب اسم جامعتك — أو اخترها من الاقتراحات', 'aria-label':'الجامعة' });

  const colList = el('datalist', { id:'campusColList' });
  const colIn = el('input', { class:'input', value: cur.college || '', list:'campusColList',
    placeholder:'مثال: كلية الهندسة', 'aria-label':'الكلية' });

  /* الاقتراحات تتبع الدولة: قائمة ٣٥ جامعة كاملة تُربك، وقائمة دولته تُفيد */
  function fillUniversities(){
    QBANK.api.rpc('list_universities', { q:'', p_country: countrySel.value || '' }).then(r => {
      if (!uniList.isConnected) return;
      uniList.innerHTML = '';
      (r.ok && Array.isArray(r.data) ? r.data : []).forEach(u =>
        uniList.appendChild(el('option', { value: u.name })));
    });
  }
  function fillColleges(){
    const c = Campus.cached();
    if (!c || !c.university_id) return;
    QBANK.api.rpc('list_colleges', { p_university: c.university_id }).then(r => {
      if (!colList.isConnected) return;
      colList.innerHTML = '';
      (r.ok && Array.isArray(r.data) ? r.data : []).forEach(x =>
        colList.appendChild(el('option', { value: x.name })));
    });
  }
  countrySel.addEventListener('change', fillUniversities);

  const save = el('button', { class:'btn', type:'button', text:'احفظ جامعتي' });
  save.addEventListener('click', () => {
    if (!countrySel.value || !uniIn.value.trim()){
      msg.className = 'field__hint is-bad';
      msg.textContent = 'اختر الدولة واكتب اسم الجامعة.';
      return;
    }
    save.disabled = true; msg.className = 'field__hint'; msg.textContent = 'جارٍ الحفظ…';
    Campus.save(countrySel.value, uniIn.value.trim(), colIn.value.trim()).then(c => {
      save.disabled = false;
      if (!c){ msg.className = 'field__hint is-bad'; msg.textContent = 'تعذّر الحفظ — تأكد من الاتصال.'; return; }
      msg.className = 'field__hint is-ok';
      msg.textContent = 'حُفظت: ' + c.university + (c.college ? ' · ' + c.college : '');
      fillColleges();
      if (typeof onSaved === 'function') onSaved(c);
    });
  });

  const clear = el('button', { class:'btn btn--ghost btn--sm', type:'button', text:'أزل الانتماء' });
  clear.addEventListener('click', () => {
    Campus.save('', '', '').then(() => {
      countrySel.value = ''; uniIn.value = ''; colIn.value = '';
      msg.className = 'field__hint'; msg.textContent = 'أُزيل الانتماء.';
      if (typeof onSaved === 'function') onSaved(null);
    });
  });

  box.appendChild(el('div', { class:'campus-pick__row' }, [
    el('label', { class:'field' }, [ el('span', { class:'field__label', text:'الدولة' }), countrySel ]),
    el('label', { class:'field' }, [ el('span', { class:'field__label', text:'الجامعة' }), uniIn ]),
    el('label', { class:'field' }, [ el('span', { class:'field__label', text:'الكلية (اختياري)' }), colIn ])
  ]));
  box.appendChild(uniList); box.appendChild(colList);
  box.appendChild(el('div', { class:'row', style:'gap:8px;margin-top:12px' }, [save, cur.university_id ? clear : null]));
  box.appendChild(msg);

  fillUniversities(); fillColleges();
  return box;
}

/* ═══ صفحة القسم ═══ */
function uniSubjectCard(r){
  const color = QBANK.views.subjectColor(r.color);
  return el('a', { class:'excard', href:'#s/' + (r.slug || ''), 'data-id': r.id, style:'--acc:' + color }, [
    el('span', { class:'excard__head' }, [
      el('span', { class:'excard__ico', 'aria-hidden':'true' }, [ QBANK.subjIcon(r.icon, 24) ]),
      el('span', { class:'excard__x' }, [
        el('span', { class:'excard__t', text: r.name }),
        r.name_en ? el('span', { class:'excard__en ltr', text: r.name_en }) : null
      ])
    ]),
    r.descr ? el('span', { class:'excard__d', text: r.descr }) : null,
    el('span', { class:'excard__meta' }, [
      el('span', { class:'badge num', text: (r.q_count || 0) + ' سؤالًا' }),
      Number(r.students) > 0 ? el('span', { class:'badge num', text: r.students + ' مشترك' }) : null,
      r.course_code ? el('span', { class:'badge', text: r.course_code }) : null,
      r.free ? el('span', { class:'badge badge--ok', text:'مجانية' })
             : (r.price ? el('span', { class:'badge num', text: r.price + ' ريال' }) : null)
    ])
  ]);
}

/*
  المواد مجموعة تحت كلياتها. الترتيب داخل المجموعة بالأكثر اشتراكًا،
  والكلية الأكبر أولًا — فيجد الطالب كليته في أعلى الصفحة غالبًا.
  و«مواد بلا كلية» تنزل آخرًا لا تُخفى: صاحبها لم يحدّد كليته وقد تكون
  مادة زميلك، فإخفاؤها خسارة صامتة.
*/
function groupByCollege(subjects, colleges){
  const groups = [];
  const byId = {};
  (colleges || []).forEach(c => {
    const g = { id:c.id, name:c.name, items:[] };
    byId[c.id] = g; groups.push(g);
  });
  const orphan = { id:null, name:'مواد بلا كلية محدَّدة', items:[] };
  (subjects || []).forEach(s => {
    const g = s.college_id && byId[s.college_id] ? byId[s.college_id] : orphan;
    g.items.push(s);
  });
  const out = groups.filter(g => g.items.length);
  if (orphan.items.length) out.push(orphan);
  return out;
}

function ViewUniversityRender(route){
  const id = (route.rest && route.rest[0]) || '';
  const wrap = el('div');

  if (!id) return QBANK.views.page('قسم الجامعة', null, [
    QBANK.views.empty('⌕', 'لم تُحدَّد جامعة', 'افتح «استكشف» واختر جامعتك من المرشّحات.',
      el('a', { class:'btn', href:'#/explore', text:'استكشف' }))
  ]);

  const body = el('div');
  body.appendChild(el('p', { class:'page__sub', text:'جارٍ التحميل…' }));
  const head = el('div');
  wrap.appendChild(head); wrap.appendChild(body);

  QBANK.api.rpc('university_page', { p_uni: id }).then(r => {
    if (!body.isConnected) return;
    body.innerHTML = ''; head.innerHTML = '';

    if (!r.ok || !r.data || r.data.ok === false){
      body.appendChild(QBANK.views.empty('⚠', 'لم نجد هذه الجامعة',
        'قد يكون الرابط قديمًا. ابحث عنها في «استكشف».',
        el('a', { class:'btn', href:'#/explore', text:'استكشف' })));
      return;
    }

    const d = r.data;
    const u = d.university;
    const cname = QBANK.explore ? QBANK.explore.countryName(u.country) : u.country;

    head.appendChild(el('header', { class:'uni-head' }, [
      el('div', { class:'uni-head__x' }, [
        el('h1', { class:'uni-head__t' }, [
          u.name,
          u.verified ? el('span', { class:'badge badge--ok', text:'موثّقة' }) : null
        ]),
        el('p', { class:'uni-head__s', text: cname + (u.city ? ' · ' + u.city : '') +
          ' · ' + QBANK.views.arNum(d.total) + ' بنك أسئلة' })
      ]),
      // ★ الرابط هو الميزة: قسمٌ لا يُشارَك لا يجمع دفعة
      (function(){
        const b = el('button', { class:'btn btn--soft btn--sm', type:'button', text:'انسخ رابط القسم' });
        b.addEventListener('click', () => {
          const url = location.href.split('#')[0] + Campus.href(u.id);
          const done = () => { b.textContent = '✓ نُسخ'; setTimeout(() => { b.textContent = 'انسخ رابط القسم'; }, 1800); };
          if (navigator.clipboard && navigator.clipboard.writeText)
            navigator.clipboard.writeText(url).then(done, done);
          else done();
        });
        return b;
      })()
    ]));

    if (!d.subjects.length){
      body.appendChild(QBANK.views.empty('▤', 'لا بنوك في هذه الجامعة بعد',
        'كن أنت أول من يرفع — بنكك سيظهر هنا لكل زملائك فور نشره.',
        el('a', { class:'btn', href:'#/upload', text:'⇪ ارفع أول مادة' })));
      return;
    }

    groupByCollege(d.subjects, d.colleges).forEach(g => {
      body.appendChild(el('h2', { class:'uni-col' }, [
        g.name,
        el('span', { class:'uni-col__n num', text: QBANK.views.arNum(g.items.length) })
      ]));
      body.appendChild(el('div', { class:'ex-grid' }, g.items.map(uniSubjectCard)));
    });

    if (d.total > d.subjects.length)
      body.appendChild(el('p', { class:'lp-note' }, [
        'معروض ' + QBANK.views.arNum(d.subjects.length) + ' من ' + QBANK.views.arNum(d.total) + ' — ',
        el('a', { href:'#/explore?uni=' + u.id, text:'اعرض البقية في استكشف' }), '.'
      ]));
  });

  return QBANK.views.page('قسم الجامعة', null, [wrap]);
}

const ViewUniversity = { title:'قسم الجامعة', view: ViewUniversityRender };

QBANK.campus = Campus;
QBANK.campus.picker = campusPicker;
QBANK.campus.groupByCollege = groupByCollege;
QBANK.views.ViewUniversity = ViewUniversity;
