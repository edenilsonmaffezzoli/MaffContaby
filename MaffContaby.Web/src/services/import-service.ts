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
    valor: number;
    observacao: string | null;
    data: string | null;
    slot?: number | null;
  }[];
  templates?: {
    people?: Record<
      string,
      {
        blocks: {
          competencia: string;
          labels: string[];
          valueColumns: number;
          totalLabel: string;
        }[];
      }
    >;
    financas?: {
      ref: string;
      cells: Record<string, { t?: string; v?: unknown; f?: string; z?: string }>;
    };
  };
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
    const templates: NonNullable<DbSnapshotV1['templates']> = {};
    const peopleTemplates: NonNullable<NonNullable<DbSnapshotV1['templates']>['people']> = {};

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
        {
          const cells: Record<string, { t?: string; v?: unknown; f?: string; z?: string }> = {};
          for (let r = range.s.r; r <= range.e.r; r++) {
            for (let c = range.s.c; c <= range.e.c; c++) {
              const addr = XLSX.utils.encode_cell({ r, c });
              const cell = ws[addr] as (XLSX.CellObject & { z?: string }) | undefined;
              if (!cell) continue;
              const anyCell = cell as unknown as { t?: string; v?: unknown; f?: string; z?: string };
              const rawV = anyCell.v instanceof Date ? anyCell.v.toISOString() : anyCell.v;
              cells[addr] = { t: anyCell.t, v: rawV, f: anyCell.f, z: anyCell.z };
            }
          }
          templates.financas = { ref, cells };
        }

        for (let r = range.s.r; r <= range.e.r; r++) {
          const assetName = this.getCellText(this.getCell(ws, r, range.s.c)).trim();
          if (!assetName) continue;
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
        let currentBlock: {
          competencia: string;
          labels: string[];
          valueColumns: number;
          totalLabel: string;
        } | null = null;
        const blocks: Array<{
          competencia: string;
          labels: string[];
          valueColumns: number;
          totalLabel: string;
        }> = [];

        for (let r = range.s.r; r <= range.e.r; r++) {
          const labelCell = this.getCell(ws, r, range.s.c);
          const parsedComp = this.tryReadCompetencia(labelCell);
          if (parsedComp) {
            competencia = this.normalizeCompetenciaDate(parsedComp);
            if (currentBlock) blocks.push(currentBlock);
            currentBlock = { competencia, labels: [], valueColumns: 0, totalLabel: 'Total' };
            continue;
          }

          if (!competencia) continue;
          const label = this.getCellText(labelCell).trim();
          if (!label) continue;
          if (label.toLowerCase() === 'total') {
            if (currentBlock) currentBlock.totalLabel = label;
            continue;
          }

          if (currentBlock) currentBlock.labels.push(label);

          const lastCol = this.findLastNonEmptyCol(ws, r, range.s.c + 1, range.e.c);
          if (lastCol < range.s.c + 1) continue;
          if (currentBlock) currentBlock.valueColumns = Math.max(currentBlock.valueColumns, lastCol - (range.s.c + 1) + 1);

          for (let c = range.s.c + 1; c <= lastCol; c++) {
            const value = this.tryGetNumber(this.getCell(ws, r, c));
            if (value == null || value === 0) continue;
            entries.push({
              id: crypto.randomUUID(),
              personId: person.id,
              competencia,
              grupo: label,
              valor: value,
              observacao: null,
              data: null,
              slot: c - (range.s.c + 1) + 1,
            });
          }
        }
        if (currentBlock) blocks.push(currentBlock);
        if (blocks.length > 0) {
          peopleTemplates[person.id] = { blocks };
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
              valor: value,
              observacao: null,
              data: null,
              slot: null,
            });
          }
        }
      }
    }

    if (Object.keys(peopleTemplates).length > 0) templates.people = peopleTemplates;

    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      people: Array.from(peopleByName.values()),
      assets: Array.from(assetsByName.values()),
      entries,
      templates: Object.keys(templates).length > 0 ? templates : undefined,
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

  private static setCellValue(ws: XLSX.WorkSheet, r1: number, c1: number, value: unknown) {
    const addr = XLSX.utils.encode_cell({ r: r1 - 1, c: c1 - 1 });
    ws[addr] = { t: 's', v: '' } as XLSX.CellObject;
    const cell = ws[addr] as XLSX.CellObject;

    if (value == null) {
      (cell as unknown as { t: string; v: unknown }).t = 's';
      (cell as unknown as { t: string; v: unknown }).v = '';
      return;
    }

    if (typeof value === 'number') {
      (cell as unknown as { t: string; v: unknown }).t = 'n';
      (cell as unknown as { t: string; v: unknown }).v = value;
      return;
    }

    if (typeof value === 'boolean') {
      (cell as unknown as { t: string; v: unknown }).t = 'b';
      (cell as unknown as { t: string; v: unknown }).v = value;
      return;
    }

    if (value instanceof Date && Number.isFinite(value.getTime())) {
      (cell as unknown as { t: string; v: unknown }).t = 'd';
      (cell as unknown as { t: string; v: unknown }).v = value;
      return;
    }

    (cell as unknown as { t: string; v: unknown }).t = 's';
    (cell as unknown as { t: string; v: unknown }).v = String(value);
  }

  private static snapshotToWorkbook(snapshot: DbSnapshotV1) {
    const wb = XLSX.utils.book_new();

    const people = [...snapshot.people].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    const entries = [...snapshot.entries];
    const templatesPeople = snapshot.templates?.people ?? {};
    const currencyZ = '[$R$-416]#,##0.00';
    const competenciaZ = '[$-416]mmm/yy';

    for (const person of people) {
      const personEntries = entries.filter(e => e.personId === person.id);
      const valueByKey = new Map<string, number>();
      for (const e of personEntries) {
        const slot = e.slot ?? 1;
        const key = `${e.competencia}\u0000${e.grupo}\u0000${slot}`;
        valueByKey.set(key, e.valor);
      }

      const template = templatesPeople[person.id];
      const blocks =
        template?.blocks?.length
          ? template.blocks
          : (() => {
              const byComp = new Map<string, DbSnapshotV1['entries']>();
              for (const e of personEntries) {
                const list = byComp.get(e.competencia) ?? [];
                list.push(e);
                byComp.set(e.competencia, list);
              }
              return Array.from(byComp.entries())
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([competencia, list]) => {
                  const labels = Array.from(new Set(list.map(x => x.grupo))).sort((a, b) =>
                    a.localeCompare(b, 'pt-BR')
                  );
                  const maxSlot = list.reduce((m, x) => Math.max(m, x.slot ?? 1), 1);
                  return { competencia, labels, valueColumns: maxSlot, totalLabel: 'Total' };
                });
            })();

      const ws: XLSX.WorkSheet = {};
      let maxR1 = 0;
      let maxC1 = 0;
      const touch = (r1: number, c1: number) => {
        maxR1 = Math.max(maxR1, r1);
        maxC1 = Math.max(maxC1, c1);
      };

      let row1 = 1;
      for (const block of blocks) {
        const compDate = this.tryParseIsoDate(block.competencia);
        this.setCellValue(ws, row1, 1, compDate ?? block.competencia);
        if (compDate) this.setCellFormat(ws, row1, 1, competenciaZ);
        touch(row1, 1);
        row1++;

        const dataStartRow1 = row1;
        for (const label of block.labels) {
          this.setCellValue(ws, row1, 1, label);
          touch(row1, 1);

          for (let slot = 1; slot <= Math.max(1, block.valueColumns); slot++) {
            const v = valueByKey.get(`${block.competencia}\u0000${label}\u0000${slot}`);
            if (v != null && v !== 0) {
              this.setCellValue(ws, row1, 1 + slot, v);
              this.setCellFormat(ws, row1, 1 + slot, currencyZ);
              touch(row1, 1 + slot);
            }
          }
          row1++;
        }

        const dataEndRow1 = row1 - 1;
        this.setCellValue(ws, row1, 1, block.totalLabel || 'Total');
        touch(row1, 1);
        for (let slot = 1; slot <= Math.max(1, block.valueColumns); slot++) {
          const col0 = XLSX.utils.encode_col(slot);
          const addr = XLSX.utils.encode_cell({ r: row1 - 1, c: slot });
          if (dataEndRow1 >= dataStartRow1) {
            ws[addr] = { t: 'n', f: `SUM(${col0}${dataStartRow1}:${col0}${dataEndRow1})` } as XLSX.CellObject;
          } else {
            ws[addr] = { t: 'n', v: 0 } as XLSX.CellObject;
          }
          this.setCellFormat(ws, row1, 1 + slot, currencyZ);
          touch(row1, 1 + slot);
        }
        row1 += 2;
      }

      if (maxR1 === 0 || maxC1 === 0) {
        ws['!ref'] = 'A1:A1';
      } else {
        ws['!ref'] = XLSX.utils.encode_range({
          s: { r: 0, c: 0 },
          e: { r: Math.max(0, maxR1 - 1), c: Math.max(0, maxC1 - 1) },
        });
      }

      XLSX.utils.book_append_sheet(wb, ws, this.sanitizeSheetName(person.name));
    }

    {
      const template = snapshot.templates?.financas;
      const finWs: XLSX.WorkSheet = {};

      if (template?.ref && template.cells) {
        finWs['!ref'] = template.ref;
        for (const [addr, raw] of Object.entries(template.cells)) {
          const t =
            raw.t ??
            (raw.f ? 'n' : typeof raw.v === 'number' ? 'n' : typeof raw.v === 'boolean' ? 'b' : raw.v ? 's' : 's');
          const cell: XLSX.CellObject & { z?: string } = { t: t as never, v: raw.v as never };
          if (raw.f) (cell as unknown as { f?: string }).f = raw.f;
          if (raw.z) (cell as unknown as { z?: string }).z = raw.z;
          finWs[addr] = cell;
        }

        const range = XLSX.utils.decode_range(template.ref);
        let somasRow0: number | null = null;
        for (let r = range.s.r; r <= range.e.r; r++) {
          const label = this.getCellText(this.getCell(finWs, r, range.s.c)).trim().toLowerCase();
          if (label === 'somas:') {
            somasRow0 = r;
            break;
          }
        }

        const limitRow0 = somasRow0 ?? range.e.r + 1;
        const rowByName = new Map<string, number>();
        for (let r = range.s.r; r < limitRow0; r++) {
          const label = this.getCellText(this.getCell(finWs, r, range.s.c)).trim();
          if (!label) continue;
          rowByName.set(label.toLowerCase(), r);
        }

        for (const a of snapshot.assets) {
          const row0 = rowByName.get(a.name.toLowerCase());
          if (row0 == null) continue;
          const addr = XLSX.utils.encode_cell({ r: row0, c: range.s.c + 1 });
          finWs[addr] = { t: 'n', v: a.saldo } as XLSX.CellObject;
          this.setCellFormat(finWs, row0 + 1, range.s.c + 2, currencyZ);
        }
      } else {
        const rows: Array<Array<unknown>> = [];
        for (const a of snapshot.assets) rows.push([a.name, a.saldo]);
        rows.push(['SOMAS:']);
        const ws2 = XLSX.utils.aoa_to_sheet(rows, { cellDates: true });
        for (let r = 1; r <= snapshot.assets.length; r++) this.setCellFormat(ws2, r, 2, currencyZ);
        XLSX.utils.book_append_sheet(wb, ws2, 'Finanças');
        return wb;
      }

      XLSX.utils.book_append_sheet(wb, finWs, 'Finanças');
    }
    return wb;
  }
}
