import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { StatusMessage } from '@/components/ui/spinner';
import { useHttpClient } from '@/hooks/use-http-client';
import {
  clearDatabase,
  exportContabilidade,
  importContabilidade,
  importContabilidadeFile,
  importContabilidadeSnapshot,
  ContabilidadePlanilha,
  normalizeSnapshotV1,
  type DbSnapshotV1,
} from '@/services/import-service';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Download, FileIcon, Info, Trash2, Upload, X } from 'lucide-react';
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
  if (status) return statusText?.trim() ? `${status} - ${statusText.trim()}` : String(status);
  const msg = e?.message?.trim();
  if (!msg) return 'Erro desconhecido';
  if (/network error|failed to fetch|err_network/i.test(msg)) {
    const base = apiBaseUrl?.trim() ? apiBaseUrl.trim() : '(sem baseURL)';
    return `Não consegui conectar na API (${base}). Verifique se a API está rodando.`;
  }
  return msg;
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
          const normalized = normalizeSnapshotV1(parsed);
          if (!normalized) throw new Error('Snapshot inválido (version).');
          return importContabilidadeSnapshot(httpClient, normalized, replaceAll);
        }
        if (file.name.toLowerCase().endsWith('.xlsx')) {
          try {
            return await importContabilidadeFile(httpClient, file, replaceAll);
          } catch (err) {
            if (!isXlsxNotSupportedInWorkerError(err)) throw err;
            const snapshot = await ContabilidadePlanilha.parseXlsxToSnapshot(file);
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
    mutationFn: async () => {
      const blob = await exportContabilidade(httpClient);
      const fileName = `Contabilidade-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
      const type = blob.type.toLowerCase();
      if (type.includes('json')) {
        const text = await blob.text();
        const parsed = JSON.parse(text) as DbSnapshotV1;
        const normalized = normalizeSnapshotV1(parsed);
        if (!normalized) throw new Error('Snapshot inválido (version).');
        return { blob: ContabilidadePlanilha.snapshotToXlsxBlob(normalized), fileName };
      }
      return { blob, fileName };
    },
    onSuccess: ({ blob, fileName }) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    },
  });

  const clearMutation = useMutation({
    mutationFn: async () => { await clearDatabase(httpClient); },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['assets'] });
      await queryClient.invalidateQueries({ queryKey: ['people'] });
      await queryClient.invalidateQueries({ queryKey: ['entries'] });
    },
  });

  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const resultText = useMemo(() => {
    if (!mutation.data) return null;
    return `Entradas importadas: ${mutation.data.entriesInserted} · Itens financeiros: ${mutation.data.assetsInserted}`;
  }, [mutation.data]);

  const importErrorText = useMemo(() => {
    if (!mutation.isError) return null;
    return formatHttpError(mutation.error, httpClient.defaults.baseURL);
  }, [mutation.error, mutation.isError, httpClient.defaults.baseURL]);

  const exportErrorText = useMemo(() => {
    if (!exportMutation.isError) return null;
    return formatHttpError(exportMutation.error, httpClient.defaults.baseURL);
  }, [exportMutation.error, exportMutation.isError, httpClient.defaults.baseURL]);

  const canInteract = !mutation.isPending && !exportMutation.isPending && !clearMutation.isPending;

  const pickFile = () => { if (canInteract) fileInputRef.current?.click(); };
  const setFirstFile = (files: FileList | File[]) => {
    const first = Array.isArray(files) ? files[0] : files.item(0);
    setFile(first ?? null);
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Importar" subtitle="Carrega dados do Excel ou JSON para o banco de dados" />

      {/* Info banner */}
      <div className="flex items-start gap-3 px-4 py-3.5 bg-[rgba(102,153,204,0.12)] border border-[rgba(102,153,204,0.3)] rounded-lg">
        <Info size={16} className="text-[#6699CC] shrink-0 mt-0.5" />
        <div>
          <p className="text-[13px] font-semibold text-[#003366]">Formatos suportados</p>
          <p className="text-xs text-[#6699CC] mt-0.5">
            Arquivos <strong>.xlsx</strong> (Excel) ou <strong>.json</strong> (snapshot). Deixe em branco para importar do servidor.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader title="Importar dados" />
        <div className="flex flex-wrap gap-5 items-start">
          {/* Dropzone */}
          <div className="flex-1 min-w-[260px]">
            <p className="text-xs font-semibold text-gray-500 mb-1.5">Arquivo <span className="font-normal text-gray-400">(opcional)</span></p>
            <input
              ref={fileInputRef}
              className="sr-only"
              type="file"
              accept=".xlsx,.json"
              onChange={e => setFirstFile(e.target.files ?? [])}
              disabled={!canInteract}
            />
            <div
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
              className={[
                'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer select-none transition-all duration-150',
                isDragging
                  ? 'border-primary bg-primary-light shadow-[0_0_0_4px_rgba(0,102,102,0.10)]'
                  : 'border-gray-200 bg-gray-50 hover:border-primary/40 hover:bg-primary-light',
                !canInteract ? 'opacity-55 cursor-not-allowed' : '',
              ].join(' ')}
            >
              <div className="w-10 h-10 bg-primary-light rounded-xl flex items-center justify-center mx-auto mb-3 text-primary">
                <Upload size={20} />
              </div>
              <p className="font-semibold text-[14px] text-gray-700">Arraste o arquivo aqui</p>
              <p className="text-[13px] text-gray-500 mt-1">ou clique para selecionar</p>
              <span className="mt-2.5 inline-block text-[11px] text-gray-400 bg-white px-2.5 py-0.5 rounded-full border border-gray-200">.xlsx ou .json</span>
            </div>

            {file ? (
              <div className="mt-3 border border-gray-200 rounded-lg px-3.5 py-3 flex items-center gap-3 bg-white">
                <div className="w-9 h-9 rounded-lg bg-[rgba(102,153,204,0.16)] flex items-center justify-center text-[#6699CC] shrink-0">
                  <FileIcon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[13px] truncate">{file.name}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{Math.max(1, Math.round(file.size / 1024))} KB</p>
                </div>
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  disabled={!canInteract}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            ) : null}
          </div>

          {/* Controls */}
          <div className="flex flex-col gap-3 min-w-[200px]">
            <Select
              label="Modo de importação"
              value={replaceAll ? '1' : '0'}
              onChange={e => setReplaceAll(e.target.value === '1')}
              disabled={!canInteract}
            >
              <option value="1">Substituir tudo</option>
              <option value="0">Mesclar dados</option>
            </Select>

            <Button
              variant="primary"
              loading={mutation.isPending}
              disabled={!canInteract}
              onClick={() => mutation.mutate()}
              className="w-full"
            >
              <Upload size={16} />
              Importar agora
            </Button>

            <Button
              variant="success"
              loading={exportMutation.isPending}
              disabled={!canInteract}
              onClick={() => exportMutation.mutate()}
              className="w-full"
            >
              <Download size={16} />
              Exportar
            </Button>
          </div>
        </div>

        {/* Status messages */}
        {mutation.isError ? (
          <StatusMessage type="error">
            <div>
              <strong>Falha ao importar.</strong>
              {importErrorText ? <div className="mt-0.5 opacity-85">{importErrorText}</div> : null}
            </div>
          </StatusMessage>
        ) : null}

        {exportMutation.isError ? (
          <StatusMessage type="error">
            <div>
              <strong>Falha ao exportar.</strong>
              {exportErrorText ? <div className="mt-0.5 opacity-85">{exportErrorText}</div> : null}
            </div>
          </StatusMessage>
        ) : null}

        {resultText ? (
          <StatusMessage type="success">
            <strong>{resultText}</strong>
          </StatusMessage>
        ) : null}

        {/* Danger zone */}
        <div className="mt-5 pt-4 border-t border-gray-100">
          <details className="group">
            <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-600 transition-colors select-none list-none flex items-center gap-1.5">
              <AlertCircle size={13} />
              Zona de perigo
            </summary>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 p-4 bg-[#FFEBEE] border border-[rgba(211,47,47,0.2)] rounded-lg">
              <div>
                <p className="text-sm font-semibold text-[#B71C1C]">Limpar toda a base de dados</p>
                <p className="text-xs text-[#D32F2F] mt-0.5">Esta ação é irreversível. Todos os dados serão apagados.</p>
              </div>
              {showClearConfirm ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[#B71C1C]">Tem certeza absoluta?</span>
                  <Button
                    variant="danger"
                    size="sm"
                    loading={clearMutation.isPending}
                    disabled={!canInteract}
                    onClick={() => { clearMutation.mutate(); setShowClearConfirm(false); }}
                  >
                    Sim, apagar tudo
                  </Button>
                  <Button variant="default" size="sm" onClick={() => setShowClearConfirm(false)}>
                    Cancelar
                  </Button>
                </div>
              ) : (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setShowClearConfirm(true)}
                  disabled={!canInteract}
                >
                  <Trash2 size={14} />
                  Limpar base
                </Button>
              )}
            </div>
          </details>
        </div>
      </Card>
    </div>
  );
}
