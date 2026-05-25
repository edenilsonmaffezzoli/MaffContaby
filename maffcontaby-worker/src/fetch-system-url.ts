const FETCH_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_PAGE_CHARS = 60_000;

export type FetchedPageContext = {
  content: string;
  fetched: boolean;
  truncated: boolean;
  fetchError?: string;
};

function tryParseHttpUrl(systemPath: string): URL | null {
  const trimmed = systemPath.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url;
  } catch {
    return null;
  }
}

/** Reduz HTML a texto legível para o prompt (sem scripts/estilos). */
export function htmlToPromptText(html: string): string {
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');

  const titleMatch = s.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const metaMatch = s.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
  );
  const headerBits: string[] = [];
  if (titleMatch?.[1]) headerBits.push(`Título da página: ${stripTags(titleMatch[1]).trim()}`);
  if (metaMatch?.[1]) headerBits.push(`Descrição: ${metaMatch[1].trim()}`);

  s = s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article|header|footer|nav)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

  const body = s.replace(/\s+/g, ' ').replace(/\n\s*/g, '\n').trim();
  const combined = [...headerBits, body].filter(Boolean).join('\n\n');
  return combined;
}

function stripTags(fragment: string) {
  return fragment.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Quando systemPath é URL HTTP(S), busca a página e extrai texto para o prompt.
 */
export async function fetchSystemPathContent(
  systemPath: string,
  maxChars = DEFAULT_MAX_PAGE_CHARS,
): Promise<FetchedPageContext> {
  const url = tryParseHttpUrl(systemPath);
  if (!url) {
    return { content: '', fetched: false, truncated: false };
  }

  try {
    const res = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'MaffContaby-TestGenerator/1.0',
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
    });

    if (!res.ok) {
      return {
        content: '',
        fetched: false,
        truncated: false,
        fetchError: `HTTP ${res.status}`,
      };
    }

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return {
        content: '',
        fetched: false,
        truncated: false,
        fetchError: 'Resposta não é HTML',
      };
    }

    const html = await res.text();
    let text = htmlToPromptText(html);
    if (text.length > maxChars) {
      text = `${text.slice(0, maxChars)}\n/* … conteúdo da página truncado … */`;
      return { content: text, fetched: true, truncated: true };
    }
    return { content: text, fetched: true, truncated: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Falha ao buscar URL';
    return { content: '', fetched: false, truncated: false, fetchError: msg };
  }
}

export function isHttpSystemPath(systemPath: string): boolean {
  return tryParseHttpUrl(systemPath) !== null;
}
