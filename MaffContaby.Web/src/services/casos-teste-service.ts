import { getApiBaseUrl } from '@/config/api-base-url';
import type {
  GerarCasoTesteRequest,
  GerarCasoTesteResponse,
  GerarCodigoRobotResponse,
} from '@/types/casos-teste';
import type { AxiosInstance } from 'axios';

export async function gerarCasoTeste(http: AxiosInstance, body: GerarCasoTesteRequest) {
  const { data } = await http.post<GerarCasoTesteResponse>('/api/gerar-caso-teste', body);
  return data;
}

export type CursorModelOption = {
  id: string;
  displayName: string;
};

export type ListCursorModelsResponse = {
  ok: true;
  models: CursorModelOption[];
  default: string;
};

/** Lista os modelos de IA disponíveis (admin escolhe qual usar). */
export async function listCursorModels(http: AxiosInstance) {
  const { data } = await http.get<ListCursorModelsResponse>('/api/cursor-models');
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

async function readErrorBody(res: Response): Promise<{ error: string; prompt?: string }> {
  let raw = '';
  try {
    raw = await res.text();
  } catch {
    raw = '';
  }
  const trimmed = raw.trim();
  if (trimmed) {
    try {
      const parsed = JSON.parse(trimmed) as { error?: string; prompt?: string };
      if (parsed && typeof parsed === 'object' && typeof parsed.error === 'string') {
        return { error: parsed.error, prompt: parsed.prompt };
      }
    } catch {
      // corpo em texto puro
    }
    return { error: trimmed };
  }
  return { error: `Erro ${res.status}` };
}

/**
 * Endpoint legado (sem streaming), ainda presente em produção.
 * Usado como fallback quando a rota de streaming não está publicada (404).
 */
async function gerarCasoTesteLegacy(
  body: GerarCasoTesteRequest,
  token: string,
  handlers: GerarStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  handlers.onProgress?.('calling-ai');
  const res = await fetch(`${getApiBaseUrl()}/api/gerar-caso-teste`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const { error, prompt } = await readErrorBody(res);
    handlers.onError?.(error, prompt);
    return;
  }
  const data = (await res.json()) as GerarCasoTesteResponse;
  handlers.onResult?.(data);
}

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

  if (res.status === 404) {
    // Worker em produção ainda sem a rota de streaming — usa o endpoint legado (sem progresso ao vivo).
    await gerarCasoTesteLegacy(body, token, handlers, signal);
    return;
  }

  if (!res.ok || !res.body) {
    const { error, prompt } = await readErrorBody(res);
    handlers.onError?.(error, prompt);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let settled = false;

  const processEvent = (evt: { event: string; data: string }) => {
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
      settled = true;
      handlers.onResult?.(data as GerarCasoTesteResponse);
    } else if (evt.event === 'error') {
      settled = true;
      const d = data as { error?: string; prompt?: string } | null;
      handlers.onError?.(d?.error ?? 'Erro ao gerar casos de teste', d?.prompt);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseSseBlocks(buffer);
    buffer = rest;
    for (const evt of events) processEvent(evt);
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    const { events } = parseSseBlocks(`${buffer}\n\n`);
    for (const evt of events) processEvent(evt);
  }

  if (!settled) handlers.onError?.('Stream encerrado sem resultado. Tente novamente.');
}

export type GerarCodigoStreamHandlers = {
  onProgress?: (phase: GerarStreamPhase, extra?: { urlContentFetched?: boolean; urlFetchError?: string }) => void;
  onStatus?: (status: string) => void;
  onDelta?: (chars: number) => void;
  onResult?: (data: GerarCodigoRobotResponse) => void;
  onError?: (error: string, prompt?: string) => void;
};

/**
 * Gera um projeto de teste automatizado (Robot Framework + Browser Library)
 * consumindo o stream SSE do worker.
 */
export async function gerarCodigoRobotStream(
  body: GerarCasoTesteRequest,
  token: string,
  handlers: GerarCodigoStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${getApiBaseUrl()}/api/gerar-codigo-robot/stream`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    const { error, prompt } = await readErrorBody(res);
    handlers.onError?.(error, prompt);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let settled = false;

  const processEvent = (evt: { event: string; data: string }) => {
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
      settled = true;
      handlers.onResult?.(data as GerarCodigoRobotResponse);
    } else if (evt.event === 'error') {
      settled = true;
      const d = data as { error?: string; prompt?: string } | null;
      handlers.onError?.(d?.error ?? 'Erro ao gerar o código automatizado', d?.prompt);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseSseBlocks(buffer);
    buffer = rest;
    for (const evt of events) processEvent(evt);
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    const { events } = parseSseBlocks(`${buffer}\n\n`);
    for (const evt of events) processEvent(evt);
  }

  if (!settled) handlers.onError?.('Stream encerrado sem resultado. Tente novamente.');
}
