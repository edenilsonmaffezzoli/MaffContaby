export function getApiBaseUrl() {
  const baseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
  return baseUrl?.trim() ? baseUrl.trim() : 'http://localhost:5165';
}

