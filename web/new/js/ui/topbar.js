// The bar across the top: the mark, the four sections, what Wheelman is doing, and the menu.
import { html, useState, useEffect } from './html.js';
import { SECTIONS, statusWords } from '../model.js';

const THEME_KEY = 'wheelman.new.theme';
const THEMES = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'Follow the computer' },
];

export function readTheme(storage = globalThis.localStorage) {
  try { const v = storage.getItem(THEME_KEY); return THEMES.some((t) => t.id === v) ? v : 'system'; } catch { return 'system'; }
}

/** Sets data-theme on <html> (removed for "Follow the computer") and remembers the choice. */
export function applyTheme(theme, storage = globalThis.localStorage) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', theme);
  try { storage.setItem(THEME_KEY, theme); } catch { /* storage may be blocked */ }
}

function Menu({ theme, onTheme, onClose }) {
  useEffect(() => {
    const away = (e) => { if (!e.target.closest('.menu-wrap')) onClose(); };
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('click', away);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('click', away); document.removeEventListener('keydown', key); };
  }, []);
  return html`<div class="menu" role="menu">
    <h2>Theme</h2>
    ${THEMES.map((t) => html`<button type="button" role="menuitemradio" aria-checked=${theme === t.id} onClick=${() => onTheme(t.id)}>
      <span class="tick" aria-hidden="true">${theme === t.id ? '✓' : ''}</span>${t.label}
    </button>`)}
    <hr />
    <a role="menuitem" href="/">Old page</a>
  </div>`;
}

export function TopBar({ state, tab, onTab, now }) {
  const [menu, setMenu] = useState(false);
  const [theme, setTheme] = useState(readTheme);
  const status = statusWords(state.status, now);
  const choose = (id) => { setTheme(id); applyTheme(id); };
  return html`<header class="tile topbar" role="banner">
    <div class="brand">
      <svg class="mark" aria-hidden="true"><use href="../assets/brand.svg#mark"></use></svg>
      <h1 class="brand-word">WHEELMAN</h1>
    </div>
    <nav class="tabs" aria-label="Sections">
      <div class="tab-track" role="tablist">
        ${SECTIONS.map((s) => {
          const n = (state.unread && state.unread[s.id]) || 0;
          return html`<button type="button" class="tab" role="tab" aria-selected=${tab === s.id} onClick=${() => onTab(s.id)}>
            ${s.label}${n > 0 ? html`<span class="badge" aria-label=${n + ' unread'}>${n}</span>` : null}
          </button>`;
        })}
      </div>
    </nav>
    <div class="status" title=${status.text}>
      <span class=${'dot ' + status.tone}></span><span class="words">${status.text}</span>
    </div>
    <div class="menu-wrap">
      <button type="button" class="btn quiet" aria-haspopup="true" aria-expanded=${menu} onClick=${() => setMenu(!menu)}>Menu</button>
      ${menu ? html`<${Menu} theme=${theme} onTheme=${choose} onClose=${() => setMenu(false)} />` : null}
    </div>
  </header>`;
}
