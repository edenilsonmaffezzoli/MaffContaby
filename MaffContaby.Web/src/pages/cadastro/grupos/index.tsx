import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { CrudRow } from '@/components/ui/crud-list';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { StatusMessage } from '@/components/ui/spinner';
import { useHttpClient } from '@/hooks/use-http-client';
import { createGroup, deleteGroup, getGroups, updateGroup, type GroupDto } from '@/services/groups-service';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderOpen, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';

export function GruposPage() {
  const httpClient = useHttpClient();
  const queryClient = useQueryClient();

  const groupsQuery = useQuery({ queryKey: ['groups'], queryFn: () => getGroups(httpClient) });

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
  const isMutating = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;
  const canInteract = !groupsQuery.isFetching && !isMutating;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Cadastro de Grupo" subtitle="Grupos usados nas movimentações" />

      <NovoGrupo
        disabled={!canInteract}
        isLoading={createMutation.isPending}
        onCreate={data => createMutation.mutate(data)}
      />

      <Card noPad>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-[15px] font-semibold text-gray-800 m-0">Grupos cadastrados</h2>
          {groups.length > 0 ? (
            <Badge variant="info">{groups.length} {groups.length === 1 ? 'grupo' : 'grupos'}</Badge>
          ) : null}
        </div>

        {groupsQuery.isLoading ? (
          <div className="px-6"><StatusMessage type="loading">Carregando…</StatusMessage></div>
        ) : groupsQuery.isError ? (
          <div className="px-6"><StatusMessage type="error">Falha ao carregar. Tente novamente.</StatusMessage></div>
        ) : groups.length === 0 ? (
          <EmptyState icon={<FolderOpen size={22} />} title="Nenhum grupo cadastrado" description="Adicione o primeiro grupo acima" />
        ) : (
          <div className="divide-y divide-gray-100">
            <div className="grid px-4 py-2.5 bg-gray-50 border-b border-gray-100" style={{ gridTemplateColumns: '1fr auto' }}>
              <span className="text-[11px] font-bold uppercase tracking-[0.6px] text-gray-500">Grupo</span>
              <span className="text-[11px] font-bold uppercase tracking-[0.6px] text-gray-500 text-right">Ações</span>
            </div>
            {groups.map(g => (
              <GrupoRow
                key={g.id}
                group={g}
                disabled={!canInteract}
                isSaving={updateMutation.isPending}
                onUpdate={data => updateMutation.mutate(data)}
                onDelete={() => deleteMutation.mutate(g.id)}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function NovoGrupo(props: {
  disabled: boolean;
  isLoading: boolean;
  onCreate: (data: { name: string }) => void;
}) {
  const [name, setName] = useState('');
  const maxLen = 50;
  const trimmed = name.trim();

  const validation = useMemo(() => {
    if (!trimmed) return null;
    if (trimmed.length > maxLen) return `Máximo de ${maxLen} caracteres`;
    return null;
  }, [trimmed]);

  const canSubmit = !props.disabled && trimmed.length > 0 && !validation;

  return (
    <Card>
      <CardHeader title="Adicionar Grupo" />
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <Input
            label="Nome do grupo"
            placeholder="Ex: Alimentação"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={maxLen}
            disabled={props.disabled}
            error={validation ?? undefined}
            hint={!validation ? `${trimmed.length}/${maxLen}` : undefined}
          />
        </div>
        <Button
          variant="primary"
          loading={props.isLoading}
          disabled={!canSubmit}
          onClick={() => {
            props.onCreate({ name: trimmed });
            setName('');
          }}
        >
          <Plus size={16} />
          Adicionar
        </Button>
      </div>
    </Card>
  );
}

function GrupoRow(props: {
  group: GroupDto;
  disabled: boolean;
  isSaving: boolean;
  onUpdate: (data: { id: string; name: string }) => void;
  onDelete: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(props.group.name);
  const maxLen = 50;
  const trimmed = name.trim();

  const validation = useMemo(() => {
    if (!trimmed) return 'Grupo é obrigatório';
    if (trimmed.length > maxLen) return `Máximo de ${maxLen} caracteres`;
    return null;
  }, [trimmed]);

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
        props.onUpdate({ id: props.group.id, name: trimmed });
        setIsEditing(false);
      }}
      onCancelEdit={() => {
        setName(props.group.name);
        setIsEditing(false);
      }}
      editContent={
        <Input
          label="Nome do grupo"
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={maxLen}
          disabled={props.disabled}
          error={validation ?? undefined}
          hint={!validation ? `${trimmed.length}/${maxLen}` : undefined}
        />
      }
    >
      <span className="font-semibold text-sm text-gray-800 truncate block">{props.group.name}</span>
    </CrudRow>
  );
}
