import { useHttpClient } from '@/hooks/use-http-client';
import { createAsset, deleteAsset, getAssets, updateAsset, type AssetDto } from '@/services/assets-service';
import { formatCurrencyBRL } from '@/utils/format';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

export function FinancasPage() {
  const httpClient = useHttpClient();
  const queryClient = useQueryClient();

  const assetsQuery = useQuery({
    queryKey: ['assets'],
    queryFn: () => getAssets(httpClient),
  });

  const createMutation = useMutation({
    mutationFn: (input: { name: string; saldo: number; disponivelImediatamente: boolean }) => createAsset(httpClient, input),
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

  const totalAtual = (assetsQuery.data ?? []).reduce((sum, a) => sum + a.saldo, 0);
  const totalDisponivelImediatamente = (assetsQuery.data ?? []).reduce(
    (sum, a) => sum + (a.disponivelImediatamente ? a.saldo : 0),
    0,
  );

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="title">Finanças</h1>
          <div className="subtitle">
            Total atual: {formatCurrencyBRL(totalAtual)} • Disponível imediatamente: {formatCurrencyBRL(totalDisponivelImediatamente)}
          </div>
        </div>
      </div>

      <NovoAtivo disabled={createMutation.isPending} onCreate={data => createMutation.mutate(data)} />

      <div className="card">
        {assetsQuery.isLoading ? (
          <div className="muted">Carregando...</div>
        ) : assetsQuery.isError ? (
          <div className="error">Falha ao carregar.</div>
        ) : (assetsQuery.data ?? []).length === 0 ? (
          <div className="muted">Sem itens.</div>
        ) : (
          <div className="table">
            <div className="table__head">
              <div>Item</div>
              <div className="right">Saldo</div>
              <div className="right">Ações</div>
            </div>

            {(assetsQuery.data ?? []).map(asset => (
              <AssetRow
                key={asset.id}
                asset={asset}
                onUpdate={data => updateMutation.mutate(data)}
                onDelete={() => deleteMutation.mutate(asset.id)}
                disabled={updateMutation.isPending || deleteMutation.isPending}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NovoAtivo(props: {
  disabled: boolean;
  onCreate: (data: { name: string; saldo: number; disponivelImediatamente: boolean }) => void;
}) {
  const [name, setName] = useState('');
  const [saldo, setSaldo] = useState('');
  const [disponivelImediatamente, setDisponivelImediatamente] = useState(true);

  const canSubmit = !props.disabled && name.trim() && Number.isFinite(Number(saldo));

  return (
    <div className="card">
      <div className="row row--wrap">
        <div className="field field--grow">
          <label className="label">Item</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)} disabled={props.disabled} />
        </div>
        <div className="field">
          <label className="label">Saldo</label>
          <input className="input" value={saldo} onChange={e => setSaldo(e.target.value)} disabled={props.disabled} />
        </div>
        <div className="field">
          <label className="label">&nbsp;</label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={disponivelImediatamente}
              onChange={e => setDisponivelImediatamente(e.target.checked)}
              disabled={props.disabled}
            />
            Disponível imediatamente
          </label>
        </div>
        <div className="field">
          <label className="label">&nbsp;</label>
          <button
            className="button button--primary"
            type="button"
            disabled={!canSubmit}
            onClick={() => {
              props.onCreate({ name: name.trim(), saldo: Number(saldo), disponivelImediatamente });
              setName('');
              setSaldo('');
              setDisponivelImediatamente(true);
            }}
          >
            Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}

function AssetRow(props: {
  asset: AssetDto;
  disabled: boolean;
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
  const [disponivelImediatamente, setDisponivelImediatamente] = useState(props.asset.disponivelImediatamente);

  return (
    <div className="table__row table__row--flat">
      {!isEditing ? (
        <>
          <div>
            <div className="ellipsis">{props.asset.name}</div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={props.asset.disponivelImediatamente}
                onChange={e =>
                  props.onUpdate({
                    id: props.asset.id,
                    name: props.asset.name,
                    saldo: props.asset.saldo,
                    disponivelImediatamente: e.target.checked,
                  })
                }
                disabled={props.disabled}
              />
              Disponível imediatamente
            </label>
          </div>
          <div className="right">{formatCurrencyBRL(props.asset.saldo)}</div>
          <div className="right">
            <button className="button button--ghost" type="button" onClick={() => setIsEditing(true)} disabled={props.disabled}>
              Editar
            </button>
            <button className="button button--danger" type="button" onClick={props.onDelete} disabled={props.disabled}>
              Excluir
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="row row--wrap">
            <input className="input" value={name} onChange={e => setName(e.target.value)} disabled={props.disabled} />
            <label className="checkbox">
              <input
                type="checkbox"
                checked={disponivelImediatamente}
                onChange={e => setDisponivelImediatamente(e.target.checked)}
                disabled={props.disabled}
              />
              Disponível imediatamente
            </label>
          </div>
          <div className="right">
            <input className="input input--small" value={saldo} onChange={e => setSaldo(e.target.value)} disabled={props.disabled} />
          </div>
          <div className="right">
            <button
              className="button button--primary"
              type="button"
              onClick={() => {
                props.onUpdate({ id: props.asset.id, name: name.trim(), saldo: Number(saldo), disponivelImediatamente });
                setIsEditing(false);
              }}
              disabled={props.disabled || !name.trim() || !Number.isFinite(Number(saldo))}
            >
              Salvar
            </button>
            <button className="button" type="button" onClick={() => setIsEditing(false)} disabled={props.disabled}>
              Cancelar
            </button>
          </div>
        </>
      )}
    </div>
  );
}
