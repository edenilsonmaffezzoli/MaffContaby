import type { AxiosInstance } from 'axios';

export type GdpUserDto = {
  id: string;
  username: string;
  admin: boolean;
  createdAt: string;
  updatedAt: string;
};

export async function listGdpUsers(httpClient: AxiosInstance) {
  const { data } = await httpClient.get<{ ok: true; users: GdpUserDto[] }>('/api/gdp/users');
  return data;
}

export async function createGdpUser(httpClient: AxiosInstance, request: { username: string; password: string; admin: boolean }) {
  const { data } = await httpClient.post<{ ok: true; user: { id: string; username: string; admin: boolean } }>(
    '/api/gdp/users',
    request,
  );
  return data;
}

export async function updateGdpUser(
  httpClient: AxiosInstance,
  id: string,
  request: { username?: string; password?: string; admin?: boolean },
) {
  await httpClient.put(`/api/gdp/users/${id}`, request);
}

export async function deleteGdpUser(httpClient: AxiosInstance, id: string) {
  await httpClient.delete(`/api/gdp/users/${id}`);
}
