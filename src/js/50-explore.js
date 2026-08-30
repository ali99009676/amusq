/*
  الاستكشاف — الشاشة التي تجعل المنصة عربية لا جامعية.

  كل شيء هنا يحدث في الخادم: البحث والتصفية والترتيب والترقيم. السبب أن
  جلب كل المواد ثم تصفيتها في المتصفح يعمل مع خمس مواد وينهار مع خمسة آلاف،
  ويستهلك باقة الطالب في شيء لن يقرأه.

  والحالة كلها في الرابط (#/explore?q=…&country=…): يشاركه الطالب مع زميله
  فيفتح نفس النتيجة، ويرجع بزرّ الرجوع فيجد ما كان يتصفّح لا الصفحة الأولى.
*/
const COUNTRIES = {
  SA:'السعودية', EG:'مصر', JO:'الأردن', AE:'الإمارات', KW:'الكويت', QA:'قطر',
  BH:'البحرين', OM:'عُمان', IQ:'العراق', MA:'المغرب', DZ:'الجزائر', TN:'تونس',
  SD:'السودان', YE:'اليمن', LY:'ليبيا', SY:'سوريا', LB:'لبنان', PS:'فلسطين'
};
const countryName = c => COUNTRIES[c] || c;

const Explore = {
  PAGE: 24,
  KEY: 'explore_last',      // آخر اختيار للطالب — يعود إليه بلا إعادة ضبط

  /* الحالة من الرابط أولًا، ثم من آخر زيارة، ثم الافتراضي */
  stateFrom(query){
    const saved = QBANK.store.get(Explore.KEY, {}) || {};
    const has = k => query && Object.prototype.hasOwnProperty.call(query, k);
    return {
      q:       has('q')       ? query.q       : '',
      country: has('country') ? query.country : (saved.country || ''),
      uni:     has('uni')     ? query.uni     : (saved.uni || ''),
      col:     has('col')     ? query.col     : (saved.col || ''),
      sort:    has('sort')    ? query.sort    : (saved.sort || 'popular'),
      page:    has('page')    ? Math.max(0, parseInt(query.page, 10) || 0) : 0
    };
  },
  toHash(st){
    const p = [];
    if (st.q)       p.push('q=' + encodeURIComponent(st.q));
    if (st.country) p.push('country=' + st.country);
    if (st.uni)     p.push('uni=' + st.uni);
    if (st.col)     p.push('col=' + st.col);
    if (st.sort && st.sort !== 'popular') p.push('sort=' + st.sort);
    if (st.page)    p.push('page=' + st.page);
    return '#/explore' + (p.length ? '?' + p.join('&') : '');
  },
  remember(st){
    QBANK.store.set(Explore.KEY, { country: st.country, uni: st.uni, col: st.col, sort: st.sort });
  },

  search(st){
    return QBANK.api.rpc('browse_subjects', {
      q: st.q || '', p_country: st.country || '', p_university: st.uni || null,
      p_college: st.col || null, p_sort: st.sort || 'popular',
      p_page: st.page || 0, p_size: Explore.PAGE
    });
  },
  filters(st){
    return QBANK.api.rpc('catalog_filters', {
      p_country: st.country || '', p_university: st.uni || null
    });
  }
};

/* بطاقة مادة في نتائج البحث — تختلف عن بطاقة «موادي»:
   هنا الطالب لا يملكها بعد، فنُظهر أين تُدرَّس وكم سعرها لا تقدّمه فيها */
function exCard(r){
  const color = QBANK.views.subjectColor(r.color);
  const card = el('a', { class:'excard', href:'#s/' + (r.slug || '') , 'data-id': r.id }, [
    el('span', { class:'excard__bar', style:'background:' + color, 'aria-hidden':'true' }),
    el('span', { class:'excard__head' }, [
      el('span', { class:'excard__ico', 'aria-hidden':'true', text: r.icon || '▤' }),
      el('span', { class:'excard__t', text: r.name })
    ]),
    r.university ? el('span', { class:'excard__where',
      text: r.university + (r.college ? ' · ' + r.college : '') }) : null,
    r.descr ? el('span', { class:'excard__d', text: r.descr }) : null,
    el('span', { class:'excard__meta' }, [
      el('span', { class:'badge num', text: (r.q_count || 0) + ' سؤالًا' }),
      Number(r.students) > 0 ? el('span', { class:'badge num', text: r.students + ' مشترك' }) : null,
      r.course_code ? el('span', { class:'badge', text: r.course_code }) : null,
      r.free ? el('span', { class:'badge badge--ok', text:'مجانية' })
             : (r.price ? el('span', { class:'badge num', text: r.price + ' ريال' }) : null)
    ])
  ]);
  return card;
}

function ViewExploreRender(route){
  const st = Explore.stateFrom(route.query);
  Explore.remember(st);

  /* شريط البحث — لا يُرسل مع كل حرف: نصف ثانية سكون قبل النداء.
     بلا هذا نُرسل عشرة نداءات لكلمة من عشرة أحرف. */
  const qIn = el('input', { class:'input', type:'search', value: st.q,
    placeholder:'ابحث باسم المادة أو رمز المقرر…', 'aria-label':'بحث في المواد' });
  let timer = null;
  qIn.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      st.q = qIn.value; st.page = 0;
      QBANK.router.go(Explore.toHash(st));
    }, 500);
  });

  const sortSel = el('select', { class:'input', 'aria-label':'ترتيب النتائج' });
  [['popular','الأكثر استخدامًا'],['newest','الأحدث'],['questions','الأكثر أسئلة']]
    .forEach(o => sortSel.appendChild(el('option', { value:o[0], text:o[1],
      selected: o[0] === st.sort ? 'selected' : null })));
  sortSel.value = st.sort;
  sortSel.addEventListener('change', () => {
    st.sort = sortSel.value; st.page = 0; QBANK.router.go(Explore.toHash(st));
  });

  const filterBox = el('div', { class:'ex-filters' });
  const countEl   = el('p', { class:'page__sub', role:'status' });
  const grid      = el('div', { class:'ex-grid' });
  const pager     = el('div', { class:'ex-pager' });

  /* المرشّحات: شرائح لا قوائم منسدلة — أسرع لمسًا على الجوال، وتُظهر العدد */
  function drawFilters(f){
    filterBox.innerHTML = '';
    const chipRow = (label, items, activeVal, onPick) => {
      if (!items.length) return;
      const row = el('div', { class:'ex-chips', role:'group', 'aria-label':label });
      const all = el('button', { class:'chip' + (!activeVal ? ' is-on' : ''), type:'button',
        text:'الكل', 'aria-pressed': !activeVal ? 'true' : 'false' });
      all.addEventListener('click', () => onPick(''));
      row.appendChild(all);
      items.slice(0, 12).forEach(it => {
        const on = String(activeVal) === String(it.val);
        const b = el('button', { class:'chip' + (on ? ' is-on' : ''), type:'button',
          'aria-pressed': on ? 'true' : 'false' }, [
          el('span', { text: it.label }),
          el('span', { class:'chip__n num', text: String(it.n) })
        ]);
        b.addEventListener('click', () => onPick(on ? '' : it.val));
        row.appendChild(b);
      });
      filterBox.appendChild(el('div', { class:'ex-frow' }, [
        el('span', { class:'ex-flabel', text: label }), row
      ]));
    };

    chipRow('الدولة', (f.countries || []).map(c => ({ val:c.code, label:countryName(c.code), n:c.n })),
      st.country, v => { st.country = v; st.uni = ''; st.col = ''; st.page = 0; QBANK.router.go(Explore.toHash(st)); });
    chipRow('الجامعة', (f.universities || []).map(u => ({ val:u.id, label:u.name, n:u.n })),
      st.uni, v => { st.uni = v; st.col = ''; st.page = 0; QBANK.router.go(Explore.toHash(st)); });
    if (st.uni)
      chipRow('الكلية', (f.colleges || []).map(c => ({ val:c.id, label:c.name, n:c.n })),
        st.col, v => { st.col = v; st.page = 0; QBANK.router.go(Explore.toHash(st)); });
  }

  function drawPager(d){
    pager.innerHTML = '';
    if (!d.pages || d.pages < 2) return;
    const go = p => { st.page = p; QBANK.router.go(Explore.toHash(st)); };
    const prev = el('button', { class:'btn btn--sm btn--ghost', type:'button', text:'‹ السابق',
      disabled: d.page <= 0 ? '' : null });
    prev.addEventListener('click', () => go(d.page - 1));
    const next = el('button', { class:'btn btn--sm btn--ghost', type:'button', text:'التالي ›',
      disabled: d.page >= d.pages - 1 ? '' : null });
    next.addEventListener('click', () => go(d.page + 1));
    pager.appendChild(prev);
    pager.appendChild(el('span', { class:'ex-pageno num', text:(d.page + 1) + ' من ' + d.pages }));
    pager.appendChild(next);
  }

  grid.appendChild(el('p', { class:'page__sub', text:'جارٍ البحث…' }));
  Explore.search(st).then(r => {
    if (!grid.isConnected) return;
    grid.innerHTML = '';
    if (!r.ok || !r.data || r.data.error){
      grid.appendChild(QBANK.views.empty('⚠', 'تعذّر البحث',
        'تأكد من الاتصال، أو أن ملف CATALOG.sql مُشغَّل على القاعدة.'));
      return;
    }
    const d = r.data;
    countEl.textContent = d.total
      ? d.total + ' مادة' + (st.q ? ' لـ «' + st.q + '»' : '')
      : 'لا نتائج' + (st.q ? ' لـ «' + st.q + '»' : '');
    if (!d.rows.length){
      grid.appendChild(QBANK.views.empty('⌕', 'لم نجد شيئًا',
        'جرّب كلمة أقصر، أو أزل بعض المرشّحات — أو كن أنت من يرفع هذه المادة.',
        el('a', { class:'btn', href:'#/upload', text:'⇪ ارفع هذه المادة' })));
      return;
    }
    d.rows.forEach(x => grid.appendChild(exCard(x)));
    drawPager(d);
  });

  Explore.filters(st).then(r => {
    if (!filterBox.isConnected) return;
    if (r.ok && r.data && !r.data.error) drawFilters(r.data);
  });

  return QBANK.views.page('استكشف', 'بنوك أسئلة رفعها طلاب من جامعات عربية.', [
    el('div', { class:'ex-bar' }, [ qIn, sortSel ]),
    filterBox, countEl, grid, pager
  ]);
}

const ViewExplore = { title:'استكشف', view: ViewExploreRender };

QBANK.explore = Explore;
QBANK.explore.countryName = countryName;
QBANK.views.ViewExplore = ViewExplore;
