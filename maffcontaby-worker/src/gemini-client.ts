export type GeminiConfig = {
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxOutputTokens?: number;
};

export type GeminiImagePart = {
  mimeType: string;
  base64: string;
};

export type GeminiJsonResult = {
  text: string;
  finishReason?: string;
  outputTruncated: boolean;
};

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  error?: { message?: string };
};

const TRUNCATED_FINISH_REASONS = new Set(['MAX_TOKENS', 'RECITATION']);

export type GeminiCallOptions = {
  /** Quando true (padrão), força responseMimeType application/json. */
  jsonMode?: boolean;
};

/**
 * Chama a API Gemini com suporte a imagens inline (base64).
 */
export async function callGeminiJson(
  config: GeminiConfig,
  prompt: string,
  images: GeminiImagePart[],
  options: GeminiCallOptions = {},
): Promise<GeminiJsonResult> {
  const jsonMode = options.jsonMode !== false;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;

  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [{ text: prompt }];
  for (const img of images) {
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
  }

  const generationConfig: Record<string, unknown> = {
    temperature: 0.35,
  };
  if (jsonMode) {
    generationConfig.responseMimeType = 'application/json';
  }
  if (config.maxOutputTokens && config.maxOutputTokens > 0) {
    generationConfig.maxOutputTokens = config.maxOutputTokens;
  }

  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(config.timeoutMs),
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Gemini HTTP ${res.status}: ${raw.slice(0, 800)}`);
  }

  let data: GeminiGenerateResponse;
  try {
    data = JSON.parse(raw) as GeminiGenerateResponse;
  } catch {
    throw new Error('Resposta inválida do Gemini (JSON)');
  }

  if (data.error?.message) {
    throw new Error(data.error.message);
  }

  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.map(p => p.text ?? '').join('').trim();
  if (!text) throw new Error('Resposta vazia do Gemini');

  const finishReason = candidate?.finishReason;
  const outputTruncated = Boolean(finishReason && TRUNCATED_FINISH_REASONS.has(finishReason));

  return { text, finishReason, outputTruncated };
}
