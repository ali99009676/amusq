/*
  مخزن المحتوى المحلي: الأسئلة في IndexedDB لأن مادة واحدة بمئات الأسئلة
  تتجاوز سقف localStorage (≈ ٥ ميغابايت). عند غياب IndexedDB (فحوص jsdom،
  أو تصفح خاص متشدد) نسقط إلى ذاكرة مؤقتة فلا تنكسر المنصة — تعمل بلا حفظ فقط.
*/
const Data = {
  DB_NAME: 'qbank', DB_VER: 1,
  _db: null,
  _mem: { questions: new Map(), meta: new Map() },
  hasIDB(){ return typeof indexedDB !== 'undefined'; },

  OLD_DB: 'amusq',   // قاعدة الأسئلة قبل تغيير الهوية

  /*
    نقل أسئلة الطالب المحفوظة من قاعدة الهوية القديمة.

    الأسئلة بيانات مشتقّة تُجلب من الخادم عند الحاجة، لكن وعد المنصة أنها
    «تعمل بلا إنترنت بعد أول فتح». لو تركنا القديمة لوجد الطالب الذي يذاكر
    في الطائرة مادته فارغة. فننسخها مرة واحدة ثم نحذف القديمة كي لا تشغل مساحة.
  */
  migrateDB(){
    if (!Data.hasIDB()) return Promise.resolve(0);
    return new Promise(resolve => {
      let req;
      try { req = indexedDB.open(Data.OLD_DB); } catch(e){ return resolve(0); }
      req.onerror = () => resolve(0);
      req.onupgradeneeded = () => {
        // لم تكن موجودة أصلًا: نُجهض الإنشاء فلا نترك قاعدة فارغة خلفنا
        try { req.transaction.abort(); } catch(e){}
        resolve(0);
      };
      req.onsuccess = async () => {
        const oldDb = req.result;
        if (!oldDb.objectStoreNames.contains('questions')){ oldDb.close(); return resolve(0); }
        const rows = await new Promise(r => {
          try {
            const g = oldDb.transaction('questions','readonly').objectStore('questions').getAll();
            g.onsuccess = () => r(g.result || []); g.onerror = () => r([]);
          } catch(e){ r([]); }
        });
        oldDb.close();
        if (!rows.length){ try { indexedDB.deleteDatabase(Data.OLD_DB); } catch(e){} return resolve(0); }
        const db = await Data.open();
        if (!db) return resolve(0);
        const tx = db.transaction('questions','readwrite');
        const st = tx.objectStore('questions');
        rows.forEach(q => { try { st.put(q); } catch(e){} });
        tx.oncomplete = () => { try { indexedDB.deleteDatabase(Data.OLD_DB); } catch(e){} resolve(rows.length); };
        tx.onerror = () => resolve(0);
      };
    });
  },

  open(){
    if (!Data.hasIDB()) return Promise.resolve(null);
    if (Data._db) return Promise.resolve(Data._db);
    return new Promise((resolve) => {
      const req = indexedDB.open(Data.DB_NAME, Data.DB_VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('questions')) {
          const st = db.createObjectStore('questions', { keyPath:'id' });
          st.createIndex('subject_id', 'subject_id');   // الجلب دائمًا بمادة كاملة
        }
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath:'k' });
      };
      req.onsuccess = () => { Data._db = req.result; resolve(Data._db); };
      req.onerror = () => resolve(null);   // فشل الفتح لا يُسقط المنصة
    });
  },

  async putQuestions(subjectId, questions){
    if (!Data.hasIDB()) {
      questions.forEach(q => Data._mem.questions.set(q.id, q));
      Data._mem.meta.set('subj:' + subjectId, Date.now());
      return true;
    }
    const db = await Data.open();
    if (!db) return false;
    return new Promise((resolve) => {
      const tx = db.transaction(['questions','meta'], 'readwrite');
      const st = tx.objectStore('questions');
      questions.forEach(q => st.put(q));
      tx.objectStore('meta').put({ k:'subj:' + subjectId, at: Date.now() });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  },

  async getQuestions(subjectId){
    if (!Data.hasIDB()) {
      return Array.from(Data._mem.questions.values())
        .filter(q => q.subject_id === subjectId)
        .sort((a,b) => (a.ord||0) - (b.ord||0));
    }
    const db = await Data.open();
    if (!db) return [];
    return new Promise((resolve) => {
      const tx = db.transaction('questions', 'readonly');
      const idx = tx.objectStore('questions').index('subject_id');
      const req = idx.getAll(subjectId);
      req.onsuccess = () => resolve((req.result || []).sort((a,b) => (a.ord||0) - (b.ord||0)));
      req.onerror = () => resolve([]);
    });
  },

  async hasSubject(subjectId){
    if (!Data.hasIDB()) return Data._mem.meta.has('subj:' + subjectId);
    const db = await Data.open();
    if (!db) return false;
    return new Promise((resolve) => {
      const req = db.transaction('meta','readonly').objectStore('meta').get('subj:' + subjectId);
      req.onsuccess = () => resolve(!!req.result);
      req.onerror = () => resolve(false);
    });
  },

  async clearAll(){
    Data._mem.questions.clear(); Data._mem.meta.clear();
    if (!Data.hasIDB()) return true;
    const db = await Data.open();
    if (!db) return true;
    return new Promise((resolve) => {
      const tx = db.transaction(['questions','meta'], 'readwrite');
      tx.objectStore('questions').clear();
      tx.objectStore('meta').clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  },

  /* --- المحتوى المنشور: قائمة المواد خفيفة في localStorage، والأسئلة عند الطلب --- */
  pack(){ return QBANK.store.get('pack', { subjects: [], settings: {} }); },
  savePack(p){ QBANK.store.set('pack', p); },

  async refreshPack(){
    const r = await QBANK.api.rpc('content_pack');
    if (r.ok && r.data && r.data.subjects) { Data.savePack(r.data); return { ok:true, data:r.data }; }
    return r;   // فشل أو بلا إنترنت: نبقى على النسخة المخزّنة — هذا جوهر العمل دون اتصال
  },

  // أسئلة مادة: من الجهاز إن سبق جلبها، وإلا من الخادم ثم تُخزَّن — «تحميل على مراحل»
  async subjectQuestions(subjectId){
    if (await Data.hasSubject(subjectId)) {
      const local = await Data.getQuestions(subjectId);
      if (local.length) return { ok:true, data:local, from:'device' };
    }
    const r = await QBANK.api.rpc('subject_questions', { sid: subjectId });
    if (r.ok && Array.isArray(r.data)) {
      await Data.putQuestions(subjectId, r.data);
      return { ok:true, data:r.data, from:'network' };
    }
    return { ok:false, offline: r.offline, data: [] };
  }
};
QBANK.data = Data;
