import { useHttpClient } from '@/hooks/use-http-client';
import {
  createEntry,
  deleteEntry,
  getEntries,
  updateEntry,
  type EntryDto,
} from '@/services/entries-service';
import { getGroups } from '@/services/groups-service';
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

type GroupedByPerson = {
  personId: string;
  personName: string;
  total: number;
  count: number;
  groups: Grouped[];
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
  const [selectedPersonId, setSelectedPersonId] = useState<string>('__all__');
  const [selectedGroup, setSelectedGroup] = useState<string>('');

  const groupsQuery = useQuery({
    queryKey: ['groups'],
    queryFn: () => getGroups(httpClient),
  });

  const peopleQuery = useQuery({
    queryKey: ['people'],
    queryFn: () => getPeople(httpClient),
  });

  const isAllPeople = selectedPersonId === '__all__';

  const entriesQuery = useQuery({
    queryKey: ['entries', selectedPersonId, competencia, selectedGroup],
    queryFn: () =>
      getEntries(httpClient, {
        personId: isAllPeople ? undefined : selectedPersonId,
        competencia,
        grupo: selectedGroup || undefined,
      }),
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

  const groupedByPerson = useMemo<GroupedByPerson[]>(() => {
    if (!isAllPeople) return [];

    const list = entriesQuery.data ?? [];
    const nameById = new Map((peopleQuery.data ?? []).map(p => [p.id, p.name] as const));
    const map = new Map<string, { personId: string; personName: string; groups: Map<string, Grouped> }>();

    for (const entry of list) {
      const pid = entry.personId;
      const personName = nameById.get(pid) ?? pid;
      const current = map.get(pid) ?? { personId: pid, personName, groups: new Map<string, Grouped>() };

      const gkey = entry.grupo;
      const g = current.groups.get(gkey) ?? { grupo: gkey, total: 0, count: 0, entries: [] };
      g.total += entry.valor;
      g.count += 1;
      g.entries.push(entry);
      current.groups.set(gkey, g);

      map.set(pid, current);
    }

    return [...map.values()]
      .map(p => {
        const groups = [...p.groups.values()].sort((a, b) => b.total - a.total);
        const total = groups.reduce((s, g) => s + g.total, 0);
        const count = groups.reduce((s, g) => s + g.count, 0);
        return { personId: p.personId, personName: p.personName, total, count, groups };
      })
      .sort((a, b) => b.total - a.total);
  }, [entriesQuery.data, isAllPeople, peopleQuery.data]);

  const total = useMemo(() => grouped.reduce((sum, g) => sum + g.total, 0), [grouped]);

  const createEntryMutation = useMutation({
    mutationFn: (input: { personId: string; competencia: string; grupo: string; valor: number; observacao?: string }) => {
      return createEntry(httpClient, {
        personId: input.personId,
        competencia: competenciaToDateOnly(input.competencia),
        grupo: input.grupo,
        valor: input.valor,
        observacao: input.observacao ?? null,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['entries'] });
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
      await queryClient.invalidateQueries({ queryKey: ['entries'] });
    },
  });

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="title">Movimentações</h1>
          <div className="subtitle">Lançamentos contábeis por grupo e competência</div>
        </div>
      </div>

      {selectedPersonId && grouped.length > 0 ? (
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-card__label">Total do mês</div>
            <div className="stat-card__value">{formatCurrencyBRL(total)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card__label">{isAllPeople ? 'Pessoas' : 'Grupos'}</div>
            <div className="stat-card__value">{isAllPeople ? groupedByPerson.length : grouped.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card__label">Lançamentos</div>
            <div className="stat-card__value">{grouped.reduce((s, g) => s + g.count, 0)}</div>
          </div>
        </div>
      ) : null}

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
              <option value="__all__">Todos</option>
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

          <div className="field">
            <label className="label">Grupo</label>
            <select
              className="input"
              value={selectedGroup}
              onChange={e => setSelectedGroup(e.target.value)}
              disabled={groupsQuery.isLoading}
            >
              <option value="">Todos</option>
              {(groupsQuery.data ?? []).map(g => (
                <option key={g.id} value={g.name}>
                  {g.name}
                </option>
              ))}
            </select>
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

      <NovaMovimentacao
        key={competencia}
        disabled={createEntryMutation.isPending}
        people={peopleQuery.data ?? []}
        isPeopleLoading={peopleQuery.isLoading}
        groups={groupsQuery.data ?? []}
        isGroupsLoading={groupsQuery.isLoading}
        defaultCompetencia={competencia}
        onCreate={data => createEntryMutation.mutate(data)}
      />

      <div className="card">
        <div className="section-header">
          <h2 className="section-title">Lançamentos</h2>
          {selectedPersonId && !entriesQuery.isFetching && grouped.length > 0 ? (
            <span className="badge badge--info">{grouped.reduce((s, g) => s + g.count, 0)} itens</span>
          ) : null}
        </div>

        {entriesQuery.isLoading ? (
          <div className="status-bar status-bar--loading">
            <div className="spinner" />
            Carregando lançamentos...
          </div>
        ) : entriesQuery.isError ? (
          <div className="status-bar status-bar--error">Falha ao carregar os dados. Tente novamente.</div>
        ) : grouped.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M4 20h16M7 20V12M12 20V8M17 20V4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="empty-state__text">Sem lançamentos para este período</div>
          </div>
        ) : isAllPeople ? (
          <div className="table-wrap">
            <div className="table__head table__head--mov-person">
              <div>Pessoa</div>
              <div className="right">Grupos</div>
              <div className="right">Total</div>
            </div>

            {groupedByPerson.map(p => (
              <details key={p.personId} className="table__row">
                <summary className="table__row__summary table__row__summary--mov-person">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <ChevronIcon />
                    <span className="ellipsis" style={{ fontWeight: 700, fontSize: 14 }}>{p.personName}</span>
                  </div>
                  <div className="right">
                    <span className="badge badge--neutral">{p.groups.length}</span>
                  </div>
                  <div className="right" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                    {formatCurrencyBRL(p.total)}
                  </div>
                </summary>

                <div className="table__details">
                  <div className="table__head table__head--mov">
                    <div>Grupo</div>
                    <div className="right">Itens</div>
                    <div className="right">Total</div>
                  </div>
                  {p.groups.map(g => (
                    <details key={`${p.personId}|${g.grupo}`} className="table__row">
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
              </details>
            ))}
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
  people: { id: string; name: string }[];
  isPeopleLoading: boolean;
  groups: { id: string; name: string }[];
  isGroupsLoading: boolean;
  defaultCompetencia: string;
  onCreate: (data: { personId: string; competencia: string; grupo: string; valor: number; observacao?: string }) => void;
}) {
  const [personId, setPersonId] = useState('');
  const [competencia, setCompetencia] = useState(props.defaultCompetencia);
  const [grupo, setGrupo] = useState('');
  const [valor, setValor] = useState('');
  const [observacao, setObservacao] = useState('');

  const canSubmit = !props.disabled && personId && competencia.trim() && grupo.trim() && Number(valor) > 0;

  return (
    <div className="card">
      <div className="section-header">
        <h2 className="section-title">Novo Lançamento</h2>
      </div>
      <div className="row row--wrap">
        <div className="field">
          <label className="label">Pessoa</label>
          <select
            className="input"
            value={personId}
            onChange={e => setPersonId(e.target.value)}
            disabled={props.disabled || props.isPeopleLoading || props.people.length === 0}
          >
            <option value="">
              {props.isPeopleLoading
                ? 'Carregando pessoas...'
                : props.people.length === 0
                  ? 'Cadastre pessoas primeiro'
                  : 'Selecione...'}
            </option>
            {props.people.map(p => (
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
            disabled={props.disabled}
          />
        </div>

        <div className="field field--grow">
          <label className="label">Grupo</label>
          <select
            className="input"
            value={grupo}
            onChange={e => setGrupo(e.target.value)}
            disabled={props.disabled || props.isGroupsLoading || props.groups.length === 0}
          >
            <option value="">
              {props.isGroupsLoading
                ? 'Carregando grupos...'
                : props.groups.length === 0
                  ? 'Cadastre grupos primeiro'
                  : 'Selecione...'}
            </option>
            {props.groups.map(g => (
              <option key={g.id} value={g.name}>
                {g.name}
              </option>
            ))}
          </select>
          {!props.isGroupsLoading && props.groups.length === 0 ? (
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>
              Vá em Cadastro → Cadastro de Grupo para adicionar.
            </div>
          ) : null}
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
                personId,
                competencia: competencia.trim(),
                grupo: grupo.trim(),
                valor: Number(valor),
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
  const httpClient = useHttpClient();

  const groupsQuery = useQuery({
    queryKey: ['groups'],
    queryFn: () => getGroups(httpClient),
  });

  const [isEditing, setIsEditing] = useState(false);
  const [grupo, setGrupo] = useState(props.entry.grupo);
  const [valor, setValor] = useState(String(props.entry.valor));
  const [data, setData] = useState(props.entry.data ?? '');
  const [observacao, setObservacao] = useState(props.entry.observacao ?? '');

  const groups = useMemo(() => {
    const names = (groupsQuery.data ?? []).map(g => g.name);
    const current = props.entry.grupo.trim();
    if (current && !names.includes(current)) return [current, ...names];
    return names;
  }, [groupsQuery.data, props.entry.grupo]);

  const competencia = props.entry.competencia;

  return (
    <div className="entry">
      {!isEditing ? (
        <>
          <div className="entry__main">
            <div className="entry__title">{formatCurrencyBRL(props.entry.valor)}</div>
            <div className="entry__meta">
              {props.entry.data && <span>{props.entry.data}</span>}
              {props.entry.observacao && <span className="ellipsis" style={{ maxWidth: 260 }}>{props.entry.observacao}</span>}
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
              <select
                className="input input--small"
                value={grupo}
                onChange={e => setGrupo(e.target.value)}
                disabled={props.disabled || groupsQuery.isLoading || groups.length === 0}
              >
                <option value="">
                  {groupsQuery.isLoading
                    ? 'Carregando grupos...'
                    : groups.length === 0
                      ? 'Cadastre grupos primeiro'
                      : 'Selecione...'}
                </option>
                {groups.map(name => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
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
              <input
                className="input input--small"
                value={observacao}
                onChange={e => setObservacao(e.target.value)}
                disabled={props.disabled}
              />
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
            <button className="button button--sm" type="button" onClick={() => setIsEditing(false)} disabled={props.disabled}>
              Cancelar
            </button>
          </div>
        </>
      )}
    </div>
  );
}
