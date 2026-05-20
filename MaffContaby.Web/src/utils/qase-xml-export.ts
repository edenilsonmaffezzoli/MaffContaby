import type { QaseCase } from '@/types/casos-teste';

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function el(name: string, value: string | undefined) {
  if (value == null || value.trim() === '') return '';
  return `<${name}>${escapeXml(value.trim())}</${name}>`;
}

function buildCaseXml(c: QaseCase) {
  const steps = c.steps
    .map((s, i) => {
      const data = s.data ? el('data', s.data) : '';
      return `<step>
            <position>${i + 1}</position>
            ${el('action', s.action)}
            ${el('expected_result', s.expected_result)}
            ${data}
          </step>`;
    })
    .join('\n          ');

  const tags =
    c.tags?.length ?
      `<tags>${c.tags.map(t => `<tag>${escapeXml(t)}</tag>`).join('')}</tags>`
    : '';

  return `<case>
        ${el('title', c.title)}
        ${el('description', c.description)}
        ${el('preconditions', c.preconditions)}
        ${el('priority', c.priority)}
        ${el('severity', c.severity)}
        ${tags}
        <steps>
          ${steps}
        </steps>
      </case>`;
}

/**
 * Gera XML no formato Qase (import source: Qase) para download.
 * Estrutura alinhada ao export nativo: platform > project > cases > case > steps > step.
 */
export function buildQaseImportXml(cases: QaseCase[]) {
  const casesXml = cases.map(buildCaseXml).join('\n      ');
  return `<?xml version="1.0" encoding="UTF-8"?>
<platform>
  <project>
    <cases>
      ${casesXml}
    </cases>
  </project>
</platform>`;
}

export function downloadQaseXml(cases: QaseCase[], filename = 'casos-teste-qase.xml') {
  const xml = buildQaseImportXml(cases);
  const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
