import { useHttpClient } from '@/hooks/use-http-client';
import { createCompetencia, deleteCompetencia, getCompetencias, type CompetenciaDto } from '@/services/competencias-service';
import { competenciaToDateOnly, formatCompetencia } from '@/utils/format';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

function PlusIcon(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none">
      <path d="M12 4v16M4 12h16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  );
}

function toMonth(value: string) {
  if (!value) return '';
  return value.slice(0, 7);
}

export function CompetenciasPage() {
  const httpClient = useHttpClient();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['competencias'],
    queryFn: () => getCompetencias(httpClient),
  });

  const createMutation = useMutation({
    mutationFn: (input: { value: string }) => createCompetencia(httpClient, input),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['competencias'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCompetencia(httpClient, id),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['competencias'] }),
  });

  const items = useMemo(() => {
    return (query.data ?? []).slice().sort((a, b) => b.value.localeCompare(a.value));
  }, [query.data]);

  const canInteract = !query.isFetching && !createMutation.isPending && !deleteMutation.isPending;

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="title">Cadastro de Competência</h1>
          <div className="subtitle">Competências usadas nos filtros e lançamentos</div>
        </div>
      </div>

      <NovaCompetencia disabled={!canInteract} onCreate={data => createMutation.mutate(data)} />

      <div className="card">
        <div className="section-header">
          <h2 className="section-title">Competências</h2>
          {items.length > 0 ? <span className="badge badge--info">{items.length} {items.length === 1 ? 'item' : 'itens'}</span> : null}
        </div>

        {query.isLoading ? (
          <div className="status-bar status-bar--loading">
            <div className="spinner" />
            Carregando...
          </div>
        ) : query.isError ? (
          <div className="status-bar status-bar--error">Falha ao carregar. Tente novamente.</div>
        ) : items.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__text">Nenhuma competência cadastrada</div>
          </div>
        ) : (
          <div className="table-wrap">
            <div className="table__head table__head--cad">
              <div>Competência</div>
              <div className="right">Ações</div>
            </div>
            {items.map(c => (
              <CompetenciaRow
                key={c.id}
                item={c}
                disabled={!canInteract}
                onDelete={() => {
                  const ok = window.confirm(`Excluir competência ${toMonth(c.value)}?`);
                  if (!ok) return;
                  deleteMutation.mutate(c.id);
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NovaCompetencia(props: { disabled: boolean; onCreate: (data: { value: string }) => void }) {
  const [competencia, setCompetencia] = useState(() => formatCompetencia(new Date()));

  const validation = useMemo(() => {
    if (!competencia.trim()) return 'Competência é obrigatória';
    if (!/^\d{4}-\d{2}$/.test(competencia.trim())) return 'Competência inválida';
    return null;
  }, [competencia]);

  const canSubmit = !props.disabled && !validation;

  return (
    <div className="card">
      <div className="section-header">
        <h2 className="section-title">Adicionar</h2>
      </div>
      <div className="row row--wrap">
        <div className="field">
          <label className="label">Competência</label>
          <input
            className="input"
            type="month"
            value={competencia}
            onChange={e => setCompetencia(e.target.value)}
            disabled={props.disabled}
          />
          {validation ? (
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--danger)' }}>{validation}</div>
          ) : null}
        </div>

        <div className="field">
          <label className="label">&nbsp;</label>
          <button
            className="button button--success"
            type="button"
            disabled={!canSubmit}
            onClick={() => props.onCreate({ value: competenciaToDateOnly(competencia.trim()) })}
          >
            <PlusIcon className="icon-16" />
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

function CompetenciaRow(props: { item: CompetenciaDto; disabled: boolean; onDelete: () => void }) {
  return (
    <div className="table__row table__row--cad">
      <div style={{ fontWeight: 600 }} className="ellipsis">
        {toMonth(props.item.value)}
      </div>
      <div className="right" style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button className="button button--danger button--sm" type="button" disabled={props.disabled} onClick={props.onDelete}>
          Excluir
        </button>
      </div>
    </div>
  );
}

