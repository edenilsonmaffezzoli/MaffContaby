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
  /** Modelo de IA escolhido (apenas admin). */
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
  suite?: string;
  subsuite?: string;
  tags?: string[];
};

export type GerarCasoTesteResponse = {
  ok: true;
  markdown: string;
  cases: QaseCase[];
  prompt: string;
  meta: {
    model: string;
    truncated: boolean;
    filesIncluded: number;
    suitesUsed: string[];
    groupingWarning?: string;
    casesFromAi?: number;
    casesAfterNormalize?: number;
    casesDropped?: number;
    rawResponseLength?: number;
    outputTruncated?: boolean;
    runStatus?: string;
    urlContentFetched?: boolean;
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
  prompt?: string;
};

export type RobotFile = {
  path: string;
  content: string;
};

export type GerarCodigoRobotResponse = {
  ok: true;
  summary: string;
  files: RobotFile[];
  prompt: string;
  meta: {
    model: string;
    truncated: boolean;
    filesGenerated: number;
    rawResponseLength?: number;
    outputTruncated?: boolean;
    runStatus?: string;
    urlContentFetched?: boolean;
    urlContentTruncated?: boolean;
    urlFetchError?: string;
    authAttempted?: boolean;
    authSuccess?: boolean;
    authMode?: string;
    authError?: string;
  };
};
