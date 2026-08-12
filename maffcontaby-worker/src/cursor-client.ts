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

export type CursorModelInfo = {
  id: string;
  displayName: string;
};

/** Lista os modelos disponíveis na conta (GET /v1/models). */
export async function listModels(apiKey: string): Promise<CursorModelInfo[]> {
  const res = await fetch(`${CURSOR_API_BASE}/v1/models`, {
    method: 'GET',
    headers: authHeaders(apiKey),
  });

  const data = (await parseJsonResponse(res, 'list models')) as {
    items?: Array<{ id?: unknown; displayName?: unknown }>;
  };

  const items = Array.isArray(data.items) ? data.items : [];
  const models: CursorModelInfo[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    if (!id) continue;
    const displayName = typeof item.displayName === 'string' && item.displayName.trim() ? item.displayName.trim() : id;
    models.push({ id, displayName });
  }
  return models;
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

function extractTextFromUnknown(value: unknown): string {
  if (typeof value === 'string' && value.trim()) return value;
  if (!value || typeof value !== 'object') return '';
  const o = value as Record<string, unknown>;
  if (typeof o.text === 'string' && o.text.trim()) return o.text;
  if (typeof o.result === 'string' && o.result.trim()) return o.result;
  if (typeof o.delta === 'string' && o.delta.trim()) return o.delta;
  if (o.result && typeof o.result === 'object') {
    const nested = extractTextFromUnknown(o.result);
    if (nested) return nested;
  }
  const message = o.message;
  if (message && typeof message === 'object') {
    const content = (message as { content?: unknown }).content;
    if (Array.isArray(content)) {
      const joined = content
        .map(block => {
          if (!block || typeof block !== 'object') return '';
          const b = block as { type?: unknown; text?: unknown };
          if (b.type === 'text' && typeof b.text === 'string') return b.text;
          return '';
        })
        .join('');
      if (joined.trim()) return joined;
    }
  }
  return '';
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
    result?: unknown;
    text?: unknown;
  };

  const status = data.status ?? 'RUNNING';
  const result = extractTextFromUnknown(data.result) || extractTextFromUnknown(data.text) || undefined;
  return { status, result: result || undefined };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Mantém o SSE do browser vivo enquanto uma Promise longa não gera eventos. */
async function withProgressTicks<T>(
  work: Promise<T>,
  onTick: () => void,
  intervalMs = 8_000,
): Promise<T> {
  const pending = work;
  while (true) {
    const raced = await Promise.race([
      pending.then(v => ({ kind: 'done' as const, v })),
      sleep(intervalMs).then(() => ({ kind: 'idle' as const })),
    ]);
    if (raced.kind === 'idle') {
      onTick();
      continue;
    }
    return raced.v;
  }
}

/** Grok costuma encerrar o SSE ainda em RUNNING; o resultado só aparece no GET run. */
async function pollRunUntilDone(
  config: CursorConfig,
  agentId: string,
  runId: string,
  deadlineMs: number,
  onProgress?: CursorProgressCallback,
): Promise<{ status: CursorRunStatus; result?: string }> {
  let last: { status: CursorRunStatus; result?: string } = { status: 'RUNNING' };
  while (Date.now() < deadlineMs) {
    last = await getRun(config, agentId, runId);
    onProgress?.({ type: 'status', status: last.status });
    if (TERMINAL_STATUSES.has(last.status)) return last;
    const waitMs = Math.min(4_000, Math.max(500, deadlineMs - Date.now()));
    await sleep(waitMs);
  }
  return last;
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

function appendAssistantText(
  state: { assistantText: string },
  chunk: string,
  onProgress?: CursorProgressCallback,
): void {
  if (!chunk) return;
  state.assistantText += chunk;
  onProgress?.({ type: 'delta', chars: state.assistantText.length });
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
  const eventName = evt.event || 'message';

  if (eventName === 'status') {
    const payload = parseJsonData<{ status?: CursorRunStatus }>(evt.data);
    if (payload?.status) {
      state.lastStatus = payload.status;
      onProgress?.({ type: 'status', status: payload.status });
    }
    return;
  }

  if (eventName === 'assistant') {
    const payload = parseJsonData<unknown>(evt.data);
    const chunk = extractTextFromUnknown(payload);
    if (chunk) appendAssistantText(state, chunk, onProgress);
    return;
  }

  if (eventName === 'message') {
    const payload = parseJsonData<unknown>(evt.data);
    const typed = payload && typeof payload === 'object' ? (payload as { type?: unknown }) : null;
    if (typeof typed?.type === 'string' && typed.type !== 'message') {
      handleSseEvent({ event: typed.type, data: evt.data }, state, onProgress);
      return;
    }
    const chunk = extractTextFromUnknown(payload);
    if (chunk) appendAssistantText(state, chunk, onProgress);
    return;
  }

  if (eventName === 'interaction_update') {
    const payload = parseJsonData<unknown>(evt.data);
    const chunk = extractTextFromUnknown(payload);
    if (chunk) appendAssistantText(state, chunk, onProgress);
    return;
  }

  if (eventName === 'thinking' || eventName === 'heartbeat' || eventName === 'tool_call') {
    onProgress?.({ type: 'status', status: state.lastStatus || 'RUNNING' });
    return;
  }

  if (eventName === 'result') {
    const payload = parseJsonData<{ status?: CursorRunStatus }>(evt.data);
    const status = payload?.status && TERMINAL_STATUSES.has(payload.status) ? payload.status : 'FINISHED';
    const text = (extractTextFromUnknown(payload) || state.assistantText).trim();
    state.terminal = { status, text };
    state.lastStatus = status;
    return;
  }

  if (eventName === 'done') {
    if (!state.terminal && state.assistantText.trim()) {
      const status = TERMINAL_STATUSES.has(state.lastStatus) ? state.lastStatus : 'FINISHED';
      state.terminal = { status, text: state.assistantText.trim() };
      state.lastStatus = status;
    }
    return;
  }

  if (eventName === 'error') {
    const payload = parseJsonData<{ message?: string; error?: string }>(evt.data);
    throw new Error(payload?.message?.trim() || payload?.error?.trim() || 'Erro no stream do Cursor');
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

  let res: Response;
  try {
    res = await withProgressTicks(
      fetch(url, {
        method: 'GET',
        headers: authHeaders(config.apiKey, { Accept: 'text/event-stream' }),
        signal: AbortSignal.timeout(remainingMs),
      }),
      () => onProgress?.({ type: 'status', status: 'RUNNING' }),
    );
  } catch {
    return pollRunUntilDone(config, agentId, runId, deadlineMs, onProgress);
  }

  if (res.status === 410) {
    return pollRunUntilDone(config, agentId, runId, deadlineMs, onProgress);
  }

  if (!res.ok) {
    const raw = await res.text();
    throw new Error(`Cursor stream HTTP ${res.status}: ${raw.slice(0, 800)}`);
  }

  const body = res.body;
  if (!body) {
    return pollRunUntilDone(config, agentId, runId, deadlineMs, onProgress);
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

  const consumeEvents = (events: SseEvent[]): { status: CursorRunStatus; result?: string } | null => {
    for (const evt of events) {
      handleSseEvent(evt, state, onProgress);
      if (state.terminal) {
        assertTerminalStatus(state.terminal.status);
        return { status: state.terminal.status, result: state.terminal.text };
      }
    }
    return null;
  };

  const tickAlive = () => {
    onProgress?.({ type: 'status', status: state.lastStatus || 'RUNNING' });
  };

  let pendingRead: Promise<ReadableStreamReadResult<Uint8Array>> | null = null;

  try {
    while (Date.now() < deadlineMs) {
      if (!pendingRead) pendingRead = reader.read();
      const raced = await Promise.race([
        pendingRead.then(r => ({ kind: 'read' as const, r })),
        sleep(8_000).then(() => ({ kind: 'idle' as const })),
      ]);
      if (raced.kind === 'idle') {
        // Grok pode ficar minutos só em raciocínio, sem bytes no SSE.
        // O tick impede o proxy/navegador de derrubar o canal Worker→browser.
        tickAlive();
        continue;
      }
      pendingRead = null;
      const { done, value } = raced.r;
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const parsed = parseSseChunk(buffer);
      buffer = parsed.rest;
      const finished = consumeEvents(parsed.events);
      if (finished) {
        await reader.cancel().catch(() => undefined);
        return finished;
      }
    }
  } catch {
    // Stream do Cursor caiu (ociosidade/timeout). O GET run ainda pode ter o resultado.
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    const parsed = parseSseChunk(buffer.endsWith('\n\n') ? buffer : `${buffer}\n\n`);
    const finished = consumeEvents(parsed.events);
    if (finished) return finished;
  }

  if (state.terminal) {
    assertTerminalStatus(state.terminal.status);
    return { status: state.terminal.status, result: state.terminal.text };
  }

  if (state.assistantText.trim()) {
    const status = TERMINAL_STATUSES.has(state.lastStatus) ? state.lastStatus : 'FINISHED';
    assertTerminalStatus(status);
    return { status, result: state.assistantText.trim() };
  }

  return pollRunUntilDone(config, agentId, runId, deadlineMs, onProgress);
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
  detectTruncated: (text: string) => boolean = detectOutputTruncated,
): Promise<CursorAgentResult> {
  const deadlineMs = Date.now() + config.timeoutMs;
  let agentId: string | undefined;

  try {
    onProgress?.({ type: 'status', status: 'CREATING' });
    const created = await withProgressTicks(createAgentRun(config, prompt, images), () => {
      onProgress?.({ type: 'status', status: 'CREATING' });
    });
    agentId = created.agentId;
    onProgress?.({ type: 'status', status: 'RUNNING' });

    const terminal = await streamRunUntilDone(config, created.agentId, created.runId, deadlineMs, onProgress);

    if (!TERMINAL_STATUSES.has(terminal.status)) {
      throw new Error('Timeout');
    }

    assertTerminalStatus(terminal.status);

    const text = terminal.result?.trim() ?? '';
    if (!text) {
      throw new Error('Resposta vazia do Cursor. Com o Grok isso pode ocorrer se o modelo só raciocinar sem devolver o CSV — tente novamente ou use o Composer.');
    }

    return {
      text,
      outputTruncated: detectTruncated(text),
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
