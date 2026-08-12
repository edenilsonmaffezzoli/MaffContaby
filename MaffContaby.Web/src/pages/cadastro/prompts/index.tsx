import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { CrudRow } from '@/components/ui/crud-list';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Textarea } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { StatusMessage } from '@/components/ui/spinner';
import { useHttpClient } from '@/hooks/use-http-client';
import {
  createPrompt,
  deletePrompt,
  getPrompts,
  updatePrompt,
  type PromptDto,
} from '@/services/prompts-service';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';

const DESCRIPTION_MAX = 150;
const TEXT_MAX = 50_000;

export function PromptsPage() {
  const httpClient = useHttpClient();
  const queryClient = useQueryClient();

  const promptsQuery = useQuery({ queryKey: ['prompts'], queryFn: () => getPrompts(httpClient) });

  const createMutation = useMutation({
    mutationFn: (input: { description: string; text: string }) => createPrompt(httpClient, input),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['prompts'] }),
  });

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; description: string; text: string }) =>
      updatePrompt(httpClient, input.id, { description: input.description, text: input.text }),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['prompts'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePrompt(httpClient, id),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['prompts'] }),
  });

  const prompts = useMemo(
    () =>
      [...(promptsQuery.data ?? [])].sort((a, b) =>
        a.description.localeCompare(b.description, 'pt-BR', { sensitivity: 'base' }),
      ),
    [promptsQuery.data],
  );
  const isMutating = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;
  const canInteract = !promptsQuery.isFetching && !isMutating;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Cadastro de Prompt"
        subtitle="Prompts usados na geração de casos de teste com IA"
      />

      <NovoPrompt
        disabled={!canInteract}
        isLoading={createMutation.isPending}
        onCreate={data => createMutation.mutate(data)}
      />

      <Card noPad>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-[15px] font-semibold text-gray-800 m-0">Prompts cadastrados</h2>
          {prompts.length > 0 ? (
            <Badge variant="info">{prompts.length} {prompts.length === 1 ? 'prompt' : 'prompts'}</Badge>
          ) : null}
        </div>

        {promptsQuery.isLoading ? (
          <div className="px-6"><StatusMessage type="loading">Carregando…</StatusMessage></div>
        ) : promptsQuery.isError ? (
          <div className="px-6"><StatusMessage type="error">Falha ao carregar. Tente novamente.</StatusMessage></div>
        ) : prompts.length === 0 ? (
          <EmptyState icon={<FileText size={22} />} title="Nenhum prompt cadastrado" description="Adicione o primeiro prompt acima" />
        ) : (
          <div className="divide-y divide-gray-100">
            <div className="grid px-4 py-2.5 bg-gray-50 border-b border-gray-100" style={{ gridTemplateColumns: '1fr auto' }}>
              <span className="text-[11px] font-bold uppercase tracking-[0.6px] text-gray-500">Descrição</span>
              <span className="text-[11px] font-bold uppercase tracking-[0.6px] text-gray-500 text-right">Ações</span>
            </div>
            {prompts.map(p => (
              <PromptRow
                key={p.id}
                prompt={p}
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

function NovoPrompt(props: {
  disabled: boolean;
  isLoading: boolean;
  onCreate: (data: { description: string; text: string }) => void;
}) {
  const [description, setDescription] = useState('');
  const [text, setText] = useState('');
  const trimmedDescription = description.trim();
  const trimmedText = text.trim();

  const descriptionError = useMemo(() => {
    if (!trimmedDescription) return null;
    if (trimmedDescription.length > DESCRIPTION_MAX) return `Máximo de ${DESCRIPTION_MAX} caracteres`;
    return null;
  }, [trimmedDescription]);

  const textError = useMemo(() => {
    if (!trimmedText) return null;
    if (trimmedText.length > TEXT_MAX) return `Máximo de ${TEXT_MAX} caracteres`;
    return null;
  }, [trimmedText]);

  const canSubmit =
    !props.disabled &&
    trimmedDescription.length > 0 &&
    trimmedText.length > 0 &&
    !descriptionError &&
    !textError;

  return (
    <Card>
      <CardHeader title="Adicionar Prompt" />
      <div className="flex flex-col gap-3">
        <Input
          label="Descrição"
          placeholder="Ex: Prompt para e-commerce"
          value={description}
          onChange={e => setDescription(e.target.value)}
          maxLength={DESCRIPTION_MAX}
          disabled={props.disabled}
          error={descriptionError ?? undefined}
          hint={!descriptionError ? `${trimmedDescription.length}/${DESCRIPTION_MAX}` : undefined}
        />
        <Textarea
          label="Prompt"
          placeholder="Texto enviado à IA na geração dos casos de teste"
          value={text}
          onChange={e => setText(e.target.value)}
          rows={8}
          disabled={props.disabled}
          error={textError ?? undefined}
          hint={!textError ? `${trimmedText.length}/${TEXT_MAX}` : undefined}
        />
        <div>
          <Button
            variant="primary"
            loading={props.isLoading}
            disabled={!canSubmit}
            onClick={() => {
              props.onCreate({ description: trimmedDescription, text: trimmedText });
              setDescription('');
              setText('');
            }}
          >
            <Plus size={16} />
            Adicionar
          </Button>
        </div>
      </div>
    </Card>
  );
}

function PromptRow(props: {
  prompt: PromptDto;
  disabled: boolean;
  isSaving: boolean;
  onUpdate: (data: { id: string; description: string; text: string }) => void;
  onDelete: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [description, setDescription] = useState(props.prompt.description);
  const [text, setText] = useState(props.prompt.text);
  const trimmedDescription = description.trim();
  const trimmedText = text.trim();

  const descriptionError = useMemo(() => {
    if (!trimmedDescription) return 'Descrição é obrigatória';
    if (trimmedDescription.length > DESCRIPTION_MAX) return `Máximo de ${DESCRIPTION_MAX} caracteres`;
    return null;
  }, [trimmedDescription]);

  const textError = useMemo(() => {
    if (!trimmedText) return 'Prompt é obrigatório';
    if (trimmedText.length > TEXT_MAX) return `Máximo de ${TEXT_MAX} caracteres`;
    return null;
  }, [trimmedText]);

  const canSave = !props.disabled && !descriptionError && !textError;

  return (
    <CrudRow
      disabled={props.disabled}
      onEdit={() => setIsEditing(true)}
      onDelete={props.onDelete}
      isEditing={isEditing}
      isSaving={props.isSaving}
      canSave={canSave}
      onSaveEdit={() => {
        props.onUpdate({ id: props.prompt.id, description: trimmedDescription, text: trimmedText });
        setIsEditing(false);
      }}
      onCancelEdit={() => {
        setDescription(props.prompt.description);
        setText(props.prompt.text);
        setIsEditing(false);
      }}
      editContent={
        <div className="flex flex-col gap-3">
          <Input
            label="Descrição"
            value={description}
            onChange={e => setDescription(e.target.value)}
            maxLength={DESCRIPTION_MAX}
            disabled={props.disabled}
            error={descriptionError ?? undefined}
            hint={!descriptionError ? `${trimmedDescription.length}/${DESCRIPTION_MAX}` : undefined}
          />
          <Textarea
            label="Prompt"
            value={text}
            onChange={e => setText(e.target.value)}
            rows={8}
            disabled={props.disabled}
            error={textError ?? undefined}
            hint={!textError ? `${trimmedText.length}/${TEXT_MAX}` : undefined}
          />
        </div>
      }
    >
      <div className="min-w-0">
        <span className="font-semibold text-sm text-gray-800 truncate block">{props.prompt.description}</span>
        <span className="text-xs text-gray-500 truncate block mt-0.5">{props.prompt.text}</span>
      </div>
    </CrudRow>
  );
}
