import type { GerarCasoTesteRequest, GerarCasoTesteResponse } from '@/types/casos-teste';
import type { AxiosInstance } from 'axios';

export async function gerarCasoTeste(http: AxiosInstance, body: GerarCasoTesteRequest) {
  const { data } = await http.post<GerarCasoTesteResponse>('/api/gerar-caso-teste', body);
  return data;
}
