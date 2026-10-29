// What Wheelman looked up for an import email, under the message box: closed until opened.
import { html } from './html.js';
import { researchView } from '../emailview.js';

export function Research({ research }) {
  const v = researchView(research);
  if (!v) return null;
  const list = (items) => html`<ul class="facts">${items.map((f, i) => html`<li key=${i}>${f}</li>`)}</ul>`;
  return html`<details class="research"><summary>What Wheelman looked up (${v.count})</summary>
    ${v.found.length ? list(v.found) : html`<p class="fine">No model could be matched to this email.</p>`}
    ${v.notFound.length ? html`<p class="fine">Could not be found (the reply has a blank for each):</p>${list(v.notFound)}` : null}
    ${v.notes.length ? list(v.notes) : null}
    ${v.sources.length ? html`<p class="fine">Read from: ${v.sources.map((s, i) => html`${i ? ', ' : ''}<a key=${s.url} href=${s.url} target="_blank" rel="noopener noreferrer">${s.label}</a>`)}</p>` : null}
    ${v.when ? html`<p class="fine">${v.when}</p>` : null}
  </details>`;
}
