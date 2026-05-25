import type { QaseCase, QaseStep } from '@/types/casos-teste';

const ALLOWED_PRIORITIES = new Set(['low', 'medium', 'high']);
const MAX_STEPS_PER_CASE = 7;
const COL_COUNT = 25;

/** CSV oficial Qase.io v2 — não alterar ordem nem nomes das colunas. */
export const QASE_CSV_HEADER =
  'v2.id,title,description,preconditions,postconditions,tags,priority,severity,type,behavior,automation,status,is_flaky,layer,steps_type,steps_actions,steps_result,steps_data,milestone_id,milestone,suite_id,suite_parent_id,suite,suite_without_cases,parameters';

/** Formato legado (23 colunas) — apenas leitura em "Corrigir CSV/XML". */
const LEGACY_CSV_HEADER =
  'title,description,preconditions,priority,tags/tag/0,tags/tag/1,tags/tag/2,tags/tag/3,steps/step/0/action,steps/step/0/expected_result,steps/step/1/action,steps/step/1/expected_result,steps/step/2/action,steps/step/2/expected_result,steps/step/3/action,steps/step/3/expected_result,steps/step/4/action,steps/step/4/expected_result,steps/step/5/action,steps/step/5/expected_result,steps/step/6/action,steps/step/6/expected_result,tags/tag/4';

const COL = {
  title: 1,
  description: 2,
  preconditions: 3,
  tags: 5,
  priority: 6,
  stepsType: 14,
  stepsActions: 15,
  stepsResult: 16,
  suiteId: 20,
  suiteParentId: 21,
  suite: 22,
  suiteWithoutCases: 23,
} as const;

export const QASE_CSV_FILENAME = 'casos-teste-qase-import.csv';

export const QASE_CSV_IMPORT_HINT =
  'No Qase: ⋯ → Import Data → Source: Qase.io (v2, não use "Qase.io CSV [deprecated]"). O CSV já inclui suites e subsuites — não selecione uma suite destino única no assistente.';

export type QaseCsvExportStats = {
  casesProcessed: number;
  criticalToHigh: number;
  stepsTruncated: number;
  tagsTruncated: number;
  suiteRows: number;
  subsuiteRows: number;
  outputFilename: string;
};

export type QaseCsvBuildResult = {
  csv: string;
  stats: QaseCsvExportStats;
};

function emptyStats(filename = QASE_CSV_FILENAME): QaseCsvExportStats {
  return {
    casesProcessed: 0,
    criticalToHigh: 0,
    stepsTruncated: 0,
    tagsTruncated: 0,
    suiteRows: 0,
    subsuiteRows: 0,
    outputFilename: filename,
  };
}

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function emptyRow(): string[] {
  return new Array(COL_COUNT).fill('');
}

function normalizePriority(
  priority: string | undefined,
  stats: QaseCsvExportStats,
): 'low' | 'medium' | 'high' {
  const raw = priority?.trim().toLowerCase() ?? '';
  if (raw === 'critical') {
    stats.criticalToHigh += 1;
    return 'high';
  }
  if (ALLOWED_PRIORITIES.has(raw)) return raw as 'low' | 'medium' | 'high';
  return 'medium';
}

function normalizeTags(tags: string[] | undefined, suite?: string, subsuite?: string): string {
  const reserved = new Set(
    [suite, subsuite]
      .filter(Boolean)
      .map(t =>
        t!
          .trim()
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9_-]/g, ''),
      ),
  );
  const out = (tags ?? [])
    .map(t =>
      t
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9_-]/g, ''),
    )
    .filter(t => t && !reserved.has(t));
  return out.join(',');
}

function formatClassicSteps(steps: QaseStep[], field: 'action' | 'expected_result'): string {
  return steps
    .map((s, i) => `${i + 1}. ${field === 'action' ? s.action : s.expected_result}`)
    .join('\n');
}

function sanitizeCaseForQase(c: QaseCase, stats: QaseCsvExportStats): QaseCase {
  const priority = normalizePriority(c.priority, stats);
  const description = c.description?.trim() ? c.description.trim() : c.title.trim();
  let tags = c.tags;
  let steps = c.steps
    .filter(s => s.action?.trim() && s.expected_result?.trim())
    .map(
      (s): QaseStep => ({
        action: s.action.trim(),
        expected_result: s.expected_result.trim(),
      }),
    );

  if (steps.length > MAX_STEPS_PER_CASE) {
    stats.stepsTruncated += steps.length - MAX_STEPS_PER_CASE;
    steps = steps.slice(0, MAX_STEPS_PER_CASE);
  }
  if (tags && tags.length > 10) {
    stats.tagsTruncated += tags.length - 10;
    tags = tags.slice(0, 10);
  }

  return {
    title: c.title.trim(),
    description,
    preconditions: c.preconditions?.trim() || undefined,
    priority,
    suite: c.suite?.trim() || 'Geral',
    subsuite: c.subsuite?.trim() || undefined,
    tags,
    steps,
  };
}

function compareForExport(a: QaseCase, b: QaseCase): number {
  const sa = (a.suite ?? '').localeCompare(b.suite ?? '', 'pt-BR');
  if (sa !== 0) return sa;
  const sb = (a.subsuite ?? '').localeCompare(b.subsuite ?? '', 'pt-BR');
  if (sb !== 0) return sb;
  return a.title.localeCompare(b.title, 'pt-BR');
}

function buildSuiteRow(suiteId: number, suiteName: string, parentId?: number): string[] {
  const row = emptyRow();
  row[COL.suiteId] = String(suiteId);
  row[COL.suiteParentId] = parentId ? String(parentId) : '';
  row[COL.suite] = suiteName;
  row[COL.suiteWithoutCases] = '1';
  return row;
}

function buildCaseRowV2(
  c: QaseCase,
  suiteId: number,
  suiteName: string,
  suiteParentId: number | undefined,
): string[] {
  const row = emptyRow();
  row[COL.title] = c.title;
  row[COL.description] = c.description ?? '';
  row[COL.preconditions] = c.preconditions ?? '';
  row[COL.tags] = normalizeTags(c.tags, c.suite, c.subsuite);
  row[COL.priority] = c.priority ?? 'medium';
  row[COL.stepsType] = 'classic';
  row[COL.stepsActions] = formatClassicSteps(c.steps, 'action');
  row[COL.stepsResult] = formatClassicSteps(c.steps, 'expected_result');
  row[COL.suiteId] = String(suiteId);
  row[COL.suiteParentId] = suiteParentId ? String(suiteParentId) : '';
  row[COL.suite] = suiteName;
  return row;
}

type SuiteGroup = {
  suiteName: string;
  directCases: QaseCase[];
  subsuites: Map<string, QaseCase[]>;
};

function buildSuiteGroups(cases: QaseCase[]): SuiteGroup[] {
  const map = new Map<string, SuiteGroup>();

  for (const c of cases) {
    const suiteName = c.suite?.trim() || 'Geral';
    let group = map.get(suiteName);
    if (!group) {
      group = { suiteName, directCases: [], subsuites: new Map() };
      map.set(suiteName, group);
    }
    const sub = c.subsuite?.trim() ?? '';
    if (sub) {
      const list = group.subsuites.get(sub) ?? [];
      list.push(c);
      group.subsuites.set(sub, list);
    } else {
      group.directCases.push(c);
    }
  }

  return [...map.values()].sort((a, b) => a.suiteName.localeCompare(b.suiteName, 'pt-BR'));
}

function rowToCsv(row: string[]): string {
  return row.map(escapeCsvField).join(',');
}

function buildHierarchyRows(cases: QaseCase[], stats: QaseCsvExportStats): string[][] {
  const rows: string[][] = [];
  let nextId = 1;
  const groups = buildSuiteGroups(cases);

  for (const group of groups) {
    const hasSubs = group.subsuites.size > 0;

    if (hasSubs) {
      const parentId = nextId++;
      rows.push(buildSuiteRow(parentId, group.suiteName));
      stats.suiteRows += 1;

      for (const [subName, subCases] of [...group.subsuites.entries()].sort((a, b) =>
        a[0].localeCompare(b[0], 'pt-BR'),
      )) {
        const subId = nextId++;
        rows.push(buildSuiteRow(subId, subName, parentId));
        stats.subsuiteRows += 1;
        for (const c of subCases.sort(compareForExport)) {
          rows.push(buildCaseRowV2(c, subId, subName, parentId));
        }
      }

      for (const c of group.directCases.sort(compareForExport)) {
        rows.push(buildCaseRowV2(c, parentId, group.suiteName, undefined));
      }
    } else {
      const suiteId = nextId++;
      rows.push(buildSuiteRow(suiteId, group.suiteName));
      stats.suiteRows += 1;
      for (const c of group.directCases.sort(compareForExport)) {
        rows.push(buildCaseRowV2(c, suiteId, group.suiteName, undefined));
      }
    }
  }

  return rows;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

/** Interpreta o CSV inteiro, respeitando campos entre aspas com quebras de linha. */
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

function parseClassicStepsField(text: string): QaseStep[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const steps: QaseStep[] = [];
  for (const line of lines) {
    const actionMatch = line.match(/^\d+\.\s*(.+)$/);
    if (!actionMatch) continue;
    steps.push({ action: actionMatch[1], expected_result: '' });
  }
  return steps;
}

function mergeStepsActionsAndResults(actionsText: string, resultsText: string): QaseStep[] {
  const actionLines = actionsText.split(/\r?\n/).filter(l => l.trim());
  const resultLines = resultsText.split(/\r?\n/).filter(l => l.trim());
  const steps: QaseStep[] = [];
  const count = Math.max(actionLines.length, resultLines.length);
  for (let i = 0; i < count; i++) {
    const action = actionLines[i]?.replace(/^\d+\.\s*/, '').trim() ?? '';
    const expected_result = resultLines[i]?.replace(/^\d+\.\s*/, '').trim() ?? '';
    if (action && expected_result) steps.push({ action, expected_result });
  }
  return steps;
}

function assertV2CsvStructure(csv: string): void {
  const records = parseCsvRecords(csv);
  const headerCols = parseCsvLine(QASE_CSV_HEADER);
  const expectedCols = headerCols.length;

  if (records.length < 2) {
    throw new Error('CSV sem cabeçalho ou linhas de dados.');
  }

  const header = records[0];
  if (
    header.length !== expectedCols ||
    headerCols.some((name, i) => header[i] !== name)
  ) {
    throw new Error('Cabeçalho CSV diverge do padrão Qase.io v2.');
  }

  for (let i = 1; i < records.length; i++) {
    const cols = records[i];
    if (cols.length !== expectedCols) {
      throw new Error(`Linha ${i + 1} com ${cols.length} colunas (esperado ${expectedCols}).`);
    }
    const isSuite = cols[COL.suiteWithoutCases] === '1';
    if (!isSuite && !cols[COL.title]?.trim()) {
      throw new Error(`Linha ${i + 1} sem título (caso de teste).`);
    }
  }
}

export function formatQaseCsvExportSummary(stats: QaseCsvExportStats): string {
  const lines = [
    `Casos processados: ${stats.casesProcessed}`,
    `Suites no CSV: ${stats.suiteRows}`,
    `Subsuites no CSV: ${stats.subsuiteRows}`,
    `Prioridades "critical" → "high": ${stats.criticalToHigh}`,
  ];
  if (stats.stepsTruncated > 0) {
    lines.push(`Passos omitidos (> ${MAX_STEPS_PER_CASE} por caso): ${stats.stepsTruncated}`);
  }
  if (stats.tagsTruncated > 0) {
    lines.push(`Tags extras omitidas: ${stats.tagsTruncated}`);
  }
  lines.push(`Arquivo: ${stats.outputFilename}`, '', QASE_CSV_IMPORT_HINT);
  return lines.join('\n');
}

export function buildQaseImportCsv(
  cases: QaseCase[],
  filename = QASE_CSV_FILENAME,
): QaseCsvBuildResult {
  const stats = emptyStats(filename);
  const sanitized = cases.map(c => sanitizeCaseForQase(c, stats)).sort(compareForExport);

  if (sanitized.length === 0) {
    throw new Error('Nenhum caso de teste para exportar.');
  }

  for (const c of sanitized) {
    if (!c.steps.length) {
      throw new Error(`Caso "${c.title}" sem passos válidos.`);
    }
  }

  stats.casesProcessed = sanitized.length;
  const hierarchyRows = buildHierarchyRows(sanitized, stats);
  const csvRows = hierarchyRows.map(rowToCsv);
  const csv = `\uFEFF${QASE_CSV_HEADER}\r\n${csvRows.join('\r\n')}\r\n`;

  assertV2CsvStructure(csv);
  return { csv, stats };
}

function slugToTitle(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function parseCasesFromLegacyCsv(csvInput: string, stats: QaseCsvExportStats): QaseCase[] {
  const lines = csvInput.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error('CSV sem cabeçalho ou linhas de dados.');

  const header = parseCsvLine(lines[0]);
  const col = (name: string) => header.indexOf(name);
  const titleIdx = col('title');
  if (titleIdx < 0) throw new Error('CSV sem coluna "title".');

  const tagCols = header
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => /^tags\/tag\/\d+$/.test(h))
    .sort((a, b) => Number(a.h.split('/').pop()) - Number(b.h.split('/').pop()));

  const stepIndices = [
    ...new Set(
      header
        .map(h => h.match(/^steps\/step\/(\d+)\/action$/))
        .filter(Boolean)
        .map(m => Number(m![1])),
    ),
  ].sort((a, b) => a - b);

  const cases: QaseCase[] = [];

  for (let li = 1; li < lines.length; li++) {
    const fields = parseCsvLine(lines[li]);
    const title = fields[titleIdx]?.trim() ?? '';
    if (!title) continue;

    let description = col('description') >= 0 ? fields[col('description')]?.trim() ?? '' : '';
    if (!description) description = title;

    const priority = normalizePriority(
      col('priority') >= 0 ? fields[col('priority')] : undefined,
      stats,
    );
    const preconditions = col('preconditions') >= 0 ? fields[col('preconditions')]?.trim() : '';
    const tagSlugs = tagCols.map(({ i }) => fields[i]?.trim() ?? '').filter(Boolean);
    const suite = tagSlugs[0] ? slugToTitle(tagSlugs[0]) : undefined;
    const subsuite = tagSlugs[1] ? slugToTitle(tagSlugs[1]) : undefined;
    const tags = tagSlugs.slice(2).length ? tagSlugs.slice(2) : undefined;

    const steps: QaseStep[] = [];
    for (const si of stepIndices) {
      const aIdx = col(`steps/step/${si}/action`);
      const eIdx = col(`steps/step/${si}/expected_result`);
      const action = aIdx >= 0 ? fields[aIdx]?.trim() ?? '' : '';
      const expected_result = eIdx >= 0 ? fields[eIdx]?.trim() ?? '' : '';
      if (action && expected_result) steps.push({ action, expected_result });
    }

    if (steps.length === 0) throw new Error(`Caso "${title}" sem passos válidos no CSV.`);

    cases.push({
      title,
      description,
      preconditions: preconditions || undefined,
      priority,
      suite,
      subsuite,
      tags,
      steps,
    });
  }

  if (cases.length === 0) throw new Error('Nenhum caso encontrado no CSV.');
  stats.casesProcessed = cases.length;
  return cases;
}

function parseCasesFromV2Csv(csvInput: string, stats: QaseCsvExportStats): QaseCase[] {
  const records = parseCsvRecords(csvInput);
  if (records.length < 2) throw new Error('CSV sem cabeçalho ou linhas de dados.');

  const cases: QaseCase[] = [];

  for (let li = 1; li < records.length; li++) {
    const fields = records[li];
    if (fields[COL.suiteWithoutCases] === '1') continue;

    const title = fields[COL.title]?.trim() ?? '';
    if (!title) continue;

    let description = fields[COL.description]?.trim() ?? '';
    if (!description) description = title;

    const priority = normalizePriority(fields[COL.priority], stats);
    const preconditions = fields[COL.preconditions]?.trim() || undefined;
    const suiteName = fields[COL.suite]?.trim() || 'Geral';

    const actions = fields[COL.stepsActions]?.trim() ?? '';
    const results = fields[COL.stepsResult]?.trim() ?? '';
    let steps = mergeStepsActionsAndResults(actions, results);
    if (!steps.length && actions) {
      steps = parseClassicStepsField(actions).filter(s => s.action);
    }
    if (steps.length === 0) throw new Error(`Caso "${title}" sem passos válidos no CSV v2.`);

    const tagList = fields[COL.tags]
      ?.split(',')
      .map(t => t.trim())
      .filter(Boolean);

    cases.push({
      title,
      description,
      preconditions,
      priority,
      suite: suiteName,
      tags: tagList?.length ? tagList : undefined,
      steps,
    });
  }

  if (cases.length === 0) throw new Error('Nenhum caso de teste encontrado no CSV v2.');
  stats.casesProcessed = cases.length;
  return cases;
}

function parseCasesFromCsv(csvInput: string, stats: QaseCsvExportStats): QaseCase[] {
  const firstLine = csvInput.replace(/^\uFEFF/, '').split(/\r?\n/)[0]?.trim() ?? '';
  if (firstLine.startsWith('v2.id') || firstLine.includes('suite_without_cases')) {
    return parseCasesFromV2Csv(csvInput, stats);
  }
  if (firstLine === LEGACY_CSV_HEADER || firstLine.includes('tags/tag/0')) {
    return parseCasesFromLegacyCsv(csvInput, stats);
  }
  throw new Error('Formato CSV não reconhecido (esperado Qase.io v2 ou legado).');
}

function textContent(el: Element | null | undefined): string {
  return el?.textContent?.trim() ?? '';
}

function parseCasesFromXmlDocument(doc: Document, stats: QaseCsvExportStats): QaseCase[] {
  const caseNodes = Array.from(doc.querySelectorAll('platform > project > cases > case'));
  if (caseNodes.length === 0) {
    throw new Error('Nenhum <case> encontrado no XML.');
  }

  const cases: QaseCase[] = [];

  for (const caseEl of caseNodes) {
    const title = textContent(caseEl.querySelector(':scope > title'));
    if (!title) throw new Error('Caso sem <title> no XML de entrada.');

    let description = textContent(caseEl.querySelector(':scope > description'));
    if (!description) description = title;

    const priority = normalizePriority(
      textContent(caseEl.querySelector(':scope > priority')) || undefined,
      stats,
    );

    const preconditions = textContent(caseEl.querySelector(':scope > preconditions')) || undefined;
    const tagSlugs = Array.from(caseEl.querySelectorAll(':scope > tags > tag'))
      .map(t => textContent(t))
      .filter(Boolean);
    const suite = tagSlugs[0] ? slugToTitle(tagSlugs[0]) : undefined;
    const subsuite = tagSlugs[1] ? slugToTitle(tagSlugs[1]) : undefined;
    const tags = tagSlugs.slice(2).length ? tagSlugs.slice(2) : undefined;

    const steps: QaseStep[] = [];
    for (const stepEl of caseEl.querySelectorAll(':scope > steps > step')) {
      const action = textContent(stepEl.querySelector('action'));
      const expected_result = textContent(stepEl.querySelector('expected_result'));
      if (action && expected_result) steps.push({ action, expected_result });
    }

    if (steps.length === 0) {
      throw new Error(`Caso "${title}" sem passos válidos em <steps>.`);
    }

    cases.push({
      title,
      description,
      preconditions,
      priority,
      suite,
      subsuite,
      tags,
      steps,
    });
  }

  stats.casesProcessed = cases.length;
  return cases;
}

export function fixQaseImportToCsv(
  input: string,
  filename = QASE_CSV_FILENAME,
): QaseCsvBuildResult {
  const trimmed = input.trim();
  const stats = emptyStats(filename);

  let cases: QaseCase[];
  if (trimmed.startsWith('<')) {
    const doc = new DOMParser().parseFromString(trimmed, 'application/xml');
    const err = doc.querySelector('parsererror');
    if (err) {
      throw new Error(err.textContent?.trim() || 'XML de entrada malformado.');
    }
    cases = parseCasesFromXmlDocument(doc, stats);
  } else {
    cases = parseCasesFromCsv(trimmed, stats);
  }

  return buildQaseImportCsv(cases, filename);
}

function triggerDownload(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadQaseCsv(
  cases: QaseCase[],
  filename = QASE_CSV_FILENAME,
): QaseCsvExportStats {
  const { csv, stats } = buildQaseImportCsv(cases, filename);
  triggerDownload(csv, filename);
  return stats;
}

export function downloadFixedQaseCsv(
  fileInput: string,
  filename = QASE_CSV_FILENAME,
): QaseCsvExportStats {
  const { csv, stats } = fixQaseImportToCsv(fileInput, filename);
  triggerDownload(csv, filename);
  return stats;
}

/** @deprecated Use QASE_CSV_HEADER — mantido para compatibilidade. */
export const buildQaseCsvHeader = () => QASE_CSV_HEADER.split(',');
