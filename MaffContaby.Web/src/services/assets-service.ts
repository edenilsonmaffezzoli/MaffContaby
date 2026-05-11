import type { AxiosInstance } from 'axios';

export type AssetDto = {
  id: string;
  name: string;
  saldo: number;
  disponivelImediatamente: boolean;
  asOfDate: string | null;
  observacao: string | null;
};

export async function getAssets(httpClient: AxiosInstance) {
  const { data } = await httpClient.get<AssetDto[]>('/api/assets');
  return data;
}

export async function createAsset(
  httpClient: AxiosInstance,
  request: { name: string; saldo: number; disponivelImediatamente: boolean; asOfDate?: string | null; observacao?: string | null },
) {
  const { data } = await httpClient.post<AssetDto>('/api/assets', request);
  return data;
}

export async function updateAsset(
  httpClient: AxiosInstance,
  id: string,
  request: { name: string; saldo: number; disponivelImediatamente?: boolean | null; asOfDate?: string | null; observacao?: string | null },
) {
  await httpClient.put(`/api/assets/${id}`, request);
}

export async function deleteAsset(httpClient: AxiosInstance, id: string) {
  await httpClient.delete(`/api/assets/${id}`);
}

