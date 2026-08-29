/*
  شاشات المرحلة ٠: فارغة عمدًا.
  لا مواد ولا أسئلة مكتوبة داخل الكود — المحتوى يأتي كلّه لاحقًا من قاعدة البيانات
  بعد أن يعتمده المشرف. هذه الشاشات تُثبت أن الهيكل والتنقّل والمظهر يعملون.
*/
// el و esc معرّفتان في 00-core.js داخل نفس النطاق، فلا نُعيد تعريفهما

function page(title, sub, body){
  const head = el('header', { class:'page__head' }, [
    el('h1', { class:'page__title', text:title }),
    sub ? el('p', { class:'page__sub', text:sub }) : null
  ]);
  return el('div', { class:'page' }, [head].concat(body || []));
}

function empty(ico, title, text, action){
  return el('div', { class:'card' }, [
    el('div', { class:'empty' }, [
      el('span', { class:'empty__ico', 'aria-hidden':'true', text:ico }),
      el('p', { class:'empty__title', text:title }),
      el('p', { class:'empty__text', text:text }),
      action || null
    ])
  ]);
}

function stageNote(){
  return el('p', { class:'row' }, [
    el('span', { class:'badge badge--warn', text:'المرحلة ٠ · الهيكل' }),
    el('span', { class:'badge', text:'المحتوى يُضاف من لوحة التحكم' })
  ]);
}

/* ١ · الرئيسية — بطاقات المواد: «موادي» ثم «مواد أخرى متاحة» */
function subjectColor(c){
  // اللون اسم متغيّر من نظام التصميم — لا hex حر من قاعدة البيانات
  return /^subject-[1-6]$/.test(c || '') ? 'var(--' + c + ')' : 'var(--subject-1)';
}
function daysLeft(dateStr, now){
  if (!dateStr) return null;
  const d = new Date(dateStr).getTime() - (now || Date.now());
  return Math.ceil(d / 86400000);
}
function mySubjects(){ return AMUSQ.store.get('my_subjects', []); }

function subjectCard(sub){
  const mine = mySubjects().indexOf(sub.id) !== -1;
  const left = daysLeft(sub.exam_date);
  const past = left !== null && left < 0;
  const pct = AMUSQ.progress.pctDone(sub.id, sub.q_count);
  const color = subjectColor(sub.color);

  const card = el('article', { class:'card subj' + (past ? ' is-past' : ''), tabindex:'0', role:'link',
    'aria-label':'مادة ' + sub.name }, [
    el('div', { class:'subj__bar', style:'background:' + color, 'aria-hidden':'true' }),
    el('div', { class:'row' }, [
      el('span', { class:'subj__ico', 'aria-hidden':'true', text: sub.icon || '▤' }),
      el('div', {}, [
        el('h3', { style:'margin:0', text: sub.name }),
        el('span', { class:'badge num', text: sub.q_count + ' سؤالًا' })
      ]),
      el('span', { class:'spacer' }),
      past ? el('span', { class:'stamp', text:'تم الانتهاء ✓' })
           : (left !== null ? el('span', { class:'badge badge--warn num', text:'الاختبار بعد ' + left + ' يوم' }) : null),
      sub.free ? el('span', { class:'badge badge--ok', text:'مجانية' }) : null
    ]),
    el('div', { class:'subj__meter', 'aria-label':'أنجزت ' + pct + '٪' }, [
      el('div', { style:'width:' + pct + '%;background:' + color })
    ])
  ]);
  card.addEventListener('click', () => AMUSQ.router.go('#/subject/' + sub.id));
  card.addEventListener('keydown', e => { if (e.key === 'Enter') AMUSQ.router.go('#/subject/' + sub.id); });
  return card;
}

const ViewHome = {
  title:'الرئيسية',
  view(){
    const pack = AMUSQ.data.pack();
    const subjects = (pack.subjects || []).slice();
    const body = [];

    if (pack.settings && pack.settings.welcome_text)
      body.push(el('div', { class:'card' }, [ el('p', { style:'margin:0', text: pack.settings.welcome_text }) ]));

    if (!subjects.length) {
      body.push(empty('▤', 'لا مواد بعد',
        AMUSQ.config.ready()
          ? 'لم تُنشر مواد حتى الآن — عد قريبًا، أو تأكد من الاتصال لمزامنة الجديد.'
          : 'المنصة تبدأ فارغة عن قصد. يضيف المشرف المواد من لوحة التحكم وستظهر هنا فور نشرها.',
        el('div', { class:'row', style:'justify-content:center;margin-top:16px' }, [
          el('a', { class:'btn', href:'#/admin', text:'افتح لوحة التحكم' })
        ])));
      body.push(el('div', { class:'grid grid--2', id:'subjectsGrid' }));
      return page('موادي', 'اختر مادة لتبدأ المراجعة.', body);
    }

    // المنتهية تنزل آخر القائمة تلقائيًا
    const order = arr => arr.slice().sort((x, y) => {
      const px = (daysLeft(x.exam_date) ?? 1) < 0 ? 1 : 0;
      const py = (daysLeft(y.exam_date) ?? 1) < 0 ? 1 : 0;
      return px - py || (x.ord || 0) - (y.ord || 0);
    });
    const mineIds = mySubjects();
    const mine = order(subjects.filter(su => mineIds.indexOf(su.id) !== -1));
    const other = order(subjects.filter(su => mineIds.indexOf(su.id) === -1));

    if (mine.length) {
      body.push(el('h2', { text:'موادي' }));
      body.push(el('div', { class:'grid grid--2', id:'subjectsGrid' }, mine.map(subjectCard)));
    }
    if (other.length) {
      body.push(el('h2', { text: mine.length ? 'مواد أخرى متاحة' : 'المواد المتاحة' }));
      body.push(el('div', { class:'grid grid--2', id: mine.length ? null : 'subjectsGrid' }, other.map(su => {
        const c = subjectCard(su);
        const add = el('button', { class:'btn btn--sm btn--soft', type:'button',
          'aria-label':'أضف ' + su.name + ' إلى موادي', text:'+ أضف إلى موادي' });
        add.addEventListener('click', e => {
          e.stopPropagation();
          const list = mySubjects();
          if (list.indexOf(su.id) === -1) { list.push(su.id); AMUSQ.store.set('my_subjects', list); }
          AMUSQ.api.rest('enrollments', { method:'POST', body: JSON.stringify({
            user_id: (AMUSQ.api.user() || {}).id, subject_id: su.id }) });
          AMUSQ.toast('أُضيفت «' + su.name + '» إلى موادك');
          AMUSQ.router.render('#/');
        });
        c.appendChild(el('div', { class:'row', style:'margin-top:8px' }, [add]));
        return c;
      })));
    }
    return page('موادي', 'اختر مادة لتبدأ المراجعة.', body);
  }
};

/* ٢ · دخول الطالب — رابط سحري + جوجل + آبل */
function loginCard(opts){
  // بطاقة دخول واحدة للطالب والمشرف — الفرق في العنوان والوجهة بعد النجاح فقط
  const email = el('input', { class:'input', type:'email', id:opts.emailId,
    placeholder:'name@example.com', dir:'ltr', autocomplete:'email' });
  const btn = el('button', { class:'btn btn--block', type:'button', text:'أرسل رابط الدخول' });
  const msg = el('p', { class:'field__hint', role:'status' });

  async function send(){
    const val = (email.value || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val)) { msg.textContent = 'اكتب بريدًا صحيحًا أولًا.'; email.focus(); return; }
    if (!AMUSQ.config.ready()) { msg.textContent = 'المنصة غير موصولة بالخادم بعد — يضبطها المشرف من الإعدادات.'; return; }
    btn.setAttribute('aria-disabled','true'); btn.textContent = 'جارٍ الإرسال…';
    const r = await AMUSQ.api.auth.magic(val);
    btn.removeAttribute('aria-disabled'); btn.textContent = 'أرسل رابط الدخول';
    if (r.ok) { msg.textContent = 'تم! افتح بريدك واضغط رابط الدخول.'; AMUSQ.toast('أُرسل رابط الدخول'); }
    else if (r.offline) msg.textContent = 'لا اتصال بالإنترنت — الدخول يحتاج اتصالًا مرة واحدة فقط.';
    else msg.textContent = 'تعذّر الإرسال. تحقق من البريد وحاول ثانية.';
  }
  btn.addEventListener('click', send);
  email.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });

  const gBtn = el('button', { class:'btn btn--ghost btn--block', type:'button', text:'الدخول بحساب جوجل' });
  const aBtn = el('button', { class:'btn btn--ghost btn--block', type:'button', text:'الدخول بحساب آبل' });
  gBtn.addEventListener('click', () => { const u = AMUSQ.api.auth.oauthUrl('google'); if (u) location.href = u; else AMUSQ.toast('المنصة غير موصولة بالخادم بعد'); });
  aBtn.addEventListener('click', () => { const u = AMUSQ.api.auth.oauthUrl('apple');  if (u) location.href = u; else AMUSQ.toast('المنصة غير موصولة بالخادم بعد'); });

  return el('div', { class:'card stack' }, [
    el('label', { class:'field', style:'margin:0' }, [
      el('span', { class:'field__label', text: opts.label }),
      email,
      el('span', { class:'field__hint', text:'يصلك رابط دخول بلا كلمة مرور.' })
    ]),
    btn, msg,
    el('hr', { class:'divider', style:'margin:0' }),
    gBtn, aBtn
  ]);
}

const ViewLogin = {
  title:'دخول الطالب',
  view(){
    if (AMUSQ.api.user()) { return page('حسابي', null, [ AMUSQ.views.accountBody() ]); }
    return page('دخول الطالب', 'سجّل ليُحفظ تقدّمك في حسابك ويتزامن بين أجهزتك.', [
      loginCard({ emailId:'loginEmail', label:'البريد الإلكتروني' }),
      el('div', { class:'card' }, [
        el('p', { class:'page__sub', text:'ليس لديك حساب؟ جرّب المادة المجانية أولًا بلا تسجيل.' }),
        el('a', { class:'btn btn--soft btn--block', href:'#/', text:'تصفّح كزائر' })
      ])
    ]);
  }
};

/* ٣ · دخول المشرف — نفس آلية الدخول بواجهة مستقلة، والتخويل في قاعدة البيانات */
const ViewAdminLogin = {
  title:'دخول المشرف',
  view(){
    return page('دخول المشرف', 'واجهة منفصلة، والتحقق من الصلاحية في قاعدة البيانات عبر is_admin() لا في المتصفح.', [
      loginCard({ emailId:'adminEmail', label:'بريد المشرف' })
    ]);
  }
};

/* ٥ · الإعدادات */
const ViewSettings = {
  title:'الإعدادات',
  view(){
    const themeRow = el('div', { class:'row' }, [
      el('span', { text:'الوضع الليلي' }),
      el('span', { class:'spacer' }),
      el('button', { class:'btn btn--soft btn--sm', type:'button', id:'setThemeBtn', text:'تبديل' })
    ]);
    themeRow.querySelector('#setThemeBtn').addEventListener('click', () => {
      const mode = AMUSQ.theme.toggle();
      AMUSQ.toast(mode === 'dark' ? 'الوضع الليلي مُفعَّل' : 'الوضع الفاتح مُفعَّل');
    });

    const resetRow = el('div', { class:'row' }, [
      el('span', { text:'تصفير بيانات هذا الجهاز' }),
      el('span', { class:'spacer' }),
      el('button', { class:'btn btn--ghost btn--sm', type:'button', id:'resetBtn', text:'تصفير' })
    ]);
    resetRow.querySelector('#resetBtn').addEventListener('click', () => {
      AMUSQ.store.clearAll();
      AMUSQ.theme.apply('auto');
      AMUSQ.toast('حُذفت بيانات هذا الجهاز');
    });

    return page('الإعدادات', 'تخصّ هذا الجهاز، ولا تُغيّر حسابك.', [
      el('div', { class:'card stack' }, [ themeRow, el('hr', { class:'divider' }), resetRow ]),
      el('div', { class:'card' }, [
        el('h2', { text:'عن المنصة' }),
        el('p', { class:'page__sub', text:'AMUSQ — منصة مراجعة تفاعلية لطلاب التخصصات الصحية. الإصدار ' + AMUSQ.version + ' · المرحلة ' + AMUSQ.stage })
      ])
    ]);
  }
};

/* ٦ · صفحة غير موجودة */
const ViewNotFound = {
  title:'الصفحة غير موجودة',
  view(){
    return page('الصفحة غير موجودة', null, [
      empty('؟', 'لم نجد هذه الصفحة', 'ربما تغيّر الرابط. عد إلى الرئيسية وتابع من هناك.',
        el('div', { class:'row', style:'justify-content:center;margin-top:16px' }, [
          el('a', { class:'btn', href:'#/', text:'الرئيسية' })
        ]))
    ]);
  }
};

AMUSQ.views = { ViewHome, ViewLogin, ViewAdminLogin, ViewSettings, ViewNotFound, page, empty, stageNote, subjectColor, daysLeft, mySubjects };
