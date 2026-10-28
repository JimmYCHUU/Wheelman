// The message that appears for a few seconds ("Copied", "Dismissed"), with its one action if it has one.
// The live region is always on the page, so a screen reader hears the message when it arrives.
import { html } from './html.js';

export function Toast({ toast }) {
  // An action with an address (Open a chat) goes there as a row does: the address moves, the store follows.
  const press = () => {
    const href = toast.action.href;
    toast.action.run();
    if (href) location.hash = href;
  };
  return html`<div class="toast-region" role="status" aria-live="polite">
    ${toast ? html`<div class="toast">
      <span>${toast.message}</span>
      ${toast.action ? html`<button class="btn small" type="button" onClick=${press}>${toast.action.label}</button>` : null}
    </div>` : null}
  </div>`;
}
