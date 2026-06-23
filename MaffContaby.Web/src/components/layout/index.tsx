import { logout, me } from '@/services/auth-service';
import { useHttpClient } from '@/hooks/use-http-client';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart2,
  ChevronDown,
  Clock,
  FileText,
  LogOut,
  Menu,
  Sparkles,
  Tag,
  Upload,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';

function getInitials(username: string): string {
  const trimmed = (username ?? '').trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}

const ROUTE_TITLES: Record<string, string> = {
  '/': 'Movimentações',
  '/financas': 'Investimentos',
  '/relatorios': 'Relatórios',
  '/importar': 'Importar',
  '/casos-teste-inteligentes': 'Casos de Teste IA',
  '/gdp': 'Horários',
  '/usuarios': 'Usuários',
  '/cadastro/pessoas': 'Cadastro de Pessoa',
  '/cadastro/grupos': 'Cadastro de Grupo',
};

function LogoMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="32" r="28" stroke="rgba(255,255,255,0.9)" strokeWidth="3.5" />
      <path d="M18 46V36" stroke="#339999" strokeWidth="4" strokeLinecap="round" />
      <path d="M32 46V26" stroke="#339999" strokeWidth="4" strokeLinecap="round" />
      <path d="M46 46V18" stroke="#339999" strokeWidth="4" strokeLinecap="round" />
      <path d="M15 48H49" stroke="rgba(255,255,255,0.9)" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const httpClient = useHttpClient();
  const [isOpen, setIsOpen] = useState(false);
  const [isCadastroOpen, setIsCadastroOpen] = useState(false);

  const isCadastroRoute = location.pathname.startsWith('/cadastro');
  const cadastroOpen = isCadastroOpen || isCadastroRoute;
  const isGdpRoute = location.pathname.startsWith('/gdp');
  const token = localStorage.getItem('gdp_token')?.trim() ?? '';

  const currentTitle = ROUTE_TITLES[location.pathname] ?? 'MaffContaby';

  const meQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => me(httpClient),
    enabled: Boolean(token),
    retry: false,
  });

  const user = meQuery.data?.user ?? null;

  const handleLogout = async () => {
    try { await logout(httpClient); } catch { /* ignore */ }
    localStorage.removeItem('gdp_token');
    localStorage.removeItem('gdp_admin_user');
    localStorage.removeItem('maff_write_key');
    navigate('/login', { replace: true });
  };

  const closeSidebar = () => setIsOpen(false);

  if (!token) return <Navigate to="/login" replace />;

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    [
      'flex items-center gap-2.5 px-3 py-[10px] rounded-[10px] no-underline',
      'font-sans font-medium text-sm transition-colors duration-150 relative',
      isActive
        ? 'bg-white/[0.16] text-white font-semibold before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:w-[3px] before:h-[60%] before:bg-[#339999] before:rounded-r-[3px]'
        : 'text-white/85 hover:bg-white/10 hover:text-white',
    ].join(' ');

  const subNavLinkClass = ({ isActive }: { isActive: boolean }) =>
    [
      'flex items-center gap-2.5 pl-3 pr-3 py-[9px] rounded-[10px] no-underline',
      'font-sans font-medium text-[13px] transition-colors duration-150 relative',
      isActive
        ? 'bg-white/[0.16] text-white font-semibold before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:w-[3px] before:h-[60%] before:bg-[#339999] before:rounded-r-[3px]'
        : 'text-white/85 hover:bg-white/10 hover:text-white',
    ].join(' ');

  return (
    <div className="flex min-h-svh bg-[#F0F0F0]">
      {/* Mobile toggle */}
      <button
        type="button"
        aria-label={isOpen ? 'Fechar menu' : 'Abrir menu'}
        onClick={() => setIsOpen(x => !x)}
        className="lg:hidden fixed top-3.5 left-3.5 z-[60] w-10 h-10 rounded-[10px] border border-gray-200 bg-white text-gray-700 flex items-center justify-center shadow-sm"
      >
        {isOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Overlay */}
      {isOpen && (
        <div
          role="presentation"
          className="lg:hidden fixed inset-0 bg-black/50 z-50 backdrop-blur-[2px]"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <aside
        aria-label="Navegação principal"
        className={[
          'w-[260px] flex flex-col min-h-svh flex-shrink-0',
          'bg-gradient-to-br from-[#006666] to-[#003366]',
          'lg:sticky lg:top-0 lg:h-svh',
          'lg:translate-x-0',
          'fixed inset-y-0 left-0 z-[55] lg:relative',
          'transition-transform duration-[220ms] ease-[cubic-bezier(0.4,0,0.2,1)]',
          'shadow-[0_16px_40px_rgba(0,0,0,0.12)]',
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        ].join(' ')}
      >
        <div className="flex flex-col h-full overflow-hidden">
          {/* Brand */}
          <div className="flex items-center gap-3 px-[22px] py-7 border-b border-white/10">
            <div className="w-10 h-10 rounded-[10px] bg-white/15 flex items-center justify-center shrink-0">
              <LogoMark />
            </div>
            <div className="min-w-0">
              <div className="font-display font-bold text-[15px] text-white tracking-[-0.2px] leading-tight">
                MaffContaby
              </div>
              <div className="text-[11px] text-white/50 mt-0.5 tracking-[0.3px] uppercase">
                Gestão Contábil
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-4 flex flex-col gap-1 overflow-y-auto" aria-label="Menu principal">
            {/* Cadastro group */}
            <div className="px-2.5 pt-3 pb-1.5 text-[10px] font-semibold tracking-[1px] uppercase text-white/40">
              Cadastros
            </div>
            <button
              type="button"
              aria-expanded={cadastroOpen}
              onClick={() => setIsCadastroOpen(x => !x)}
              className={[
                'flex items-center gap-2.5 px-3 py-[10px] rounded-[10px] w-full text-left',
                'font-sans font-medium text-sm transition-colors duration-150',
                cadastroOpen
                  ? 'bg-white/[0.16] text-white font-semibold'
                  : 'text-white/85 hover:bg-white/10 hover:text-white',
              ].join(' ')}
            >
              <Tag size={20} className="shrink-0" />
              <span className="flex-1">Cadastro</span>
              <ChevronDown
                size={16}
                className={[
                  'shrink-0 opacity-90 transition-transform duration-150',
                  cadastroOpen ? 'rotate-180' : '',
                ].join(' ')}
              />
            </button>

            {cadastroOpen && (
              <div className="ml-5 flex flex-col gap-1 mt-1 mb-2">
                <NavLink to="/cadastro/pessoas" className={subNavLinkClass} onClick={closeSidebar}>
                  Cadastro de Pessoa
                </NavLink>
                <NavLink to="/cadastro/grupos" className={subNavLinkClass} onClick={closeSidebar}>
                  Cadastro de Grupo
                </NavLink>
              </div>
            )}

            {/* Main nav */}
            <div className="px-2.5 pt-3 pb-1.5 text-[10px] font-semibold tracking-[1px] uppercase text-white/40">
              Operações
            </div>
            <NavLink to="/" end className={navLinkClass} onClick={closeSidebar}>
              <BarChart2 size={20} className="shrink-0" />
              <span>Movimentações</span>
            </NavLink>
            <NavLink to="/financas" className={navLinkClass} onClick={closeSidebar}>
              <Wallet size={20} className="shrink-0" />
              <span>Investimentos</span>
            </NavLink>
            <NavLink to="/relatorios" className={navLinkClass} onClick={closeSidebar}>
              <FileText size={20} className="shrink-0" />
              <span>Relatórios</span>
            </NavLink>
            <NavLink to="/importar" className={navLinkClass} onClick={closeSidebar}>
              <Upload size={20} className="shrink-0" />
              <span>Importar</span>
            </NavLink>

            <div className="px-2.5 pt-3 pb-1.5 text-[10px] font-semibold tracking-[1px] uppercase text-white/40">
              Ferramentas
            </div>
            <NavLink to="/casos-teste-inteligentes" className={navLinkClass} onClick={closeSidebar}>
              <Sparkles size={20} className="shrink-0" />
              <span>Casos de Teste IA</span>
            </NavLink>
            <NavLink to="/gdp" className={navLinkClass} onClick={closeSidebar}>
              <Clock size={20} className="shrink-0" />
              <span>Horários</span>
            </NavLink>

            {user?.admin && (
              <>
                <div className="px-2.5 pt-3 pb-1.5 text-[10px] font-semibold tracking-[1px] uppercase text-white/40">
                  Admin
                </div>
                <NavLink to="/usuarios" className={navLinkClass} onClick={closeSidebar}>
                  <Users size={20} className="shrink-0" />
                  <span>Usuários</span>
                </NavLink>
              </>
            )}
          </nav>

          {/* Footer */}
          <div className="px-4 py-[18px] border-t border-white/10 flex flex-col gap-2.5">
            {user ? (
              <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white/[0.06] border border-white/[0.08] hover:bg-white/[0.09] hover:border-white/[0.14] transition-colors duration-150">
                <div className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center font-display font-bold text-[13px] text-white tracking-[0.3px] uppercase bg-gradient-to-br from-[#339999] to-[#6699CC] shadow-[0_0_0_2px_rgba(255,255,255,0.10),0_2px_6px_rgba(0,0,0,0.25)]">
                  {getInitials(user.username)}
                </div>
                <div className="flex-1 min-w-0 flex flex-col leading-tight">
                  <span className="font-semibold text-[13px] text-white truncate">{user.username}</span>
                  <span className="text-[11px] text-white/50 mt-0.5 tracking-[0.2px]">
                    {user.admin ? 'Administrador' : 'Usuário'}
                  </span>
                </div>
                <button
                  type="button"
                  title="Sair"
                  aria-label="Sair da conta"
                  onClick={handleLogout}
                  className="w-8 h-8 rounded-lg border border-transparent bg-transparent text-white/50 flex items-center justify-center cursor-pointer shrink-0 transition-all duration-150 hover:bg-red-500/15 hover:border-red-400/35 hover:text-red-300"
                >
                  <LogOut size={16} />
                </button>
              </div>
            ) : null}
            <div className="text-[10.5px] text-white/40 text-center tracking-[0.3px]">
              © 2026 MaffContaby · Versão Web
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 flex flex-col">
        {/* Mobile topbar */}
        <div className="lg:hidden sticky top-0 z-40 h-[60px] bg-[#003366] text-white flex items-center px-4 pl-16 shadow-[0_2px_10px_rgba(0,51,102,0.24)]">
          <span className="font-display font-bold text-base">{currentTitle}</span>
        </div>

        <div className={isGdpRoute ? 'flex-1 min-h-0 flex flex-col' : 'max-w-[1140px] mx-auto px-7 py-8 pb-14 w-full lg:px-7 px-4 lg:py-8 py-5'}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
