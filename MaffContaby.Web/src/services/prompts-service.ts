import type { AxiosInstance } from 'axios';

export type PromptDto = {
  id: string;
  description: string;
  text: string;
};

export async function getPrompts(httpClient: AxiosInstance) {
  const { data } = await httpClient.get<PromptDto[]>('/api/prompts');
  return data;
}

export async function createPrompt(httpClient: AxiosInstance, request: { description: string; text: string }) {
  const { data } = await httpClient.post<PromptDto>('/api/prompts', request);
  return data;
}

export async function updatePrompt(
  httpClient: AxiosInstance,
  id: string,
  request: { description: string; text: string },
) {
  await httpClient.put(`/api/prompts/${id}`, request);
}

export async function deletePrompt(httpClient: AxiosInstance, id: string) {
  await httpClient.delete(`/api/prompts/${id}`);
}
