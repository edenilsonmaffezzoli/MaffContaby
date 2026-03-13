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
          if (parsed?.version !== 1) throw new Error('Snapshot inválido (version).');
          return importContabilidadeSnapshot(httpClient, parsed, replaceAll);
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

  const pickFile = () => { if (canInteract) fileInputRef.current?.click(); };

  const setFirstFile = (files: FileList | File[]) => {
    const first = Array.isArray(files) ? files[0] : files.item(0);
    setFile(first ?? null);
  };

  return (
    <div className="page">
      {/* Header */}
      <div className="page__header">
        <div>
          <h1 className="title">Importar</h1>
          <div className="subtitle">Carrega dados do Excel ou JSON para o banco de dados</div>
        </div>
      </div>

      {/* Info card */}
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

      {/* Main import card */}
      <div className="card">
        <div className="section-header">
          <h2 className="section-title">Configuração</h2>
        </div>

        <div className="row row--wrap">
          {/* File upload */}
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

            {file && (
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
            )}
          </div>

          {/* Options */}
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

        {/* Status messages */}
        {mutation.isError && (
          <div className="status-bar status-bar--error">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
              <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <div>
              <strong>Falha ao importar.</strong>
              {importErrorText && <div style={{ marginTop: 2, opacity: 0.85 }}>{importErrorText}</div>}
            </div>
          </div>
        )}

        {exportMutation.isError && (
          <div className="status-bar status-bar--error">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
              <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <div>
              <strong>Falha ao exportar.</strong>
              {exportErrorText && <div style={{ marginTop: 2, opacity: 0.85 }}>{exportErrorText}</div>}
            </div>
          </div>
        )}

        {resultText && (
          <div className="status-bar status-bar--success">
            <CheckCircleIcon />
            <strong>{resultText}</strong>
          </div>
        )}
      </div>
    </div>
  );
}
