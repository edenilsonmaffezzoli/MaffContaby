/**
 * Converte JSON de casos (gerar-caso-teste) para CSV Qase.io v2.
 * Uso: node scripts/export-qase-v2-from-json.mjs [entrada.json] [saida.csv]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const INPUT = process.argv[2] ?? 'output/casos-teste-fabiano-fernandes.json';
const OUTPUT = process.argv[3] ?? 'output/casos-teste-fabiano-fernandes-qase-v2.csv';

const QASE_CSV_HEADER =
  'v2.id,title,description,preconditions,postconditions,tags,priority,severity,type,behavior,automation,status,is_flaky,layer,steps_type,steps_actions,steps_result,steps_data,milestone_id,milestone,suite_id,suite_parent_id,suite,suite_without_cases,parameters';

const COL_COUNT = 25;
const MAX_STEPS = 7;
const ALLOWED = new Set(['low', 'medium', 'high']);

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
};

function escapeCsvField(value) {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function emptyRow() {
  return new Array(COL_COUNT).fill('');
}

function normalizePriority(priority, stats) {
  const raw = (priority ?? '').trim().toLowerCase();
  if (raw === 'critical') {
    stats.criticalToHigh += 1;
    return 'high';
  }
  if (ALLOWED.has(raw)) return raw;
  return 'medium';
}

function normalizeTags(tags, suite, subsuite) {
  const reserved = new Set(
    [suite, subsuite]
      .filter(Boolean)
      .map(t =>
        t
          .trim()
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9_-]/g, ''),
      ),
  );
  return (tags ?? [])
    .map(t =>
      t
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9_-]/g, ''),
    )
    .filter(t => t && !reserved.has(t))
    .join(',');
}

function formatClassicSteps(steps, field) {
  return steps
    .map((s, i) => `${i + 1}. ${field === 'action' ? s.action : s.expected_result}`)
    .join('\n');
}

function sanitizeCase(c, stats) {
  const priority = normalizePriority(c.priority, stats);
  const description = c.description?.trim() ? c.description.trim() : c.title.trim();
  let steps = (c.steps ?? [])
    .filter(s => s.action?.trim() && s.expected_result?.trim())
    .map(s => ({
      action: s.action.trim(),
      expected_result: s.expected_result.trim(),
    }));
  if (steps.length > MAX_STEPS) {
    stats.stepsTruncated += steps.length - MAX_STEPS;
    steps = steps.slice(0, MAX_STEPS);
  }
  let tags = c.tags;
  if (tags && tags.length > 10) {
    stats.tagsTruncated += tags.length - 10;
    tags = tags.slice(0, 10);
  }
  return {
    title: c.title.trim(),
    description,
    preconditions: c.preconditions?.trim() || '',
    priority,
    suite: c.suite?.trim() || 'Geral',
    subsuite: c.subsuite?.trim() || '',
    tags,
    steps,
  };
}

function compareForExport(a, b) {
  const sa = (a.suite ?? '').localeCompare(b.suite ?? '', 'pt-BR');
  if (sa !== 0) return sa;
  const sb = (a.subsuite ?? '').localeCompare(b.subsuite ?? '', 'pt-BR');
  if (sb !== 0) return sb;
  return a.title.localeCompare(b.title, 'pt-BR');
}

function buildSuiteRow(suiteId, suiteName, parentId) {
  const row = emptyRow();
  row[COL.suiteId] = String(suiteId);
  row[COL.suiteParentId] = parentId ? String(parentId) : '';
  row[COL.suite] = suiteName;
  row[COL.suiteWithoutCases] = '1';
  return row;
}

function buildCaseRowV2(c, suiteId, suiteName, suiteParentId) {
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

function buildSuiteGroups(cases) {
  const map = new Map();
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

function buildHierarchyRows(cases, stats) {
  const rows = [];
  let nextId = 1;
  for (const group of buildSuiteGroups(cases)) {
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

function rowToCsv(row) {
  return row.map(escapeCsvField).join(',');
}

const inputPath = resolve(process.cwd(), INPUT);
const raw = JSON.parse(readFileSync(inputPath, 'utf8'));
const sourceCases = raw.cases ?? raw;
if (!Array.isArray(sourceCases) || !sourceCases.length) {
  console.error('JSON sem array "cases".');
  process.exit(1);
}

const stats = {
  casesProcessed: 0,
  criticalToHigh: 0,
  stepsTruncated: 0,
  tagsTruncated: 0,
  suiteRows: 0,
  subsuiteRows: 0,
};

const sanitized = sourceCases.map(c => sanitizeCase(c, stats)).sort(compareForExport);
for (const c of sanitized) {
  if (!c.steps.length) {
    console.error(`Caso sem passos: ${c.title}`);
    process.exit(1);
  }
}
stats.casesProcessed = sanitized.length;

const csv = `\uFEFF${QASE_CSV_HEADER}\r\n${buildHierarchyRows(sanitized, stats).map(rowToCsv).join('\r\n')}\r\n`;
const outPath = resolve(process.cwd(), OUTPUT);
writeFileSync(outPath, csv, 'utf8');

console.log(`Casos: ${stats.casesProcessed}`);
console.log(`Suites: ${stats.suiteRows}, Subsuites: ${stats.subsuiteRows}`);
console.log(`Arquivo: ${outPath}`);
console.log('Importe no Qase: ⋯ → Import Data → Source: Qase.io (v2)');
