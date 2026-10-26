// The bar across the top: the mark, the four sections, what Wheelman is doing, and the menu.
import { html, useState, useEffect, useRef } from './html.js';
import { SECTIONS, statusWords, statusAnnouncement } from '../model.js';
import { MenuButton } from './menu.js';

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

/** The status words stay as plain text; a hidden live region says them only when the tone changes or a problem does. */
function StatusLive({ status }) {
  const seen = useRef(null);
  const [said, setSaid] = useState('');
  useEffect(() => {
    const next = statusAnnouncement(seen.current, status);
    seen.current = status;
    if (next !== null) setSaid(next);
  }, [status.tone, status.text]);
  return html`<span class="sr" role="status" aria-live="polite">${said}</span>`;
}

export function TopBar({ state, tab, onTab, now }) {
  const [theme, setTheme] = useState(readTheme);
  const status = statusWords(state.status, now);
  const choose = (id) => { setTheme(id); applyTheme(id); };
  return html`<header class="tile topbar" role="banner">
    <div class="brand">
      <svg class="mark" aria-hidden="true"><use href="../assets/brand.svg#mark"></use></svg>
      <h1 class="brand-word">WHEELMAN</h1>
    </div>
    <nav class="tabs" aria-label="Sections">
      <div class="tab-track">
        ${SECTIONS.map((s) => {
          const n = (state.unread && state.unread[s.id]) || 0;
          return html`<button type="button" class="tab" aria-current=${tab === s.id ? 'page' : null} onClick=${() => onTab(s.id)}>
            ${s.label}${n > 0 ? html`<span class="badge">${n}<span class="sr"> unread</span></span>` : null}
          </button>`;
        })}
      </div>
    </nav>
    <div class=${'status ' + status.tone}>
      <span class=${'dot ' + status.tone} aria-hidden="true"></span><span class="words">${status.text}</span><${StatusLive} status=${status} />
    </div>
    <${MenuButton} label="Menu" items=${[
      { heading: 'Theme' },
      ...THEMES.map((t) => ({ label: t.label, checked: theme === t.id, run: () => choose(t.id) })),
      { separator: true },
      { label: 'Old page', href: '/' },
    ]} />
  </header>`;
}
