/*
  ═══════════════════════════════════════════════════════════════════
  الأيقونات — مجموعة واحدة بخطٍّ واحد لكل الواجهة
  ═══════════════════════════════════════════════════════════════════
  كانت الواجهة تخلط رموز يونيكود (☺ ⇪ ↻ ⌂) وإيموجي (🏆 🔔 💳) — كلٌّ
  بخطٍّ ولونٍ وحجمٍ من عند نظام التشغيل، فتبدو الشاشة مرقّعة. هنا مسارات
  SVG مرسومة بخطٍّ ٢ وزوايا مستديرة (على طراز Lucide)، تأخذ لون النص
  الذي حولها، وتُرسم بالحجم نفسه في كل مكان. لا مكتبة ولا ملف خارجي.

  ★ الاستعمال: QBANK.ico('trophy') يعيد عنصر SVG جاهزًا. والاسم غير
  المعروف يعيد دائرةً فارغة لا خطأً — أيقونةٌ ناقصة أهون من شاشةٍ مكسورة.
*/
const ICON_PATHS = {
  home:        'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  search:      'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM21 21l-4.3-4.3',
  repeat:      'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
  upload:      'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  user:        'M18 20a6 6 0 0 0-12 0M12 14a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  users:       'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  activity:    'M22 12h-4l-3 9L9 3l-3 9H2',
  settings:    'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  trophy:      'M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.7V17c0 .6-.5 1-1 1.2C7.9 18.8 7 20.2 7 22M14 14.7V17c0 .6.5 1 1 1.2 1.1.6 2 2 2 3.8M18 2H6v7a6 6 0 0 0 12 0V2Z',
  school:      'M14 22v-4a2 2 0 1 0-4 0v4M18 10l4 2v10H2V12l4-2M12 2 8 5v3h8V5l-4-3ZM6 10v12M18 10v12',
  bell:        'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0',
  phone:       'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.9.6 2.8.7a2 2 0 0 1 1.7 2Z',
  clock:       'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 6v6l4 2',
  card:        'M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM2 10h20',
  swap:        'M8 3 4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4',
  edit:        'M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3Z',
  flag:        'M4 22V4a1 1 0 0 1 1-1h11l1 2h5v11h-6l-1-2H4',
  book:        'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z',
  stethoscope: 'M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 12 0V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3M8 15v1a6 6 0 0 0 6 6 6 6 0 0 0 6-6v-4M20 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  heart:       'M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z',
  flask:       'M10 2v7.5L4.2 19a2 2 0 0 0 1.7 3h12.2a2 2 0 0 0 1.7-3L14 9.5V2M8.5 2h7M7 16h10',
  plus:        'M12 5v14M5 12h14',
  gem:         'M6 3h12l4 6-10 13L2 9ZM11 3 8 9l4 13 4-13-3-6M2 9h20',
  wind:        'M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2M9.6 4.6A2 2 0 1 1 11 8H2M12.6 19.4A2 2 0 1 0 14 16H2',
  smile:       'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01',
  shield:      'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z',
  layout:      'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  list:        'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  check:       'M20 6 9 17l-5-5',
  checkCircle: 'M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14l-3-3',
  x:           'M18 6 6 18M6 6l12 12',
  coins:       'M8 14a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM18.1 10.4A6 6 0 1 1 10.3 18M7 6h1v4M16.7 13.9l.7.7-2.8 2.8',
  calendar:    'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  star:        'm12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.9L12 17.8l-6.2 3.3L7 14.2 2 9.3l6.9-1L12 2Z',
  share:       'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13',
  print:       'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z',
  chevron:     'm9 18 6-6-6-6',
  arrow:       'M19 12H5M12 19l-7-7 7-7',
  target:      'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  flame:       'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-5 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.5-2.3 1-3 .5 1 1.5 1.5 2.5 1.5Z',
  brain:       'M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-1.04ZM14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24A2.5 2.5 0 0 0 14.5 2Z',
  message:     'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z',
  eye:         'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  zap:         'M13 2 3 14h9l-1 8 10-12h-9l1-8Z',
  circle:      'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z'
};

/* رموز المواد القديمة (يختارها المشرف من قائمة) تُرسم أيقوناتٍ من المجموعة نفسها */
const GLYPH_ICON = { '▤':'book', '☤':'stethoscope', '✚':'plus', '♥':'heart', '◈':'gem',
                     '⚕':'stethoscope', '☣':'flask', '◐':'wind', '⌁':'activity', '⚗':'flask' };

function ico(name, opts){
  const o = opts || {};
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  const size = o.size || 20;
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size)); svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none'); svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'ico' + (o.cls ? ' ' + o.cls : ''));
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', ICON_PATHS[name] || ICON_PATHS.circle);
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', String(o.weight || 2));
  path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);
  return svg;
}
/* أيقونة مادة من رمزها: SVG إن عُرف الرمز، وإلا النص كما هو (رمزٌ جديد لا نعرفه لا يُخفى) */
function subjIcon(glyph, size){
  const name = GLYPH_ICON[String(glyph || '').trim()];
  if (name) return ico(name, { size: size || 24, weight: 1.9 });
  const s = document.createElement('span'); s.textContent = glyph || '▤'; s.setAttribute('aria-hidden', 'true');
  return s;
}
QBANK.ico = ico;
QBANK.subjIcon = subjIcon;
QBANK.ICON_PATHS = ICON_PATHS;
QBANK.GLYPH_ICON = GLYPH_ICON;
