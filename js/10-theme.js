/*
  الليلي هو الافتراضي — مثل AMSU تمامًا وبطلب علي.
  اختيار المستخدم يُحترم أولًا، ومن لم يختر يفتح على الليل: الطلاب يذاكرون
  ليلًا في الغالب، وهوية AMSU المنقولة صُمّمت على الأسود أولًا.
*/
const Theme = {
  KEY: 'theme',
  DEFAULT: 'dark',
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
  current(){ return QBANK.store.get(Theme.KEY, Theme.DEFAULT); },
  set(mode){ QBANK.store.set(Theme.KEY, mode); return Theme.apply(mode); },
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
QBANK.theme = Theme;
