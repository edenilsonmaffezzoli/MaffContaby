import { useHttpClient } from '@/hooks/use-http-client';
import {
  exportContabilidade,
  importContabilidade,
  importContabilidadeFile,
  importContabilidadeSnapshot,
  type DbSnapshotV1,
} from '@/services/import-service';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import * as XLSX from '@e965/xlsx';

function formatHttpError(error: unknown, apiBaseUrl: string | undefined) {
  const e = error as {
    message?: string;
    response?: { status?: number; statusText?: string; data?: unknown };
  };

  const status = e?.response?.status;
  const statusText = e?.response?.statusText;
  const data = e?.response?.data;

  if (typeof data === 'string' && data.trim()) {
    return status ? `${status} - ${data.trim()}` : data.trim();
  }

  if (status) {
    return statusText?.trim() ? `${status} - ${statusText.trim()}` : String(status);
  }

  const msg = e?.message?.trim();
  if (!msg) return 'Erro desconhecido';

  if (/network error|failed to fetch|err_network/i.test(msg)) {
    const base = apiBaseUrl?.trim() ? apiBaseUrl.trim() : '(sem baseURL)';
    return `Não consegui conectar na API (${base}). Verifique se a API está rodando.`;
  }

  return msg;
}

function UploadCloudIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M12 12v9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M8 17l4-5 4 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function DownloadIcon(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none">
      <path d="M12 3v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M7 14l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M3 19h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M14 2v6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M22 4L12 14.01l-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

const monthMap: Record<string, number> = {
  jan: 1,
  fev: 2,
  mar: 3,
  abr: 4,
  mai: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  set: 9,
  out: 10,
  nov: 11,
  dez: 12,
};

function stripDiacritics(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function normalizeCompetenciaDate(value: string) {
  const v = value.trim();
  if (/^\d{4}-\d{2}$/.test(v)) return `${v}-01`;
  return v;
}

function tryParseCompetencia(text: string) {
  const raw = text.trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}(-\d{2})?$/.test(raw)) {
    const [y, m] = raw.split('-');
    const year = Number(y);
    const month = Number(m);
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
    return `${year}-${pad2(month)}-01`;
  }

  const parts = raw.split('/').map(p => p.trim()).filter(Boolean);
  if (parts.length !== 2) return null;

  const monthText = stripDiacritics(parts[0].replace(/\.$/, '').toLowerCase());
  const month = monthMap[monthText];
  if (!month) return null;

  let year = Number(parts[1]);
  if (!Number.isFinite(year)) return null;
  if (year < 100) year += 2000;
  if (year < 1900 || year > 2200) return null;

  return `${year}-${pad2(month)}-01`;
}

function getCell(ws: XLSX.WorkSheet, r: number, c: number) {
  const addr = XLSX.utils.encode_cell({ r, c });
  return ws[addr] as XLSX.CellObject | undefined;
}

function getCellText(cell: XLSX.CellObject | undefined) {
  if (!cell) return '';
  const anyCell = cell as unknown as { w?: unknown; v?: unknown };
  if (typeof anyCell.w === 'string') return anyCell.w.trim();
  if (anyCell.w != null) return String(anyCell.w).trim();
  if (anyCell.v == null) return '';
  return String(anyCell.v).trim();
}

function tryReadCompetencia(cell: XLSX.CellObject | undefined) {
  if (!cell) return null;
  const anyCell = cell as unknown as { t?: unknown; v?: unknown };
  if (anyCell.t === 'd' && anyCell.v instanceof Date && Number.isFinite(anyCell.v.getTime())) {
    const year = anyCell.v.getUTCFullYear();
    const month = anyCell.v.getUTCMonth() + 1;
    return `${year}-${pad2(month)}-01`;
  }
  const text = getCellText(cell);
  return tryParseCompetencia(text);
}

function tryGetNumber(cell: XLSX.CellObject | undefined) {
  if (!cell) return null;
  const anyCell = cell as unknown as { t?: unknown; v?: unknown };
  if (anyCell.t === 'n' && typeof anyCell.v === 'number' && Number.isFinite(anyCell.v)) return anyCell.v;

  const raw = getCellText(cell);
  if (!raw) return null;

  const withoutCurrency = raw.replace(/r\$\s*/i, '').trim();
  if (!withoutCurrency) return null;

  const hasComma = withoutCurrency.includes(',');
  const hasDot = withoutCurrency.includes('.');

  let normalized = withoutCurrency;
  if (hasComma) {
    normalized = normalized.replace(/\./g, '').replace(/,/g, '.');
  } else if (hasDot && /^\d{1,3}(\.\d{3})+$/.test(normalized)) {
    normalized = normalized.replace(/\./g, '');
  }

  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return n;
}

function findLastNonEmptyCol(ws: XLSX.WorkSheet, r: number, startCol: number, endCol: number) {
  for (let c = endCol; c >= startCol; c--) {
    const cell = getCell(ws, r, c);
    const text = getCellText(cell);
    if (text) return c;
    const anyCell = cell as unknown as { v?: unknown };
    if (anyCell?.v != null && String(anyCell.v).trim()) return c;
  }
  return startCol - 1;
}

function buildSnapshotFromWorkbook(wb: XLSX.WorkBook): DbSnapshotV1 {
  const peopleByName = new Map<string, { id: string; name: string }>();
  const assetsByName = new Map<
    string,
    {
      id: string;
      name: string;
      saldo: number;
      disponivelImediatamente: boolean;
      asOfDate: string | null;
      observacao: string | null;
    }
  >();
  const entries: DbSnapshotV1['entries'] = [];

  const getOrCreatePerson = (name: string) => {
    const key = name.toLowerCase();
    const existing = peopleByName.get(key);
    if (existing) return existing;
    const created = { id: crypto.randomUUID(), name };
    peopleByName.set(key, created);
    return created;
  };

  const sheetNames = wb.SheetNames ?? [];
  for (const sheetName of sheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    const name = sheetName.trim();
    if (!name) continue;

    const normalized = stripDiacritics(name).toLowerCase();
    const isFinancas = normalized === 'financas';

    const ref = ws['!ref'];
    if (!ref) continue;
    const range = XLSX.utils.decode_range(ref);

    if (isFinancas) {
      for (let r = range.s.r; r <= range.e.r; r++) {
        const assetName = getCellText(getCell(ws, r, range.s.c)).trim();
        if (!assetName) continue;
        if (assetName.toLowerCase() === 'somas:') break;
        if (assetName.toLowerCase() === 'total') continue;

        const saldo = tryGetNumber(getCell(ws, r, range.s.c + 1));
        if (saldo == null) continue;

        const key = assetName.toLowerCase();
        const existing = assetsByName.get(key);
        if (existing) {
          existing.saldo = saldo;
        } else {
          assetsByName.set(key, {
            id: crypto.randomUUID(),
            name: assetName,
            saldo,
            disponivelImediatamente: true,
            asOfDate: null,
            observacao: null,
          });
        }
      }
      continue;
    }

    const person = getOrCreatePerson(name);

    let hasRowCompetencia = false;
    for (let r = range.s.r; r <= range.e.r; r++) {
      const comp = tryReadCompetencia(getCell(ws, r, range.s.c));
      if (comp) {
        hasRowCompetencia = true;
        break;
      }
    }

    if (hasRowCompetencia) {
      let competencia: string | null = null;
      for (let r = range.s.r; r <= range.e.r; r++) {
        const labelCell = getCell(ws, r, range.s.c);
        const parsedComp = tryReadCompetencia(labelCell);
        if (parsedComp) {
          competencia = parsedComp;
          continue;
        }

        if (!competencia) continue;
        const label = getCellText(labelCell).trim();
        if (!label) continue;
        if (label.toLowerCase() === 'total') continue;

        const lastCol = findLastNonEmptyCol(ws, r, range.s.c + 1, range.e.c);
        if (lastCol < range.s.c + 1) continue;

        for (let c = range.s.c + 1; c <= lastCol; c++) {
          const value = tryGetNumber(getCell(ws, r, c));
          if (value == null || value === 0) continue;
          entries.push({
            id: crypto.randomUUID(),
            personId: person.id,
            competencia: normalizeCompetenciaDate(competencia),
            grupo: label,
            valor: value,
            observacao: null,
            data: null,
          });
        }
      }
    } else {
      const headerRow = range.s.r;
      const lastHeaderCol = findLastNonEmptyCol(ws, headerRow, range.s.c + 1, range.e.c);
      if (lastHeaderCol < range.s.c + 1) continue;

      const colCompetencias = new Map<number, string>();
      for (let c = range.s.c + 1; c <= lastHeaderCol; c++) {
        const headerText = getCellText(getCell(ws, headerRow, c));
        const comp = tryParseCompetencia(headerText);
        if (comp) colCompetencias.set(c, comp);
      }

      if (colCompetencias.size === 0) continue;

      for (let r = headerRow + 1; r <= range.e.r; r++) {
        const label = getCellText(getCell(ws, r, range.s.c)).trim();
        if (!label) continue;
        if (label.toLowerCase() === 'total') continue;

        for (const [c, comp] of colCompetencias.entries()) {
          const value = tryGetNumber(getCell(ws, r, c));
          if (value == null || value === 0) continue;
          entries.push({
            id: crypto.randomUUID(),
            personId: person.id,
            competencia: normalizeCompetenciaDate(comp),
            grupo: label,
            valor: value,
            observacao: null,
            data: null,
          });
        }
      }
    }
  }

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    people: Array.from(peopleByName.values()),
    assets: Array.from(assetsByName.values()),
    entries,
  };
}

async function parseXlsxToSnapshot(file: File): Promise<DbSnapshotV1> {
  const bytes = await file.arrayBuffer();
  const wb = XLSX.read(bytes, { type: 'array', cellDates: true });
  return buildSnapshotFromWorkbook(wb);
}

function isXlsxNotSupportedInWorkerError(error: unknown) {
  const e = error as { response?: { status?: number; data?: unknown } };
  const status = e?.response?.status;
  const data = e?.response?.data;
  if (status !== 501) return false;
  if (typeof data !== 'string') return false;
  return /xlsx/i.test(data) && /use json/i.test(data);
}

export function ImportarPage() {
  const httpClient = useHttpClient();
  const queryClient = useQueryClient();

  const [replaceAll, setReplaceAll] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      if (file) {
        if (file.name.toLowerCase().endsWith('.json')) {
          const text = await file.text();
          const parsed = JSON.parse(text) as DbSnapshotV1;
          if (parsed?.version !== 1) {
            throw new Error('Snapshot inválido (version).');
          }
          return importContabilidadeSnapshot(httpClient, parsed, replaceAll);
        }
        if (file.name.toLowerCase().endsWith('.xlsx')) {
          try {
            return await importContabilidadeFile(httpClient, file, replaceAll);
          } catch (err) {
            if (!isXlsxNotSupportedInWorkerError(err)) throw err;
            const snapshot = await parseXlsxToSnapshot(file);
            return importContabilidadeSnapshot(httpClient, snapshot, replaceAll);
          }
        }
        return importContabilidadeFile(httpClient, file, replaceAll);
      }
      return importContabilidade(httpClient, replaceAll);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['assets'] });
      await queryClient.invalidateQueries({ queryKey: ['people'] });
      await queryClient.invalidateQueries({ queryKey: ['entries'] });
    },
  });

  const exportMutation = useMutation({
    mutationFn: () => exportContabilidade(httpClient),
    onSuccess: blob => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const isJson = blob.type.toLowerCase().includes('json');
      const ext = isJson ? 'json' : 'xlsx';
      a.download = `Contabilidade-export-${new Date().toISOString().slice(0, 10)}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    },
  });

  const resultText = useMemo(() => {
    if (!mutation.data) return null;
    return `Entradas importadas: ${mutation.data.entriesInserted} • Itens financeiros: ${mutation.data.assetsInserted}`;
  }, [mutation.data]);

  const importErrorText = useMemo(() => {
    if (!mutation.isError) return null;
    return formatHttpError(mutation.error, httpClient.defaults.baseURL);
  }, [mutation.error, mutation.isError, httpClient.defaults.baseURL]);

  const exportErrorText = useMemo(() => {
    if (!exportMutation.isError) return null;
    return formatHttpError(exportMutation.error, httpClient.defaults.baseURL);
  }, [exportMutation.error, exportMutation.isError, httpClient.defaults.baseURL]);

  const canInteract = !mutation.isPending && !exportMutation.isPending;

  const pickFile = () => {
    if (!canInteract) return;
    fileInputRef.current?.click();
  };

  const setFirstFile = (files: FileList | File[]) => {
    const first = Array.isArray(files) ? files[0] : files.item(0);
    setFile(first ?? null);
  };

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="title">Importar</h1>
          <div className="subtitle">Carrega dados do Excel ou JSON para o banco de dados</div>
        </div>
      </div>

      <div className="card" style={{ background: 'var(--info-light)', border: '1px solid rgba(2,136,209,0.2)' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ color: 'var(--info)', marginTop: 1 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
              <path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--info-dark)' }}>Formatos suportados</div>
            <div style={{ fontSize: 12, color: 'var(--info)', marginTop: 2 }}>
              Arquivos <strong>.xlsx</strong> (Excel) ou <strong>.json</strong> (snapshot). Deixe em branco para importar do servidor.
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-header">
          <h2 className="section-title">Configuração</h2>
        </div>

        <div className="row row--wrap">
          <div className="field field--grow">
            <label className="label">Arquivo (opcional)</label>
            <input
              ref={fileInputRef}
              className="sr-only"
              type="file"
              accept=".xlsx,.json"
              onChange={e => setFirstFile(e.target.files ?? [])}
              disabled={!canInteract}
            />

            <div
              className={isDragging ? 'dropzone dropzone--active' : 'dropzone'}
              role="button"
              tabIndex={0}
              onClick={pickFile}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') pickFile(); }}
              onDragOver={e => { if (!canInteract) return; e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={e => {
                if (!canInteract) return;
                e.preventDefault();
                setIsDragging(false);
                setFirstFile(Array.from(e.dataTransfer.files));
              }}
              aria-disabled={!canInteract}
            >
              <div className="dropzone__icon">
                <UploadCloudIcon />
              </div>
              <div className="dropzone__title">Arraste o arquivo aqui</div>
              <div className="dropzone__subtitle">ou clique para selecionar</div>
              <div className="dropzone__hint">.xlsx ou .json</div>
            </div>

            {file ? (
              <div className="filepill">
                <div className="filepill__icon">
                  <FileIcon />
                </div>
                <div className="filepill__main">
                  <div className="filepill__name">{file.name}</div>
                  <div className="filepill__meta">{Math.max(1, Math.round(file.size / 1024))} KB</div>
                </div>
                <button
                  className="button button--ghost button--sm"
                  type="button"
                  onClick={() => setFile(null)}
                  disabled={!canInteract}
                >
                  Remover
                </button>
              </div>
            ) : null}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="field">
              <label className="label">Modo de importação</label>
              <select
                className="input"
                value={replaceAll ? '1' : '0'}
                onChange={e => setReplaceAll(e.target.value === '1')}
                disabled={!canInteract}
              >
                <option value="1">Substituir tudo</option>
                <option value="0">Mesclar dados</option>
              </select>
            </div>

            <div className="field">
              <label className="label">&nbsp;</label>
              <button
                className="button button--primary"
                type="button"
                onClick={() => mutation.mutate()}
                disabled={!canInteract}
                style={{ width: '100%' }}
              >
                {mutation.isPending ? (
                  <>
                    <div className="spinner" style={{ borderColor: 'rgba(255,255,255,0.4)', borderTopColor: 'transparent' }} />
                    Importando...
                  </>
                ) : 'Importar agora'}
              </button>
            </div>

            <div className="field">
              <button
                className="button button--success"
                type="button"
                onClick={() => exportMutation.mutate()}
                disabled={!canInteract}
                style={{ width: '100%' }}
              >
                {exportMutation.isPending ? (
                  <>
                    <div className="spinner" style={{ borderColor: 'rgba(255,255,255,0.4)', borderTopColor: 'transparent' }} />
                    Exportando...
                  </>
                ) : (
                  <>
                    <DownloadIcon className="icon-16" />
                    Exportar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {mutation.isError ? (
          <div className="status-bar status-bar--error">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
              <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <div>
              <strong>Falha ao importar.</strong>
              {importErrorText ? <div style={{ marginTop: 2, opacity: 0.85 }}>{importErrorText}</div> : null}
            </div>
          </div>
        ) : null}

        {exportMutation.isError ? (
          <div className="status-bar status-bar--error">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
              <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <div>
              <strong>Falha ao exportar.</strong>
              {exportErrorText ? <div style={{ marginTop: 2, opacity: 0.85 }}>{exportErrorText}</div> : null}
            </div>
          </div>
        ) : null}

        {resultText ? (
          <div className="status-bar status-bar--success">
            <CheckCircleIcon />
            <strong>{resultText}</strong>
          </div>
        ) : null}
      </div>
    </div>
  );
}
