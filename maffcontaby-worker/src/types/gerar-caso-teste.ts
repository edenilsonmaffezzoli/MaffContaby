import type { TargetAuthInput } from './target-auth';

export type { TargetAuthInput, TargetAuthMode } from './target-auth';

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
  targetAuth?: TargetAuthInput;
  /** Modelo de IA escolhido (apenas admin); ignorado para não-admin. */
  model?: string;
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
  /** Assunto/módulo — pasta no Qase (suite pai). */
  suite?: string;
  /** Fluxo dentro do módulo — subsuite no Qase. */
  subsuite?: string;
  tags?: string[];
};

export type GerarCasoTesteResponse = {
  ok: true;
  markdown: string;
  cases: QaseCase[];
  /** Texto exato enviado ao Cursor (parte textual; imagens listadas no rodapé). */
  prompt: string;
  meta: {
    model: string;
    truncated: boolean;
    filesIncluded: number;
    suitesUsed: string[];
    groupingWarning?: string;
    /** Casos no array bruto retornado pela IA (antes de descartar inválidos). */
    casesFromAi: number;
    /** Casos válidos após normalizeCases. */
    casesAfterNormalize: number;
    /** Casos descartados por título/passos inválidos. */
    casesDropped: number;
    /** Tamanho em caracteres da resposta bruta da IA. */
    rawResponseLength: number;
    /** Saída possivelmente cortada ou sem formato Qase esperado. */
    outputTruncated: boolean;
    /** Status do run Cursor (ex.: FINISHED). */
    runStatus?: string;
    /** Página do systemPath (URL) foi buscada e injetada no prompt. */
    urlContentFetched: boolean;
    urlContentTruncated?: boolean;
    urlFetchError?: string;
    authAttempted?: boolean;
    authSuccess?: boolean;
    authMode?: string;
    authError?: string;
  };
};

export type GerarCasoTesteErrorResponse = {
  ok: false;
  error: string;
  /** Presente quando o prompt foi montado antes da falha (Cursor, parse, etc.). */
  prompt?: string;
};

export type AiParseResult = {
  markdown: string;
  cases: QaseCase[];
  suitesUsed: string[];
  groupingWarning?: string;
};
