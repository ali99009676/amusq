/*
  يضبط Info.plist الذي يولّده Capacitor بما لا تضبطه إعداداته:
  ١ · مخطّط الرابط العميق muraja:// — به يعود Safari بعد الدخول (جوجل/آبل/جِتهَب).
  ٢ · اسم العرض بالعربية ولغة التطوير العربية.
  ٣ · ITSAppUsesNonExemptEncryption=NO: التطبيق يستعمل HTTPS فقط، وبدون هذا
      يسأل TestFlight مع كل رفع «هل يستعمل تشفيرًا؟».
  آمن التكرار: لا يضيف مفتاحًا موجودًا.
*/
const fs = require('fs'), path = require('path');
const plistPath = path.join(__dirname, 'ios', 'App', 'App', 'Info.plist');
if (!fs.existsSync(plistPath)) { console.error('✗ لا Info.plist — شغّل npx cap add ios أولًا'); process.exit(1); }
let p = fs.readFileSync(plistPath, 'utf8');

function setString(key, value){
  const re = new RegExp('<key>' + key + '</key>\\s*<string>[^<]*</string>');
  if (re.test(p)) p = p.replace(re, '<key>' + key + '</key>\n\t<string>' + value + '</string>');
  else p = p.replace(/<\/dict>\s*<\/plist>\s*$/, '\t<key>' + key + '</key>\n\t<string>' + value + '</string>\n</dict>\n</plist>\n');
}
function addOnce(key, xml){
  if (p.indexOf('<key>' + key + '</key>') !== -1) return;
  p = p.replace(/<\/dict>\s*<\/plist>\s*$/, '\t<key>' + key + '</key>\n' + xml + '\n</dict>\n</plist>\n');
}

setString('CFBundleDisplayName', 'مراجعة');
setString('CFBundleDevelopmentRegion', 'ar');
addOnce('CFBundleLocalizations', '\t<array>\n\t\t<string>ar</string>\n\t\t<string>en</string>\n\t</array>');
addOnce('ITSAppUsesNonExemptEncryption', '\t<false/>');
addOnce('CFBundleURLTypes',
  '\t<array>\n\t\t<dict>\n\t\t\t<key>CFBundleURLName</key>\n\t\t\t<string>com.alsoqoor.muraja</string>\n' +
  '\t\t\t<key>CFBundleURLSchemes</key>\n\t\t\t<array>\n\t\t\t\t<string>muraja</string>\n\t\t\t</array>\n\t\t</dict>\n\t</array>');
/* واتساب رابطٌ خارجي يُفتح من التطبيق — إعلانه هنا يُبقي canOpenURL صادقًا */
addOnce('LSApplicationQueriesSchemes', '\t<array>\n\t\t<string>whatsapp</string>\n\t</array>');

fs.writeFileSync(plistPath, p);
console.log('✓ Info.plist: muraja:// · مراجعة · ar · NonExemptEncryption=NO');
