// The trust line under the message box: one sentence that opens a list of the facts it counted,
// each with where it came from. Colour never stands alone: the words say it too.
import { html, useState } from './html.js';
import { factLine } from '../model.js';

export function Trust({ line }) {
  const [open, setOpen] = useState(false);
  const facts = line.facts || [];
  if (!facts.length) return html`<p class=${'check ' + line.tone}>${line.text}</p>`;
  return html`<div class=${'trust ' + line.tone}>
    <button type="button" class="trust-line" aria-expanded=${open} aria-controls="trust-facts" onClick=${() => setOpen(!open)}>
      <span>${line.text}</span><span class="trust-more">${open ? 'Hide' : 'Show where from'}</span>
    </button>
    ${open ? html`<ul id="trust-facts" class="trust-facts" role="region" aria-label="Where each fact came from">
      ${facts.map((f, i) => html`<li key=${i} class=${f.ok === false ? 'bad' : ''}>${factLine(f)}</li>`)}
    </ul>` : null}
  </div>`;
}
