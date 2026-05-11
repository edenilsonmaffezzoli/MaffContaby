import type { AxiosInstance } from 'axios';

export type EntryDto = {
  id: string;
  personId: string;
  competencia: string;
  grupo: string;
  valor: number;
  observacao: string | null;
  data: string | null;
};

export async function getEntries(
  httpClient: AxiosInstance,
  params: { personId?: string; competencia?: string; grupo?: string; competenciaFrom?: string; competenciaTo?: string },
) {
  const { data } = await httpClient.get<EntryDto[]>('/api/entries', { params });
  return data;
}

export async function createEntry(
  httpClient: AxiosInstance,
  request: { personId: string; competencia: string; grupo: string; valor: number; observacao?: string | null },
) {
  const { data } = await httpClient.post<EntryDto>('/api/entries', request);
  return data;
}

export async function updateEntry(
  httpClient: AxiosInstance,
  id: string,
  request: { competencia: string; grupo: string; valor: number; data?: string | null; observacao?: string | null },
) {
  await httpClient.put(`/api/entries/${id}`, request);
}

export async function deleteEntry(httpClient: AxiosInstance, id: string) {
  await httpClient.delete(`/api/entries/${id}`);
}

export async function downloadRelatorioExecutivo(
  httpClient: AxiosInstance,
  params: { personId?: string; competenciaFrom?: string; competenciaTo?: string; competencia?: string },
) {
  const res = await httpClient.get<ArrayBuffer>('/api/reports/executivo', { params, responseType: 'arraybuffer' });
  return new Blob([res.data], { type: 'application/pdf' });
}

export async function downloadRelatorioDetalhado(
  httpClient: AxiosInstance,
  params: { personId?: string; competenciaFrom?: string; competenciaTo?: string; competencia?: string },
) {
  const res = await httpClient.get<ArrayBuffer>('/api/reports/detalhado', { params, responseType: 'arraybuffer' });
  return new Blob([res.data], { type: 'application/pdf' });
}

