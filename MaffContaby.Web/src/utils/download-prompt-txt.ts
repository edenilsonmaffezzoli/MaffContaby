import type { GerarCasoTesteErrorResponse } from '@/types/casos-teste';

export function extractPromptFromGerarError(error: unknown): string {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  if (!data || typeof data !== 'object' || data === null) return '';
  const prompt = (data as GerarCasoTesteErrorResponse).prompt;
  return typeof prompt === 'string' ? prompt.trim() : '';
}

function promptFilename() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `casos-teste-prompt-${stamp}.txt`;
}

export function downloadPromptTxt(prompt: string, filename?: string) {
  const blob = new Blob([prompt], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? promptFilename();
  a.click();
  URL.revokeObjectURL(url);
}
