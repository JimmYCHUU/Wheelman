// The message that appears for a few seconds ("Copied", "Dismissed"), with its one action if it has one.
import { html } from './html.js';

export function Toast({ toast }) {
  if (!toast) return null;
  return html`<div class="toast" role="status" aria-live="polite">
    <span>${toast.message}</span>
    ${toast.action ? html`<button class="btn small" type="button" onClick=${toast.action.run}>${toast.action.label}</button>` : null}
  </div>`;
}
