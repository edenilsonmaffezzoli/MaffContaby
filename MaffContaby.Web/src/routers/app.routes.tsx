import { Layout } from '@/components/layout';
import { UsersPage } from '@/pages/admin/users';
import { LoginPage } from '@/pages/auth/login';
import { CompetenciasPage } from '@/pages/cadastro/competencias';
import { GruposPage } from '@/pages/cadastro/grupos';
import { PessoasPage } from '@/pages/cadastro/pessoas';
import { FinancasPage } from '@/pages/financas';
import { ImportarPage } from '@/pages/importar';
import { MovimentacoesPage } from '@/pages/movimentacoes';
import { RelatoriosPage } from '@/pages/relatorios';
import { Navigate, Route, Routes } from 'react-router-dom';

function GdpPage() {
  const token = localStorage.getItem('gdp_token')?.trim() ?? '';
  if (!token) return <Navigate to="/login" replace />;
  const src = `${import.meta.env.BASE_URL}gdp/index.html`;
  return <iframe title="GDP — Registro Diário" src={src} style={{ width: '100%', height: '100%', display: 'block', border: 0 }} />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Layout />}>
        <Route index element={<MovimentacoesPage />} />
        <Route path="/cadastro/pessoas" element={<PessoasPage />} />
        <Route path="/cadastro/grupos" element={<GruposPage />} />
        <Route path="/cadastro/competencias" element={<CompetenciasPage />} />
        <Route path="/financas" element={<FinancasPage />} />
        <Route path="/relatorios" element={<RelatoriosPage />} />
        <Route path="/importar" element={<ImportarPage />} />
        <Route path="/gdp" element={<GdpPage />} />
        <Route path="/usuarios" element={<UsersPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
