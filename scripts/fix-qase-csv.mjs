/**
 * Converte XML legado ou re-sanitiza CSV para o padrão Qase CSV.
 * Uso: node scripts/fix-qase-csv.mjs [entrada.csv|entrada.xml]
 * Saída: casos-teste-qase-corrigido.csv
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const INPUT = process.argv[2] ?? 'casos-teste-qase (1).xml';
const OUTPUT = 'casos-teste-qase-corrigido.csv';

const ALLOWED = new Set(['low', 'medium', 'high']);
const TAGS_BEFORE_STEPS = 4;
const MIN_STEP_SLOTS = 7;
const MIN_TAG_SLOTS = 5;

function escapeCsvField(value) {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function normalizePriority(raw, stats) {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'critical') {
    stats.criticalToHigh += 1;
    return 'high';
  }
  if (ALLOWED.has(v)) return v;
  return 'medium';
}

function parseCsvLine(line) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      fields.push(cur);
      cur = '';
    } else cur += ch;
  }
  fields.push(cur);
  return fields;
}

function buildHeader(maxSteps, maxTags) {
  const cols = ['title', 'description', 'preconditions', 'priority'];
  const tagsBefore = Math.min(TAGS_BEFORE_STEPS, maxTags);
  for (let i = 0; i < tagsBefore; i++) cols.push(`tags/tag/${i}`);
  for (let i = 0; i < maxSteps; i++) {
    cols.push(`steps/step/${i}/action`, `steps/step/${i}/expected_result`);
  }
  for (let i = TAGS_BEFORE_STEPS; i < maxTags; i++) cols.push(`tags/tag/${i}`);
  return cols;
}

function buildRow(c, maxSteps, maxTags) {
  const tags = c.tags ?? [];
  const values = [c.title, c.description, c.preconditions ?? '', c.priority];
  const tagsBefore = Math.min(TAGS_BEFORE_STEPS, maxTags);
  for (let i = 0; i < tagsBefore; i++) values.push(tags[i] ?? '');
  for (let i = 0; i < maxSteps; i++) {
    const s = c.steps[i];
    values.push(s?.action ?? '', s?.expected_result ?? '');
  }
  for (let i = TAGS_BEFORE_STEPS; i < maxTags; i++) values.push(tags[i] ?? '');
  return values.map(escapeCsvField);
}

function extractText(block, tag) {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i');
  const m = block.match(re);
  return m ? m[1].trim() : '';
}

function parseXmlCases(xml, stats) {
  const cases = [];
  const re = /<case>([\s\S]*?)<\/case>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const block = m[1];
    const title = extractText(block, 'title');
    if (!title) continue;
    let description = extractText(block, 'description');
    if (!description) description = title;
    const priority = normalizePriority(extractText(block, 'priority'), stats);
    const preconditions = extractText(block, 'preconditions') || '';
    const tags = [...block.matchAll(/<tag>([\s\S]*?)<\/tag>/gi)].map(x => x[1].trim()).filter(Boolean);
    const steps = [];
    for (const sm of block.matchAll(/<step>([\s\S]*?)<\/step>/gi)) {
      const action = extractText(sm[1], 'action');
      const expected_result = extractText(sm[1], 'expected_result');
      if (action && expected_result) steps.push({ action, expected_result });
    }
    if (!steps.length) continue;
    cases.push({ title, description, preconditions, priority, tags, steps });
  }
  return cases;
}

function parseCsvCases(raw, stats) {
  const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
  const header = parseCsvLine(lines[0]);
  const col = name => header.indexOf(name);
  const titleIdx = col('title');
  const tagCols = header
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => /^tags\/tag\/\d+$/.test(h))
    .sort((a, b) => Number(a.h.split('/').pop()) - Number(b.h.split('/').pop()));
  const stepIndices = [
    ...new Set(
      header
        .map(h => h.match(/^steps\/step\/(\d+)\/action$/))
        .filter(Boolean)
        .map(m => Number(m[1])),
    ),
  ].sort((a, b) => a - b);

  const cases = [];
  for (let li = 1; li < lines.length; li++) {
    const fields = parseCsvLine(lines[li]);
    const title = fields[titleIdx]?.trim() ?? '';
    if (!title) continue;
    let description = col('description') >= 0 ? fields[col('description')]?.trim() ?? '' : '';
    if (!description) description = title;
    const priority = normalizePriority(col('priority') >= 0 ? fields[col('priority')] : '', stats);
    const preconditions = col('preconditions') >= 0 ? fields[col('preconditions')]?.trim() ?? '' : '';
    const tags = tagCols.map(({ i }) => fields[i]?.trim() ?? '').filter(Boolean);
    const steps = [];
    for (const si of stepIndices) {
      const a = col(`steps/step/${si}/action`);
      const e = col(`steps/step/${si}/expected_result`);
      const action = a >= 0 ? fields[a]?.trim() ?? '' : '';
      const expected_result = e >= 0 ? fields[e]?.trim() ?? '' : '';
      if (action && expected_result) steps.push({ action, expected_result });
    }
    if (!steps.length) continue;
    cases.push({ title, description, preconditions, priority, tags, steps });
  }
  return cases;
}

const inputPath = resolve(process.cwd(), INPUT);
const raw = readFileSync(inputPath, 'utf8');
const stats = {
  casesProcessed: 0,
  criticalToHigh: 0,
  maxStepSlots: MIN_STEP_SLOTS,
  maxTagSlots: MIN_TAG_SLOTS,
  outputFilename: OUTPUT,
};

const cases = raw.trim().startsWith('<')
  ? parseXmlCases(raw, stats)
  : parseCsvCases(raw, stats);

if (!cases.length) {
  console.error('Nenhum caso encontrado.');
  process.exit(1);
}

let maxSteps = MIN_STEP_SLOTS;
let maxTags = MIN_TAG_SLOTS;
for (const c of cases) {
  maxSteps = Math.max(maxSteps, c.steps.length);
  maxTags = Math.max(maxTags, c.tags?.length ?? 0);
}
stats.maxStepSlots = maxSteps;
stats.maxTagSlots = maxTags;
stats.casesProcessed = cases.length;

const header = buildHeader(maxSteps, maxTags);
const rows = cases.map(c => buildRow(c, maxSteps, maxTags));
const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\n');

const outPath = resolve(process.cwd(), OUTPUT);
writeFileSync(outPath, csv, 'utf8');

console.log(`Casos processados: ${stats.casesProcessed}`);
console.log(`Prioridades "critical" → "high": ${stats.criticalToHigh}`);
console.log(`Colunas de passos: ${stats.maxStepSlots}`);
console.log(`Colunas de tags: ${stats.maxTagSlots}`);
console.log(`Arquivo: ${outPath}`);
