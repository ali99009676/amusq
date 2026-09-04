/*
  يجهّز www/ لغلاف التطبيق: الملف المبني نفسه الذي يخدم الموقع، بلا نسخة
  ثانية من الكود. يُشغَّل بعد node src/build.js في الجذر.
  ★ لا يُعدَّل index.html هنا: ما يصل الطالب في التطبيق هو ما فُحص على الويب.
*/
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const www  = path.join(__dirname, 'www');
fs.rmSync(www, { recursive:true, force:true });
fs.mkdirSync(www, { recursive:true });
const files = ['index.html', 'manifest.webmanifest', 'sw.js',
               'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];
let n = 0;
for (const f of files){
  const src = path.join(root, f);
  if (!fs.existsSync(src)) { console.warn('⚠ مفقود: ' + f); continue; }
  fs.copyFileSync(src, path.join(www, f)); n++;
}
const html = fs.readFileSync(path.join(www, 'index.html'), 'utf8');
if (html.indexOf('QBANK.native') === -1) { console.error('✗ index.html بلا طبقة التطبيق (76-native) — ابنِ الموقع أولًا'); process.exit(1); }
console.log('✓ www جاهز — ' + n + ' ملفات · index.html ' + Math.round(html.length / 1024) + ' ك.ب');
