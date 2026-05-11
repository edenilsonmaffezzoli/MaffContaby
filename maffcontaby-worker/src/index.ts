import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

type PersonDto = {
  id: string;
  name: string;
};

type GroupDto = {
  id: string;
  name: string;
};

type CompetenciaDto = {
  id: string;
  value: string;
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
  groups: GroupDto[];
  competencias: CompetenciaDto[];
  assets: AssetDto[];
  entries: EntryDto[];
};

type ImportResult = {
  entriesInserted: number;
  assetsInserted: number;
}; 

type GdpRecord = {
  id: string;
  atividade: string;
  descricao: string;
  inicio: string;
  fim: string;
  totalMin: number;
  observacao: string;
  criadoEm: string;
  atualizadoEm: string;
};

type GdpStore = {
  version: 1;
  theme: 'light' | 'dark';
  records: Record<string, GdpRecord[]>;
  updatedAt: string;
};

interface Env {
  MAFF_KV: KVNamespace;
  WRITE_KEY?: string;
  GDP_INIT_ADMIN_USERNAME?: string;
  GDP_INIT_ADMIN_PASSWORD?: string;
}

const DB_KEY = 'db';
const GDP_PREFIX = 'gdp:';
const GDP_USERS_KEY = `${GDP_PREFIX}users`;
const GDP_SESSION_PREFIX = `${GDP_PREFIX}session:`;
const GDP_STORE_PREFIX = `${GDP_PREFIX}store:`;

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
  const logo = await pdfDoc.embedPng(b64Decode(MAFF_LOGO_PNG_B64));
  const headerLogoH = 28;
  const headerLogoW = (logo.width / logo.height) * headerLogoH;
  const footerLogoH = 16;
  const footerLogoW = (logo.width / logo.height) * footerLogoH;

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
  page.drawImage(logo, {
    x: w - margin - headerLogoW - 12,
    y: y - 46 + (46 - headerLogoH) / 2,
    width: headerLogoW,
    height: headerLogoH,
  });
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

  for (const p of pdfDoc.getPages()) {
    const pw = p.getWidth();
    p.drawImage(logo, {
      x: pw - margin - footerLogoW,
      y: 16,
      width: footerLogoW,
      height: footerLogoH,
    });
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
  const logo = await pdfDoc.embedPng(b64Decode(MAFF_LOGO_PNG_B64));
  const headerLogoH = 26;
  const headerLogoW = (logo.width / logo.height) * headerLogoH;
  const footerLogoH = 16;
  const footerLogoW = (logo.width / logo.height) * footerLogoH;

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
    page.drawImage(logo, {
      x: w - margin - headerLogoW - 12,
      y: y - 42 + (42 - headerLogoH) / 2,
      width: headerLogoW,
      height: headerLogoH,
    });
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

  for (const p of pdfDoc.getPages()) {
    const pw = p.getWidth();
    p.drawImage(logo, {
      x: pw - margin - footerLogoW,
      y: 16,
      width: footerLogoW,
      height: footerLogoH,
    });
  }

  const bytes = await pdfDoc.save();
  return { ok: true as const, bytes };
}

async function readDb(env: Env): Promise<DbSnapshot> {
  const stored = (await env.MAFF_KV.get(DB_KEY, { type: 'json' })) as DbSnapshot | null;
  if (stored && stored.version === 1) {
    const anyStored = stored as unknown as {
      people?: unknown;
      groups?: unknown;
      competencias?: unknown;
      assets?: unknown;
      entries?: unknown;
    };

    const people: DbSnapshot['people'] = Array.isArray(anyStored.people)
      ? (anyStored.people as unknown[]).map(p => {
          const x = p as { id?: unknown; name?: unknown };
          return {
            id: typeof x.id === 'string' && x.id.trim() ? x.id.trim() : crypto.randomUUID(),
            name: typeof x.name === 'string' ? x.name : '',
          };
        }).filter(p => p.name.trim())
      : [];

    const groups: DbSnapshot['groups'] = Array.isArray(anyStored.groups)
      ? (anyStored.groups as unknown[]).map(g => {
          const x = g as { id?: unknown; name?: unknown };
          return {
            id: typeof x.id === 'string' && x.id.trim() ? x.id.trim() : crypto.randomUUID(),
            name: typeof x.name === 'string' ? x.name : '',
          };
        }).filter(g => g.name.trim())
      : [];

    const competencias: DbSnapshot['competencias'] = Array.isArray(anyStored.competencias)
      ? (anyStored.competencias as unknown[]).map(c => {
          const x = c as { id?: unknown; value?: unknown };
          const value = typeof x.value === 'string' ? normalizeCompetencia(x.value) : '';
          return {
            id: typeof x.id === 'string' && x.id.trim() ? x.id.trim() : crypto.randomUUID(),
            value,
          };
        }).filter(c => c.value.trim())
      : [];

    const assets: DbSnapshot['assets'] = Array.isArray(anyStored.assets)
      ? (anyStored.assets as unknown[]).map(a => {
          const x = a as Partial<AssetDto>;
          return {
            id: typeof x.id === 'string' && x.id.trim() ? x.id.trim() : crypto.randomUUID(),
            name: typeof x.name === 'string' ? x.name : '',
            saldo: typeof x.saldo === 'number' && Number.isFinite(x.saldo) ? x.saldo : 0,
            disponivelImediatamente: Boolean(x.disponivelImediatamente ?? true),
            asOfDate: typeof x.asOfDate === 'string' ? x.asOfDate : null,
            observacao: typeof x.observacao === 'string' ? x.observacao : null,
          };
        }).filter(a => a.name.trim())
      : [];

    const rawEntries = Array.isArray(anyStored.entries) ? (anyStored.entries as unknown[]) : [];
    const entries: DbSnapshot['entries'] = rawEntries
      .map(raw => {
        const e = raw as {
          id?: unknown;
          personId?: unknown;
          competencia?: unknown;
          grupo?: unknown;
          valor?: unknown;
          valores?: unknown;
          observacao?: unknown;
          data?: unknown;
        };

        const valoresSum =
          Array.isArray(e.valores)
            ? (e.valores as unknown[]).reduce<number>((sum, v) => {
                const n = typeof v === 'number' ? v : Number.NaN;
                return Number.isFinite(n) ? sum + n : sum;
              }, 0)
            : 0;

        const valorRaw = typeof e.valor === 'number' ? e.valor : Number.NaN;
        const valor: number = Number.isFinite(valorRaw) ? valorRaw : valoresSum;

        return {
          id: typeof e.id === 'string' && e.id.trim() ? e.id.trim() : crypto.randomUUID(),
          personId: typeof e.personId === 'string' ? e.personId : '',
          competencia: typeof e.competencia === 'string' ? e.competencia : '',
          grupo: typeof e.grupo === 'string' ? e.grupo : '',
          valor,
          observacao: typeof e.observacao === 'string' ? e.observacao : null,
          data: typeof e.data === 'string' ? e.data : null,
        };
      })
      .filter(e => e.personId && e.competencia && e.grupo);

    return { version: 1, updatedAt: stored.updatedAt, people, groups, competencias, assets, entries };
  }
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    people: [],
    groups: [],
    competencias: [],
    assets: [],
    entries: [],
  };
}

async function writeDb(env: Env, db: DbSnapshot) {
  const payload: DbSnapshot = {
    version: 1,
    updatedAt: new Date().toISOString(),
    people: db.people ?? [],
    groups: db.groups ?? [],
    competencias: db.competencias ?? [],
    assets: db.assets ?? [],
    entries: db.entries ?? [],
  };
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

function forbidden() {
  return text('Forbidden', { status: 403 });
}

function methodNotAllowed() {
  return text('Method not allowed', { status: 405 });
}

function isValidKvKey(key: string) {
  if (!key) return false;
  if (key.length > 80) return false;
  return /^[a-zA-Z0-9._-]+$/.test(key);
}

function isValidGdpStore(store: unknown): store is GdpStore {
  if (!store || typeof store !== 'object') return false;
  const s = store as Partial<GdpStore>;
  if (s.version !== 1) return false;
  if (s.theme !== 'light' && s.theme !== 'dark') return false;
  if (!s.records || typeof s.records !== 'object') return false;
  if (typeof s.updatedAt !== 'string') return false;
  return true;
}

type PasswordHash = {
  saltB64: string;
  iterations: number;
  hashB64: string;
};

type GdpUser = {
  id: string;
  username: string;
  admin: boolean;
  password: PasswordHash;
  createdAt: string;
  updatedAt: string;
};

type GdpUsersSnapshot = {
  version: 1;
  updatedAt: string;
  users: GdpUser[];
};

type GdpSession = {
  token: string;
  userId: string;
  createdAt: string;
};

function trimLower(value: string) {
  return value.trim().toLowerCase();
}

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function b64Encode(bytes: ArrayBuffer) {
  const data = new Uint8Array(bytes);
  let out = '';
  for (let i = 0; i < data.length; i += 3) {
    const a = data[i] ?? 0;
    const b = data[i + 1] ?? 0;
    const c = data[i + 2] ?? 0;
    const triple = (a << 16) | (b << 8) | c;
    out += B64_ALPHABET[(triple >> 18) & 63];
    out += B64_ALPHABET[(triple >> 12) & 63];
    out += i + 1 < data.length ? B64_ALPHABET[(triple >> 6) & 63] : '=';
    out += i + 2 < data.length ? B64_ALPHABET[triple & 63] : '=';
  }
  return out;
}

function b64Decode(b64: string) {
  const clean = b64.replace(/\s+/g, '');
  if (clean.length % 4 !== 0) throw new Error('Base64 inválido');
  const pads = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const outLen = (clean.length / 4) * 3 - pads;
  const out = new Uint8Array(outLen);
  const index = new Int16Array(256);
  index.fill(-1);
  for (let i = 0; i < B64_ALPHABET.length; i++) index[B64_ALPHABET.charCodeAt(i)] = i;

  let pos = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = clean.charCodeAt(i);
    const c1 = clean.charCodeAt(i + 1);
    const c2 = clean.charCodeAt(i + 2);
    const c3 = clean.charCodeAt(i + 3);
    const v0 = index[c0];
    const v1 = index[c1];
    const v2 = c2 === 61 ? 0 : index[c2];
    const v3 = c3 === 61 ? 0 : index[c3];
    if (v0 < 0 || v1 < 0 || (c2 !== 61 && v2 < 0) || (c3 !== 61 && v3 < 0)) throw new Error('Base64 inválido');
    const triple = (v0 << 18) | (v1 << 12) | (v2 << 6) | v3;
    if (pos < outLen) out[pos++] = (triple >> 16) & 255;
    if (pos < outLen) out[pos++] = (triple >> 8) & 255;
    if (pos < outLen) out[pos++] = triple & 255;
  }
  return out.buffer;
}

async function pbkdf2Hash(password: string, saltB64: string, iterations: number) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: b64Decode(saltB64),
      iterations,
    },
    keyMaterial,
    256,
  );
  return b64Encode(bits);
}

function timingSafeEqual(aB64: string, bB64: string) {
  if (aB64.length !== bB64.length) return false;
  let out = 0;
  for (let i = 0; i < aB64.length; i++) out |= aB64.charCodeAt(i) ^ bB64.charCodeAt(i);
  return out === 0;
}

async function hashPassword(password: string): Promise<PasswordHash> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltB64 = b64Encode(salt.buffer);
  const iterations = 100_000;
  const hashB64 = await pbkdf2Hash(password, saltB64, iterations);
  return { saltB64, iterations, hashB64 };
}

async function verifyPassword(password: string, stored: PasswordHash) {
  const got = await pbkdf2Hash(password, stored.saltB64, stored.iterations);
  return timingSafeEqual(got, stored.hashB64);
}

async function readGdpUsers(env: Env): Promise<GdpUsersSnapshot> {
  const raw = await env.MAFF_KV.get(GDP_USERS_KEY);
  if (raw) {
    try {
      const snap = JSON.parse(raw) as GdpUsersSnapshot;
      if (snap && snap.version === 1 && Array.isArray(snap.users)) return snap;
    } catch {
    }
  }
  return { version: 1, updatedAt: new Date().toISOString(), users: [] };
}

async function writeGdpUsers(env: Env, snap: GdpUsersSnapshot) {
  const payload: GdpUsersSnapshot = { version: 1, updatedAt: new Date().toISOString(), users: snap.users ?? [] };
  await env.MAFF_KV.put(GDP_USERS_KEY, JSON.stringify(payload));
  return payload;
}

async function ensureGdpAdminInitialized(env: Env) {
  const users = await readGdpUsers(env);
  if (users.users.length > 0) return users;
  const username = (env.GDP_INIT_ADMIN_USERNAME?.trim() || 'admin').trim();
  const password = env.GDP_INIT_ADMIN_PASSWORD ?? '';
  if (!password) return users;

  const now = new Date().toISOString();
  const user: GdpUser = {
    id: crypto.randomUUID(),
    username,
    admin: true,
    password: await hashPassword(password),
    createdAt: now,
    updatedAt: now,
  };
  return writeGdpUsers(env, { ...users, users: [user] });
}

function getBearerToken(request: Request) {
  const auth = request.headers.get('authorization')?.trim() ?? '';
  if (!auth.toLowerCase().startsWith('bearer ')) return '';
  return auth.slice(7).trim();
}

async function requireSession(request: Request, env: Env) {
  const token = getBearerToken(request);
  if (!token) return { ok: false as const, response: unauthorized() };
  const raw = await env.MAFF_KV.get(`${GDP_SESSION_PREFIX}${token}`);
  let session: GdpSession | null = null;
  if (raw) {
    try {
      session = JSON.parse(raw) as GdpSession;
    } catch {
      session = null;
    }
  }
  if (!session || session.token !== token || !session.userId) return { ok: false as const, response: unauthorized() };
  const users = await readGdpUsers(env);
  const user = users.users.find(u => u.id === session.userId);
  if (!user) return { ok: false as const, response: unauthorized() };
  return { ok: true as const, user };
}

function assertWriteAuthorized(request: Request, env: Env) {
  const url = new URL(request.url);
  const expected = env.WRITE_KEY?.trim();
  if (!expected) {
    const isLocal = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
    if (isLocal) return { ok: true as const };
    return { ok: false as const, response: text('WRITE_KEY não configurada no Worker', { status: 500 }) };
  }
  const got = getWriteKeyFromRequest(request);
  if (!got || got !== expected) return { ok: false as const, response: unauthorized() };
  return { ok: true as const };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, '') || '/';
      const method = request.method.toUpperCase();

      if (method === 'OPTIONS') return withCors(text('', { status: 204 }));

      if (isWriteMethod(method) && !path.startsWith('/api/auth') && !path.startsWith('/api/gdp')) {
        const auth = assertWriteAuthorized(request, env);
        if (!auth.ok) return withCors(auth.response);
      }

      if (path.startsWith('/api/auth') || path.startsWith('/api/gdp')) {
        await ensureGdpAdminInitialized(env);
      }

      if (path === '/api/auth/bootstrap') {
        const users = await readGdpUsers(env);
        const hasAny = users.users.length > 0;

        if (method === 'GET') return withCors(json({ ok: true, needed: !hasAny }));

        if (method === 'POST') {
          if (hasAny) return withCors(badRequest('Bootstrap já concluído'));
          const body = (await request.json().catch(() => null)) as { username?: string; password?: string } | null;
          const username = body?.username?.trim() ?? '';
          const password = body?.password ?? '';
          if (trimLower(username) !== 'admin') return withCors(badRequest('username deve ser "admin"'));
          if (typeof password !== 'string' || password.length < 8) return withCors(badRequest('password inválida'));

          const now = new Date().toISOString();
          const user: GdpUser = {
            id: crypto.randomUUID(),
            username: 'admin',
            admin: true,
            password: await hashPassword(password),
            createdAt: now,
            updatedAt: now,
          };
          await writeGdpUsers(env, { ...users, users: [user] });
          return withCors(json({ ok: true }));
        }

        return withCors(methodNotAllowed());
      }

      if (path === '/api/auth/login') {
        if (method !== 'POST') return withCors(methodNotAllowed());
        const body = (await request.json().catch(() => null)) as { username?: string; password?: string } | null;
        const username = body?.username?.trim() ?? '';
        const password = body?.password ?? '';
        if (!username || typeof password !== 'string') return withCors(badRequest('Credenciais inválidas'));

        const users = await readGdpUsers(env);
        const user = users.users.find(u => trimLower(u.username) === trimLower(username));
        if (!user) return withCors(unauthorized());
        const ok = await verifyPassword(password, user.password);
        if (!ok) return withCors(unauthorized());

        const token = crypto.randomUUID();
        const session: GdpSession = { token, userId: user.id, createdAt: new Date().toISOString() };
        await env.MAFF_KV.put(`${GDP_SESSION_PREFIX}${token}`, JSON.stringify(session), { expirationTtl: 60 * 60 * 24 * 30 });
        return withCors(
          json({
            ok: true,
            token,
            user: { id: user.id, username: user.username, admin: user.admin },
          }),
        );
      }

      if (path === '/api/auth/me') {
        if (method !== 'GET') return withCors(methodNotAllowed());
        const auth = await requireSession(request, env);
        if (!auth.ok) return withCors(auth.response);
        return withCors(json({ ok: true, user: { id: auth.user.id, username: auth.user.username, admin: auth.user.admin } }));
      }

      if (path === '/api/auth/logout') {
        if (method !== 'POST') return withCors(methodNotAllowed());
        const token = getBearerToken(request);
        if (token) await env.MAFF_KV.delete(`${GDP_SESSION_PREFIX}${token}`);
        return withCors(json({ ok: true }));
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

      if (method === 'DELETE') {
        const cleared: DbSnapshot = {
          version: 1,
          updatedAt: new Date().toISOString(),
          people: [],
          groups: [],
          competencias: [],
          assets: [],
          entries: [],
        };
        await writeDb(env, cleared);
        return withCors(text('', { status: 204 }));
      }

      return withCors(methodNotAllowed());
      }

      if (path === '/api/gdp/users') {
      const auth = await requireSession(request, env);
      if (!auth.ok) return withCors(auth.response);
      if (!auth.user.admin) return withCors(forbidden());

      const users = await readGdpUsers(env);

      if (method === 'GET') {
        return withCors(
          json({
            ok: true,
            users: users.users
              .slice()
              .sort((a, b) => a.username.localeCompare(b.username))
              .map(u => ({ id: u.id, username: u.username, admin: u.admin, createdAt: u.createdAt, updatedAt: u.updatedAt })),
          }),
        );
      }

      if (method === 'POST') {
        const body = (await request.json().catch(() => null)) as { username?: string; password?: string; admin?: boolean } | null;
        const username = body?.username?.trim() ?? '';
        const password = body?.password ?? '';
        const admin = Boolean(body?.admin);
        if (!username) return withCors(badRequest('username obrigatório'));
        if (username.length > 60) return withCors(badRequest('username muito longo'));
        if (typeof password !== 'string' || password.length < 6) return withCors(badRequest('password inválida'));
        const exists = users.users.some(u => trimLower(u.username) === trimLower(username));
        if (exists) return withCors(badRequest('username já existe'));

        const now = new Date().toISOString();
        const user: GdpUser = {
          id: crypto.randomUUID(),
          username,
          admin,
          password: await hashPassword(password),
          createdAt: now,
          updatedAt: now,
        };
        users.users.push(user);
        await writeGdpUsers(env, users);
        return withCors(json({ ok: true, user: { id: user.id, username: user.username, admin: user.admin } }, { status: 201 }));
      }

      return withCors(methodNotAllowed());
      }

      if (path.startsWith('/api/gdp/users/')) {
      const auth = await requireSession(request, env);
      if (!auth.ok) return withCors(auth.response);
      if (!auth.user.admin) return withCors(forbidden());

      const id = path.slice('/api/gdp/users/'.length);
      if (!id) return withCors(notFound());
      const users = await readGdpUsers(env);
      const idx = users.users.findIndex(u => u.id === id);
      if (idx < 0) return withCors(notFound());

      if (method === 'PUT') {
        const body = (await request.json().catch(() => null)) as { username?: string; password?: string; admin?: boolean } | null;
        const nextUsername = body?.username?.trim();
        const nextPassword = body?.password;
        const nextAdmin = body?.admin;

        if (typeof nextUsername === 'string') {
          if (!nextUsername) return withCors(badRequest('username obrigatório'));
          if (nextUsername.length > 60) return withCors(badRequest('username muito longo'));
          const exists = users.users.some(u => u.id !== id && trimLower(u.username) === trimLower(nextUsername));
          if (exists) return withCors(badRequest('username já existe'));
          users.users[idx].username = nextUsername;
        }

        if (typeof nextAdmin === 'boolean') users.users[idx].admin = nextAdmin;

        if (typeof nextPassword === 'string') {
          if (nextPassword.length < 6) return withCors(badRequest('password inválida'));
          users.users[idx].password = await hashPassword(nextPassword);
        }

        users.users[idx].updatedAt = new Date().toISOString();
        await writeGdpUsers(env, users);
        return withCors(text('', { status: 204 }));
      }

      if (method === 'DELETE') {
        if (auth.user.id === id) return withCors(badRequest('Não é possível excluir o próprio usuário'));
        users.users.splice(idx, 1);
        await writeGdpUsers(env, users);
        return withCors(text('', { status: 204 }));
      }

      return withCors(methodNotAllowed());
      }

      if (path === '/api/gdp/store') {
      const auth = await requireSession(request, env);
      if (!auth.ok) return withCors(auth.response);

      const rawUserId = (url.searchParams.get('userId') ?? '').trim();
      const userId = auth.user.admin && rawUserId ? rawUserId : auth.user.id;
      if (!userId) return withCors(badRequest('userId inválido'));

      const kvKey = `${GDP_STORE_PREFIX}${userId}`;

      if (method === 'GET') {
        const raw = await env.MAFF_KV.get(kvKey);
        let store: GdpStore | null = null;
        if (raw) {
          try {
            store = JSON.parse(raw) as GdpStore;
          } catch {
            store = null;
          }
        }
        return withCors(json({ ok: true, store: store ?? null }));
      }

      if (method === 'PUT') {
        const body = (await request.json().catch(() => null)) as { store?: unknown } | null;
        const store = body?.store;
        if (!isValidGdpStore(store)) return withCors(badRequest('store inválido'));
        await env.MAFF_KV.put(kvKey, JSON.stringify(store));
        return withCors(json({ ok: true }));
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
        if (name.length > 150) return withCors(badRequest('name deve ter no máximo 150 caracteres'));

        const exists = db.people.some(p => p.name.toLowerCase() === name.toLowerCase());
        if (exists) return withCors(badRequest('Pessoa já existe'));

        const person: PersonDto = { id: crypto.randomUUID(), name };
        db.people.push(person);
        await writeDb(env, db);
        return withCors(json(person, { status: 201 }));
      }

      return withCors(methodNotAllowed());
    }

    if (path.startsWith('/api/people/')) {
      const id = path.slice('/api/people/'.length);
      if (!id) return withCors(notFound());
      const db = await readDb(env);
      const idx = db.people.findIndex(p => p.id === id);
      if (idx < 0) return withCors(notFound());

      if (method === 'PUT') {
        const body = (await request.json().catch(() => null)) as { name?: string } | null;
        const name = body?.name?.trim();
        if (!name) return withCors(badRequest('name obrigatório'));
        if (name.length > 150) return withCors(badRequest('name deve ter no máximo 150 caracteres'));

        const exists = db.people.some(p => p.id !== id && p.name.toLowerCase() === name.toLowerCase());
        if (exists) return withCors(badRequest('Pessoa já existe'));

        db.people[idx] = { ...db.people[idx], name };
        await writeDb(env, db);
        return withCors(text('', { status: 204 }));
      }

      if (method === 'DELETE') {
        db.people.splice(idx, 1);
        db.entries = db.entries.filter(e => e.personId !== id);
        await writeDb(env, db);
        return withCors(text('', { status: 204 }));
      }

      return withCors(methodNotAllowed());
    }

    if (path === '/api/groups') {
      const db = await readDb(env);

      if (method === 'GET') return withCors(json(db.groups));

      if (method === 'POST') {
        const body = (await request.json().catch(() => null)) as { name?: string } | null;
        const name = body?.name?.trim();
        if (!name) return withCors(badRequest('name obrigatório'));
        if (name.length > 50) return withCors(badRequest('name deve ter no máximo 50 caracteres'));

        const exists = db.groups.some(g => g.name.toLowerCase() === name.toLowerCase());
        if (exists) return withCors(badRequest('Grupo já existe'));

        const group: GroupDto = { id: crypto.randomUUID(), name };
        db.groups.push(group);
        await writeDb(env, db);
        return withCors(json(group, { status: 201 }));
      }

      return withCors(methodNotAllowed());
    }

    if (path.startsWith('/api/groups/')) {
      const id = path.slice('/api/groups/'.length);
      if (!id) return withCors(notFound());
      const db = await readDb(env);
      const idx = db.groups.findIndex(g => g.id === id);
      if (idx < 0) return withCors(notFound());

      if (method === 'PUT') {
        const body = (await request.json().catch(() => null)) as { name?: string } | null;
        const name = body?.name?.trim();
        if (!name) return withCors(badRequest('name obrigatório'));
        if (name.length > 50) return withCors(badRequest('name deve ter no máximo 50 caracteres'));

        const exists = db.groups.some(g => g.id !== id && g.name.toLowerCase() === name.toLowerCase());
        if (exists) return withCors(badRequest('Grupo já existe'));

        db.groups[idx] = { ...db.groups[idx], name };
        await writeDb(env, db);
        return withCors(text('', { status: 204 }));
      }

      if (method === 'DELETE') {
        db.groups.splice(idx, 1);
        await writeDb(env, db);
        return withCors(text('', { status: 204 }));
      }

      return withCors(methodNotAllowed());
    }

    if (path === '/api/competencias') {
      const db = await readDb(env);

      if (method === 'GET') return withCors(json(db.competencias));

      if (method === 'POST') {
        const body = (await request.json().catch(() => null)) as { value?: string } | null;
        const valueRaw = body?.value?.trim();
        if (!valueRaw) return withCors(badRequest('value obrigatório'));
        if (!/^\d{4}-\d{2}(-\d{2})?$/.test(valueRaw)) return withCors(badRequest('value inválido'));

        const value = normalizeCompetencia(valueRaw);
        const exists = db.competencias.some(c => c.value.slice(0, 7) === value.slice(0, 7));
        if (exists) return withCors(badRequest('Competência já existe'));

        const item: CompetenciaDto = { id: crypto.randomUUID(), value };
        db.competencias.push(item);
        await writeDb(env, db);
        return withCors(json(item, { status: 201 }));
      }

      return withCors(methodNotAllowed());
    }

    if (path.startsWith('/api/competencias/')) {
      const id = path.slice('/api/competencias/'.length);
      if (!id) return withCors(notFound());
      const db = await readDb(env);
      const idx = db.competencias.findIndex(c => c.id === id);
      if (idx < 0) return withCors(notFound());

      if (method === 'DELETE') {
        db.competencias.splice(idx, 1);
        await writeDb(env, db);
        return withCors(text('', { status: 204 }));
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
        const competenciaParam = url.searchParams.get('competencia')?.trim();
        const grupoParam = url.searchParams.get('grupo')?.trim();
        const list = personId ? db.entries.filter(e => e.personId === personId) : db.entries.slice();
        let filtered = competenciaParam ? list.filter(e => e.competencia.slice(0, 7) === competenciaParam) : list;
        if (grupoParam) filtered = filtered.filter(e => e.grupo === grupoParam);
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

      const groups =
        Array.isArray(body.groups) && body.groups.length
          ? body.groups
          : [...new Set((body.entries ?? []).map(e => e.grupo.trim()).filter(Boolean))]
              .sort((a, b) => a.localeCompare(b))
              .map(name => ({ id: crypto.randomUUID(), name }));

      const competencias =
        Array.isArray(body.competencias) && body.competencias.length
          ? body.competencias
          : [...new Set((body.entries ?? []).map(e => normalizeCompetencia(e.competencia).slice(0, 7)).filter(Boolean))]
              .sort()
              .map(m => ({ id: crypto.randomUUID(), value: `${m}-01` }));

      const saved = await writeDb(env, { ...body, groups, competencias });
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
    } catch (err) {
      const message = err instanceof Error && err.message.trim() ? err.message.trim() : 'Internal Server Error';
      return withCors(text(message, { status: 500 }));
    }
  },
};
