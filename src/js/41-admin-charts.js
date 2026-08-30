/*
  رسوم اللوحة — SVG مبني بيدنا لا مكتبة رسم.
  السبب: قاعدة «لا مكتبة خارجية في المتصفح»، والرسوم التي نحتاجها بسيطة
  (أعمدة وخط ومقاييس) فكتابتها أرخص من أي مكتبة وأخف على الجوال.
*/
const SVGNS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs){
  const n = document.createElementNS(SVGNS, tag);
  if (attrs) Object.keys(attrs).forEach(k => {
    if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, String(attrs[k]));
  });
  return n;
}

/* أعمدة النشاط اليومي + خط متوسط النتيجة فوقها */
function chartActivity(series){
  const W = 640, H = 170, PAD_B = 22, PAD_T = 10;
  const svg = svgEl('svg', { class:'ad-chart', viewBox:'0 0 ' + W + ' ' + H,
    preserveAspectRatio:'none', role:'img', 'aria-label':'نشاط الاختبارات اليومي' });
  const n = series.length || 1;
  const maxN = Math.max(1, ...series.map(s => Number(s.n)));
  const bw = W / n, gap = Math.min(6, bw * .25);
  const plotH = H - PAD_B - PAD_T;

  // خطوط شبكة أفقية — ثلاثة تكفي لقراءة المقياس بلا ضجيج
  [0, .5, 1].forEach(f => {
    const y = PAD_T + plotH * (1 - f);
    svg.appendChild(svgEl('line', { class:'grid', x1:0, y1:y, x2:W, y2:y }));
    svg.appendChild(Object.assign(svgEl('text', { class:'lbl', x:2, y:y - 3 }),
      { textContent: String(Math.round(maxN * f)) }));
  });

  series.forEach((s, i) => {
    const v = Number(s.n);
    const h = Math.max(v > 0 ? 3 : 2, plotH * (v / maxN));
    svg.appendChild(svgEl('rect', {
      class: 'bar' + (v ? '' : ' bar--empty'),
      x: i * bw + gap / 2, y: PAD_T + plotH - h,
      width: Math.max(2, bw - gap), height: h, rx: 3
    }));
    // تسمية اليوم: نعرض كل يومين على الجوال كي لا تتداخل
    if (n <= 8 || i % 2 === 0) {
      const day = String(s.d).slice(8, 10);
      svg.appendChild(Object.assign(
        svgEl('text', { class:'lbl', x: i * bw + bw / 2, y: H - 6, 'text-anchor':'middle' }),
        { textContent: day }));
    }
  });

  // خط متوسط النتيجة — يقرأ على مقياس ٠–١٠٠ لا على مقياس العدد
  const pts = series.map((s, i) => [i * bw + bw / 2, PAD_T + plotH * (1 - Number(s.avg) / 100)]);
  if (pts.some((p, i) => Number(series[i].avg) > 0)) {
    svg.appendChild(svgEl('path', { class:'line',
      d: pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ') }));
    pts.forEach((p, i) => { if (Number(series[i].avg) > 0)
      svg.appendChild(svgEl('circle', { class:'dot', cx:p[0], cy:p[1], r:2.4 })); });
  }
  return svg;
}

/* شرائح النتائج — أشرطة أفقية تُقرأ أسرع من دائرة */
function chartBuckets(buckets){
  const total = buckets.reduce((n, b) => n + Number(b.n), 0) || 1;
  const COLORS = ['var(--bad)','var(--warn)','var(--star)','var(--brand-2)','var(--ok)'];
  return el('div', {}, buckets.map((b, i) => {
    const pct = Number(b.n) / total * 100;
    return el('div', { class:'ad-bucket' }, [
      el('span', { class:'ad-bucket__l', text: b.label }),
      el('span', { class:'ad-bucket__t' }, [
        el('span', { class:'ad-bucket__f', style:'width:' + pct.toFixed(1) + '%;background:' + COLORS[i] })
      ]),
      el('span', { class:'ad-bucket__n', text: String(b.n) })
    ]);
  }));
}

/* بطاقة مؤشر */
function kpi(n, label, sub, tone){
  return el('div', { class:'ad-kpi' + (tone ? ' ad-kpi--' + tone : '') }, [
    el('span', { class:'ad-kpi__n', text: String(n) }),
    el('span', { class:'ad-kpi__l', text: label }),
    sub ? el('span', { class:'ad-kpi__s', text: sub }) : null
  ]);
}

/* وقت نسبي مختصر */
function ago(iso){
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'الآن';
  if (s < 3600) return Math.floor(s / 60) + ' د';
  if (s < 86400) return Math.floor(s / 3600) + ' س';
  return Math.floor(s / 86400) + ' يوم';
}

QBANK.admin = QBANK.admin || {};
QBANK.admin.charts = { chartActivity, chartBuckets, kpi, ago, svgEl };
