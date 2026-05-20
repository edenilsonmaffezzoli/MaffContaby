import type { QaseCase, QaseStep } from '@/types/casos-teste';

const ALLOWED_PRIORITIES = new Set(['low', 'medium', 'high']);

export const QASE_XML_FILENAME = 'casos-teste-qase-corrigido.xml';

export type QaseXmlFixStats = {
  casesProcessed: number;
  severityRemoved: number;
  positionRemoved: number;
  criticalToHigh: number;
  outputFilename: string;
};

export type QaseXmlBuildResult = {
  xml: string;
  stats: QaseXmlFixStats;
};

function emptyStats(filename = QASE_XML_FILENAME): QaseXmlFixStats {
  return {
    casesProcessed: 0,
    severityRemoved: 0,
    positionRemoved: 0,
    criticalToHigh: 0,
    outputFilename: filename,
  };
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function el(name: string, value: string) {
  return `<${name}>${escapeXml(value)}</${name}>`;
}

function normalizePriority(
  priority: string | undefined,
  stats: QaseXmlFixStats,
): 'low' | 'medium' | 'high' {
  const raw = priority?.trim().toLowerCase() ?? '';
  if (raw === 'critical') {
    stats.criticalToHigh += 1;
    return 'high';
  }
  if (ALLOWED_PRIORITIES.has(raw)) return raw as 'low' | 'medium' | 'high';
  return 'medium';
}

function sanitizeCaseForQase(c: QaseCase, stats: QaseXmlFixStats): QaseCase {
  if (c.severity?.trim()) stats.severityRemoved += 1;
  stats.positionRemoved += c.steps.length;

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

function buildTagsXml(tags: string[] | undefined): string {
  if (!tags?.length) return '';
  const inner = tags.map(t => `        <tag>${escapeXml(t)}</tag>`).join('\n');
  return `<tags>\n${inner}\n      </tags>`;
}

function buildStepsXml(steps: QaseStep[]): string {
  const inner = steps
    .map(
      s =>
        `        <step>\n          ${el('action', s.action)}\n          ${el('expected_result', s.expected_result)}\n        </step>`,
    )
    .join('\n');
  return `<steps>\n${inner}\n      </steps>`;
}

function buildCaseXml(c: QaseCase): string {
  const pre = c.preconditions?.trim()
    ? `\n      ${el('preconditions', c.preconditions)}`
    : '';
  const tags = buildTagsXml(c.tags);
  const tagsBlock = tags ? `\n      ${tags}` : '';

  return `<case>
      ${el('title', c.title)}
      ${el('description', c.description!)}
      ${pre}
      ${el('priority', c.priority!)}
${tagsBlock}
      ${buildStepsXml(c.steps)}
    </case>`;
}

export function assertWellFormedXml(xml: string): void {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const err = doc.querySelector('parsererror');
  if (err) {
    throw new Error(err.textContent?.trim() || 'XML malformado; não foi possível validar.');
  }
  if (!doc.querySelector('platform > project > cases > case')) {
    throw new Error('XML sem estrutura platform > project > cases > case.');
  }
}

export function formatQaseXmlFixSummary(stats: QaseXmlFixStats): string {
  return [
    `Casos processados: ${stats.casesProcessed}`,
    `<severity> removidos: ${stats.severityRemoved}`,
    `<position> removidos: ${stats.positionRemoved}`,
    `Prioridades "critical" → "high": ${stats.criticalToHigh}`,
    `Arquivo: ${stats.outputFilename}`,
  ].join('\n');
}

/**
 * Gera XML no formato Qase (import source: Qase) compatível com importação.
 */
export function buildQaseImportXml(
  cases: QaseCase[],
  filename = QASE_XML_FILENAME,
): QaseXmlBuildResult {
  const stats = emptyStats(filename);
  const sanitized = cases.map(c => sanitizeCaseForQase(c, stats));
  stats.casesProcessed = sanitized.length;

  if (sanitized.length === 0) {
    throw new Error('Nenhum caso de teste para exportar.');
  }

  const xml = buildXmlFromSanitizedCases(sanitized, stats);
  assertWellFormedXml(xml);
  return { xml, stats };
}

function textContent(el: Element | null | undefined): string {
  return el?.textContent?.trim() ?? '';
}

function parseCasesFromXmlDocument(doc: Document, stats: QaseXmlFixStats): QaseCase[] {
  const caseNodes = Array.from(doc.querySelectorAll('platform > project > cases > case'));
  if (caseNodes.length === 0) {
    throw new Error('Nenhum <case> encontrado no XML.');
  }

  const cases: QaseCase[] = [];

  for (const caseEl of caseNodes) {
    stats.severityRemoved += caseEl.querySelectorAll(':scope > severity').length;
    caseEl.querySelectorAll(':scope > severity').forEach(n => n.remove());

    const stepNodes = Array.from(caseEl.querySelectorAll(':scope > steps > step'));
    stats.positionRemoved += caseEl.querySelectorAll('position').length;
    caseEl.querySelectorAll('position').forEach(n => n.remove());
    caseEl.querySelectorAll('step > data').forEach(n => n.remove());

    const title = textContent(caseEl.querySelector(':scope > title'));
    if (!title) {
      throw new Error('Caso sem <title> no XML de entrada.');
    }

    let description = textContent(caseEl.querySelector(':scope > description'));
    if (!description) description = title;

    const priorityRaw = textContent(caseEl.querySelector(':scope > priority'));
    const priority = normalizePriority(priorityRaw || undefined, stats);

    const preconditions = textContent(caseEl.querySelector(':scope > preconditions')) || undefined;
    const tags = Array.from(caseEl.querySelectorAll(':scope > tags > tag'))
      .map(t => textContent(t))
      .filter(Boolean);

    const steps: QaseStep[] = [];
    for (const stepEl of stepNodes) {
      const action = textContent(stepEl.querySelector('action'));
      const expected_result = textContent(stepEl.querySelector('expected_result'));
      if (!action || !expected_result) continue;
      steps.push({ action, expected_result });
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

function buildXmlFromSanitizedCases(
  cases: QaseCase[],
  stats: QaseXmlFixStats,
): string {
  if (cases.length === 0) {
    throw new Error('Nenhum caso de teste para exportar.');
  }
  stats.casesProcessed = cases.length;
  const casesXml = cases.map(buildCaseXml).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<platform>
  <project>
    <cases>
      ${casesXml}
    </cases>
  </project>
</platform>`;
}

/**
 * Corrige XML já exportado (remove severity/position, normaliza priority) e regrava no formato Qase.
 */
export function fixQaseImportXml(
  xmlInput: string,
  filename = QASE_XML_FILENAME,
): QaseXmlBuildResult {
  const stats = emptyStats(filename);
  const doc = new DOMParser().parseFromString(xmlInput.trim(), 'application/xml');
  const err = doc.querySelector('parsererror');
  if (err) {
    throw new Error(err.textContent?.trim() || 'XML de entrada malformado.');
  }

  const cases = parseCasesFromXmlDocument(doc, stats);
  const xml = buildXmlFromSanitizedCases(cases, stats);
  assertWellFormedXml(xml);
  return { xml, stats };
}

function triggerDownload(xml: string, filename: string) {
  const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadQaseXml(
  cases: QaseCase[],
  filename = QASE_XML_FILENAME,
): QaseXmlFixStats {
  const { xml, stats } = buildQaseImportXml(cases, filename);
  triggerDownload(xml, filename);
  return stats;
}

export function downloadFixedQaseXml(
  xmlInput: string,
  filename = QASE_XML_FILENAME,
): QaseXmlFixStats {
  const { xml, stats } = fixQaseImportXml(xmlInput, filename);
  triggerDownload(xml, filename);
  return stats;
}
