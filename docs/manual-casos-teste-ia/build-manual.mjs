import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), 'maffcontaby-worker/package.json'));
const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const ASSETS = path.join(__dirname, 'assets');
const FONTS = path.join(ROOT, 'maffcontaby-worker/src/fonts');
const OUT = path.join(ROOT, 'docs/Manual-Casos-de-Teste-IA.pdf');

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;
const HEADER_H = 46;
const FOOTER_H = 28;
const CONTENT_TOP = PAGE_H - MARGIN - HEADER_H - 18;
const CONTENT_BOTTOM = MARGIN + FOOTER_H + 8;
const CONTENT_W = PAGE_W - MARGIN * 2;

const brand = rgb(0.298, 0.686, 0.314);
const ink = rgb(0.063, 0.071, 0.078);
const muted = rgb(0.376, 0.4, 0.431);
const panel = rgb(0.957, 0.965, 0.973);
const white = rgb(1, 1, 1);
const teal = rgb(0, 0.4, 0.4);

function wrap(font, text, size, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      line = next;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

async function main() {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fontRegular = await pdf.embedFont(await readFile(path.join(FONTS, 'Roboto-Regular.ttf')), { subset: true });
  const fontBold = await pdf.embedFont(await readFile(path.join(FONTS, 'Roboto-Bold.ttf')), { subset: true });

  const logoPng = await pdf.embedPng(await readFile(path.join(ASSETS, 'maffcontaby-logo.png')));
  const imgs = {
    login: await pdf.embedPng(await readFile(path.join(ASSETS, '01-login.png'))),
    menu: await pdf.embedPng(await readFile(path.join(ASSETS, '02-menu.png'))),
    prompt: await pdf.embedPng(await readFile(path.join(ASSETS, '03-cadastro-prompt.png'))),
    config: await pdf.embedPng(await readFile(path.join(ASSETS, '04-configuracao.png'))),
    auth: await pdf.embedPng(await readFile(path.join(ASSETS, '05-sistema-login.png'))),
    result: await pdf.embedPng(await readFile(path.join(ASSETS, '06-resultado.png'))),
  };

  const generatedAt = new Date().toLocaleString('pt-BR');
  const pages = [];

  const addPage = (headerTitle = 'Casos de Teste IA') => {
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    pages.push({ page, headerTitle });
    return page;
  };

  const headerLogoH = 28;
  const headerLogoW = (logoPng.width / logoPng.height) * headerLogoH;
  const footerLogoH = 16;
  const footerLogoW = (logoPng.width / logoPng.height) * footerLogoH;

  const paintChrome = (page, headerTitle) => {
    const y = PAGE_H - MARGIN;
    page.drawRectangle({ x: MARGIN, y: y - HEADER_H, width: CONTENT_W, height: HEADER_H, color: brand });
    page.drawImage(logoPng, {
      x: PAGE_W - MARGIN - headerLogoW - 10,
      y: y - HEADER_H + (HEADER_H - headerLogoH) / 2,
      width: headerLogoW,
      height: headerLogoH,
    });
    page.drawText(headerTitle, {
      x: MARGIN + 14,
      y: y - 22,
      size: 14,
      font: fontBold,
      color: white,
    });
    page.drawText('MaffContaby  ·  Manual do usuário', {
      x: MARGIN + 14,
      y: y - 38,
      size: 8,
      font: fontRegular,
      color: white,
    });
    page.drawImage(logoPng, {
      x: PAGE_W - MARGIN - footerLogoW,
      y: 14,
      width: footerLogoW,
      height: footerLogoH,
    });
    page.drawText('MaffContaby', {
      x: MARGIN,
      y: 18,
      size: 8,
      font: fontRegular,
      color: muted,
    });
  };

  let page = addPage('Manual do Usuário');
  let y = CONTENT_TOP;

  const ensure = (need) => {
    if (y - need < CONTENT_BOTTOM) {
      page = addPage();
      y = CONTENT_TOP;
    }
  };

  const h1 = (text) => {
    ensure(28);
    page.drawText(text, { x: MARGIN, y: y - 14, size: 16, font: fontBold, color: teal });
    y -= 28;
  };

  const h2 = (text) => {
    ensure(24);
    page.drawText(text, { x: MARGIN, y: y - 12, size: 12, font: fontBold, color: ink });
    y -= 22;
  };

  const para = (text, size = 10) => {
    const lines = wrap(fontRegular, text, size, CONTENT_W);
    const lineH = size + 4;
    for (const line of lines) {
      ensure(lineH + 2);
      page.drawText(line, { x: MARGIN, y: y - size, size, font: fontRegular, color: ink });
      y -= lineH;
    }
    y -= 4;
  };

  const bullets = (items) => {
    for (const item of items) {
      const lines = wrap(fontRegular, item, 10, CONTENT_W - 16);
      const blockH = lines.length * 14 + 2;
      ensure(blockH);
      page.drawText('•', { x: MARGIN, y: y - 10, size: 10, font: fontBold, color: teal });
      for (const line of lines) {
        page.drawText(line, { x: MARGIN + 14, y: y - 10, size: 10, font: fontRegular, color: ink });
        y -= 14;
      }
      y -= 2;
    }
    y -= 4;
  };

  const steps = (items) => {
    items.forEach((item, i) => {
      const num = `${i + 1}.`;
      const lines = wrap(fontRegular, item, 10, CONTENT_W - 22);
      ensure(lines.length * 14 + 4);
      page.drawText(num, { x: MARGIN, y: y - 10, size: 10, font: fontBold, color: teal });
      for (const line of lines) {
        page.drawText(line, { x: MARGIN + 20, y: y - 10, size: 10, font: fontRegular, color: ink });
        y -= 14;
      }
      y -= 4;
    });
    y -= 2;
  };

  const caption = (text) => {
    const lines = wrap(fontRegular, text, 8, CONTENT_W);
    for (const line of lines) {
      ensure(12);
      page.drawText(line, { x: MARGIN, y: y - 8, size: 8, font: fontRegular, color: muted });
      y -= 12;
    }
    y -= 8;
  };

  const figure = (img, cap) => {
    const maxH = 250;
    let w = CONTENT_W;
    let h = (img.height / img.width) * w;
    if (h > maxH) {
      h = maxH;
      w = (img.width / img.height) * h;
    }
    ensure(h + 28);
    const x = MARGIN + (CONTENT_W - w) / 2;
    page.drawRectangle({ x: x - 2, y: y - h - 2, width: w + 4, height: h + 4, color: panel });
    page.drawImage(img, { x, y: y - h, width: w, height: h });
    y -= h + 8;
    caption(cap);
  };

  const note = (text) => {
    const lines = wrap(fontRegular, text, 9, CONTENT_W - 16);
    const boxH = lines.length * 13 + 14;
    ensure(boxH + 8);
    page.drawRectangle({ x: MARGIN, y: y - boxH, width: CONTENT_W, height: boxH, color: panel });
    let ty = y - 12;
    for (const line of lines) {
      page.drawText(line, { x: MARGIN + 8, y: ty - 9, size: 9, font: fontRegular, color: ink });
      ty -= 13;
    }
    y -= boxH + 10;
  };

  // —— Capa (já tem header) ——
  y -= 20;
  page.drawText('Manual do Usuário', { x: MARGIN, y, size: 26, font: fontBold, color: ink });
  y -= 32;
  page.drawText('Casos de Teste IA', { x: MARGIN, y, size: 18, font: fontBold, color: teal });
  y -= 22;
  para(`Gerado em ${generatedAt}. Este guia é para quem vai usar apenas a geração de casos de teste com inteligência artificial e a exportação para o Qase.io.`);
  figure(imgs.login, 'Figura 1 — Tela de login do MaffContaby.');

  h1('1. Para que serve');
  para('A tela Casos de Teste Inteligentes analisa a URL de um sistema (e, se houver, o login e prints de tela) e pede à IA que escreva casos de teste funcionais, prontos para importar no Qase.io em CSV.');
  bullets([
    'Você descreve o sistema (URL, login de homologação, imagens opcionais).',
    'A IA gera os casos em linguagem de usuário, sem jargão técnico.',
    'Você exporta o CSV e importa no Qase.io.',
  ]);
  note('Este manual não cobre Movimentações, Investimentos, Relatórios nem Importar. Na mesma tela existe o botão Gerar código auto (Robot ou Playwright); ele é opcional e não é necessário para o CSV do Qase.');

  h1('2. Entrar no sistema');
  steps([
    'Abra o MaffContaby no navegador.',
    'Informe usuário e senha na tela Entrar na conta.',
    'Clique em Entrar.',
  ]);
  para('Depois do login, use o menu à esquerda. As duas entradas deste manual são:');
  bullets([
    'Cadastros → Cadastro de Prompt — para guardar textos de instrução da IA.',
    'Ferramentas → Casos de Teste IA — para gerar e exportar os casos.',
  ]);
  figure(imgs.menu, 'Figura 2 — Menu: Cadastro de Prompt (Cadastros) e Casos de Teste IA (Ferramentas).');

  h1('3. Cadastrar um prompt');
  para('O Prompt padrão já vem no sistema. Cadastre outro quando quiser instruções específicas (por exemplo, um sistema com módulos próprios). O texto cadastrado substitui o template padrão; a URL, a página lida e o login continuam sendo anexados automaticamente.');
  steps([
    'No menu, abra Cadastros e clique em Cadastro de Prompt.',
    'Em Adicionar Prompt, preencha Descrição (até 150 caracteres), por exemplo: Prompt para e-commerce.',
    'Cole o texto do prompt no campo Prompt (até 50.000 caracteres). Escreva o que a IA deve analisar e como deve escrever os casos.',
    'Clique em Adicionar.',
    'O prompt aparece na lista Prompts cadastrados. Ali você pode editar ou excluir.',
  ]);
  figure(imgs.prompt, 'Figura 3 — Cadastro de Prompt: descrição, texto e botão Adicionar.');
  note('Na tela de geração, o prompt cadastrado aparece no seletor Prompt. Se deixar Prompt padrão, o sistema usa o template interno.');

  h1('4. Gerar os casos de teste');
  para('Abra Ferramentas → Casos de Teste IA. A página se chama Casos de Teste Inteligentes.');
  figure(imgs.config, 'Figura 4 — Configuração: URL, prompt, login, imagens e Gerar Casos de Teste.');

  h2('4.1 URL do sistema');
  steps([
    'Preencha URL do sistema com a página que a IA deve analisar.',
    'Se o sistema tiver login, use a URL da tela depois do login (por exemplo o dashboard), não só a home pública.',
  ]);

  h2('4.2 Prompt');
  para('No campo Prompt, escolha Prompt padrão ou um prompt que você cadastrou no passo anterior.');

  h2('4.3 Modelo de IA (somente administrador)');
  para('Se a sua conta for administradora, aparece o seletor Modelo de IA. Os demais usuários usam o modelo padrão do servidor. Se a geração com Grok falhar ou demorar demais, prefira o Composer.');

  h2('4.4 Sistema com login');
  para('Opcional. Use credenciais de homologação. A senha não é salva e não entra no CSV exportado.');
  steps([
    'Clique em Sistema com login para abrir o bloco.',
    'Informe a URL de login.',
    'Deixe o Modo em Auto-detectar, salvo se a equipe indicar Formulário HTML ou API JSON.',
    'Preencha Usuário e Senha de teste.',
    'Os três campos (URL de login, usuário e senha) precisam estar preenchidos para a autenticação valer.',
  ]);
  figure(imgs.auth, 'Figura 5 — Bloco Sistema com login aberto, com o selo configurado.');

  h2('4.5 Imagens (opcional)');
  para('Clique em Adicionar imagens para enviar até 5 prints (telas, fluxos, mensagens). Isso ajuda a IA quando a URL sozinha não mostra o suficiente.');

  h2('4.6 Gerar');
  steps([
    'Clique em Gerar Casos de Teste.',
    'Aguarde as fases: leitura do sistema e montagem do prompt; geração com a IA; processamento dos casos.',
    'A geração pode levar alguns minutos, principalmente com modelos mais lentos. Não feche a aba.',
  ]);

  h1('5. Resultado e exportação');
  para('Quando a geração termina, o card Resultado mostra a quantidade de casos e os botões de exportação.');
  figure(imgs.result, 'Figura 6 — Resultado com os botões CSV Qase, PDF e Limpar.');
  bullets([
    'CSV Qase — baixa o arquivo para importar no Qase.io. No Qase: ⋯ → Import Data → Source: Qase.io (v2, não use a opção CSV [deprecated]). O arquivo já traz suites e subsuites; não selecione uma suite destino única no assistente.',
    'PDF — abre uma visualização para imprimir ou salvar os casos em PDF.',
    'Gerar MD automatizado — gera um markdown de apoio à automação. Opcional.',
    'Limpar — apaga o resultado da tela para uma nova geração.',
  ]);

  h1('6. Importar o CSV no Qase.io');
  steps([
    'Exporte o CSV Qase no MaffContaby.',
    'No Qase.io, abra o projeto e use ⋯ → Import Data.',
    'Escolha a origem Qase.io (v2).',
    'Envie o arquivo baixado e conclua o assistente.',
  ]);

  h1('7. Problemas comuns');
  bullets([
    'A geração demora ou a conexão cai — aguarde; se persistir, tente de novo ou use o Composer (administrador).',
    'Mensagem de CSV ou JSON inválido — a IA não devolveu o formato esperado. Tente novamente; se houver Baixar prompt (debug), envie o arquivo à equipe.',
    'Autenticação não liga — preencha URL de login, usuário e senha. A URL do sistema deve ser a página após o login.',
    'Botão Gerar desabilitado — informe ao menos a URL do sistema (ou imagens, se não houver login).',
    'Senha no CSV — o sistema usa placeholders; não coloque senha real no texto do prompt cadastrado.',
  ]);

  h1('8. Fora deste manual');
  para('Movimentações, Investimentos, Relatórios, Importar e Horários não fazem parte deste guia. O botão Gerar código auto (Robot + Browser Library ou Playwright) está na mesma tela de Casos de Teste IA, mas serve para gerar um projeto de automação em ZIP — não substitui o CSV do Qase.');

  y -= 8;
  note('Em caso de dúvida, fale com o administrador da conta MaffContaby. Não compartilhe senhas de produção nos campos de teste.');

  for (const item of pages) {
    paintChrome(item.page, item.headerTitle);
    const n = pages.indexOf(item) + 1;
    const label = `${n} / ${pages.length}`;
    item.page.drawText(label, {
      x: PAGE_W / 2 - fontRegular.widthOfTextAtSize(label, 8) / 2,
      y: 18,
      size: 8,
      font: fontRegular,
      color: muted,
    });
  }

  const bytes = await pdf.save();
  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, bytes);
  console.log(`PDF gerado: ${OUT} (${bytes.length} bytes, ${pages.length} páginas)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
