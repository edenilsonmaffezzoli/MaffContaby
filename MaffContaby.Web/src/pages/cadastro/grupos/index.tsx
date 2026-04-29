import { useHttpClient } from '@/hooks/use-http-client';
import { createGroup, deleteGroup, getGroups, updateGroup, type GroupDto } from '@/services/groups-service';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

function PlusIcon(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none">
      <path d="M12 4v16M4 12h16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  );
}

export function GruposPage() {
  const httpClient = useHttpClient();
  const queryClient = useQueryClient();

  const groupsQuery = useQuery({
    queryKey: ['groups'],
    queryFn: () => getGroups(httpClient),
  });

  const createMutation = useMutation({
    mutationFn: (input: { name: string }) => createGroup(httpClient, input),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['groups'] }),
  });

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; name: string }) => updateGroup(httpClient, input.id, { name: input.name }),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['groups'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteGroup(httpClient, id),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['groups'] }),
  });

  const groups = groupsQuery.data ?? [];
  const canInteract = !groupsQuery.isFetching && !createMutation.isPending && !updateMutation.isPending && !deleteMutation.isPending;

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="title">Cadastro de Grupo</h1>
          <div className="subtitle">Grupos usados nas movimentações</div>
        </div>
      </div>

      <NovoGrupo disabled={!canInteract} onCreate={data => createMutation.mutate(data)} />

      <div className="card">
        <div className="section-header">
          <h2 className="section-title">Grupos</h2>
          {groups.length > 0 ? <span className="badge badge--info">{groups.length} {groups.length === 1 ? 'item' : 'itens'}</span> : null}
        </div>

        {groupsQuery.isLoading ? (
          <div className="status-bar status-bar--loading">
            <div className="spinner" />
            Carregando...
          </div>
        ) : groupsQuery.isError ? (
          <div className="status-bar status-bar--error">Falha ao carregar. Tente novamente.</div>
        ) : groups.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__text">Nenhum grupo cadastrado</div>
          </div>
        ) : (
          <div className="table-wrap">
            <div className="table__head table__head--cad">
              <div>Grupo</div>
              <div className="right">Ações</div>
            </div>
            {groups.map(g => (
              <GrupoRow
                key={g.id}
                group={g}
                disabled={!canInteract}
                onUpdate={data => updateMutation.mutate(data)}
                onDelete={() => {
                  const ok = window.confirm(`Excluir "${g.name}"?`);
                  if (!ok) return;
                  deleteMutation.mutate(g.id);
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NovoGrupo(props: { disabled: boolean; onCreate: (data: { name: string }) => void }) {
  const [name, setName] = useState('');
  const maxLen = 50;

  const trimmed = name.trim();
  const validation = useMemo(() => {
    if (!trimmed) return 'Grupo é obrigatório';
    if (trimmed.length > maxLen) return `Grupo deve ter no máximo ${maxLen} caracteres`;
    return null;
  }, [trimmed]);

  const canSubmit = !props.disabled && !validation;

  return (
    <div className="card">
      <div className="section-header">
        <h2 className="section-title">Adicionar</h2>
      </div>
      <div className="row row--wrap">
        <div className="field field--grow">
          <label className="label">Grupo</label>
          <input
            className="input"
            placeholder="Ex: Alimentação"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={maxLen}
            disabled={props.disabled}
          />
          <div style={{ marginTop: 6, fontSize: 12, color: validation ? 'var(--danger)' : 'var(--muted)' }}>
            {validation ? validation : `${trimmed.length}/${maxLen}`}
          </div>
        </div>

        <div className="field">
          <label className="label">&nbsp;</label>
          <button
            className="button button--success"
            type="button"
            disabled={!canSubmit}
            onClick={() => {
              props.onCreate({ name: trimmed });
              setName('');
            }}
          >
            <PlusIcon className="icon-16" />
            Salvar
          </button>
        </div>
        <div className="field">
          <label className="label">&nbsp;</label>
          <button className="button button--danger" type="button" disabled={props.disabled} onClick={() => setName('')}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

function GrupoRow(props: {
  group: GroupDto;
  disabled: boolean;
  onUpdate: (data: { id: string; name: string }) => void;
  onDelete: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(props.group.name);
  const maxLen = 50;

  const trimmed = name.trim();
  const validation = useMemo(() => {
    if (!trimmed) return 'Grupo é obrigatório';
    if (trimmed.length > maxLen) return `Grupo deve ter no máximo ${maxLen} caracteres`;
    return null;
  }, [trimmed]);

  const canSave = !props.disabled && !validation;

  return (
    <div className="table__row table__row--cad">
      {!isEditing ? (
        <>
          <div style={{ fontWeight: 600 }} className="ellipsis">
            {props.group.name}
          </div>
          <div className="right" style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button className="button button--ghost button--sm" type="button" onClick={() => setIsEditing(true)} disabled={props.disabled}>
              Editar
            </button>
            <button className="button button--danger button--sm" type="button" onClick={props.onDelete} disabled={props.disabled}>
              Excluir
            </button>
          </div>
        </>
      ) : (
        <>
          <div>
            <input
              className="input input--small"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={maxLen}
              disabled={props.disabled}
            />
            <div style={{ marginTop: 6, fontSize: 12, color: validation ? 'var(--danger)' : 'var(--muted)' }}>
              {validation ? validation : `${trimmed.length}/${maxLen}`}
            </div>
          </div>
          <div className="right" style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button
              className="button button--success button--sm"
              type="button"
              disabled={!canSave}
              onClick={() => {
                props.onUpdate({ id: props.group.id, name: trimmed });
                setIsEditing(false);
              }}
            >
              Salvar
            </button>
            <button
              className="button button--danger button--sm"
              type="button"
              disabled={props.disabled}
              onClick={() => {
                setName(props.group.name);
                setIsEditing(false);
              }}
            >
              Cancelar
            </button>
          </div>
        </>
      )}
    </div>
  );
}

