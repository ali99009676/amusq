'use strict';
/*
  سكربت البناء — يدمج كل ملفات src/css و src/js داخل قالب src/shell.html
  فيخرج ملف index.html واحد مستقل تمامًا.
  لماذا الدمج بدل الاستيراد؟ لأن المنصة يجب أن تعمل بفتح الملف مباشرة (file://)
  وبلا إنترنت، وأي <link> أو <script src> خارجي يكسر هذا الشرط.
*/
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = __dirname;

// الترتيب مهم: الملفات مرقّمة بالبادئة (00، 10، 20...) فيكفي الترتيب الأبجدي
function readDir(dir, ext) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith(ext))
    .sort()
    .map(f => ({ name: f, code: fs.readFileSync(path.join(dir, f), 'utf8') }));
}

function banner(name) {
  return '\n/* ===== ' + name + ' ===== */\n';
}

function build() {
  const css = readDir(path.join(SRC, 'css'), '.css');
  const js = readDir(path.join(SRC, 'js'), '.js');

  if (!css.length) throw new Error('لا توجد ملفات CSS في src/css');
  if (!js.length) throw new Error('لا توجد ملفات JS في src/js');

  const styles = css.map(f => banner(f.name) + f.code).join('\n');

  // إن وُجد config.json يُحقن الربط في الملف المبني — قيم عامة بطبيعتها (RLS هي الحماية)
  let cfgSnippet = '';
  const cfgPath = path.join(ROOT, 'config.json');
  if (fs.existsSync(cfgPath)) {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    cfgSnippet = 'window.QBANK_INJECTED_CONFIG = ' + JSON.stringify({ url: cfg.url, anonKey: cfg.anonKey }) + ';\n';
    console.log('✓ حُقن إعداد الربط من config.json');
  }

  // نلفّ الجافاسكربت في IIFE واحدة كي لا تتسرّب المتغيرات إلى النطاق العام،
  // ونستخدم 'use strict' مرة واحدة للجميع.
  const scripts =
    cfgSnippet +
    '(function(){\n"use strict";\n' +
    js.map(f => banner(f.name) + f.code).join('\n') +
    '\n})();\n';

  let html = fs.readFileSync(path.join(SRC, 'shell.html'), 'utf8');
  html = html.replace('/*__STYLES__*/', () => styles);
  html = html.replace('/*__SCRIPTS__*/', () => scripts);

  const out = path.join(ROOT, 'index.html');
  fs.writeFileSync(out, html, 'utf8');

  const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
  console.log('✓ بُني index.html — ' + kb + ' ك.ب · ' + css.length + ' ملف CSS · ' + js.length + ' ملف JS');
  return out;
}

if (require.main === module) {
  try { build(); }
  catch (e) { console.error('✗ فشل البناء: ' + e.message); process.exit(1); }
}
module.exports = { build };
