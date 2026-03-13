type PersonDto = {
  id: string;
  name: string;
};

type AssetDto = {
  id: string;
  name: string;
  saldo: number;
  disponivelImediatamente: boolean;
  asOfDate: string | null;
  observacao: string | null;
};

type EntryDto = {
  id: string;
  personId: string;
  competencia: string;
  grupo: string;
  valor: number;
  observacao: string | null;
  data: string | null;
};

type DbSnapshot = {
  version: 1;
  updatedAt: string;
  people: PersonDto[];
  assets: AssetDto[];
  entries: EntryDto[];
};

type ImportResult = {
  entriesInserted: number;
  assetsInserted: number;
};

interface Env {
  MAFF_KV: KVNamespace;
  WRITE_KEY?: string;
}

const DB_KEY = 'db';

function json(data: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { ...init, headers });
}

function text(data: string, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  if (!headers.has('content-type')) headers.set('content-type', 'text/plain; charset=utf-8');
  return new Response(data, { ...init, headers });
}

function withCors(response: Response) {
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', '*');
  headers.set('access-control-allow-methods', 'GET,POST,PUT,DELETE,OPTIONS');
  headers.set('access-control-allow-headers', 'content-type,authorization,x-maff-key');
  headers.set('access-control-max-age', '86400');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function getWriteKeyFromRequest(request: Request) {
  const auth = request.headers.get('authorization')?.trim();
  if (auth?.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return request.headers.get('x-maff-key')?.trim() ?? '';
}

function isWriteMethod(method: string) {
  const m = method.toUpperCase();
  return m === 'POST' || m === 'PUT' || m === 'DELETE';
}

function normalizeCompetencia(value: string) {
  const v = value.trim();
  if (/^\d{4}-\d{2}$/.test(v)) return `${v}-01`;
  return v;
}

async function readDb(env: Env): Promise<DbSnapshot> {
  const stored = (await env.MAFF_KV.get(DB_KEY, { type: 'json' })) as DbSnapshot | null;
  if (stored && stored.version === 1) return stored;
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    people: [],
    assets: [],
    entries: [],
  };
}

async function writeDb(env: Env, db: DbSnapshot) {
  const payload: DbSnapshot = { ...db, version: 1, updatedAt: new Date().toISOString() };
  await env.MAFF_KV.put(DB_KEY, JSON.stringify(payload));
  return payload;
}

function notFound() {
  return text('Not found', { status: 404 });
}

function badRequest(message: string) {
  return text(message, { status: 400 });
}

function unauthorized() {
  return text('Unauthorized', { status: 401 });
}

function methodNotAllowed() {
  return text('Method not allowed', { status: 405 });
}

function assertWriteAuthorized(request: Request, env: Env) {
  const expected = env.WRITE_KEY?.trim();
  if (!expected) return { ok: false as const, response: text('WRITE_KEY não configurada no Worker', { status: 500 }) };
  const got = getWriteKeyFromRequest(request);
  if (!got || got !== expected) return { ok: false as const, response: unauthorized() };
  return { ok: true as const };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const method = request.method.toUpperCase();

    if (method === 'OPTIONS') return withCors(text('', { status: 204 }));

    if (isWriteMethod(method)) {
      const auth = assertWriteAuthorized(request, env);
      if (!auth.ok) return withCors(auth.response);
    }

    if (path === '/api/db') {
      if (method === 'GET') {
        const db = await readDb(env);
        return withCors(json(db));
      }

      if (method === 'PUT') {
        const body = (await request.json().catch(() => null)) as DbSnapshot | null;
        if (!body || body.version !== 1) return withCors(badRequest('Snapshot inválido'));
        const saved = await writeDb(env, body);
        return withCors(json(saved));
      }

      return withCors(methodNotAllowed());
    }

    if (path === '/api/people') {
      const db = await readDb(env);

      if (method === 'GET') return withCors(json(db.people));

      if (method === 'POST') {
        const body = (await request.json().catch(() => null)) as { name?: string } | null;
        const name = body?.name?.trim();
        if (!name) return withCors(badRequest('name obrigatório'));

        const exists = db.people.some(p => p.name.toLowerCase() === name.toLowerCase());
        if (exists) return withCors(badRequest('Pessoa já existe'));

        const person: PersonDto = { id: crypto.randomUUID(), name };
        db.people.push(person);
        await writeDb(env, db);
        return withCors(json(person, { status: 201 }));
      }

      return withCors(methodNotAllowed());
    }

    if (path === '/api/assets') {
      const db = await readDb(env);

      if (method === 'GET') return withCors(json(db.assets));

      if (method === 'POST') {
        const body = (await request.json().catch(() => null)) as Partial<AssetDto> | null;
        const name = body?.name?.trim();
        const saldo = body?.saldo;
        if (!name) return withCors(badRequest('name obrigatório'));
        if (typeof saldo !== 'number' || !Number.isFinite(saldo)) return withCors(badRequest('saldo inválido'));

        const asset: AssetDto = {
          id: crypto.randomUUID(),
          name,
          saldo,
          disponivelImediatamente: Boolean(body?.disponivelImediatamente ?? true),
          asOfDate: body?.asOfDate ?? null,
          observacao: body?.observacao ?? null,
        };
        db.assets.push(asset);
        await writeDb(env, db);
        return withCors(json(asset, { status: 201 }));
      }
    }

    if (path.startsWith('/api/assets/')) {
      const id = path.slice('/api/assets/'.length);
      if (!id) return withCors(notFound());
      const db = await readDb(env);
      const idx = db.assets.findIndex(a => a.id === id);
      if (idx < 0) return withCors(notFound());

      if (method === 'PUT') {
        const body = (await request.json().catch(() => null)) as Partial<AssetDto> | null;
        const name = body?.name?.trim();
        const saldo = body?.saldo;
        if (!name) return withCors(badRequest('name obrigatório'));
        if (typeof saldo !== 'number' || !Number.isFinite(saldo)) return withCors(badRequest('saldo inválido'));

        const updated: AssetDto = {
          ...db.assets[idx],
          name,
          saldo,
          disponivelImediatamente: Boolean(body?.disponivelImediatamente ?? db.assets[idx].disponivelImediatamente),
          asOfDate: body?.asOfDate ?? db.assets[idx].asOfDate ?? null,
          observacao: body?.observacao ?? db.assets[idx].observacao ?? null,
        };
        db.assets[idx] = updated;
        await writeDb(env, db);
        return withCors(text('', { status: 204 }));
      }

      if (method === 'DELETE') {
        db.assets.splice(idx, 1);
        await writeDb(env, db);
        return withCors(text('', { status: 204 }));
      }

      return withCors(methodNotAllowed());
    }

    if (path === '/api/entries') {
      const db = await readDb(env);

      if (method === 'GET') {
        const personId = url.searchParams.get('personId')?.trim() ?? '';
        if (!personId) return withCors(badRequest('personId obrigatório'));

        const competenciaParam = url.searchParams.get('competencia')?.trim();
        const list = db.entries.filter(e => e.personId === personId);
        const filtered = competenciaParam
          ? list.filter(e => e.competencia.slice(0, 7) === competenciaParam)
          : list;
        return withCors(json(filtered));
      }

      if (method === 'POST') {
        const body = (await request.json().catch(() => null)) as Partial<EntryDto> | null;
        const personId = body?.personId?.trim();
        const competencia = body?.competencia?.trim();
        const grupo = body?.grupo?.trim();
        const valor = body?.valor;
        if (!personId) return withCors(badRequest('personId obrigatório'));
        if (!competencia) return withCors(badRequest('competencia obrigatória'));
        if (!grupo) return withCors(badRequest('grupo obrigatório'));
        if (typeof valor !== 'number' || !Number.isFinite(valor)) return withCors(badRequest('valor inválido'));

        const existsPerson = db.people.some(p => p.id === personId);
        if (!existsPerson) return withCors(badRequest('Pessoa inválida'));

        const entry: EntryDto = {
          id: crypto.randomUUID(),
          personId,
          competencia: normalizeCompetencia(competencia),
          grupo,
          valor,
          observacao: body?.observacao ?? null,
          data: body?.data ?? null,
        };
        db.entries.push(entry);
        await writeDb(env, db);
        return withCors(json(entry, { status: 201 }));
      }

      return withCors(methodNotAllowed());
    }

    if (path.startsWith('/api/entries/')) {
      const id = path.slice('/api/entries/'.length);
      if (!id) return withCors(notFound());
      const db = await readDb(env);
      const idx = db.entries.findIndex(e => e.id === id);
      if (idx < 0) return withCors(notFound());

      if (method === 'PUT') {
        const body = (await request.json().catch(() => null)) as Partial<EntryDto> | null;
        const competencia = body?.competencia?.trim();
        const grupo = body?.grupo?.trim();
        const valor = body?.valor;
        if (!competencia) return withCors(badRequest('competencia obrigatória'));
        if (!grupo) return withCors(badRequest('grupo obrigatório'));
        if (typeof valor !== 'number' || !Number.isFinite(valor)) return withCors(badRequest('valor inválido'));

        const updated: EntryDto = {
          ...db.entries[idx],
          competencia: normalizeCompetencia(competencia),
          grupo,
          valor,
          observacao: body?.observacao ?? db.entries[idx].observacao ?? null,
          data: body?.data ?? db.entries[idx].data ?? null,
        };
        db.entries[idx] = updated;
        await writeDb(env, db);
        return withCors(text('', { status: 204 }));
      }

      if (method === 'DELETE') {
        db.entries.splice(idx, 1);
        await writeDb(env, db);
        return withCors(text('', { status: 204 }));
      }

      return withCors(methodNotAllowed());
    }

    if (path === '/api/export/contabilidade') {
      if (method !== 'GET') return withCors(methodNotAllowed());
      const db = await readDb(env);
      const headers = new Headers();
      headers.set('content-type', 'application/json; charset=utf-8');
      return withCors(new Response(JSON.stringify(db), { status: 200, headers }));
    }

    if (path === '/api/import/contabilidade') {
      if (method !== 'POST') return withCors(methodNotAllowed());

      const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
      if (!contentType.includes('application/json')) {
        return withCors(text('Importação XLSX não suportada no Worker. Use JSON.', { status: 501 }));
      }

      const body = (await request.json().catch(() => null)) as DbSnapshot | null;
      if (!body || body.version !== 1) return withCors(badRequest('Snapshot inválido'));

      const saved = await writeDb(env, body);
      const result: ImportResult = { entriesInserted: saved.entries.length, assetsInserted: saved.assets.length };
      return withCors(json(result));
    }

    return withCors(notFound());
  },
};
