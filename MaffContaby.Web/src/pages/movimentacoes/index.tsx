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
    mutationFn: (input: { grupo: string; valor: number; data?: string; observacao?: string }) => {
      return createEntry(httpClient, {
        personId: selectedPersonId,
        competencia: competenciaToDateOnly(competencia),
        grupo: input.grupo,
        valor: input.valor,
        data: input.data ?? null,
        observacao: input.observacao ?? null,
      });
    },
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
      <div className="page__header">
        <div>
          <h1 className="title">Movimentações</h1>
          <div className="subtitle">Total do mês: {formatCurrencyBRL(total)}</div>
        </div>
      </div>

      <div className="card">
        <div className="row row--wrap">
          <div className="field">
            <label className="label">Pessoa</label>
            <select
              className="input"
              value={selectedPersonId}
              onChange={e => setSelectedPersonId(e.target.value)}
              disabled={peopleQuery.isLoading}
            >
              <option value="" />
              {(peopleQuery.data ?? []).map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
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

          <div className="field field--grow">
            <label className="label">&nbsp;</label>
            <button
              className="button"
              type="button"
              onClick={() => entriesQuery.refetch()}
              disabled={!selectedPersonId}
            >
              Atualizar
            </button>
          </div>
        </div>
      </div>

      <NovaMovimentacao
        disabled={!canInteract || createEntryMutation.isPending}
        onCreate={data => createEntryMutation.mutate(data)}
      />

      <div className="card">
        {entriesQuery.isLoading ? (
          <div className="muted">Carregando...</div>
        ) : entriesQuery.isError ? (
          <div className="error">Falha ao carregar.</div>
        ) : grouped.length === 0 ? (
          <div className="muted">Sem lançamentos.</div>
        ) : (
          <div className="table">
            <div className="table__head">
              <div>Grupo</div>
              <div className="right">Itens</div>
              <div className="right">Total</div>
            </div>

            {grouped.map(g => (
              <details key={g.grupo} className="table__row">
                <summary className="table__row__summary">
                  <div className="ellipsis">{g.grupo}</div>
                  <div className="right">{g.count}</div>
                  <div className="right">{formatCurrencyBRL(g.total)}</div>
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
      <div className="row row--wrap">
        <div className="field field--grow">
          <label className="label">Grupo</label>
          <input className="input" value={grupo} onChange={e => setGrupo(e.target.value)} disabled={props.disabled} />
        </div>

        <div className="field">
          <label className="label">Valor</label>
          <input
            className="input"
            inputMode="decimal"
            value={valor}
            onChange={e => setValor(e.target.value)}
            disabled={props.disabled}
          />
        </div>

        <div className="field">
          <label className="label">Data</label>
          <input className="input" type="date" value={data} onChange={e => setData(e.target.value)} disabled={props.disabled} />
        </div>

        <div className="field field--grow">
          <label className="label">Observação</label>
          <input
            className="input"
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
              {props.entry.data ? <span>{props.entry.data}</span> : null}
              {props.entry.observacao ? <span className="ellipsis">{props.entry.observacao}</span> : null}
            </div>
          </div>
          <div className="entry__actions">
            <button className="button button--ghost" type="button" onClick={() => setIsEditing(true)} disabled={props.disabled}>
              Editar
            </button>
            <button className="button button--danger" type="button" onClick={props.onDelete} disabled={props.disabled}>
              Excluir
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="row row--wrap entry__edit">
            <div className="field field--grow">
              <label className="label">Grupo</label>
              <input className="input" value={grupo} onChange={e => setGrupo(e.target.value)} disabled={props.disabled} />
            </div>
            <div className="field">
              <label className="label">Valor</label>
              <input className="input" value={valor} onChange={e => setValor(e.target.value)} disabled={props.disabled} />
            </div>
            <div className="field">
              <label className="label">Data</label>
              <input className="input" type="date" value={data} onChange={e => setData(e.target.value)} disabled={props.disabled} />
            </div>
            <div className="field field--grow">
              <label className="label">Observação</label>
              <input
                className="input"
                value={observacao}
                onChange={e => setObservacao(e.target.value)}
                disabled={props.disabled}
              />
            </div>
          </div>
          <div className="entry__actions">
            <button
              className="button button--primary"
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
            <button className="button" type="button" onClick={() => setIsEditing(false)} disabled={props.disabled}>
              Cancelar
            </button>
          </div>
        </>
      )}
    </div>
  );
}

