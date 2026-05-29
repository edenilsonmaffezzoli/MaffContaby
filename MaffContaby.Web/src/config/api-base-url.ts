export function getApiBaseUrl() {
  const baseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
  const resolved = baseUrl?.trim() ? baseUrl.trim() : 'http://127.0.0.1:8787';
  // Remove barras finais para evitar URLs com barra dupla (ex.: ".../" + "/api/..." => "//api/...").
  // O fetch nativo não normaliza isso e o Worker não casaria a rota, retornando "Not found".
  return resolved.replace(/\/+$/, '');
}
