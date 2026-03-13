import { useHttpClient } from '@/hooks/use-http-client';
import { createEntry, deleteEntry, getEntries, updateEntry, type EntryDto } from '@/services/entries-service';
import { getPeople } from '@/services/people-service';
import { competenciaToDateOnly, formatCompetencia, formatCurrencyBRL } from '@/utils/format';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

type Grouped = {
  grupo: string;
  total: number;
  count: number;
  entries: EntryDto[];
};

function RefreshIcon(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none">
      <path d="M4 12a8 8 0 0 1 14.93-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M20 12a8 8 0 0 1-14.93 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M19 4v4h-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M5 20v-4h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function PlusIcon(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none">
      <path d="M12 4v16M4 12h16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  );
}

function ChevronIcon(props: { className?: string }) {
  return (
    <svg className={`chevron ${props.className ?? ''}`} viewBox="0 0 24 24" fill="none" width="16" height="16">
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function MovimentacoesPage() {
  const httpClient = useHttpClient();
  const queryClient = useQueryClient();

  const [competencia, setCompetencia] = useState(() => formatCompetencia(new Date()));
  const [selectedPersonId, setSelectedPersonId] = useState<string>('');

  const peopleQuery = useQuery({
    queryKey: ['people'],
    queryFn: () => getPeople(httpClient),
  });

  const entriesQuery = useQuery({
    queryKey: ['entries', selectedPersonId, competencia],
    queryFn: () => getEntries(httpClient, { personId: selectedPersonId, competencia }),
    enabled: Boolean(selectedPersonId),
  });

  const grouped = useMemo<Grouped[]>(() => {
    const list = entriesQuery.data ?? [];
    const map = new Map<string, Grouped>();
    for (const entry of list) {
      const key = entry.grupo;
      const current = map.get(key) ?? { grupo: key, total: 0, count: 0, entries: [] };
      current.total += entry.valor;
      current.count += 1;
      current.entries.push(entry);
      map.set(key, current);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [entriesQuery.data]);

  const total = useMemo(() => grouped.reduce((sum, g) => sum + g.total, 0), [grouped]);

  const createEntryMutation = useMutation({
    mutationFn: (input: { grupo: string; valor: number; data?: string; observacao?: string }) =>
      createEntry(httpClient, {
        personId: selectedPersonId,
        competencia: competenciaToDateOnly(competencia),
        grupo: input.grupo,
        valor: input.valor,
        data: input.data ?? null,
        observacao: input.observacao ?? null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['entries', selectedPersonId, competencia] });
    },
  });

  const deleteEntryMutation = useMutation({
    mutationFn: (id: string) => deleteEntry(httpClient, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['entries', selectedPersonId, competencia] });
    },
  });

  const updateEntryMutation = useMutation({
    mutationFn: (input: { id: string; competencia: string; grupo: string; valor: number; data?: string; observacao?: string }) =>
      updateEntry(httpClient, input.id, {
        competencia: input.competencia,
        grupo: input.grupo,
        valor: input.valor,
        data: input.data ?? null,
        observacao: input.observacao ?? null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['entries', selectedPersonId, competencia] });
    },
  });

  const canInteract = Boolean(selectedPersonId) && !entriesQuery.isFetching;

  return (
    <div className="page">
      {/* Header */}
      <div className="page__header">
        <div>
          <h1 className="title">Movimentações</h1>
          <div className="subtitle">Lançamentos contábeis por grupo e competência</div>
        </div>
      </div>

      {/* Summary stats */}
      {selectedPersonId && grouped.length > 0 && (
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-card__label">Total do mês</div>
            <div className="stat-card__value">{formatCurrencyBRL(total)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card__label">Grupos</div>
            <div className="stat-card__value">{grouped.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card__label">Lançamentos</div>
            <div className="stat-card__value">{grouped.reduce((s, g) => s + g.count, 0)}</div>
          </div>
        </div>
      )}

      {/* Filters card */}
      <div className="card">
        <div className="section-header">
          <h2 className="section-title">Filtros</h2>
        </div>
        <div className="row row--wrap">
          <div className="field">
            <label className="label">Pessoa</label>
            <select
              className="input"
              value={selectedPersonId}
              onChange={e => setSelectedPersonId(e.target.value)}
              disabled={peopleQuery.isLoading}
            >
              <option value="">Selecione...</option>
              {(peopleQuery.data ?? []).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="label">Competência</label>
            <input
              className="input"
              type="month"
              value={competencia}
              onChange={e => setCompetencia(e.target.value)}
              disabled={!selectedPersonId}
            />
          </div>

          <div className="field">
            <label className="label">&nbsp;</label>
            <button
              className="button"
              type="button"
              onClick={() => entriesQuery.refetch()}
              disabled={!selectedPersonId}
            >
              <RefreshIcon className="icon-16" />
              Atualizar
            </button>
          </div>
        </div>
      </div>

      {/* New entry form */}
      <NovaMovimentacao
        disabled={!canInteract || createEntryMutation.isPending}
        onCreate={data => createEntryMutation.mutate(data)}
      />

      {/* Entries table */}
      <div className="card">
        <div className="section-header">
          <h2 className="section-title">Lançamentos</h2>
          {selectedPersonId && !entriesQuery.isFetching && grouped.length > 0 && (
            <span className="badge badge--info">{grouped.reduce((s, g) => s + g.count, 0)} itens</span>
          )}
        </div>

        {entriesQuery.isLoading ? (
          <div className="status-bar status-bar--loading">
            <div className="spinner" />
            Carregando lançamentos...
          </div>
        ) : entriesQuery.isError ? (
          <div className="status-bar status-bar--error">
            Falha ao carregar os dados. Tente novamente.
          </div>
        ) : !selectedPersonId ? (
          <div className="empty-state">
            <div className="empty-state__icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="empty-state__text">Selecione uma pessoa para ver os lançamentos</div>
          </div>
        ) : grouped.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M4 20h16M7 20V12M12 20V8M17 20V4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="empty-state__text">Sem lançamentos para este período</div>
          </div>
        ) : (
          <div className="table-wrap">
            <div className="table__head table__head--mov">
              <div>Grupo</div>
              <div className="right">Itens</div>
              <div className="right">Total</div>
            </div>

            {grouped.map(g => (
              <details key={g.grupo} className="table__row">
                <summary className="table__row__summary table__row__summary--mov">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <ChevronIcon />
                    <span className="ellipsis" style={{ fontWeight: 600, fontSize: 14 }}>{g.grupo}</span>
                  </div>
                  <div className="right">
                    <span className="badge badge--neutral">{g.count}</span>
                  </div>
                  <div className="right" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                    {formatCurrencyBRL(g.total)}
                  </div>
                </summary>

                <div className="table__details">
                  {g.entries.map(entry => (
                    <EntryRow
                      key={entry.id}
                      entry={entry}
                      onDelete={() => deleteEntryMutation.mutate(entry.id)}
                      onUpdate={data => updateEntryMutation.mutate(data)}
                      disabled={deleteEntryMutation.isPending || updateEntryMutation.isPending}
                    />
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NovaMovimentacao(props: {
  disabled: boolean;
  onCreate: (data: { grupo: string; valor: number; data?: string; observacao?: string }) => void;
}) {
  const [grupo, setGrupo] = useState('');
  const [valor, setValor] = useState('');
  const [data, setData] = useState('');
  const [observacao, setObservacao] = useState('');

  const canSubmit = !props.disabled && grupo.trim() && Number(valor) > 0;

  return (
    <div className="card">
      <div className="section-header">
        <h2 className="section-title">Novo Lançamento</h2>
      </div>
      <div className="row row--wrap">
        <div className="field field--grow">
          <label className="label">Grupo</label>
          <input
            className="input"
            placeholder="Ex: Alimentação"
            value={grupo}
            onChange={e => setGrupo(e.target.value)}
            disabled={props.disabled}
          />
        </div>

        <div className="field">
          <label className="label">Valor (R$)</label>
          <input
            className="input"
            inputMode="decimal"
            placeholder="0,00"
            value={valor}
            onChange={e => setValor(e.target.value)}
            disabled={props.disabled}
          />
        </div>

        <div className="field">
          <label className="label">Data</label>
          <input
            className="input"
            type="date"
            value={data}
            onChange={e => setData(e.target.value)}
            disabled={props.disabled}
          />
        </div>

        <div className="field field--grow">
          <label className="label">Observação</label>
          <input
            className="input"
            placeholder="Opcional"
            value={observacao}
            onChange={e => setObservacao(e.target.value)}
            disabled={props.disabled}
          />
        </div>

        <div className="field">
          <label className="label">&nbsp;</label>
          <button
            className="button button--primary"
            type="button"
            disabled={!canSubmit}
            onClick={() => {
              props.onCreate({
                grupo: grupo.trim(),
                valor: Number(valor),
                data: data || undefined,
                observacao: observacao.trim() ? observacao.trim() : undefined,
              });
              setValor('');
              setObservacao('');
            }}
          >
            <PlusIcon className="icon-16" />
            Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}

function EntryRow(props: {
  entry: EntryDto;
  disabled: boolean;
  onDelete: () => void;
  onUpdate: (data: { id: string; competencia: string; grupo: string; valor: number; data?: string; observacao?: string }) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [grupo, setGrupo] = useState(props.entry.grupo);
  const [valor, setValor] = useState(String(props.entry.valor));
  const [data, setData] = useState(props.entry.data ?? '');
  const [observacao, setObservacao] = useState(props.entry.observacao ?? '');

  const competencia = props.entry.competencia;

  return (
    <div className="entry">
      {!isEditing ? (
        <>
          <div className="entry__main">
            <div className="entry__title">{formatCurrencyBRL(props.entry.valor)}</div>
            <div className="entry__meta">
              {props.entry.data && <span>{props.entry.data}</span>}
              {props.entry.observacao && (
                <span className="ellipsis" style={{ maxWidth: 260 }}>{props.entry.observacao}</span>
              )}
            </div>
          </div>
          <div className="entry__actions">
            <button
              className="button button--ghost button--sm"
              type="button"
              onClick={() => setIsEditing(true)}
              disabled={props.disabled}
            >
              Editar
            </button>
            <button
              className="button button--danger button--sm"
              type="button"
              onClick={props.onDelete}
              disabled={props.disabled}
            >
              Excluir
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="row row--wrap entry__edit">
            <div className="field field--grow">
              <label className="label">Grupo</label>
              <input className="input input--small" value={grupo} onChange={e => setGrupo(e.target.value)} disabled={props.disabled} />
            </div>
            <div className="field">
              <label className="label">Valor</label>
              <input className="input input--small" value={valor} onChange={e => setValor(e.target.value)} disabled={props.disabled} />
            </div>
            <div className="field">
              <label className="label">Data</label>
              <input className="input input--small" type="date" value={data} onChange={e => setData(e.target.value)} disabled={props.disabled} />
            </div>
            <div className="field field--grow">
              <label className="label">Observação</label>
              <input className="input input--small" value={observacao} onChange={e => setObservacao(e.target.value)} disabled={props.disabled} />
            </div>
          </div>
          <div className="entry__actions">
            <button
              className="button button--primary button--sm"
              type="button"
              onClick={() => {
                props.onUpdate({
                  id: props.entry.id,
                  competencia,
                  grupo: grupo.trim(),
                  valor: Number(valor),
                  data: data || undefined,
                  observacao: observacao.trim() ? observacao.trim() : undefined,
                });
                setIsEditing(false);
              }}
              disabled={props.disabled || !grupo.trim() || Number(valor) <= 0}
            >
              Salvar
            </button>
            <button
              className="button button--sm"
              type="button"
              onClick={() => setIsEditing(false)}
              disabled={props.disabled}
            >
              Cancelar
            </button>
          </div>
        </>
      )}
    </div>
  );
}
