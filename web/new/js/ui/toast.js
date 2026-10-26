// The message that appears for a few seconds ("Copied", "Dismissed"), with its one action if it has one.
// The live region is always on the page, so a screen reader hears the message when it arrives.
import { html } from './html.js';

export function Toast({ toast }) {
  return html`<div class="toast-region" role="status" aria-live="polite">
    ${toast ? html`<div class="toast">
      <span>${toast.message}</span>
      ${toast.action ? html`<button class="btn small" type="button" onClick=${toast.action.run}>${toast.action.label}</button>` : null}
    </div>` : null}
  </div>`;
}
