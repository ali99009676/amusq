/*
  الوضع الليلي اختياري لا تلقائي: نحترم اختيار المستخدم أولًا،
  وإن لم يختر شيئًا نتبع نظام جهازه. السبب: طلاب يذاكرون ليلًا وطلاب يطبعون نهارًا.
*/
const Theme = {
  KEY: 'theme',
  apply(mode){
    // mode: 'light' | 'dark' | 'auto'
    const root = document.documentElement;
    const isDark = mode === 'dark' || (mode === 'auto' && Theme.prefersDark());
    if (isDark) root.setAttribute('data-theme','dark');
    else root.setAttribute('data-theme','light');
    const ico = document.querySelector('[data-theme-icon]');
    if (ico) ico.textContent = isDark ? '☀' : '☾';
    return isDark ? 'dark' : 'light';
  },
  prefersDark(){
    try{ return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); }
    catch(e){ return false; }
  },
  current(){ return AMUSQ.store.get(Theme.KEY, 'auto'); },
  set(mode){ AMUSQ.store.set(Theme.KEY, mode); return Theme.apply(mode); },
  toggle(){
    const now = document.documentElement.getAttribute('data-theme') === 'dark';
    return Theme.set(now ? 'light' : 'dark');
  },
  init(){
    Theme.apply(Theme.current());
    const btn = document.getElementById('themeBtn');
    if (btn) btn.addEventListener('click', () => Theme.toggle());
  }
};
AMUSQ.theme = Theme;
