import type { GerarCasoTesteRequest, SourceFileInput } from '../types/gerar-caso-teste';

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

  return `Você é um especialista em QA e testes manuais/automatizados. Gere casos de teste completos para importação no Qase.io (formato classic: action + expected_result por passo).

## Contexto
- Path do sistema (módulo/rota/feature): ${systemPath}
- Caminho raiz do código fonte: ${sourceLabel}
- Arquivos de código incluídos: ${files.length}${truncated ? ' (lista truncada por limite de tamanho)' : ''}
- Imagens anexadas (prints/diagramas): ${imageCount}
${extra ? `\n## Notas adicionais do usuário\n${extra}` : ''}

## Código fonte
${codeBlock}

## Instruções
1. Analise o código e as imagens (se houver) para entender fluxos, validações, permissões e cenários de borda.
2. Produza vários casos de teste quando fizer sentido: feliz, negativo, borda, segurança básica, usabilidade relevante.
3. Cada caso deve ter: title (obrigatório), description, preconditions, steps[] com action e expected_result claros em português (Brasil).
4. Passos devem ser executáveis por um tester humano (não apenas "verificar código").
5. O campo markdown deve ser um documento legível em PT-BR com seções por caso (# título, descrição, pré-condições, passos numerados).

## Formato de saída (JSON estrito, sem markdown fence)
Retorne APENAS um objeto JSON válido com esta estrutura:
{
  "markdown": "string — documento completo em markdown",
  "cases": [
    {
      "title": "string",
      "description": "string opcional",
      "preconditions": "string opcional",
      "priority": "low|medium|high|critical opcional",
      "severity": "minor|normal|major|critical|blocker opcional",
      "tags": ["string"],
      "steps": [
        { "action": "string", "expected_result": "string", "data": "string opcional" }
      ]
    }
  ]
}

Regras do JSON:
- Mínimo 1 caso; cada caso com pelo menos 1 step.
- Não inclua comentários nem texto fora do JSON.`;
}
