import { getApiBaseUrl } from '@/config/api-base-url';
import axios from 'axios';
import { useMemo } from 'react';

export function useHttpClient() {
  const apiBaseUrl = getApiBaseUrl();

  const httpClient = useMemo(() => {
    const client = axios.create({
      baseURL: apiBaseUrl,
    });

    client.interceptors.request.use(config => {
      const method = (config.method ?? 'get').toLowerCase();
      const isWrite = method === 'post' || method === 'put' || method === 'patch' || method === 'delete';
      if (!isWrite) return config;

      const envKey = (import.meta.env.VITE_WRITE_KEY as string | undefined)?.trim();
      let key = localStorage.getItem('maff_write_key')?.trim() ?? '';
      if (!key && envKey) key = envKey;

      if (!key) {
        const input = window.prompt('Chave para salvar dados (apenas você e sua esposa):')?.trim();
        if (input) {
          key = input;
          localStorage.setItem('maff_write_key', input);
        }
      }

      if (key) {
        config.headers = config.headers ?? {};
        (config.headers as Record<string, string>)['x-maff-key'] = key;
      }

      return config;
    });

    return client;
  }, [apiBaseUrl]);

  return httpClient;
}
