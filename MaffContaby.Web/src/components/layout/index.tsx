import { useMemo, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

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
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
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
      <path
        d="M3 15v3a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LogoMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="32" r="28" stroke="rgba(255,255,255,0.9)" strokeWidth="3.5" />
      <path d="M18 46V36" stroke="#4CAF50" strokeWidth="4" strokeLinecap="round" />
      <path d="M32 46V26" stroke="#4CAF50" strokeWidth="4" strokeLinecap="round" />
      <path d="M46 46V18" stroke="#4CAF50" strokeWidth="4" strokeLinecap="round" />
      <path d="M15 48H49" stroke="rgba(255,255,255,0.9)" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

export function Layout() {
  const [isOpen, setIsOpen] = useState(false);
  const [isKeyOpen, setIsKeyOpen] = useState(false);
  const [writeKey, setWriteKey] = useState(() => localStorage.getItem('maff_write_key') ?? '');

  const envKey = ((import.meta.env.VITE_WRITE_KEY as string | undefined) ?? '').trim();
  const effectiveKey = (writeKey.trim() || envKey).trim();
  const hasWriteKey = Boolean(effectiveKey);

  const keyBadge = useMemo(() => {
    if (writeKey.trim()) return 'Chave: definida';
    if (envKey) return 'Chave: via env';
    return 'Chave: necessária';
  }, [envKey, writeKey]);

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
            <div className="sidebar__footer-actions">
              <button
                className={hasWriteKey ? 'sidebar__keybtn sidebar__keybtn--ok' : 'sidebar__keybtn'}
                type="button"
                onClick={() => setIsKeyOpen(true)}
              >
                {keyBadge}
              </button>
            </div>
          </div>
        </div>
      </aside>

      <main className="shell__main">
        <div className="topbar">
          <span className="topbar__title">MaffContaby</span>
          <button
            className={hasWriteKey ? 'topbar__keybtn topbar__keybtn--ok' : 'topbar__keybtn'}
            type="button"
            onClick={() => setIsKeyOpen(true)}
          >
            {keyBadge}
          </button>
        </div>
        <div className="container">
          <Outlet />
        </div>
      </main>

      {isKeyOpen ? (
        <div className="modal-overlay" role="presentation" onClick={() => setIsKeyOpen(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Definir chave de escrita"
            onClick={e => e.stopPropagation()}
          >
            <div className="modal__header">
              <div className="modal__title">Chave de escrita</div>
              <button className="button button--ghost button--sm" type="button" onClick={() => setIsKeyOpen(false)}>
                Fechar
              </button>
            </div>

            <div className="modal__body">
              <div className="muted" style={{ marginBottom: 12 }}>
                Necessária para operações de salvar/importar/excluir. A chave fica salva apenas neste navegador.
              </div>

              <div className="field">
                <label className="label">Chave</label>
                <input
                  className="input"
                  type="password"
                  value={writeKey}
                  onChange={e => setWriteKey(e.target.value)}
                  placeholder={envKey ? 'Definida via env (opcional)' : 'Digite a chave'}
                />
              </div>

              <div className="modal__actions">
                <button
                  className="button button--primary"
                  type="button"
                  onClick={() => {
                    const v = writeKey.trim();
                    if (v) localStorage.setItem('maff_write_key', v);
                    if (!v) localStorage.removeItem('maff_write_key');
                    setWriteKey(v);
                    setIsKeyOpen(false);
                  }}
                >
                  Salvar
                </button>
                <button
                  className="button button--danger"
                  type="button"
                  onClick={() => {
                    localStorage.removeItem('maff_write_key');
                    setWriteKey('');
                    setIsKeyOpen(false);
                  }}
                >
                  Limpar
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
