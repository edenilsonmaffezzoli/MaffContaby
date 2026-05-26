import { Layout } from '@/components/layout';
import { UsersPage } from '@/pages/admin/users';
import { LoginPage } from '@/pages/auth/login';
import { CompetenciasPage } from '@/pages/cadastro/competencias';
import { GruposPage } from '@/pages/cadastro/grupos';
import { PessoasPage } from '@/pages/cadastro/pessoas';
import { FinancasPage } from '@/pages/financas';
import { ImportarPage } from '@/pages/importar';
import { MovimentacoesPage } from '@/pages/movimentacoes';
import { CasosTesteInteligentesPage } from '@/pages/casos-teste-inteligentes';
import { RelatoriosPage } from '@/pages/relatorios';
import { Navigate, Route, Routes } from 'react-router-dom';

function GdpPage() {
  const token = localStorage.getItem('gdp_token')?.trim() ?? '';
  if (!token) return <Navigate to="/login" replace />;
  const src = `${import.meta.env.BASE_URL}gdp/index.html`;
  return (
    <div className="flex-1 min-h-0 flex flex-col h-full" style={{ minHeight: '600px' }}>
      <iframe
        title="Horários — Registro Diário"
        src={src}
        className="gdp-frame flex-1"
        style={{ minHeight: '600px' }}
      />
    </div>
  );
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
        <Route path="/casos-teste-inteligentes" element={<CasosTesteInteligentesPage />} />
        <Route path="/gdp" element={<GdpPage />} />
        <Route path="/usuarios" element={<UsersPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
