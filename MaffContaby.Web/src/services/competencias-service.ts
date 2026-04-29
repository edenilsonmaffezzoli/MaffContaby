import type { AxiosInstance } from 'axios';

export interface CompetenciaDto {
  id: string;
  value: string;
}

export async function getCompetencias(httpClient: AxiosInstance) {
  const { data } = await httpClient.get<CompetenciaDto[]>('/api/competencias');
  return data;
}

export async function createCompetencia(httpClient: AxiosInstance, request: { value: string }) {
  const { data } = await httpClient.post<CompetenciaDto>('/api/competencias', request);
  return data;
}

export async function deleteCompetencia(httpClient: AxiosInstance, id: string) {
  await httpClient.delete(`/api/competencias/${id}`);
}
