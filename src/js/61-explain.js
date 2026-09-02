/*
  «اشرح لي أكثر» — واجهة سؤالِ الطالبِ عن خطئه هو.

  الزرّ لا يظهر إلا بعد خطأ: من أصاب لا شيء يشرحه له، ووجود الزرّ عنده
  إغراءٌ بإنفاق نداءٍ بلا فائدة.

  والجواب يُحفظ في الجلسة بمفتاح (السؤال + اختياره): الطالب يرجع للسؤال
  مرتين وثلاثًا في المراجعة، ولا معنى لأن ندفع في كل مرة ثمنَ جوابٍ
  يملكه المتصفح أصلًا.
*/
const Explain = {
  _cache: Object.create(null),

  key(q, chosen){ return String(q.id || q.q).slice(0, 80) + '#' + chosen; },

  async ask(q, chosen){
    const k = Explain.key(q, chosen);
    if (Explain._cache[k]) return { ok:true, why: Explain._cache[k], cached:true };

    const base = QBANK.admin ? QBANK.admin.apiBase() : '';
    const f = QBANK.api.fetchFn();
    if (base === null || !f) return { ok:false, offline:true };
    const s = QBANK.api.session();
    if (!s) return { ok:false, needAuth:true };

    try{
      const res = await f(base + '/api/explain', {
        method:'POST',
        headers:{ 'Content-Type':'application/json',
                  'Authorization':'Bearer ' + (s.access_token || '') },
        body: JSON.stringify({ q: q.q, options: q.options, correct: q.answer,
                               chosen: chosen, topic: q.topic || '' })
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data && data.why) { Explain._cache[k] = data.why; return { ok:true, why:data.why }; }
      return { ok:false, status:res.status, error:(data && data.error) || 'تعذّر الشرح' };
    } catch(e){ return { ok:false, offline:true }; }
  },

  /* الزرّ ومكان الجواب معًا: الجواب يظهر تحته لا في نافذة تقطع القراءة */
  button(q, chosen){
    if (typeof chosen !== 'number' || chosen === q.answer) return null;

    const out = el('p', { class:'explain__why', hidden:true });
    const b = el('button', { class:'btn btn--soft btn--sm', type:'button',
      text:'؟ اشرح لي لماذا أخطأت' });

    b.addEventListener('click', async () => {
      b.setAttribute('aria-disabled','true'); b.textContent = '… يفكّر';
      const r = await Explain.ask(q, chosen);
      b.removeAttribute('aria-disabled');
      if (r.ok) {
        out.textContent = r.why; out.hidden = false; b.hidden = true;
        return;
      }
      b.textContent = '؟ اشرح لي لماذا أخطأت';
      QBANK.toast(r.needAuth ? 'سجّل دخولك ليشرح لك الذكاء خطأك'
                : r.offline ? 'لا اتصال — الشرح يحتاج إنترنت'
                : (r.error || 'تعذّر الشرح، أعد المحاولة'));
    });

    return el('div', { class:'explain' }, [ b, out ]);
  },
  _reset(){ Explain._cache = Object.create(null); }
};
QBANK.explain = Explain;
