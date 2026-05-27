const CURSOR_API_BASE = 'https://api.cursor.com';

export type CursorConfig = {
  apiKey: string;
  model: string;
  timeoutMs: number;
  pollIntervalMs: number;
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

function authHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    'content-type': 'application/json',
  };
}

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
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
    headers: authHeaders(config.apiKey),
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

export async function pollRunUntilDone(
  config: CursorConfig,
  agentId: string,
  runId: string,
  deadlineMs: number,
): Promise<{ status: CursorRunStatus; result?: string }> {
  while (Date.now() < deadlineMs) {
    const run = await getRun(config, agentId, runId);
    if (TERMINAL_STATUSES.has(run.status)) {
      return run;
    }
    await sleep(config.pollIntervalMs);
  }
  throw new Error('Timeout');
}

/**
 * Cria agente no-repo, aguarda o run e remove o agente ao final.
 */
export async function callCursorForTestCases(
  config: CursorConfig,
  prompt: string,
  images: CursorImagePart[],
): Promise<CursorAgentResult> {
  const deadlineMs = Date.now() + config.timeoutMs;
  let agentId: string | undefined;

  try {
    const created = await createAgentRun(config, prompt, images);
    agentId = created.agentId;

    const terminal = await pollRunUntilDone(config, created.agentId, created.runId, deadlineMs);

    if (terminal.status === 'ERROR') {
      throw new Error('Run do Cursor terminou com erro');
    }
    if (terminal.status === 'CANCELLED') {
      throw new Error('Run do Cursor foi cancelado');
    }
    if (terminal.status === 'EXPIRED') {
      throw new Error('Run do Cursor expirou');
    }

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
