import { getApiBaseUrl } from '@/config/api-base-url';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { StatusMessage } from '@/components/ui/spinner';
import { useHttpClient } from '@/hooks/use-http-client';
import { gerarCasoTeste } from '@/services/casos-teste-service';
import type { GerarCasoTesteResponse, ImageInput, QaseCase } from '@/types/casos-teste';
import { openCasosTestePdf } from '@/utils/casos-teste-pdf';
import {
  downloadQaseCsv,
  formatQaseCsvExportSummary,
  type QaseCsvExportStats,
} from '@/utils/qase-csv-export';
import {
  downloadRobotFrameworkPlan,
  formatRobotPlanExportSummary,
  type RobotPlanStats,
} from '@/utils/robot-framework-plan-export';
import { fileToBase64 } from '@/utils/read-source-folder';
import { useMutation } from '@tanstack/react-query';
import {
  Bot,
  ChevronDown,
  Download,
  FileText,
  Image,
  Link,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
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
      ? `Descartados: ${meta.casesDropped} (de ${meta.casesFromGemini})`
      : meta.casesFromGemini != null
        ? `Casos da IA: ${meta.casesFromGemini}`
        : null,
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
  const [robotPlanSummary, setRobotPlanSummary] = useState<RobotPlanStats | null>(null);

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
        ? { loginUrl: targetLoginUrl.trim(), username: targetUsername.trim(), password: targetPassword, mode: targetAuthMode }
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
    setRobotPlanSummary(null);
    setShowTargetAuth(false);
    setTargetLoginUrl('');
    setTargetUsername('');
    setTargetPassword('');
    setTargetAuthMode('auto');
    gerarMutation.reset();
  }

  function handleExportCsv() {
    if (!cases.length) return alert('Não há casos estruturados para exportar. Gere novamente com a IA.');
    try {
      const stats = downloadQaseCsv(cases);
      setExportSummary(stats);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao gerar CSV.');
    }
  }

  function handleExportPdf() {
    if (!markdown.trim()) return alert('Não há conteúdo para gerar PDF.');
    openCasosTestePdf(markdown, 'Casos de Teste Inteligentes');
  }

  function handleExportRobotPlan() {
    if (!cases.length) return alert('Não há casos estruturados para gerar o plano. Gere novamente com a IA.');
    try {
      const hasTargetAuthComplete =
        Boolean(targetLoginUrl.trim()) && Boolean(targetUsername.trim()) && Boolean(targetPassword);
      const stats = downloadRobotFrameworkPlan({
        markdown,
        cases,
        systemPath: systemPath.trim() || undefined,
        targetAuth: hasTargetAuthComplete
          ? {
              loginUrl: targetLoginUrl.trim(),
              username: targetUsername.trim(),
              mode: targetAuthMode,
            }
          : undefined,
      });
      setRobotPlanSummary(stats);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao gerar plano Robot Framework.');
    }
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
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Casos de Teste Inteligentes"
        subtitle="Gere casos com IA (Gemini) e exporte CSV para o Qase.io"
      />

      {/* Input card */}
      <Card>
        <CardHeader title="Configuração" description="Informe a URL do sistema e, opcionalmente, imagens de tela" />

        <div className="flex flex-col gap-4">
          <div>
            <Input
              label={hasTargetAuthComplete ? 'URL do sistema (página após login)' : 'URL do sistema'}
              type="url"
              placeholder="https://seu-sistema.com.br/dashboard"
              value={systemPath}
              onChange={e => setSystemPath(e.target.value)}
            />
          </div>

          {/* Auth toggle */}
          <div>
            <button
              type="button"
              aria-expanded={showTargetAuth}
              onClick={() => setShowTargetAuth(open => !open)}
              className={[
                'flex items-center justify-between w-full px-4 py-3 rounded-lg border transition-colors',
                showTargetAuth || hasTargetAuthComplete
                  ? 'border-primary/30 bg-primary-light text-primary'
                  : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100',
              ].join(' ')}
            >
              <div className="flex items-center gap-2">
                <Link size={16} />
                <span className="text-sm font-medium">
                  Sistema com login
                  {hasTargetAuthComplete ? (
                    <span className="ml-2 text-[11px] font-semibold bg-[rgba(0,102,102,0.15)] text-[#006666] px-1.5 py-0.5 rounded-full">
                      configurado
                    </span>
                  ) : null}
                </span>
              </div>
              <ChevronDown size={16} className={['transition-transform duration-150', showTargetAuth ? 'rotate-180' : ''].join(' ')} />
            </button>

            {showTargetAuth && (
              <div className="mt-2 p-4 rounded-lg border border-gray-200 bg-gray-50">
                <p className="text-xs text-gray-500 mb-3">
                  Opcional. Use credenciais de homologação — a senha não é salva nem vai para o CSV.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    label="URL de login"
                    type="url"
                    placeholder="https://seu-sistema.com.br/login"
                    value={targetLoginUrl}
                    onChange={e => setTargetLoginUrl(e.target.value)}
                  />
                  <Select
                    label="Modo"
                    value={targetAuthMode}
                    onChange={e => setTargetAuthMode(e.target.value as 'auto' | 'form' | 'json')}
                  >
                    <option value="auto">Auto-detectar</option>
                    <option value="form">Formulário HTML</option>
                    <option value="json">API JSON</option>
                  </Select>
                  <Input
                    label="Usuário"
                    placeholder="Usuário de teste"
                    value={targetUsername}
                    onChange={e => setTargetUsername(e.target.value)}
                    autoComplete="off"
                  />
                  <Input
                    label="Senha"
                    type="password"
                    placeholder="Senha de teste"
                    value={targetPassword}
                    onChange={e => setTargetPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                {hasTargetAuthAny && !hasTargetAuthComplete ? (
                  <p className="text-xs text-amber-600 mt-2">
                    Preencha URL de login, usuário e senha para ativar a autenticação.
                  </p>
                ) : null}
              </div>
            )}
          </div>

          {/* Images */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-gray-500">
                Imagens <span className="font-normal text-gray-400">(opcional, máx. 8)</span>
              </label>
              {imagePreviews.length > 0 && (
                <span className="text-[11px] text-gray-400">{imagePreviews.length}/8</span>
              )}
            </div>

            {imagePreviews.length < 8 && (
              <label className="flex items-center gap-2 cursor-pointer w-fit px-3 py-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100 transition-colors text-sm text-gray-600">
                <Image size={15} />
                Adicionar imagens
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  onChange={e => { handleImagesChange(e.target.files); e.target.value = ''; }}
                />
              </label>
            )}

            {imagePreviews.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {imagePreviews.map(p => (
                  <div key={p.id} className="relative group">
                    <img
                      src={p.url}
                      alt={p.file.name}
                      className="w-16 h-16 object-cover rounded-lg border border-gray-200"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(p.id)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-800 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Remover imagem"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button
              variant="primary"
              size="lg"
              loading={gerarMutation.isPending}
              disabled={!canGenerate || gerarMutation.isPending}
              onClick={() => gerarMutation.mutate()}
            >
              <Sparkles size={18} />
              {gerarMutation.isPending ? 'Gerando com IA…' : 'Gerar Casos de Teste'}
            </Button>
            <p className="text-[11px] text-gray-400">API: {apiBase}</p>
          </div>

          {gerarMutation.isError ? (
            <StatusMessage type="error">
              {formatHttpError(gerarMutation.error)}
            </StatusMessage>
          ) : null}
        </div>
      </Card>

      {/* Results */}
      {(markdown.trim() || cases.length > 0) && (
        <Card>
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <h2 className="text-[15px] font-semibold text-gray-800 m-0 flex-1">Resultado</h2>
            {metaInfo ? (
              <span className="text-[11px] text-gray-400 max-w-[400px] truncate">{metaInfo}</span>
            ) : null}
            {cases.length > 0 && (
              <span className="text-[11px] text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full font-medium">
                {cases.length} caso{cases.length !== 1 ? 's' : ''}
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={handleExportCsv} disabled={!cases.length}>
              <Download size={14} />
              CSV Qase
            </Button>
            <Button variant="ghost" size="sm" onClick={handleExportRobotPlan} disabled={!cases.length}>
              <Bot size={14} />
              Gerar MD automatizado
            </Button>
            <Button variant="ghost" size="sm" onClick={handleExportPdf} disabled={!markdown.trim()}>
              <FileText size={14} />
              PDF
            </Button>
            <Button variant="default" size="sm" onClick={handleClearAll}>
              <Trash2 size={14} />
              Limpar
            </Button>
          </div>

          {exportSummary ? (
            <pre className="text-[12px] bg-gray-50 border border-gray-200 rounded-lg p-3 whitespace-pre-wrap mb-4 text-gray-700">
              {formatQaseCsvExportSummary(exportSummary)}
            </pre>
          ) : null}

          {robotPlanSummary ? (
            <pre className="text-[12px] bg-[#E8F5F5] border border-[rgba(0,102,102,0.2)] rounded-lg p-3 whitespace-pre-wrap mb-4 text-gray-700">
              {formatRobotPlanExportSummary(robotPlanSummary)}
            </pre>
          ) : null}

          {markdown.trim() ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-500">Markdown (editável)</label>
                <textarea
                  className="flex-1 min-h-[360px] w-full font-mono text-[13px] p-3.5 rounded-lg border border-gray-200 bg-gray-50 outline-none focus:border-primary focus:bg-white focus:shadow-[0_0_0_3px_rgba(0,102,102,0.10)] transition-all resize-vertical"
                  value={markdown}
                  onChange={e => setMarkdown(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-500">Pré-visualização</label>
                <div
                  className="flex-1 min-h-[360px] overflow-auto p-4 rounded-lg border border-gray-200 bg-white ct-preview"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </div>
            </div>
          ) : null}
        </Card>
      )}
    </div>
  );
}
