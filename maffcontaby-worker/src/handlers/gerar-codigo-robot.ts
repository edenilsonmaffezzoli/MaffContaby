import type { AuthenticatedFetchResult } from '../fetch-authenticated-url';
import { callCursorForTestCases, type CursorProgressCallback } from '../cursor-client';
import { buildGerarCodigoRobotPrompt } from '../prompts/gerar-codigo-robot';
import {
  formatPromptForDownload,
  prepareGeneration,
  startSseHeartbeat,
  type GerarCasoTesteEnv,
  type PreparedGeneration,
} from './gerar-caso-teste';
import type { GerarCodigoRobotResponse, RobotFile } from '../types/gerar-codigo-robot';

function stripJsonFence(raw: string): string {
  let s = raw.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }
  return s;
}

/** Extrai o primeiro objeto JSON balanceado do texto (tolera texto antes/depois). */
function extractJsonObject(raw: string): string {
  const start = raw.indexOf('{');
  if (start < 0) return raw;
  let depth = 0;
  let inStr = false;
  let escaped = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return raw.slice(start);
}

/** Normaliza um path relativo seguro (sem barra inicial, sem traversal). */
function sanitizeRelativePath(path: string): string | null {
  const normalized = path
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^[a-zA-Z]:\//, '');
  if (!normalized) return null;
  const segments = normalized.split('/').filter(seg => seg && seg !== '.');
  if (segments.some(seg => seg === '..')) return null;
  return segments.join('/');
}

export type ParseRobotProjectResult = {
  summary: string;
  files: RobotFile[];
};

export function parseRobotProject(raw: string): ParseRobotProjectResult {
  const candidate = extractJsonObject(stripJsonFence(raw));
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    throw new Error('Resposta da IA não é um JSON válido de projeto Robot Framework');
  }

  const rawFiles = Array.isArray(parsed.files) ? parsed.files : [];
  const seen = new Set<string>();
  const files: RobotFile[] = [];

  for (const item of rawFiles) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const rawPath = typeof o.path === 'string' ? o.path : '';
    const content = typeof o.content === 'string' ? o.content : '';
    const path = sanitizeRelativePath(rawPath);
    if (!path || !content.trim()) continue;
    if (seen.has(path)) continue;
    seen.add(path);
    files.push({ path, content });
  }

  if (files.length === 0) {
    throw new Error('A IA não retornou arquivos válidos para o projeto Robot Framework');
  }

  const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
  return { summary, files };
}

/** Trunca quando não há JSON com "files" fechado. */
function detectRobotTruncated(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (!trimmed.includes('"files"')) return true;
  const obj = extractJsonObject(stripJsonFence(trimmed));
  try {
    const parsed = JSON.parse(obj) as { files?: unknown };
    return !Array.isArray(parsed.files) || parsed.files.length === 0;
  } catch {
    return true;
  }
}

function buildRobotSuccessResponse(
  prep: PreparedGeneration,
  cursorOut: Awaited<ReturnType<typeof callCursorForTestCases>>,
  result: ParseRobotProjectResult,
): GerarCodigoRobotResponse {
  const { model, prompt, reqImages, targetAuth, useAuth, truncated, pageContext } = prep;
  return {
    ok: true,
    summary: result.summary,
    files: result.files,
    prompt: formatPromptForDownload(prompt, reqImages, targetAuth),
    meta: {
      model,
      truncated: truncated || pageContext.truncated,
      filesGenerated: result.files.length,
      rawResponseLength: cursorOut.text.length,
      outputTruncated: cursorOut.outputTruncated,
      runStatus: cursorOut.runStatus,
      urlContentFetched: pageContext.fetched,
      urlContentTruncated: pageContext.truncated || undefined,
      urlFetchError: pageContext.fetchError,
      authAttempted: useAuth ? (pageContext as AuthenticatedFetchResult).authAttempted : undefined,
      authSuccess: useAuth ? (pageContext as AuthenticatedFetchResult).authSuccess : undefined,
      authMode: useAuth ? (pageContext as AuthenticatedFetchResult).authMode : undefined,
      authError: useAuth ? (pageContext as AuthenticatedFetchResult).authError : undefined,
    },
  };
}

function sseEncode(event: string, data: unknown): Uint8Array {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  return new TextEncoder().encode(`event: ${event}\ndata: ${payload}\n\n`);
}

/** Versão SSE: gera um projeto Robot Framework + Browser Library com base no front-end. */
export async function handleGerarCodigoRobotStream(request: Request, env: GerarCasoTesteEnv, isAdmin = false): Promise<Response> {
  const prepared = await prepareGeneration(request, env, buildGerarCodigoRobotPrompt, isAdmin);
  if (!prepared.ok) return prepared.response;

  const prep = prepared.data;
  const { config, prompt, cursorImages, reqImages, targetAuth, pageContext } = prep;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(sseEncode(event, data));
        } catch {
          // controller já fechado
        }
      };

      send('progress', {
        phase: pageContext.fetched ? 'building-prompt' : 'calling-ai',
        urlContentFetched: pageContext.fetched,
        urlFetchError: pageContext.fetchError,
      });

      const onProgress: CursorProgressCallback = ev => {
        if (ev.type === 'status') send('status', { status: ev.status });
        else send('delta', { chars: ev.chars });
      };

      send('progress', { phase: 'calling-ai' });

      const stopHeartbeat = startSseHeartbeat(controller);
      let cursorOut: Awaited<ReturnType<typeof callCursorForTestCases>>;
      try {
        cursorOut = await callCursorForTestCases(config, prompt, cursorImages, onProgress, detectRobotTruncated);
      } catch (err) {
        stopHeartbeat();
        const msg = err instanceof Error ? err.message : 'Erro ao chamar Cursor';
        const friendly =
          msg.includes('Timeout') || msg.includes('timeout') || msg.includes('aborted')
            ? 'Tempo esgotado ao gerar o código automatizado (Cursor)'
            : msg;
        send('error', { error: friendly, prompt: formatPromptForDownload(prompt, reqImages, targetAuth) });
        controller.close();
        return;
      }
      stopHeartbeat();

      send('progress', { phase: 'parsing' });

      let result: ParseRobotProjectResult;
      try {
        result = parseRobotProject(cursorOut.text);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Resposta inválida da IA';
        send('error', { error: msg, prompt: formatPromptForDownload(prompt, reqImages, targetAuth) });
        controller.close();
        return;
      }

      send('result', buildRobotSuccessResponse(prep, cursorOut, result));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  });
}
