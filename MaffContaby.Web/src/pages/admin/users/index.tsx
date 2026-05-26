import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { CrudRow } from '@/components/ui/crud-list';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { StatusMessage } from '@/components/ui/spinner';
import { useHttpClient } from '@/hooks/use-http-client';
import { me } from '@/services/auth-service';
import { createGdpUser, deleteGdpUser, listGdpUsers, updateGdpUser, type GdpUserDto } from '@/services/gdp-users-service';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ShieldAlert, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';

export function UsersPage() {
  const httpClient = useHttpClient();
  const queryClient = useQueryClient();

  const meQuery = useQuery({ queryKey: ['auth', 'me'], queryFn: () => me(httpClient), retry: false });

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
      <div className="flex flex-col gap-5">
        <PageHeader title="Usuários" subtitle="Cadastro e permissões" />
        <Card>
          <div className="flex items-center gap-3 p-2">
            <ShieldAlert size={18} className="text-[#D32F2F] shrink-0" />
            <span className="text-sm font-medium text-[#B71C1C]">Apenas administradores podem acessar esta tela.</span>
          </div>
        </Card>
      </div>
    );
  }

  const users = usersQuery.data?.users ?? [];
  const isMutating = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;
  const canInteract = !usersQuery.isFetching && !isMutating;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Usuários" subtitle="Cadastro e permissões (admin)" />

      <NewUserCard
        disabled={!canInteract}
        isLoading={createMutation.isPending}
        onCreate={data => createMutation.mutate(data)}
      />

      <Card noPad>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-[15px] font-semibold text-gray-800 m-0">Usuários cadastrados</h2>
          {users.length > 0 ? (
            <Badge variant="info">{users.length} {users.length === 1 ? 'usuário' : 'usuários'}</Badge>
          ) : null}
        </div>

        {usersQuery.isLoading ? (
          <div className="px-6"><StatusMessage type="loading">Carregando…</StatusMessage></div>
        ) : usersQuery.isError ? (
          <div className="px-6"><StatusMessage type="error">Falha ao carregar usuários.</StatusMessage></div>
        ) : users.length === 0 ? (
          <EmptyState icon={<Users size={22} />} title="Nenhum usuário cadastrado" />
        ) : (
          <div className="divide-y divide-gray-100">
            <div className="grid px-4 py-2.5 bg-gray-50 border-b border-gray-100"
              style={{ gridTemplateColumns: '1fr 100px auto' }}>
              <span className="text-[11px] font-bold uppercase tracking-[0.6px] text-gray-500">Usuário</span>
              <span className="text-[11px] font-bold uppercase tracking-[0.6px] text-gray-500 text-center">Admin</span>
              <span className="text-[11px] font-bold uppercase tracking-[0.6px] text-gray-500 text-right">Ações</span>
            </div>
            {users.map(u => (
              <UserRow
                key={u.id}
                user={u}
                disabled={!canInteract}
                isSaving={updateMutation.isPending}
                onUpdate={data => updateMutation.mutate(data)}
                onDelete={() => deleteMutation.mutate(u.id)}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function NewUserCard(props: {
  disabled: boolean;
  isLoading: boolean;
  onCreate: (data: { username: string; password: string; admin: boolean }) => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [admin, setAdmin] = useState(false);

  const trimmed = username.trim();
  const validation = useMemo(() => {
    if (!trimmed) return null;
    if (trimmed.length > 60) return 'Máximo 60 caracteres';
    if (password && password.length < 6) return 'Senha mínima: 6 caracteres';
    return null;
  }, [trimmed, password]);

  const canSubmit = !props.disabled && trimmed.length > 0 && password.length > 0 && !validation;

  return (
    <Card>
      <CardHeader title="Adicionar Usuário" />
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px]">
          <Input
            label="Usuário"
            placeholder="nome de usuário"
            value={username}
            onChange={e => setUsername(e.target.value)}
            disabled={props.disabled}
            error={validation && trimmed ? validation : undefined}
          />
        </div>
        <div className="flex-1 min-w-[180px]">
          <Input
            label="Senha"
            type="password"
            placeholder="mínimo 6 caracteres"
            value={password}
            onChange={e => setPassword(e.target.value)}
            disabled={props.disabled}
          />
        </div>
        <div className="min-w-[130px]">
          <Select
            label="Nível"
            value={admin ? 'yes' : 'no'}
            onChange={e => setAdmin(e.target.value === 'yes')}
            disabled={props.disabled}
          >
            <option value="no">Usuário</option>
            <option value="yes">Administrador</option>
          </Select>
        </div>
        <Button
          variant="primary"
          loading={props.isLoading}
          disabled={!canSubmit}
          onClick={() => {
            props.onCreate({ username: trimmed, password, admin });
            setUsername('');
            setPassword('');
            setAdmin(false);
          }}
        >
          <Plus size={16} />
          Adicionar
        </Button>
      </div>
    </Card>
  );
}

function UserRow(props: {
  user: GdpUserDto;
  disabled: boolean;
  isSaving: boolean;
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
    if (trimmed.length > 60) return 'Máximo 60 caracteres';
    if (password && password.length < 6) return 'Senha mínima: 6 caracteres';
    return null;
  }, [trimmed, password]);

  const canSave = !props.disabled && !validation;

  return (
    <CrudRow
      disabled={props.disabled}
      onEdit={() => setIsEditing(true)}
      onDelete={props.onDelete}
      isEditing={isEditing}
      isSaving={props.isSaving}
      canSave={canSave}
      onSaveEdit={() => {
        props.onUpdate({
          id: props.user.id,
          username: trimmed !== props.user.username ? trimmed : undefined,
          admin: admin !== props.user.admin ? admin : undefined,
          password: password ? password : undefined,
        });
        setPassword('');
        setIsEditing(false);
      }}
      onCancelEdit={() => {
        setUsername(props.user.username);
        setAdmin(props.user.admin);
        setPassword('');
        setIsEditing(false);
      }}
      editContent={
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[160px]">
            <Input
              label="Usuário"
              value={username}
              onChange={e => setUsername(e.target.value)}
              disabled={props.disabled}
              error={validation ?? undefined}
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <Input
              label="Nova senha"
              type="password"
              placeholder="Deixe em branco para manter"
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={props.disabled}
            />
          </div>
          <div className="min-w-[130px]">
            <Select
              label="Nível"
              value={admin ? 'yes' : 'no'}
              onChange={e => setAdmin(e.target.value === 'yes')}
              disabled={props.disabled}
            >
              <option value="no">Usuário</option>
              <option value="yes">Administrador</option>
            </Select>
          </div>
        </div>
      }
    >
      <div className="grid items-center gap-3" style={{ gridTemplateColumns: '1fr 100px' }}>
        <span className="font-semibold text-sm text-gray-800 truncate">{props.user.username}</span>
        <div className="flex justify-center">
          <Badge variant={props.user.admin ? 'success' : 'neutral'}>
            {props.user.admin ? 'Admin' : 'Usuário'}
          </Badge>
        </div>
      </div>
    </CrudRow>
  );
}
