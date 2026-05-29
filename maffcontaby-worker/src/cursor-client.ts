const CURSOR_API_BASE = 'https://api.cursor.com';

export type CursorConfig = {
  apiKey: string;
  model: string;
  timeoutMs: number;
};

export type CursorImagePart = {
  mimeType: string;
  base64: string;
};

export type CursorAgentResult = {
  text: string;
  outputTruncated: boolean;
  runStatus: string;
  agentId: string;
  runId: string;
};

type CursorRunStatus =
  | 'CREATING'
  | 'RUNNING'
  | 'FINISHED'
  | 'ERROR'
  | 'CANCELLED'
  | 'EXPIRED';

const TERMINAL_STATUSES = new Set<CursorRunStatus>(['FINISHED', 'ERROR', 'CANCELLED', 'EXPIRED']);

const QASE_CSV_HEADER = 'Suite,Subsuite,Title,Description,Preconditions,Steps,Expected Result,Priority,Tags';

type SseEvent = { event: string; data: string };

export type CursorProgressEvent =
  | { type: 'status'; status: CursorRunStatus }
  | { type: 'delta'; chars: number };

export type CursorProgressCallback = (event: CursorProgressEvent) => void;

function authHeaders(apiKey: string, extra?: Record<string, string>): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    ...extra,
  };
}

async function parseJsonResponse(res: Response, label: string): Promise<unknown> {
  const raw = await res.text();
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('CURSOR_API_KEY inválida ou sem permissão');
    }
    if (res.status === 429) {
      throw new Error('Rate limit da API Cursor excedido. Tente novamente em instantes.');
    }
    throw new Error(`Cursor ${label} HTTP ${res.status}: ${raw.slice(0, 800)}`);
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`Resposta inválida da API Cursor (${label})`);
  }
}

export function detectOutputTruncated(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();
  if (!lower.includes('suite') || !lower.includes('title')) return true;
  if (!trimmed.includes(QASE_CSV_HEADER) && !trimmed.includes('Steps')) return true;
  return false;
}

function parseSseChunk(buffer: string): { events: SseEvent[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, '\n');
  const parts = normalized.split('\n\n');
  const rest = parts.pop() ?? '';
  const events: SseEvent[] = [];

  for (const block of parts) {
    if (!block.trim()) continue;
    let event = '';
    const dataLines: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (event || dataLines.length) {
      events.push({ event, data: dataLines.join('\n') });
    }
  }

  return { events, rest };
}

function parseJsonData<T>(data: string): T | null {
  if (!data.trim()) return null;
  try {
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

function assertTerminalStatus(status: CursorRunStatus): void {
  if (status === 'ERROR') throw new Error('Run do Cursor terminou com erro');
  if (status === 'CANCELLED') throw new Error('Run do Cursor foi cancelado');
  if (status === 'EXPIRED') throw new Error('Run do Cursor expirou');
}

export async function createAgentRun(
  config: CursorConfig,
  prompt: string,
  images: CursorImagePart[],
): Promise<{ agentId: string; runId: string }> {
  const promptImages = images.map(img => ({
    data: img.base64,
    mimeType: img.mimeType,
  }));

  const body: Record<string, unknown> = {
    prompt: {
      text: prompt,
      ...(promptImages.length ? { images: promptImages } : {}),
    },
    model: { id: config.model },
    mode: 'agent',
  };

  const res = await fetch(`${CURSOR_API_BASE}/v1/agents`, {
    method: 'POST',
    headers: { ...authHeaders(config.apiKey), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = (await parseJsonResponse(res, 'create agent')) as {
    agent?: { id?: string; latestRunId?: string };
    run?: { id?: string; agentId?: string };
  };

  const agentId = data.agent?.id ?? data.run?.agentId;
  const runId = data.run?.id ?? data.agent?.latestRunId;
  if (!agentId || !runId) {
    throw new Error('Resposta da API Cursor sem agentId ou runId');
  }

  return { agentId, runId };
}

export async function getRun(
  config: CursorConfig,
  agentId: string,
  runId: string,
): Promise<{ status: CursorRunStatus; result?: string }> {
  const res = await fetch(`${CURSOR_API_BASE}/v1/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(runId)}`, {
    method: 'GET',
    headers: authHeaders(config.apiKey),
  });

  const data = (await parseJsonResponse(res, 'get run')) as {
    status?: CursorRunStatus;
    result?: string;
  };

  const status = data.status ?? 'RUNNING';
  return { status, result: typeof data.result === 'string' ? data.result : undefined };
}

export async function deleteAgent(config: CursorConfig, agentId: string): Promise<void> {
  try {
    const res = await fetch(`${CURSOR_API_BASE}/v1/agents/${encodeURIComponent(agentId)}`, {
      method: 'DELETE',
      headers: authHeaders(config.apiKey),
    });
    if (!res.ok && res.status !== 404) {
      await res.text();
    }
  } catch {
    // cleanup best-effort
  }
}

function handleSseEvent(
  evt: SseEvent,
  state: {
    lastStatus: CursorRunStatus;
    assistantText: string;
    finalText: string;
    terminal: { status: CursorRunStatus; text: string } | null;
  },
  onProgress?: CursorProgressCallback,
): void {
  if (evt.event === 'status') {
    const payload = parseJsonData<{ status?: CursorRunStatus }>(evt.data);
    if (payload?.status) {
      state.lastStatus = payload.status;
      onProgress?.({ type: 'status', status: payload.status });
    }
    return;
  }

  if (evt.event === 'assistant') {
    const payload = parseJsonData<{ text?: string }>(evt.data);
    if (payload?.text) {
      state.assistantText += payload.text;
      onProgress?.({ type: 'delta', chars: state.assistantText.length });
    }
    return;
  }

  if (evt.event === 'result') {
    const payload = parseJsonData<{ status?: CursorRunStatus; text?: string }>(evt.data);
    const status = payload?.status ?? state.lastStatus;
    const text = (payload?.text ?? state.assistantText).trim();
    if (TERMINAL_STATUSES.has(status)) {
      state.terminal = { status, text };
      state.lastStatus = status;
    }
    return;
  }

  if (evt.event === 'error') {
    const payload = parseJsonData<{ message?: string }>(evt.data);
    throw new Error(payload?.message?.trim() || 'Erro no stream do Cursor');
  }
}

/**
 * Aguarda o run via SSE (1 subrequest) em vez de polling repetido.
 */
export async function streamRunUntilDone(
  config: CursorConfig,
  agentId: string,
  runId: string,
  deadlineMs: number,
  onProgress?: CursorProgressCallback,
): Promise<{ status: CursorRunStatus; result?: string }> {
  const remainingMs = Math.max(5_000, deadlineMs - Date.now());
  const url = `${CURSOR_API_BASE}/v1/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(runId)}/stream`;

  const res = await fetch(url, {
    method: 'GET',
    headers: authHeaders(config.apiKey, { Accept: 'text/event-stream' }),
    signal: AbortSignal.timeout(remainingMs),
  });

  if (res.status === 410) {
    return getRun(config, agentId, runId);
  }

  if (!res.ok) {
    const raw = await res.text();
    throw new Error(`Cursor stream HTTP ${res.status}: ${raw.slice(0, 800)}`);
  }

  const body = res.body;
  if (!body) {
    return getRun(config, agentId, runId);
  }

  const state = {
    lastStatus: 'RUNNING' as CursorRunStatus,
    assistantText: '',
    finalText: '',
    terminal: null as { status: CursorRunStatus; text: string } | null,
  };

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (Date.now() < deadlineMs) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const parsed = parseSseChunk(buffer);
      buffer = parsed.rest;
      for (const evt of parsed.events) {
        handleSseEvent(evt, state, onProgress);
        if (state.terminal) {
          await reader.cancel().catch(() => undefined);
          assertTerminalStatus(state.terminal.status);
          return { status: state.terminal.status, result: state.terminal.text };
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }

  if (state.terminal) {
    assertTerminalStatus(state.terminal.status);
    return { status: state.terminal.status, result: state.terminal.text };
  }

  if (TERMINAL_STATUSES.has(state.lastStatus) && state.assistantText.trim()) {
    assertTerminalStatus(state.lastStatus);
    return { status: state.lastStatus, result: state.assistantText.trim() };
  }

  return getRun(config, agentId, runId);
}

/**
 * Cria agente no-repo, aguarda o run (SSE) e remove o agente ao final.
 * Máximo ~4 subrequests: create + stream (+ getRun fallback) + delete.
 */
export async function callCursorForTestCases(
  config: CursorConfig,
  prompt: string,
  images: CursorImagePart[],
  onProgress?: CursorProgressCallback,
): Promise<CursorAgentResult> {
  const deadlineMs = Date.now() + config.timeoutMs;
  let agentId: string | undefined;

  try {
    const created = await createAgentRun(config, prompt, images);
    agentId = created.agentId;

    const terminal = await streamRunUntilDone(config, created.agentId, created.runId, deadlineMs, onProgress);

    if (!TERMINAL_STATUSES.has(terminal.status)) {
      throw new Error('Timeout');
    }

    assertTerminalStatus(terminal.status);

    const text = terminal.result?.trim() ?? '';
    if (!text) {
      throw new Error('Resposta vazia do Cursor');
    }

    return {
      text,
      outputTruncated: detectOutputTruncated(text),
      runStatus: terminal.status,
      agentId: created.agentId,
      runId: created.runId,
    };
  } finally {
    if (agentId) {
      await deleteAgent(config, agentId);
    }
  }
}
