export function formatCurrencyBRL(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

/** Converte texto digitado em pt-BR (ex.: "2,5", "1.234,56") para número. */
export function parseDecimalBRL(input: string): number | null {
  let s = input.trim().replace(/[R$\s]/gi, '');
  if (!s) return null;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (lastComma > -1) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > -1) {
    const afterDot = s.length - lastDot - 1;
    if (afterDot === 3 && s.indexOf('.') === lastDot) {
      s = s.replace(/\./g, '');
    }
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function formatCompetencia(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function formatCompetenciaLabel(competencia: string) {
  const match = competencia.trim().match(/^(\d{4})-(\d{2})/);
  if (!match) return competencia;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(date);
}

export function competenciaToDateOnly(competencia: string) {
  const v = competencia.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return `${v}-01`;
}
