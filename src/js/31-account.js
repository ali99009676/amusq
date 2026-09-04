/*
  شاشة «حسابي»: الاسم، الصورة الرمزية، التقدّم، المزامنة، الخروج، الحذف النهائي.
  الحذف شرط متجر آبل — زر حقيقي يمسح كل شيء، لا وعد شكلي.
*/
const AVATARS = ['🧑‍⚕️','👩‍⚕️','🩺','🚑','💉','🧠','🫀','🦴','🔬','📚'];

/*
  ★ رفع الصورة الشخصية إلى مخزن Supabase.
  تُصغَّر في المتصفح إلى ٢٥٦ بكسل قبل الرفع: صورة جوال خام ٥ ميغابايت
  تصير ~٣٠ كيلوبايت — أرحم ببيانات الطالب وأسرع ظهورًا في كل مكان.
*/
async function uploadAvatar(file){
  const u = QBANK.api.user();
  const c = QBANK.config.get();
  const s = QBANK.api.session();
  if (!u || !c || !s) return { ok:false };
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i); i.onerror = rej;
    i.src = URL.createObjectURL(file);
  });
  const size = 256;
  const cv = document.createElement('canvas'); cv.width = size; cv.height = size;
  const g = cv.getContext('2d');
  // قصّ مربع من المنتصف — الوجه غالبًا في الوسط، والمربع هو شكل الصورة في كل مكان
  const m = Math.min(img.width, img.height);
  g.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, size, size);
  const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', .85));
  const path = u.id + '/avatar.jpg';
  const f = QBANK.api.fetchFn();
  const res = await f(c.url + '/storage/v1/object/avatars/' + path, {
    method:'POST',
    headers:{ 'Authorization':'Bearer ' + s.access_token, 'apikey': c.anonKey,
              'Content-Type':'image/jpeg', 'x-upsert':'true' },
    body: blob
  });
  if (!res.ok) return { ok:false };
  // ?v= يكسر كاش المتصفح — الرابط ثابت والصورة تتبدل
  return { ok:true, url: c.url + '/storage/v1/object/public/avatars/' + path + '?v=' + Date.now() };
}

function accountBody(){
  const u = QBANK.api.user();
  if (!u) return el('div');
  /*
    ★ الطبقة الأخيرة: الملف المخزّن يقول لمن هو.
    الكنس عند تبدّل الهوية يكفي نظريًا، لكن نسخةً قديمة من التطبيق قد تكون
    كتبت ملفًا بلا هوية، أو يفتح التطبيقُ هذه الشاشةَ قبل أن تُحفظ الجلسة.
    فنسأل الملف نفسه: أأنت لصاحب هذه الجلسة؟ ومن لا يجيب لا يُعرض.
  */
  const EMPTY = { name:'', avatar: AVATARS[0], phone:'', bio:'', avatar_url:'' };
  const cached = QBANK.store.get('profile', null);
  const prof = (cached && cached.uid === u.id) ? cached
             : Object.assign({ uid: u.id }, EMPTY);
  prof.uid = u.id;   // كل حفظٍ بعد اليوم يخرج موسومًا بصاحبه

  /* ═══ بطل الملف: الصورة والاسم والبريد في صدر الصفحة ═══ */
  const avImg = el('img', { class:'pf-hero__img', alt:'صورتك الشخصية', hidden: prof.avatar_url ? null : true });
  if (prof.avatar_url) avImg.src = prof.avatar_url;
  const avEmoji = el('span', { class:'pf-hero__emoji', 'aria-hidden':'true',
    text: prof.avatar || AVATARS[0], hidden: prof.avatar_url ? true : null });
  const file = el('input', { type:'file', accept:'image/*', hidden:true, 'aria-label':'ارفع صورة شخصية' });
  const camBtn = el('button', { class:'pf-hero__cam', type:'button', 'aria-label':'غيّر صورتك', text:'📷' });
  camBtn.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    if (!file.files || !file.files[0]) return;
    camBtn.textContent = '…';
    const r = await uploadAvatar(file.files[0]);
    camBtn.textContent = '📷';
    if (!r.ok) return QBANK.toast('تعذّر رفع الصورة — تحقق من الاتصال');
    prof.avatar_url = r.url;
    avImg.src = r.url; avImg.hidden = false; avEmoji.hidden = true;
    QBANK.store.set('profile', prof);
    await QBANK.api.saveProfile({ avatar_url: r.url });
    QBANK.toast('صورتك الجديدة في كل مكان الآن');
  });

  /*
    ★ ثلاثة أرقام في البطل: ما يُسأل عنه أول ما يُفتح الملف — كم اختبارًا،
    وأفضل نتيجة، وكم مادة. من التقدّم المحلي فتظهر فورًا بلا انتظار.
  */
  const P = QBANK.progress.all ? QBANK.progress.all() : {};
  let exams = 0, best = 0;
  /* sane(): عدّادٌ فاسد من دمجٍ قديم (٥×١٠³¹) لا يُعرض رقمًا فلكيًّا في وجه الطالب */
  Object.keys(P).forEach(sid => { exams += QBANK.progress.sane(P[sid] && P[sid].exams); best = Math.max(best, Math.min(100, Number(P[sid] && P[sid].best) || 0)); });
  const nSubs = (QBANK.store.get('my_subjects', []) || []).length;
  const N = QBANK.views.arNum;
  const stats = el('div', { class:'pf-hero__stats' }, [
    el('span', { class:'pf-hero__stat' }, [ el('b', { text: N(exams) }), el('span', { text:'اختبارًا' }) ]),
    el('span', { class:'pf-hero__stat' }, [ el('b', { text: N(best) + '٪' }), el('span', { text:'أفضل نتيجة' }) ]),
    el('span', { class:'pf-hero__stat' }, [ el('b', { text: N(nSubs) }), el('span', { text:'مادة في قائمتي' }) ])
  ]);
  const hero = el('div', { class:'card pf-hero' }, [
    el('div', { class:'pf-hero__avwrap' }, [avImg, avEmoji, camBtn, file]),
    el('div', { class:'pf-hero__x' }, [
      el('strong', { class:'pf-hero__n', id:'pfName', text: prof.name || 'طالب مراجعة' }),
      el('span', { class:'pf-hero__mail ltr', text: u.email || '' }),
      el('p', { class:'pf-hero__bio', id:'pfBio', text: prof.bio || '' }),
      stats
    ])
  ]);

  const nameInput = el('input', { class:'input', id:'accName', value: prof.name || '', placeholder:'اسمك الظاهر في المنصة' });
  const phoneInput = el('input', { class:'input ltr', type:'tel', inputmode:'tel', dir:'ltr',
    value: prof.phone || '', placeholder:'05xxxxxxxx' });
  const bioInput = el('textarea', { class:'input', rows:'3',
    placeholder:'نبذة قصيرة: تخصصك، دفعتك، ما تراجعه هذه الأيام…' });
  bioInput.value = prof.bio || '';
  const avatarRow = el('div', { class:'row avpick', role:'radiogroup', 'aria-label':'الصورة الرمزية البديلة' },
    AVATARS.map(a => {
      const b = el('button', { class:'iconbtn', type:'button', role:'radio',
        'aria-checked': a === (prof.avatar || AVATARS[0]) ? 'true' : 'false', 'aria-label':'صورة ' + a }, [
        el('span', { class:'iconbtn__ico', text:a })
      ]);
      b.addEventListener('click', () => {
        avatarRow.querySelectorAll('[role="radio"]').forEach(x => x.setAttribute('aria-checked','false'));
        b.setAttribute('aria-checked','true');
      });
      return b;
    })
  );

  /*
    ★ الجوال إلزامي — قرار علي.
    التحقق هنا مرن عمدًا: نقبل ٩ أرقام فأكثر بعد تجريد الرموز والمسافات،
    فتمرّ ‎+966‎ و‎05‎ وأرقام خارج السعودية معًا. التشدّد في صيغة واحدة
    يطرد طالبًا رقمه صحيح، وهذا أسوأ من فراغ الحقل.
  */
  const phoneMsg = el('span', { class:'field__hint', role:'status' });
  /* زرٌّ بحجمه الطبيعي لا شريطًا بعرض الشاشة: الحفظ فعلٌ عادي لا مصيري */
  const saveBtn = el('button', { class:'btn', type:'button', text:'احفظ ملفي' });
  saveBtn.addEventListener('click', async () => {
    const digits = (phoneInput.value || '').replace(/\D/g, '');
    if (digits.length < 9){
      phoneMsg.textContent = 'رقم الجوال مطلوب — اكتبه كاملًا (مثل ٠٥xxxxxxxx).';
      phoneMsg.className = 'field__hint is-bad';
      phoneInput.focus();
      return;
    }
    /* ★ الاسم يمرّ بمرشّح اللوحة نفسه — والرسالة تشرح السبب لا تكتفي بالطول */
    if (QBANK.names){
      const nc = QBANK.names.clean(nameInput.value);
      if (!nc.ok){
        phoneMsg.textContent = nc.why; phoneMsg.className = 'field__hint is-bad';
        nameInput.focus();
        return;
      }
      nameInput.value = nc.name;
    }
    phoneMsg.textContent = ''; phoneMsg.className = 'field__hint';
    const picked = avatarRow.querySelector('[aria-checked="true"] .iconbtn__ico');
    const data = { name: nameInput.value.trim(), avatar: picked ? picked.textContent : AVATARS[0],
                   phone: phoneInput.value.trim(), bio: bioInput.value.trim() };
    Object.assign(prof, data);
    QBANK.store.set('profile', prof);
    const r = await QBANK.api.saveProfile(data);
    const n = hero.querySelector('#pfName'), b = hero.querySelector('#pfBio');
    if (n) n.textContent = data.name || 'طالب مراجعة';
    if (b) b.textContent = data.bio || '';
    QBANK.toast(r.ok ? 'حُفظ ملفك' : 'حُفظ في جهازك، وسيتزامن عند الاتصال');
  });

  /* الخادم هو الحقيقة: جهاز جديد يفتح الملف فيجد اسمه وصورته ونبذته
     كما تركها على جهازه الأول — لا نموذجًا فارغًا يظن أنها ضاعت */
  QBANK.api.myProfile().then(r => {
    if (!r.ok || !r.data || !hero.isConnected) return;
    const d = r.data;
    if (d.name && !nameInput.value) nameInput.value = d.name;
    if (d.phone && !phoneInput.value) phoneInput.value = d.phone;
    if (d.bio && !bioInput.value) bioInput.value = d.bio;
    if (d.avatar_url && !prof.avatar_url){
      prof.avatar_url = d.avatar_url;
      avImg.src = d.avatar_url; avImg.hidden = false; avEmoji.hidden = true;
    }
    const n = hero.querySelector('#pfName'), b = hero.querySelector('#pfBio');
    if (n && d.name) n.textContent = d.name;
    if (b && d.bio) b.textContent = d.bio;
    Object.assign(prof, { name: d.name || prof.name, phone: d.phone || prof.phone,
                          bio: d.bio || prof.bio });
    QBANK.store.set('profile', prof);
  });

  /* ═══ تقييماتي — رأي الطالب المعلن جزء من هويته ═══ */
  const ratesBox = el('div', { class:'card' }, [ el('h2', { text:'تقييماتي' }),
    el('p', { class:'field__hint', text:'جارٍ الجلب…' }) ]);
  QBANK.api.rest('subject_ratings?user_id=eq.' + u.id + '&select=subject_id,stars,note').then(r => {
    if (!ratesBox.isConnected) return;
    ratesBox.innerHTML = ''; ratesBox.appendChild(el('h2', { text:'تقييماتي' }));
    const rows = (r.ok && Array.isArray(r.data)) ? r.data : [];
    if (!rows.length){
      ratesBox.appendChild(el('p', { class:'field__hint',
        text:'لم تقيّم مادة بعد — تقييمك يرفع البنوك النافعة لزملائك.' }));
      return;
    }
    const byId = {}; (QBANK.data.pack().subjects || []).forEach(s => byId[s.id] = s);
    rows.forEach(x => {
      const s = byId[x.subject_id];
      ratesBox.appendChild(el('div', { class:'row' }, [
        el('span', { text: (s ? (s.icon || '▤') + ' ' + s.name : 'مادة') }),
        el('span', { class:'spacer' }),
        el('span', { class:'badge badge--warn', 'aria-label': x.stars + ' من ٥',
          text: '★'.repeat(x.stars) + '☆'.repeat(5 - x.stars) })
      ]));
      if (x.note) ratesBox.appendChild(el('p', { class:'field__hint', style:'margin:2px 0 8px', text:'«' + x.note + '»' }));
    });
  });

  /*
    ★ الملف في عمودين على الحاسوب: النموذج عن اليمين، وما يعرّفه للناس
    (تقييماته) عن اليسار ثابتًا. وعلى الجوال يتراصّان. ورأسُ كل قسم
    بأيقونة وسطرٍ يقول لماذا: الحقل الذي يُفهم سببه يُملأ.
  */
  const sec = (ico, t, sub, body) => el('section', { class:'card acc-sec' }, [
    el('div', { class:'acc-sec__h' }, [
      el('span', { class:'acc-sec__ico', 'aria-hidden':'true' }, [ QBANK.ico(ico, { size:18 }) ]),
      el('div', {}, [ el('h2', { class:'acc-sec__t', text: t }), sub ? el('p', { class:'acc-sec__s', text: sub }) : null ])
    ])
  ].concat(body));
  return el('div', { class:'stack' }, [
    hero,
    el('div', { class:'acc-grid' }, [
      el('div', { class:'acc-grid__main stack' }, [
        sec('user', 'هويتك', 'ما يراه زملاؤك على اللوحة وفي مادتك', [
          el('div', { class:'acc-grid2' }, [
            el('label', { class:'field' }, [ el('span', { class:'field__label', text:'الاسم' }), nameInput ]),
            el('label', { class:'field' }, [ el('span', { class:'field__label', text:'رقم الجوال *' }), phoneInput, phoneMsg ]),
            el('label', { class:'field field--wide' }, [ el('span', { class:'field__label', text:'نبذة عني' }), bioInput ])
          ])
        ]),
        sec('smile', 'رمز مؤقّت — يظهر حتى ترفع صورتك', 'اضغط الكاميرا في الأعلى لرفع صورتك الحقيقية', [ avatarRow ]),
        el('div', { class:'row' }, [ saveBtn ])
      ]),
      el('aside', { class:'acc-grid__side stack' }, [ ratesBox ])
    ])
  ]);
}

/* ★ التقدّم والخطر بطاقتان مستقلتان: التبويبات توزّعهما، والدالة القديمة
   تبقى للفحوص والشاشات التي تستدعيها كما هي */
function accountProgressCard(){
  const pack = QBANK.data.pack();
  const list = el('div', { class:'stack' }, (pack.subjects || []).map(s => {
    const pct = QBANK.progress.pctDone(s.id, s.q_count);
    return el('div', { class:'row' }, [
      el('span', { text: (s.icon || '▤') + ' ' + s.name }),
      el('span', { class:'spacer' }),
      el('span', { class:'badge num', text: pct + '٪' })
    ]);
  }));
  return el('div', { class:'card' }, [ el('h2', { text:'تقدّمي' }), list ]);
}

function accountDangerCard(){
  const syncBtn = el('button', { class:'btn btn--soft btn--block', type:'button', text:'زامن الآن' });
  syncBtn.addEventListener('click', async () => {
    const r = await QBANK.progress.pull();
    QBANK.toast(r.ok ? 'تمت المزامنة والدمج' : 'تعذّرت المزامنة — لا اتصال');
  });
  /* ★ الإعدادات هنا بعد أن خرجت من الشريط السفلي — لا تُترك بلا باب.
     ميزةٌ لا يُوصل إليها ميزةٌ محذوفة، مهما بقي مسارها مسجَّلًا. */
  const setLink = el('a', { class:'btn btn--soft btn--block', href:'#/settings',
                            text:'⚙ الإعدادات والمظهر' });
  const outBtn = el('button', { class:'btn btn--ghost btn--block', type:'button', text:'تسجيل الخروج' });
  outBtn.addEventListener('click', async () => {
    await QBANK.api.auth.signOut();
    QBANK.toast('خرجت من حسابك — تقدّمك باقٍ في جهازك');
    QBANK.router.go('#/');
  });
  const delBtn = el('button', { class:'btn btn--ghost btn--block', type:'button',
    style:'color:var(--bad);border-color:var(--bad)', text:'احذف حسابي نهائيًا' });
  delBtn.addEventListener('click', async () => {
    const word = (typeof prompt === 'function') ? prompt('سيُحذف حسابك وكل بياناتك نهائيًا ولا رجوع. اكتب «حذف» للتأكيد:') : null;
    if (word !== 'حذف') { QBANK.toast('أُلغي الحذف'); return; }
    const r = await QBANK.api.auth.deleteMe();
    if (r.ok) { await QBANK.data.clearAll(); QBANK.toast('حُذف حسابك وكل بياناته'); QBANK.router.go('#/'); }
    else QBANK.toast('تعذّر الحذف — تحقق من الاتصال');
  });
  return el('div', { class:'card stack' }, [
    setLink, syncBtn, outBtn, el('hr', { class:'divider', style:'margin:0' }), delBtn ]);
}


/*
  بطاقة «جامعتي» — الانتماء يُختار مرة ويخدم في ثلاثة مواضع:
  شاشة الطالب الأولى، وخانات الرفع المملوءة تلقائيًا، ورابط القسم الذي يشاركه.
  لهذا هي هنا في الحساب لا في الإعدادات: انتماء لا تفضيل.
*/
function campusCard(){
  const box = el('div', { class:'card' });
  const head = el('div', { class:'row', style:'justify-content:space-between;align-items:center;gap:8px' }, [
    el('h2', { style:'margin:0', text:'جامعتي' }), el('span', { id:'campusGo' })
  ]);
  const hint = el('p', { class:'field__hint', style:'margin:4px 0 12px',
    text:'اخترها مرة، فتفتح المنصة على قسم جامعتك وتُملأ خاناتها عند رفع أي مادة.' });
  const slot = el('div');
  box.appendChild(head); box.appendChild(hint); box.appendChild(slot);

  const draw = c => {
    slot.innerHTML = '';
    slot.appendChild(QBANK.campus.picker(c || {}, drawn => draw(drawn)));
    const go = head.querySelector('#campusGo');
    go.innerHTML = '';
    if (c && c.university_id)
      go.appendChild(el('a', { class:'btn btn--sm btn--soft',
        href: QBANK.campus.href(c.university_id), text:'افتح قسمي ←' }));
  };

  draw(QBANK.campus.cached());
  QBANK.campus.load().then(c => { if (slot.isConnected) draw(c); });
  return box;
}

/*
  ═══ موادي المرفوعة ═══
  الطالب الذي رفع بنكًا يريد أن يعرف مصيره: أنُشر؟ كم اشترك فيه؟ كيف قُيّم؟
  هذه البطاقة تجيب الثلاثة، ومنها يقفز إلى صفحة مادته أو إلى ملفه العام.
*/
function myUploadsCard(){
  const u = QBANK.api.user();
  const box = el('div', { class:'card stack' }, [ el('h2', { style:'margin:0', text:'موادي المرفوعة' }),
    el('p', { class:'field__hint', style:'margin:0', text:'جارٍ الجلب…' }) ]);
  if (!u) return box;
  QBANK.api.rest('subjects?created_by=eq.' + u.id +
    '&select=id,name,icon,color,q_count,published,status,price,free,rating_avg,rating_n,owner_edit&order=created_at.desc')
    .then(r => {
      if (!box.isConnected) return;
      box.innerHTML = ''; box.appendChild(el('h2', { style:'margin:0', text:'موادي المرفوعة' }));
      const rows = (r.ok && Array.isArray(r.data)) ? r.data : [];
      if (!rows.length){
        box.appendChild(el('p', { class:'field__hint', style:'margin:0',
          text:'لم ترفع مادة بعد — بنك أسئلتك ينفع دفعتك كلها، ويكسبك كوينز وسمعة.' }));
        box.appendChild(el('a', { class:'btn btn--soft btn--block', href:'#/upload', text:'⇪ ارفع مادتك الأولى' }));
        return;
      }
      /*
        ★ المخفية بابها محرّرها لا صفحتها.
        كانت تُسمّى «قيد المراجعة» وتقود إلى صفحة المادة — وهي ليست في
        قائمة المواد أصلًا فيُقال «لم نجد المادة». لا أحد يراجعها غير
        صاحبها: يفتحها في محرّره، يصحّح، ثم ينشر. والمنشورة تُفتح في صفحتها،
        ومعها زرّ تحرير إن فتح المشرف التعديل بعد النشر.
      */
      rows.forEach(s => {
        const editable = !s.published || !!s.owner_edit;
        const st = s.published ? el('span', { class:'badge badge--ok', text:'منشورة' })
                 : el('span', { class:'badge badge--warn', text:'مخفية — راجعها وانشرها' });
        box.appendChild(el('div', { class:'up-row' }, [
          el('span', { class:'up-row__ico', 'aria-hidden':'true' }, [ QBANK.subjIcon(s.icon, 18) ]),
          el('a', { class:'up-row__x', href: s.published ? '#/subject/' + s.id : '#/edit/' + s.id }, [
            el('span', { class:'up-row__t', text: s.name }),
            el('span', { class:'up-row__s num', text:
              QBANK.views.arNum(s.q_count || 0) + ' سؤالًا' +
              (Number(s.rating_n) ? ' · ★ ' + Number(s.rating_avg).toFixed(1) +
                ' (' + QBANK.views.arNum(s.rating_n) + ')' : ' · بلا تقييم بعد') })
          ]),
          st,
          editable ? el('a', { class:'btn btn--sm btn--soft', href:'#/edit/' + s.id,
            'aria-label':'حرّر ' + s.name, text: s.published ? 'حرّر' : 'راجع وانشر' }) : null
        ]));
      });
      box.appendChild(el('a', { class:'btn btn--ghost btn--block', href:'#/upload', text:'+ ارفع مادة أخرى' }));
    });
  return box;
}

/* ═══ نشاطي بالأرقام — لمحة تُقرأ في ثانية ═══ */
function myStatsCard(){
  const pack = QBANK.data.pack();
  const subs = pack.subjects || [];
  const mine = QBANK.views.mySubjects();
  let done = 0, total = 0;
  subs.forEach(s => {
    if (mine.indexOf(s.id) === -1) return;
    const pct = QBANK.progress.pctDone(s.id, s.q_count);
    done += Math.round((s.q_count || 0) * pct / 100); total += (s.q_count || 0);
  });
  const pct = total ? Math.round(done * 100 / total) : 0;
  return el('div', { class:'peer-stats' }, [
    el('div', { class:'peer-stat' }, [
      el('b', { class:'num', text: QBANK.views.arNum(mine.length) }), el('span', { text:'مادة عندي' }) ]),
    el('div', { class:'peer-stat' }, [
      el('b', { class:'num', text: QBANK.views.arNum(done) }), el('span', { text:'سؤالًا راجعته' }) ]),
    el('div', { class:'peer-stat' }, [
      el('b', { class:'num', text: QBANK.views.arNum(pct) + '٪' }), el('span', { text:'من موادي' }) ])
  ]);
}

/*
  لوحة الطالب بتبويبات: الملف · موادي · نشاطي · الحساب.
  السبب: الصفحة صارت طويلة (ملف، جامعة، محفظة، مواد، تقييمات، خطر الحذف)
  والتمرير الطويل يدفن ما يهم. والتبويب في الهاش فيبقى بعد التحديث.
*/
const ACC_TABS = [
  { id:'profile',  label:'ملفي',   ico:'user' },
  { id:'uploads',  label:'موادي',  ico:'upload' },
  { id:'activity', label:'نشاطي', ico:'activity' },
  { id:'account',  label:'الحساب', ico:'settings' }
];

const ViewAccount = {
  title:'حسابي',
  view(route){
    const u = QBANK.api.user();
    if (!u) return QBANK.views.ViewLogin.view();
    const active = (route && ACC_TABS.some(t => t.id === route.rest[0])) ? route.rest[0] : 'profile';

    /* أيقونة قبل كل تبويب: على الجوال تُقرأ الرموز قبل الكلمات، والشريحة
       المقسّمة (CSS .tabs) تجعلها أقسامَ شيءٍ واحد لا أزرارًا متفرّقة */
    const tabs = el('div', { class:'tabs', role:'tablist' }, ACC_TABS.map(t =>
      el('button', { class:'tabs__btn', type:'button', role:'tab', 'data-tab':t.id,
        'aria-selected': t.id === active ? 'true' : 'false' }, [
        el('span', { class:'tabs__ico', 'aria-hidden':'true' }, [ QBANK.ico(t.ico, { size:16 }) ]),
        el('span', { text:t.label }) ])));
    tabs.addEventListener('click', e => {
      const b = e.target.closest('[data-tab]');
      if (b) QBANK.router.go('#/account/' + b.getAttribute('data-tab'));
    });

    /* رابط الملف العام: الطالب ينشر ملفه كما ينشر مادته — بضغطة لا بثلاث */
    const shareBtn = el('button', { class:'btn btn--sm btn--ghost', type:'button', text:'⤴ انشر ملفي' });
    shareBtn.addEventListener('click', async () => {
      const r = await QBANK.share.sharePlain(QBANK.share.profileUrl(u.id),
        'ملفي على مراجعة', 'هذا ملفي على منصة مراجعة — بنوك أسئلتي وتقييمات زملائي');
      if (r.ok && r.via === 'copy') QBANK.toast('نُسخ رابط ملفك العام');
      else if (!r.ok && !r.cancelled) QBANK.toast('تعذّرت المشاركة');
    });
    const openMine = el('a', { class:'btn btn--sm btn--soft', href:'#/p/' + u.id, text:'👁 ملفي كما يراه زملائي' });

    const body = el('div', { class:'stack' });
    if (active === 'profile'){
      body.appendChild(accountBody());
      body.appendChild(campusCard());
    } else if (active === 'uploads'){
      /* ما توقّف رفعه قبل ما اكتمل: المسوّدة تُستأنف من هنا لا من ذاكرة صاحبها */
      if (QBANK.views.myDraftsCard) body.appendChild(QBANK.views.myDraftsCard());
      /* وما أرسله للمشرف ليرفعه عنه: حاله يُرى هنا لا يُسأل عنه في واتساب */
      if (QBANK.views.myRequestsCard) body.appendChild(QBANK.views.myRequestsCard());
      body.appendChild(myUploadsCard());
      const wallet = (QBANK.wallet && QBANK.wallet.body) ? QBANK.wallet.body() : null;
      if (wallet) body.appendChild(wallet);
    } else if (active === 'activity'){
      body.appendChild(myStatsCard());
      body.appendChild(QBANK.views.accountProgressCard());
      const links = (QBANK.wallet && QBANK.wallet.links) ? QBANK.wallet.links() : null;
      if (links) body.appendChild(links);
    } else {
      body.appendChild(QBANK.views.accountDangerCard());
    }

    return QBANK.views.page('حسابي', null, [
      el('div', { class:'ad-bar', style:'margin-bottom:8px' }, [ openMine, shareBtn ]),
      tabs, body
    ]);
  }
};

QBANK.views.accountBody = accountBody;
QBANK.views.accountProgressCard = accountProgressCard;
QBANK.views.accountDangerCard = accountDangerCard;
QBANK.views.myUploadsCard = myUploadsCard;
QBANK.views.myStatsCard = myStatsCard;
QBANK.views.campusCard = campusCard;
QBANK.views.ViewAccount = ViewAccount;
QBANK.views.ACC_TABS = ACC_TABS;
QBANK.views.uploadAvatar = uploadAvatar;
QBANK.views.AVATARS = AVATARS;

/* ═══════════════════════════════════════════════════════════════
   بطاقة الحساب في الترويسة — الشريط يعرف من أنت
   ═══════════════════════════════════════════════════════════════
   ★ العطل الذي كانت تُخفيه بساطته: زرّ «دخول» كان نصًّا ثابتًا في
   هيكل الصفحة، لا يمرّ عليه كود بعد أول رسم. فالطالب يدخل بنجاح ثم
   يرى الزرّ نفسه في مكانه، فيظنّ أن دخوله لم يُقبل — يعيد الكرّة،
   ويطلب رابطًا ثالثًا، ثم يقتنع أن المنصة معطوبة وينصرف.

   والبديل ليس إخفاء الزرّ: مكانه في الترويسة أثمن من أن يُترك فارغًا.
   وجهُك واسمُك هناك يقولان «أنت داخل» بلا كلمة، ويختصران طريق العودة
   إلى حسابك من كل شاشة.
*/
function authChip(){
  const slot = document.getElementById('authSlot');
  if (!slot) return;
  const u = QBANK.api.user();

  if (!u) {
    // خارج الجلسة: زرّ الدخول كما كان — ولا نعيد بناءه إن كان قائمًا
    if (slot.querySelector('[data-nav="#/login"]')) return;
    slot.innerHTML = '';
    slot.appendChild(el('a', { class:'btn btn--sm', href:'#/login',
                               'data-nav':'#/login', text:'دخول' }));
    return;
  }

  /* داخل الجلسة: الصورة ثم الاسم. والملف المخزّن يُقرأ بشرط أن يكون
     لصاحب هذه الجلسة (انظر حارس الهوية في accountBody) — فلا تظهر
     صورة من خرج قبل قليل على من دخل بعده. */
  const cached = QBANK.store.get('profile', null);
  const prof = (cached && cached.uid === u.id) ? cached : {};
  const name = (prof.name || '').trim() || (u.email || '').split('@')[0] || 'حسابي';

  // لا نعيد الرسم بلا تغيير: كل رسمٍ للترويسة يومض ويُربك قارئ الشاشة
  const admOk = (function(){ const a = QBANK.store.get('is_admin_check', null);
                             return !!(a && a.uid === u.id && a.ok); })();
  const sig = u.id + '|' + (prof.avatar_url || '') + '|' + (prof.avatar || '') + '|' + name +
              '|' + (admOk ? 'a' : '');
  if (slot.dataset.sig === sig) return;
  slot.dataset.sig = sig;

  const face = prof.avatar_url
    ? el('img', { class:'authchip__img', src: prof.avatar_url, alt:'' })
    : el('span', { class:'authchip__ico', 'aria-hidden':'true',
                   text: prof.avatar || '◍' });

  slot.innerHTML = '';

  /*
    ★ بابٌ دائم إلى اللوحة للمشرف.
    اللوحة تُخفي شريط الطالب، فمتى خرج المشرف منها إلى أي شاشة طالب —
    بزرٍّ، أو برابط مادة، أو بفضولٍ — فقد طريقَ العودة ولزمه أن يكتب
    المسار بيده. زرٌّ صغير في الترويسة يحلّ هذا كله، ولا يراه الطالب.
    والصلاحية من الذاكرة لا من نداءٍ جديد: الترويسة تُرسم مع كل شاشة.
  */
  const adm = QBANK.store.get('is_admin_check', null);
  if (adm && adm.uid === u.id && adm.ok) {
    slot.appendChild(el('a', { class:'iconbtn authchip__adm', href:'#/admin',
      'aria-label':'لوحة التحكم', title:'لوحة التحكم' }, [
      el('span', { class:'iconbtn__ico', 'aria-hidden':'true' }, [ QBANK.ico('settings', { size:18 }) ])
    ]));
  }

  slot.appendChild(el('a', { class:'authchip', href:'#/account', 'data-nav':'#/account',
                             'aria-label':'حسابي — ' + name }, [
    face,
    el('span', { class:'authchip__n', text: name })
  ]));
}
QBANK.authChip = authChip;
