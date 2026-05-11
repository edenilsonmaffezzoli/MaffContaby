import type { AxiosInstance } from 'axios';

export type PersonDto = {
  id: string;
  name: string;
};

export async function getPeople(httpClient: AxiosInstance) {
  const { data } = await httpClient.get<PersonDto[]>('/api/people');
  return data;
}

export async function createPerson(httpClient: AxiosInstance, request: { name: string }) {
  const { data } = await httpClient.post<PersonDto>('/api/people', request);
  return data;
}

export async function updatePerson(httpClient: AxiosInstance, id: string, request: { name: string }) {
  await httpClient.put(`/api/people/${id}`, request);
}

export async function deletePerson(httpClient: AxiosInstance, id: string) {
  await httpClient.delete(`/api/people/${id}`);
}

