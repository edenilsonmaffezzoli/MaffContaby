import type { QaseCase, QaseStep } from '@/types/casos-teste';

const ALLOWED_PRIORITIES = new Set(['low', 'medium', 'high']);

/** Padrão fixo do arquivo validado casos-teste-qase-corrigido.csv (23 colunas). */
const STEP_SLOTS = 7;
const TAG_SLOTS = 5;
const TAGS_BEFORE_STEPS = 4;

/** Cabeçalho exato — não alterar ordem nem nomes (requisito Qase). */
export const QASE_CSV_HEADER =
  'title,description,preconditions,priority,tags/tag/0,tags/tag/1,tags/tag/2,tags/tag/3,steps/step/0/action,steps/step/0/expected_result,steps/step/1/action,steps/step/1/expected_result,steps/step/2/action,steps/step/2/expected_result,steps/step/3/action,steps/step/3/expected_result,steps/step/4/action,steps/step/4/expected_result,steps/step/5/action,steps/step/5/expected_result,steps/step/6/action,steps/step/6/expected_result,tags/tag/4';

export const QASE_CSV_FILENAME = 'casos-teste-qase-corrigido.csv';

export const QASE_CSV_IMPORT_HINT =
  'No Qase: ⋯ → Import Data → Source: Qase.io → formato CSV (não use XML nem "Qase.io CSV [deprecated]").';

export type QaseCsvExportStats = {
  casesProcessed: number;
  criticalToHigh: number;
  stepsTruncated: number;
  tagsTruncated: number;
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
    outputFilename: filename,
  };
}

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
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

/** Tags no formato slug (sem espaços), como no CSV validado. */
function normalizeTags(tags: string[] | undefined): string[] | undefined {
  if (!tags?.length) return undefined;
  const out = tags
    .map(t =>
      t
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9_-]/g, ''),
    )
    .filter(Boolean);
  return out.length ? out : undefined;
}

function sanitizeCaseForQase(c: QaseCase, stats: QaseCsvExportStats): QaseCase {
  const priority = normalizePriority(c.priority, stats);
  const description = c.description?.trim() ? c.description.trim() : c.title.trim();
  let tags = normalizeTags(c.tags);
  let steps = c.steps
    .filter(s => s.action?.trim() && s.expected_result?.trim())
    .map(
      (s): QaseStep => ({
        action: s.action.trim(),
        expected_result: s.expected_result.trim(),
      }),
    );

  if (steps.length > STEP_SLOTS) {
    stats.stepsTruncated += steps.length - STEP_SLOTS;
    steps = steps.slice(0, STEP_SLOTS);
  }
  if (tags && tags.length > TAG_SLOTS) {
    stats.tagsTruncated += tags.length - TAG_SLOTS;
    tags = tags.slice(0, TAG_SLOTS);
  }

  return {
    title: c.title.trim(),
    description,
    preconditions: c.preconditions?.trim() || undefined,
    priority,
    tags,
    steps,
  };
}

function buildCaseRow(c: QaseCase): string[] {
  const tags = c.tags ?? [];
  const values: string[] = [
    c.title,
    c.description ?? '',
    c.preconditions ?? '',
    c.priority ?? 'medium',
  ];

  for (let i = 0; i < TAGS_BEFORE_STEPS; i++) values.push(tags[i] ?? '');

  for (let i = 0; i < STEP_SLOTS; i++) {
    const step = c.steps[i];
    values.push(step?.action ?? '', step?.expected_result ?? '');
  }

  values.push(tags[4] ?? '');

  return values.map(escapeCsvField);
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

function assertCsvStructure(csv: string): void {
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
  const expectedCols = parseCsvLine(QASE_CSV_HEADER).length;
  if (parseCsvLine(lines[0]).join(',') !== QASE_CSV_HEADER) {
    throw new Error('Cabeçalho CSV diverge do padrão Qase.');
  }
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length !== expectedCols) {
      throw new Error(
        `Linha ${i + 1} com ${cols.length} colunas (esperado ${expectedCols}).`,
      );
    }
    if (!cols[0]?.trim()) {
      throw new Error(`Linha ${i + 1} sem título.`);
    }
  }
}

export function formatQaseCsvExportSummary(stats: QaseCsvExportStats): string {
  const lines = [
    `Casos processados: ${stats.casesProcessed}`,
    `Prioridades "critical" → "high": ${stats.criticalToHigh}`,
  ];
  if (stats.stepsTruncated > 0) {
    lines.push(`Passos omitidos (> ${STEP_SLOTS} por caso): ${stats.stepsTruncated}`);
  }
  if (stats.tagsTruncated > 0) {
    lines.push(`Tags omitidas (> ${TAG_SLOTS} por caso): ${stats.tagsTruncated}`);
  }
  lines.push(`Arquivo: ${stats.outputFilename}`, '', QASE_CSV_IMPORT_HINT);
  return lines.join('\n');
}

export function buildQaseImportCsv(
  cases: QaseCase[],
  filename = QASE_CSV_FILENAME,
): QaseCsvBuildResult {
  const stats = emptyStats(filename);
  const sanitized = cases.map(c => sanitizeCaseForQase(c, stats));

  if (sanitized.length === 0) {
    throw new Error('Nenhum caso de teste para exportar.');
  }

  for (const c of sanitized) {
    if (!c.steps.length) {
      throw new Error(`Caso "${c.title}" sem passos válidos.`);
    }
  }

  stats.casesProcessed = sanitized.length;
  const rows = sanitized.map(c => buildCaseRow(c).join(','));
  const csv = `\uFEFF${QASE_CSV_HEADER}\r\n${rows.join('\r\n')}\r\n`;

  assertCsvStructure(csv);
  return { csv, stats };
}

function parseCasesFromCsv(csvInput: string, stats: QaseCsvExportStats): QaseCase[] {
  const lines = csvInput.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) {
    throw new Error('CSV sem cabeçalho ou linhas de dados.');
  }

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
    const preconditions =
      col('preconditions') >= 0 ? fields[col('preconditions')]?.trim() : '';

    const tags = normalizeTags(
      tagCols.map(({ i }) => fields[i]?.trim() ?? '').filter(Boolean),
    );

    const steps: QaseStep[] = [];
    for (const si of stepIndices) {
      const aIdx = col(`steps/step/${si}/action`);
      const eIdx = col(`steps/step/${si}/expected_result`);
      const action = aIdx >= 0 ? fields[aIdx]?.trim() ?? '' : '';
      const expected_result = eIdx >= 0 ? fields[eIdx]?.trim() ?? '' : '';
      if (action && expected_result) steps.push({ action, expected_result });
    }

    if (steps.length === 0) {
      throw new Error(`Caso "${title}" sem passos válidos no CSV.`);
    }

    cases.push({
      title,
      description,
      preconditions: preconditions || undefined,
      priority,
      tags,
      steps,
    });
  }

  if (cases.length === 0) throw new Error('Nenhum caso encontrado no CSV.');
  stats.casesProcessed = cases.length;
  return cases;
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
    const tags = normalizeTags(
      Array.from(caseEl.querySelectorAll(':scope > tags > tag'))
        .map(t => textContent(t))
        .filter(Boolean),
    );

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

// Compat: testes ou imports antigos
export const buildQaseCsvHeader = () => QASE_CSV_HEADER.split(',');
