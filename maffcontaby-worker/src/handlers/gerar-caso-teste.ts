import { callGeminiJson, type GeminiImagePart } from '../gemini-client';
import { buildGerarCasoTestePrompt } from '../prompts/gerar-caso-teste';
import type {
  GeminiAiResult,
  GerarCasoTesteRequest,
  GerarCasoTesteResponse,
  QaseCase,
  SourceFileInput,
} from '../types/gerar-caso-teste';


export type GerarCasoTesteEnv = {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  GEMINI_MAX_INPUT_CHARS?: string;
  GEMINI_TIMEOUT_SECONDS?: string;
};


const MAX_IMAGES = 8;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_INPUT_CHARS = 150_000;
const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_TIMEOUT_SECONDS = 180;

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

function normalizeCases(raw: unknown): QaseCase[] {
  if (!Array.isArray(raw)) return [];
  const cases: QaseCase[] = [];
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
        const action = typeof s.action === 'string' ? s.action.trim() : '';
        const expected_result =
          typeof s.expected_result === 'string'
            ? s.expected_result.trim()
            : typeof s.expectedResult === 'string'
              ? s.expectedResult.trim()
              : '';
        if (!action || !expected_result) return null;
        const data = typeof s.data === 'string' ? s.data.trim() : undefined;
        return { action, expected_result, ...(data ? { data } : {}) };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

    if (steps.length === 0) continue;

    const tags = Array.isArray(o.tags)
      ? o.tags
          .filter((t): t is string => typeof t === 'string' && Boolean(t.trim()))
          .map(t => t.trim())
      : undefined;

    cases.push({
      title,
      description: typeof o.description === 'string' ? o.description.trim() : undefined,
      preconditions: typeof o.preconditions === 'string' ? o.preconditions.trim() : undefined,
      priority: typeof o.priority === 'string' ? o.priority.trim() : undefined,
      severity: typeof o.severity === 'string' ? o.severity.trim() : undefined,
      tags: tags?.length ? tags : undefined,
      steps,
    });
  }
  return cases;
}

function parseGeminiResult(raw: string): GeminiAiResult {
  const parsed = JSON.parse(stripJsonFence(raw)) as Record<string, unknown>;
  const markdown = typeof parsed.markdown === 'string' ? parsed.markdown.trim() : '';
  const cases = normalizeCases(parsed.cases);
  if (!markdown && cases.length === 0) {
    throw new Error('JSON da IA sem markdown e sem cases');
  }
  return {
    markdown: markdown || buildFallbackMarkdown(cases),
    cases,
  };
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

function validateRequest(body: GerarCasoTesteRequest | null): { ok: true; body: GerarCasoTesteRequest } | { ok: false; message: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, message: 'Body JSON inválido' };
  }

  const hasCode = (body.sourceFiles?.length ?? 0) > 0;
  const hasImages = (body.images?.length ?? 0) > 0;
  const hasContext =
    Boolean(body.systemPath?.trim()) ||
    Boolean(body.sourcePathLabel?.trim()) ||
    Boolean(body.extraContext?.trim());

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

export async function handleGerarCasoTeste(request: Request, env: GerarCasoTesteEnv): Promise<Response> {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return text('GEMINI_API_KEY não configurada no Worker', 500);
  }

  const model = env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  const maxChars = parsePositiveInt(env.GEMINI_MAX_INPUT_CHARS, DEFAULT_MAX_INPUT_CHARS);
  const timeoutSeconds = parsePositiveInt(env.GEMINI_TIMEOUT_SECONDS, DEFAULT_TIMEOUT_SECONDS);

  let body: GerarCasoTesteRequest | null = null;
  try {
    body = (await request.json()) as GerarCasoTesteRequest;
  } catch {
    return text('Body JSON inválido', 400);
  }

  const validated = validateRequest(body);
  if (!validated.ok) return text(validated.message, 400);

  const req = validated.body;
  const systemPath = req.systemPath?.trim() ?? '';
  const { files, truncated } = prepareSourceFiles(req.sourceFiles, maxChars, systemPath);

  const geminiImages: GeminiImagePart[] = (req.images ?? []).map(img => ({
    mimeType: normalizeMime(img.mimeType),
    base64: img.base64.replace(/\s/g, ''),
  }));

  const prompt = buildGerarCasoTestePrompt(req, files, truncated, geminiImages.length);

  let rawJson: string;
  try {
    rawJson = await callGeminiJson(
      { apiKey, model, timeoutMs: timeoutSeconds * 1000 },
      prompt,
      geminiImages,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao chamar Gemini';
    if (msg.includes('Timeout') || msg.includes('timeout') || msg.includes('aborted')) {
      return text('Tempo esgotado ao gerar casos de teste (IA)', 504);
    }
    return json({ ok: false, error: msg }, { status: 502 });
  }

  let result: GeminiAiResult;
  try {
    result = parseGeminiResult(rawJson);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Resposta inválida da IA';
    return json({ ok: false, error: msg }, { status: 502 });
  }

  if (result.cases.length === 0) {
    return json({ ok: false, error: 'A IA não retornou casos de teste válidos' }, { status: 502 });
  }

  const response: GerarCasoTesteResponse = {
    ok: true,
    markdown: result.markdown,
    cases: result.cases,
    meta: {
      model,
      truncated,
      filesIncluded: files.length,
    },
  };

  return json(response);
}
