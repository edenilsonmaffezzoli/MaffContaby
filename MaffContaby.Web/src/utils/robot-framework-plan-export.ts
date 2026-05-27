import type { QaseCase, QaseStep } from '@/types/casos-teste';

export const ROBOT_PLAN_FILENAME = 'plano-testes-robot-browser.md';

export type RobotPlanTargetAuth = {
  loginUrl: string;
  username: string;
  mode: 'auto' | 'form' | 'json';
};

export type RobotPlanInput = {
  markdown: string;
  cases: QaseCase[];
  systemPath?: string;
  targetAuth?: RobotPlanTargetAuth;
};

export type RobotPlanStats = {
  casesIncluded: number;
  suites: string[];
  outputFilename: string;
};

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function deriveFilename(systemPath?: string): string {
  if (!systemPath?.trim()) return ROBOT_PLAN_FILENAME;
  try {
    const host = new URL(systemPath.trim()).hostname.replace(/^www\./, '');
    const slug = slugify(host);
    return slug ? `plano-testes-robot-${slug}.md` : ROBOT_PLAN_FILENAME;
  } catch {
    return ROBOT_PLAN_FILENAME;
  }
}

function deriveScreenName(systemPath: string | undefined, markdown: string): string {
  if (systemPath?.trim()) {
    try {
      const url = new URL(systemPath.trim());
      const path = url.pathname.replace(/\/$/, '') || '/';
      return `${url.hostname}${path === '/' ? '' : path}`;
    } catch {
      return systemPath.trim();
    }
  }
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading || 'Sistema analisado';
}

function formatStepsForPlan(steps: QaseStep[]): string {
  return steps
    .map((step, index) => {
      const lines = [`${index + 1}. **Ação:** ${step.action}`, `   **Resultado esperado:** ${step.expected_result}`];
      if (step.data?.trim()) lines.push(`   **Dados:** ${step.data.trim()}`);
      return lines.join('\n');
    })
    .join('\n\n');
}

function robotTestName(title: string): string {
  return title.replace(/\s+/g, ' ').trim();
}

function robotTags(testCase: QaseCase): string {
  const tags = [
    testCase.suite ? slugify(testCase.suite) : '',
    testCase.subsuite ? slugify(testCase.subsuite) : '',
    testCase.priority?.trim().toLowerCase() || 'medium',
    ...(testCase.tags ?? []).map(t => slugify(t)),
  ].filter(Boolean);
  return [...new Set(tags)].join('    ');
}

function buildRobotSketch(testCase: QaseCase, baseUrl: string): string {
  const name = robotTestName(testCase.title);
  const tags = robotTags(testCase);
  const firstAction = testCase.steps[0]?.action ?? 'Executar fluxo principal';
  const firstExpected = testCase.steps[0]?.expected_result ?? 'Resultado esperado atingido';

  return `\`\`\`robot
*** Test Cases ***
${name}
    [Documentation]    ${testCase.description?.trim() || testCase.title}
    ...    Pré-condições: ${testCase.preconditions?.trim() || 'Nenhuma'}
    [Tags]    ${tags}
    Abrir Sistema    ${baseUrl || '${BASE_URL}'}
    # Passo 1: ${firstAction}
    # TODO: mapear locators Browser Library (Get By Role/Text/Test Id)
    # Exemplo: Click    \${LOCATOR_DO_ELEMENTO}
    # Validar: ${firstExpected}
    # Repetir para ${testCase.steps.length} passo(s) documentado(s)
\`\`\``;
}

function groupCasesBySuite(cases: QaseCase[]): Map<string, Map<string, QaseCase[]>> {
  const grouped = new Map<string, Map<string, QaseCase[]>>();

  for (const testCase of cases) {
    const suite = testCase.suite?.trim() || 'Geral';
    const subsuite = testCase.subsuite?.trim() || 'Casos gerais';
    let suiteMap = grouped.get(suite);
    if (!suiteMap) {
      suiteMap = new Map();
      grouped.set(suite, suiteMap);
    }
    const list = suiteMap.get(subsuite) ?? [];
    list.push(testCase);
    suiteMap.set(subsuite, list);
  }

  return grouped;
}

function buildAuthSection(targetAuth?: RobotPlanTargetAuth): string {
  if (!targetAuth) {
    return `- **Autenticação:** não configurada na geração (testes públicos ou login manual).\n`;
  }

  return `- **Autenticação:** necessária
  - URL de login: \`${targetAuth.loginUrl}\`
  - Usuário de teste: \`${targetAuth.username}\`
  - Modo detectado/configurado: \`${targetAuth.mode}\`
  - **Não** commitar senha; usar variável de ambiente \`TEST_PASSWORD\` ou arquivo \`.env\` local ignorado pelo Git.\n`;
}

function buildCasesSection(cases: QaseCase[], baseUrl: string): string {
  const grouped = groupCasesBySuite(cases);
  const sections: string[] = [];
  let index = 1;

  for (const [suite, subsuites] of [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))) {
    sections.push(`## Suite: ${suite}\n`);

    for (const [subsuite, suiteCases] of [...subsuites.entries()].sort((a, b) =>
      a[0].localeCompare(b[0], 'pt-BR'),
    )) {
      sections.push(`### Subsuite: ${subsuite}\n`);

      for (const testCase of suiteCases.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'))) {
        sections.push(`#### TC-${String(index).padStart(3, '0')} — ${testCase.title}

- **Prioridade:** ${testCase.priority?.trim() || 'medium'}
- **Descrição:** ${testCase.description?.trim() || testCase.title}
- **Pré-condições:** ${testCase.preconditions?.trim() || 'Nenhuma'}

**Roteiro manual:**

${formatStepsForPlan(testCase.steps)}

**Esboço Robot Framework (Browser Library):**

${buildRobotSketch(testCase, baseUrl)}
`);
        index += 1;
      }
    }
  }

  return sections.join('\n');
}

export function buildRobotFrameworkPlan(input: RobotPlanInput): { markdown: string; stats: RobotPlanStats } {
  const validCases = input.cases.filter(c => c.title?.trim() && c.steps?.some(s => s.action?.trim() && s.expected_result?.trim()));

  if (validCases.length === 0) {
    throw new Error('Nenhum caso estruturado com passos válidos para gerar o plano Robot.');
  }

  const baseUrl = input.systemPath?.trim() || 'https://SEU-SISTEMA.example';
  const screenName = deriveScreenName(input.systemPath, input.markdown);
  const filename = deriveFilename(input.systemPath);
  const suites = [...new Set(validCases.map(c => c.suite?.trim() || 'Geral'))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const generatedAt = new Date().toISOString();

  const plan = `# Plano de Automação E2E — ${screenName}

> Gerado automaticamente pelos **Casos de Teste Inteligentes** em ${generatedAt}.
>
> **Instrução para o Cursor:** implemente os testes automatizados descritos neste plano usando **Robot Framework** com **[Browser Library](https://robotframework-browser.org/)** (Playwright). Não use SeleniumLibrary, Cypress nem Playwright puro — a stack obrigatória é Robot + Browser Library.

---

## Objetivo

Criar suítes Robot Framework reproduzindo fielmente o roteiro manual abaixo, cobrindo a tela/sistema **${screenName}** com testes E2E estáveis, legíveis e prontos para CI.

## Contexto do sistema

- **URL base:** \`${baseUrl}\`
${buildAuthSection(input.targetAuth)}- **Total de casos no plano:** ${validCases.length}
- **Suites identificadas:** ${suites.join(', ')}

---

## Stack obrigatória

| Item | Escolha |
|------|---------|
| Framework | Robot Framework 6+ |
| Biblioteca de browser | \`Browser\` (robotframework-browser) |
| Engine | Playwright (via Browser Library) |
| Linguagem dos testes | Robot Framework (.robot) |
| Recursos compartilhados | \`.resource\` com keywords reutilizáveis |

### Instalação

\`\`\`bash
pip install robotframework robotframework-browser
rfbrowser init
\`\`\`

---

## Estrutura de pastas sugerida

\`\`\`text
tests/
  resources/
    common.resource       # Browser setup/teardown, helpers
    auth.resource         # login (se aplicável)
    locators.resource     # variáveis de seletores
  suites/
    <suite-slug>/
      <subsuite-slug>.robot
  data/
    env.example           # BASE_URL, TEST_USER, TEST_PASSWORD
\`\`\`

---

## Convenções Robot Framework + Browser Library

1. **Settings padrão** em cada \`.robot\`:
   \`\`\`robot
   *** Settings ***
   Library    Browser
   Resource   ../resources/common.resource
   Suite Setup       Abrir Navegador
   Suite Teardown    Fechar Navegador
   Test Setup        Ir Para Pagina Inicial
   \`\`\`
2. **Setup de browser** (keyword em \`common.resource\`):
   \`\`\`robot
   Abrir Navegador
       New Browser    chromium    headless=\${HEADLESS}
       New Context    viewport={'width': 1280, 'height': 720}
       New Page       \${BASE_URL}
   \`\`\`
3. **Locators:** priorize \`Get By Role\`, \`Get By Text\`, \`Get By Label\`, \`Get By Test Id\`. Evite XPath frágil.
4. **Asserções:** use \`Get Text\`, \`Get Url\`, \`Get Element States\` e \`Wait For Elements State\`.
5. **Um test case Robot por caso manual** — título idêntico ao roteiro (\`[Documentation]\` com descrição e pré-condições).
6. **Tags:** suite, subsuite, prioridade e tags originais (para filtro: \`robot -i high\`).
7. **Dados sensíveis:** nunca hardcode de senha; use \`\${TEST_PASSWORD}\` de variável de ambiente.

---

## Keywords compartilhadas sugeridas

\`\`\`robot
*** Keywords ***
Abrir Navegador
    [Arguments]    \${headless}=False
    New Browser    chromium    headless=\${headless}
    New Context    viewport={'width': 1280, 'height': 720}
    New Page       \${BASE_URL}

Fechar Navegador
    Close Browser

Ir Para Pagina Inicial
    Go To    \${BASE_URL}
    Wait For Load State    networkidle

${input.targetAuth ? `Fazer Login
    Go To    ${input.targetAuth.loginUrl}
    # TODO: adaptar ao formulário real (modo: ${input.targetAuth.mode})
    Fill Text    \${LOGIN_USER_FIELD}    \${TEST_USER}
    Fill Text    \${LOGIN_PASSWORD_FIELD}    \${TEST_PASSWORD}
    Click    \${LOGIN_SUBMIT_BUTTON}
    Wait For Load State    networkidle
    # Validar sessão autenticada antes dos casos da tela` : '# Sem login configurado — omitir keyword Fazer Login ou criar se necessário'}
\`\`\`

---

## Casos de teste a implementar

${buildCasesSection(validCases, baseUrl)}

---

## Checklist para o Cursor (Definition of Done)

- [ ] Projeto Robot criado com \`robotframework\` + \`robotframework-browser\`
- [ ] \`rfbrowser init\` documentado no README dos testes
- [ ] Keywords \`Abrir Navegador\`, \`Fechar Navegador\`, \`Ir Para Pagina Inicial\`${input.targetAuth ? ' e `Fazer Login`' : ''} implementadas
- [ ] ${validCases.length} test cases Robot implementados (1:1 com este plano)
- [ ] Locators estáveis (roles/text/test-id) — sem sleeps fixos desnecessários
- [ ] Tags de suite/sub suite/prioridade aplicadas
- [ ] Execução local documentada: \`robot --variable BASE_URL:${baseUrl} tests/suites\`
- [ ] Todos os testes passam de forma repetível (mín. 2 execuções seguidas)

---

## Referência — roteiro manual original (markdown)

<details>
<summary>Clique para expandir o roteiro completo gerado pela IA</summary>

${input.markdown.trim()}

</details>
`;

  return {
    markdown: plan,
    stats: {
      casesIncluded: validCases.length,
      suites,
      outputFilename: filename,
    },
  };
}

function triggerMarkdownDownload(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadRobotFrameworkPlan(input: RobotPlanInput): RobotPlanStats {
  const { markdown, stats } = buildRobotFrameworkPlan(input);
  triggerMarkdownDownload(markdown, stats.outputFilename);
  return stats;
}

export function formatRobotPlanExportSummary(stats: RobotPlanStats): string {
  return [
    `Plano Robot Framework gerado com sucesso.`,
    `Casos incluídos: ${stats.casesIncluded}`,
    `Suites: ${stats.suites.join(', ')}`,
    `Arquivo: ${stats.outputFilename}`,
    '',
    'Abra o .md no Cursor e peça para implementar os testes conforme o plano (Robot Framework + Browser Library).',
  ].join('\n');
}
