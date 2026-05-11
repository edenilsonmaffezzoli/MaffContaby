import { useHttpClient } from '@/hooks/use-http-client';
import { getApiBaseUrl } from '@/config/api-base-url';
import { bootstrapAdmin, getBootstrapStatus, login } from '@/services/auth-service';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export function LoginPage() {
  const httpClient = useHttpClient();
  const navigate = useNavigate();

  const statusQuery = useQuery({
    queryKey: ['auth', 'bootstrap'],
    queryFn: () => getBootstrapStatus(httpClient),
    retry: false,
  });

  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mode = statusQuery.data?.needed ? 'bootstrap' : 'login';

  const validation = useMemo(() => {
    if (!username.trim()) return 'Usuário é obrigatório';
    if (!password) return 'Senha é obrigatória';
    return null;
  }, [username, password]);

  const bootstrapMutation = useMutation({
    mutationFn: async () => bootstrapAdmin(httpClient, { username: username.trim(), password }),
    onSuccess: async () => {
      localStorage.setItem('gdp_api_base_url', getApiBaseUrl());
      localStorage.setItem('gdp_spa_base_path', import.meta.env.BASE_URL);
      statusQuery.refetch();
    },
    onError: e => {
      setError(e instanceof Error ? e.message : 'Falha ao criar admin');
    },
  });

  const loginMutation = useMutation({
    mutationFn: async () => login(httpClient, { username: username.trim(), password }),
    onSuccess: async data => {
      localStorage.setItem('gdp_token', data.token);
      localStorage.setItem('gdp_api_base_url', getApiBaseUrl());
      localStorage.setItem('gdp_spa_base_path', import.meta.env.BASE_URL);
      setError(null);
      navigate('/gdp', { replace: true });
    },
    onError: e => {
      setError(e instanceof Error ? e.message : 'Falha no login');
    },
  });

  const isBusy = statusQuery.isLoading || bootstrapMutation.isPending || loginMutation.isPending;
  const canSubmit = !isBusy && !validation;

  return (
    <div className="container" style={{ maxWidth: 720 }}>
      <div className="page">
        <div className="page__header">
          <div>
            <h1 className="title">{mode === 'bootstrap' ? 'Criar Admin' : 'Login'}</h1>
            <div className="subtitle">
              {mode === 'bootstrap'
                ? 'Primeiro acesso: defina o usuário admin'
                : 'Entre para acessar o controle de horários'}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="row row--wrap">
            <div className="field field--grow">
              <label className="label">Usuário</label>
              <input className="input" value={username} onChange={e => setUsername(e.target.value)} disabled={isBusy || mode === 'bootstrap'} />
            </div>
            <div className="field field--grow">
              <label className="label">Senha</label>
              <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} disabled={isBusy} />
            </div>
          </div>

          {validation ? <div style={{ marginTop: 10, fontSize: 13, color: 'var(--danger)' }}>{validation}</div> : null}
          {error ? <div style={{ marginTop: 10, fontSize: 13, color: 'var(--danger)' }}>{error}</div> : null}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
            <button
              className="button button--primary"
              type="button"
              disabled={!canSubmit}
              onClick={() => {
                setError(null);
                if (mode === 'bootstrap') bootstrapMutation.mutate();
                else loginMutation.mutate();
              }}
            >
              {mode === 'bootstrap' ? 'Criar' : 'Entrar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
