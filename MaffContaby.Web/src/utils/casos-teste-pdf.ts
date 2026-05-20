import { marked } from 'marked';

export function openCasosTestePdf(markdown: string, title = 'Casos de Teste') {
  const htmlBody = marked.parse(markdown, { async: false }) as string;
  const win = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700');
  if (!win) {
    alert('Permita pop-ups para gerar o PDF.');
    return;
  }

  win.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { margin: 18mm 16mm; }
    body.casos-teste-pdf {
      font-family: 'Segoe UI', system-ui, sans-serif;
      font-size: 11pt;
      line-height: 1.55;
      color: #1a1a1a;
      max-width: 210mm;
      margin: 0 auto;
      padding: 24px;
    }
    .casos-teste-pdf h1 { font-size: 20pt; color: #006666; border-bottom: 2px solid #006666; padding-bottom: 8px; }
    .casos-teste-pdf h2 { font-size: 14pt; margin-top: 1.4em; color: #003366; page-break-after: avoid; }
    .casos-teste-pdf h3 { font-size: 12pt; margin-top: 1em; }
    .casos-teste-pdf p, .casos-teste-pdf li { orphans: 3; widows: 3; }
    .casos-teste-pdf ol, .casos-teste-pdf ul { padding-left: 1.4em; }
    .casos-teste-pdf table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 10pt; }
    .casos-teste-pdf th, .casos-teste-pdf td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
    .casos-teste-pdf th { background: #f0f0f0; }
    .casos-teste-pdf hr { border: none; border-top: 1px solid #ddd; margin: 24px 0; }
    .casos-teste-pdf pre { background: #f5f5f5; padding: 10px; overflow-x: auto; font-size: 9pt; }
    @media print {
      body.casos-teste-pdf { padding: 0; }
      h2 { page-break-before: auto; }
    }
  </style>
</head>
<body class="casos-teste-pdf">
  <h1>${escapeHtml(title)}</h1>
  ${htmlBody}
  <script>window.onload = function() { window.print(); };</script>
</body>
</html>`);
  win.document.close();
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
