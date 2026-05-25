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
    casesFromGemini?: number;
    casesAfterNormalize?: number;
    casesDropped?: number;
    rawJsonLength?: number;
    outputTruncated?: boolean;
    finishReason?: string;
    urlContentFetched?: boolean;
    urlContentTruncated?: boolean;
    urlFetchError?: string;
  };
};

export type GerarCasoTesteErrorResponse = {
  ok: false;
  error: string;
  prompt?: string;
};
