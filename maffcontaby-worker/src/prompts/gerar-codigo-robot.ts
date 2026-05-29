import type { GerarCasoTesteRequest, SourceFileInput } from '../types/gerar-caso-teste';
import type { PageContextForPrompt } from './gerar-caso-teste';

/**
 * Monta o prompt para gerar um projeto de testes automatizados em
 * Robot Framework + Browser Library com base no front-end analisado.
 * A IA deve responder APENAS com JSON: { summary, files: [{ path, content }] }.
 */
export function buildGerarCodigoRobotPrompt(
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
O sistema exige login. Gere um arquivo \`resources/auth.resource\` com a keyword \`Fazer Login\` usando Browser Library e variáveis \`\${BASE_URL}\`, \`\${LOGIN_URL}\`, \`\${TEST_USER}\` e \`\${TEST_PASSWORD}\`. Adapte os locators ao formulário observado (modo ${auth.mode ?? 'auto'}). Inclua uma suíte de autenticação cobrindo login válido, login inválido e logout. NUNCA escreva a senha real em nenhum arquivo — use sempre a variável \`\${TEST_PASSWORD}\` carregada de variável de ambiente / arquivo \`.env\` ignorado pelo Git.
`
    : '';

  const codeBlock =
    files.length === 0
      ? '(nenhum arquivo de código enviado)'
      : files.map(f => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``).join('\n\n');

  return `PAPEL
Você é um(a) Engenheiro(a) de Automação de Testes Sênior (SDET) com profundo domínio de Robot Framework e da Browser Library (baseada em Playwright). Você escreve projetos de automação E2E limpos, estáveis, legíveis e prontos para rodar em CI, seguindo as melhores práticas da comunidade Robot Framework.

OBJETIVO
Analisar o front-end descrito no CONTEXTO DESTA EXECUÇÃO (URL, conteúdo de página observado, código de referência, imagens e notas) e gerar um PROJETO COMPLETO E EXECUTÁVEL de testes automatizados em Robot Framework + Browser Library, cobrindo os principais fluxos funcionais do sistema. Não gere um plano em texto: gere os ARQUIVOS reais do projeto, com conteúdo pronto para execução.

STACK OBRIGATÓRIA (não use nada fora disto)
- Framework: Robot Framework 6+.
- Biblioteca de browser: \`Browser\` (pacote \`robotframework-browser\`, engine Playwright).
- Linguagem dos testes: arquivos \`.robot\` e recursos \`.resource\`.
- PROIBIDO: SeleniumLibrary, Selenium, Cypress, Playwright puro (JS/Python), Puppeteer ou qualquer outra stack. Use exclusivamente Robot Framework + Browser Library.

ROTEIRO DE ANÁLISE (faça mentalmente antes de gerar os arquivos)
1. Identifique o TIPO de sistema (landing page, e-commerce, dashboard, CRUD administrativo, sistema financeiro/contábil, SaaS, etc.).
2. Mapeie os MÓDULOS / áreas / menus visíveis (ex.: Autenticação, Cadastros, Listagens, Relatórios, Configurações). Cada módulo principal vira uma suíte \`.robot\`.
3. Identifique TELAS, formulários, listagens, filtros, botões, mensagens e fluxos observáveis.
4. Infira as REGRAS DE NEGÓCIO a partir de rótulos, validações e textos observáveis.
5. Só então gere os testes, distribuindo casos por módulo (caminho feliz, negativos/validação, mensagens/feedback, navegação e, quando aplicável, sessão/permissão).

BOAS PRÁTICAS OBRIGATÓRIAS
- Locators robustos: priorize \`Get By Role\`, \`Get By Text\`, \`Get By Label\`, \`Get By Placeholder\` e \`Get By Test Id\`. Evite XPath/CSS frágil; quando inevitável, comente o motivo.
- Esperas explícitas: use \`Wait For Elements State\`, \`Wait For Load State\` e asserções com auto-waiting da Browser Library. NUNCA use \`Sleep\` fixo.
- Asserções claras: use \`Get Text\`, \`Get Url\`, \`Get Element States\`, \`Get Element Count\` com matchers (\`==\`, \`contains\`, \`should be visible\`).
- Reuso: centralize setup/teardown do browser e helpers em \`resources/common.resource\`; seletores em \`resources/locators.resource\`.
- Configuração: parametrize tudo via variáveis (\`\${BASE_URL}\`, \`\${HEADLESS}\`, \`\${TEST_USER}\`, \`\${TEST_PASSWORD}\`), com valores de exemplo em \`data/env.example\`. Nunca faça hardcode de URL absoluta nem de credenciais.
- Tags: aplique tags por módulo, prioridade (\`high\`/\`medium\`/\`low\`) e tipo (\`smoke\`, \`regressao\`) para permitir filtragem (\`robot -i smoke\`).
- Cada test case Robot deve ter \`[Documentation]\` descrevendo intenção e pré-condições, e título no formato de frase clara em português.
- Idempotência e estabilidade: testes independentes entre si, com \`Test Setup\`/\`Test Teardown\` adequados.

SEGURANÇA
Nunca inclua senhas, tokens ou dados sensíveis reais em qualquer arquivo. Use placeholders e variáveis de ambiente (\`\${TEST_PASSWORD}\`). O arquivo \`data/env.example\` deve conter apenas valores fictícios.

ESTRUTURA DE ARQUIVOS DO PROJETO (gere todos os aplicáveis)
- \`README.md\` — descrição do projeto, instalação (\`pip install -r requirements.txt\` + \`rfbrowser init\`), como executar (\`robot --variable BASE_URL:... tests\`), como filtrar por tags, e como configurar variáveis de ambiente.
- \`requirements.txt\` — pelo menos \`robotframework\` e \`robotframework-browser\` (com versões compatíveis).
- \`resources/common.resource\` — \`*** Settings ***\` com \`Library Browser\`, variáveis comuns, e keywords \`Abrir Navegador\`, \`Fechar Navegador\`, \`Ir Para Pagina Inicial\` e helpers reutilizáveis.
- \`resources/locators.resource\` — variáveis de seletores nomeadas e comentadas.
${auth?.loginUrl?.trim() ? '- `resources/auth.resource` — keyword `Fazer Login` e helpers de sessão.\n' : ''}- \`tests/<modulo>.robot\` — uma suíte por módulo identificado, importando os \`.resource\`, com \`*** Settings ***\`, \`Suite Setup\`/\`Suite Teardown\` e \`*** Test Cases ***\`.
- \`data/env.example\` — variáveis de ambiente de exemplo (BASE_URL, HEADLESS, TEST_USER, TEST_PASSWORD) com valores fictícios.
${authInstructions}
COBERTURA MÍNIMA
- Sistema simples (landing/institucional): 1 a 3 suítes, 8 a 15 test cases no total.
- Sistema com login e múltiplos módulos: 3 a 6 suítes, 15 a 40 test cases distribuídos por módulo.
- Reforce os fluxos críticos identificados (login, cadastros principais, exportações, etc.).

ANTI-PATTERNS PROIBIDOS
- \`Sleep\` fixo ou esperas arbitrárias.
- XPath gigante/frágil quando há alternativa por role/text/label.
- Hardcode de credenciais ou URL absoluta dentro dos testes.
- Test cases que dependem uns dos outros ou da ordem de execução.
- Keywords duplicadas que deveriam estar em \`common.resource\`.

FORMATO DE SAÍDA — JSON (OBRIGATÓRIO)
Responda EXCLUSIVAMENTE com um único objeto JSON válido, sem markdown, sem blocos de código, sem comentários e sem nenhum texto antes ou depois. O JSON deve ter exatamente este formato:
{
  "summary": "Resumo curto em português do que foi gerado (tipo de sistema, módulos cobertos, nº de suítes e test cases).",
  "files": [
    { "path": "caminho/relativo/do/arquivo.ext", "content": "conteúdo completo do arquivo como string" }
  ]
}
Regras do JSON:
- \`path\` sempre relativo (sem barra inicial, sem \`..\`), usando \`/\` como separador.
- \`content\` é o conteúdo textual completo do arquivo, com quebras de linha escapadas corretamente (\\n) conforme exigido pelo JSON.
- Inclua todos os arquivos necessários para o projeto rodar.
- Não trunque arquivos; gere conteúdo completo e coerente entre si (imports, nomes de keywords e variáveis devem bater).

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
