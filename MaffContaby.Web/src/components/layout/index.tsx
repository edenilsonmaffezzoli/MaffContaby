import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

function MenuIcon(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M16 13h4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function UploadIcon(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M7 8l5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 21h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Layout() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="shell">
      <button
        className="sidebar-toggle"
        type="button"
        aria-label={isOpen ? 'Fechar menu' : 'Abrir menu'}
        onClick={() => setIsOpen(x => !x)}
      >
        {isOpen ? <CloseIcon className="icon-24" /> : <MenuIcon className="icon-24" />}
      </button>

      {isOpen ? <div className="sidebar-overlay" role="presentation" onClick={() => setIsOpen(false)} /> : null}

      <aside className={isOpen ? 'sidebar sidebar--open' : 'sidebar'} aria-label="Navegação">
        <div className="sidebar__inner">
          <div className="sidebar__brand">
            <span className="sidebar__brandmark" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="14" cy="14" r="13" stroke="currentColor" strokeWidth="2" opacity="0.9" />
                <path d="M9 18.5V15.5M13 18.5V12.5M17 18.5V10.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M8.8 19.2H19.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.9" />
              </svg>
            </span>
            <div className="sidebar__brandtext">
              <div className="sidebar__brandname">MaffContaby</div>
              <div className="sidebar__brandsub">Gestão Contábil</div>
            </div>
          </div>

          <nav className="sidebar__nav">
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
              <span>Finanças</span>
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
        <div className="container">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
