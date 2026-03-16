import { useHttpClient } from '@/hooks/use-http-client';
import { downloadRelatorioDetalhado, downloadRelatorioExecutivo } from '@/services/entries-service';
import { getPeople } from '@/services/people-service';
import { formatCompetencia } from '@/utils/format';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

function FileTextIcon(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14 2H7a3 3 0 0 0-3 3v14a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V8l-6-6Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M14 2v6h6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M8 13h8M8 17h8M8 9h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function addMonths(date: Date, months: number) {
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

export function RelatoriosPage() {
  const httpClient = useHttpClient();

  const [personId, setPersonId] = useState<string>('');
  const [competenciaFrom, setCompetenciaFrom] = useState(() => formatCompetencia(addMonths(new Date(), -5)));
  const [competenciaTo, setCompetenciaTo] = useState(() => formatCompetencia(new Date()));

  const peopleQuery = useQuery({
    queryKey: ['people'],
    queryFn: () => getPeople(httpClient),
  });

  const isPeriodValid = useMemo(() => {
    if (!competenciaFrom || !competenciaTo) return true;
    return competenciaFrom <= competenciaTo;
  }, [competenciaFrom, competenciaTo]);

  const reportMutation = useMutation({
    mutationFn: async (kind: 'executivo' | 'detalhado') => {
      if (!isPeriodValid) {
        throw new Error('Período inválido.');
      }

      const params = {
        personId: personId || undefined,
        competenciaFrom: competenciaFrom || undefined,
        competenciaTo: competenciaTo || undefined,
        competencia: competenciaTo || undefined,
      };

      const blob =
        kind === 'executivo'
          ? await downloadRelatorioExecutivo(httpClient, params)
          : await downloadRelatorioDetalhado(httpClient, params);

      const date = new Date().toISOString().slice(0, 10);
      const fileName = `Relatorio-${kind}-${date}.pdf`;
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

  const people = peopleQuery.data ?? [];

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="title">Relatórios</h1>
          <div className="subtitle">Geração de PDFs com filtros</div>
        </div>
      </div>

      <div className="card">
        <div className="section-header">
          <h2 className="section-title">Filtros</h2>
        </div>
        <div className="row row--wrap">
          <div className="field field--grow">
            <label className="label">Pessoa</label>
            <select
              className="input"
              value={personId}
              onChange={e => setPersonId(e.target.value)}
              disabled={peopleQuery.isLoading}
            >
              <option value="">Todas</option>
              {people.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="label">Competência inicial</label>
            <input
              className="input"
              type="month"
              value={competenciaFrom}
              onChange={e => setCompetenciaFrom(e.target.value)}
            />
          </div>

          <div className="field">
            <label className="label">Competência final</label>
            <input
              className="input"
              type="month"
              value={competenciaTo}
              onChange={e => setCompetenciaTo(e.target.value)}
            />
          </div>
        </div>

        {!isPeriodValid ? <div className="status-bar status-bar--error">Competência inicial deve ser ≤ final.</div> : null}
      </div>

      <div className="card">
        <div className="section-header">
          <h2 className="section-title">Gerar</h2>
        </div>
        <div className="row row--wrap">
          <button
            className="button"
            type="button"
            onClick={() => reportMutation.mutate('executivo')}
            disabled={reportMutation.isPending || !isPeriodValid}
          >
            <FileTextIcon className="icon-16" />
            {reportMutation.isPending ? 'Gerando...' : 'Executivo (PDF)'}
          </button>
          <button
            className="button"
            type="button"
            onClick={() => reportMutation.mutate('detalhado')}
            disabled={reportMutation.isPending || !isPeriodValid}
          >
            <FileTextIcon className="icon-16" />
            {reportMutation.isPending ? 'Gerando...' : 'Detalhado (PDF)'}
          </button>
        </div>
        {reportMutation.isError ? (
          <div className="status-bar status-bar--error">Falha ao gerar o relatório. Tente novamente.</div>
        ) : null}
      </div>
    </div>
  );
}
