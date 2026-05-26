import {
  htmlToPromptText,
  type FetchedPageContext,
} from './fetch-system-url';
import type { TargetAuthInput, TargetAuthMode } from './types/target-auth';

const FETCH_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_PAGE_CHARS = 60_000;
const MAX_REDIRECTS = 8;
const USER_AGENT = 'MaffContaby-TestGenerator/1.0';

export type AuthenticatedFetchResult = FetchedPageContext & {
  authAttempted: boolean;
  authSuccess: boolean;
  authMode?: TargetAuthMode;
  authError?: string;
};

function tryParseHttpUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url;
  } catch {
    return null;
  }
}

function resolveMode(auth: TargetAuthInput): Exclude<TargetAuthMode, 'auto'> {
  const mode = auth.mode ?? 'auto';
  if (mode === 'form' || mode === 'json') return mode;
  return auth.loginUrl.includes('/api/') ? 'json' : 'form';
}

/** Cookie jar: name -> value */
class CookieJar {
  private cookies = new Map<string, string>();

  absorb(response: Response, requestUrl: string) {
    const setCookies = getSetCookieHeaders(response);
    const host = new URL(requestUrl).hostname;
    for (const raw of setCookies) {
      const parsed = parseSetCookie(raw, host);
      if (parsed) this.cookies.set(parsed.name, parsed.value);
    }
  }

  header(): string {
    return [...this.cookies.entries()].map(([n, v]) => `${n}=${v}`).join('; ');
  }
}

function getSetCookieHeaders(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }
  const single = response.headers.get('set-cookie');
  if (!single) return [];
  return splitSetCookieHeader(single);
}

function splitSetCookieHeader(header: string): string[] {
  const parts: string[] = [];
  let start = 0;
  for (let i = 0; i < header.length; i++) {
    if (header[i] !== ',') continue;
    const rest = header.slice(i + 1);
    if (/^\s*[\w-]+=/.test(rest)) {
      parts.push(header.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(header.slice(start).trim());
  return parts.filter(Boolean);
}

function parseSetCookie(raw: string, defaultDomain: string): { name: string; value: string } | null {
  const first = raw.split(';')[0]?.trim();
  if (!first) return null;
  const eq = first.indexOf('=');
  if (eq <= 0) return null;
  const name = first.slice(0, eq).trim();
  const value = first.slice(eq + 1).trim();
  if (!name) return null;
  void defaultDomain;
  return { name, value };
}

function getByPath(obj: unknown, path: string): unknown {
  const parts = path.split('.').filter(Boolean);
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

type ParsedForm = {
  action: string;
  method: string;
  fields: Record<string, string>;
  usernameField: string;
  passwordField: string;
};

function parseLoginForm(html: string, pageUrl: string, auth: TargetAuthInput): ParsedForm | null {
  const formMatch = html.match(/<form\b[^>]*>([\s\S]*?)<\/form>/gi);
  if (!formMatch) return null;

  for (const formHtml of formMatch) {
    if (!/type\s*=\s*["']?password["']?/i.test(formHtml)) continue;

    const openTag = formHtml.match(/^<form\b([^>]*)>/i)?.[1] ?? '';
    const actionRaw = openTag.match(/\baction\s*=\s*["']([^"']*)["']/i)?.[1] ?? '';
    const methodRaw = (openTag.match(/\bmethod\s*=\s*["']([^"']*)["']/i)?.[1] ?? 'post').toUpperCase();

    const fields: Record<string, string> = {};
    const inputRe = /<input\b([^>]*)\/?>/gi;
    let m: RegExpExecArray | null;
    let passwordField = auth.formPasswordField?.trim() || '';
    let usernameField = auth.formUsernameField?.trim() || '';

    while ((m = inputRe.exec(formHtml)) !== null) {
      const attrs = m[1];
      const name = attrs.match(/\bname\s*=\s*["']([^"']+)["']/i)?.[1];
      if (!name) continue;
      const type = (attrs.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1] ?? 'text').toLowerCase();
      const value = attrs.match(/\bvalue\s*=\s*["']([^"']*)["']/i)?.[1] ?? '';

      if (type === 'password') {
        passwordField = passwordField || name;
        fields[name] = auth.password;
      } else if (type === 'hidden') {
        fields[name] = value;
      } else if (type === 'text' || type === 'email' || type === 'tel') {
        if (!usernameField && (looksLikeUsernameField(name) || type === 'email')) {
          usernameField = name;
        }
        if (name === usernameField) {
          fields[name] = auth.username;
        } else if (!fields[name]) {
          fields[name] = value;
        }
      }
    }

    if (!passwordField) continue;
    if (!usernameField) {
      const textInput = formHtml.match(
        /<input\b[^>]*type\s*=\s*["'](?:text|email)["'][^>]*\bname\s*=\s*["']([^"']+)["']/i,
      );
      usernameField = textInput?.[1] ?? 'username';
    }
    if (!fields[usernameField]) fields[usernameField] = auth.username;
    if (!fields[passwordField]) fields[passwordField] = auth.password;

    const base = new URL(pageUrl);
    const action = actionRaw ? new URL(actionRaw, base).toString() : base.toString();

    return {
      action,
      method: methodRaw === 'GET' ? 'GET' : 'POST',
      fields,
      usernameField,
      passwordField,
    };
  }
  return null;
}

function looksLikeUsernameField(name: string): boolean {
  return /user|login|email|cpf|account/i.test(name);
}

async function fetchWithJar(
  url: string,
  jar: CookieJar,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('User-Agent', USER_AGENT);
  const cookie = jar.header();
  if (cookie) headers.set('Cookie', cookie);

  return fetch(url, {
    ...init,
    headers,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: 'manual',
  });
}

async function followRedirects(
  initialRes: Response,
  jar: CookieJar,
  init: RequestInit,
): Promise<Response> {
  let res = initialRes;
  let url = res.url || (init as RequestInit & { url?: string }).url || '';

  for (let i = 0; i < MAX_REDIRECTS; i++) {
    jar.absorb(res, url);
    const status = res.status;
    if (status < 300 || status >= 400) return res;

    const location = res.headers.get('location');
    if (!location) return res;
    url = new URL(location, url).toString();
    res = await fetchWithJar(url, jar, { ...init, method: 'GET' });
  }
  return res;
}

async function loginViaJson(auth: TargetAuthInput): Promise<{ token: string } | { error: string }> {
  const loginUrl = tryParseHttpUrl(auth.loginUrl);
  if (!loginUrl) return { error: 'URL de login inválida' };

  const userField = auth.jsonUsernameField?.trim() || 'username';
  const passField = auth.jsonPasswordField?.trim() || 'password';
  const tokenPath = auth.tokenPath?.trim() || 'token';

  const jar = new CookieJar();
  const body = JSON.stringify({
    [userField]: auth.username,
    [passField]: auth.password,
  });

  try {
    const res = await fetchWithJar(loginUrl.toString(), jar, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body,
    });

    jar.absorb(res, loginUrl.toString());
    const text = await res.text();
    if (!res.ok) {
      return { error: `Login JSON falhou: HTTP ${res.status}` };
    }

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return { error: 'Resposta de login não é JSON' };
    }

    const token = getByPath(data, tokenPath);
    if (typeof token !== 'string' || !token.trim()) {
      return { error: `Token não encontrado em "${tokenPath}"` };
    }
    return { token: token.trim() };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Falha no login JSON';
    return { error: msg };
  }
}

async function loginViaForm(auth: TargetAuthInput): Promise<{ jar: CookieJar } | { error: string }> {
  const loginUrl = tryParseHttpUrl(auth.loginUrl);
  if (!loginUrl) return { error: 'URL de login inválida' };

  const jar = new CookieJar();

  try {
    const pageRes = await fetchWithJar(loginUrl.toString(), jar, {
      method: 'GET',
      headers: { Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' },
    });
    jar.absorb(pageRes, loginUrl.toString());

    if (!pageRes.ok && pageRes.status !== 401) {
      return { error: `Página de login: HTTP ${pageRes.status}` };
    }

    const html = await pageRes.text();
    const form = parseLoginForm(html, loginUrl.toString(), auth);
    if (!form) return { error: 'Formulário de login não encontrado na página' };

    const body =
      form.method === 'GET'
        ? new URLSearchParams(form.fields).toString()
        : new URLSearchParams(form.fields).toString();

    const submitUrl =
      form.method === 'GET'
        ? `${form.action}${form.action.includes('?') ? '&' : '?'}${body}`
        : form.action;

    const loginRes = await fetchWithJar(submitUrl, jar, {
      method: form.method,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      },
      body: form.method === 'POST' ? body : undefined,
    });

    const finalRes = await followRedirects(loginRes, jar, {
      method: 'GET',
      headers: { Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' },
    });

    if (finalRes.status === 401 || finalRes.status === 403) {
      return { error: `Login recusado: HTTP ${finalRes.status}` };
    }

    return { jar };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Falha no login por formulário';
    return { error: msg };
  }
}

async function fetchProtectedHtml(
  protectedUrl: string,
  jar: CookieJar | null,
  bearerToken?: string,
): Promise<{ html: string; ok: boolean; status: number; error?: string }> {
  const url = tryParseHttpUrl(protectedUrl);
  if (!url) return { html: '', ok: false, status: 0, error: 'URL protegida inválida' };

  const headers: Record<string, string> = {
    Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
    'User-Agent': USER_AGENT,
  };
  if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;
  if (jar?.header()) headers.Cookie = jar.header();

  try {
    const res = await fetch(url.toString(), {
      headers,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
    });

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return {
        html: '',
        ok: false,
        status: res.status,
        error: 'Resposta não é HTML',
      };
    }

    const html = await res.text();
    return { html, ok: res.ok, status: res.status };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Falha ao buscar URL protegida';
    return { html: '', ok: false, status: 0, error: msg };
  }
}

function toPageContext(
  html: string,
  maxChars: number,
  authMeta: Pick<AuthenticatedFetchResult, 'authAttempted' | 'authSuccess' | 'authMode' | 'authError'>,
): AuthenticatedFetchResult {
  if (!html.trim()) {
    return {
      content: '',
      fetched: false,
      truncated: false,
      fetchError: authMeta.authError ?? 'Conteúdo vazio',
      ...authMeta,
    };
  }

  let text = htmlToPromptText(html);
  let truncated = false;
  if (text.length > maxChars) {
    text = `${text.slice(0, maxChars)}\n/* … conteúdo da página truncado … */`;
    truncated = true;
  }

  return {
    content: text,
    fetched: true,
    truncated,
    ...authMeta,
  };
}

/**
 * Autentica no site alvo e busca o HTML da URL protegida (systemPath).
 */
export async function fetchAuthenticatedPage(
  protectedUrl: string,
  auth: TargetAuthInput,
  maxChars = DEFAULT_MAX_PAGE_CHARS,
): Promise<AuthenticatedFetchResult> {
  const mode = resolveMode(auth);
  const authMeta = {
    authAttempted: true,
    authSuccess: false,
    authMode: mode,
  } as const;

  let jar: CookieJar | null = null;
  let bearerToken: string | undefined;

  if (mode === 'json') {
    const loginResult = await loginViaJson(auth);
    if ('error' in loginResult) {
      return {
        content: '',
        fetched: false,
        truncated: false,
        ...authMeta,
        authError: loginResult.error,
      };
    }
    bearerToken = loginResult.token;
  } else {
    const loginResult = await loginViaForm(auth);
    if ('error' in loginResult) {
      return {
        content: '',
        fetched: false,
        truncated: false,
        ...authMeta,
        authError: loginResult.error,
      };
    }
    jar = loginResult.jar;
  }

  const fetchResult = await fetchProtectedHtml(protectedUrl, jar, bearerToken);
  if (!fetchResult.ok || !fetchResult.html) {
    return {
      content: '',
      fetched: false,
      truncated: false,
      ...authMeta,
      authError: fetchResult.error ?? `HTTP ${fetchResult.status}`,
    };
  }

  return toPageContext(fetchResult.html, maxChars, {
    ...authMeta,
    authSuccess: true,
  });
}

export function isHttpSystemPath(systemPath: string): boolean {
  return tryParseHttpUrl(systemPath) !== null;
}
