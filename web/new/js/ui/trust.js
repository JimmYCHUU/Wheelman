// The trust line under the message box: one sentence that opens a list of the facts it counted,
// each with where it came from, and the business facts the suggestion used. Colour never stands
// alone: the words say it too. Above the box, FactAsk: a business fact the reply left a blank for.
import { html, useState } from './html.js';
import { factLine, factAsk } from '../trustview.js';

export function Trust({ line, id }) {
  const [open, setOpen] = useState(false);
  const facts = line.facts || [];
  const listId = 'trust-facts-' + id;
  if (!facts.length) return html`<p class=${'check ' + line.tone}>${line.text}</p>`;
  const now = Date.now();
  return html`<div class=${'trust ' + line.tone}>
    <button type="button" class="trust-line" aria-expanded=${open} aria-controls=${listId} onClick=${() => setOpen(!open)}>
      <span>${line.text}</span><span class="trust-more">${open ? 'Hide' : 'Show where from'}</span>
    </button>
    ${open ? html`<div id=${listId} role="region" aria-label="Where each fact came from">
      <ul class="trust-facts">
        ${facts.map((f, i) => html`<li key=${i} class=${f.ok === false ? 'bad' : ''}>${factLine(f, now)}</li>`)}
      </ul>
    </div>` : null}
  </div>`;
}

/**
 * A business fact with no answer that the reply left a blank for: Answer it opens it in the
 * Playbook. Once it is answered the line says so, and Write it again writes the reply with the
 * answer, offered only while nothing is typed in the box. Nothing is written again by itself.
 */
export function FactAsk({ item, typed, actions, locked = false }) {
  const ask = factAsk(item, typed);
  if (!ask) return null;
  return html`<div class=${'context' + (ask.answered ? ' info' : '')} role="status"><span>${ask.words}</span>
    ${!ask.answered ? html`<a class="btn small" href=${ask.href}>Answer it</a>`
      : ask.rewrite ? html`<button type="button" class="btn small" disabled=${locked} onClick=${() => actions.write({})}>Write it again</button>` : null}
  </div>`;
}
