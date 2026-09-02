/*
  ═══════════════════════════════════════════════════════════════════
  توثيق الجوال بالواتساب — التحقق المعكوس
  ═══════════════════════════════════════════════════════════════════
  المعتاد أن ترسل المنصة رمزًا إلى الطالب. وذلك يشترط WhatsApp Business
  API: حسابًا تجاريًا موثَّقًا، وقالبًا معتمدًا، ورقمًا يخرج من تطبيق
  واتساب العادي فلا يستقبل إيصالًا بعدها، وفاتورةً على كل رسالة.

  والعكس يعطي الدليل نفسه بلا شيء من ذلك: نُولّد الرمز، ونفتح المحادثة،
  ويرسله الطالب بنفسه — فتصل الرسالة من رقمه هو. ووصولُ الرمز الصحيح من
  رقمٍ بعينه إثباتُ ملكية لا يقلّ عن OTP، بل هو OTP بالاتجاه المعاكس.

  وحدُّه معروف ومكتوب: التأكيد بيد المشرف. يكفي لعشرات الطلبات يوميًا،
  ويُستبدَل بمزوّد حين يصير عبئًا — والأعمدة والشاشات تبقى كما هي.
*/

const Phone = {
  /*
    التطبيع هنا صورةٌ من الذي في القاعدة، لغرضٍ واحد: أن يرى الطالب رقمه
    مُصحَّحًا قبل أن يُرسل، لا أن يُكتشف الخطأ بعد ساعة انتظار.
    والحكم للقاعدة على كل حال — هذه للعين لا للأمان.
  */
  AR: '٠١٢٣٤٥٦٧٨٩',
  norm(s){
    let t = String(s || '');
    t = t.replace(/[٠-٩]/g, d => String(Phone.AR.indexOf(d)));
    let d = t.replace(/[^0-9]/g, '');
    if (!d) return '';
    if (d.slice(0, 2) === '00') d = d.slice(2);
    if (d.length === 10 && d.slice(0, 2) === '05') d = '966' + d.slice(1);
    else if (d.length === 9 && d[0] === '5') d = '966' + d;
    if (d.length < 10 || d.length > 15) return '';
    return '+' + d;
  },
  looksLike(s){ return !!Phone.norm(s); },

  /* عرضٌ مقروء: +966 50 123 4567 */
  pretty(s){
    const n = Phone.norm(s);
    if (!n) return String(s || '');
    const d = n.slice(1);
    if (d.slice(0, 3) === '966' && d.length === 12)
      return '+966 ' + d.slice(3, 5) + ' ' + d.slice(5, 8) + ' ' + d.slice(8);
    return n;
  },

  mine(){ return QBANK.api.rpc('my_phone'); },
  claim(phone){ return QBANK.api.rpc('request_phone_claim', { p_phone: phone }); },

  WHY: {
    auth:       'سجّل دخولك أولًا.',
    bad_phone:  'الرقم غير مكتمل — اكتبه كاملًا مثل ٠٥٠١٢٣٤٥٦٧.',
    taken:      'هذا الرقم موثَّق لحسابٍ آخر. إن كان رقمك فتواصل مع المشرف.',
    already:    'رقمك موثَّق بالفعل.'
  },
  why(reason){ return Phone.WHY[reason] || 'تعذّر إنشاء الطلب. حاول مرة أخرى.'; },

  /*
    ★ نصّ الرسالة يبدأ بالرمز.
    المشرف يقرأ عشرات الرسائل في واتساب، ونصفُها صور إيصالات. ورمزٌ في
    أول السطر يُلتقط بالعين في لمحة، ورمزٌ في آخر فقرةٍ مهذّبة يُبحث عنه.
  */
  text(code){
    const u = QBANK.api.user() || {};
    return 'توثيق رقمي في مراجعة: ' + code + '\n' +
           'الحساب: ' + (u.email || 'ـ');
  },
  url(code){
    const wa = (QBANK.codes && QBANK.codes.support().wa) || '';
    if (!wa || !code) return '';
    return 'https://wa.me/' + wa + '?text=' + encodeURIComponent(Phone.text(code));
  }
};
QBANK.phone = Phone;

/* ═══════════════ بطاقة الطالب ═══════════════ */
function phoneCard(){
  const box = el('div', { class:'card stack' });
  box.appendChild(el('h2', { style:'margin:0', text:'توثيق رقم الجوال' }));
  const body = el('div', { class:'stack' });
  box.appendChild(body);
  body.appendChild(el('p', { class:'field__hint', style:'margin:0', text:'جارٍ التحميل…' }));

  function draw(){
    Phone.mine().then(r => {
      if (!alive()) return;
      body.innerHTML = '';
      const d = (r.ok && r.data && !r.data.error) ? r.data : null;
      if (!d){
        const m = String((r.data && (r.data.message || r.data.hint)) || '');
        body.appendChild(el('p', { class:'field__hint is-bad', style:'margin:0',
          text: (/does not exist|Could not find the function/i.test(m) ||
                 (r.data && r.data.code === 'PGRST202'))
            ? 'دالة التوثيق غير موجودة في القاعدة — نفّذ ملف db/PHONE.sql.'
            : 'تعذّر جلب حالة التوثيق.' }));
        return;
      }

      if (d.verified){
        body.appendChild(el('div', { class:'phverif' }, [
          el('span', { class:'phverif__i', 'aria-hidden':'true', text:'✓' }),
          el('span', { class:'phverif__n num', text: Phone.pretty(d.phone) }),
          el('span', { class:'badge badge--ok', text:'موثَّق' })
        ]));
        body.appendChild(el('p', { class:'field__hint', style:'margin:0', text:
          'رقمك موثَّق ومرتبط بحسابك وحده. لتغييره تواصل مع المشرف.' }));
        return;
      }

      /* طلبٌ قائم: الرمز والزرّ ولا شيء غيرهما — من وصل هنا مهمّته واحدة */
      if (d.claim){
        body.appendChild(el('p', { class:'field__hint', style:'margin:0', text:
          'أرسل هذا الرمز من واتساب الرقم ' + Phone.pretty(d.claim.phone) +
          ' — يجب أن تُرسله من الرقم نفسه، فهو ما يُثبت أنه لك.' }));
        body.appendChild(el('div', { class:'phcode num', role:'status',
          'aria-label':'رمز التوثيق ' + String(d.claim.code).split('').join(' ') },
          [ el('span', { text: d.claim.code }) ]));

        const url = Phone.url(d.claim.code);
        if (url){
          body.appendChild(el('a', { class:'btn btn--block', target:'_blank', rel:'noopener',
            href: url, text:'أرسل الرمز على واتساب' }));
          body.appendChild(el('p', { class:'field__hint', style:'margin:2px 0 0', text:
            'تُفتح محادثة المشرف برسالة جاهزة — أرسلها كما هي، ويُوثَّق رقمك بعد مراجعتها.' }));
        } else {
          body.appendChild(el('p', { class:'field__hint is-bad', style:'margin:0', text:
            'لم يضع المشرف رقم واتساب في الإعدادات بعد — لا يمكن إتمام التوثيق الآن.' }));
        }

        const again = el('button', { class:'btn btn--ghost btn--sm', type:'button',
          text:'رقمي خطأ — أدخله من جديد' });
        again.addEventListener('click', () => drawForm(d));
        body.appendChild(again);
        return;
      }

      drawForm(d);
    });
  }

  function drawForm(d){
    body.innerHTML = '';
    body.appendChild(el('p', { class:'field__hint', style:'margin:0', text:
      'وثّق رقمك مرة واحدة، فيصير حسابك مرتبطًا به — يسهّل استرجاعه، ويؤكّد للمشرف أنك صاحب التحويل.' }));

    const inp = el('input', { class:'input ltr num', type:'tel', inputmode:'tel', dir:'ltr',
      placeholder:'05xxxxxxxx', value: d && d.phone ? d.phone : '',
      'aria-label':'رقم الجوال' });
    const msg = el('p', { class:'field__hint', role:'status', style:'margin:0' });
    const hint = el('p', { class:'field__hint', style:'margin:0' });

    /* المعاينة الحيّة: الطالب يرى ما سيُخزَّن قبل أن يُرسل، فلا يكتشف
       خطأ رقمه بعد ساعة من الانتظار */
    inp.addEventListener('input', () => {
      const n = Phone.norm(inp.value);
      hint.textContent = n ? 'سيُوثَّق: ' + Phone.pretty(n) : '';
      go.setAttribute('aria-disabled', n ? 'false' : 'true');
    });

    const go = el('button', { class:'btn btn--block', type:'button', text:'ابدأ التوثيق' });
    go.setAttribute('aria-disabled', 'true');
    go.addEventListener('click', async () => {
      if (!Phone.looksLike(inp.value)) return;
      go.disabled = true; msg.className = 'field__hint'; msg.textContent = 'جارٍ التجهيز…';
      const r = await Phone.claim(inp.value);
      go.disabled = false;
      const x = (r.ok && r.data) ? r.data : null;
      if (x && x.ok){ draw(); return; }
      msg.className = 'field__hint is-bad';
      msg.textContent = x && x.reason ? Phone.why(x.reason) : 'تعذّر إنشاء الطلب.';
    });

    body.appendChild(el('label', { class:'field' }, [
      el('span', { class:'field__label', text:'رقم جوالك' }), inp ]));
    body.appendChild(hint);
    body.appendChild(go);
    body.appendChild(msg);
  }

  draw();
  return box;
}
QBANK.views.phoneCard = phoneCard;

/* ═══════════════ لوحة المشرف ═══════════════ */
function adminPhoneCard(){
  const box = el('div', { class:'card stack' });
  box.appendChild(el('h2', { style:'margin:0', text:'توثيق أرقام الجوال' }));
  box.appendChild(el('p', { class:'field__hint', style:'margin:0', text:
    'افتح واتساب، واعثر على الرسالة التي تحمل الرمز، وتأكّد أنها وصلتك من الرقم المكتوب هنا نفسه — ثم وثّق.' }));

  const list = el('div', { class:'stack' });
  let status = 'pending';

  const chips = el('div', { class:'ex-chips', role:'group', 'aria-label':'تصفية طلبات التوثيق' });
  [['pending','معلّقة'],['verified','موثَّقة'],['rejected','مرفوضة'],['','الكل']].forEach(t => {
    const b = el('button', { class:'chip' + (t[0] === status ? ' is-on' : ''), type:'button',
      'data-s': t[0], text: t[1] });
    b.addEventListener('click', () => {
      status = t[0];
      chips.querySelectorAll('.chip').forEach(x =>
        x.classList.toggle('is-on', x.getAttribute('data-s') === status));
      draw();
    });
    chips.appendChild(b);
  });
  box.appendChild(chips);
  box.appendChild(list);

  let seq = 0;
  function draw(){
    const mine = ++seq;
    list.innerHTML = '';
    list.appendChild(el('p', { class:'field__hint', style:'margin:0', text:'جارٍ التحميل…' }));
    QBANK.api.rpc('admin_phone_claims', { p_status: status }).then(r => {
      if (mine !== seq || !alive()) return;
      list.innerHTML = '';
      if (!r.ok || !Array.isArray(r.data)){
        list.appendChild(el('p', { class:'field__hint is-bad', style:'margin:0',
          text:'تعذّر الجلب — تأكّد من تنفيذ db/PHONE.sql.' }));
        return;
      }
      if (!r.data.length){
        list.appendChild(el('p', { class:'field__hint', style:'margin:0',
          text: status === 'pending' ? 'لا طلبات معلّقة.' : 'لا شيء هنا.' }));
        return;
      }
      r.data.forEach(c => {
        const row = el('div', { class:'payrow' }, [
          /* ★ الرمز أولًا وبخطٍّ مميّز: هو مفتاح المطابقة مع واتساب */
          el('span', { class:'badge num phcode--sm', text: c.code }),
          el('span', { class:'payrow__t num', text: Phone.pretty(c.phone) }),
          el('span', { class:'badge', text: c.name || 'بلا اسم' })
        ]);
        if (c.expired)
          row.appendChild(el('span', { class:'badge badge--warn', text:'انتهت مهلته' }));

        const det = el('div', { class:'codeuse' }, [
          el('span', { class:'codeuse__i', 'aria-hidden':'true', text:'↳' }),
          el('span', { class:'codeuse__e num', text: c.email || '' }),
          c.note ? el('span', { class:'codeuse__n', text: c.note }) : null
        ]);
        const blk = el('div', { class:'codeblk' }, [row, det]);

        if (c.status === 'pending'){
          const ok = el('button', { class:'btn btn--sm', type:'button', text:'وثّق',
            'aria-label':'وثّق الرقم ' + Phone.pretty(c.phone) + ' للحساب ' + (c.email || '') });
          const no = el('button', { class:'btn btn--ghost btn--sm', type:'button', text:'ارفض',
            'aria-label':'ارفض طلب توثيق ' + Phone.pretty(c.phone) });
          const set = async (yes) => {
            ok.disabled = no.disabled = true;
            const rr = await QBANK.api.rpc('admin_verify_phone',
              { p_id: c.id, p_ok: yes, p_note: '' });
            const x = (rr.ok && rr.data) ? rr.data : null;
            if (x && x.ok){ QBANK.toast(yes ? 'وُثّق الرقم' : 'رُفض الطلب'); draw(); return; }
            ok.disabled = no.disabled = false;
            QBANK.toast(x && x.reason === 'taken' ? 'الرقم موثَّق لحسابٍ آخر' : 'تعذّر التعديل');
          };
          ok.addEventListener('click', () => set(true));
          no.addEventListener('click', () => set(false));
          row.appendChild(ok); row.appendChild(no);
        } else {
          const L = { verified:['badge--ok','موثَّق'], rejected:['badge--bad','مرفوض'] };
          const st = L[c.status] || ['', c.status];
          row.appendChild(el('span', { class:'badge ' + st[0], text: st[1] }));
        }
        list.appendChild(blk);
      });
    });
  }
  draw();

  return box;
}
QBANK.views.adminPhoneCard = adminPhoneCard;
