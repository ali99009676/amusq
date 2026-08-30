/*
  رابط المشاركة القصير: #s/slug?ref=USER_ID

  الموجّه يجرّد «#» و«/» الأولى معًا، فمسار واحد مسجَّل باسم '#/s' يلتقط
  الصيغتين: #s/slug و #/s/slug — ويبقى الرابط قصيرًا كما يُشارَك في الواتساب.

  هذه الشاشة تعريفية لا محتوى فيها: من وصل عبر رابط زميله يرى ما في المادة
  وسعرها وزر الشراء، ولا يُحتسب له رصيد تجربة.
*/
function shareUrl(slug, userId){
  const base = (typeof location !== 'undefined' && location.protocol.indexOf('http') === 0)
    ? location.origin + location.pathname : 'https://amsuq.alsoqoor.com/';
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

QBANK.share = { shareUrl, copyRow };
QBANK.views.ViewShare = ViewShare;
