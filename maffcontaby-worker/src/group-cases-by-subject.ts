import type { QaseCase } from './types/gerar-caso-teste';

export type GroupCasesResult = {
  cases: QaseCase[];
  suitesUsed: string[];
  groupingWarning?: string;
};

const SUBJECT_RULES: Array<{ suite: string; patterns: RegExp[] }> = [
  {
    suite: 'Navegação',
    patterns: [/menu/i, /naveg/i, /página inicial/i, /pagina inicial/i, /home/i, /header/i, /rodapé/i],
  },
  {
    suite: 'Conteúdo e serviços',
    patterns: [/sobre nós/i, /serviço/i, /casamento/i, /aniversário/i, /evento/i, /galeria/i, /depoimento/i],
  },
  {
    suite: 'Formulário de contato',
    patterns: [/formulário/i, /formulario/i, /contato/i, /envio/i, /e-mail/i, /email/i, /mensagem/i, /nome/i],
  },
  {
    suite: 'Autenticação',
    patterns: [/login/i, /senha/i, /logout/i, /sessão/i, /autentic/i],
  },
  {
    suite: 'Cadastros',
    patterns: [/cadastr/i, /editar/i, /excluir/i, /crud/i, /salvar/i],
  },
];

function inferSuiteFromText(text: string, modulos: string[]): string | null {
  const lower = text.toLowerCase();
  for (const rule of SUBJECT_RULES) {
    if (rule.patterns.some(p => p.test(lower))) return rule.suite;
  }
  for (const mod of modulos) {
    if (mod.length >= 3 && lower.includes(mod.toLowerCase())) return mod;
  }
  return null;
}

function inferSubsuite(c: QaseCase): string | undefined {
  if (c.subsuite?.trim()) return c.subsuite.trim();
  const text = `${c.title} ${c.description ?? ''}`;
  if (/inválid|invalido|erro|negativ/i.test(text)) return 'Cenários negativos';
  if (/válid|valido|sucesso|positiv/i.test(text)) return 'Cenários positivos';
  return undefined;
}

function compareCases(a: QaseCase, b: QaseCase): number {
  const sa = (a.suite ?? '').localeCompare(b.suite ?? '', 'pt-BR');
  if (sa !== 0) return sa;
  const sb = (a.subsuite ?? '').localeCompare(b.subsuite ?? '', 'pt-BR');
  if (sb !== 0) return sb;
  return a.title.localeCompare(b.title, 'pt-BR');
}

/** Agrupa casos por assunto (suite/subsuite), infere quando ausente e ordena para export Qase. */
export function groupCasesBySubject(cases: QaseCase[], modulos: string[] = []): GroupCasesResult {
  const modulosClean = modulos.map(m => m.trim()).filter(Boolean);
  let groupingWarning: string | undefined;

  const enriched = cases.map(c => {
    let suite = c.suite?.trim() || '';
    if (!suite) {
      suite =
        inferSuiteFromText(`${c.title} ${c.description ?? ''} ${c.preconditions ?? ''}`, modulosClean) ??
        'Geral';
    }
    const subsuite = inferSubsuite({ ...c, suite });
    return { ...c, suite, subsuite };
  });

  const distinctSuites = new Set(enriched.map(c => c.suite));
  if (enriched.length >= 6 && distinctSuites.size < 2) {
    groupingWarning =
      'Casos reagrupados automaticamente por assunto (a IA retornou poucas suites distintas).';
    for (const c of enriched) {
      c.suite =
        inferSuiteFromText(`${c.title} ${c.description ?? ''} ${c.preconditions ?? ''}`, modulosClean) ??
        c.suite ??
        'Geral';
      c.subsuite = inferSubsuite(c);
    }
  }

  const sorted = [...enriched].sort(compareCases);
  const suitesUsed = [...new Set(sorted.map(c => c.suite).filter(Boolean))] as string[];

  return { cases: sorted, suitesUsed, groupingWarning };
}
