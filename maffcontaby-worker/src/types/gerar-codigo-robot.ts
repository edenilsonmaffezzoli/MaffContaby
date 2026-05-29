export type RobotFile = {
  path: string;
  content: string;
};

export type GerarCodigoRobotResponse = {
  ok: true;
  summary: string;
  files: RobotFile[];
  /** Texto exato enviado ao Cursor (parte textual; imagens listadas no rodapé). */
  prompt: string;
  meta: {
    model: string;
    truncated: boolean;
    filesGenerated: number;
    rawResponseLength: number;
    outputTruncated: boolean;
    runStatus?: string;
    urlContentFetched: boolean;
    urlContentTruncated?: boolean;
    urlFetchError?: string;
    authAttempted?: boolean;
    authSuccess?: boolean;
    authMode?: string;
    authError?: string;
  };
};

export type GerarCodigoRobotErrorResponse = {
  ok: false;
  error: string;
  /** Presente quando o prompt foi montado antes da falha (Cursor, parse, etc.). */
  prompt?: string;
};
