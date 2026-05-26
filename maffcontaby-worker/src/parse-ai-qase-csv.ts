import type { QaseCase, QaseStep } from './types/gerar-caso-teste';

export const AI_QASE_CSV_HEADER =
  'Suite,Subsuite,Title,Description,Preconditions,Steps,Expected Result,Priority,Tags';

const MAX_STEPS = 7;
const ALLOWED_PRIORITIES = new Set(['low', 'medium', 'high']);

function parseCsvRecords(csv: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const s = csv.replace(/^\uFEFF/, '');

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some(c => c.length > 0)) records.push(row);
      row = [];
    } else {
      field += ch;
    }
  }

  row.push(field);
  if (row.some(c => c.length > 0)) records.push(row);

  return records;
}

function stripCsvFence(raw: string): string {
  let s = raw.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:csv)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }
  return s;
}

function normalizeHeaderCell(cell: string): string {
  return cell.trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseCombinedStepsField(text: string): QaseStep[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const steps: QaseStep[] = [];
  const blocks = trimmed.split(/(?=^\d+\.\s)/m).filter(b => b.trim());

  for (const block of blocks) {
    const lines = block
      .trim()
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean);
    if (!lines.length) continue;

    const actionMatch = lines[0].match(/^\d+\.\s*(.+)$/);
    if (!actionMatch) continue;

    const action = actionMatch[1].trim();
    const rest = lines.slice(1).join('\n');
    const resultMatch = rest.match(/Resultado esperado:\s*(.+)/is);
    const expected_result = resultMatch?.[1]?.trim() ?? '';
    if (action && expected_result) steps.push({ action, expected_result });
  }

  return steps.slice(0, MAX_STEPS);
}

function mergeStepsColumns(stepsText: string, expectedText: string): QaseStep[] {
  const fromCombined = parseCombinedStepsField(stepsText);
  if (fromCombined.length) return fromCombined;

  const actionLines = stepsText.split(/\r?\n/).filter(l => l.trim());
  const resultLines = expectedText.split(/\r?\n/).filter(l => l.trim());
  const steps: QaseStep[] = [];
  const count = Math.max(actionLines.length, resultLines.length);

  for (let i = 0; i < count; i++) {
    const action = actionLines[i]?.replace(/^\d+\.\s*/, '').trim() ?? '';
    const expected_result = resultLines[i]?.replace(/^\d+\.\s*/, '').trim() ?? '';
    if (action && expected_result) steps.push({ action, expected_result });
  }

  return steps.slice(0, MAX_STEPS);
}

function parseTagsField(raw: string | undefined): string[] | undefined {
  if (!raw?.trim()) return undefined;
  const parts = raw
    .split(/[;,]/)
    .map(t => t.trim())
    .filter(Boolean);
  if (!parts.length) return undefined;
  return parts.map(t =>
    t
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9_-]/g, ''),
  ).filter(Boolean);
}

function normalizePriority(raw: string | undefined): string | undefined {
  const p = raw?.trim().toLowerCase() ?? '';
  if (p === 'critical') return 'high';
  if (ALLOWED_PRIORITIES.has(p)) return p;
  return p ? 'medium' : undefined;
}

export type ParseAiQaseCsvResult = {
  cases: QaseCase[];
  rawCount: number;
  dropped: number;
};

/** Converte CSV simples (Suite,Subsuite,Title,…) retornado pela IA em casos estruturados. */
export function parseAiQaseCsv(raw: string): ParseAiQaseCsvResult {
  const csv = stripCsvFence(raw);
  const records = parseCsvRecords(csv);
  if (records.length < 2) {
    throw new Error('CSV da IA sem cabeçalho ou linhas de dados');
  }

  const header = records[0].map(normalizeHeaderCell);
  const expectedHeader = AI_QASE_CSV_HEADER.split(',').map(normalizeHeaderCell);
  const col = (name: string) => header.indexOf(normalizeHeaderCell(name));

  const hasSimpleHeader =
    expectedHeader.every((name, i) => header[i] === name) ||
    (col('suite') >= 0 && col('title') >= 0 && col('steps') >= 0);

  if (!hasSimpleHeader) {
    throw new Error('Cabeçalho CSV não reconhecido (esperado Suite,Subsuite,Title,…)');
  }

  const suiteIdx = col('suite');
  const subsuiteIdx = col('subsuite');
  const titleIdx = col('title');
  const descIdx = col('description');
  const preIdx = col('preconditions');
  const stepsIdx = col('steps');
  const expectedIdx = col('expected result');
  const priorityIdx = col('priority');
  const tagsIdx = col('tags');

  const cases: QaseCase[] = [];
  let rawCount = 0;

  for (let i = 1; i < records.length; i++) {
    const fields = records[i];
    const title = fields[titleIdx]?.trim() ?? '';
    if (!title) continue;
    rawCount++;

    const suite = (fields[suiteIdx]?.trim() || 'Geral').slice(0, 200);
    const subsuite = (fields[subsuiteIdx]?.trim() || suite).slice(0, 200);
    const description = fields[descIdx]?.trim() || title;
    const preconditions = fields[preIdx]?.trim() || undefined;
    const stepsText = fields[stepsIdx]?.trim() ?? '';
    const expectedCol = expectedIdx >= 0 ? fields[expectedIdx]?.trim() ?? '' : '';
    const steps = mergeStepsColumns(stepsText, expectedCol);
    if (!steps.length) continue;

    cases.push({
      suite,
      subsuite,
      title,
      description,
      preconditions,
      priority: normalizePriority(priorityIdx >= 0 ? fields[priorityIdx] : undefined),
      tags: parseTagsField(tagsIdx >= 0 ? fields[tagsIdx] : undefined),
      steps,
    });
  }

  if (!cases.length) {
    throw new Error('Nenhum caso válido no CSV da IA');
  }

  return { cases, rawCount, dropped: rawCount - cases.length };
}
