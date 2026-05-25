import type { FetchedPageContext } from '../fetch-system-url';
import type { GerarCasoTesteRequest, SourceFileInput } from '../types/gerar-caso-teste';

export type PageContextForPrompt = Pick<
  FetchedPageContext,
  'content' | 'fetched' | 'truncated' | 'fetchError'
>;

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

  const codeBlock =
    files.length === 0
      ? '(nenhum arquivo de código enviado)'
      : files
          .map(f => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
          .join('\n\n');

  return `OBJETIVO:
Gerar casos de teste funcionais estruturados para importação no Qase.io.

Os testes devem ser organizados em:
- Suites
- SubSuites (quando necessário)
- Casos de Teste

Cada caso de teste deve conter:
- Título
- Descrição
- Pré-condição
- Passos/Ações
- Resultado Esperado

IMPORTANTE:
Os testes devem possuir linguagem simples, clara e funcional.

O objetivo é que QA funcional, Product Owner, Analista de negócio, Usuário-chave e Cliente consigam entender facilmente os cenários.

---

## DIRETRIZES DE ESCRITA

Escreva os casos:
- de forma objetiva
- com linguagem natural
- sem excesso técnico
- com foco no comportamento do usuário
- com foco em regras de negócio
- com foco funcional

Os testes devem parecer escritos por um QA funcional experiente.

NÃO utilizar:
- termos técnicos complexos
- linguagem de desenvolvimento
- termos de infraestrutura
- detalhes internos do sistema

---

## NÃO GERAR TESTES TÉCNICOS

NÃO gerar testes relacionados a:
- inspeção HTML, DOM, CSS, JavaScript, console do navegador
- XPath, seletores, IDs técnicos, classes CSS
- eventos internos frontend, logs internos
- deploy, infraestrutura, pipeline
- testes unitários, arquitetura, framework
- inspeção de requests, testes técnicos de API
- validações internas de banco, performance técnica, testes de código

---

## PRIORIZAR TESTES FUNCIONAIS

Priorizar:
- fluxo principal, comportamento do usuário, regras de negócio
- navegação, preenchimento de campos, validações visíveis, mensagens exibidas
- permissões funcionais, persistência das informações
- cenários positivos e negativos simples, usabilidade básica
- CRUDs, filtros, pesquisas, relatórios, autenticação, integrações funcionais

---

## ANÁLISE DO SISTEMA

Faça análise completa do sistema: telas, menus, módulos, funcionalidades, regras de negócio, fluxos, permissões, integrações, formulários, cadastros, relatórios, mensagens e autenticação.

Identifique automaticamente os módulos do sistema (ex.: Login, Usuários, Clientes, Eventos, Financeiro, Agenda, Relatórios, Configurações).

Use código-fonte e imagens anexadas apenas como referência para entender o negócio — não cite detalhes técnicos de implementação nos casos.

---

## ORGANIZAÇÃO DOS TESTES (OBRIGATÓRIO — NÃO LINEAR)

NÃO gere uma lista única sequencial (CT001, CT002…) sem mudar de suite. Cada assunto/módulo do sistema deve ter sua própria suite.

- Preencha **suite** (assunto/módulo) e **subsuite** (fluxo dentro do módulo) em CADA caso do JSON.
- Ordene o array **cases[]** agrupado: todos os casos da mesma suite/subsuite juntos, depois o próximo assunto.
- O assunto deve estar em **suite**, não repetido no título (evite títulos genéricos iguais).
- Use **subsuite** quando houver ≥ 3 casos no mesmo assunto com fluxos diferentes (ex.: positivo/negativo, menu vs rodapé).

Exemplo (site institucional):
- suite **Navegação** → casos de menu (Página inicial, Sobre, Serviços, Eventos, Contato)
- suite **Conteúdo e serviços** → Sobre Nós, listagem de serviços, detalhes, galeria, depoimentos
- suite **Formulário de contato** → envio válido, campos obrigatórios, e-mail inválido

Evite: duplicidade, cenários repetidos, casos excessivamente técnicos, uma única suite para todo o sistema.

Use nomes profissionais e padronizados em português (Brasil).

---

## PADRÃO DOS PASSOS

Estrutura simples por passo:
- action: o que o usuário faz (linguagem natural)
- expected_result: o que deve acontecer na tela/sistema

Exemplo:
- action: "Informar nome do cliente e clicar em Salvar"
- expected_result: "Cliente cadastrado com sucesso e mensagem de confirmação exibida"

NÃO ESCREVER: "Validar retorno HTTP 200 após persistência do payload"
ESCREVER: "Validar que o cadastro é salvo com sucesso"

NÃO ESCREVER: "Validar renderização do componente após evento onClick"
ESCREVER: "Ao clicar em Salvar, o sistema deve concluir o cadastro"

---

## FORMATO DE EXPORTAÇÃO — CSV QASE (não XML)

IMPORTANTE: o caso de teste não deve ser linear; deve seguir hierarquia suite → subsuite → casos.

A aplicação converterá sua resposta em CSV oficial Qase.io (v2) com pastas **suite** e **subsuite** no repositório.

Regras:
- **suite** e **subsuite** no JSON são obrigatórios para organização (não coloque o assunto só em tags).
- priority: apenas low, medium ou high (nunca critical)
- tags: apenas labels extras (slugs), ex.: happy-path, regressao — não substituem suite/subsuite
- até 7 passos por caso (action + expected_result)
- title, description e preconditions obrigatórios em português (Brasil)

---

## COBERTURA MÍNIMA (obrigatório)

- Identifique cada módulo/tela/menu relevante e crie casos específicos (evite um único caso genérico por módulo).
- Site institucional ou landing: procure **pelo menos 20 casos** cobrindo navegação, conteúdo, serviços, sobre, contato e rodapé.
- Sistema com login/CRUD: **pelo menos 3 casos por módulo principal** (fluxo feliz + validações visíveis simples).
- Fluxos críticos (login, contato, orçamento, salvar cadastro): **pelo menos 2 passos** por caso quando fizer sentido.
- Cada caso deve ter description e preconditions preenchidos (não repetir só o título).

## ENTREGAS (no JSON e no markdown)

O campo **analysis** no JSON deve listar módulos, funcionalidades, lacunas e riscos.

O campo **markdown** deve ser um **resumo executivo curto** (não replique todos os passos dos casos — eles já estão em cases[]):
- módulos encontrados
- quantidade de casos criados (igual ao tamanho de cases[])
- funcionalidades identificadas
- lacunas de cobertura
- riscos (bullets curtos)

Se o sistema for grande, no markdown agrupe apenas por suite/subsuite com títulos dos casos (sem copiar todos os passos).

---

## VALIDAÇÕES FINAIS

Antes de finalizar:
- garantir linguagem funcional e simples
- remover conteúdo excessivamente técnico
- cada caso com ao menos 1 passo completo (action + expected_result)
- prioridades válidas (low, medium, high)
- no máximo 7 passos por caso
- pelo menos 2 suites distintas quando houver 6 ou mais casos
- array cases[] ordenado por suite, depois subsuite, depois título

---

## CONTEXTO DESTA EXECUÇÃO

- Path do sistema (módulo/rota/feature): ${systemPath}
- Caminho raiz do código fonte: ${sourceLabel}
- Arquivos de código incluídos: ${files.length}${truncated ? ' (lista truncada por limite de tamanho)' : ''}
- Imagens anexadas (prints/diagramas): ${imageCount}
${pageContext?.fetched ? `- Conteúdo da página (URL) incluído abaixo${pageContext.truncated ? ' (truncado)' : ''}` : pageContext?.fetchError ? `- Aviso: não foi possível buscar a URL (${pageContext.fetchError})` : ''}
${extra ? `\n- Notas adicionais do usuário:\n${extra}` : ''}

${pageContext?.fetched && pageContext.content ? `## Conteúdo observado na página (referência de negócio)\n${pageContext.content}\n\n` : ''}## Código fonte (referência de negócio — não citar tecnicamente nos casos)
${codeBlock}

---

## FORMATO DE SAÍDA (JSON estrito, sem markdown fence)

Retorne APENAS um objeto JSON válido:

{
  "markdown": "string — documento completo em PT-BR: resumo executivo (módulos, totais, riscos, lacunas) e casos agrupados por suite/subsuite com passos numerados",
  "analysis": {
    "modulos": ["string"],
    "totalCasos": number,
    "funcionalidades": ["string"],
    "semCobertura": ["string"],
    "riscos": ["string"]
  },
  "cases": [
    {
      "suite": "string — nome da suite, ex.: Login",
      "subsuite": "string opcional — ex.: Recuperação de senha",
      "title": "string",
      "description": "string",
      "preconditions": "string",
      "priority": "low|medium|high",
      "tags": ["string — tags adicionais além de suite/subsuite, em slug"],
      "steps": [
        { "action": "string", "expected_result": "string" }
      ]
    }
  ]
}

Regras do JSON:
- Mínimo 1 caso; cada caso com pelo menos 1 step com action e expected_result preenchidos.
- Não inclua comentários nem texto fora do JSON.
- Não retorne XML nem CSV cru; apenas este JSON.`;
}
