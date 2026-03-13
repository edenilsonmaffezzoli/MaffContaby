import type { AxiosInstance } from 'axios';

export interface PersonDto {
  id: string;
  name: string;
}

export async function getPeople(httpClient: AxiosInstance) {
  const { data } = await httpClient.get<PersonDto[]>('/api/people');
  return data;
}

