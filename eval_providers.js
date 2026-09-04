'use strict';

// تقييم المزوّدين على أسئلة حقيقية من ملف دكتور.
//
// لماذا هذا السكربت موجود: قرار «أي مزوّد يستحق الاستنتاج» لا يُتخذ بانطباع.
// الدقّة تُقاس آليًا لأن الإجابة الصحيحة معروفة عندنا ومخفيّة عن النموذج،
// والترجمة العربية لا تُقاس آليًا فتُطبع جنبًا إلى جنب ليحكم عليها إنسان.
//
// التشغيل:
//   node tools/eval_providers.js questions.json
// والمفاتيح من البيئة وحدها:
//   export $(grep -v '^#' .env.local | xargs)   أو  vercel env pull

const fs = require('fs');
const path = require('path');
const { createAI, readProviders } = require('../api/_ai.js');

// ————— صيغة ملف الأسئلة —————
// [{ id, text, options: {A:"...",B:"..."}, answer: "B" }, ...]
// تُؤخذ من أسئلة وصلت إجاباتها مع ملف الدكتور (derived = false)،
// لأن الحكم على الاستنتاج يحتاج إجابة صحيحة نقارن بها.

function load(file) {
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  const bad = rows.filter(q => !q.id || !q.text || !q.options || !q.answer);
  if (bad.length) throw new Error(`${bad.length} سؤالًا ناقص الحقول`);
  return rows;
}

function renderOptions(opts) {
  return Object.entries(opts).map(([k, v]) => `${k}) ${v}`).join('\n');
}

// ————— المهمة الأولى: استنتاج الإجابة (تُقاس آليًا) —————
const DERIVE_SYSTEM =
  'You are answering a university multiple-choice exam question. ' +
  'Reply with the letter of the correct option and nothing else. No explanation, no punctuation.';

function deriveScore(reply, answer) {
  // النموذج قد يردّ «B» أو «B)» أو «الإجابة B» — نلتقط أول حرف خيار
  const m = String(reply).trim().match(/[A-Za-z]/);
  return m ? m[0].toUpperCase() === String(answer).trim().toUpperCase() : false;
}

// ————— المهمة الثانية: الترجمة (تُراجَع بعين إنسان) —————
const TRANSLATE_SYSTEM =
  'Translate the following exam question into Modern Standard Arabic. ' +
  'Keep technical and medical terms accurate. Output only the Arabic translation.';

async function run() {
  const file = process.argv[2];
  if (!file) {
    console.error('الاستعمال: node tools/eval_providers.js questions.json');
    process.exit(2);
  }
  const questions = load(file);
  const configured = readProviders(process.env);
  if (!configured.length) throw new Error('لا مزوّد مُعرَّف — راجع AI_PROVIDERS');

  console.log(`المزوّدون: ${configured.map(c => c.id).join('، ')}`);
  console.log(`الأسئلة: ${questions.length}\n`);

  const results = {};
  const translations = [];

  for (const cfg of configured) {
    // مزوّد واحد في كل تشغيل حتى لا يخلط التناوب النتائج بين اثنين
    const ai = createAI({
      env: { ...process.env, AI_PROVIDERS: cfg.id, AI_POLICY: 'failover', [`${cfg.id.toUpperCase()}_ROLES`]: '' },
    });

    let correct = 0, failed = 0;
    const t0 = Date.now();

    for (const q of questions) {
      const user = `${q.text}\n\n${renderOptions(q.options)}`;
      try {
        const r = await ai.call('derive', { system: DERIVE_SYSTEM, user, maxTokens: 8, temperature: 0 });
        if (deriveScore(r.text, q.answer)) correct++;
      } catch (e) {
        failed++;
      }
      try {
        const tr = await ai.call('translate', { system: TRANSLATE_SYSTEM, user: q.text, maxTokens: 512 });
        translations.push({ provider: cfg.id, id: q.id, source: q.text, arabic: tr.text.trim() });
      } catch (e) {
        translations.push({ provider: cfg.id, id: q.id, source: q.text, arabic: `[فشل: ${e.message}]` });
      }
    }

    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    results[cfg.id] = { correct, total: questions.length, failed, secs };
    console.log(`${cfg.id}: ${correct}/${questions.length} صحيح · ${failed} فشل · ${secs} ثانية`);
  }

  // ————— تقرير الترجمة للمراجعة البشرية —————
  const out = path.join(process.cwd(), 'eval-translations.md');
  const lines = ['# مقارنة الترجمة العربية', ''];
  for (const q of questions) {
    lines.push(`## ${q.id}`, '', '**الأصل:**', '', q.text, '');
    for (const cfg of configured) {
      const row = translations.find(x => x.provider === cfg.id && x.id === q.id);
      lines.push(`**${cfg.id}:**`, '', (row ? row.arabic : '—'), '');
    }
    lines.push('---', '');
  }
  fs.writeFileSync(out, lines.join('\n'), 'utf8');

  console.log(`\nالترجمات في ${out} — راجعها بعينك، لا رقم يحكم عليها.`);
  console.log('قاعدة القرار: المزوّد الذي يقلّ عن ٩٠٪ في الاستنتاج لا يُعطى دور derive.');
}

run().catch(e => { console.error('فشل التقييم:', e.message); process.exit(1); });
