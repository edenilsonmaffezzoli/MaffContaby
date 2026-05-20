import type { QaseCase, QaseStep } from '@/types/casos-teste';

const ALLOWED_PRIORITIES = new Set(['low', 'medium', 'high']);

/** Colunas tags/tag/0..3 antes dos passos; tags/tag/4+ depois (padrão Qase CSV). */
const TAGS_BEFORE_STEPS = 4;

/** Mínimos do arquivo validado casos-teste-qase-corrigido.csv */
const MIN_STEP_SLOTS = 7;
const MIN_TAG_SLOTS = 5;

export const QASE_CSV_FILENAME = 'casos-teste-qase-corrigido.csv';

export type QaseCsvExportStats = {
  casesProcessed: number;
  criticalToHigh: number;
  maxStepSlots: number;
  maxTagSlots: number;
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
    maxStepSlots: MIN_STEP_SLOTS,
    maxTagSlots: MIN_TAG_SLOTS,
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

function sanitizeCaseForQase(c: QaseCase, stats: QaseCsvExportStats): QaseCase {
  const priority = normalizePriority(c.priority, stats);
  const description = c.description?.trim() ? c.description.trim() : c.title.trim();

  return {
    title: c.title.trim(),
    description,
    preconditions: c.preconditions?.trim() || undefined,
    priority,
    tags: c.tags?.length ? c.tags.map(t => t.trim()).filter(Boolean) : undefined,
    steps: c.steps.map(
      (s): QaseStep => ({
        action: s.action,
        expected_result: s.expected_result,
      }),
    ),
  };
}

function resolveDimensions(cases: QaseCase[]) {
  let maxSteps = MIN_STEP_SLOTS;
  let maxTags = MIN_TAG_SLOTS;
  for (const c of cases) {
    maxSteps = Math.max(maxSteps, c.steps.length);
    maxTags = Math.max(maxTags, c.tags?.length ?? 0);
  }
  return { maxSteps, maxTags };
}

/** Cabeçalho no padrão Qase: tags 0–3, passos, tags 4+. */
export function buildQaseCsvHeader(maxSteps: number, maxTags: number): string[] {
  const cols = ['title', 'description', 'preconditions', 'priority'];
  const tagsBefore = Math.min(TAGS_BEFORE_STEPS, maxTags);
  for (let i = 0; i < tagsBefore; i++) cols.push(`tags/tag/${i}`);
  for (let i = 0; i < maxSteps; i++) {
    cols.push(`steps/step/${i}/action`, `steps/step/${i}/expected_result`);
  }
  for (let i = TAGS_BEFORE_STEPS; i < maxTags; i++) {
    cols.push(`tags/tag/${i}`);
  }
  return cols;
}

function buildCaseRow(c: QaseCase, maxSteps: number, maxTags: number): string[] {
  const tags = c.tags ?? [];
  const values: string[] = [
    c.title,
    c.description ?? '',
    c.preconditions ?? '',
    c.priority ?? 'medium',
  ];

  const tagsBefore = Math.min(TAGS_BEFORE_STEPS, maxTags);
  for (let i = 0; i < tagsBefore; i++) values.push(tags[i] ?? '');

  for (let i = 0; i < maxSteps; i++) {
    const step = c.steps[i];
    values.push(step?.action ?? '', step?.expected_result ?? '');
  }

  for (let i = TAGS_BEFORE_STEPS; i < maxTags; i++) {
    values.push(tags[i] ?? '');
  }

  return values.map(escapeCsvField);
}

export function formatQaseCsvExportSummary(stats: QaseCsvExportStats): string {
  return [
    `Casos processados: ${stats.casesProcessed}`,
    `Prioridades "critical" → "high": ${stats.criticalToHigh}`,
    `Colunas de passos: ${stats.maxStepSlots}`,
    `Colunas de tags: ${stats.maxTagSlots}`,
    `Arquivo: ${stats.outputFilename}`,
  ].join('\n');
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

  const { maxSteps, maxTags } = resolveDimensions(sanitized);
  stats.maxStepSlots = maxSteps;
  stats.maxTagSlots = maxTags;
  stats.casesProcessed = sanitized.length;

  const header = buildQaseCsvHeader(maxSteps, maxTags);
  const rows = sanitized.map(c => buildCaseRow(c, maxSteps, maxTags));
  const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\n');

  return { csv, stats };
}

/** Parse simplificado de linha CSV (campos entre aspas ou separados por vírgula). */
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

function parseCasesFromCsv(csvInput: string, stats: QaseCsvExportStats): QaseCase[] {
  const lines = csvInput.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) {
    throw new Error('CSV sem cabeçalho ou linhas de dados.');
  }

  const header = parseCsvLine(lines[0]);
  const col = (name: string) => header.indexOf(name);

  const titleIdx = col('title');
  const descIdx = col('description');
  const preIdx = col('preconditions');
  const priIdx = col('priority');
  if (titleIdx < 0) throw new Error('CSV sem coluna "title".');

  const tagCols = header
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => /^tags\/tag\/\d+$/.test(h))
    .sort((a, b) => {
      const na = Number(a.h.split('/').pop());
      const nb = Number(b.h.split('/').pop());
      return na - nb;
    });

  const stepIndices = new Set<number>();
  for (const h of header) {
    const m = h.match(/^steps\/step\/(\d+)\/action$/);
    if (m) stepIndices.add(Number(m[1]));
  }
  const sortedSteps = [...stepIndices].sort((a, b) => a - b);

  const cases: QaseCase[] = [];

  for (let li = 1; li < lines.length; li++) {
    const fields = parseCsvLine(lines[li]);
    const title = fields[titleIdx]?.trim() ?? '';
    if (!title) continue;

    let description = descIdx >= 0 ? fields[descIdx]?.trim() ?? '' : '';
    if (!description) description = title;

    const preconditions = preIdx >= 0 ? fields[preIdx]?.trim() : '';
    const priority = normalizePriority(priIdx >= 0 ? fields[priIdx] : undefined, stats);

    const tags = tagCols
      .map(({ i }) => fields[i]?.trim() ?? '')
      .filter(Boolean);

    const steps: QaseStep[] = [];
    for (const si of sortedSteps) {
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
      tags: tags.length ? tags : undefined,
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
    const tags = Array.from(caseEl.querySelectorAll(':scope > tags > tag'))
      .map(t => textContent(t))
      .filter(Boolean);

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
      tags: tags.length ? tags : undefined,
      steps,
    });
  }

  stats.casesProcessed = cases.length;
  return cases;
}

/** Converte XML legado ou re-sanitiza CSV para o padrão Qase CSV. */
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
