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
    return `Entradas: ${mutation.data.entriesInserted} | Itens finanças: ${mutation.data.assetsInserted}`;
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
          <div className="subtitle">Carrega dados do Excel para o banco.</div>
        </div>
      </div>

      <div className="card">
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
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') pickFile();
              }}
              onDragOver={e => {
                if (!canInteract) return;
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={e => {
                if (!canInteract) return;
                e.preventDefault();
                setIsDragging(false);
                setFirstFile(Array.from(e.dataTransfer.files));
              }}
              aria-disabled={!canInteract}
            >
              <div className="dropzone__title">Arraste o arquivo aqui</div>
              <div className="dropzone__subtitle">ou clique para selecionar</div>
              <div className="dropzone__hint">Formato: .xlsx ou .json</div>
            </div>

            {file ? (
              <div className="filepill">
                <div className="filepill__main">
                  <div className="filepill__name">{file.name}</div>
                  <div className="filepill__meta">{Math.max(1, Math.round(file.size / 1024))} KB</div>
                </div>
                <button
                  className="button button--ghost filepill__remove"
                  type="button"
                  onClick={() => setFile(null)}
                  disabled={!canInteract}
                >
                  Remover
                </button>
              </div>
            ) : null}
          </div>
          <div className="field">
            <label className="label">Substituir tudo</label>
            <select
              className="input"
              value={replaceAll ? '1' : '0'}
              onChange={e => setReplaceAll(e.target.value === '1')}
              disabled={!canInteract}
            >
              <option value="1">Sim</option>
              <option value="0">Não</option>
            </select>
          </div>
          <div className="field">
            <label className="label">&nbsp;</label>
            <button
              className="button button--primary"
              type="button"
              onClick={() => mutation.mutate()}
              disabled={!canInteract}
            >
              Importar agora
            </button>
          </div>
          <div className="field">
            <label className="label">&nbsp;</label>
            <button
              className="button button--success"
              type="button"
              onClick={() => exportMutation.mutate()}
              disabled={!canInteract}
            >
              Exportar
            </button>
          </div>
        </div>

        {mutation.isPending ? <div className="muted">Importando...</div> : null}
        {mutation.isError ? (
          <div className="error">
            Falha ao importar.
            {importErrorText ? <div className="muted">{importErrorText}</div> : null}
          </div>
        ) : null}
        {exportMutation.isPending ? <div className="muted">Exportando...</div> : null}
        {exportMutation.isError ? (
          <div className="error">
            Falha ao exportar.
            {exportErrorText ? <div className="muted">{exportErrorText}</div> : null}
          </div>
        ) : null}
        {resultText ? <div className="success">{resultText}</div> : null}
      </div>
    </div>
  );
}
