'use strict';
/*
  نداء Supabase من الخادم بمفتاح الخدمة — يتجاوز RLS عمدًا.
  يُستعمل حصرًا بعد أن يتحقق الخادم بنفسه من شيء لا يملك العميل تزويره
  (دفعة مؤكدة لدى البوابة، أو جلسة تحقّق منها Supabase نفسه).
*/
function creds(){
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY غير مضبوطين');
  return { url: url.replace(/\/+$/, ''), key };
}

/*
  استدعاء دالة في مخطط qbank.
  asUser = رمز الطالب: نمرّره كما هو فتبقى auth.uid() تساوي صاحبه فعلًا،
  والدالة تحرس نفسها كما لو نادى المتصفح مباشرة.
  بلا asUser: مفتاح الخدمة، ولا يُستعمل إلا لما يجب أن يتجاوز RLS (منح الكوينز بعد دفعة مؤكدة).
*/
async function rpc(name, args, asUser){
  const { url, key } = creds();
  const res = await fetch(url + '/rest/v1/rpc/' + name, {
    method:'POST',
    headers:{ 'apikey': key, 'Authorization':'Bearer ' + (asUser || key),
              'Content-Type':'application/json', 'Accept-Profile':'qbank', 'Content-Profile':'qbank' },
    body: JSON.stringify(args || {})
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error('rpc ' + name + ' ← ' + res.status + ' ' + JSON.stringify(data));
  return data;
}

/*
  هوية صاحب الرمز: نسأل Supabase لا نفكّ الرمز بأنفسنا.
  فكّ JWT في الخادم بلا تحقق من التوقيع يعني قبول أي رمز ملفّق.
*/
async function userFromToken(token){
  if (!token) return null;
  const { url, key } = creds();
  const res = await fetch(url + '/auth/v1/user', {
    headers:{ 'apikey': key, 'Authorization':'Bearer ' + token }
  });
  if (!res.ok) return null;
  const u = await res.json().catch(() => null);
  return (u && u.id) ? u : null;
}

function bearer(req){
  const h = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  return h.indexOf('Bearer ') === 0 ? h.slice(7) : '';
}

module.exports = { rpc, userFromToken, bearer, creds };
