import { marked } from 'marked';

const PRINT_STYLES = `
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
  body.casos-teste-pdf .doc-title {
    font-size: 20pt;
    color: #006666;
    border-bottom: 2px solid #006666;
    padding-bottom: 8px;
    margin: 0 0 1em;
  }
  body.casos-teste-pdf h1 { font-size: 18pt; color: #006666; margin-top: 1.2em; page-break-after: avoid; }
  body.casos-teste-pdf h2 { font-size: 14pt; margin-top: 1.4em; color: #003366; page-break-after: avoid; }
  body.casos-teste-pdf h3 { font-size: 12pt; margin-top: 1em; }
  body.casos-teste-pdf p, body.casos-teste-pdf li { orphans: 3; widows: 3; }
  body.casos-teste-pdf ol, body.casos-teste-pdf ul { padding-left: 1.4em; }
  body.casos-teste-pdf table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 10pt; }
  body.casos-teste-pdf th, body.casos-teste-pdf td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
  body.casos-teste-pdf th { background: #f0f0f0; }
  body.casos-teste-pdf hr { border: none; border-top: 1px solid #ddd; margin: 24px 0; }
  body.casos-teste-pdf pre { background: #f5f5f5; padding: 10px; overflow-x: auto; font-size: 9pt; white-space: pre-wrap; word-break: break-word; }
  body.casos-teste-pdf a { color: #006666; word-break: break-all; }
  @media print {
    body.casos-teste-pdf { padding: 0; }
  }
`;

export function openCasosTestePdf(markdown: string, title = 'Casos de Teste') {
  const htmlBody = marked.parse(markdown, { async: false }) as string;
  const win = window.open('', '_blank');
  if (!win) {
    alert('Não foi possível abrir a janela do PDF. Verifique se o bloqueador de pop-ups está ativo.');
    return;
  }

  const docHtml = [
    '<!DOCTYPE html>',
    '<html lang="pt-BR">',
    '<head>',
    '<meta charset="utf-8" />',
    '<title>',
    escapeHtml(title),
    '</title>',
    '<style>',
    PRINT_STYLES,
    '</style>',
    '</head>',
    '<body class="casos-teste-pdf">',
    '<h1 class="doc-title">',
    escapeHtml(title),
    '</h1>',
    '<main class="doc-body">',
    htmlBody,
    '</main>',
    '</body>',
    '</html>',
  ].join('');

  win.document.open();
  win.document.write(docHtml);
  win.document.close();
  win.focus();

  const triggerPrint = () => {
    try {
      win.print();
    } catch {
      /* janela fechada ou bloqueio do navegador */
    }
  };

  if (win.document.readyState === 'complete') {
    setTimeout(triggerPrint, 150);
  } else {
    win.addEventListener('load', () => setTimeout(triggerPrint, 150), { once: true });
  }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
