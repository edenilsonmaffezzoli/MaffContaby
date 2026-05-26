import { getApiBaseUrl } from '@/config/api-base-url';
import axios, { isAxiosError } from 'axios';
import { useMemo } from 'react';

function loginPath() {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.replace(/\/?$/, '')}/login`;
}

export function useHttpClient() {
  const apiBaseUrl = getApiBaseUrl();

  const httpClient = useMemo(() => {
    const client = axios.create({
      baseURL: apiBaseUrl,
    });

    client.interceptors.request.use(config => {
      const token = localStorage.getItem('gdp_token')?.trim() ?? '';
      if (token) {
        config.headers = config.headers ?? {};
        (config.headers as Record<string, string>)['authorization'] = `Bearer ${token}`;
      }
      return config;
    });

    client.interceptors.response.use(
      response => response,
      error => {
        if (isAxiosError(error) && error.response?.status === 401) {
          const url = String(error.config?.url ?? '');
          const isPublicAuth =
            url.includes('/api/auth/login') || url.includes('/api/auth/bootstrap');
          if (!isPublicAuth) {
            localStorage.removeItem('gdp_token');
            localStorage.removeItem('gdp_admin_user');
            if (!window.location.pathname.endsWith('/login')) {
              window.location.assign(loginPath());
            }
          }
        }
        return Promise.reject(error);
      },
    );

    return client;
  }, [apiBaseUrl]);

  return httpClient;
}
