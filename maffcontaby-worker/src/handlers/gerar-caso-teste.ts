import { fetchAuthenticatedPage, type AuthenticatedFetchResult } from '../fetch-authenticated-url';
import { fetchSystemPathContent, isHttpSystemPath } from '../fetch-system-url';
import { callCursorForTestCases, type CursorImagePart, type CursorProgressCallback } from '../cursor-client';
import { groupCasesBySubject } from '../group-cases-by-subject';
import { parseAiQaseCsv } from '../parse-ai-qase-csv';
import { buildGerarCasoTestePrompt } from '../prompts/gerar-caso-teste';
import type {
  AiParseResult,
  GerarCasoTesteErrorResponse,
  GerarCasoTesteRequest,
  GerarCasoTesteResponse,
  QaseCase,
  SourceFileInput,
} from '../types/gerar-caso-teste';
import type { TargetAuthInput } from '../types/target-auth';


export type GerarCasoTesteEnv = {
  CURSOR_API_KEY?: string;
  CURSOR_MODEL?: string;
  CURSOR_MAX_INPUT_CHARS?: string;
  CURSOR_TIMEOUT_SECONDS?: string;
};


const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_INPUT_CHARS = 150_000;
const DEFAULT_MODEL = 'composer-2.5';
const DEFAULT_TIMEOUT_SECONDS = 300;
const URL_PAGE_MAX_CHARS = 60_000;

const CODE_EXT_PRIORITY = ['.tsx', '.ts', '.cs', '.jsx', '.js', '.vue', '.py', '.java', '.go'];

function json(data: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { ...init, headers });
}

function text(message: string, status: number) {
  return new Response(message, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function estimateBase64Bytes(b64: string) {
  const len = b64.length;
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((len * 3) / 4) - padding;
}

const ALLOWED_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function normalizeMime(mime: string) {
  const m = mime.trim().toLowerCase();
  if (m === 'image/jpg') return 'image/jpeg';
  return m;
}

function redactSecretsInPrompt(prompt: string, auth?: TargetAuthInput): string {
  let out = prompt;
  const password = auth?.password;
  if (password && password.length > 0) {
    out = out.split(password).join('***');
  }
  return out;
}

/** Prompt textual para export/download; imagens vão separadas ao Cursor (base64). */
function formatPromptForDownload(
  prompt: string,
  images: Array<{ mimeType: string; name?: string }>,
  auth?: TargetAuthInput,
): string {
  const redacted = redactSecretsInPrompt(prompt, auth);
  if (!images.length) return redacted;
  const lines = images.map((img, i) => {
    const label = img.name?.trim() || `imagem-${i + 1}`;
    return `- ${label} (${normalizeMime(img.mimeType)})`;
  });
  return `${redacted}\n\n---\nImagens enviadas ao Cursor (não incluídas neste arquivo): ${images.length}\n${lines.join('\n')}`;
}

function gerarCasoTesteError(
  message: string,
  status: number,
  promptText: string,
  images: Array<{ mimeType: string; name?: string }>,
  auth?: TargetAuthInput,
): Response {
  const body: GerarCasoTesteErrorResponse = {
    ok: false,
    error: message,
    prompt: formatPromptForDownload(promptText, images, auth),
  };
  return json(body, { status });
}

function filePriority(path: string, systemPath: string) {
  const lower = path.toLowerCase();
  let score = 0;
  if (systemPath && lower.includes(systemPath.toLowerCase())) score += 100;
  for (let i = 0; i < CODE_EXT_PRIORITY.length; i++) {
    if (lower.endsWith(CODE_EXT_PRIORITY[i])) {
      score += 50 - i;
      break;
    }
  }
  return score;
}

/** Ordena e trunca arquivos de código conforme limite de caracteres. */
export function prepareSourceFiles(
  files: SourceFileInput[] | undefined,
  maxChars: number,
  systemPath: string,
): { files: SourceFileInput[]; truncated: boolean } {
  if (!files?.length) return { files: [], truncated: false };

  const sorted = [...files]
    .filter(f => f.path?.trim() && typeof f.content === 'string')
    .sort((a, b) => {
      const pa = filePriority(a.path, systemPath);
      const pb = filePriority(b.path, systemPath);
      if (pb !== pa) return pb - pa;
      return a.path.localeCompare(b.path);
    });

  const out: SourceFileInput[] = [];
  let total = 0;
  let truncated = false;

  for (const file of sorted) {
    const content = file.content;
    const remaining = maxChars - total;
    if (remaining <= 0) {
      truncated = true;
      break;
    }
    if (content.length <= remaining) {
      out.push({ path: file.path.trim(), content });
      total += content.length;
    } else {
      out.push({ path: file.path.trim(), content: content.slice(0, remaining) + '\n/* … truncado … */' });
      truncated = true;
      break;
    }
  }

  return { files: out, truncated };
}

function stripJsonFence(raw: string) {
  let s = raw.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }
  return s;
}

function slugTag(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '');
}

function buildExtraTags(o: Record<string, unknown>, suite: string, subsuite: string): string[] | undefined {
  const reserved = new Set([slugTag(suite), slugTag(subsuite)].filter(Boolean));
  const tags: string[] = [];
  if (Array.isArray(o.tags)) {
    for (const t of o.tags) {
      if (typeof t !== 'string' || !t.trim()) continue;
      const slug = slugTag(t);
      if (slug && !reserved.has(slug) && !tags.includes(slug)) tags.push(slug);
    }
  }
  return tags.length ? tags : undefined;
}

export type NormalizeCasesResult = {
  cases: QaseCase[];
  rawCount: number;
  dropped: number;
};

export function normalizeCases(raw: unknown): NormalizeCasesResult {
  if (!Array.isArray(raw)) return { cases: [], rawCount: 0, dropped: 0 };
  const cases: QaseCase[] = [];
  const rawCount = raw.length;
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const title = typeof o.title === 'string' ? o.title.trim() : '';
    if (!title) continue;

    const stepsRaw = Array.isArray(o.steps) ? o.steps : [];
    const steps = stepsRaw
      .map(step => {
        if (!step || typeof step !== 'object') return null;
        const s = step as Record<string, unknown>;
        const action =
          typeof s.action === 'string'
            ? s.action.trim()
            : typeof s.actions === 'string'
              ? s.actions.trim()
              : '';
        const expected_result =
          typeof s.expected_result === 'string'
            ? s.expected_result.trim()
            : typeof s.expectedResult === 'string'
              ? s.expectedResult.trim()
              : typeof s.expectedresults === 'string'
                ? s.expectedresults.trim()
                : '';
        if (!action || !expected_result) return null;
        return { action, expected_result };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .slice(0, 7);

    if (steps.length === 0) continue;

    const suite = typeof o.suite === 'string' ? o.suite.trim() : '';
    const subsuite = typeof o.subsuite === 'string' ? o.subsuite.trim() : '';

    cases.push({
      title,
      description: typeof o.description === 'string' ? o.description.trim() : undefined,
      preconditions: typeof o.preconditions === 'string' ? o.preconditions.trim() : undefined,
      priority: typeof o.priority === 'string' ? o.priority.trim() : undefined,
      suite: suite || undefined,
      subsuite: subsuite || undefined,
      tags: buildExtraTags(o, suite, subsuite),
      steps,
    });
  }
  return { cases, rawCount, dropped: rawCount - cases.length };
}

function formatAnalysisMarkdown(analysis: Record<string, unknown>): string {
  const lines: string[] = ['# Resumo da análise', ''];
  const modulos = Array.isArray(analysis.modulos)
    ? analysis.modulos.filter((m): m is string => typeof m === 'string' && Boolean(m.trim()))
    : [];
  if (modulos.length) {
    lines.push('## Módulos identificados', '', ...modulos.map(m => `- ${m}`), '');
  }
  if (typeof analysis.totalCasos === 'number') {
    lines.push(`**Total de casos:** ${analysis.totalCasos}`, '');
  }
  const funcs = Array.isArray(analysis.funcionalidades)
    ? analysis.funcionalidades.filter((f): f is string => typeof f === 'string' && Boolean(f.trim()))
    : [];
  if (funcs.length) {
    lines.push('## Funcionalidades cobertas', '', ...funcs.map(f => `- ${f}`), '');
  }
  const lacunas = Array.isArray(analysis.semCobertura)
    ? analysis.semCobertura.filter((f): f is string => typeof f === 'string' && Boolean(f.trim()))
    : [];
  if (lacunas.length) {
    lines.push('## Lacunas de cobertura', '', ...lacunas.map(f => `- ${f}`), '');
  }
  const riscos = Array.isArray(analysis.riscos)
    ? analysis.riscos.filter((f): f is string => typeof f === 'string' && Boolean(f.trim()))
    : [];
  if (riscos.length) {
    lines.push('## Riscos', '', ...riscos.map(f => `- ${f}`), '');
  }
  return lines.join('\n');
}

function extractModulos(analysis: Record<string, unknown> | undefined): string[] {
  if (!analysis || !Array.isArray(analysis.modulos)) return [];
  return analysis.modulos.filter((m): m is string => typeof m === 'string' && Boolean(m.trim()));
}

export type ParseAiResult = AiParseResult & {
  casesFromAi: number;
  casesAfterNormalize: number;
  casesDropped: number;
};

function tryParseAiJson(raw: string): ParseAiResult | null {
  try {
    const parsed = JSON.parse(stripJsonFence(raw)) as Record<string, unknown>;
    let markdown = typeof parsed.markdown === 'string' ? parsed.markdown.trim() : '';
    const analysis =
      parsed.analysis && typeof parsed.analysis === 'object'
        ? (parsed.analysis as Record<string, unknown>)
        : undefined;
    const modulos = extractModulos(analysis);
    const { cases: normalized, rawCount, dropped } = normalizeCases(parsed.cases);
    if (!normalized.length) return null;
    const grouped = groupCasesBySubject(normalized, modulos);

    if (analysis) {
      const analysisBlock = formatAnalysisMarkdown(analysis);
      markdown = markdown ? `${analysisBlock}\n\n---\n\n${markdown}` : analysisBlock;
    }
    return {
      markdown: markdown || buildFallbackMarkdown(grouped.cases),
      cases: grouped.cases,
      suitesUsed: grouped.suitesUsed,
      groupingWarning: grouped.groupingWarning,
      casesFromAi: rawCount,
      casesAfterNormalize: grouped.cases.length,
      casesDropped: dropped,
    };
  } catch {
    return null;
  }
}

export function parseAiResult(raw: string): ParseAiResult {
  try {
    const { cases: normalized, rawCount, dropped } = parseAiQaseCsv(raw);
    const grouped = groupCasesBySubject(normalized, []);
    return {
      markdown: buildFallbackMarkdown(grouped.cases),
      cases: grouped.cases,
      suitesUsed: grouped.suitesUsed,
      groupingWarning: grouped.groupingWarning,
      casesFromAi: rawCount,
      casesAfterNormalize: grouped.cases.length,
      casesDropped: dropped,
    };
  } catch {
  }

  const fromJson = tryParseAiJson(raw);
  if (fromJson) return fromJson;

  throw new Error('Resposta da IA não é CSV Qase válido nem JSON de casos');
}

function buildFallbackMarkdown(cases: QaseCase[]) {
  return cases
    .map((c, i) => {
      const steps = c.steps
        .map((s, j) => `${j + 1}. **Ação:** ${s.action}\n   **Resultado esperado:** ${s.expected_result}`)
        .join('\n');
      return `## Caso ${i + 1}: ${c.title}\n\n${c.description ? `**Descrição:** ${c.description}\n\n` : ''}${c.preconditions ? `**Pré-condições:** ${c.preconditions}\n\n` : ''}### Passos\n${steps}`;
    })
    .join('\n\n---\n\n');
}

function validateTargetAuth(
  auth: TargetAuthInput | undefined,
  systemPath: string,
): { ok: true } | { ok: false; message: string } {
  if (!auth) return { ok: true };

  const loginUrl = auth.loginUrl?.trim() ?? '';
  const username = auth.username?.trim() ?? '';
  const password = auth.password ?? '';
  const hasAny = Boolean(loginUrl || username || password);

  if (!hasAny) return { ok: true };

  if (!loginUrl) return { ok: false, message: 'Informe a URL de login do sistema alvo' };
  if (!username) return { ok: false, message: 'Informe o usuário de teste do sistema alvo' };
  if (!password) return { ok: false, message: 'Informe a senha de teste do sistema alvo' };
  if (!systemPath || !isHttpSystemPath(systemPath)) {
    return {
      ok: false,
      message: 'Com autenticação, informe a URL após login (Path do Sistema) em formato http(s)',
    };
  }

  return { ok: true };
}

function validateRequest(body: GerarCasoTesteRequest | null): { ok: true; body: GerarCasoTesteRequest } | { ok: false; message: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, message: 'Body JSON inválido' };
  }

  const systemPath = body.systemPath?.trim() ?? '';
  const authCheck = validateTargetAuth(body.targetAuth, systemPath);
  if (!authCheck.ok) return authCheck;

  const hasCode = (body.sourceFiles?.length ?? 0) > 0;
  const hasImages = (body.images?.length ?? 0) > 0;
  const hasTargetAuth =
    Boolean(body.targetAuth?.loginUrl?.trim()) &&
    Boolean(body.targetAuth?.username?.trim()) &&
    Boolean(body.targetAuth?.password);
  const hasContext =
    Boolean(systemPath) ||
    Boolean(body.sourcePathLabel?.trim()) ||
    Boolean(body.extraContext?.trim()) ||
    hasTargetAuth;

  if (!hasCode && !hasImages && !hasContext) {
    return { ok: false, message: 'Informe path do sistema, código fonte, imagens ou contexto adicional' };
  }

  if (body.images && body.images.length > MAX_IMAGES) {
    return { ok: false, message: `Máximo de ${MAX_IMAGES} imagens` };
  }

  for (const img of body.images ?? []) {
    const mime = normalizeMime(img.mimeType ?? '');
    if (!ALLOWED_IMAGE_MIME.has(mime)) {
      return { ok: false, message: `Tipo de imagem não suportado: ${img.mimeType}` };
    }
    const b64 = (img.base64 ?? '').replace(/\s/g, '');
    if (!b64) return { ok: false, message: 'Imagem sem dados base64' };
    if (estimateBase64Bytes(b64) > MAX_IMAGE_BYTES) {
      return { ok: false, message: 'Imagem excede 4 MB' };
    }
  }

  return { ok: true, body };
}

type PageContext = Awaited<ReturnType<typeof fetchSystemPathContent>> | AuthenticatedFetchResult;

type PreparedGeneration = {
  config: { apiKey: string; model: string; timeoutMs: number };
  model: string;
  prompt: string;
  cursorImages: CursorImagePart[];
  reqImages: Array<{ mimeType: string; base64: string; name?: string }>;
  targetAuth: TargetAuthInput | undefined;
  useAuth: boolean;
  files: SourceFileInput[];
  truncated: boolean;
  pageContext: PageContext;
};

type PrepareGenerationResult =
  | { ok: true; data: PreparedGeneration }
  | { ok: false; response: Response };

/** Valida o request, busca a página (com/sem login) e monta o prompt. Compartilhado pelos handlers. */
async function prepareGeneration(
  request: Request,
  env: GerarCasoTesteEnv,
): Promise<PrepareGenerationResult> {
  const apiKey = env.CURSOR_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, response: text('CURSOR_API_KEY não configurada no Worker', 500) };
  }

  const model = env.CURSOR_MODEL?.trim() || DEFAULT_MODEL;
  const maxChars = parsePositiveInt(env.CURSOR_MAX_INPUT_CHARS, DEFAULT_MAX_INPUT_CHARS);
  const timeoutSeconds = parsePositiveInt(env.CURSOR_TIMEOUT_SECONDS, DEFAULT_TIMEOUT_SECONDS);

  let body: GerarCasoTesteRequest | null = null;
  try {
    body = (await request.json()) as GerarCasoTesteRequest;
  } catch {
    return { ok: false, response: text('Body JSON inválido', 400) };
  }

  const validated = validateRequest(body);
  if (!validated.ok) return { ok: false, response: text(validated.message, 400) };

  const req = validated.body;
  const systemPath = req.systemPath?.trim() ?? '';
  const targetAuth = req.targetAuth;
  const useAuth =
    Boolean(targetAuth?.loginUrl?.trim()) &&
    Boolean(targetAuth?.username?.trim()) &&
    Boolean(targetAuth?.password);

  const pageContext: PageContext = useAuth
    ? await fetchAuthenticatedPage(systemPath, targetAuth!, URL_PAGE_MAX_CHARS)
    : systemPath
      ? await fetchSystemPathContent(systemPath, URL_PAGE_MAX_CHARS)
      : { content: '', fetched: false, truncated: false };

  const pageChars = pageContext.content.length;
  const codeBudget = Math.max(0, maxChars - pageChars);
  const { files, truncated } = prepareSourceFiles(req.sourceFiles, codeBudget, systemPath);

  const cursorImages: CursorImagePart[] = (req.images ?? []).map(img => ({
    mimeType: normalizeMime(img.mimeType),
    base64: img.base64.replace(/\s/g, ''),
  }));

  const prompt = buildGerarCasoTestePrompt(req, files, truncated, cursorImages.length, pageContext);

  return {
    ok: true,
    data: {
      config: { apiKey, model, timeoutMs: timeoutSeconds * 1000 },
      model,
      prompt,
      cursorImages,
      reqImages: req.images ?? [],
      targetAuth,
      useAuth,
      files,
      truncated,
      pageContext,
    },
  };
}

/** Monta a resposta final de sucesso a partir do texto bruto da IA. */
function buildSuccessResponse(prep: PreparedGeneration, cursorOut: Awaited<ReturnType<typeof callCursorForTestCases>>, result: ParseAiResult): GerarCasoTesteResponse {
  const { model, prompt, reqImages, targetAuth, useAuth, files, truncated, pageContext } = prep;
  return {
    ok: true,
    markdown: result.markdown,
    cases: result.cases,
    prompt: formatPromptForDownload(prompt, reqImages, targetAuth),
    meta: {
      model,
      truncated: truncated || pageContext.truncated,
      filesIncluded: files.length,
      suitesUsed: result.suitesUsed,
      groupingWarning: result.groupingWarning,
      casesFromAi: result.casesFromAi,
      casesAfterNormalize: result.casesAfterNormalize,
      casesDropped: result.casesDropped,
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

export async function handleGerarCasoTeste(request: Request, env: GerarCasoTesteEnv): Promise<Response> {
  const prepared = await prepareGeneration(request, env);
  if (!prepared.ok) return prepared.response;

  const prep = prepared.data;
  const { config, prompt, cursorImages, reqImages, targetAuth } = prep;

  let cursorOut: Awaited<ReturnType<typeof callCursorForTestCases>>;
  try {
    cursorOut = await callCursorForTestCases(config, prompt, cursorImages);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao chamar Cursor';
    if (msg.includes('Timeout') || msg.includes('timeout') || msg.includes('aborted')) {
      return gerarCasoTesteError('Tempo esgotado ao gerar casos de teste (Cursor)', 504, prompt, reqImages, targetAuth);
    }
    return gerarCasoTesteError(msg, 502, prompt, reqImages, targetAuth);
  }

  let result: ParseAiResult;
  try {
    result = parseAiResult(cursorOut.text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Resposta inválida da IA';
    return gerarCasoTesteError(msg, 502, prompt, reqImages, targetAuth);
  }

  if (result.cases.length === 0) {
    return gerarCasoTesteError('A IA não retornou casos de teste válidos', 502, prompt, reqImages, targetAuth);
  }

  return json(buildSuccessResponse(prep, cursorOut, result));
}

function sseEncode(event: string, data: unknown): Uint8Array {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  return new TextEncoder().encode(`event: ${event}\ndata: ${payload}\n\n`);
}

/** Versão SSE: emite eventos de progresso ao cliente enquanto a IA gera os casos. */
export async function handleGerarCasoTesteStream(request: Request, env: GerarCasoTesteEnv): Promise<Response> {
  const prepared = await prepareGeneration(request, env);
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

      let cursorOut: Awaited<ReturnType<typeof callCursorForTestCases>>;
      try {
        cursorOut = await callCursorForTestCases(config, prompt, cursorImages, onProgress);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao chamar Cursor';
        const friendly =
          msg.includes('Timeout') || msg.includes('timeout') || msg.includes('aborted')
            ? 'Tempo esgotado ao gerar casos de teste (Cursor)'
            : msg;
        send('error', { error: friendly, prompt: formatPromptForDownload(prompt, reqImages, targetAuth) });
        controller.close();
        return;
      }

      send('progress', { phase: 'parsing' });

      let result: ParseAiResult;
      try {
        result = parseAiResult(cursorOut.text);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Resposta inválida da IA';
        send('error', { error: msg, prompt: formatPromptForDownload(prompt, reqImages, targetAuth) });
        controller.close();
        return;
      }

      if (result.cases.length === 0) {
        send('error', {
          error: 'A IA não retornou casos de teste válidos',
          prompt: formatPromptForDownload(prompt, reqImages, targetAuth),
        });
        controller.close();
        return;
      }

      send('result', buildSuccessResponse(prep, cursorOut, result));
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
