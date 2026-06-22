import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { CompetenciaMultiSelect } from '@/components/ui/competencia-multi-select';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { StatCard, StatCardSkeleton } from '@/components/ui/stat-card';
import { StatusMessage } from '@/components/ui/spinner';
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
import { competenciaToDateOnly, formatCompetencia, formatCompetenciaLabel, formatCurrencyBRL, parseDecimalBRL } from '@/utils/format';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart2,
  ChevronDown,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
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

const ENTRY_ROW_GRID = '1fr 110px 72px';

type EntryUpdateInput = {
  id: string;
  competencia: string;
  grupo: string;
  valor: number;
  data?: string;
  observacao?: string;
  conferido?: boolean;
};

export function MovimentacoesPage() {
  const httpClient = useHttpClient();
  const queryClient = useQueryClient();
  const currentMonthCompetencia = useMemo(() => formatCompetencia(new Date()), []);

  const [competencia, setCompetencia] = useState(() => currentMonthCompetencia);
  const [selectedPersonId, setSelectedPersonId] = useState<string>('__all__');
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [sessionCreatedEntryIds, setSessionCreatedEntryIds] = useState<string[]>([]);

  const groupsQuery = useQuery({ queryKey: ['groups'], queryFn: () => getGroups(httpClient) });
  const peopleQuery = useQuery({ queryKey: ['people'], queryFn: () => getPeople(httpClient) });
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
  const totalLancamentos = grouped.reduce((s, g) => s + g.count, 0);
  const canClearFilters =
    selectedPersonId !== '__all__' || competencia !== currentMonthCompetencia || selectedGroup !== '';

  const handleClearFilters = () => {
    setSelectedPersonId('__all__');
    setCompetencia(currentMonthCompetencia);
    setSelectedGroup('');
  };

  const handleConcluirNovoLancamento = () => {
    setShowNewForm(false);
    void queryClient.invalidateQueries({ queryKey: ['entries'] });
  };

  const createEntryMutation = useMutation({
    mutationFn: async (input: {
      personId: string;
      competencias: string[];
      grupo: string;
      valor: number;
      observacao?: string;
    }) => {
      const createdEntries = [];
      for (const itemCompetencia of input.competencias) {
        const createdEntry = await createEntry(httpClient, {
          personId: input.personId,
          competencia: competenciaToDateOnly(itemCompetencia),
          grupo: input.grupo,
          valor: input.valor,
          observacao: input.observacao ?? null,
        });
        createdEntries.push(createdEntry);
      }
      return createdEntries;
    },
    onSuccess: async createdEntries => {
      await queryClient.invalidateQueries({ queryKey: ['entries'] });
      const createdIds = createdEntries.map(entry => entry.id);
      setSessionCreatedEntryIds(prev => [...createdIds, ...prev.filter(id => !createdIds.includes(id))]);
    },
  });

  const deleteEntryMutation = useMutation({
    mutationFn: (id: string) => deleteEntry(httpClient, id),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['entries', selectedPersonId, competencia] }),
  });

  const updateEntryMutation = useMutation({
    mutationFn: (input: EntryUpdateInput) =>
      updateEntry(httpClient, input.id, {
        competencia: input.competencia,
        grupo: input.grupo,
        valor: input.valor,
        data: input.data ?? null,
        observacao: input.observacao ?? null,
        conferido: input.conferido ?? false,
      }),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['entries'] }),
  });

  const toggleConferidoMutation = useMutation({
    mutationFn: (input: { entry: EntryDto; conferido: boolean }) =>
      updateEntry(httpClient, input.entry.id, {
        competencia: input.entry.competencia,
        grupo: input.entry.grupo,
        valor: input.entry.valor,
        data: input.entry.data,
        observacao: input.entry.observacao,
        conferido: input.conferido,
      }),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['entries'] }),
  });

  const isRowActionPending =
    deleteEntryMutation.isPending || updateEntryMutation.isPending || toggleConferidoMutation.isPending;

  const isLoading = entriesQuery.isLoading;
  const hasData = grouped.length > 0;
  const sessionEntries = useMemo(() => {
    const ids = new Set(sessionCreatedEntryIds);
    return (entriesQuery.data ?? []).filter(entry => ids.has(entry.id));
  }, [entriesQuery.data, sessionCreatedEntryIds]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Movimentações"
        subtitle="Lançamentos contábeis por grupo e competência"
        action={
          <Button
            variant="primary"
            onClick={() => {
              setSessionCreatedEntryIds([]);
              setShowNewForm(true);
            }}
          >
            <Plus size={16} />
            Novo Lançamento
          </Button>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {isLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard
              label="Total do mês"
              value={formatCurrencyBRL(total)}
              valueColor={total > 0 ? 'success' : 'default'}
              icon={<BarChart2 size={16} />}
            />
            <StatCard
              label={isAllPeople ? 'Pessoas' : 'Grupos'}
              value={isAllPeople ? groupedByPerson.length : grouped.length}
            />
            <StatCard label="Lançamentos" value={totalLancamentos} />
          </>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardHeader title="Filtros" />
        <div className="flex flex-wrap gap-3 items-end">
          <div className="min-w-[160px] flex-1">
            <Select
              label="Pessoa"
              value={selectedPersonId}
              onChange={e => setSelectedPersonId(e.target.value)}
              disabled={peopleQuery.isLoading}
            >
              <option value="__all__">Todos</option>
              {(peopleQuery.data ?? []).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>
          <div className="min-w-[160px]">
            <Input
              label="Competência"
              type="month"
              value={competencia}
              onChange={e => setCompetencia(e.target.value)}
              disabled={!selectedPersonId}
            />
          </div>
          <div className="min-w-[160px] flex-1">
            <Select
              label="Grupo"
              value={selectedGroup}
              onChange={e => setSelectedGroup(e.target.value)}
              disabled={groupsQuery.isLoading}
            >
              <option value="">Todos</option>
              {(groupsQuery.data ?? []).map(g => (
                <option key={g.id} value={g.name}>{g.name}</option>
              ))}
            </Select>
          </div>
          <Button
            variant="default"
            onClick={() => entriesQuery.refetch()}
            disabled={!selectedPersonId || entriesQuery.isFetching}
            loading={entriesQuery.isFetching}
          >
            <RefreshCw size={15} />
            Atualizar
          </Button>
          <Button
            variant="default"
            onClick={handleClearFilters}
            disabled={!canClearFilters}
          >
            Limpar
          </Button>
        </div>
      </Card>

      {/* New entry modal */}
      {showNewForm && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] p-4 md:p-8 overflow-y-auto">
          <div className="max-w-6xl mx-auto">
            <Card>
              <CardHeader
                title="Novo Lançamento"
                action={
                  <button
                    type="button"
                    onClick={() => setShowNewForm(false)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                  >
                    <X size={16} />
                  </button>
                }
              />
              <NovaMovimentacao
                disabled={createEntryMutation.isPending}
                people={peopleQuery.data ?? []}
                isPeopleLoading={peopleQuery.isLoading}
                groups={groupsQuery.data ?? []}
                isGroupsLoading={groupsQuery.isLoading}
                defaultCompetencia={competencia}
                onCreate={data => createEntryMutation.mutate(data)}
              />
              <div className="mt-5 border-t border-gray-100 pt-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h3 className="m-0 text-sm font-semibold text-gray-800">Itens adicionados nesta abertura</h3>
                  <Badge variant="info">{sessionEntries.length} {sessionEntries.length === 1 ? 'item' : 'itens'}</Badge>
                </div>
                {sessionEntries.length === 0 ? (
                  <p className="text-sm text-gray-500 m-0">Os novos lançamentos aparecerão aqui para edição e exclusão.</p>
                ) : (
                  <div className="flex flex-col gap-2 max-h-[45vh] overflow-y-auto pr-1">
                    <EntryListHeader />
                    {sessionEntries.map(entry => (
                      <EntryRow
                        key={entry.id}
                        entry={entry}
                        onDelete={() => deleteEntryMutation.mutate(entry.id)}
                        onUpdate={data => updateEntryMutation.mutate(data)}
                        onToggleConferido={conferido => toggleConferidoMutation.mutate({ entry, conferido })}
                        disabled={isRowActionPending}
                      />
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-5 flex justify-end border-t border-gray-100 pt-4">
                <Button variant="primary" onClick={handleConcluirNovoLancamento}>
                  Concluir
                </Button>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Entries list */}
      <Card noPad>
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-gray-100">
          <h2 className="text-[15px] font-semibold text-gray-800 m-0">Lançamentos</h2>
          {!isLoading && hasData ? (
            <Badge variant="info">{totalLancamentos} {totalLancamentos === 1 ? 'item' : 'itens'}</Badge>
          ) : null}
        </div>

        {isLoading ? (
          <div className="px-6">
            <StatusMessage type="loading">Carregando lançamentos…</StatusMessage>
          </div>
        ) : entriesQuery.isError ? (
          <div className="px-6">
            <StatusMessage type="error">Falha ao carregar os dados. Tente novamente.</StatusMessage>
          </div>
        ) : !hasData ? (
          <EmptyState
            icon={<BarChart2 size={22} />}
            title="Sem lançamentos para este período"
            description="Ajuste os filtros ou adicione um novo lançamento"
          />
        ) : isAllPeople ? (
          <div className="divide-y divide-gray-100">
            {groupedByPerson.map(p => (
              <PersonAccordion
                key={p.personId}
                person={p}
                onDelete={id => deleteEntryMutation.mutate(id)}
                onUpdate={data => updateEntryMutation.mutate(data)}
                onToggleConferido={(entry, conferido) => toggleConferidoMutation.mutate({ entry, conferido })}
                disabled={isRowActionPending}
              />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {grouped.map(g => (
              <GroupAccordion
                key={g.grupo}
                group={g}
                onDelete={id => deleteEntryMutation.mutate(id)}
                onUpdate={data => updateEntryMutation.mutate(data)}
                onToggleConferido={(entry, conferido) => toggleConferidoMutation.mutate({ entry, conferido })}
                disabled={isRowActionPending}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ───────── NovaMovimentacao ───────── */

function NovaMovimentacao(props: {
  disabled: boolean;
  people: { id: string; name: string }[];
  isPeopleLoading: boolean;
  groups: { id: string; name: string }[];
  isGroupsLoading: boolean;
  defaultCompetencia: string;
  onCreate: (data: { personId: string; competencias: string[]; grupo: string; valor: number; observacao?: string }) => void;
}) {
  const [personId, setPersonId] = useState('');
  const [competencias, setCompetencias] = useState<string[]>(() =>
    props.defaultCompetencia.trim() ? [props.defaultCompetencia.trim()] : [],
  );
  const [grupo, setGrupo] = useState('');
  const [valor, setValor] = useState('');
  const [observacao, setObservacao] = useState('');
  const parsedValor = parseDecimalBRL(valor);

  const canSubmit =
    !props.disabled &&
    personId &&
    competencias.length > 0 &&
    grupo.trim() &&
    parsedValor !== null &&
    parsedValor > 0;

  return (
    <div className="flex flex-wrap gap-3 items-end">
      <div className="min-w-[160px]">
        <Select
          label="Pessoa"
          value={personId}
          onChange={e => setPersonId(e.target.value)}
          disabled={props.disabled || props.isPeopleLoading || props.people.length === 0}
        >
          <option value="">
            {props.isPeopleLoading
              ? 'Carregando…'
              : props.people.length === 0
                ? 'Cadastre pessoas primeiro'
                : 'Selecione…'}
          </option>
          {props.people.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
      </div>

      <CompetenciaMultiSelect
        value={competencias}
        onChange={setCompetencias}
        disabled={props.disabled}
        hint="Clique para abrir a seleção por ano"
      />

      <div className="flex-1 min-w-[180px]">
        <Select
          label="Grupo"
          value={grupo}
          onChange={e => setGrupo(e.target.value)}
          disabled={props.disabled || props.isGroupsLoading || props.groups.length === 0}
          hint={!props.isGroupsLoading && props.groups.length === 0 ? 'Cadastre grupos primeiro' : undefined}
        >
          <option value="">
            {props.isGroupsLoading
              ? 'Carregando…'
              : props.groups.length === 0
                ? 'Cadastre grupos primeiro'
                : 'Selecione…'}
          </option>
          {props.groups.map(g => (
            <option key={g.id} value={g.name}>{g.name}</option>
          ))}
        </Select>
      </div>

      <div className="min-w-[120px]">
        <Input
          label="Valor (R$)"
          inputMode="decimal"
          placeholder="0,00"
          value={valor}
          onChange={e => setValor(e.target.value)}
          disabled={props.disabled}
        />
      </div>

      <div className="flex-1 min-w-[180px]">
        <Input
          label="Observação"
          placeholder="Opcional"
          value={observacao}
          onChange={e => setObservacao(e.target.value)}
          disabled={props.disabled}
        />
      </div>

      <Button
        variant="primary"
        loading={props.disabled}
        disabled={!canSubmit}
        onClick={() => {
          props.onCreate({
            personId,
            competencias,
            grupo: grupo.trim(),
            valor: parsedValor ?? 0,
            observacao: observacao.trim() ? observacao.trim() : undefined,
          });
          setValor('');
          setObservacao('');
        }}
      >
        <Plus size={16} />
        Adicionar{competencias.length > 1 ? ` (${competencias.length})` : ''}
      </Button>
    </div>
  );
}

/* ───────── EntryListHeader ───────── */

function EntryListHeader() {
  return (
    <div
      className="grid gap-3 px-4 pb-1 text-[11px] font-bold uppercase tracking-[0.6px] text-gray-400"
      style={{ gridTemplateColumns: ENTRY_ROW_GRID }}
    >
      <div>Lançamento</div>
      <div className="text-center">Conferido</div>
      <div className="text-right">Ações</div>
    </div>
  );
}

/* ───────── PersonAccordion ───────── */

function PersonAccordion(props: {
  person: GroupedByPerson;
  disabled: boolean;
  onDelete: (id: string) => void;
  onUpdate: (data: EntryUpdateInput) => void;
  onToggleConferido: (entry: EntryDto, conferido: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const { person } = props;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-6 py-4 hover:bg-gray-50 transition-colors text-left"
      >
        <ChevronDown
          size={16}
          className={['text-gray-400 shrink-0 transition-transform duration-200', open ? 'rotate-180' : ''].join(' ')}
        />
        <span className="flex-1 font-semibold text-sm text-gray-800 truncate">{person.personName}</span>
        <Badge variant="neutral">{person.groups.length} grupos</Badge>
        <span className="font-bold text-sm text-gray-800 font-display ml-2 shrink-0">
          {formatCurrencyBRL(person.total)}
        </span>
      </button>

      {open && (
        <div className="bg-gray-50 border-t border-gray-100">
          {/* Sub-header */}
          <div className="grid gap-3 px-10 py-2.5 text-[11px] font-bold uppercase tracking-[0.6px] text-gray-400"
            style={{ gridTemplateColumns: '1fr 70px 150px' }}>
            <div>Grupo</div>
            <div className="text-right">Itens</div>
            <div className="text-right">Total</div>
          </div>
          <div className="divide-y divide-gray-100">
            {person.groups.map(g => (
              <GroupAccordion
                key={`${person.personId}|${g.grupo}`}
                group={g}
                nested
                onDelete={props.onDelete}
                onUpdate={props.onUpdate}
                onToggleConferido={props.onToggleConferido}
                disabled={props.disabled}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────── GroupAccordion ───────── */

function GroupAccordion(props: {
  group: Grouped;
  nested?: boolean;
  disabled: boolean;
  onDelete: (id: string) => void;
  onUpdate: (data: EntryUpdateInput) => void;
  onToggleConferido: (entry: EntryDto, conferido: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const { group } = props;
  const indentClass = props.nested ? 'pl-10' : 'pl-6';

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={['w-full flex items-center gap-3 pr-6 py-3.5 hover:bg-gray-50 transition-colors text-left', indentClass].join(' ')}
      >
        <ChevronDown
          size={16}
          className={['text-gray-400 shrink-0 transition-transform duration-200', open ? 'rotate-180' : ''].join(' ')}
        />
        <span className="flex-1 font-semibold text-sm text-gray-700 truncate">{group.grupo}</span>
        <Badge variant="neutral">{group.count}</Badge>
        <span className="font-bold text-sm text-gray-800 font-display ml-2 shrink-0 w-[140px] text-right">
          {formatCurrencyBRL(group.total)}
        </span>
      </button>

      {open && (
        <div className={['bg-white border-t border-gray-100 flex flex-col gap-2 py-3', props.nested ? 'pl-14 pr-6' : 'pl-10 pr-6'].join(' ')}>
          <EntryListHeader />
          {group.entries.map(entry => (
            <EntryRow
              key={entry.id}
              entry={entry}
              onDelete={() => props.onDelete(entry.id)}
              onUpdate={data => props.onUpdate(data)}
              onToggleConferido={conferido => props.onToggleConferido(entry, conferido)}
              disabled={props.disabled}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────── EntryRow ───────── */

function EntryRow(props: {
  entry: EntryDto;
  disabled: boolean;
  onDelete: () => void;
  onUpdate: (data: EntryUpdateInput) => void;
  onToggleConferido: (conferido: boolean) => void;
}) {
  const httpClient = useHttpClient();
  const groupsQuery = useQuery({ queryKey: ['groups'], queryFn: () => getGroups(httpClient) });

  const [isEditing, setIsEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
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
  const parsedValor = parseDecimalBRL(valor);

  if (isEditing) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[150px]">
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Grupo</label>
            <select
              className="h-9 pl-3 pr-8 rounded border border-gray-200 bg-white text-sm w-full outline-none focus:border-[#006666] focus:shadow-[0_0_0_3px_rgba(0,102,102,0.10)] appearance-none"
              value={grupo}
              onChange={e => setGrupo(e.target.value)}
              disabled={props.disabled || groupsQuery.isLoading || groups.length === 0}
            >
              {groups.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[110px]">
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Valor</label>
            <input
              className="h-9 px-3 rounded border border-gray-200 bg-white text-sm w-full outline-none focus:border-[#006666] focus:shadow-[0_0_0_3px_rgba(0,102,102,0.10)]"
              value={valor}
              onChange={e => setValor(e.target.value)}
              disabled={props.disabled}
            />
          </div>
          <div className="min-w-[140px]">
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Data</label>
            <input
              type="date"
              className="h-9 px-3 rounded border border-gray-200 bg-white text-sm w-full outline-none focus:border-[#006666] focus:shadow-[0_0_0_3px_rgba(0,102,102,0.10)]"
              value={data}
              onChange={e => setData(e.target.value)}
              disabled={props.disabled}
            />
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Observação</label>
            <input
              className="h-9 px-3 rounded border border-gray-200 bg-white text-sm w-full outline-none focus:border-[#006666] focus:shadow-[0_0_0_3px_rgba(0,102,102,0.10)]"
              value={observacao}
              onChange={e => setObservacao(e.target.value)}
              disabled={props.disabled}
            />
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <Button
            variant="primary"
            size="sm"
            loading={props.disabled}
            disabled={!grupo.trim() || parsedValor === null || parsedValor <= 0}
            onClick={() => {
              props.onUpdate({
                id: props.entry.id,
                competencia,
                grupo: grupo.trim(),
                valor: parsedValor ?? 0,
                data: data || undefined,
                observacao: observacao.trim() ? observacao.trim() : undefined,
                conferido: props.entry.conferido,
              });
              setIsEditing(false);
            }}
          >
            Salvar
          </Button>
          <Button variant="default" size="sm" onClick={() => setIsEditing(false)} disabled={props.disabled}>
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative bg-white border border-gray-200 rounded-lg px-4 py-3 grid items-center gap-3 group hover:border-gray-300 transition-colors"
      style={{ gridTemplateColumns: ENTRY_ROW_GRID }}
    >
      <div className="min-w-0">
        <div className="font-display font-semibold text-[14px] text-gray-800">
          {formatCurrencyBRL(props.entry.valor)}
        </div>
        {(props.entry.competencia || props.entry.data || props.entry.observacao) ? (
          <div className="flex gap-2.5 mt-1 text-[12px] text-gray-500 flex-wrap">
            {props.entry.competencia ? (
              <span>{formatCompetenciaLabel(props.entry.competencia.slice(0, 7))}</span>
            ) : null}
            {props.entry.data && <span>{props.entry.data}</span>}
            {props.entry.observacao && (
              <span className="truncate max-w-[260px]">{props.entry.observacao}</span>
            )}
          </div>
        ) : null}
      </div>

      <div className="flex justify-center">
        <input
          type="checkbox"
          checked={Boolean(props.entry.conferido)}
          onChange={event => props.onToggleConferido(event.target.checked)}
          disabled={props.disabled}
          aria-label={`Marcar lançamento de ${formatCurrencyBRL(props.entry.valor)} como conferido`}
          className="h-4 w-4 rounded border-gray-300 accent-[#006666] focus:ring-[rgba(0,102,102,0.25)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        />
      </div>

      <div className="flex items-center justify-end gap-1.5 shrink-0">
        {confirmDelete ? (
          <div className="flex items-center gap-1.5 bg-[#FFEBEE] border border-[rgba(211,47,47,0.2)] rounded-lg px-3 py-1.5">
            <span className="text-xs font-semibold text-[#B71C1C]">Excluir?</span>
            <button
              type="button"
              onClick={() => { props.onDelete(); setConfirmDelete(false); }}
              className="text-[11px] font-bold text-[#D32F2F] hover:text-[#B71C1C] transition-colors px-1"
            >
              Sim
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="text-[11px] font-bold text-gray-500 hover:text-gray-700 transition-colors px-1"
            >
              Não
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              disabled={props.disabled}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Editar"
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={props.disabled}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-[#FFEBEE] hover:text-[#D32F2F] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Excluir"
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
