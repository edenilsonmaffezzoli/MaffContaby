import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { CrudRow } from '@/components/ui/crud-list';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { StatusMessage } from '@/components/ui/spinner';
import { useHttpClient } from '@/hooks/use-http-client';
import { createPerson, deletePerson, getPeople, updatePerson, type PersonDto } from '@/services/people-service';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Users } from 'lucide-react';
import { useMemo, useState } from 'react';

export function PessoasPage() {
  const httpClient = useHttpClient();
  const queryClient = useQueryClient();

  const peopleQuery = useQuery({ queryKey: ['people'], queryFn: () => getPeople(httpClient) });

  const createMutation = useMutation({
    mutationFn: (input: { name: string }) => createPerson(httpClient, input),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['people'] }),
  });

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; name: string }) => updatePerson(httpClient, input.id, { name: input.name }),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['people'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePerson(httpClient, id),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['people'] }),
  });

  const people = peopleQuery.data ?? [];
  const isMutating = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;
  const canInteract = !peopleQuery.isFetching && !isMutating;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Cadastro de Pessoa" subtitle="Pessoas responsáveis pelas movimentações" />

      <NovaPessoa
        disabled={!canInteract}
        isLoading={createMutation.isPending}
        onCreate={data => createMutation.mutate(data)}
      />

      <Card noPad>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-[15px] font-semibold text-gray-800 m-0">Pessoas cadastradas</h2>
          {people.length > 0 ? (
            <Badge variant="info">{people.length} {people.length === 1 ? 'pessoa' : 'pessoas'}</Badge>
          ) : null}
        </div>

        {peopleQuery.isLoading ? (
          <div className="px-6"><StatusMessage type="loading">Carregando…</StatusMessage></div>
        ) : peopleQuery.isError ? (
          <div className="px-6"><StatusMessage type="error">Falha ao carregar. Tente novamente.</StatusMessage></div>
        ) : people.length === 0 ? (
          <EmptyState icon={<Users size={22} />} title="Nenhuma pessoa cadastrada" description="Adicione a primeira pessoa acima" />
        ) : (
          <div className="divide-y divide-gray-100">
            {/* Table head */}
            <div className="grid px-4 py-2.5 bg-gray-50 border-b border-gray-100" style={{ gridTemplateColumns: '1fr auto' }}>
              <span className="text-[11px] font-bold uppercase tracking-[0.6px] text-gray-500">Nome</span>
              <span className="text-[11px] font-bold uppercase tracking-[0.6px] text-gray-500 text-right">Ações</span>
            </div>
            {people.map(p => (
              <PessoaRow
                key={p.id}
                person={p}
                disabled={!canInteract}
                isSaving={updateMutation.isPending}
                onUpdate={data => updateMutation.mutate(data)}
                onDelete={() => deleteMutation.mutate(p.id)}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function NovaPessoa(props: {
  disabled: boolean;
  isLoading: boolean;
  onCreate: (data: { name: string }) => void;
}) {
  const [name, setName] = useState('');
  const maxLen = 150;
  const trimmed = name.trim();

  const validation = useMemo(() => {
    if (!trimmed) return null;
    if (trimmed.length > maxLen) return `Máximo de ${maxLen} caracteres`;
    return null;
  }, [trimmed]);

  const canSubmit = !props.disabled && trimmed.length > 0 && !validation;

  return (
    <Card>
      <CardHeader title="Adicionar Pessoa" />
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <Input
            label="Nome"
            placeholder="Ex: Edenilson"
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

function PessoaRow(props: {
  person: PersonDto;
  disabled: boolean;
  isSaving: boolean;
  onUpdate: (data: { id: string; name: string }) => void;
  onDelete: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(props.person.name);
  const maxLen = 150;
  const trimmed = name.trim();

  const validation = useMemo(() => {
    if (!trimmed) return 'Nome é obrigatório';
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
        props.onUpdate({ id: props.person.id, name: trimmed });
        setIsEditing(false);
      }}
      onCancelEdit={() => {
        setName(props.person.name);
        setIsEditing(false);
      }}
      editContent={
        <Input
          label="Nome"
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={maxLen}
          disabled={props.disabled}
          error={validation ?? undefined}
          hint={!validation ? `${trimmed.length}/${maxLen}` : undefined}
        />
      }
    >
      <span className="font-semibold text-sm text-gray-800 truncate block">{props.person.name}</span>
    </CrudRow>
  );
}
