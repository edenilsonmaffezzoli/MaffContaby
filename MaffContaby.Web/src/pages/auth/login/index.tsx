import { getApiBaseUrl } from '@/config/api-base-url';
import { useHttpClient } from '@/hooks/use-http-client';
import { bootstrapAdmin, getBootstrapStatus, login } from '@/services/auth-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertCircle, LogIn, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

function extractApiError(e: unknown, fallback: string): string {
  const err = e as { response?: { data?: unknown }; message?: string };
  const data = err?.response?.data;
  if (typeof data === 'string' && data.trim()) return data.trim();
  if (data && typeof data === 'object') {
    const obj = data as { error?: unknown; message?: unknown };
    if (typeof obj.error === 'string' && obj.error.trim()) return obj.error.trim();
    if (typeof obj.message === 'string' && obj.message.trim()) return obj.message.trim();
  }
  if (typeof err?.message === 'string' && err.message.trim()) return err.message.trim();
  return fallback;
}

function LogoMark() {
  return (
    <svg width="32" height="32" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="32" r="28" stroke="rgba(255,255,255,0.9)" strokeWidth="3.5" />
      <path d="M18 46V36" stroke="#339999" strokeWidth="4" strokeLinecap="round" />
      <path d="M32 46V26" stroke="#339999" strokeWidth="4" strokeLinecap="round" />
      <path d="M46 46V18" stroke="#339999" strokeWidth="4" strokeLinecap="round" />
      <path d="M15 48H49" stroke="rgba(255,255,255,0.9)" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

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
    if (mode === 'bootstrap' && password.length < 8) return 'A senha deve ter ao menos 8 caracteres';
    return null;
  }, [username, password, mode]);

  const bootstrapMutation = useMutation({
    mutationFn: async () => bootstrapAdmin(httpClient, { username: username.trim(), password }),
    onSuccess: async () => {
      localStorage.setItem('gdp_api_base_url', getApiBaseUrl());
      localStorage.setItem('gdp_spa_base_path', import.meta.env.BASE_URL);
      statusQuery.refetch();
    },
    onError: e => setError(extractApiError(e, 'Falha ao criar admin')),
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
    onError: e => setError(extractApiError(e, 'Falha no login')),
  });

  const isBusy = statusQuery.isLoading || bootstrapMutation.isPending || loginMutation.isPending;
  const canSubmit = !isBusy && !validation;

  const handleSubmit = () => {
    setError(null);
    if (mode === 'bootstrap') bootstrapMutation.mutate();
    else loginMutation.mutate();
  };

  return (
    <div className="min-h-svh bg-gradient-to-br from-[#006666] to-[#003366] flex items-center justify-center p-4">
      <div className="w-full max-w-[400px]">
        {/* Brand */}
        <div className="flex flex-col items-center gap-4 mb-8">
          <div className="w-16 h-16 rounded-2xl bg-white/15 flex items-center justify-center backdrop-blur-sm border border-white/20">
            <LogoMark />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white tracking-tight">MaffContaby</h1>
            <p className="text-[13px] text-white/60 mt-1 uppercase tracking-[0.5px]">Gestão Contábil</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.25)] p-8">
          <div className="mb-6">
            <h2 className="text-[18px] font-bold text-gray-800">
              {mode === 'bootstrap' ? 'Primeiro acesso' : 'Entrar na conta'}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {mode === 'bootstrap'
                ? 'Defina o usuário administrador do sistema'
                : 'Use suas credenciais para acessar'}
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <Input
              label="Usuário"
              placeholder="nome de usuário"
              value={username}
              onChange={e => setUsername(e.target.value)}
              disabled={isBusy || mode === 'bootstrap'}
              autoComplete="username"
            />
            <Input
              label="Senha"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={isBusy}
              autoComplete={mode === 'bootstrap' ? 'new-password' : 'current-password'}
              onKeyDown={e => { if (e.key === 'Enter' && canSubmit) handleSubmit(); }}
            />

            {error ? (
              <div className="flex items-start gap-2.5 px-3 py-2.5 bg-[#FFEBEE] border border-[rgba(211,47,47,0.2)] rounded-lg">
                <AlertCircle size={15} className="text-[#D32F2F] shrink-0 mt-0.5" />
                <span className="text-[13px] text-[#B71C1C] font-medium">{error}</span>
              </div>
            ) : null}

            <Button
              variant="primary"
              size="lg"
              loading={isBusy}
              disabled={!canSubmit}
              onClick={handleSubmit}
              className="w-full mt-1"
            >
              {mode === 'bootstrap' ? <UserPlus size={18} /> : <LogIn size={18} />}
              {mode === 'bootstrap' ? 'Criar administrador' : 'Entrar'}
            </Button>
          </div>
        </div>

        <p className="text-center text-[11px] text-white/35 mt-6 tracking-[0.3px]">
          © 2026 MaffContaby · Versão Web
        </p>
      </div>
    </div>
  );
}
