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
  /* عدّادٌ تجاوز الآلاف رقمٌ فاسد من دمجٍ قديم لا إنجازٌ — يُعاد إلى الصفر */
  sane(n){ n = Number(n) || 0; return (n < 0 || n > 5000) ? 0 : Math.round(n); },
  all(){ return QBANK.store.get(Progress.KEY, Progress.blank()); },
  /* إصلاحٌ لمرة واحدة لما أفسده الدمج القديم — يُستدعى عند الإقلاع وقبل الدفع */
  repair(){
    const p = Progress.all(); let touched = false;
    Object.keys(p).forEach(sid => {
      const s = p[sid] || {};
      const e = Progress.sane(s.exams), b = Math.min(100, Math.max(0, Number(s.best) || 0));
      if (e !== s.exams || b !== s.best){ s.exams = e; s.best = b; touched = true; }
    });
    if (touched) QBANK.store.set(Progress.KEY, p);
    return touched;
  },
  save(p){ QBANK.store.set(Progress.KEY, p); Progress.schedulePush(); },

  forSubject(sid){
    const p = Progress.all();
    return p[sid] || { seen:{}, wrong:{}, star:{}, srs:{}, exams:0, best:0 };
  },
  _update(sid, fn){
    const p = Progress.all();
    const s = p[sid] || { seen:{}, wrong:{}, star:{}, srs:{}, exams:0, best:0 };
    fn(s); p[sid] = s; Progress.save(p);
    return s;
  },

  /* ═══════════════════════════════════════════════════════════
     التكرار المتباعد
     ═══════════════════════════════════════════════════════════
     المذاكرة بالإعادة الفورية وهمُ إتقان: تقرأ الشرح فتشعر أنك حفظت،
     ثم يذوب بعد يومين. الذي يثبّت المعلومة هو استرجاعُها بعد أن تكاد
     تنساها — والفارق بين الطريقتين ليس تحسينًا هامشيًا بل أضعافًا.

     ولمَ سُلَّمٌ ثابت لا SM-2؟ لأن SM-2 يقوم على تقدير الطالب لصعوبة
     تذكّره من ستّ درجات، ونحن لا نملك إلا نعم/لا. سُلَّمٌ صادق بمدخلٍ
     ثنائي خيرٌ من خوارزمية دقيقة تُغذَّى بتخمين.

     الفترات: يوم ← ٣ ← ٧ ← ١٦ ← ٣٥ ← ٦٠. والخطأ يُعيده إلى يومٍ واحد
     مهما بلغ — فالنسيان لا يُجامَل، لكن عدّاد التعثّر يُحفظ لأن سؤالًا
     تعثّر فيه خمس مرات يستحق عنايةً غير الذي تعثّر مرة.
  */
  LADDER: [1, 3, 7, 16, 35, 60],

  /* رقم اليوم منذ ١٩٧٠ بالتوقيت المحلي: صحيحٌ صغير يُقارَن ويُجمع بلا
     مناطق زمنية ولا ساعات — والمراجعة تُقاس بالأيام لا بالثواني. */
  today(now){
    const d = now ? new Date(now) : new Date();
    return Math.floor((d - d.getTimezoneOffset() * 60000) / 86400000);
  },

  /* الفترة التالية: نصعد درجةً عند الإصابة، ونهبط إلى القاع عند الخطأ */
  nextInterval(cur, ok){
    const L = Progress.LADDER;
    if (!ok) return L[0];
    const i = L.indexOf(cur);
    if (i === -1) return L[0];                 // فترة غير معروفة: نبدأ من أول السلّم
    return L[Math.min(i + 1, L.length - 1)];
  },

  /* تسجيل مراجعة سؤال. ok=true أصاب، false أخطأ. */
  review(sid, qid, ok, now){
    const t = Progress.today(now);
    return Progress._update(sid, s => {
      s.srs = s.srs || {};
      const prev = s.srs[qid] || { i: 0, e: 0 };
      const iv = Progress.nextInterval(prev.i, ok);
      s.srs[qid] = {
        i: iv,                                  // الفترة الحالية بالأيام
        d: t + iv,                              // موعد المراجعة القادمة
        e: (prev.e || 0) + (ok ? 0 : 1),        // كم مرة تعثّر فيه
        t: t                                    // آخر مراجعة — عليه يقوم الدمج
      };
    });
  },

  /* المستحقّ اليوم في مادة: معرّفات الأسئلة التي حان موعدها */
  dueIn(sid, now){
    const t = Progress.today(now);
    const srs = (Progress.forSubject(sid).srs) || {};
    return Object.keys(srs).filter(qid => (srs[qid].d || 0) <= t);
  },

  /* المستحقّ في كل المواد — ترتيبها بالأكثر تعثّرًا أولًا:
     ما تعثّرت فيه مرارًا هو ما يُسقطك في الاختبار. */
  dueAll(now){
    const t = Progress.today(now);
    const p = Progress.all();
    const out = [];
    Object.keys(p).forEach(sid => {
      const srs = (p[sid] && p[sid].srs) || {};
      Object.keys(srs).forEach(qid => {
        if ((srs[qid].d || 0) <= t) out.push({ sid, qid, e: srs[qid].e || 0, d: srs[qid].d || 0 });
      });
    });
    out.sort((a, b) => (b.e - a.e) || (a.d - b.d));
    return out;
  },

  /* أقرب موعدٍ قادم — لمن أنهى مراجعة اليوم: «عد بعد يومين» خيرٌ من فراغ */
  nextDue(now){
    const t = Progress.today(now);
    const p = Progress.all();
    let best = null;
    Object.keys(p).forEach(sid => {
      const srs = (p[sid] && p[sid].srs) || {};
      Object.keys(srs).forEach(qid => {
        const d = srs[qid].d || 0;
        if (d > t && (best === null || d < best)) best = d;
      });
    });
    return best === null ? null : best - t;      // بعد كم يوم
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
      const a = (local  || {})[sid] || { seen:{}, wrong:{}, star:{}, srs:{}, exams:0, best:0 };
      const b = (remote || {})[sid] || { seen:{}, wrong:{}, star:{}, srs:{}, exams:0, best:0 };
      out[sid] = {
        seen:  Object.assign({}, b.seen,  a.seen),
        star:  Object.assign({}, b.star,  a.star),
        wrong: (function(){
          // عدّاد الأخطاء: الأعلى يفوز — تكرار الخطأ معلومة تهم ترتيب المراجعة
          const w = Object.assign({}, b.wrong);
          Object.keys(a.wrong || {}).forEach(k => { w[k] = Math.max(w[k] || 0, a.wrong[k]); });
          return w;
        })(),
        /*
          ★ عدّاد الاختبارات: الأعلى يفوز لا المجموع.
          كان مجموعًا، والدمج يجري عند كل دخول بين الجهاز والخادم — والخادم
          يحمل ما دفعه الجهاز نفسه قبل دقيقة — فيتضاعف العدد مع كل دمج حتى
          بلغ ٥×١٠³¹ في ملف علي. كل جهاز يدفع مجموعه، والأعلى هو الأقرب للحقيقة.
        */
        exams: Progress.sane(Math.max(a.exams || 0, b.exams || 0)),
        best:  Math.min(100, Math.max(a.best || 0, b.best || 0)),
        /*
          ★ جدول المراجعة: الأحدث مراجعةً يفوز — لا الأطول فترةً.
          لو أخذنا الأطول لضاع تعثّرٌ حدث على الجهاز الآخر: الخطأ يُنزل
          الفترة إلى يوم، فيبدو «أقلّ تقدّمًا» وهو الحقيقة الأحدث.
        */
        srs: (function(){
          const m = Object.assign({}, b.srs || {});
          Object.keys(a.srs || {}).forEach(qid => {
            const x = a.srs[qid], y = m[qid];
            if (!y || (x.t || 0) >= (y.t || 0)) m[qid] = x;
          });
          return m;
        })()
      };
    });
    return out;
  },

  schedulePush(){
    if (Progress._timer) clearTimeout(Progress._timer);
    Progress._timer = setTimeout(() => { Progress._timer = null; Progress.push(); }, Progress.PUSH_DELAY);
  },
  async push(){
    Progress.repair();
    if (Progress._pushFn) return Progress._pushFn(Progress.all());
    if (!QBANK.api.user()) return { ok:false };   // زائر: يبقى تقدّمه في جهازه حتى يسجّل
    return QBANK.api.rest('progress?on_conflict=user_id', {
      method:'POST',
      headers: Object.assign(QBANK.api.headers(), { 'Prefer':'resolution=merge-duplicates' }),
      body: JSON.stringify({ user_id: QBANK.api.user().id, data: Progress.all(), updated_at: new Date().toISOString() })
    });
  },
  // عند أول دخول على جهاز: نجلب تقدّم الحساب وندمجه مع تقدّم الجهاز ثم ندفع الناتج
  async pull(){
    const u = QBANK.api.user();
    if (!u) return { ok:false };
    const r = await QBANK.api.rest('progress?user_id=eq.' + u.id + '&select=data');
    if (r.ok && r.data && r.data[0]) {
      const merged = Progress.merge(Progress.all(), r.data[0].data || {});
      QBANK.store.set(Progress.KEY, merged);
      await Progress.push();
      return { ok:true, merged:true };
    }
    if (r.ok) { await Progress.push(); return { ok:true, merged:false }; }
    return r;
  }
};
QBANK.progress = Progress;
