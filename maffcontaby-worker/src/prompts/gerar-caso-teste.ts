import type { FetchedPageContext } from '../fetch-system-url';
import { AI_QASE_CSV_HEADER } from '../parse-ai-qase-csv';
import type { GerarCasoTesteRequest, SourceFileInput } from '../types/gerar-caso-teste';

export type PageContextForPrompt = Pick<
  FetchedPageContext,
  'content' | 'fetched' | 'truncated' | 'fetchError'
> & {
  authAttempted?: boolean;
  authSuccess?: boolean;
  authMode?: string;
  authError?: string;
};

export function buildGerarCasoTestePrompt(
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
    if (pageContext?.authAttempted) {
      authContextLines.push(
        pageContext.authSuccess
          ? `- Autenticação no site alvo: sucesso (modo ${pageContext.authMode ?? 'auto'})`
          : `- Autenticação no site alvo: falhou${pageContext.authError ? ` (${pageContext.authError})` : ''}`,
      );
    }
  }

  const authInstructions = pageContext?.authSuccess
    ? `
ÁREA AUTENTICADA
O conteúdo da página abaixo foi obtido após login no sistema alvo. Inclua uma Suite de Autenticação (login, logout, senha incorreta, campos obrigatórios) e Suites para os módulos internos visíveis nesse conteúdo.
`
    : auth?.loginUrl?.trim()
      ? `
AUTENTICAÇÃO
Foi solicitado login no sistema alvo, mas o conteúdo autenticado não pôde ser carregado. Ainda assim, gere casos de teste de autenticação com base no contexto disponível (código, imagens, notas).
`
      : '';

  const passwordRule = `
SEGURANÇA NOS CASOS DE TESTE
Nunca inclua senhas reais nos casos CSV. Use placeholders genéricos (ex.: usuario_valido, senha_incorreta, senha_valida).
`;

  const codeBlock =
    files.length === 0
      ? '(nenhum arquivo de código enviado)'
      : files
          .map(f => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
          .join('\n\n');

  return `OBJETIVO:
Gerar casos de teste funcionais estruturados para importação direta no Qase.io no formato CSV.

Os testes devem ser organizados hierarquicamente em:
- Suites (módulos ou áreas principais do sistema)
- SubSuites (quando necessário)
- Casos de Teste

Cada caso deve conter: Título, Descrição, Pré-condição, Passos e Resultado Esperado.

IMPORTANTE:
Os testes devem ter linguagem simples, clara, natural e funcional, como se fossem escritos por um QA funcional experiente. Foque no comportamento do usuário e nas regras de negócio.

DIRETRIZES DE ESCRITA
- Escreva de forma objetiva e com linguagem natural
- Sem excesso técnico
- Foco no usuário final, regras de negócio e funcionalidade
- Use português do Brasil

NÃO GERAR TESTES TÉCNICOS
Não inclua testes de HTML, CSS, JavaScript, API, banco de dados, performance, console, etc.

PRIORIZAR TESTES FUNCIONAIS
Priorize: fluxos principais, navegação, cadastros, validações visíveis, mensagens de erro, permissões, relatórios e autenticação.

ANÁLISE DINÂMICA DO SISTEMA
Faça uma análise completa do site/sistema fornecido. Identifique por conta própria os módulos, telas, menus, formulários, fluxos e regras de negócio. Não force módulos pré-definidos. Adapte ao tipo real do sistema (landing page, sistema financeiro, e-commerce, dashboard, etc.).

ORGANIZAÇÃO DOS TESTES
- Cada módulo principal vira uma Suite
- Use SubSuite quando houver fluxos diferentes dentro do mesmo módulo
- Ordene os casos por Suite → SubSuite
- Evite uma única suite para todo o sistema

FORMATO DE SAÍDA — CSV QASE (OBRIGATÓRIO)
Retorne APENAS o conteúdo do CSV, sem nenhuma frase, explicação, markdown ou código antes/depois.

O CSV deve ter exatamente estas colunas nesta ordem:
${AI_QASE_CSV_HEADER}

Regras do CSV:
- Use vírgula (,) como separador
- O campo "Steps" deve vir formatado assim:
  1. Ação que o usuário realiza
  Resultado esperado: O que deve acontecer na tela

  2. Próxima ação...
- Máximo 7 passos por caso
- Priority: apenas low, medium ou high
- Tags: separadas por ponto e vírgula (ex: happy-path;validacao)
- Suite e Subsuite são obrigatórios
- Todo o texto em português (Brasil)

COBERTURA MÍNIMA
- Site simples/landing: mínimo 15-25 casos
- Sistema com funcionalidades: mínimo 3 casos por módulo principal (feliz + negativos)
- Dê boa cobertura para fluxos críticos (login, cadastro, etc.)
${passwordRule}
${authInstructions}
VALIDAÇÕES FINAIS
- Garanta que cada caso tenha pelo menos 1 passo completo
- Remova qualquer conteúdo técnico
- Prioridades válidas
- Agrupamento correto por Suite/Subsuite

---

## CONTEXTO DESTA EXECUÇÃO (use apenas para análise — não cite detalhes técnicos nos casos)

- Path do sistema (URL, módulo ou rota): ${systemPath}
- Caminho raiz do código fonte: ${sourceLabel}
- Arquivos de código incluídos: ${files.length}${truncated ? ' (lista truncada por limite de tamanho)' : ''}
- Imagens anexadas (prints/diagramas): ${imageCount}
${pageContext?.fetched ? `- Conteúdo da página (URL) incluído abaixo${pageContext.truncated ? ' (truncado)' : ''}` : pageContext?.fetchError ? `- Aviso: não foi possível buscar a URL (${pageContext.fetchError})` : ''}
${authContextLines.length ? authContextLines.join('\n') : ''}
${extra ? `\n- Notas adicionais do usuário:\n${extra}` : ''}

${pageContext?.fetched && pageContext.content ? `## Conteúdo observado na página (referência de negócio)\n${pageContext.content}\n\n` : ''}## Código fonte (referência de negócio — não citar tecnicamente nos casos)
${codeBlock}

---

Lembrete final: a primeira linha da resposta deve ser exatamente o cabeçalho ${AI_QASE_CSV_HEADER}. Retorne somente o CSV.`;
}
