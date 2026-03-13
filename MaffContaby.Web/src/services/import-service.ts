import type { AxiosInstance } from 'axios';

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
