// A button that opens a short list of choices (the conversation's "More", the top bar's "Menu"). Enter or
// Space opens it and puts focus on the first choice; the arrow keys, Home and End move between choices;
// Escape, a choice, Tab or a click anywhere else closes it, and Escape or a choice returns focus to the button.
import { html, useState, useEffect, useRef } from './html.js';

const CHOICE = '[role="menuitem"], [role="menuitemradio"]';

/**
 * items: [{ label, hint?, run }] a choice;
 *        [{ label, checked, run }] a choice of one among several (checked says which is in use);
 *        [{ label, href }] a link; { heading } a title; { separator: true } a rule.
 * A choice with no run, link, heading or separator is left out, so callers can write `cond && item`.
 */
export function MenuButton({ label, items }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const shown = items.filter((i) => i && (i.run || i.href || i.heading || i.separator));
  const hasChoice = shown.some((i) => i.run || i.href);
  const button = () => wrap.current && wrap.current.querySelector('[aria-haspopup]');

  useEffect(() => {
    if (!open) return undefined;
    const first = wrap.current && wrap.current.querySelector(CHOICE);
    if (first) first.focus();
    const away = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    const key = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        const b = button();
        if (b) b.focus();
      }
    };
    document.addEventListener('click', away);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('click', away); document.removeEventListener('keydown', key); };
  }, [open]);

  const move = (e) => {
    if (e.key === 'Tab') { setOpen(false); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const all = [...wrap.current.querySelectorAll(CHOICE)];
    const at = all.indexOf(document.activeElement);
    let to;
    if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = all.length - 1;
    else to = e.key === 'ArrowDown' ? (at + 1) % all.length : (at - 1 + all.length) % all.length;
    all[to].focus();
  };
  const choose = (item) => {
    setOpen(false);
    const b = button();
    if (b) b.focus();
    item.run();
  };

  if (!hasChoice) return null;
  return html`<div class="menu-wrap" ref=${wrap}>
    <button type="button" class="btn quiet" aria-haspopup="menu" aria-expanded=${open} onClick=${() => setOpen(!open)}>${label}</button>
    ${open ? html`<div class="menu" role="menu" aria-label=${label} onKeyDown=${move}>
      ${shown.map((i, n) => {
        if (i.separator) return html`<hr key=${'rule' + n} role="separator" />`;
        if (i.heading) return html`<h2 key=${i.heading} role="presentation">${i.heading}</h2>`;
        if (i.href) return html`<a key=${i.label} role="menuitem" href=${i.href}>${i.label}</a>`;
        const radio = i.checked !== undefined;
        return html`<button type="button" key=${i.label} role=${radio ? 'menuitemradio' : 'menuitem'} aria-checked=${radio ? i.checked : null} onClick=${() => choose(i)}>
          ${radio ? html`<span class="tick" aria-hidden="true">${i.checked ? '✓' : ''}</span>` : null}
          <span class="menu-text">${i.label}${i.hint ? html`<small>${i.hint}</small>` : null}</span>
        </button>`;
      })}
    </div>` : null}
  </div>`;
}
