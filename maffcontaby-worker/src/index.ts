import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

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

type ReportParams = {
  personId: string | null;
  competenciaFrom: string | null;
  competenciaTo: string | null;
  competencia: string | null;
};

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

function monthToCompetenciaDate(value: string) {
  const v = value.trim();
  if (!/^\d{4}-\d{2}$/.test(v)) return null;
  return `${v}-01`;
}

function brl(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function monthLabel(dateStr: string) {
  const y = Number(dateStr.slice(0, 4));
  const m = Number(dateStr.slice(5, 7));
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
}

function addMonths(dateStr: string, delta: number) {
  const y = Number(dateStr.slice(0, 4));
  const m = Number(dateStr.slice(5, 7));
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${yy}-${mm}-01`;
}

function filterEntries(db: DbSnapshot, params: ReportParams) {
  const from = params.competenciaFrom ? monthToCompetenciaDate(params.competenciaFrom) : null;
  const to = params.competenciaTo ? monthToCompetenciaDate(params.competenciaTo) : null;
  if (params.competenciaFrom && !from) return { ok: false as const, error: 'competenciaFrom inválida (use yyyy-MM).' };
  if (params.competenciaTo && !to) return { ok: false as const, error: 'competenciaTo inválida (use yyyy-MM).' };

  let list = db.entries.slice();
  if (params.personId) list = list.filter(e => e.personId === params.personId);
  if (from) list = list.filter(e => e.competencia >= from);
  if (to) list = list.filter(e => e.competencia <= to);

  return { ok: true as const, from, to, list };
}

async function buildExecutivoPdf(db: DbSnapshot, params: ReportParams) {
  const filtered = filterEntries(db, params);
  if (!filtered.ok) return { ok: false as const, error: filtered.error };

  const reference = params.competencia ? monthToCompetenciaDate(params.competencia) : null;
  if (params.competencia && !reference) return { ok: false as const, error: 'competencia inválida (use yyyy-MM).' };

  const latest = reference ?? filtered.to ?? (filtered.list.length ? filtered.list.reduce((a, b) => (a.competencia > b.competencia ? a : b)).competencia : null);
  const refMonth = latest ? latest.slice(0, 7) : new Date().toISOString().slice(0, 7);

  const monthEntries = filtered.list.filter(e => e.competencia.slice(0, 7) === refMonth);
  const totalSaldo = db.assets.reduce((s, a) => s + a.saldo, 0);
  const totalDisponivel = db.assets.reduce((s, a) => s + (a.disponivelImediatamente ? a.saldo : 0), 0);
  const monthTotal = monthEntries.reduce((s, e) => s + e.valor, 0);

  const nameById = new Map(db.people.map(p => [p.id, p.name]));
  const byPerson = new Map<string, { name: string; total: number; count: number }>();
  for (const e of monthEntries) {
    const current = byPerson.get(e.personId) ?? { name: nameById.get(e.personId) ?? e.personId, total: 0, count: 0 };
    current.total += e.valor;
    current.count += 1;
    byPerson.set(e.personId, current);
  }
  const rows = [...byPerson.values()].sort((a, b) => b.total - a.total).slice(0, 18);

  const trendMap = new Map<string, number>();
  for (const e of filtered.list) {
    const key = e.competencia.slice(0, 7);
    trendMap.set(key, (trendMap.get(key) ?? 0) + e.valor);
  }
  const trend = [...trendMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-6);

  const groupsStart = addMonths(`${refMonth}-01`, -11);
  const topGroupsMap = new Map<string, { total: number; count: number }>();
  for (const e of filtered.list) {
    if (e.competencia < groupsStart) continue;
    const g = topGroupsMap.get(e.grupo) ?? { total: 0, count: 0 };
    g.total += e.valor;
    g.count += 1;
    topGroupsMap.set(e.grupo, g);
  }
  const topGroups = [...topGroupsMap.entries()]
    .map(([grupo, v]) => ({ grupo, total: v.total, count: v.count }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 12);

  const pdfDoc = await PDFDocument.create();
  const fontTitle = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontH2 = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontBody = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const page = pdfDoc.addPage([595.28, 841.89]);
  const w = page.getWidth();
  const h = page.getHeight();
  const margin = 40;
  const brand = rgb(0.298, 0.686, 0.314);
  const ink = rgb(0.063, 0.071, 0.078);
  const muted = rgb(0.376, 0.4, 0.431);
  const panel = rgb(0.957, 0.965, 0.973);

  let y = h - margin;

  page.drawRectangle({ x: margin, y: y - 46, width: w - margin * 2, height: 46, color: brand });
  page.drawText('Relatório Executivo', { x: margin + 14, y: y - 30, size: 20, font: fontTitle, color: rgb(1, 1, 1) });
  page.drawText(`Gerado em ${new Date().toLocaleString('pt-BR')}`, {
    x: margin + 14,
    y: y - 42,
    size: 9,
    font: fontBody,
    color: rgb(1, 1, 1),
  });
  y -= 62;

  const kpiW = (w - margin * 2 - 16) / 3;
  const kpiH = 62;
  const drawKpi = (x: number, label: string, value: string) => {
    page.drawRectangle({ x, y: y - kpiH, width: kpiW, height: kpiH, color: panel });
    page.drawText(label, { x: x + 12, y: y - 20, size: 11, font: fontH2, color: muted });
    page.drawText(value, { x: x + 12, y: y - 42, size: 14, font: fontTitle, color: ink });
  };
  drawKpi(margin, 'Saldo total', brl(totalSaldo));
  drawKpi(margin + kpiW + 8, 'Disponível', brl(totalDisponivel));
  drawKpi(margin + (kpiW + 8) * 2, `Total ${refMonth.slice(5, 7)}/${refMonth.slice(0, 4)}`, brl(monthTotal));
  y -= kpiH + 18;

  page.drawText('Totais por pessoa (mês)', { x: margin, y: y - 12, size: 12, font: fontH2, color: ink });
  y -= 22;

  const tableW = w - margin * 2;
  const colW = [tableW * 0.62, tableW * 0.12, tableW * 0.26];
  const rowH = 20;
  const headerH = 22;
  const drawRow = (cells: string[], yy: number, isHeader: boolean) => {
    if (isHeader) {
      page.drawRectangle({ x: margin, y: yy - headerH, width: tableW, height: headerH, color: panel });
    }
    let x = margin;
    const font = isHeader ? fontH2 : fontBody;
    const size = isHeader ? 10 : 10;
    const color = isHeader ? ink : muted;
    for (let i = 0; i < 3; i++) {
      const text = cells[i] ?? '';
      const alignRight = i > 0;
      const tx = alignRight ? x + colW[i] - 8 - font.widthOfTextAtSize(text, size) : x + 8;
      page.drawText(text, { x: tx, y: yy - (isHeader ? 16 : 14), size, font, color });
      x += colW[i];
    }
  };
  drawRow(['Pessoa', 'Itens', 'Total'], y, true);
  y -= headerH;
  for (const r of rows) {
    if (y < margin + 80) break;
    drawRow([r.name, String(r.count), brl(r.total)], y, false);
    y -= rowH;
  }
  y -= 10;

  page.drawText('Tendência (últimos 6 meses)', { x: margin, y: y - 12, size: 12, font: fontH2, color: ink });
  y -= 22;
  page.drawRectangle({ x: margin, y: y - 120, width: w - margin * 2, height: 120, color: panel });
  const innerX = margin + 12;
  const innerY = y - 120 + 12;
  const innerW = w - margin * 2 - 24;
  const innerH = 120 - 24;
  const max = Math.max(1, ...trend.map(([, v]) => v));
  const n = Math.max(1, trend.length);
  const gap = 10;
  const barW = (innerW - gap * (n - 1)) / n;
  for (let i = 0; i < trend.length; i++) {
    const [label, v] = trend[i];
    const barH = (innerH * v) / max;
    const bx = innerX + i * (barW + gap);
    const by = innerY + (innerH - barH);
    page.drawRectangle({ x: bx, y: by, width: barW, height: barH, color: brand });
    const ml = monthLabel(`${label}-01`);
    const tx = bx + barW / 2 - fontBody.widthOfTextAtSize(ml, 9) / 2;
    page.drawText(ml, { x: tx, y: innerY - 10, size: 9, font: fontBody, color: ink });
  }
  y -= 120 + 14;

  page.drawText('Top grupos (12 meses)', { x: margin, y: y - 12, size: 12, font: fontH2, color: ink });
  y -= 22;

  const groupRows = topGroups.map(x => [x.grupo, String(x.count), brl(x.total)]);
  drawRow(['Grupo', 'Itens', 'Total'], y, true);
  y -= headerH;
  for (const r of groupRows) {
    if (y < margin + 20) break;
    drawRow(r, y, false);
    y -= rowH;
  }

  const bytes = await pdfDoc.save();
  return { ok: true as const, bytes };
}

async function buildDetalhadoPdf(db: DbSnapshot, params: ReportParams) {
  const filtered = filterEntries(db, params);
  if (!filtered.ok) return { ok: false as const, error: filtered.error };

  const pdfDoc = await PDFDocument.create();
  const fontTitle = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontH2 = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontBody = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const margin = 40;
  const brand = rgb(0.298, 0.686, 0.314);
  const ink = rgb(0.063, 0.071, 0.078);
  const muted = rgb(0.376, 0.4, 0.431);
  const panel = rgb(0.957, 0.965, 0.973);

  const nameById = new Map(db.people.map(p => [p.id, p.name]));
  const peopleIds = [...new Set(filtered.list.map(e => e.personId))].sort((a, b) =>
    (nameById.get(a) ?? a).localeCompare(nameById.get(b) ?? b)
  );
  const competencias = [...new Set(filtered.list.map(e => e.competencia.slice(0, 7)))].sort().slice(-12);

  let page = pdfDoc.addPage([595.28, 841.89]);
  let w = page.getWidth();
  let h = page.getHeight();
  let y = h - margin;

  const header = () => {
    page.drawRectangle({ x: margin, y: y - 42, width: w - margin * 2, height: 42, color: brand });
    page.drawText('Relatório Detalhado', { x: margin + 14, y: y - 28, size: 18, font: fontTitle, color: rgb(1, 1, 1) });
    page.drawText(`Gerado em ${new Date().toLocaleString('pt-BR')}`, {
      x: margin + 14,
      y: y - 40,
      size: 9,
      font: fontBody,
      color: rgb(1, 1, 1),
    });
    y -= 56;
  };

  header();

  const newPage = () => {
    page = pdfDoc.addPage([595.28, 841.89]);
    w = page.getWidth();
    h = page.getHeight();
    y = h - margin;
    header();
  };

  const tableW = w - margin * 2;
  const colW = [tableW * 0.62, tableW * 0.12, tableW * 0.26];
  const rowH = 20;
  const headerH = 22;
  const drawRow = (cells: string[], yy: number, isHeader: boolean) => {
    if (isHeader) page.drawRectangle({ x: margin, y: yy - headerH, width: tableW, height: headerH, color: panel });
    let x = margin;
    const font = isHeader ? fontH2 : fontBody;
    const size = isHeader ? 10 : 10;
    const color = isHeader ? ink : muted;
    for (let i = 0; i < 3; i++) {
      const text = cells[i] ?? '';
      const alignRight = i > 0;
      const tx = alignRight ? x + colW[i] - 8 - font.widthOfTextAtSize(text, size) : x + 8;
      page.drawText(text, { x: tx, y: yy - (isHeader ? 16 : 14), size, font, color });
      x += colW[i];
    }
  };

  for (const pid of peopleIds) {
    const personName = nameById.get(pid) ?? pid;
    const personEntries = filtered.list.filter(e => e.personId === pid);
    if (!personEntries.length) continue;

    if (y < margin + 140) newPage();
    page.drawText(personName, { x: margin, y: y - 12, size: 12, font: fontH2, color: ink });
    y -= 22;

    for (const comp of competencias) {
      const compEntries = personEntries.filter(e => e.competencia.slice(0, 7) === comp);
      if (!compEntries.length) continue;

      if (y < margin + 140) {
        newPage();
        page.drawText(personName, { x: margin, y: y - 12, size: 12, font: fontH2, color: ink });
        y -= 22;
      }

      page.drawText(`${comp.slice(5, 7)}/${comp.slice(0, 4)}`, { x: margin, y: y - 12, size: 10, font: fontBody, color: muted });
      y -= 18;

      const groups = new Map<string, { total: number; count: number }>();
      for (const e of compEntries) {
        const g = groups.get(e.grupo) ?? { total: 0, count: 0 };
        g.total += e.valor;
        g.count += 1;
        groups.set(e.grupo, g);
      }
      const top = [...groups.entries()]
        .map(([grupo, v]) => ({ grupo, total: v.total, count: v.count }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

      drawRow(['Grupo', 'Itens', 'Total'], y, true);
      y -= headerH;
      for (const r of top) {
        if (y < margin + 60) break;
        drawRow([r.grupo, String(r.count), brl(r.total)], y, false);
        y -= rowH;
      }
      y -= 10;
    }

    y -= 6;
  }

  const bytes = await pdfDoc.save();
  return { ok: true as const, bytes };
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

    if (path === '/api/reports/executivo') {
      if (method !== 'GET') return withCors(methodNotAllowed());
      const params: ReportParams = {
        personId: url.searchParams.get('personId'),
        competenciaFrom: url.searchParams.get('competenciaFrom'),
        competenciaTo: url.searchParams.get('competenciaTo'),
        competencia: url.searchParams.get('competencia'),
      };
      const db = await readDb(env);
      const built = await buildExecutivoPdf(db, params);
      if (!built.ok) return withCors(badRequest(built.error));
      const headers = new Headers();
      headers.set('content-type', 'application/pdf');
      headers.set('content-disposition', `attachment; filename="Relatorio-Executivo-${new Date().toISOString().slice(0, 10)}.pdf"`);
      return withCors(new Response(built.bytes, { status: 200, headers }));
    }

    if (path === '/api/reports/detalhado') {
      if (method !== 'GET') return withCors(methodNotAllowed());
      const params: ReportParams = {
        personId: url.searchParams.get('personId'),
        competenciaFrom: url.searchParams.get('competenciaFrom'),
        competenciaTo: url.searchParams.get('competenciaTo'),
        competencia: url.searchParams.get('competencia'),
      };
      const db = await readDb(env);
      const built = await buildDetalhadoPdf(db, params);
      if (!built.ok) return withCors(badRequest(built.error));
      const headers = new Headers();
      headers.set('content-type', 'application/pdf');
      headers.set('content-disposition', `attachment; filename="Relatorio-Detalhado-${new Date().toISOString().slice(0, 10)}.pdf"`);
      return withCors(new Response(built.bytes, { status: 200, headers }));
    }

    return withCors(notFound());
  },
};
