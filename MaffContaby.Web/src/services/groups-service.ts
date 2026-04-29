import type { AxiosInstance } from 'axios';

export interface GroupDto {
  id: string;
  name: string;
}

export async function getGroups(httpClient: AxiosInstance) {
  const { data } = await httpClient.get<GroupDto[]>('/api/groups');
  return data;
}

export async function createGroup(httpClient: AxiosInstance, request: { name: string }) {
  const { data } = await httpClient.post<GroupDto>('/api/groups', request);
  return data;
}

export async function updateGroup(httpClient: AxiosInstance, id: string, request: { name: string }) {
  await httpClient.put(`/api/groups/${id}`, request);
}

export async function deleteGroup(httpClient: AxiosInstance, id: string) {
  await httpClient.delete(`/api/groups/${id}`);
}
