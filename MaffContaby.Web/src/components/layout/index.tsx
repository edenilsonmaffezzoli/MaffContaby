import { useHttpClient } from '@/hooks/use-http-client';
import { logout, me } from '@/services/auth-service';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

function MenuIcon(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ChartIcon(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 20h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M7 20V12M12 20V8M17 20V4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function WalletIcon(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3.5 7.5A3.5 3.5 0 0 1 7 4h12a1 1 0 0 1 0 2H7a1.5 1.5 0 0 0 0 3h13.5v9A3.5 3.5 0 0 1 17 21H7A3.5 3.5 0 0 1 3.5 17.5v-10Z"
        stroke="currentColor" strokeWidth="2" strokeLinejoin="round"
      />
      <circle cx="17" cy="13" r="1.5" fill="currentColor" />
    </svg>
  );
}

function UploadIcon(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M7 8l5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 15v3a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ClockIcon(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 7v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function UsersIcon(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="2" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function FileTextIcon(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14 2H7a3 3 0 0 0-3 3v14a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V8l-6-6Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M14 2v6h6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M8 13h8M8 17h8M8 9h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function TagIcon(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 13l-7 7-11-11V2h7l11 11Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="7.5" cy="7.5" r="1.5" fill="currentColor" />
    </svg>
  );
}

function ChevronDownIcon(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LogoMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="32" r="28" stroke="rgba(255,255,255,0.9)" strokeWidth="3.5" />
      <path d="M18 46V36" stroke="var(--brand-aqua)" strokeWidth="4" strokeLinecap="round" />
      <path d="M32 46V26" stroke="var(--brand-aqua)" strokeWidth="4" strokeLinecap="round" />
      <path d="M46 46V18" stroke="var(--brand-aqua)" strokeWidth="4" strokeLinecap="round" />
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

  const meQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => me(httpClient),
    enabled: Boolean(token),
    retry: false,
  });

  const user = meQuery.data?.user ?? null;

  return (
    <div className="shell">
      <button
        className="sidebar-toggle"
        type="button"
        aria-label={isOpen ? 'Fechar menu' : 'Abrir menu'}
        onClick={() => setIsOpen(x => !x)}
      >
        {isOpen ? <CloseIcon className="icon-20" /> : <MenuIcon className="icon-20" />}
      </button>

      {isOpen ? <div className="sidebar-overlay" role="presentation" onClick={() => setIsOpen(false)} /> : null}

      <aside className={isOpen ? 'sidebar sidebar--open' : 'sidebar'} aria-label="Navegação principal">
        <div className="sidebar__inner">
          <div className="sidebar__brand">
            <div className="sidebar__brandmark">
              <LogoMark />
            </div>
            <div className="sidebar__brandtext">
              <div className="sidebar__brandname">MaffContaby</div>
              <div className="sidebar__brandsub">Gestão Contábil</div>
            </div>
          </div>

          <nav className="sidebar__nav" aria-label="Menu principal">
            <div className="sidebar__section-label">Menu</div>

            <button
              className={cadastroOpen ? 'sidelink sidelink--active' : 'sidelink'}
              type="button"
              aria-expanded={cadastroOpen}
              onClick={() => setIsCadastroOpen(x => !x)}
              style={{ background: 'transparent', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer' }}
            >
              <TagIcon className="icon-20" />
              <span style={{ flex: 1 }}>Cadastro</span>
              <ChevronDownIcon className={cadastroOpen ? 'icon-16 sidebar__chevron sidebar__chevron--open' : 'icon-16 sidebar__chevron'} />
            </button>

            {cadastroOpen ? (
              <div className="sidebar__submenu" role="presentation">
                <NavLink
                  to="/cadastro/pessoas"
                  className={({ isActive }) => (isActive ? 'sidelink sidelink--sub sidelink--active' : 'sidelink sidelink--sub')}
                  onClick={() => setIsOpen(false)}
                >
                  <span>Cadastro de Pessoa</span>
                </NavLink>
                <NavLink
                  to="/cadastro/grupos"
                  className={({ isActive }) => (isActive ? 'sidelink sidelink--sub sidelink--active' : 'sidelink sidelink--sub')}
                  onClick={() => setIsOpen(false)}
                >
                  <span>Cadastro de Grupo</span>
                </NavLink>
                <NavLink
                  to="/cadastro/competencias"
                  className={({ isActive }) => (isActive ? 'sidelink sidelink--sub sidelink--active' : 'sidelink sidelink--sub')}
                  onClick={() => setIsOpen(false)}
                >
                  <span>Cadastro de Competência</span>
                </NavLink>
              </div>
            ) : null}

            <NavLink
              to="/"
              end
              className={({ isActive }) => (isActive ? 'sidelink sidelink--active' : 'sidelink')}
              onClick={() => setIsOpen(false)}
            >
              <ChartIcon className="icon-20" />
              <span>Movimentações</span>
            </NavLink>
            <NavLink
              to="/financas"
              className={({ isActive }) => (isActive ? 'sidelink sidelink--active' : 'sidelink')}
              onClick={() => setIsOpen(false)}
            >
              <WalletIcon className="icon-20" />
              <span>Investimentos</span>
            </NavLink>
            <NavLink
              to="/relatorios"
              className={({ isActive }) => (isActive ? 'sidelink sidelink--active' : 'sidelink')}
              onClick={() => setIsOpen(false)}
            >
              <FileTextIcon className="icon-20" />
              <span>Relatórios</span>
            </NavLink>
            <NavLink
              to="/importar"
              className={({ isActive }) => (isActive ? 'sidelink sidelink--active' : 'sidelink')}
              onClick={() => setIsOpen(false)}
            >
              <UploadIcon className="icon-20" />
              <span>Importar</span>
            </NavLink>
            <NavLink
              to="/gdp"
              className={({ isActive }) => (isActive ? 'sidelink sidelink--active' : 'sidelink')}
              onClick={() => setIsOpen(false)}
            >
              <ClockIcon className="icon-20" />
              <span>Horários</span>
            </NavLink>
            <NavLink
              to="/usuarios"
              className={({ isActive }) => (isActive ? 'sidelink sidelink--active' : 'sidelink')}
              onClick={() => setIsOpen(false)}
            >
              <UsersIcon className="icon-20" />
              <span>Usuários</span>
            </NavLink>
          </nav>

          <div className="sidebar__footer">
            {user ? (
              <div className="sidebar__user">
                <div className="sidebar__user-label">Logado:</div>
                <div className="sidebar__user-name">{user.username}{user.admin ? ' (admin)' : ''}</div>
                <button
                  className="button button--ghost button--sm"
                  type="button"
                  onClick={async () => {
                    try {
                      await logout(httpClient);
                    } catch {
                    }
                    localStorage.removeItem('gdp_token');
                    localStorage.removeItem('gdp_admin_user');
                    navigate('/login', { replace: true });
                  }}
                >
                  Sair
                </button>
              </div>
            ) : null}
            <div>© 2026 MaffContaby</div>
            <div>Versão Web</div>
          </div>
        </div>
      </aside>

      <main className="shell__main">
        <div className="topbar">
          <span className="topbar__title">MaffContaby</span>
        </div>
        <div className={isGdpRoute ? 'container container--full' : 'container'}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
