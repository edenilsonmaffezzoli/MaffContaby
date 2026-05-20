import type { GerarCasoTesteRequest, SourceFileInput } from '../types/gerar-caso-teste';

const QASE_CSV_HEADER =
  'title,description,preconditions,priority,tags/tag/0,tags/tag/1,tags/tag/2,tags/tag/3,steps/step/0/action,steps/step/0/expected_result,steps/step/1/action,steps/step/1/expected_result,steps/step/2/action,steps/step/2/expected_result,steps/step/3/action,steps/step/3/expected_result,steps/step/4/action,steps/step/4/expected_result,steps/step/5/action,steps/step/5/expected_result,steps/step/6/action,steps/step/6/expected_result,tags/tag/4';

export function buildGerarCasoTestePrompt(
  request: GerarCasoTesteRequest,
  files: SourceFileInput[],
  truncated: boolean,
  imageCount: number,
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

## ORGANIZAÇÃO DOS TESTES

Organize os casos em Suites e SubSuites (campos suite e subsuite no JSON).

Evite: duplicidade, cenários repetidos, casos excessivamente técnicos, cenários genéricos demais.

Use nomes profissionais e padronizados.

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

A aplicação converterá sua resposta em CSV para importação no Qase (Source: Qase.io → CSV).

Cada caso no JSON será mapeado para uma linha com estas colunas (máx. 7 passos e 5 tags por caso):
${QASE_CSV_HEADER}

Regras do CSV:
- priority: apenas low, medium ou high (nunca critical)
- tags: slugs curtos em minúsculas, sem espaços (use hífen), ex.: login, formulario, happy-path
- tags/tag/0 e tags/tag/1: reserve para suite e subsuite (slug da suite e da subsuite)
- até 7 pares action + expected_result por caso
- title, description e preconditions obrigatórios e em português (Brasil)

---

## ENTREGAS (no JSON e no markdown)

Além dos casos, inclua no markdown um resumo com:
- módulos encontrados
- quantidade de casos criados
- funcionalidades identificadas
- funcionalidades sem cobertura suficiente
- possíveis riscos encontrados

Se o sistema for grande, agrupe casos por suite/subsuite no markdown.

---

## VALIDAÇÕES FINAIS

Antes de finalizar:
- garantir linguagem funcional e simples
- remover conteúdo excessivamente técnico
- cada caso com ao menos 1 passo completo (action + expected_result)
- prioridades válidas (low, medium, high)
- no máximo 7 passos por caso

---

## CONTEXTO DESTA EXECUÇÃO

- Path do sistema (módulo/rota/feature): ${systemPath}
- Caminho raiz do código fonte: ${sourceLabel}
- Arquivos de código incluídos: ${files.length}${truncated ? ' (lista truncada por limite de tamanho)' : ''}
- Imagens anexadas (prints/diagramas): ${imageCount}
${extra ? `\n- Notas adicionais do usuário:\n${extra}` : ''}

## Código fonte (referência de negócio — não citar tecnicamente nos casos)
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
