import { useHttpClient } from '@/hooks/use-http-client';
import { me } from '@/services/auth-service';
import { createGdpUser, deleteGdpUser, listGdpUsers, updateGdpUser, type GdpUserDto } from '@/services/gdp-users-service';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';

export function UsersPage() {
  const httpClient = useHttpClient();
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => me(httpClient),
    retry: false,
  });

  const usersQuery = useQuery({
    queryKey: ['gdp', 'users'],
    queryFn: () => listGdpUsers(httpClient),
    enabled: Boolean(meQuery.data?.user.admin),
    retry: false,
  });

  const createMutation = useMutation({
    mutationFn: (input: { username: string; password: string; admin: boolean }) => createGdpUser(httpClient, input),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['gdp', 'users'] }),
  });

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; username?: string; password?: string; admin?: boolean }) =>
      updateGdpUser(httpClient, input.id, { username: input.username, password: input.password, admin: input.admin }),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['gdp', 'users'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteGdpUser(httpClient, id),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['gdp', 'users'] }),
  });

  if (meQuery.isLoading) return null;
  if (meQuery.isError) return <Navigate to="/login" replace />;
  if (!meQuery.data?.user.admin) {
    return (
      <div className="page">
        <div className="page__header">
          <div>
            <h1 className="title">Usuários</h1>
            <div className="subtitle">Acesso restrito</div>
          </div>
        </div>
        <div className="card">
          <div className="status-bar status-bar--error">Apenas administradores podem acessar esta tela.</div>
        </div>
      </div>
    );
  }

  const users = usersQuery.data?.users ?? [];
  const canInteract = !usersQuery.isFetching && !createMutation.isPending && !updateMutation.isPending && !deleteMutation.isPending;

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="title">Usuários</h1>
          <div className="subtitle">Cadastro e permissões (admin)</div>
        </div>
      </div>

      <NewUserCard
        disabled={!canInteract}
        onCreate={data => createMutation.mutate(data)}
      />

      <div className="card">
        <div className="section-header">
          <h2 className="section-title">Lista</h2>
          {users.length ? <span className="badge badge--info">{users.length} {users.length === 1 ? 'item' : 'itens'}</span> : null}
        </div>

        {usersQuery.isLoading ? (
          <div className="status-bar status-bar--loading">
            <div className="spinner" />
            Carregando...
          </div>
        ) : usersQuery.isError ? (
          <div className="status-bar status-bar--error">Falha ao carregar usuários.</div>
        ) : users.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__text">Nenhum usuário</div>
          </div>
        ) : (
          <div className="table-wrap">
            <div className="table__head table__head--cad" style={{ gridTemplateColumns: '1fr 120px 220px' }}>
              <div>Usuário</div>
              <div className="right">Admin</div>
              <div className="right">Ações</div>
            </div>
            {users.map(u => (
              <UserRow
                key={u.id}
                user={u}
                disabled={!canInteract}
                onUpdate={data => updateMutation.mutate(data)}
                onDelete={() => {
                  const ok = window.confirm(`Excluir "${u.username}"?`);
                  if (!ok) return;
                  deleteMutation.mutate(u.id);
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NewUserCard(props: {
  disabled: boolean;
  onCreate: (data: { username: string; password: string; admin: boolean }) => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [admin, setAdmin] = useState(false);

  const trimmed = username.trim();
  const validation = useMemo(() => {
    if (!trimmed) return 'Usuário é obrigatório';
    if (trimmed.length > 60) return 'Usuário deve ter no máximo 60 caracteres';
    if (!password) return 'Senha é obrigatória';
    if (password.length < 6) return 'Senha deve ter no mínimo 6 caracteres';
    return null;
  }, [trimmed, password]);

  const canSubmit = !props.disabled && !validation;

  return (
    <div className="card">
      <div className="section-header">
        <h2 className="section-title">Adicionar</h2>
      </div>
      <div className="row row--wrap">
        <div className="field field--grow">
          <label className="label">Usuário</label>
          <input className="input" value={username} onChange={e => setUsername(e.target.value)} disabled={props.disabled} />
        </div>
        <div className="field field--grow">
          <label className="label">Senha</label>
          <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} disabled={props.disabled} />
        </div>
        <div className="field">
          <label className="label">Admin</label>
          <select
            className="input"
            value={admin ? 'yes' : 'no'}
            onChange={e => setAdmin(e.target.value === 'yes')}
            disabled={props.disabled}
          >
            <option value="no">Não</option>
            <option value="yes">Sim</option>
          </select>
        </div>
        <div className="field">
          <label className="label">&nbsp;</label>
          <button
            className="button button--success"
            type="button"
            disabled={!canSubmit}
            onClick={() => {
              props.onCreate({ username: trimmed, password, admin });
              setUsername('');
              setPassword('');
              setAdmin(false);
            }}
          >
            Salvar
          </button>
        </div>
      </div>
      {validation ? <div style={{ marginTop: 10, fontSize: 13, color: 'var(--danger)' }}>{validation}</div> : null}
    </div>
  );
}

function UserRow(props: {
  user: GdpUserDto;
  disabled: boolean;
  onUpdate: (data: { id: string; username?: string; password?: string; admin?: boolean }) => void;
  onDelete: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [username, setUsername] = useState(props.user.username);
  const [password, setPassword] = useState('');
  const [admin, setAdmin] = useState(props.user.admin);

  const trimmed = username.trim();
  const validation = useMemo(() => {
    if (!trimmed) return 'Usuário é obrigatório';
    if (trimmed.length > 60) return 'Usuário deve ter no máximo 60 caracteres';
    if (password && password.length < 6) return 'Senha deve ter no mínimo 6 caracteres';
    return null;
  }, [trimmed, password]);

  const canSave = !props.disabled && !validation;

  return (
    <div className="table__row table__row--cad" style={{ gridTemplateColumns: '1fr 120px 220px', alignItems: 'center' }}>
      {!isEditing ? (
        <>
          <div style={{ fontWeight: 600 }} className="ellipsis">
            {props.user.username}
          </div>
          <div className="right">
            <span className={props.user.admin ? 'badge badge--success' : 'badge badge--neutral'}>{props.user.admin ? 'Sim' : 'Não'}</span>
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
            <input className="input input--small" value={username} onChange={e => setUsername(e.target.value)} disabled={props.disabled} />
            {validation ? <div style={{ marginTop: 6, fontSize: 12, color: 'var(--danger)' }}>{validation}</div> : null}
          </div>
          <div className="right">
            <select className="input input--small" value={admin ? 'yes' : 'no'} onChange={e => setAdmin(e.target.value === 'yes')} disabled={props.disabled}>
              <option value="no">Não</option>
              <option value="yes">Sim</option>
            </select>
            <div style={{ marginTop: 6 }}>
              <input
                className="input input--small"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Nova senha (opcional)"
                disabled={props.disabled}
              />
            </div>
          </div>
          <div className="right" style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button
              className="button button--success button--sm"
              type="button"
              disabled={!canSave}
              onClick={() => {
                props.onUpdate({
                  id: props.user.id,
                  username: trimmed !== props.user.username ? trimmed : undefined,
                  admin: admin !== props.user.admin ? admin : undefined,
                  password: password ? password : undefined,
                });
                setPassword('');
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
                setUsername(props.user.username);
                setAdmin(props.user.admin);
                setPassword('');
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

