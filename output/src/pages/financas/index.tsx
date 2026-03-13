import { useHttpClient } from '@/hooks/use-http-client';
import { createAsset, deleteAsset, getAssets, updateAsset, type AssetDto } from '@/services/assets-service';
import { formatCurrencyBRL } from '@/utils/format';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

function PlusIcon(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none">
      <path d="M12 4v16M4 12h16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function FinancasPage() {
  const httpClient = useHttpClient();
  const queryClient = useQueryClient();

  const assetsQuery = useQuery({
    queryKey: ['assets'],
    queryFn: () => getAssets(httpClient),
  });

  const createMutation = useMutation({
    mutationFn: (input: { name: string; saldo: number; disponivelImediatamente: boolean }) =>
      createAsset(httpClient, input),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['assets'] }),
  });

  const updateMutation = useMutation({
    mutationFn: (input: {
      id: string; name: string; saldo: number;
      disponivelImediatamente?: boolean; asOfDate?: string; observacao?: string;
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

  return (
    <div className="page">
      {/* Header */}
      <div className="page__header">
        <div>
          <h1 className="title">Finanças</h1>
          <div className="subtitle">Patrimônio e ativos financeiros</div>
        </div>
      </div>

      {/* Summary stats */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-card__label">Patrimônio Total</div>
          <div className="stat-card__value">{formatCurrencyBRL(totalAtual)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Disponível Imediatamente</div>
          <div className="stat-card__value stat-card__value--success">{formatCurrencyBRL(totalDisponivel)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Não Disponível</div>
          <div className="stat-card__value stat-card__value--info">{formatCurrencyBRL(totalBloqueado)}</div>
        </div>
      </div>

      {/* Add asset form */}
      <NovoAtivo
        disabled={createMutation.isPending}
        onCreate={data => createMutation.mutate(data)}
      />

      {/* Assets table */}
      <div className="card">
        <div className="section-header">
          <h2 className="section-title">Ativos</h2>
          {assets.length > 0 && (
            <span className="badge badge--info">{assets.length} {assets.length === 1 ? 'item' : 'itens'}</span>
          )}
        </div>

        {assetsQuery.isLoading ? (
          <div className="status-bar status-bar--loading">
            <div className="spinner" />
            Carregando ativos...
          </div>
        ) : assetsQuery.isError ? (
          <div className="status-bar status-bar--error">
            Falha ao carregar. Tente novamente.
          </div>
        ) : assets.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M3.5 7.5A3.5 3.5 0 0 1 7 4h12a1 1 0 0 1 0 2H7a1.5 1.5 0 0 0 0 3h13.5v9A3.5 3.5 0 0 1 17 21H7A3.5 3.5 0 0 1 3.5 17.5v-10Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="empty-state__text">Nenhum ativo cadastrado</div>
          </div>
        ) : (
          <div className="table-wrap">
            <div className="table__head table__head--fin">
              <div>Item</div>
              <div className="right">Saldo</div>
              <div className="right">Ações</div>
            </div>

            {assets.map(asset => (
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
      <div className="section-header">
        <h2 className="section-title">Novo Ativo</h2>
      </div>
      <div className="row row--wrap">
        <div className="field field--grow">
          <label className="label">Nome do item</label>
          <input
            className="input"
            placeholder="Ex: Conta Corrente Bradesco"
            value={name}
            onChange={e => setName(e.target.value)}
            disabled={props.disabled}
          />
        </div>

        <div className="field">
          <label className="label">Saldo (R$)</label>
          <input
            className="input"
            placeholder="0,00"
            value={saldo}
            onChange={e => setSaldo(e.target.value)}
            disabled={props.disabled}
          />
        </div>

        <div className="field" style={{ justifyContent: 'flex-end', paddingBottom: 2 }}>
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
            <PlusIcon className="icon-16" />
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
    id: string; name: string; saldo: number;
    disponivelImediatamente?: boolean; asOfDate?: string; observacao?: string;
  }) => void;
  onDelete: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(props.asset.name);
  const [saldo, setSaldo] = useState(String(props.asset.saldo));
  const [disponivelImediatamente, setDisponivelImediatamente] = useState(props.asset.disponivelImediatamente);

  return (
    <div className="table__row table__row--fin">
      {!isEditing ? (
        <>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }} className="ellipsis">{props.asset.name}</div>
            <div style={{ marginTop: 4 }}>
              {props.asset.disponivelImediatamente ? (
                <span className="badge badge--success">
                  <CheckIcon /> Disponível
                </span>
              ) : (
                <span className="badge badge--neutral">Não disponível</span>
              )}
            </div>
          </div>

          <div className="right" style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15 }}>
            {formatCurrencyBRL(props.asset.saldo)}
          </div>

          <div className="right" style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
            <label className="checkbox" style={{ marginRight: 4 }}>
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
            </label>
            <button
              className="button button--ghost button--sm"
              type="button"
              onClick={() => setIsEditing(true)}
              disabled={props.disabled}
            >
              Editar
            </button>
            <button
              className="button button--danger button--sm"
              type="button"
              onClick={props.onDelete}
              disabled={props.disabled}
            >
              Excluir
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="row row--wrap" style={{ gridColumn: '1 / -1' }}>
            <div className="field field--grow">
              <label className="label">Nome</label>
              <input className="input input--small" value={name} onChange={e => setName(e.target.value)} disabled={props.disabled} />
            </div>
            <div className="field">
              <label className="label">Saldo</label>
              <input className="input input--small" value={saldo} onChange={e => setSaldo(e.target.value)} disabled={props.disabled} />
            </div>
            <div className="field" style={{ justifyContent: 'flex-end', paddingBottom: 2 }}>
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
            <div className="field" style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
              <button
                className="button button--primary button--sm"
                type="button"
                onClick={() => {
                  props.onUpdate({ id: props.asset.id, name: name.trim(), saldo: Number(saldo), disponivelImediatamente });
                  setIsEditing(false);
                }}
                disabled={props.disabled || !name.trim() || !Number.isFinite(Number(saldo))}
              >
                Salvar
              </button>
              <button
                className="button button--sm"
                type="button"
                onClick={() => setIsEditing(false)}
                disabled={props.disabled}
              >
                Cancelar
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
