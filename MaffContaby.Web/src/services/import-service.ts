import type { AxiosInstance } from 'axios';

export type PersonDto = { id: string; name: string };
export type GroupDto = { id: string; name: string };
export type CompetenciaDto = { id: string; value: string };
export type AssetDto = {
  id: string;
  name: string;
  saldo: number;
  disponivelImediatamente: boolean;
  asOfDate: string | null;
  observacao: string | null;
};
export type EntryDto = {
  id: string;
  personId: string;
  competencia: string;
  grupo: string;
  valor: number;
  observacao: string | null;
  data: string | null;
};

export type DbSnapshotV1 = {
  version: 1;
  people: PersonDto[];
  groups: GroupDto[];
  competencias: CompetenciaDto[];
  assets: AssetDto[];
  entries: EntryDto[];
};

export function normalizeSnapshotV1(snapshot: DbSnapshotV1 | null | undefined) {
  if (!snapshot || snapshot.version !== 1) return null;
  if (!Array.isArray(snapshot.people)) return null;
  if (!Array.isArray(snapshot.groups)) return null;
  if (!Array.isArray(snapshot.competencias)) return null;
  if (!Array.isArray(snapshot.assets)) return null;
  if (!Array.isArray(snapshot.entries)) return null;
  return snapshot;
}

type ImportResult = { entriesInserted: number; assetsInserted: number };

export async function exportContabilidade(httpClient: AxiosInstance) {
  const res = await httpClient.get<Blob>('/api/export/contabilidade', { responseType: 'blob' as never });
  return res.data;
}

export async function importContabilidadeSnapshot(httpClient: AxiosInstance, snapshot: DbSnapshotV1, _replaceAll: boolean) {
  const { data } = await httpClient.post<ImportResult>('/api/import/contabilidade', snapshot, {
    headers: { 'content-type': 'application/json' },
  });
  return data;
}

export async function importContabilidade(httpClient: AxiosInstance, replaceAll: boolean) {
  const blob = await exportContabilidade(httpClient);
  const text = await blob.text();
  const parsed = JSON.parse(text) as DbSnapshotV1;
  const normalized = normalizeSnapshotV1(parsed);
  if (!normalized) throw new Error('Snapshot inválido (version).');
  return importContabilidadeSnapshot(httpClient, normalized, replaceAll);
}

export async function importContabilidadeFile(httpClient: AxiosInstance, file: File, _replaceAll: boolean) {
  const form = new FormData();
  form.append('file', file);
  const { data } = await httpClient.post('/api/import/contabilidade', form, { headers: { 'content-type': 'multipart/form-data' } });
  return data as ImportResult;
}

export async function clearDatabase(httpClient: AxiosInstance) {
  const empty: DbSnapshotV1 = { version: 1, people: [], groups: [], competencias: [], assets: [], entries: [] };
  await importContabilidadeSnapshot(httpClient, empty, true);
}

export class ContabilidadePlanilha {
  static async parseXlsxToSnapshot(_file: File): Promise<DbSnapshotV1> {
    throw new Error('Importação XLSX ainda não implementada. Exporte/importa via JSON.');
  }

  static snapshotToXlsxBlob(snapshot: DbSnapshotV1) {
    const json = JSON.stringify(snapshot, null, 2);
    return new Blob([json], { type: 'application/json' });
  }
}

