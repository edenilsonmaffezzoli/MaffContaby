import type { GerarCasoTesteRequest, SourceFileInput } from '../types/gerar-caso-teste';
import type { PageContextForPrompt } from './gerar-caso-teste';

/**
 * Monta o prompt para gerar um projeto de testes automatizados em
 * Playwright Test (TypeScript) com base no front-end analisado.
 * A IA deve responder APENAS com JSON: { summary, files: [{ path, content }] }.
 */
export function buildGerarCodigoPlaywrightPrompt(
  request: GerarCasoTesteRequest,
  files: SourceFileInput[],
  truncated: boolean,
  imageCount: number,
  pageContext?: PageContextForPrompt,
): string {
  const systemPath = request.systemPath?.trim() || '(não informado)';
  const sourceLabel = request.sourcePathLabel?.trim() || '(não informado)';
  const extra = request.extraContext?.trim() || '';
  const auth = request.targetAuth;

  const authContextLines: string[] = [];
  if (auth?.loginUrl?.trim()) {
    authContextLines.push(`- URL de login do sistema alvo: ${auth.loginUrl.trim()}`);
    authContextLines.push(`- Usuário de teste informado: ${auth.username.trim() || '(não informado)'}`);
    authContextLines.push(`- Modo de autenticação: ${auth.mode ?? 'auto'}`);
    if (pageContext?.authAttempted) {
      authContextLines.push(
        pageContext.authSuccess
          ? `- Autenticação no site alvo: sucesso (modo ${pageContext.authMode ?? 'auto'})`
          : `- Autenticação no site alvo: falhou${pageContext.authError ? ` (${pageContext.authError})` : ''}`,
      );
    }
  }

  const authInstructions = auth?.loginUrl?.trim()
    ? `
AUTENTICAÇÃO
O sistema exige login. Gere \`tests/fixtures/auth.ts\` com um fixture \`loggedInPage\` (storageState ou login via UI) usando \`process.env.BASE_URL\`, \`process.env.LOGIN_URL\`, \`process.env.TEST_USER\` e \`process.env.TEST_PASSWORD\`. Adapte os locators ao formulário observado (modo ${auth.mode ?? 'auto'}). Inclua \`tests/auth.spec.ts\` cobrindo login válido, login inválido e logout. NUNCA escreva a senha real em nenhum arquivo — use sempre \`process.env.TEST_PASSWORD\`.
`
    : '';

  const codeBlock =
    files.length === 0
      ? '(nenhum arquivo de código enviado)'
      : files.map(f => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``).join('\n\n');

  return `PAPEL
Você é um(a) Engenheiro(a) de Automação de Testes Sênior (SDET) com profundo domínio de Playwright Test em TypeScript. Você escreve projetos de automação E2E limpos, estáveis, legíveis e prontos para rodar em CI, seguindo as melhores práticas oficiais do Playwright.

OBJETIVO
Analisar o front-end descrito no CONTEXTO DESTA EXECUÇÃO (URL, conteúdo de página observado, código de referência, imagens e notas) e gerar um PROJETO COMPLETO E EXECUTÁVEL de testes automatizados em Playwright Test + TypeScript, cobrindo os principais fluxos funcionais do sistema. Não gere um plano em texto: gere os ARQUIVOS reais do projeto, com conteúdo pronto para execução.

STACK OBRIGATÓRIA (não use nada fora disto)
- Framework: Playwright Test (\`@playwright/test\`).
- Linguagem: TypeScript (arquivos \`.ts\` / \`.spec.ts\`).
- PROIBIDO: Robot Framework, Selenium, Cypress, Puppeteer, Playwright em JavaScript puro, Python ou qualquer outra stack. Use exclusivamente Playwright Test em TypeScript.

ROTEIRO DE ANÁLISE (faça mentalmente antes de gerar os arquivos)
1. Identifique o TIPO de sistema (landing page, e-commerce, dashboard, CRUD administrativo, sistema financeiro/contábil, SaaS, etc.).
2. Mapeie os MÓDULOS / áreas / menus visíveis (ex.: Autenticação, Cadastros, Listagens, Relatórios, Configurações). Cada módulo principal vira um arquivo \`tests/<modulo>.spec.ts\`.
3. Identifique TELAS, formulários, listagens, filtros, botões, mensagens e fluxos observáveis.
4. Infira as REGRAS DE NEGÓCIO a partir de rótulos, validações e textos observáveis.
5. Só então gere os testes, distribuindo casos por módulo (caminho feliz, negativos/validação, mensagens/feedback, navegação e, quando aplicável, sessão/permissão).

BOAS PRÁTICAS OBRIGATÓRIAS
- Locators robustos: priorize \`getByRole\`, \`getByLabel\`, \`getByText\`, \`getByPlaceholder\` e \`getByTestId\`. Evite XPath/CSS frágil; quando inevitável, comente o motivo.
- Esperas: use auto-waiting do Playwright (\`expect(locator).toBeVisible()\`, \`toHaveURL\`, \`toHaveText\`). NUNCA use \`page.waitForTimeout\` nem sleeps fixos.
- Asserções claras com \`expect\` do Playwright Test.
- Reuso: helpers em \`tests/fixtures\` e/ou \`tests/pages\` (Page Object simples, sem over-engineering).
- Configuração: parametrize via env (\`BASE_URL\`, \`HEADLESS\`, \`TEST_USER\`, \`TEST_PASSWORD\`) em \`playwright.config.ts\` (\`use.baseURL\`). Nunca faça hardcode de URL absoluta nem de credenciais nos testes.
- Tags: use \`test.describe\` por módulo e anotações/tags (\`@smoke\`, \`@regressao\`) para filtragem (\`npx playwright test --grep @smoke\`).
- Cada teste deve ter título claro em português e, quando útil, \`test.info().annotations\` ou comentário de intenção/pré-condição.
- Idempotência: testes independentes entre si; use \`beforeEach\`/\`afterEach\` adequados.

SEGURANÇA
Nunca inclua senhas, tokens ou dados sensíveis reais em qualquer arquivo. Use placeholders e variáveis de ambiente (\`process.env.TEST_PASSWORD\`). O arquivo \`.env.example\` deve conter apenas valores fictícios.

ESTRUTURA DE ARQUIVOS DO PROJETO (gere todos os aplicáveis)
- \`README.md\` — descrição do projeto, instalação (\`npm i\` + \`npx playwright install\`), como executar (\`npx playwright test\`), como filtrar por grep/tag, e como configurar variáveis de ambiente.
- \`package.json\` — scripts \`test\`, \`test:headed\` e dependências \`@playwright/test\` e \`typescript\` (com versões compatíveis).
- \`tsconfig.json\` — config mínima para os testes.
- \`playwright.config.ts\` — \`testDir: './tests'\`, \`use.baseURL\` a partir de \`process.env.BASE_URL\`, \`fullyParallel\`, reporter html.
${auth?.loginUrl?.trim() ? '- `tests/fixtures/auth.ts` — fixture `loggedInPage` e helpers de sessão.\n- `tests/auth.spec.ts` — login válido, inválido e logout.\n' : ''}- \`tests/<modulo>.spec.ts\` — um arquivo por módulo identificado, com \`test.describe\` e casos cobrindo happy path, validação e feedback.
- \`.env.example\` — BASE_URL, HEADLESS, TEST_USER, TEST_PASSWORD (valores fictícios).
- \`.gitignore\` — node_modules, test-results, playwright-report, .env.
${authInstructions}
COBERTURA MÍNIMA
- Sistema simples (landing/institucional): 1 a 3 arquivos spec, 8 a 15 testes no total.
- Sistema com login e múltiplos módulos: 3 a 6 arquivos spec, 15 a 40 testes distribuídos por módulo.
- Reforce os fluxos críticos identificados (login, cadastros principais, exportações, etc.).

ANTI-PATTERNS PROIBIDOS
- \`waitForTimeout\` ou esperas arbitrárias.
- XPath gigante/frágil quando há alternativa por role/text/label.
- Hardcode de credenciais ou URL absoluta dentro dos testes.
- Testes que dependem uns dos outros ou da ordem de execução.
- Helpers duplicados que deveriam estar em fixtures/page objects.

FORMATO DE SAÍDA — JSON (OBRIGATÓRIO)
Responda EXCLUSIVAMENTE com um único objeto JSON válido, sem markdown, sem blocos de código, sem comentários e sem nenhum texto antes ou depois. O JSON deve ter exatamente este formato:
{
  "summary": "Resumo curto em português do que foi gerado (tipo de sistema, módulos cobertos, nº de arquivos e testes).",
  "files": [
    { "path": "caminho/relativo/do/arquivo.ext", "content": "conteúdo completo do arquivo como string" }
  ]
}
Regras do JSON:
- \`path\` sempre relativo (sem barra inicial, sem \`..\`), usando \`/\` como separador.
- \`content\` é o conteúdo textual completo do arquivo, com quebras de linha escapadas corretamente (\\n) conforme exigido pelo JSON.
- Inclua todos os arquivos necessários para o projeto rodar.
- Não trunque arquivos; gere conteúdo completo e coerente entre si (imports, nomes de fixtures e variáveis devem bater).

---

## CONTEXTO DESTA EXECUÇÃO (use apenas para análise — não exponha dados técnicos sensíveis nos testes)

- Path do sistema (URL, módulo ou rota): ${systemPath}
- Caminho raiz do código fonte: ${sourceLabel}
- Arquivos de código incluídos: ${files.length}${truncated ? ' (lista truncada por limite de tamanho)' : ''}
- Imagens anexadas (prints/diagramas): ${imageCount}
${pageContext?.fetched ? `- Conteúdo da página (URL) incluído abaixo${pageContext.truncated ? ' (truncado)' : ''}` : pageContext?.fetchError ? `- Aviso: não foi possível buscar a URL (${pageContext.fetchError})` : ''}
${authContextLines.length ? authContextLines.join('\n') : ''}
${extra ? `\n- Notas adicionais do usuário:\n${extra}` : ''}

${pageContext?.fetched && pageContext.content ? `## Conteúdo observado na página (referência de negócio)\n${pageContext.content}\n\n` : ''}## Código fonte (referência de negócio)
${codeBlock}

---

Lembrete final: responda APENAS com o objeto JSON no formato especificado (\`summary\` e \`files\`), sem nenhum texto antes ou depois.`;
}
