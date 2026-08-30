/*
  الإعدادات — كل مقبض في المنصة في شاشة واحدة، مجموعًا بالمعنى لا بالجدول.
  الحفظ لكل مجموعة على حدة: المشرف يغيّر شيئًا واحدًا فلا نعيد كتابة الصف كله
  ولا نجعله يمرّ على عشرين حقلًا ليضغط زرًا واحدًا في القاع.
*/
const SET = {
  /* وصف الحقول في مكان واحد — الواجهة تُبنى منه، والفحص يقرأه، فلا يفترقان */
  GROUPS: [
    { id:'identity', title:'هوية المنصة', sub:'ما يراه الطالب في الترويسة والصفحة التعريفية', fields:[
      { k:'platform_name', t:'text',  label:'اسم المنصة' },
      { k:'tagline',       t:'text',  label:'الشعار — سطر واحد' },
      { k:'welcome_text',  t:'area',  label:'نص الترحيب' },
      { k:'support_email', t:'text',  label:'بريد الدعم', dir:'ltr' },
      { k:'whatsapp',      t:'text',  label:'رقم واتساب للتواصل', dir:'ltr' }
    ]},
    { id:'exam', title:'افتراضات الاختبار', sub:'يبدأ بها الطالب، وله تغييرها قبل كل اختبار', fields:[
      { k:'exam_count',       t:'num',  label:'عدد الأسئلة', min:1, max:200 },
      { k:'exam_minutes',     t:'num',  label:'المدة بالدقائق', min:1, max:300 },
      { k:'pass_mark',        t:'num',  label:'علامة النجاح ٪', min:0, max:100 },
      { k:'shuffle_q',        t:'bool', label:'خلط ترتيب الأسئلة' },
      { k:'shuffle_opts',     t:'bool', label:'خلط ترتيب الخيارات' },
      { k:'instant_feedback', t:'bool', label:'إظهار الصواب فور الإجابة' }
    ]},
    { id:'access', title:'الوصول والحسابات', sub:'من يدخل، وبكم جهاز، ومتى تُغلق المنصة', fields:[
      { k:'signup_open',   t:'bool', label:'التسجيل مفتوح للطلاب الجدد' },
      { k:'board_enabled', t:'bool', label:'لوحة المتصدرين ظاهرة' },
      { k:'device_limit',  t:'num',  label:'حد الأجهزة لكل حساب', min:1, max:10 },
      { k:'trial_days',    t:'num',  label:'أيام التجربة المجانية', min:0, max:365 },
      { k:'maintenance',   t:'bool', label:'وضع الصيانة — يُوقف دخول الطلاب' },
      { k:'maint_msg',     t:'area', label:'رسالة الصيانة' }
    ]}
  ],

  /* لا نُرسل إلا ما تغيّر فعلًا: أقل حمولة، وأثر أوضح في سجل القاعدة */
  diff(before, after){
    const out = {};
    Object.keys(after).forEach(k => { if (after[k] !== before[k]) out[k] = after[k]; });
    return out;
  },
  /* الأرقام تُقصّ إلى مداها قبل الإرسال — القاعدة سترفض الخارج، ونحن نمنع الرحلة أصلًا */
  clamp(v, min, max){
    const n = parseInt(v, 10);
    if (isNaN(n)) return min;
    return Math.min(max, Math.max(min, n));
  }
};

function setField(f, value, onChange){
  if (f.t === 'bool'){
    let on = !!value;
    const b = el('button', { class:'btn btn--sm ' + (on ? '' : 'btn--ghost'), type:'button',
      role:'switch', 'data-k':f.k, 'aria-checked': on ? 'true' : 'false',
      text: (on ? '✓ ' : '') + f.label });
    b.addEventListener('click', () => {
      on = !on;
      b.className = 'btn btn--sm ' + (on ? '' : 'btn--ghost');
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.textContent = (on ? '✓ ' : '') + f.label;
      onChange(f.k, on);
    });
    return b;
  }
  let inp;
  if (f.t === 'area'){ inp = el('textarea', { class:'input', rows:'2', 'data-k':f.k }); inp.value = value || ''; }
  else if (f.t === 'num'){
    inp = el('input', { class:'input', type:'number', 'data-k':f.k,
      min:String(f.min), max:String(f.max), value: String(value == null ? f.min : value) });
  } else {
    inp = el('input', { class:'input', type:'text', 'data-k':f.k, dir: f.dir || 'auto', value: value || '' });
  }
  inp.addEventListener('input', () => {
    onChange(f.k, f.t === 'num' ? SET.clamp(inp.value, f.min, f.max) : inp.value);
  });
  return el('label', { class:'field', style:'margin:0' }, [
    el('span', { class:'field__label', text:f.label }), inp
  ]);
}

function setGroup(g, row, refresh){
  const draft = {};
  g.fields.forEach(f => { draft[f.k] = row[f.k]; });
  const save = el('button', { class:'btn', type:'button', text:'احفظ ' + g.title, disabled:true });
  const mark = el('span', { class:'ad-panel__s' });

  function touched(){
    const d = SET.diff(row, draft);
    const n = Object.keys(d).length;
    save.disabled = n === 0;
    mark.textContent = n ? n + ' تغييرًا غير محفوظ' : 'محفوظ';
  }
  touched();

  const body = el('div', { class:'ad-edit ad-edit--2' },
    g.fields.map(f => setField(f, row[f.k], (k, v) => { draft[k] = v; touched(); })));

  save.addEventListener('click', async () => {
    const d = SET.diff(row, draft);
    if (!Object.keys(d).length) return;
    const r = await QBANK.api.rest('settings?id=eq.1', { method:'PATCH', body: JSON.stringify(d) });
    QBANK.toast(r.ok ? 'حُفظت ' + g.title : 'تعذّر الحفظ');
    if (r.ok && refresh) refresh();
  });

  return el('section', { class:'ad-panel', 'data-group':g.id }, [
    el('div', { class:'ad-panel__h' }, [
      el('h2', { class:'ad-panel__t', text:g.title }), mark
    ]),
    el('p', { class:'page__sub', style:'margin-top:0', text:g.sub }),
    body,
    el('div', { class:'ad-bar', style:'margin:16px 0 0' }, [ save ])
  ]);
}

/* ===== الربط: يعمل قبل الدخول لأنه أول ما يُضبط عند التركيب ===== */
function setConnection(){
  const c = QBANK.config.get() || {};
  const urlIn = el('input', { class:'input', dir:'ltr', id:'cfgUrl', value: c.url || '', placeholder:'https://xxxx.supabase.co' });
  const keyIn = el('input', { class:'input', dir:'ltr', id:'cfgKey', value: c.anonKey || '', placeholder:'anon key' });
  const apiIn = el('input', { class:'input', dir:'ltr', id:'cfgApi', value: QBANK.store.get('api_base',''),
    placeholder:'اتركه فارغًا على نفس الموقع' });
  const save = el('button', { class:'btn', type:'button', text:'احفظ الربط' });
  save.addEventListener('click', () => {
    const r = QBANK.config.set(urlIn.value.trim(), keyIn.value.trim());
    QBANK.store.set('api_base', apiIn.value.trim());
    QBANK.toast(r.ok ? 'حُفظ الربط — المنصة موصولة' : r.err);
  });
  return el('section', { class:'ad-panel' }, [
    el('div', { class:'ad-panel__h' }, [ el('h2', { class:'ad-panel__t', text:'ربط الخادم' }) ]),
    el('p', { class:'page__sub', style:'margin-top:0',
      text:'المفتاح العام (anon) عام بطبيعته — الحماية كلها في RLS داخل القاعدة، لا في إخفائه.' }),
    el('div', { class:'ad-edit' }, [
      el('label', { class:'field', style:'margin:0' }, [ el('span', { class:'field__label', text:'رابط Supabase' }), urlIn ]),
      el('label', { class:'field', style:'margin:0' }, [ el('span', { class:'field__label', text:'المفتاح العام (anon)' }), keyIn ]),
      el('label', { class:'field', style:'margin:0' }, [ el('span', { class:'field__label', text:'رابط دوال الخادم (Vercel)' }), apiIn ])
    ]),
    el('div', { class:'ad-bar', style:'margin:16px 0 0' }, [ save ])
  ]);
}

/* ===== صحة المحتوى ===== */
function setHealth(){
  const box = el('section', { class:'ad-panel' }, [
    el('div', { class:'ad-panel__h' }, [ el('h2', { class:'ad-panel__t', text:'صحة المحتوى' }) ]),
    el('p', { class:'page__sub', text:'جارٍ الفحص…' })
  ]);
  QBANK.api.rpc('admin_health').then(r => {
    if (!box.isConnected) return;
    box.innerHTML = '';
    box.appendChild(el('div', { class:'ad-panel__h' }, [ el('h2', { class:'ad-panel__t', text:'صحة المحتوى' }) ]));
    if (!r.ok || !r.data || r.data.error){
      box.appendChild(el('p', { class:'page__sub', text:'يظهر بعد تشغيل SETTINGS-UPGRADE.sql على القاعدة.' }));
      return;
    }
    const h = r.data;
    const ITEMS = [
      ['bad_answer',  'إجابة خارج نطاق الخيارات', 'bad'],
      ['no_expl',     'سؤالًا بلا شرح',            'warn'],
      ['derived',     'إجابة استنتجها الذكاء',     'warn'],
      ['opts_built',  'سؤالًا خياراته مبنية',      'warn'],
      ['no_topic',    'سؤالًا بلا محور',           'warn'],
      ['empty_subj',  'مادة بلا سؤال واحد',        'warn'],
      ['unpublished', 'مادة غير منشورة',           null]
    ];
    const bad = ITEMS.filter(i => Number(h[i[0]]) > 0);
    if (!bad.length){
      box.appendChild(el('p', { class:'page__sub', text:'✓ لا ملاحظات — المحتوى جاهز للطالب.' }));
      return;
    }
    bad.forEach(i => box.appendChild(el('div', { class:'row' }, [
      el('span', { class:'badge num ' + (i[2] === 'bad' ? 'badge--bad' : i[2] === 'warn' ? 'badge--warn' : ''),
        text: String(h[i[0]]) }),
      el('span', { text: i[1] })
    ])));
  });
  return box;
}

/* ===== التصدير ومنطقة الخطر ===== */
function setData(){
  const btn = el('button', { class:'btn', type:'button', text:'صدّر نسخة كاملة (JSON)' });
  btn.addEventListener('click', async () => {
    btn.disabled = true; btn.textContent = 'جارٍ التصدير…';
    const r = await QBANK.api.rpc('admin_export');
    btn.disabled = false; btn.textContent = 'صدّر نسخة كاملة (JSON)';
    if (!r.ok || !r.data || r.data.error) return QBANK.toast('تعذّر التصدير');
    const blob = new Blob([JSON.stringify(r.data, null, 2)], { type:'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob),
      download: 'qbank-backup-' + new Date().toISOString().slice(0,10) + '.json' });
    document.body.appendChild(a); a.click(); a.remove();
    QBANK.toast('نُزّلت النسخة');
  });

  const clearLocal = el('button', { class:'btn btn--ghost', type:'button', text:'امسح ذاكرة هذا الجهاز' });
  let armed = false;
  clearLocal.addEventListener('click', () => {
    if (!armed){ armed = true; clearLocal.textContent = 'اضغط ثانيةً — يُمسح التقدّم المحلي'; clearLocal.className = 'btn btn--danger'; return; }
    QBANK.store.clearAll();
    QBANK.toast('مُسحت الذاكرة المحلية — أعد التحميل');
  });

  return el('section', { class:'ad-panel ad-danger' }, [
    el('div', { class:'ad-panel__h' }, [ el('h2', { class:'ad-panel__t', text:'البيانات' }) ]),
    el('p', { class:'page__sub', style:'margin-top:0',
      text:'التصدير يحفظ المواد والأسئلة والإعدادات كاملة. المسح يطال هذا الجهاز وحده ولا يلمس القاعدة.' }),
    el('div', { class:'ad-bar', style:'margin:0' }, [ btn, el('span', { class:'spacer' }), clearLocal ])
  ]);
}

/* ===== التبويب ===== */
function adminSettingsTabFull(box){
  box.appendChild(setConnection());
  const rest = el('div', { class:'stack' }, [ el('p', { class:'page__sub', text:'جارٍ جلب الإعدادات…' }) ]);
  box.appendChild(rest);

  function load(){
    QBANK.api.rest('settings?id=eq.1&select=*').then(r => {
      if (!rest.isConnected) return;
      rest.innerHTML = '';
      const row = (r.ok && r.data && r.data[0]) || null;
      if (!row){
        rest.appendChild(QBANK.views.empty('⚙', 'الإعدادات غير متاحة',
          'تُجلب بعد ربط الخادم والدخول كمشرف وتشغيل ملفات SQL.'));
        return;
      }
      SET.GROUPS.forEach(g => rest.appendChild(setGroup(g, row, load)));
      rest.appendChild(setHealth());
      rest.appendChild(setData());
    });
  }
  load();
}

QBANK.admin.settings = SET;
// نستبدل تبويب الإعدادات القديم بالكامل — أُبقي المختصر في 33 كي يبقى ذاك الملف مستقلًا
QBANK.views.ADMIN_TABS.forEach(t => { if (t.id === 'settings') t.fill = adminSettingsTabFull; });
