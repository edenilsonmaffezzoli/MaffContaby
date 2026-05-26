import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { CrudRow } from '@/components/ui/crud-list';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { StatusMessage } from '@/components/ui/spinner';
import { useHttpClient } from '@/hooks/use-http-client';
import { createCompetencia, deleteCompetencia, getCompetencias, type CompetenciaDto } from '@/services/competencias-service';
import { competenciaToDateOnly, formatCompetencia } from '@/utils/format';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Plus } from 'lucide-react';
import { useMemo } from 'react';

function toMonth(value: string) {
  return value ? value.slice(0, 7) : '';
}

export function CompetenciasPage() {
  const httpClient = useHttpClient();
  const queryClient = useQueryClient();

  const query = useQuery({ queryKey: ['competencias'], queryFn: () => getCompetencias(httpClient) });

  const createMutation = useMutation({
    mutationFn: (input: { value: string }) => createCompetencia(httpClient, input),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['competencias'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCompetencia(httpClient, id),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['competencias'] }),
  });

  const items = useMemo(
    () => (query.data ?? []).slice().sort((a, b) => b.value.localeCompare(a.value)),
    [query.data],
  );

  const canInteract = !query.isFetching && !createMutation.isPending && !deleteMutation.isPending;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Cadastro de Competência" subtitle="Competências usadas nos filtros e lançamentos" />

      <NovaCompetencia
        disabled={!canInteract}
        isLoading={createMutation.isPending}
        onCreate={data => createMutation.mutate(data)}
      />

      <Card noPad>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-[15px] font-semibold text-gray-800 m-0">Competências cadastradas</h2>
          {items.length > 0 ? (
            <Badge variant="info">{items.length} {items.length === 1 ? 'item' : 'itens'}</Badge>
          ) : null}
        </div>

        {query.isLoading ? (
          <div className="px-6"><StatusMessage type="loading">Carregando…</StatusMessage></div>
        ) : query.isError ? (
          <div className="px-6"><StatusMessage type="error">Falha ao carregar. Tente novamente.</StatusMessage></div>
        ) : items.length === 0 ? (
          <EmptyState icon={<CalendarDays size={22} />} title="Nenhuma competência cadastrada" description="Adicione a primeira competência acima" />
        ) : (
          <div className="divide-y divide-gray-100">
            <div className="grid px-4 py-2.5 bg-gray-50 border-b border-gray-100" style={{ gridTemplateColumns: '1fr auto' }}>
              <span className="text-[11px] font-bold uppercase tracking-[0.6px] text-gray-500">Competência</span>
              <span className="text-[11px] font-bold uppercase tracking-[0.6px] text-gray-500 text-right">Ações</span>
            </div>
            {items.map(c => (
              <CompetenciaRow
                key={c.id}
                item={c}
                disabled={!canInteract}
                isDeleting={deleteMutation.isPending}
                onDelete={() => deleteMutation.mutate(c.id)}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function NovaCompetencia(props: {
  disabled: boolean;
  isLoading: boolean;
  onCreate: (data: { value: string }) => void;
}) {
  const defaultValue = formatCompetencia(new Date());
  const validation = useMemo(() => {
    if (!defaultValue.trim()) return 'Competência é obrigatória';
    return null;
  }, [defaultValue]);

  const canSubmit = !props.disabled && !validation;

  return (
    <Card>
      <CardHeader title="Adicionar Competência" />
      <div className="flex flex-wrap gap-3 items-end">
        <div className="min-w-[200px]">
          <Input
            label="Competência"
            type="month"
            defaultValue={defaultValue}
            id="nova-competencia"
            disabled={props.disabled}
          />
        </div>
        <Button
          variant="primary"
          loading={props.isLoading}
          disabled={!canSubmit}
          onClick={() => {
            const input = document.getElementById('nova-competencia') as HTMLInputElement;
            const value = input?.value;
            if (value) props.onCreate({ value: competenciaToDateOnly(value.trim()) });
          }}
        >
          <Plus size={16} />
          Adicionar
        </Button>
      </div>
    </Card>
  );
}

function CompetenciaRow(props: {
  item: CompetenciaDto;
  disabled: boolean;
  isDeleting: boolean;
  onDelete: () => void;
}) {
  return (
    <CrudRow disabled={props.disabled} onDelete={props.onDelete}>
      <span className="font-semibold text-sm text-gray-800">{toMonth(props.item.value)}</span>
    </CrudRow>
  );
}
