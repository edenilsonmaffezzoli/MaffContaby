import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

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
      <circle cx="32" cy="32" r="28" stroke="rgba(255,255,255,0.9)" strokeWidth="3.5"/>
      <path d="M18 46V36" stroke="#4CAF50" strokeWidth="4" strokeLinecap="round"/>
      <path d="M32 46V26" stroke="#4CAF50" strokeWidth="4" strokeLinecap="round"/>
      <path d="M46 46V18" stroke="#4CAF50" strokeWidth="4" strokeLinecap="round"/>
      <path d="M15 48H49" stroke="rgba(255,255,255,0.9)" strokeWidth="3.5" strokeLinecap="round"/>
    </svg>
  );
}

export function Layout() {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isCadastroOpen, setIsCadastroOpen] = useState(false);

  const isCadastroRoute = location.pathname.startsWith('/cadastro');
  const cadastroOpen = isCadastroOpen || isCadastroRoute;

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
          </nav>

          <div className="sidebar__footer">
            <div>© 2026 MaffContaby</div>
            <div>Versão Web</div>
          </div>
        </div>
      </aside>

      <main className="shell__main">
        <div className="topbar">
          <span className="topbar__title">MaffContaby</span>
        </div>
        <div className="container">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
