export type SourceFileInput = {
  path: string;
  content: string;
};

export type ImageInput = {
  mimeType: string;
  base64: string;
  name?: string;
};

export type GerarCasoTesteRequest = {
  systemPath?: string;
  sourcePathLabel?: string;
  sourceFiles?: SourceFileInput[];
  images?: ImageInput[];
  extraContext?: string;
};

export type QaseStep = {
  action: string;
  expected_result: string;
  data?: string;
};

export type QaseCase = {
  title: string;
  description?: string;
  preconditions?: string;
  steps: QaseStep[];
  priority?: string;
  severity?: string;
  tags?: string[];
};

export type GerarCasoTesteResponse = {
  ok: true;
  markdown: string;
  cases: QaseCase[];
  /** Texto exato enviado ao Gemini (parte textual; imagens listadas no rodapé). */
  prompt: string;
  meta: {
    model: string;
    truncated: boolean;
    filesIncluded: number;
  };
};

export type GerarCasoTesteErrorResponse = {
  ok: false;
  error: string;
  /** Presente quando o prompt foi montado antes da falha (Gemini, parse, etc.). */
  prompt?: string;
};

export type GeminiAiResult = {
  markdown: string;
  cases: QaseCase[];
};
