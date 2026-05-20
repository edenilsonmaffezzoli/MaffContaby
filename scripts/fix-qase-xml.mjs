/**
 * Corrige XML exportado para importação no Qase (CLI).
 * Uso: node scripts/fix-qase-xml.mjs [entrada.xml]
 * Padrão de entrada: casos-teste-qase (1).xml
 * Saída: casos-teste-qase-corrigido.xml
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const INPUT = process.argv[2] ?? 'casos-teste-qase (1).xml';
const OUTPUT = 'casos-teste-qase-corrigido.xml';

const ALLOWED = new Set(['low', 'medium', 'high']);

function normalizePriority(raw, stats) {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'critical') {
    stats.criticalToHigh += 1;
    return 'high';
  }
  if (ALLOWED.has(v)) return v;
  return 'medium';
}

function escapeXml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function el(name, value) {
  return `<${name}>${escapeXml(value)}</${name}>`;
}

function extractText(block, tag) {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i');
  const m = block.match(re);
  return m ? m[1].trim() : '';
}

function parseCaseBlocks(xml) {
  const blocks = [];
  const re = /<case>([\s\S]*?)<\/case>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    blocks.push(m[1]);
  }
  return blocks;
}

function buildCaseXml(c) {
  const pre = c.preconditions ? `\n      ${el('preconditions', c.preconditions)}` : '';
  const tags = c.tags?.length
    ? `<tags>\n${c.tags.map(t => `        <tag>${escapeXml(t)}</tag>`).join('\n')}\n      </tags>`
    : '';
  const tagsBlock = tags ? `\n      ${tags}` : '';
  const steps = c.steps
    .map(
      s =>
        `        <step>\n          ${el('action', s.action)}\n          ${el('expected_result', s.expected_result)}\n        </step>`,
    )
    .join('\n');
  return `<case>
      ${el('title', c.title)}
      ${el('description', c.description)}
      ${pre}
      ${el('priority', c.priority)}
${tagsBlock}
      <steps>
${steps}
      </steps>
    </case>`;
}

const inputPath = resolve(process.cwd(), INPUT);
let raw = readFileSync(inputPath, 'utf8');

const stats = {
  casesProcessed: 0,
  severityRemoved: 0,
  positionRemoved: 0,
  criticalToHigh: 0,
  outputFilename: OUTPUT,
};

raw = raw.replace(/<severity>[\s\S]*?<\/severity>\s*/gi, () => {
  stats.severityRemoved += 1;
  return '';
});
raw = raw.replace(/<position>\s*[^<]*\s*<\/position>\s*/gi, () => {
  stats.positionRemoved += 1;
  return '';
});
raw = raw.replace(/<step>\s*<data>[\s\S]*?<\/data>\s*/gi, '<step>\n          ');

const cases = [];
for (const block of parseCaseBlocks(raw)) {
  const title = extractText(block, 'title');
  if (!title) continue;
  let description = extractText(block, 'description');
  if (!description) description = title;
  const priority = normalizePriority(extractText(block, 'priority'), stats);
  const preconditions = extractText(block, 'preconditions') || undefined;
  const tags = [...block.matchAll(/<tag>([\s\S]*?)<\/tag>/gi)].map(m => m[1].trim()).filter(Boolean);
  const steps = [];
  for (const stepBlock of block.matchAll(/<step>([\s\S]*?)<\/step>/gi)) {
    const action = extractText(stepBlock[1], 'action');
    const expected_result = extractText(stepBlock[1], 'expected_result');
    if (action && expected_result) steps.push({ action, expected_result });
  }
  if (steps.length === 0) {
    console.error(`Caso "${title}" sem passos válidos; ignorado.`);
    continue;
  }
  cases.push({ title, description, preconditions, priority, tags: tags.length ? tags : undefined, steps });
}

stats.casesProcessed = cases.length;
if (cases.length === 0) {
  console.error('Nenhum caso encontrado no XML.');
  process.exit(1);
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<platform>
  <project>
    <cases>
      ${cases.map(buildCaseXml).join('\n')}
    </cases>
  </project>
</platform>`;

const outPath = resolve(process.cwd(), OUTPUT);
writeFileSync(outPath, xml, 'utf8');

console.log(`Casos processados: ${stats.casesProcessed}`);
console.log(`<severity> removidos: ${stats.severityRemoved}`);
console.log(`<position> removidos: ${stats.positionRemoved}`);
console.log(`Prioridades "critical" → "high": ${stats.criticalToHigh}`);
console.log(`Arquivo: ${outPath}`);
