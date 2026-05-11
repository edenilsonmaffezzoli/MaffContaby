import type { AxiosInstance } from 'axios';

export type AuthUserDto = {
  id: string;
  username: string;
  admin: boolean;
};

export async function getBootstrapStatus(httpClient: AxiosInstance) {
  const { data } = await httpClient.get<{ ok: true; needed: boolean }>('/api/auth/bootstrap');
  return data;
}

export async function bootstrapAdmin(httpClient: AxiosInstance, request: { username: string; password: string }) {
  const { data } = await httpClient.post<{ ok: true }>('/api/auth/bootstrap', request);
  return data;
}

export async function login(httpClient: AxiosInstance, request: { username: string; password: string }) {
  const { data } = await httpClient.post<{ ok: true; token: string; user: AuthUserDto }>('/api/auth/login', request);
  return data;
}

export async function me(httpClient: AxiosInstance) {
  const { data } = await httpClient.get<{ ok: true; user: AuthUserDto }>('/api/auth/me');
  return data;
}

export async function logout(httpClient: AxiosInstance) {
  const { data } = await httpClient.post<{ ok: true }>('/api/auth/logout');
  return data;
}
