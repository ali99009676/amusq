/*
  شاشة «حسابي»: الاسم، الصورة الرمزية، التقدّم، المزامنة، الخروج، الحذف النهائي.
  الحذف شرط متجر آبل — زر حقيقي يمسح كل شيء، لا وعد شكلي.
*/
const AVATARS = ['🧑‍⚕️','👩‍⚕️','🩺','🚑','💉','🧠','🫀','🦴','🔬','📚'];

function accountBody(){
  const u = AMUSQ.api.user();
  if (!u) return el('div');
  const prof = AMUSQ.store.get('profile', { name:'', avatar: AVATARS[0] });

  const nameInput = el('input', { class:'input', id:'accName', value: prof.name || '', placeholder:'اسمك الظاهر في المنصة' });
  const avatarRow = el('div', { class:'row', role:'radiogroup', 'aria-label':'الصورة الرمزية' },
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

  const saveBtn = el('button', { class:'btn btn--block', type:'button', text:'احفظ' });
  saveBtn.addEventListener('click', async () => {
    const picked = avatarRow.querySelector('[aria-checked="true"] .iconbtn__ico');
    const data = { name: nameInput.value.trim(), avatar: picked ? picked.textContent : AVATARS[0] };
    AMUSQ.store.set('profile', data);
    const r = await AMUSQ.api.saveProfile(data);
    AMUSQ.toast(r.ok ? 'حُفظ ملفك' : 'حُفظ في جهازك، وسيتزامن عند الاتصال');
  });

  // تقدّمي في كل مادة — من الحزمة المحلية، فيعمل بلا إنترنت
  const pack = AMUSQ.data.pack();
  const progList = el('div', { class:'stack' },
    (pack.subjects || []).map(s => {
      const pct = AMUSQ.progress.pctDone(s.id, s.q_count);
      return el('div', { class:'row' }, [
        el('span', { text: (s.icon || '▤') + ' ' + s.name }),
        el('span', { class:'spacer' }),
        el('span', { class:'badge num', text: pct + '٪' })
      ]);
    })
  );

  const syncBtn = el('button', { class:'btn btn--soft btn--block', type:'button', text:'زامن الآن' });
  syncBtn.addEventListener('click', async () => {
    const r = await AMUSQ.progress.pull();
    AMUSQ.toast(r.ok ? 'تمت المزامنة والدمج' : 'تعذّرت المزامنة — لا اتصال');
  });

  const outBtn = el('button', { class:'btn btn--ghost btn--block', type:'button', text:'تسجيل الخروج' });
  outBtn.addEventListener('click', async () => {
    await AMUSQ.api.auth.signOut();
    AMUSQ.toast('خرجت من حسابك — تقدّمك باقٍ في جهازك');
    AMUSQ.router.go('#/');
  });

  // الحذف النهائي: تأكيد بكتابة كلمة صريحة — خطوة لا تُتراجَع
  const delBtn = el('button', { class:'btn btn--ghost btn--block', type:'button',
    style:'color:var(--bad);border-color:var(--bad)', text:'احذف حسابي نهائيًا' });
  delBtn.addEventListener('click', async () => {
    const word = (typeof prompt === 'function') ? prompt('سيُحذف حسابك وكل بياناتك نهائيًا ولا رجوع. اكتب «حذف» للتأكيد:') : null;
    if (word !== 'حذف') { AMUSQ.toast('أُلغي الحذف'); return; }
    const r = await AMUSQ.api.auth.deleteMe();
    if (r.ok) { await AMUSQ.data.clearAll(); AMUSQ.toast('حُذف حسابك وكل بياناته'); AMUSQ.router.go('#/'); }
    else AMUSQ.toast('تعذّر الحذف — تحقق من الاتصال');
  });

  return el('div', { class:'stack' }, [
    el('div', { class:'card stack' }, [
      el('p', { class:'page__sub num', text: u.email || '' }),
      el('label', { class:'field', style:'margin:0' }, [
        el('span', { class:'field__label', text:'الاسم' }), nameInput
      ]),
      el('div', { class:'field', style:'margin:0' }, [
        el('span', { class:'field__label', text:'الصورة الرمزية' }), avatarRow
      ]),
      saveBtn
    ]),
    el('div', { class:'card' }, [ el('h2', { text:'تقدّمي' }), progList ]),
    el('div', { class:'card stack' }, [ syncBtn, outBtn, el('hr', { class:'divider', style:'margin:0' }), delBtn ])
  ]);
}

const ViewAccount = {
  title:'حسابي',
  view(){
    if (!AMUSQ.api.user()) return AMUSQ.views.ViewLogin.view();
    return AMUSQ.views.page('حسابي', null, [ accountBody() ]);
  }
};

AMUSQ.views.accountBody = accountBody;
AMUSQ.views.ViewAccount = ViewAccount;
AMUSQ.views.AVATARS = AVATARS;
