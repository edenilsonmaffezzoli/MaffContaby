import { getApiBaseUrl } from '@/config/api-base-url';
import type { GerarCasoTesteRequest, GerarCasoTesteResponse } from '@/types/casos-teste';
import type { AxiosInstance } from 'axios';

export async function gerarCasoTeste(http: AxiosInstance, body: GerarCasoTesteRequest) {
  const { data } = await http.post<GerarCasoTesteResponse>('/api/gerar-caso-teste', body);
  return data;
}

export type GerarStreamPhase = 'building-prompt' | 'calling-ai' | 'parsing';

export type GerarStreamHandlers = {
  onProgress?: (phase: GerarStreamPhase, extra?: { urlContentFetched?: boolean; urlFetchError?: string }) => void;
  onStatus?: (status: string) => void;
  onDelta?: (chars: number) => void;
  onResult?: (data: GerarCasoTesteResponse) => void;
  onError?: (error: string, prompt?: string) => void;
};

function parseSseBlocks(buffer: string): { events: Array<{ event: string; data: string }>; rest: string } {
  const normalized = buffer.replace(/\r\n/g, '\n');
  const parts = normalized.split('\n\n');
  const rest = parts.pop() ?? '';
  const events: Array<{ event: string; data: string }> = [];
  for (const block of parts) {
    if (!block.trim()) continue;
    let event = '';
    const dataLines: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (event || dataLines.length) events.push({ event, data: dataLines.join('\n') });
  }
  return { events, rest };
}

/**
 * Gera casos de teste consumindo o stream SSE do worker.
 * Usa fetch nativo (axios não suporta streaming no browser).
 */
export async function gerarCasoTesteStream(
  body: GerarCasoTesteRequest,
  token: string,
  handlers: GerarStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${getApiBaseUrl()}/api/gerar-caso-teste/stream`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    let message = `Erro ${res.status}`;
    try {
      const txt = await res.text();
      if (txt.trim()) message = txt.trim();
    } catch {
      // mantém mensagem padrão
    }
    handlers.onError?.(message);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseSseBlocks(buffer);
    buffer = rest;
    for (const evt of events) {
      let data: unknown = null;
      try {
        data = evt.data ? JSON.parse(evt.data) : null;
      } catch {
        data = null;
      }
      if (evt.event === 'progress') {
        const d = data as { phase?: GerarStreamPhase; urlContentFetched?: boolean; urlFetchError?: string } | null;
        if (d?.phase) handlers.onProgress?.(d.phase, { urlContentFetched: d.urlContentFetched, urlFetchError: d.urlFetchError });
      } else if (evt.event === 'status') {
        const d = data as { status?: string } | null;
        if (d?.status) handlers.onStatus?.(d.status);
      } else if (evt.event === 'delta') {
        const d = data as { chars?: number } | null;
        if (typeof d?.chars === 'number') handlers.onDelta?.(d.chars);
      } else if (evt.event === 'result') {
        handlers.onResult?.(data as GerarCasoTesteResponse);
      } else if (evt.event === 'error') {
        const d = data as { error?: string; prompt?: string } | null;
        handlers.onError?.(d?.error ?? 'Erro ao gerar casos de teste', d?.prompt);
      }
    }
  }
}
