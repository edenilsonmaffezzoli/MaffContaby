import type { AxiosInstance } from 'axios';

export interface EntryDto {
  id: string;
  personId: string;
  competencia: string;
  grupo: string;
  valor: number;
  observacao: string | null;
  data: string | null;
}

export interface CreateEntryRequest {
  personId: string;
  competencia: string;
  grupo: string;
  valor: number;
  observacao?: string | null;
  data?: string | null;
}

export interface UpdateEntryRequest {
  competencia: string;
  grupo: string;
  valor: number;
  observacao?: string | null;
  data?: string | null;
}

export async function getEntries(
  httpClient: AxiosInstance,
  params: { personId: string; competencia?: string }
) {
  const { data } = await httpClient.get<EntryDto[]>('/api/entries', { params });
  return data;
}

export async function createEntry(httpClient: AxiosInstance, request: CreateEntryRequest) {
  const { data } = await httpClient.post<EntryDto>('/api/entries', request);
  return data;
}

export async function updateEntry(httpClient: AxiosInstance, id: string, request: UpdateEntryRequest) {
  await httpClient.put(`/api/entries/${id}`, request);
}

export async function deleteEntry(httpClient: AxiosInstance, id: string) {
  await httpClient.delete(`/api/entries/${id}`);
}

