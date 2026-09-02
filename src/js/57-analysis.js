/*
  التحليل الشامل للمادة — واجهة الطبقة التي كانت يدوية.

  «عن المادة» و«طريقة الحفظ» و«الأخطاء الشائعة» تصل من القاعدة HTML جاهزًا
  (ولّده الخادم وتحقق منه)، وهنا: الجلب والعرض، وإعادة التوليد حين يبطل،
  وعدّاد الاختبار الذي يضبطه كل طالب لنفسه.
*/

const ANALYSIS_TAGS = ['P','STRONG','EM','H3','H4','TABLE','THEAD','TBODY',
                       'TR','TH','TD','UL','LI','SECTION','BR'];

/*
  ★ التعقيم مرتين — في الخادم وهنا.
  الخادم عقّم قبل الكتابة، لكن القاعدة قد تُكتب من طريق آخر يومًا (مشرف
  يحرّر يدويًا، هجرة، خطأ). الدفاع في العمق: المتصفح لا يثق حتى بقاعدته.
  نبني DOM ونمسح كل وسم خارج القائمة وكل سمة — ثم نُعيد العقد لا innerHTML.
*/
function analysisHtml(html){
  const box = document.createElement('div');
  box.innerHTML = String(html || '');
  const walk = (node) => {
    const kids = Array.prototype.slice.call(node.children);
    kids.forEach(el0 => {
      walk(el0);
      if (ANALYSIS_TAGS.indexOf(el0.tagName) === -1){
        // الوسم الغريب يذوب: نصّه يبقى وعظمه يُنزع
        while (el0.firstChild) node.insertBefore(el0.firstChild, el0);
        node.removeChild(el0);
      } else {
        Array.prototype.slice.call(el0.attributes).forEach(a => el0.removeAttribute(a.name));
      }
    });
  };
  walk(box);
  box.className = 'analysis';
  return box;
}

const Analysis = {
  _cache: {},

  async get(sid, fresh){
    if (!fresh && Analysis._cache[sid]) return Analysis._cache[sid];
    const r = await QBANK.api.rpc('subject_analysis', { sid });
    const a = (r.ok && r.data) ? r.data : null;
    if (a) Analysis._cache[sid] = a;
    return a;
  },

  /* توليد التحليل في الخادم — يصل بهوية الطالب فيتحقق الخادم أنها مادته */
  async generate(sid, lang){
    delete Analysis._cache[sid];
    const base = QBANK.admin ? QBANK.admin.apiBase() : '';
    const f = QBANK.api.fetchFn();
    if (base === null || !f) return { ok:false, offline:true };
    const s = QBANK.api.session();
    try{
      const res = await f(base + '/api/analyze', {
        method:'POST',
        headers:{ 'Content-Type':'application/json',
                  'Authorization':'Bearer ' + (s && s.access_token || '') },
        body: JSON.stringify({ subject_id: sid, lang: lang || 'ar' })
      });
      const data = await res.json().catch(() => null);
      return { ok: res.ok, status: res.status, data };
    } catch(e){ return { ok:false, offline:true, err: e.message }; }
  },

  /*
    ★ التحديث الذاتي: تحليلٌ بَطَل (أُضيفت أسئلة بعده) يُعاد توليده تلقائيًا
    أول ما يفتح صاحبُ المادة صفحتها — كما اختار علي. صاحبها لا زائرها:
    الزائر يرى النسخة الأخيرة الصالحة، ولا يدفع كلفة توليدٍ ليس له.
  */
  maybeRefresh(sub, a, onDone){
    if (!a || !a.stale) return false;
    const u = QBANK.api.user();
    const mine = u && sub.created_by === u.id;
    const admin = QBANK.store.get('is_admin_check', {}).ok;
    if (!mine && !admin) return false;
    Analysis.generate(sub.id, a.lang || 'ar').then(r => { if (r.ok && onDone) onDone(); });
    return true;
  }
};

/* ═══ عدّاد الاختبار — كل طالب يضبط موعده ═══ */
/*
  محليّ في الجهاز عمدًا: الشُّعب تختلف مواعيدها، وموعد طالبٍ لا يخص زميله.
  التخزين مفتاح واحد {sid: iso}، والعرض عدّاد حيّ بالثواني — الرقم الذي
  يُبقي الطالب مستيقظًا هو «متبقٍ ١٨:٣٦:٢٤» لا تاريخ جامد.
*/
const ExamDate = {
  KEY: 'exam_dates',
  get(sid){ return QBANK.store.get(ExamDate.KEY, {})[sid] || null; },
  set(sid, iso){
    const d = QBANK.store.get(ExamDate.KEY, {});
    if (iso) d[sid] = iso; else delete d[sid];
    QBANK.store.set(ExamDate.KEY, d);
  },

  /* «متبقٍ ٤٥:١٢:٠٩» — بالساعات الكلية لا بالأيام: ٤٥ ساعة أوقع من «يومان» */
  left(iso, now){
    const ms = new Date(iso).getTime() - (now || Date.now());
    if (isNaN(ms)) return null;
    if (ms <= 0) return { over:true, text:'حان وقت الاختبار — بالتوفيق!' };
    const s = Math.floor(ms / 1000);
    const p2 = n => (n < 10 ? '0' : '') + n;
    return { over:false, text:'متبقٍ ' + QBANK.views.arNum(Math.floor(s / 3600)) + ':' +
      QBANK.views.arNum(p2(Math.floor(s / 60) % 60)) + ':' + QBANK.views.arNum(p2(s % 60)) };
  },

  band(sid){
    const box = el('div', { class:'exambar' });
    let timer = null;
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };

    function render(){
      stop();
      box.innerHTML = '';
      const iso = ExamDate.get(sid);
      if (!iso){
        const btn = el('button', { class:'btn btn--sm btn--ghost', type:'button',
          text:'🗓 متى اختبارك؟ اضبط عدّادك' });
        btn.addEventListener('click', () => edit());
        box.appendChild(btn);
        return;
      }
      const t = el('span', { class:'exambar__t num' });
      const when = el('span', { class:'field__hint', text: new Date(iso).toLocaleString('ar', {
        weekday:'long', day:'numeric', month:'long', hour:'numeric', minute:'2-digit' }) });
      const change = el('button', { class:'iconbtn', type:'button', 'aria-label':'غيّر الموعد', text:'✎' });
      change.addEventListener('click', () => edit());
      box.appendChild(el('div', { class:'row', style:'align-items:center' }, [t, when, change]));
      const tick = () => {
        // ★ الوثيقة قد تُفكَّك والعدّاد حي — نوقفه بدل أن ينهار كل ثانية
        if (!box.isConnected) return void stop();
        const L = ExamDate.left(iso);
        t.textContent = L ? L.text : '';
        if (L && L.over) stop();
      };
      tick();
      timer = setInterval(tick, 1000);
    }

    function edit(){
      stop();
      box.innerHTML = '';
      const cur = ExamDate.get(sid);
      const inp = el('input', { class:'input', type:'datetime-local',
        'aria-label':'موعد اختبارك', value: cur ? cur.slice(0, 16) : '' });
      const save = el('button', { class:'btn btn--sm', type:'button', text:'احفظ' });
      const clear = el('button', { class:'btn btn--sm btn--ghost', type:'button', text:'أزل الموعد' });
      save.addEventListener('click', () => {
        if (inp.value) ExamDate.set(sid, new Date(inp.value).toISOString());
        render();
      });
      clear.addEventListener('click', () => { ExamDate.set(sid, null); render(); });
      box.appendChild(el('div', { class:'row' }, [inp, save, cur ? clear : null]));
    }

    render();
    return box;
  }
};

/* بطاقة المحاور بعدّاداتها — «الابتكار التسويقي (الفصل السادس) · ١١» */
function topicsCard(a){
  const ts = (a && a.topics) || [];
  if (!ts.length) return null;
  return el('div', { class:'card stack' }, [
    el('h2', { text:'محاور المادة' }),
    el('div', { class:'stack' }, ts.map(t =>
      el('div', { class:'row', style:'justify-content:space-between' }, [
        el('span', { text: t.name }),
        el('span', { class:'badge num', text: QBANK.views.arNum(t.n) + ' سؤالًا' })
      ])))
  ]);
}

QBANK.analysis = Analysis;
QBANK.examDate = ExamDate;
QBANK.views.analysisHtml = analysisHtml;
QBANK.views.topicsCard = topicsCard;
