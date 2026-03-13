import { Layout } from '@/components/layout';
import { FinancasPage } from '@/pages/financas';
import { ImportarPage } from '@/pages/importar';
import { MovimentacoesPage } from '@/pages/movimentacoes';
import { Navigate, Route, Routes } from 'react-router-dom';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<MovimentacoesPage />} />
        <Route path="/financas" element={<FinancasPage />} />
        <Route path="/importar" element={<ImportarPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

