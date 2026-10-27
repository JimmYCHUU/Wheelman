// The panel's Customer tab: who they are, where they came from, how far they have got (the stage
// line), and what our records said that shaped the reply without being stated. The old page's
// Customer tab (web/app.js customerSections) in the new page's components.
import { html } from './html.js';
import { stageLine, leadStatusWords, sourceWords } from '../model.js';
import { Asked } from './cartab.js';

/** A row of the customer's details; nothing at all when the value is not known. */
const row = (label, value) => (value ? [html`<dt key=${label}>${label}</dt>`, html`<dd key=${label + '='}>${value}</dd>`] : null);

/** The five steps, the current one in words and colour, then where that was read from. */
function Stage({ item }) {
  const line = stageLine(item);
  const now = line.steps[line.current];
  return html`<section class="car-sec"><h4>How far they have got</h4>
    <ol class="stage">${line.steps.map((step, i) => html`<li key=${step} class=${i < line.current ? 'done' : i === line.current ? 'now' : ''}
      aria-current=${i === line.current ? 'step' : null}>${step}${i === line.current ? html`<span class="stage-now"> · now</span>` : null}</li>`)}</ol>
    <p class="fine">Now: ${now}.${line.source ? ' ' + line.source + '.' : ' Nothing on file says more yet.'}</p>
  </section>`;
}

/**
 * item: the open conversation; act: { copyNumber(), copyEmail() }, which copy the open
 * conversation's number and address and say so in a toast.
 */
export function CustomerTab({ item, act }) {
  const d = item.draft && item.draft.status === 'ready' ? item.draft : null;
  const insider = d && Array.isArray(d.insiderUsed) ? d.insiderUsed : [];
  const name = item.name || item.firstName || '';
  // The stage line is for conversations: not an auction order, and not a number with neither a record nor a sale.
  const stage = !item.order && (!item.noLead || !!item.deal);
  const copy = (value, what, run) => html`<button type="button" class="link-btn" title=${'Click to copy the ' + what}
    aria-label=${'Copy the ' + what + ' ' + value} onClick=${run}>${value}</button>`;
  return html`
    <section class="car-sec">
      <h3 class="car-name">${name || item.phone || item.email || 'This customer'}</h3>
      <dl class="asked">
        ${row('Phone', item.phone ? copy(item.phone, 'number', act.copyNumber) : '')}
        ${row('Email', item.email ? copy(item.email, 'email address', act.copyEmail) : '')}
        ${row('Came from', sourceWords(item.source))}
        ${row('Lives in', item.location)}
        ${row('Lead status', leadStatusWords(item.leadStatus))}
      </dl>
      ${item.noLead ? html`<p class="fine">No customer record. This number has no customer in the dashboard.</p>` : null}
    </section>
    ${item.looking ? html`<section class="car-sec"><h4>Asking about</h4><${Asked} looking=${item.looking} /></section>` : null}
    ${stage ? html`<${Stage} item=${item} />` : null}
    ${insider.length ? html`<section class="car-sec"><h4>Shaped the reply, never stated</h4>
      <ul class="included">${insider.map((x) => html`<li key=${x}>${x}</li>`)}</ul>
      <p class="fine">Wheelman used what our records show to choose what to say. It does not say any of it to the customer.</p>
    </section>` : null}`;
}
