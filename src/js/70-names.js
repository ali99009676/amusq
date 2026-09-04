/*
  ═══════════════════════════════════════════════════════════════════
  مرشّح الأسماء — الطبقة الأولى (المتصفح)
  ═══════════════════════════════════════════════════════════════════
  اللوحة عامة والاسم يظهر لكل الطلاب، فمن غير مرشّح تمتلئ بما لا يُقرأ —
  هذا مجرَّب في AMSU. المرشّح هنا يرفض الاسم لحظة كتابته ويشرح السبب،
  والحكمُ الأخير في القاعدة (db/BOARD.sql: name_blocked) لأن الطالب قد
  يكتب اسمه في ملفه بنداءٍ مباشر متجاوزًا هذه الشاشة.

  القوائم الثلاث هنا نسخةٌ طبق الأصل من جدول qbank.name_rules — سلوكٌ
  واحد في المكانين، والفحوص تُطابق بينهما.
*/

const Names = {
  MASK: 'اسم محظور',
  MAX: 24,

  /* ★ الاستثناء يُفحص أولًا ويغلب: حجب اسم طالب حقيقي أسوأ من مرور مسيء واحد */
  ALLOW: ['عمر','عمرو','عمار','معتز','خوله','زبير','زبيده','حسان','بسام','قصي','لوط','شعيب',
          'نعمه','طعمه','مكسيم','كسري','باكستان','اسامه','حمزه','معاذ','سهيل','منير','شرمين'],
  /* جذور: تُطابَق ولو جاءت داخل الاسم — طويلة ومميّزة */
  ROOTS: ['شرموط','شرمط','منيوك','منيك','عرص','خول','زبي','كسم','كساخ','طيزك','قحب','عاهر',
          'fuck','fuk','shit','bitch','cunt','dick','pussy','nigg','sex','porn','whore','slut'],
  /* كلمات كاملة: قصيرة أو ملتبسة، لا تُطابَق إلا وحدها */
  EXACT: ['كس','زب','طيز','كلب','حمار','خنزير','admin','مشرف','الاداره','root','ass','cock',
          'gay','nazi','hitler','isis','داعش'],

  /*
    التطبيع — يطابق qbank.name_norm حرفًا بحرف:
    حذف التشكيل والتطويل، توحيد (أ إ آ ٱ ← ا) (ى ← ي) (ة ← ه) (ؤ ← و) (ئ ← ي)،
    أرقام عربية ← لاتينية، إزالة كل ما ليس حرفًا أو رقمًا، ثم طيّ التكرار.
  */
  norm(t){
    let s = String(t || '').toLowerCase().replace(/[ً-ْـ]/g, '');
    s = s.replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي');
    s = s.replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]);
    s = s.replace(/[^a-z0-9؀-ۿ]/g, '');
    return s.replace(/(.)\1+/g, '$1');
  },
  /* أرقامٌ بدل حروف — قواعد العربية واللاتينية متضاربة فيُجرَّب كلٌّ على حدة */
  normAr(t){ return Names.norm(t).replace(/[375928]/g, d => ({ '3':'ع','7':'ح','5':'خ','9':'ق','2':'ا','8':'غ' })[d]); },
  normEn(t){ return Names.norm(t).replace(/[104357]/g, d => ({ '1':'i','0':'o','4':'a','3':'e','5':'s','7':'t' })[d]); },

  blocked(t){
    const forms = [Names.norm(t), Names.normAr(t), Names.normEn(t)];
    if (!forms[0]) return false;
    if (forms.some(f => Names.ALLOW.indexOf(f) !== -1)) return false;
    if (Names.ROOTS.some(r => forms.some(f => f.indexOf(r) !== -1))) return true;
    if (Names.EXACT.some(w => forms.indexOf(w) !== -1)) return true;
    return false;
  },

  /*
    الاسم كما يُقبل: ٢٤ حرفًا، حرفٌ واحد على الأقل عربي أو لاتيني، وغير محظور.
    يعيد { ok, name, why } — و«لماذا» تُقال للطالب لا تُخفى وراء «اسم غير صالح».
  */
  clean(raw){
    const name = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, Names.MAX);
    if (!/[؀-ۿa-zA-Z]/.test(name)) return { ok:false, name, why:'اكتب اسمًا بحروف — عربية أو لاتينية.' };
    if (name.length < 2) return { ok:false, name, why:'الاسم أقصر من حرفين.' };
    if (Names.blocked(name)) return { ok:false, name, why:'هذا الاسم غير مناسب للوحة المتصدرين — اختر اسمًا آخر يعرفك به زملاؤك.' };
    return { ok:true, name, why:'' };
  },

  /* اسم العرض كما يخرج من الخادم — والمتصفح يقنّع أيضًا احتياطًا لا اعتمادًا */
  shown(t){ return Names.blocked(t) ? Names.MASK : (String(t || '').trim() || 'طالب'); }
};
QBANK.names = Names;

/*
  ═══ بوابة الاسم ═══
  اللوحة بلا أسماء لا تحفّز أحدًا، والاسم الاختياري يعني أن نصف الطلاب لا
  يظهرون فتبدو اللوحة فارغة وهي ليست كذلك. فمن دخل بحسابٍ بلا اسم يرى
  نافذةً بلا زر تخطٍّ وبلا إغلاق بالنقر خارجها — تُغلق بالاسم وحده.
  ★ لا تُفتح مرتين، ولا تُفتح لزائرٍ بلا حساب (الزائر يُطلب منه الدخول لا الاسم).
*/
function nameGate(onDone){
  if (document.querySelector('.namebox')) return null;
  const u = QBANK.api.user();
  if (!u) return null;
  document.documentElement.classList.add('gated');

  const input = el('input', { class:'input', id:'gateName', maxlength: String(Names.MAX),
    placeholder:'اسمك كما يعرفك زملاؤك', 'aria-label':'اسمك' });
  const msg = el('p', { class:'field__hint', role:'alert', style:'margin:0; min-height:1.4em' });
  const btn = el('button', { class:'btn btn--block', type:'button', text:'احفظ اسمي وادخل' });
  const box = el('div', { class:'namebox', role:'dialog', 'aria-modal':'true', 'aria-labelledby':'gateT' }, [
    el('div', { class:'namebox__card card stack' }, [
      el('span', { class:'namebox__ico', 'aria-hidden':'true' }, [ QBANK.ico('trophy', { size:20 }) ]),
      el('h2', { id:'gateT', style:'margin:0', text:'باسمك تدخل اللوحة' }),
      el('p', { class:'field__hint', style:'margin:0', text:
        'كل اختبارٍ تؤدّيه يُحسب لك في لوحة المتصدرين — بجامعتك وبين كل الجامعات. اكتب الاسم الذي يعرفك به زملاؤك.' }),
      input, msg, btn
    ])
  ]);
  const save = async () => {
    const r = Names.clean(input.value);
    if (!r.ok){ msg.textContent = r.why; input.focus(); return; }
    btn.disabled = true; msg.textContent = '';
    const prof = Object.assign({}, QBANK.store.get('profile', null) || {}, { uid: u.id, name: r.name });
    QBANK.store.set('profile', prof);
    try { await QBANK.api.saveProfile({ name: r.name }); } catch(e){}
    document.documentElement.classList.remove('gated');
    box.remove();
    if (onDone) onDone(r.name);
  };
  btn.addEventListener('click', save);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
  /* النقر خارج البطاقة لا يُغلق — البوابة إلزامية */
  box.addEventListener('click', e => { if (e.target === box) input.focus(); });
  document.body.appendChild(box);
  setTimeout(() => { try { input.focus(); } catch(e){} }, 50);
  return box;
}
QBANK.views.nameGate = nameGate;

/*
  متى تُفتح؟ عند أول شاشة بعد الدخول إن كان الملف بلا اسم. نسأل الملف
  المخبَّأ أولًا (بلا شبكة)، ثم الخادم مرةً واحدة في الجلسة.
*/
Names.checkGate = async function(){
  const u = QBANK.api.user();
  if (!u) return false;
  const cached = QBANK.store.get('profile', null);
  if (cached && cached.uid === u.id && String(cached.name || '').trim()) return false;
  if (Names._asked) return false;
  Names._asked = true;
  let name = '';
  try { const r = await QBANK.api.myProfile(); name = (r.ok && r.data && r.data.name) || ''; } catch(e){}
  if (String(name).trim()){
    QBANK.store.set('profile', Object.assign({}, cached || {}, { uid: u.id, name: String(name).trim() }));
    return false;
  }
  nameGate();
  return true;
};
