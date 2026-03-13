import type { AxiosInstance } from 'axios';
import * as XLSX from '@e965/xlsx';

export interface ImportResult {
  entriesInserted: number;
  assetsInserted: number;
}

export type DbSnapshotV1 = {
  version: 1;
  updatedAt: string;
  people: { id: string; name: string }[];
  assets: {
    id: string;
    name: string;
    saldo: number;
    disponivelImediatamente: boolean;
    asOfDate: string | null;
    observacao: string | null;
  }[];
  entries: {
    id: string;
    personId: string;
    competencia: string;
    grupo: string;
    // FIX Bug 2: preserva múltiplos valores por linha (parcelas separadas)
    // em vez de somar tudo num único número
    valores: number[];
    observacao: string | null;
    data: string | null;
  }[];
};

export async function importContabilidade(httpClient: AxiosInstance, replaceAll: boolean) {
  const { data } = await httpClient.post<ImportResult>('/api/import/contabilidade', null, {
    params: { replaceAll },
  });
  return data;
}

export async function importContabilidadeSnapshot(
  httpClient: AxiosInstance,
  snapshot: DbSnapshotV1,
  replaceAll: boolean
) {
  const { data } = await httpClient.post<ImportResult>('/api/import/contabilidade', snapshot, {
    params: { replaceAll },
    headers: { 'Content-Type': 'application/json' },
  });
  return data;
}

export async function importContabilidadeFile(
  httpClient: AxiosInstance,
  file: File,
  replaceAll: boolean
) {
  const formData = new FormData();
  formData.append('file', file);

  const { data } = await httpClient.post<ImportResult>('/api/import/contabilidade', formData, {
    params: { replaceAll },
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function exportContabilidade(httpClient: AxiosInstance) {
  const { data } = await httpClient.get<Blob>('/api/export/contabilidade', {
    responseType: 'blob',
  });
  return data;
}

export class ContabilidadePlanilha {
  private static readonly monthMap: Record<string, number> = {
    jan: 1,
    fev: 2,
    mar: 3,
    abr: 4,
    mai: 5,
    jun: 6,
    jul: 7,
    ago: 8,
    set: 9,
    out: 10,
    nov: 11,
    dez: 12,
  };

  static async parseXlsxToSnapshot(file: File): Promise<DbSnapshotV1> {
    const bytes = await file.arrayBuffer();
    const wb = XLSX.read(bytes, { type: 'array', cellDates: true });
    return this.buildSnapshotFromWorkbook(wb);
  }

  static snapshotToXlsxBlob(snapshot: DbSnapshotV1) {
    const wb = this.snapshotToWorkbook(snapshot);
    const bytes = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellDates: true });
    return new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  private static stripDiacritics(value: string) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  private static pad2(value: number) {
    return String(value).padStart(2, '0');
  }

  private static normalizeCompetenciaDate(value: string) {
    const v = value.trim();
    if (/^\d{4}-\d{2}$/.test(v)) return `${v}-01`;
    return v;
  }

  private static tryParseCompetencia(text: string) {
    const raw = text.trim();
    if (!raw) return null;

    if (/^\d{4}-\d{2}(-\d{2})?$/.test(raw)) {
      const [y, m] = raw.split('-');
      const year = Number(y);
      const month = Number(m);
      if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
      return `${year}-${this.pad2(month)}-01`;
    }

    const parts = raw.split('/').map(p => p.trim()).filter(Boolean);
    if (parts.length !== 2) return null;

    const monthText = this.stripDiacritics(parts[0].replace(/\.$/, '').toLowerCase());
    const month = this.monthMap[monthText];
    if (!month) return null;

    let year = Number(parts[1]);
    if (!Number.isFinite(year)) return null;
    if (year < 100) year += 2000;
    if (year < 1900 || year > 2200) return null;

    return `${year}-${this.pad2(month)}-01`;
  }

  private static getCell(ws: XLSX.WorkSheet, r: number, c: number) {
    const addr = XLSX.utils.encode_cell({ r, c });
    return ws[addr] as XLSX.CellObject | undefined;
  }

  private static getCellText(cell: XLSX.CellObject | undefined) {
    if (!cell) return '';
    const anyCell = cell as unknown as { w?: unknown; v?: unknown };
    if (typeof anyCell.w === 'string') return anyCell.w.trim();
    if (anyCell.w != null) return String(anyCell.w).trim();
    if (anyCell.v == null) return '';
    return String(anyCell.v).trim();
  }

  private static tryReadCompetencia(cell: XLSX.CellObject | undefined) {
    if (!cell) return null;
    const anyCell = cell as unknown as { t?: unknown; v?: unknown };
    if (anyCell.t === 'd' && anyCell.v instanceof Date && Number.isFinite(anyCell.v.getTime())) {
      const year = anyCell.v.getUTCFullYear();
      const month = anyCell.v.getUTCMonth() + 1;
      return `${year}-${this.pad2(month)}-01`;
    }
    const text = this.getCellText(cell);
    return this.tryParseCompetencia(text);
  }

  private static tryGetNumber(cell: XLSX.CellObject | undefined) {
    if (!cell) return null;
    const anyCell = cell as unknown as { t?: unknown; v?: unknown };
    if (anyCell.t === 'n' && typeof anyCell.v === 'number' && Number.isFinite(anyCell.v)) return anyCell.v;

    const raw = this.getCellText(cell);
    if (!raw) return null;

    const withoutCurrency = raw.replace(/r\$\s*/i, '').trim();
    if (!withoutCurrency) return null;

    const hasComma = withoutCurrency.includes(',');
    const hasDot = withoutCurrency.includes('.');

    let normalized = withoutCurrency;
    if (hasComma) {
      normalized = normalized.replace(/\./g, '').replace(/,/g, '.');
    } else if (hasDot && /^\d{1,3}(\.\d{3})+$/.test(normalized)) {
      normalized = normalized.replace(/\./g, '');
    }

    const n = Number(normalized);
    if (!Number.isFinite(n)) return null;
    return n;
  }

  private static findLastNonEmptyCol(ws: XLSX.WorkSheet, r: number, startCol: number, endCol: number) {
    for (let c = endCol; c >= startCol; c--) {
      const cell = this.getCell(ws, r, c);
      const text = this.getCellText(cell);
      if (text) return c;
      const anyCell = cell as unknown as { v?: unknown };
      if (anyCell?.v != null && String(anyCell.v).trim()) return c;
    }
    return startCol - 1;
  }

  private static buildSnapshotFromWorkbook(wb: XLSX.WorkBook): DbSnapshotV1 {
    const peopleByName = new Map<string, { id: string; name: string }>();
    const assetsByName = new Map<
      string,
      {
        id: string;
        name: string;
        saldo: number;
        disponivelImediatamente: boolean;
        asOfDate: string | null;
        observacao: string | null;
      }
    >();
    const entries: DbSnapshotV1['entries'] = [];

    const getOrCreatePerson = (name: string) => {
      const key = name.toLowerCase();
      const existing = peopleByName.get(key);
      if (existing) return existing;
      const created = { id: crypto.randomUUID(), name };
      peopleByName.set(key, created);
      return created;
    };

    const sheetNames = wb.SheetNames ?? [];
    for (const sheetName of sheetNames) {
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;

      const name = sheetName.trim();
      if (!name) continue;

      const normalized = this.stripDiacritics(name).toLowerCase();
      const isFinancas = normalized === 'financas';

      const ref = ws['!ref'];
      if (!ref) continue;
      const range = XLSX.utils.decode_range(ref);

      if (isFinancas) {
        for (let r = range.s.r; r <= range.e.r; r++) {
          const assetName = this.getCellText(this.getCell(ws, r, range.s.c)).trim();
          if (!assetName) continue;
          // FIX Bug 1: para na linha "SOMAS:" exatamente como o parser espera
          if (assetName.toLowerCase() === 'somas:') break;
          if (assetName.toLowerCase() === 'total') continue;

          const saldo = this.tryGetNumber(this.getCell(ws, r, range.s.c + 1));
          if (saldo == null) continue;

          const key = assetName.toLowerCase();
          const existing = assetsByName.get(key);
          if (existing) {
            existing.saldo = saldo;
          } else {
            assetsByName.set(key, {
              id: crypto.randomUUID(),
              name: assetName,
              saldo,
              disponivelImediatamente: true,
              asOfDate: null,
              observacao: null,
            });
          }
        }
        continue;
      }

      const person = getOrCreatePerson(name);

      let hasRowCompetencia = false;
      for (let r = range.s.r; r <= range.e.r; r++) {
        const comp = this.tryReadCompetencia(this.getCell(ws, r, range.s.c));
        if (comp) {
          hasRowCompetencia = true;
          break;
        }
      }

      if (hasRowCompetencia) {
        let competencia: string | null = null;
        for (let r = range.s.r; r <= range.e.r; r++) {
          const labelCell = this.getCell(ws, r, range.s.c);
          const parsedComp = this.tryReadCompetencia(labelCell);
          if (parsedComp) {
            competencia = parsedComp;
            continue;
          }

          if (!competencia) continue;
          const label = this.getCellText(labelCell).trim();
          if (!label) continue;
          if (label.toLowerCase() === 'total') continue;

          const lastCol = this.findLastNonEmptyCol(ws, r, range.s.c + 1, range.e.c);
          if (lastCol < range.s.c + 1) continue;

          // FIX Bug 2: coleta cada valor individualmente em vez de somar
          const valores: number[] = [];
          for (let c = range.s.c + 1; c <= lastCol; c++) {
            const value = this.tryGetNumber(this.getCell(ws, r, c));
            if (value != null && value !== 0) {
              valores.push(value);
            }
          }

          if (valores.length === 0) continue;

          entries.push({
            id: crypto.randomUUID(),
            personId: person.id,
            competencia: this.normalizeCompetenciaDate(competencia),
            grupo: label,
            valores,
            observacao: null,
            data: null,
          });
        }
      } else {
        const headerRow = range.s.r;
        const lastHeaderCol = this.findLastNonEmptyCol(ws, headerRow, range.s.c + 1, range.e.c);
        if (lastHeaderCol < range.s.c + 1) continue;

        const colCompetencias = new Map<number, string>();
        for (let c = range.s.c + 1; c <= lastHeaderCol; c++) {
          const headerText = this.getCellText(this.getCell(ws, headerRow, c));
          const comp = this.tryParseCompetencia(headerText);
          if (comp) colCompetencias.set(c, comp);
        }

        if (colCompetencias.size === 0) continue;

        for (let r = headerRow + 1; r <= range.e.r; r++) {
          const label = this.getCellText(this.getCell(ws, r, range.s.c)).trim();
          if (!label) continue;
          if (label.toLowerCase() === 'total') continue;

          for (const [c, comp] of colCompetencias.entries()) {
            const value = this.tryGetNumber(this.getCell(ws, r, c));
            if (value == null || value === 0) continue;
            entries.push({
              id: crypto.randomUUID(),
              personId: person.id,
              competencia: this.normalizeCompetenciaDate(comp),
              grupo: label,
              // FIX Bug 2: mesmo no layout de colunas, usa o array valores
              valores: [value],
              observacao: null,
              data: null,
            });
          }
        }
      }
    }

    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      people: Array.from(peopleByName.values()),
      assets: Array.from(assetsByName.values()),
      entries,
    };
  }

  private static sanitizeSheetName(name: string) {
    const trimmed = name.trim();
    const invalid = new Set(['[', ']', ':', '*', '?', '/', '\\', "'"]);
    const stripped = Array.from(trimmed)
      .filter(ch => !invalid.has(ch))
      .join('')
      .trim();
    const safe = stripped || 'Planilha';
    return safe.length > 31 ? safe.slice(0, 31) : safe;
  }

  private static tryParseIsoDate(value: string | null | undefined) {
    const v = value?.trim();
    if (!v) return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return new Date(Date.UTC(year, month - 1, day));
  }

  private static setCellFormat(ws: XLSX.WorkSheet, r1: number, c1: number, z: string) {
    const addr = XLSX.utils.encode_cell({ r: r1 - 1, c: c1 - 1 });
    const cell = ws[addr] as XLSX.CellObject | undefined;
    if (!cell) return;
    (cell as unknown as { z?: string }).z = z;
  }

  private static formatCompetenciaLabel(competencia: string) {
    const match = /^(\d{4})-(\d{2})/.exec(competencia.trim());
    if (!match) return competencia;
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return competencia;

    const monthText =
      (Object.keys(this.monthMap) as Array<keyof typeof ContabilidadePlanilha.monthMap>).find(
        k => this.monthMap[k] === month
      ) ?? 'jan';
    // FIX Bug 4: usa formato [$-416]mmm/yy compatível com o arquivo original
    // O label aqui é o texto da célula (ex: "mar/13"), o formato da célula
    // deve ser [$-416]mmm/yy para datas, ou retornar o texto diretamente.
    return `${monthText}/${this.pad2(year % 100)}`;
  }

  private static snapshotToWorkbook(snapshot: DbSnapshotV1) {
    const wb = XLSX.utils.book_new();

    const people = [...snapshot.people].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    const entries = [...snapshot.entries].sort((a, b) => {
      const c = a.competencia.localeCompare(b.competencia);
      if (c !== 0) return c;
      const g = a.grupo.localeCompare(b.grupo, 'pt-BR');
      if (g !== 0) return g;
      return a.id.localeCompare(b.id);
    });

    const totalSaldo = snapshot.assets.reduce((sum, a) => sum + a.saldo, 0);
    const totalDisponivel = snapshot.assets.reduce((sum, a) => sum + (a.disponivelImediatamente ? a.saldo : 0), 0);

    // Aba Resumo
    {
      const ws = XLSX.utils.aoa_to_sheet([
        ['MaffContaby - Exportação'],
        ['Atualizado em', this.tryParseIsoDate(snapshot.updatedAt) ?? snapshot.updatedAt],
        ['Pessoas', people.length],
        ['Lançamentos', snapshot.entries.length],
        ['Ativos', snapshot.assets.length],
        ['Saldo total', totalSaldo],
        ['Saldo disponível', totalDisponivel],
      ]);
      ws['!cols'] = [{ wch: 22 }, { wch: 28 }];
      // FIX Bug 4: formato de data sem hora, alinhado ao padrão do arquivo
      this.setCellFormat(ws, 2, 2, 'dd/mm/yyyy');
      // FIX Bug 5: usa formato monetário com locale pt-BR [$R$ -416]
      this.setCellFormat(ws, 6, 2, '[$R$ -416]#,##0.00');
      this.setCellFormat(ws, 7, 2, '[$R$ -416]#,##0.00');
      XLSX.utils.book_append_sheet(wb, ws, 'Resumo');
    }

    // Abas por pessoa — reproduz estrutura original: competência em linha A,
    // grupo na linha seguinte, valores em B, C, D... (múltiplas colunas)
    for (const person of people) {
      const personEntries = entries.filter(e => e.personId === person.id);

      // Agrupa por competência para manter o layout original:
      // - linha com a data (competência) formatada
      // - linhas de grupo com valores distribuídos por coluna
      // - linha Total
      const competencias = Array.from(new Set(personEntries.map(e => e.competencia))).sort((a, b) =>
        a.localeCompare(b)
      );

      const rows: Array<Array<unknown>> = [];

      for (const comp of competencias) {
        const compEntries = personEntries.filter(e => e.competencia === comp);
        const compDate = this.tryParseIsoDate(comp);

        // FIX Bug 4: célula de competência como Date para aplicar formato [$-416]mmm/yy
        const compRow: Array<unknown> = [compDate ?? this.formatCompetenciaLabel(comp)];
        rows.push(compRow);

        // Determina o número máximo de colunas de valor nesta competência
        const maxCols = compEntries.reduce((max, e) => Math.max(max, e.valores.length), 0);

        // Total por coluna para a linha Total
        const colTotals: number[] = Array(maxCols).fill(0);

        for (const entry of compEntries) {
          const row: Array<unknown> = [entry.grupo];
          for (let i = 0; i < entry.valores.length; i++) {
            row.push(entry.valores[i]);
            colTotals[i] = (colTotals[i] ?? 0) + entry.valores[i];
          }
          rows.push(row);
        }

        // Linha Total da competência
        const totalRow: Array<unknown> = ['Total'];
        // FIX Bug 2: soma dos primeiros valores de cada entrada (coluna B)
        const totalB = compEntries.reduce((sum, e) => sum + (e.valores[0] ?? 0), 0);
        totalRow.push(totalB);
        rows.push(totalRow);

        // Linha vazia entre competências
        rows.push([]);
      }

      const ws = XLSX.utils.aoa_to_sheet(rows, { cellDates: true });

      // Largura das colunas: coluna A mais larga, demais padrão
      const maxDataCols = personEntries.reduce((max, e) => Math.max(max, e.valores.length), 1);
      ws['!cols'] = [{ wch: 22 }, ...Array(maxDataCols).fill({ wch: 12 })];

      // FIX Bug 4: aplica formato [$-416]mmm/yy nas células de competência (tipo Date)
      // e formato monetário nas células numéricas
      let rowIdx = 0;
      for (const comp of competencias) {
        const compEntries = personEntries.filter(e => e.competencia === comp);
        // Linha da competência: formata como data pt-BR
        this.setCellFormat(ws, rowIdx + 1, 1, '[$-416]mmm/yy');
        rowIdx++;

        for (const entry of compEntries) {
          // Células de valor: formato monetário com locale
          for (let c = 0; c < entry.valores.length; c++) {
            // FIX Bug 5: formato [$R$ -416]#,##0.00
            this.setCellFormat(ws, rowIdx + 1, c + 2, '[$R$ -416]#,##0.00');
          }
          rowIdx++;
        }

        // Linha Total
        this.setCellFormat(ws, rowIdx + 1, 2, '[$R$ -416]#,##0.00');
        rowIdx++;

        // Linha vazia
        rowIdx++;
      }

      // FIX Bug 3: autoFilter sem o -1 incorreto
      // Não aplicar autoFilter em abas de pessoa pois o arquivo original não usa
      // (apenas a aba Finanças não tem autoFilter no formato simples)

      XLSX.utils.book_append_sheet(wb, ws, this.sanitizeSheetName(person.name));
    }

    // FIX Bug 1 e Bug 6: aba "Finanças" reproduz estrutura original do arquivo:
    // coluna A = nome do ativo, coluna B = saldo (formato BRL)
    // linha em branco, depois "SOMAS:" com fórmulas de totais parciais
    {
      const assets = [...snapshot.assets].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

      const finRows: Array<Array<unknown>> = [];

      for (const a of assets) {
        finRows.push([a.name, a.saldo]);
      }

      // Linha em branco + seção SOMAS (compatível com o parser que para em "SOMAS:")
      finRows.push([]);
      finRows.push([]);
      finRows.push(['SOMAS:']);
      finRows.push([]);
      // Linha de total (equivalente à linha "Total" do arquivo original)
      finRows.push(['Total', null]);

      const finWs = XLSX.utils.aoa_to_sheet(finRows, { cellDates: true });
      finWs['!cols'] = [{ wch: 28 }, { wch: 16 }];

      // FIX Bug 5: formato monetário com locale pt-BR em todas as células de saldo
      for (let r = 1; r <= assets.length; r++) {
        this.setCellFormat(finWs, r, 2, '[$R$ -416]#,##0.00');
      }

      // Fórmula de total na última linha
      if (assets.length > 0) {
        const totalRowIdx = finRows.length; // 1-indexed
        const totalAddr = XLSX.utils.encode_cell({ r: totalRowIdx - 1, c: 1 });
        finWs[totalAddr] = {
          t: 'n',
          f: `SUM(B1:B${assets.length})`,
        } as XLSX.CellObject;
        this.setCellFormat(finWs, totalRowIdx, 2, '[$R$ -416]#,##0.00');
      }

      XLSX.utils.book_append_sheet(wb, finWs, 'Finanças');
    }

    return wb;
  }
}
