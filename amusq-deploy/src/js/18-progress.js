/*
  التقدّم: محلي أولًا وفورًا، ثم يُدفع للحساب بتأخير ٢٫٥ ثانية بعد آخر نقرة.
  لماذا التأخير؟ طالب يقلّب ٣٠ بطاقة في دقيقة = ٣٠ كتابة شبكية بلا فائدة؛
  دفعة واحدة بعد سكونه تكفي وتوفّر البطارية والبيانات.
*/
const Progress = {
  KEY: 'progress',
  PUSH_DELAY: 2500,
  _timer: null,
  _pushFn: null,   // باب حقن للفحوص

  blank(){ return {}; },
  all(){ return AMUSQ.store.get(Progress.KEY, Progress.blank()); },
  save(p){ AMUSQ.store.set(Progress.KEY, p); Progress.schedulePush(); },

  forSubject(sid){
    const p = Progress.all();
    return p[sid] || { seen:{}, wrong:{}, star:{}, exams:0, best:0 };
  },
  _update(sid, fn){
    const p = Progress.all();
    const s = p[sid] || { seen:{}, wrong:{}, star:{}, exams:0, best:0 };
    fn(s); p[sid] = s; Progress.save(p);
    return s;
  },

  markSeen(sid, qid){ return Progress._update(sid, s => { s.seen[qid] = 1; }); },
  markWrong(sid, qid){ return Progress._update(sid, s => { s.wrong[qid] = (s.wrong[qid]||0) + 1; s.seen[qid] = 1; }); },
  clearWrong(sid, qid){ return Progress._update(sid, s => { delete s.wrong[qid]; }); },
  toggleStar(sid, qid){
    let on = false;
    Progress._update(sid, s => { if (s.star[qid]) delete s.star[qid]; else { s.star[qid] = 1; on = true; } });
    return on;
  },
  recordExam(sid, pct){ return Progress._update(sid, s => { s.exams += 1; if (pct > s.best) s.best = pct; }); },

  pctDone(sid, totalQ){
    if (!totalQ) return 0;
    const seen = Object.keys(Progress.forSubject(sid).seen).length;
    return Math.min(100, Math.round(seen / totalQ * 100));
  },

  /* --- الدمج بلا حذف: اتحاد المُشاهد والنجوم، الأعلى يفوز في النتائج، والمجموع في العدّادات.
         القاعدة: لا يخسر أحد تقدّمه أبدًا — لا عند جهاز جديد ولا عند تعارض. --- */
  merge(local, remote){
    const out = {};
    const sids = new Set(Object.keys(local || {}).concat(Object.keys(remote || {})));
    sids.forEach(sid => {
      const a = (local  || {})[sid] || { seen:{}, wrong:{}, star:{}, exams:0, best:0 };
      const b = (remote || {})[sid] || { seen:{}, wrong:{}, star:{}, exams:0, best:0 };
      out[sid] = {
        seen:  Object.assign({}, b.seen,  a.seen),
        star:  Object.assign({}, b.star,  a.star),
        wrong: (function(){
          // عدّاد الأخطاء: الأعلى يفوز — تكرار الخطأ معلومة تهم ترتيب المراجعة
          const w = Object.assign({}, b.wrong);
          Object.keys(a.wrong || {}).forEach(k => { w[k] = Math.max(w[k] || 0, a.wrong[k]); });
          return w;
        })(),
        exams: (a.exams || 0) + (b.exams || 0),
        best:  Math.max(a.best || 0, b.best || 0)
      };
    });
    return out;
  },

  schedulePush(){
    if (Progress._timer) clearTimeout(Progress._timer);
    Progress._timer = setTimeout(() => { Progress._timer = null; Progress.push(); }, Progress.PUSH_DELAY);
  },
  async push(){
    if (Progress._pushFn) return Progress._pushFn(Progress.all());
    if (!AMUSQ.api.user()) return { ok:false };   // زائر: يبقى تقدّمه في جهازه حتى يسجّل
    return AMUSQ.api.rest('progress?on_conflict=user_id', {
      method:'POST',
      headers: Object.assign(AMUSQ.api.headers(), { 'Prefer':'resolution=merge-duplicates' }),
      body: JSON.stringify({ user_id: AMUSQ.api.user().id, data: Progress.all(), updated_at: new Date().toISOString() })
    });
  },
  // عند أول دخول على جهاز: نجلب تقدّم الحساب وندمجه مع تقدّم الجهاز ثم ندفع الناتج
  async pull(){
    const u = AMUSQ.api.user();
    if (!u) return { ok:false };
    const r = await AMUSQ.api.rest('progress?user_id=eq.' + u.id + '&select=data');
    if (r.ok && r.data && r.data[0]) {
      const merged = Progress.merge(Progress.all(), r.data[0].data || {});
      AMUSQ.store.set(Progress.KEY, merged);
      await Progress.push();
      return { ok:true, merged:true };
    }
    if (r.ok) { await Progress.push(); return { ok:true, merged:false }; }
    return r;
  }
};
AMUSQ.progress = Progress;
