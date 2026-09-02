/*
  رابط المشاركة القصير: #s/slug?ref=USER_ID

  الموجّه يجرّد «#» و«/» الأولى معًا، فمسار واحد مسجَّل باسم '#/s' يلتقط
  الصيغتين: #s/slug و #/s/slug — ويبقى الرابط قصيرًا كما يُشارَك في الواتساب.

  هذه الشاشة تعريفية لا محتوى فيها: من وصل عبر رابط زميله يرى ما في المادة
  وسعرها وزر الشراء، ولا يُحتسب له رصيد تجربة.
*/
function shareUrl(slug, userId){
  /*
    ★ typeof location !== 'undefined' لا يكفي.
    الوصف موجود دائمًا، والذي يفشل هو القراءة منه: بعد تفكيك المستند
    (إغلاق تبويب، أو صفحة أُخليت وطلبٌ غير متزامن ما زال يعود) يرمي
    الوصفُ استثناءً فينهار كل ما بُني في تلك اللحظة. try هو الحارس الوحيد
    الذي يمسك هذا، وليس فحص الوجود.
  */
  let base = 'https://amsuq.alsoqoor.com/';
  try {
    if (typeof location !== 'undefined' && location.protocol.indexOf('http') === 0)
      base = location.origin + location.pathname;
  } catch(e){ /* مستند مفكَّك — نبقى على العنوان الثابت */ }
  return base + '#s/' + slug + (userId ? '?ref=' + userId : '');
}

function copyRow(url){
  const inp = el('input', { class:'input', dir:'ltr', readonly:'', value:url, 'aria-label':'رابط المادة' });
  const btn = el('button', { class:'btn btn--sm', type:'button', text:'انسخ الرابط' });
  btn.addEventListener('click', () => {
    inp.select();
    // clipboard API قد يُمنع على file:// أو بلا https — execCommand احتياطًا لا مكتبة
    const done = (navigator.clipboard && navigator.clipboard.writeText)
      ? (navigator.clipboard.writeText(url), true)
      : (function(){ try { return document.execCommand('copy'); } catch(e){ return false; } })();
    QBANK.toast(done ? 'نُسخ الرابط' : 'انسخه يدويًا من الحقل');
  });
  return el('div', { class:'sharebox' }, [ inp, btn ]);
}

const ViewShare = {
  title:'مادة مشتركة',
  view(route){
    const slug = route.rest[0];
    QBANK.gate.captureRef(route.query);       // نحفظ المُحيل فورًا قبل أي تنقّل
    if (!slug) return QBANK.views.ViewNotFound.view();

    const box = el('div', { class:'stack' }, [ el('p', { class:'page__sub', text:'جارٍ فتح المادة…' }) ]);
    QBANK.api.rest('subjects?slug=eq.' + encodeURIComponent(slug) +
      '&select=id,name,descr,icon,color,q_count,price,free,published,status,created_by').then(r => {
      if (!box.isConnected) return;
      box.innerHTML = '';
      const sub = (r.ok && r.data && r.data[0]) || null;
      if (!sub || sub.status !== 'published'){
        box.appendChild(QBANK.views.empty('؟', 'المادة غير متاحة',
          'ربما أوقفها المشرف أو تغيّر رابطها.', el('a', { class:'btn', href:'#/', text:'الرئيسية' })));
        return;
      }
      const u = QBANK.api.user();
      const mine = u && sub.created_by === u.id;

      box.appendChild(el('div', { class:'card', style:'text-align:center' }, [
        el('span', { class:'empty__ico', 'aria-hidden':'true', text: sub.icon || '▤' }),
        el('p', { class:'empty__title', text: sub.name }),
        sub.descr ? el('p', { class:'empty__text', text: sub.descr }) : null,
        el('div', { class:'row', style:'justify-content:center' }, [
          el('span', { class:'badge num', text: (sub.q_count || 0) + ' سؤالًا' }),
          sub.price ? el('span', { class:'badge badge--ok num', text: sub.price + ' ريال' }) : null
        ])
      ]));

      if (mine){
        box.appendChild(el('div', { class:'card stack' }, [
          el('h2', { text:'هذه مادتك' }),
          el('p', { class:'field__hint', text:'شاركها مع زملائك — كل عملية شراء عبر رابطك تضيف كوينز لرصيدك.' }),
          copyRow(shareUrl(slug, u.id)),
          el('a', { class:'btn btn--block', href:'#/subject/' + sub.id, text:'افتح المادة' })
        ]));
      } else if (!u){
        box.appendChild(el('div', { class:'card stack' }, [
          el('p', { class:'field__hint', text:'سجّل دخولك أولًا لتشتري المادة وتفتحها على كل أجهزتك.' }),
          el('a', { class:'btn btn--block', href:'#/login', text:'سجّل الدخول' })
        ]));
      } else {
        // الزميل لا تجربة له — إلى الشراء مباشرة، وهذا مقصود لا سهو
        box.appendChild(QBANK.gate.paywallCard(sub));
      }
    });

    return QBANK.views.page('مادة مشتركة', 'وصلك هذا الرابط من زميل.', [box]);
  }
};

/* ═══════════════════════════════════════════════════════════════════
   زرّ نشرٍ واحد لكل شيء
   ═══════════════════════════════════════════════════════════════════
   كان النشر مقصورًا على المادة، وبصيغةٍ واحدة: حقلٌ ونسخ. وهذا يفترض أن
   الطالب سينسخ ثم يفتح واتساب ثم يلصق — ثلاث خطوات يسقط في كل واحدة منها
   بعضُهم. ونافذة النظام تفعلها بضغطة واحدة وتعرض عليه تطبيقاته كلها.

   ولأن كل شيء في المنصة يستحق أن يُرسَل — مادة، ملف طالب، جامعة، تحدٍّ —
   جعلناه مكوّنًا واحدًا يقبل أي رابط. الميزة التي تُبنى مرةً وتُستعمل في
   عشرة مواضع خيرٌ من عشر نسخ تتباعد مع الوقت.
*/

/* رابطٌ مطلق لأي مسار داخلي: الروابط النسبية لا تُرسَل */
function absUrl(hash){
  let base = 'https://amsuq.alsoqoor.com/';
  try {
    if (typeof location !== 'undefined' && location.protocol.indexOf('http') === 0)
      base = location.origin + location.pathname;
  } catch(e){ /* مستند مفكَّك */ }
  return base + String(hash || '#/').replace(/^#?\/?/, '#/');
}

/* روابط الأشياء التي تُنشَر — في موضع واحد كي لا تتفرّق صيغها */
function profileUrl(userId){ return absUrl('#/p/' + userId); }
function universityUrl(uniId){ return absUrl('#/u/' + uniId); }

/*
  المشاركة نفسها. نافذة النظام أولًا لأنها الأقصر وتعرض تطبيقاته كلها،
  ثم الحافظة. ولا نَعِد بما لا نملك: navigator.share غائب على أغلب
  متصفحات سطح المكتب، فنسأل عنه ولا نفترضه.
*/
async function sharePlain(url, title, text){
  try {
    if (navigator.share) {
      await navigator.share({ title: title || 'مراجعة', text: text || '', url: url });
      return { ok:true, via:'share' };
    }
  } catch(e){ return { ok:false, cancelled:true }; }
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(url);
      return { ok:true, via:'copy' };
    }
  } catch(e){}
  return { ok:false };
}

/*
  زرّ النشر. opts: { url, title, text, label, block }
  والواتساب بجانبه دائمًا: هو حيث تعيش مجموعات الدفعة فعلًا، ولا يُعتمد
  فيه على دعم المتصفح لشيء — رابط ويب صريح يعمل في كل مكان.
*/
function shareButton(opts){
  const o = opts || {};
  const url = o.url || absUrl('#/');
  const label = o.label || '⤴ انشر الرابط';

  const b = el('button', { class:'btn btn--soft btn--sm' + (o.block ? ' btn--block' : ''),
                           type:'button', text: label });
  b.addEventListener('click', async () => {
    const r = await sharePlain(url, o.title, o.text);
    if (r.ok && r.via === 'copy') QBANK.toast('نُسخ الرابط — الصقه حيث شئت');
    else if (!r.ok && !r.cancelled) QBANK.toast('انسخ الرابط من الحقل أدناه');
  });

  const wa = el('a', { class:'btn btn--ghost btn--sm' + (o.block ? ' btn--block' : ''),
    href: 'https://wa.me/?text=' + encodeURIComponent((o.text ? o.text + ' — ' : '') + url),
    target:'_blank', rel:'noopener noreferrer', text:'واتساب' });

  return el('div', { class:'row sharerow' }, [ b, wa ]);
}

/* الصندوق الكامل: الزرّان ثم الرابط للنسخ اليدوي — لمن يريد أن يراه */
function shareBox(opts){
  const o = opts || {};
  return el('div', { class:'stack' }, [
    o.title ? el('p', { class:'field__label', text: o.title }) : null,
    shareButton(o),
    copyRow(o.url)
  ]);
}

QBANK.share = { shareUrl, copyRow, absUrl, profileUrl, universityUrl,
                sharePlain, shareButton, shareBox };
QBANK.views.ViewShare = ViewShare;
