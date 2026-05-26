import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { CrudRow } from '@/components/ui/crud-list';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard, StatCardSkeleton } from '@/components/ui/stat-card';
import { StatusMessage } from '@/components/ui/spinner';
import { useHttpClient } from '@/hooks/use-http-client';
import { createAsset, deleteAsset, getAssets, updateAsset, type AssetDto } from '@/services/assets-service';
import { formatCurrencyBRL, parseDecimalBRL } from '@/utils/format';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Plus, Wallet } from 'lucide-react';
import { useState } from 'react';

export function FinancasPage() {
  const httpClient = useHttpClient();
  const queryClient = useQueryClient();

  const assetsQuery = useQuery({ queryKey: ['assets'], queryFn: () => getAssets(httpClient) });

  const createMutation = useMutation({
    mutationFn: (input: { name: string; saldo: number; disponivelImediatamente: boolean }) =>
      createAsset(httpClient, input),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['assets'] }),
  });

  const updateMutation = useMutation({
    mutationFn: (input: {
      id: string;
      name: string;
      saldo: number;
      disponivelImediatamente?: boolean;
      asOfDate?: string;
      observacao?: string;
    }) =>
      updateAsset(httpClient, input.id, {
        name: input.name,
        saldo: input.saldo,
        disponivelImediatamente: input.disponivelImediatamente ?? null,
        asOfDate: input.asOfDate ?? null,
        observacao: input.observacao ?? null,
      }),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['assets'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAsset(httpClient, id),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['assets'] }),
  });

  const assets = assetsQuery.data ?? [];
  const totalAtual = assets.reduce((sum, a) => sum + a.saldo, 0);
  const totalDisponivel = assets.reduce((sum, a) => sum + (a.disponivelImediatamente ? a.saldo : 0), 0);
  const totalBloqueado = totalAtual - totalDisponivel;

  const isMutating = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;
  const isLoading = assetsQuery.isLoading;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Investimentos" subtitle="Patrimônio e ativos financeiros" />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {isLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard label="Patrimônio Total" value={formatCurrencyBRL(totalAtual)} icon={<Wallet size={16} />} />
            <StatCard label="Disponível Imediatamente" value={formatCurrencyBRL(totalDisponivel)} valueColor="success" />
            <StatCard label="Não Disponível" value={formatCurrencyBRL(totalBloqueado)} valueColor="info" />
          </>
        )}
      </div>

      {/* New asset form */}
      <NovoAtivo
        disabled={isMutating}
        isLoading={createMutation.isPending}
        onCreate={data => createMutation.mutate(data)}
      />

      {/* Asset list */}
      <Card noPad>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-[15px] font-semibold text-gray-800 m-0">Ativos</h2>
          {assets.length > 0 ? (
            <Badge variant="info">{assets.length} {assets.length === 1 ? 'item' : 'itens'}</Badge>
          ) : null}
        </div>

        {isLoading ? (
          <div className="px-6"><StatusMessage type="loading">Carregando ativos…</StatusMessage></div>
        ) : assetsQuery.isError ? (
          <div className="px-6"><StatusMessage type="error">Falha ao carregar. Tente novamente.</StatusMessage></div>
        ) : assets.length === 0 ? (
          <EmptyState icon={<Wallet size={22} />} title="Nenhum ativo cadastrado" description="Adicione o primeiro ativo acima" />
        ) : (
          <div className="divide-y divide-gray-100">
            <div className="grid px-4 py-2.5 bg-gray-50 border-b border-gray-100" style={{ gridTemplateColumns: '1fr 160px auto' }}>
              <span className="text-[11px] font-bold uppercase tracking-[0.6px] text-gray-500">Item</span>
              <span className="text-[11px] font-bold uppercase tracking-[0.6px] text-gray-500 text-right">Saldo</span>
              <span className="text-[11px] font-bold uppercase tracking-[0.6px] text-gray-500 text-right pr-2">Ações</span>
            </div>
            {assets.map(asset => (
              <AssetRow
                key={asset.id}
                asset={asset}
                disabled={isMutating}
                isSaving={updateMutation.isPending}
                onUpdate={data => updateMutation.mutate(data)}
                onDelete={() => deleteMutation.mutate(asset.id)}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function NovoAtivo(props: {
  disabled: boolean;
  isLoading: boolean;
  onCreate: (data: { name: string; saldo: number; disponivelImediatamente: boolean }) => void;
}) {
  const [name, setName] = useState('');
  const [saldo, setSaldo] = useState('');
  const [disponivel, setDisponivel] = useState(true);

  const saldoParsed = parseDecimalBRL(saldo);
  const canSubmit = !props.disabled && name.trim() && saldoParsed !== null;

  return (
    <Card>
      <CardHeader title="Novo Ativo" />
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <Input
            label="Nome do item"
            placeholder="Ex: Conta Corrente Bradesco"
            value={name}
            onChange={e => setName(e.target.value)}
            disabled={props.disabled}
          />
        </div>
        <div className="min-w-[140px]">
          <Input
            label="Saldo (R$)"
            placeholder="0,00"
            value={saldo}
            onChange={e => setSaldo(e.target.value)}
            disabled={props.disabled}
          />
        </div>
        <div className="flex items-center gap-2 pb-1">
          <input
            type="checkbox"
            id="disponivel-check"
            checked={disponivel}
            onChange={e => setDisponivel(e.target.checked)}
            disabled={props.disabled}
            className="w-4 h-4 accent-[#006666] cursor-pointer"
          />
          <label htmlFor="disponivel-check" className="text-sm text-gray-600 cursor-pointer select-none">
            Disponível imediatamente
          </label>
        </div>
        <Button
          variant="primary"
          loading={props.isLoading}
          disabled={!canSubmit}
          onClick={() => {
            if (saldoParsed === null) return;
            props.onCreate({ name: name.trim(), saldo: saldoParsed, disponivelImediatamente: disponivel });
            setName('');
            setSaldo('');
            setDisponivel(true);
          }}
        >
          <Plus size={16} />
          Adicionar
        </Button>
      </div>
    </Card>
  );
}

function AssetRow(props: {
  asset: AssetDto;
  disabled: boolean;
  isSaving: boolean;
  onUpdate: (data: {
    id: string;
    name: string;
    saldo: number;
    disponivelImediatamente?: boolean;
    asOfDate?: string;
    observacao?: string;
  }) => void;
  onDelete: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(props.asset.name);
  const [saldo, setSaldo] = useState(String(props.asset.saldo));
  const [disponivel, setDisponivel] = useState(props.asset.disponivelImediatamente);
  const saldoParsed = parseDecimalBRL(saldo);

  return (
    <CrudRow
      disabled={props.disabled}
      onEdit={() => setIsEditing(true)}
      onDelete={props.onDelete}
      isEditing={isEditing}
      isSaving={props.isSaving}
      canSave={name.trim().length > 0 && saldoParsed !== null && !props.disabled}
      onSaveEdit={() => {
        if (saldoParsed === null) return;
        props.onUpdate({ id: props.asset.id, name: name.trim(), saldo: saldoParsed, disponivelImediatamente: disponivel });
        setIsEditing(false);
      }}
      onCancelEdit={() => {
        setName(props.asset.name);
        setSaldo(String(props.asset.saldo));
        setDisponivel(props.asset.disponivelImediatamente);
        setIsEditing(false);
      }}
      editContent={
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <Input label="Nome" value={name} onChange={e => setName(e.target.value)} disabled={props.disabled} />
          </div>
          <div className="min-w-[140px]">
            <Input label="Saldo" value={saldo} onChange={e => setSaldo(e.target.value)} disabled={props.disabled} />
          </div>
          <div className="flex items-center gap-2 pb-1">
            <input
              type="checkbox"
              id={`disponivel-${props.asset.id}`}
              checked={disponivel}
              onChange={e => setDisponivel(e.target.checked)}
              disabled={props.disabled}
              className="w-4 h-4 accent-[#006666] cursor-pointer"
            />
            <label htmlFor={`disponivel-${props.asset.id}`} className="text-sm text-gray-600 cursor-pointer select-none">
              Disponível imediatamente
            </label>
          </div>
        </div>
      }
    >
      <div className="grid items-center gap-3" style={{ gridTemplateColumns: '1fr 160px' }}>
        <div>
          <p className="font-semibold text-sm text-gray-800 truncate">{props.asset.name}</p>
          <div className="mt-1">
            <Badge variant={props.asset.disponivelImediatamente ? 'success' : 'neutral'}>
              {props.asset.disponivelImediatamente ? (
                <><Check size={10} /> Disponível</>
              ) : (
                'Não disponível'
              )}
            </Badge>
          </div>
        </div>
        <div className="text-right font-display font-bold text-sm text-gray-800">
          {formatCurrencyBRL(props.asset.saldo)}
        </div>
      </div>
    </CrudRow>
  );
}
