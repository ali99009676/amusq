/*
  شاشة «حسابي»: الاسم، الصورة الرمزية، التقدّم، المزامنة، الخروج، الحذف النهائي.
  الحذف شرط متجر آبل — زر حقيقي يمسح كل شيء، لا وعد شكلي.
*/
const AVATARS = ['🧑‍⚕️','👩‍⚕️','🩺','🚑','💉','🧠','🫀','🦴','🔬','📚'];

function accountBody(){
  const u = QBANK.api.user();
  if (!u) return el('div');
  const prof = QBANK.store.get('profile', { name:'', avatar: AVATARS[0] });

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
    QBANK.store.set('profile', data);
    const r = await QBANK.api.saveProfile(data);
    QBANK.toast(r.ok ? 'حُفظ ملفك' : 'حُفظ في جهازك، وسيتزامن عند الاتصال');
  });

  // تقدّمي في كل مادة — من الحزمة المحلية، فيعمل بلا إنترنت
  const pack = QBANK.data.pack();
  const progList = el('div', { class:'stack' },
    (pack.subjects || []).map(s => {
      const pct = QBANK.progress.pctDone(s.id, s.q_count);
      return el('div', { class:'row' }, [
        el('span', { text: (s.icon || '▤') + ' ' + s.name }),
        el('span', { class:'spacer' }),
        el('span', { class:'badge num', text: pct + '٪' })
      ]);
    })
  );

  const syncBtn = el('button', { class:'btn btn--soft btn--block', type:'button', text:'زامن الآن' });
  syncBtn.addEventListener('click', async () => {
    const r = await QBANK.progress.pull();
    QBANK.toast(r.ok ? 'تمت المزامنة والدمج' : 'تعذّرت المزامنة — لا اتصال');
  });

  const outBtn = el('button', { class:'btn btn--ghost btn--block', type:'button', text:'تسجيل الخروج' });
  outBtn.addEventListener('click', async () => {
    await QBANK.api.auth.signOut();
    QBANK.toast('خرجت من حسابك — تقدّمك باقٍ في جهازك');
    QBANK.router.go('#/');
  });

  // الحذف النهائي: تأكيد بكتابة كلمة صريحة — خطوة لا تُتراجَع
  const delBtn = el('button', { class:'btn btn--ghost btn--block', type:'button',
    style:'color:var(--bad);border-color:var(--bad)', text:'احذف حسابي نهائيًا' });
  delBtn.addEventListener('click', async () => {
    const word = (typeof prompt === 'function') ? prompt('سيُحذف حسابك وكل بياناتك نهائيًا ولا رجوع. اكتب «حذف» للتأكيد:') : null;
    if (word !== 'حذف') { QBANK.toast('أُلغي الحذف'); return; }
    const r = await QBANK.api.auth.deleteMe();
    if (r.ok) { await QBANK.data.clearAll(); QBANK.toast('حُذف حسابك وكل بياناته'); QBANK.router.go('#/'); }
    else QBANK.toast('تعذّر الحذف — تحقق من الاتصال');
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
    if (!QBANK.api.user()) return QBANK.views.ViewLogin.view();
    // المحفظة تُبنى في 47-wallet.js — تُلحق هنا حين تكون محمّلة
    const wallet = (QBANK.wallet && QBANK.wallet.body) ? QBANK.wallet.body() : null;
    const links  = (QBANK.wallet && QBANK.wallet.links) ? QBANK.wallet.links() : null;
    return QBANK.views.page('حسابي', null, [ accountBody(), wallet, links ]);
  }
};

QBANK.views.accountBody = accountBody;
QBANK.views.ViewAccount = ViewAccount;
QBANK.views.AVATARS = AVATARS;
