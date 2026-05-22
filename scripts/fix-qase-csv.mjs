/**
 * Converte XML legado ou CSV antigo para leitura local (saída legado 23 colunas).
 * A exportação na aplicação web usa CSV Qase.io v2 com suite_id/suite_parent_id.
 * Uso: node scripts/fix-qase-csv.mjs [entrada.csv|entrada.xml]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const INPUT = process.argv[2] ?? 'casos-teste-qase (1).xml';
const OUTPUT = 'casos-teste-qase-corrigido.csv';

const HEADER =
  'title,description,preconditions,priority,tags/tag/0,tags/tag/1,tags/tag/2,tags/tag/3,steps/step/0/action,steps/step/0/expected_result,steps/step/1/action,steps/step/1/expected_result,steps/step/2/action,steps/step/2/expected_result,steps/step/3/action,steps/step/3/expected_result,steps/step/4/action,steps/step/4/expected_result,steps/step/5/action,steps/step/5/expected_result,steps/step/6/action,steps/step/6/expected_result,tags/tag/4';

const STEP_SLOTS = 7;
const TAG_SLOTS = 5;
const ALLOWED = new Set(['low', 'medium', 'high']);

function escapeCsvField(value) {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
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

function normalizePriority(raw, stats) {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'critical') {
    stats.criticalToHigh += 1;
    return 'high';
  }
  if (ALLOWED.has(v)) return v;
  return 'medium';
}

function normalizeTags(tags) {
  return tags
    .map(t =>
      t
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9_-]/g, ''),
    )
    .filter(Boolean)
    .slice(0, TAG_SLOTS);
}

function buildRow(c) {
  const tags = c.tags ?? [];
  const values = [c.title, c.description, c.preconditions ?? '', c.priority];
  for (let i = 0; i < 4; i++) values.push(tags[i] ?? '');
  for (let i = 0; i < STEP_SLOTS; i++) {
    const s = c.steps[i];
    values.push(s?.action ?? '', s?.expected_result ?? '');
  }
  values.push(tags[4] ?? '');
  return values.map(escapeCsvField).join(',');
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
    const tags = normalizeTags(
      [...block.matchAll(/<tag>([\s\S]*?)<\/tag>/gi)].map(x => x[1]),
    );
    const steps = [];
    for (const sm of block.matchAll(/<step>([\s\S]*?)<\/step>/gi)) {
      const action = extractText(sm[1], 'action');
      const expected_result = extractText(sm[1], 'expected_result');
      if (action && expected_result) steps.push({ action, expected_result });
    }
    if (!steps.length) continue;
    if (steps.length > STEP_SLOTS) stats.stepsTruncated += steps.length - STEP_SLOTS;
    cases.push({
      title,
      description,
      preconditions,
      priority,
      tags,
      steps: steps.slice(0, STEP_SLOTS),
    });
  }
  return cases;
}

function parseCsvCases(raw, stats) {
  const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
  const header = parseCsvLine(lines[0]);
  const col = name => header.indexOf(name);
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
    const title = fields[col('title')]?.trim() ?? '';
    if (!title) continue;
    let description = col('description') >= 0 ? fields[col('description')]?.trim() ?? '' : '';
    if (!description) description = title;
    const priority = normalizePriority(col('priority') >= 0 ? fields[col('priority')] : '', stats);
    const preconditions = col('preconditions') >= 0 ? fields[col('preconditions')]?.trim() ?? '' : '';
    const tags = normalizeTags(tagCols.map(({ i }) => fields[i]?.trim() ?? '').filter(Boolean));
    const steps = [];
    for (const si of stepIndices) {
      const a = col(`steps/step/${si}/action`);
      const e = col(`steps/step/${si}/expected_result`);
      const action = a >= 0 ? fields[a]?.trim() ?? '' : '';
      const expected_result = e >= 0 ? fields[e]?.trim() ?? '' : '';
      if (action && expected_result) steps.push({ action, expected_result });
    }
    if (!steps.length) continue;
    if (steps.length > STEP_SLOTS) stats.stepsTruncated += steps.length - STEP_SLOTS;
    cases.push({
      title,
      description,
      preconditions,
      priority,
      tags,
      steps: steps.slice(0, STEP_SLOTS),
    });
  }
  return cases;
}

const inputPath = resolve(process.cwd(), INPUT);
const raw = readFileSync(inputPath, 'utf8');
const stats = {
  casesProcessed: 0,
  criticalToHigh: 0,
  stepsTruncated: 0,
  tagsTruncated: 0,
  outputFilename: OUTPUT,
};

const cases = raw.trim().startsWith('<')
  ? parseXmlCases(raw, stats)
  : parseCsvCases(raw, stats);

if (!cases.length) {
  console.error('Nenhum caso encontrado.');
  process.exit(1);
}

stats.casesProcessed = cases.length;
const csv = `\uFEFF${HEADER}\r\n${cases.map(buildRow).join('\r\n')}\r\n`;
const outPath = resolve(process.cwd(), OUTPUT);
writeFileSync(outPath, csv, 'utf8');

console.log(`Casos processados: ${stats.casesProcessed}`);
console.log(`Prioridades "critical" → "high": ${stats.criticalToHigh}`);
if (stats.stepsTruncated) console.log(`Passos omitidos: ${stats.stepsTruncated}`);
console.log(`Arquivo: ${outPath}`);
console.log('Importe no Qase com Source: Qase.io → CSV');
