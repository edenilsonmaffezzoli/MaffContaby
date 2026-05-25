import { getApiBaseUrl } from '@/config/api-base-url';
import { useHttpClient } from '@/hooks/use-http-client';
import { gerarCasoTeste } from '@/services/casos-teste-service';
import type { GerarCasoTesteResponse, ImageInput, QaseCase, SourceFileInput } from '@/types/casos-teste';
import { openCasosTestePdf } from '@/utils/casos-teste-pdf';
import { downloadPromptTxt, extractPromptFromGerarError } from '@/utils/download-prompt-txt';
import {
  downloadFixedQaseCsv,
  downloadQaseCsv,
  formatQaseCsvExportSummary,
  QASE_CSV_IMPORT_HINT,
  type QaseCsvExportStats,
} from '@/utils/qase-csv-export';
import {
  fileToBase64,
  readSourceFromDirectoryPicker,
  readSourceFromFileList,
} from '@/utils/read-source-folder';
import { useMutation } from '@tanstack/react-query';
import { marked } from 'marked';
import { useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';

function formatGerarMeta(meta: GerarCasoTesteResponse['meta']): string {
  const parts = [
    `Modelo: ${meta.model}`,
    `Arquivos: ${meta.filesIncluded}`,
    meta.truncated ? 'Entrada truncada' : null,
    meta.urlContentFetched ? 'Página URL incluída no prompt' : null,
    meta.urlContentTruncated ? 'Conteúdo URL truncado' : null,
    meta.urlFetchError ? `URL: ${meta.urlFetchError}` : null,
    meta.casesAfterNormalize != null ? `Casos válidos: ${meta.casesAfterNormalize}` : null,
    meta.casesFromGemini != null && meta.casesDropped != null && meta.casesDropped > 0
      ? `Descartados na normalização: ${meta.casesDropped} (de ${meta.casesFromGemini} da IA)`
      : meta.casesFromGemini != null
        ? `Casos da IA: ${meta.casesFromGemini}`
        : null,
    meta.rawJsonLength != null ? `JSON IA: ${meta.rawJsonLength.toLocaleString('pt-BR')} caracteres` : null,
    meta.outputTruncated ? 'Saída da IA possivelmente cortada (aumente GEMINI_MAX_OUTPUT_TOKENS)' : null,
    meta.finishReason && meta.finishReason !== 'STOP' ? `finishReason: ${meta.finishReason}` : null,
    meta.suitesUsed?.length ? `Suites: ${meta.suitesUsed.join(', ')}` : null,
    meta.groupingWarning ?? null,
  ].filter(Boolean);
  return parts.join(' · ');
}

function formatHttpError(error: unknown) {
  const e = error as {
    message?: string;
    response?: { status?: number; statusText?: string; data?: unknown };
  };
  const status = e?.response?.status;
  const data = e?.response?.data;
  if (data && typeof data === 'object' && data !== null && 'error' in data) {
    const errMsg = (data as { error?: string }).error;
    if (errMsg?.trim()) return status ? `${status} — ${errMsg}` : errMsg;
  }
  if (typeof data === 'string' && data.trim()) {
    return status ? `${status} — ${data.trim()}` : data.trim();
  }
  if (status) return String(status);
  return e?.message?.trim() || 'Erro desconhecido';
}

function SparklesIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2l1.2 4.2L17.5 8 13.2 9.2 12 13.5 10.8 9.2 6.5 8l4.3-1.8L12 2ZM5 14l.8 2.8L8.5 18l-2.7 1.2L5 22l-.8-2.8L1.5 18l2.7-1.2L5 14Zm14 0l.8 2.8 2.7 1.2-2.7 1.2-.8 2.8-.8-2.8-2.7-1.2 2.7-1.2.8-2.8Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type ImagePreview = {
  id: string;
  file: File;
  url: string;
};

export function CasosTesteInteligentesPage() {
  const token = localStorage.getItem('gdp_token')?.trim() ?? '';
  if (!token) return <Navigate to="/login" replace />;

  const httpClient = useHttpClient();
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const csvFixInputRef = useRef<HTMLInputElement | null>(null);
  const [exportSummary, setExportSummary] = useState<QaseCsvExportStats | null>(null);

  const [systemPath, setSystemPath] = useState('');
  const [sourcePathLabel, setSourcePathLabel] = useState('');
  const [sourceFiles, setSourceFiles] = useState<SourceFileInput[]>([]);
  const [sourceTruncated, setSourceTruncated] = useState(false);
  const [imagePreviews, setImagePreviews] = useState<ImagePreview[]>([]);
  const [markdown, setMarkdown] = useState('');
  const [cases, setCases] = useState<QaseCase[]>([]);
  const [metaInfo, setMetaInfo] = useState<string | null>(null);
  const [lastPrompt, setLastPrompt] = useState('');
  const [folderLoading, setFolderLoading] = useState(false);

  const gerarMutation = useMutation({
    mutationFn: async () => {
      const images: ImageInput[] = await Promise.all(
        imagePreviews.map(async p => ({
          mimeType: p.file.type || 'image/png',
          base64: await fileToBase64(p.file),
          name: p.file.name,
        })),
      );

      return gerarCasoTeste(httpClient, {
        systemPath: systemPath.trim() || undefined,
        sourcePathLabel: sourcePathLabel.trim() || undefined,
        sourceFiles: sourceFiles.length ? sourceFiles : undefined,
        images: images.length ? images : undefined,
      });
    },
    onSuccess: data => {
      setMarkdown(data.markdown);
      setCases(data.cases);
      setLastPrompt(data.prompt ?? '');
      setMetaInfo(formatGerarMeta(data.meta));
    },
    onError: error => {
      const prompt = extractPromptFromGerarError(error);
      if (prompt) setLastPrompt(prompt);
    },
  });

  const previewHtml = useMemo(() => {
    if (!markdown.trim()) return '';
    return marked.parse(markdown, { async: false }) as string;
  }, [markdown]);

  async function handleSelectFolder() {
    setFolderLoading(true);
    try {
      const picker = await readSourceFromDirectoryPicker();
      if (picker) {
        setSourceFiles(picker.files);
        setSourcePathLabel(picker.sourcePathLabel);
        setSourceTruncated(picker.truncated);
        return;
      }
      folderInputRef.current?.click();
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        alert(err instanceof Error ? err.message : 'Não foi possível ler a pasta');
      }
    } finally {
      setFolderLoading(false);
    }
  }

  async function handleFolderInputChange(files: FileList | null) {
    if (!files?.length) return;
    setFolderLoading(true);
    try {
      const first = files[0];
      const root = first.webkitRelativePath?.split('/')[0] ?? 'pasta-selecionada';
      const result = await readSourceFromFileList(files, root);
      setSourceFiles(result.files);
      setSourcePathLabel(result.sourcePathLabel);
      setSourceTruncated(result.truncated);
    } finally {
      setFolderLoading(false);
    }
  }

  function handleImagesChange(fileList: FileList | null) {
    if (!fileList?.length) return;
    const next: ImagePreview[] = [];
    for (const file of Array.from(fileList)) {
      if (!file.type.startsWith('image/')) continue;
      next.push({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) });
    }
    setImagePreviews(prev => [...prev, ...next].slice(0, 8));
  }

  function removeImage(id: string) {
    setImagePreviews(prev => {
      const item = prev.find(p => p.id === id);
      if (item) URL.revokeObjectURL(item.url);
      return prev.filter(p => p.id !== id);
    });
  }

  function handleClearAll() {
    setSystemPath('');
    setSourcePathLabel('');
    setSourceFiles([]);
    setSourceTruncated(false);
    imagePreviews.forEach(p => URL.revokeObjectURL(p.url));
    setImagePreviews([]);
    setMarkdown('');
    setCases([]);
    setMetaInfo(null);
    setLastPrompt('');
    setExportSummary(null);
    gerarMutation.reset();
    if (folderInputRef.current) folderInputRef.current.value = '';
  }

  function handleExportCsv() {
    if (!cases.length) {
      alert('Não há casos estruturados para exportar. Gere novamente com a IA.');
      return;
    }
    try {
      const stats = downloadQaseCsv(cases);
      setExportSummary(stats);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao gerar CSV.';
      alert(msg);
    }
  }

  async function handleFixExistingFile(file: File) {
    try {
      const text = await file.text();
      const stats = downloadFixedQaseCsv(text);
      setExportSummary(stats);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao corrigir arquivo.';
      alert(msg);
    } finally {
      if (csvFixInputRef.current) csvFixInputRef.current.value = '';
    }
  }

  function handleExportPdf() {
    if (!markdown.trim()) {
      alert('Não há conteúdo para gerar PDF.');
      return;
    }
    openCasosTestePdf(markdown, 'Casos de Teste Inteligentes');
  }

  const canGenerate =
    Boolean(systemPath.trim()) ||
    sourceFiles.length > 0 ||
    imagePreviews.length > 0;

  const apiBase = getApiBaseUrl();

  return (
    <div className="page">
      <div className="page__header">
        <h1 className="title">Casos de Testes Inteligentes</h1>
        <div className="subtitle">
          Gere casos de teste completos com IA (Gemini) e exporte CSV para importação no Qase.io
        </div>
        <p className="muted" style={{ marginTop: 8, fontSize: 13, maxWidth: 720 }}>
          {QASE_CSV_IMPORT_HINT}
        </p>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="field" style={{ marginBottom: 14 }}>
          <label className="label" htmlFor="systemPath">
            Path do Sistema <span className="muted">(opcional)</span>
          </label>
          <input
            id="systemPath"
            className="input"
            type="text"
            placeholder="Ex.: /financas, /api/entries, módulo de login…"
            value={systemPath}
            onChange={e => setSystemPath(e.target.value)}
          />
        </div>

        <div className="field" style={{ marginBottom: 14 }}>
          <label className="label" htmlFor="sourcePath">
            Caminho do Código Fonte
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              id="sourcePath"
              className="input"
              type="text"
              style={{ flex: '1 1 240px' }}
              placeholder="Pasta selecionada ou caminho manual"
              value={sourcePathLabel}
              onChange={e => setSourcePathLabel(e.target.value)}
            />
            <button
              type="button"
              className="button"
              disabled={folderLoading}
              onClick={() => void handleSelectFolder()}
            >
              {folderLoading ? 'Lendo…' : 'Selecionar pasta'}
            </button>
          </div>
          <input
            ref={folderInputRef}
            type="file"
            multiple
            // @ts-expect-error webkitdirectory
            webkitdirectory=""
            style={{ display: 'none' }}
            onChange={e => void handleFolderInputChange(e.target.files)}
          />
          {sourceFiles.length > 0 ? (
            <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
              {sourceFiles.length} arquivo(s) carregado(s)
              {sourceTruncated ? ' — limite de 150.000 caracteres atingido' : ''}
            </div>
          ) : null}
        </div>

        <div className="field" style={{ marginBottom: 14 }}>
          <label className="label">
            Imagens <span className="muted">(opcional, máx. 8)</span>
          </label>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={e => {
              handleImagesChange(e.target.files);
              e.target.value = '';
            }}
          />
          {imagePreviews.length > 0 ? (
            <div className="casos-teste-images" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              {imagePreviews.map(p => (
                <div key={p.id} className="casos-teste-images__item" style={{ position: 'relative' }}>
                  <img
                    src={p.url}
                    alt={p.file.name}
                    style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }}
                  />
                  <button
                    type="button"
                    className="button button--ghost button--sm"
                    style={{ position: 'absolute', top: -6, right: -6, padding: '2px 6px', minWidth: 0 }}
                    onClick={() => removeImage(p.id)}
                    aria-label="Remover imagem"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className="button button--primary"
          disabled={!canGenerate || gerarMutation.isPending}
          onClick={() => gerarMutation.mutate()}
        >
          <SparklesIcon />
          <span style={{ marginLeft: 6 }}>
            {gerarMutation.isPending ? 'Gerando com IA…' : 'Gerar Caso de Teste com IA'}
          </span>
        </button>

        {gerarMutation.isError ? (
          <div style={{ marginTop: 12 }}>
            <div className="alert alert--danger">
              {formatHttpError(gerarMutation.error)}
              {!localStorage.getItem('gdp_token') ? ' Faça login em /login.' : null}
            </div>
            {lastPrompt.trim() ? (
              <button
                type="button"
                className="button"
                style={{ marginTop: 8 }}
                onClick={() => downloadPromptTxt(lastPrompt)}
                title="Baixa o prompt enviado à IA nesta tentativa (mesmo com falha)"
              >
                Baixar prompt (.txt)
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
          API: {apiBase} · Requer login GDP
        </div>
      </div>

      {(markdown.trim() || gerarMutation.isSuccess || lastPrompt.trim()) && (
        <div className="card">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, alignItems: 'center' }}>
            <h2 className="title" style={{ fontSize: '1.1rem', margin: 0, flex: '1 1 auto' }}>
              {markdown.trim() || cases.length ? 'Resultado' : 'Prompt da última tentativa'}
            </h2>
            {metaInfo ? <span className="muted" style={{ fontSize: 12 }}>{metaInfo}</span> : null}
            <button type="button" className="button" onClick={handleClearAll}>
              Limpar Tudo
            </button>
            <button
              type="button"
              className="button"
              onClick={handleExportCsv}
              disabled={!cases.length}
              title="CSV Qase.io v2 com pastas por assunto (suite/subsuite)"
            >
              Exportar CSV para Qase
            </button>
            <button
              type="button"
              className="button"
              onClick={() => csvFixInputRef.current?.click()}
            >
              Corrigir CSV/XML existente
            </button>
            <input
              ref={csvFixInputRef}
              type="file"
              accept=".csv,.xml,text/csv,application/xml,text/xml"
              style={{ display: 'none' }}
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) void handleFixExistingFile(file);
              }}
            />
            <button type="button" className="button button--primary" onClick={handleExportPdf} disabled={!markdown.trim()}>
              Gerar PDF
            </button>
            <button
              type="button"
              className="button"
              disabled={!lastPrompt.trim()}
              onClick={() => downloadPromptTxt(lastPrompt)}
              title="Baixa o prompt exato enviado à IA na última geração"
            >
              Baixar prompt (.txt)
            </button>
          </div>

          {exportSummary ? (
            <pre
              className="card"
              style={{
                marginBottom: 12,
                padding: 12,
                fontSize: 13,
                whiteSpace: 'pre-wrap',
                background: 'var(--surface-2, #f5f5f5)',
              }}
            >
              {formatQaseCsvExportSummary(exportSummary)}
            </pre>
          ) : null}

          {!cases.length && markdown ? (
            <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
              O CSV usa a estrutura retornada pela IA. Se você editar apenas o markdown, regenere para atualizar o export Qase.
            </p>
          ) : null}

          {markdown.trim() ? (
            <div className="casos-teste-editor" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, minHeight: 360 }}>
              <div>
                <label className="label">Markdown (editável)</label>
                <textarea
                  className="input"
                  style={{
                    width: '100%',
                    minHeight: 320,
                    fontFamily: 'ui-monospace, Consolas, monospace',
                    fontSize: 13,
                    resize: 'vertical',
                  }}
                  value={markdown}
                  onChange={e => setMarkdown(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Pré-visualização</label>
                <div
                  className="casos-teste-preview card"
                  style={{ minHeight: 320, maxHeight: 480, overflow: 'auto', padding: 14 }}
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </div>
            </div>
          ) : lastPrompt.trim() && gerarMutation.isError ? (
            <p className="muted" style={{ fontSize: 13 }}>
              A geração falhou, mas o prompt enviado à IA está disponível para download acima ou no botão desta seção.
            </p>
          ) : null}

          {cases.length > 0 ? (
            <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>
              {cases.length} caso(s) prontos para importação no Qase (Source: Qase → CSV).
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
