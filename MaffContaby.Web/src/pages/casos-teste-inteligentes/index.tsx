import { getApiBaseUrl } from '@/config/api-base-url';
import { useHttpClient } from '@/hooks/use-http-client';
import { gerarCasoTeste } from '@/services/casos-teste-service';
import type { GerarCasoTesteResponse, ImageInput, QaseCase } from '@/types/casos-teste';
import { openCasosTestePdf } from '@/utils/casos-teste-pdf';
import {
  downloadQaseCsv,
  formatQaseCsvExportSummary,
  type QaseCsvExportStats,
} from '@/utils/qase-csv-export';
import { fileToBase64 } from '@/utils/read-source-folder';
import { useMutation } from '@tanstack/react-query';
import { marked } from 'marked';
import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';

function formatGerarMeta(meta: GerarCasoTesteResponse['meta']): string {
  const parts = [
    `Modelo: ${meta.model}`,
    meta.truncated ? 'Entrada truncada' : null,
    meta.urlContentFetched ? 'Página URL incluída no prompt' : null,
    meta.urlContentTruncated ? 'Conteúdo URL truncado' : null,
    meta.urlFetchError ? `URL: ${meta.urlFetchError}` : null,
    meta.authAttempted ? `Autenticação: ${meta.authSuccess ? 'sucesso' : 'falha'}` : null,
    meta.authMode ? `Modo: ${meta.authMode}` : null,
    meta.authError ? `Autenticação: ${meta.authError}` : null,
    meta.casesAfterNormalize != null ? `Casos válidos: ${meta.casesAfterNormalize}` : null,
    meta.casesFromGemini != null && meta.casesDropped != null && meta.casesDropped > 0
      ? `Descartados na normalização: ${meta.casesDropped} (de ${meta.casesFromGemini} da IA)`
      : meta.casesFromGemini != null
        ? `Casos da IA: ${meta.casesFromGemini}`
        : null,
    meta.rawJsonLength != null ? `Resposta IA: ${meta.rawJsonLength.toLocaleString('pt-BR')} caracteres` : null,
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
  const [exportSummary, setExportSummary] = useState<QaseCsvExportStats | null>(null);

  const [systemPath, setSystemPath] = useState('');
  const [imagePreviews, setImagePreviews] = useState<ImagePreview[]>([]);
  const [markdown, setMarkdown] = useState('');
  const [cases, setCases] = useState<QaseCase[]>([]);
  const [metaInfo, setMetaInfo] = useState<string | null>(null);
  const [showTargetAuth, setShowTargetAuth] = useState(false);
  const [targetLoginUrl, setTargetLoginUrl] = useState('');
  const [targetUsername, setTargetUsername] = useState('');
  const [targetPassword, setTargetPassword] = useState('');
  const [targetAuthMode, setTargetAuthMode] = useState<'auto' | 'form' | 'json'>('auto');

  const gerarMutation = useMutation({
    mutationFn: async () => {
      const images: ImageInput[] = await Promise.all(
        imagePreviews.map(async p => ({
          mimeType: p.file.type || 'image/png',
          base64: await fileToBase64(p.file),
          name: p.file.name,
        })),
      );

      const hasTargetAuthComplete =
        Boolean(targetLoginUrl.trim()) && Boolean(targetUsername.trim()) && Boolean(targetPassword);

      const targetAuth = hasTargetAuthComplete
        ? {
            loginUrl: targetLoginUrl.trim(),
            username: targetUsername.trim(),
            password: targetPassword,
            mode: targetAuthMode,
          }
        : undefined;

      return gerarCasoTeste(httpClient, {
        systemPath: systemPath.trim() || undefined,
        images: images.length ? images : undefined,
        targetAuth,
      });
    },
    onSuccess: data => {
      setMarkdown(data.markdown);
      setCases(data.cases);
      setMetaInfo(formatGerarMeta(data.meta));
    },
  });

  const previewHtml = useMemo(() => {
    if (!markdown.trim()) return '';
    return marked.parse(markdown, { async: false }) as string;
  }, [markdown]);

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
    imagePreviews.forEach(p => URL.revokeObjectURL(p.url));
    setImagePreviews([]);
    setMarkdown('');
    setCases([]);
    setMetaInfo(null);
    setExportSummary(null);
    setShowTargetAuth(false);
    setTargetLoginUrl('');
    setTargetUsername('');
    setTargetPassword('');
    setTargetAuthMode('auto');
    gerarMutation.reset();
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

  function handleExportPdf() {
    if (!markdown.trim()) {
      alert('Não há conteúdo para gerar PDF.');
      return;
    }
    openCasosTestePdf(markdown, 'Casos de Teste Inteligentes');
  }

  const hasTargetAuthAny = Boolean(targetLoginUrl.trim() || targetUsername.trim() || targetPassword);
  const hasTargetAuthComplete =
    Boolean(targetLoginUrl.trim()) && Boolean(targetUsername.trim()) && Boolean(targetPassword);

  const canGenerate =
    (!hasTargetAuthAny || hasTargetAuthComplete) &&
    (hasTargetAuthComplete
      ? Boolean(systemPath.trim())
      : Boolean(systemPath.trim()) || imagePreviews.length > 0);

  const apiBase = getApiBaseUrl();

  return (
    <div className="page">
      <div className="page__header">
        <h1 className="title">Casos de Teste Inteligentes</h1>
        <p className="subtitle">Gere casos com IA (Gemini) e exporte CSV para o Qase.io</p>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="field" style={{ marginBottom: 14 }}>
          <label className="label" htmlFor="systemPath">
            URL do sistema {hasTargetAuthComplete ? <span className="muted">(página após login)</span> : null}
          </label>
          <input
            id="systemPath"
            className="input"
            type="url"
            placeholder="https://seu-sistema.com.br/dashboard"
            value={systemPath}
            onChange={e => setSystemPath(e.target.value)}
          />
        </div>

        <div className="field" style={{ marginBottom: 14 }}>
          <button
            type="button"
            className="button"
            style={{ width: '100%', justifyContent: 'space-between' }}
            aria-expanded={showTargetAuth}
            onClick={() => setShowTargetAuth(open => !open)}
          >
            <span>
              Sistema com login
              {hasTargetAuthComplete ? <span className="muted"> · configurado</span> : null}
            </span>
            <span aria-hidden="true">{showTargetAuth ? '▲' : '▼'}</span>
          </button>

          {showTargetAuth ? (
            <div
              style={{
                marginTop: 10,
                padding: 12,
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--surface-2, #f8f9fa)',
              }}
            >
              <p className="muted" style={{ margin: '0 0 12px', fontSize: 12 }}>
                Opcional. Use credenciais de homologação; a senha não é salva nem vai para o CSV.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className="label" style={{ fontSize: 13 }}>
                    URL de login
                  </label>
                  <input
                    className="input"
                    type="url"
                    placeholder="https://seu-sistema.com.br/login"
                    value={targetLoginUrl}
                    onChange={e => setTargetLoginUrl(e.target.value)}
                  />
                </div>

                <div>
                  <label className="label" style={{ fontSize: 13 }}>
                    Modo
                  </label>
                  <select
                    className="input"
                    value={targetAuthMode}
                    onChange={e => setTargetAuthMode(e.target.value as 'auto' | 'form' | 'json')}
                  >
                    <option value="auto">Auto</option>
                    <option value="form">Formulário HTML</option>
                    <option value="json">API JSON</option>
                  </select>
                </div>

                <div>
                  <label className="label" style={{ fontSize: 13 }}>
                    Usuário
                  </label>
                  <input
                    className="input"
                    type="text"
                    placeholder="Usuário de teste"
                    value={targetUsername}
                    onChange={e => setTargetUsername(e.target.value)}
                    autoComplete="off"
                  />
                </div>

                <div>
                  <label className="label" style={{ fontSize: 13 }}>
                    Senha
                  </label>
                  <input
                    className="input"
                    type="password"
                    placeholder="Senha de teste"
                    value={targetPassword}
                    onChange={e => setTargetPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
              </div>

              {hasTargetAuthAny && !hasTargetAuthComplete ? (
                <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                  Preencha URL de login, usuário e senha, e informe a URL do sistema acima.
                </div>
              ) : null}
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
          <div className="alert alert--danger" style={{ marginTop: 12 }}>
            {formatHttpError(gerarMutation.error)}
            {!localStorage.getItem('gdp_token') ? ' Faça login em /login.' : null}
          </div>
        ) : null}

        <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
          API: {apiBase} · Requer login GDP
        </div>
      </div>

      {(markdown.trim() || cases.length > 0) && (
        <div className="card">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, alignItems: 'center' }}>
            <h2 className="title" style={{ fontSize: '1.1rem', margin: 0, flex: '1 1 auto' }}>
              Resultado
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
            <button type="button" className="button button--primary" onClick={handleExportPdf} disabled={!markdown.trim()}>
              Gerar PDF
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

          {markdown.trim() ? (
            <div className="casos-teste-editor">
              <div className="casos-teste-editor__col">
                <label className="label">Markdown (editável)</label>
                <textarea
                  className="input casos-teste-editor__textarea"
                  value={markdown}
                  onChange={e => setMarkdown(e.target.value)}
                />
              </div>
              <div className="casos-teste-editor__col">
                <label className="label">Pré-visualização</label>
                <div
                  className="casos-teste-preview casos-teste-editor__preview card"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </div>
            </div>
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
