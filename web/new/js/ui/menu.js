// A button that opens a short list of actions (the conversation's "More"). It closes on a choice, on
// Escape and on a click anywhere else; the arrow keys move between the choices.
import { html, useState, useEffect, useRef } from './html.js';

/** items: [{ label, hint?, run }]. A choice with no run is left out, so callers can write `cond && item`. */
export function MenuButton({ label, items }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const choices = items.filter((i) => i && i.run);

  useEffect(() => {
    if (!open) return undefined;
    const first = wrap.current && wrap.current.querySelector('[role="menuitem"]');
    if (first) first.focus();
    const away = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    const key = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        const button = wrap.current && wrap.current.querySelector('[aria-haspopup]');
        if (button) button.focus();
      }
    };
    document.addEventListener('click', away);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('click', away); document.removeEventListener('keydown', key); };
  }, [open]);

  const move = (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const all = [...wrap.current.querySelectorAll('[role="menuitem"]')];
    const at = all.indexOf(document.activeElement);
    const to = e.key === 'ArrowDown' ? (at + 1) % all.length : (at - 1 + all.length) % all.length;
    all[to].focus();
  };
  const choose = (item) => { setOpen(false); item.run(); };

  if (!choices.length) return null;
  return html`<div class="menu-wrap" ref=${wrap}>
    <button type="button" class="btn quiet" aria-haspopup="true" aria-expanded=${open} onClick=${() => setOpen(!open)}>${label}</button>
    ${open ? html`<div class="menu" role="menu" onKeyDown=${move}>
      ${choices.map((i) => html`<button type="button" role="menuitem" key=${i.label} onClick=${() => choose(i)}>
        <span class="menu-text">${i.label}${i.hint ? html`<small>${i.hint}</small>` : null}</span>
      </button>`)}
    </div>` : null}
  </div>`;
}
