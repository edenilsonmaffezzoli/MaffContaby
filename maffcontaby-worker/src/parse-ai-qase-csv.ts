import type { QaseCase, QaseStep } from './types/gerar-caso-teste';

export const AI_QASE_CSV_HEADER =
  'Suite,Subsuite,Title,Description,Preconditions,Steps,Expected Result,Priority,Tags';

const MAX_STEPS = 7;
const ALLOWED_PRIORITIES = new Set(['low', 'medium', 'high']);

function parseCsvRecords(csv: string, delimiter = ','): string[][] {
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
    } else if (ch === delimiter) {
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
  let s = raw.replace(/^\uFEFF/, '').trim();
  s = s.replace(/```(?:csv|text|plain|xml)?\s*/gi, '').replace(/```/g, '');
  const headerMatch = s.match(/Suite\s*[,;]\s*Subsuite\s*[,;]\s*Title/i);
  if (headerMatch?.index != null && headerMatch.index > 0) {
    s = s.slice(headerMatch.index).trim();
  }
  return s;
}

function detectCsvDelimiter(csv: string): ',' | ';' {
  const firstLine = csv.split(/\r?\n/, 1)[0] ?? '';
  if (/Suite\s*;\s*Subsuite/i.test(firstLine)) return ';';
  return ',';
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
    const resultMatch = rest.match(/(?:Resultado esperado|Expected result|Expected Result):\s*(.+)/is);
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
  const delimiter = detectCsvDelimiter(csv);
  const records = parseCsvRecords(csv, delimiter);
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

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

function xmlTag(block: string, tag: string): string {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i');
  const m = block.match(re);
  return m ? decodeXml(m[1]) : '';
}

function xmlAttr(openTag: string, name: string): string {
  const m = openTag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i'));
  return m ? decodeXml(m[1]) : '';
}

/** Grok às vezes devolve o XML antigo do Qase em vez do CSV. */
export function parseAiQaseXml(raw: string): ParseAiQaseCsvResult {
  const start = raw.search(/<testsuites[\s>]/i);
  if (start < 0) throw new Error('XML Qase não encontrado');
  const xml = raw.slice(start);
  const cases: QaseCase[] = [];
  let rawCount = 0;

  const suiteBlocks = [...xml.matchAll(/<testsuite\b([^>]*)>([\s\S]*?)<\/testsuite>/gi)];
  const blocks =
    suiteBlocks.length > 0
      ? suiteBlocks.map(m => ({ suite: xmlAttr(m[1], 'name') || 'Geral', body: m[2] }))
      : [{ suite: 'Geral', body: xml }];

  for (const { suite, body } of blocks) {
    const caseBlocks = [...body.matchAll(/<testcase\b([^>]*)>([\s\S]*?)<\/testcase>/gi)];
    for (const cm of caseBlocks) {
      const title = xmlAttr(cm[1], 'name') || xmlTag(cm[2], 'title');
      if (!title.trim()) continue;
      rawCount++;
      const stepBlocks = [...cm[2].matchAll(/<step\b[^>]*>([\s\S]*?)<\/step>/gi)];
      const steps = stepBlocks
        .map(sm => ({
          action: xmlTag(sm[1], 'actions') || xmlTag(sm[1], 'action'),
          expected_result: xmlTag(sm[1], 'expectedresults') || xmlTag(sm[1], 'expected_result') || xmlTag(sm[1], 'expectedresult'),
        }))
        .filter(s => s.action && s.expected_result)
        .slice(0, MAX_STEPS);
      if (!steps.length) continue;
      cases.push({
        suite: suite.slice(0, 200),
        subsuite: (xmlTag(cm[2], 'subsuite') || suite).slice(0, 200),
        title: title.trim(),
        description: xmlTag(cm[2], 'description') || title.trim(),
        preconditions: xmlTag(cm[2], 'preconditions') || undefined,
        steps,
      });
    }
  }

  if (!cases.length) throw new Error('Nenhum caso válido no XML da IA');
  return { cases, rawCount, dropped: rawCount - cases.length };
}

export function looksLikeParsableCases(text: string): boolean {
  const t = text.trim();
  if (/Suite\s*[,;]\s*Subsuite\s*[,;]\s*Title/i.test(t)) return true;
  if (/<testsuites[\s>]/i.test(t) && /<testcase\b/i.test(t)) return true;
  if (/"cases"\s*:/.test(t) && /"title"\s*:/.test(t)) return true;
  return false;
}
