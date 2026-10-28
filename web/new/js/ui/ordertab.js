// The panel's Order tab, for an auction order in place of the Car tab: the order, what they asked
// for from Japan, the auction car, the car secured, what has been charged and paid, and where their
// own texts are answered (web/new/js/orderview.js orderSections, the old page's orderInfo).
import { html } from './html.js';
import { orderSections } from '../orderview.js';

/** order: the open order (item.order); act: { moveTexts(section) }, Their texts' button. */
export function OrderTab({ order, now, act }) {
  return orderSections(order, now).map((s) => html`<section class="car-sec" key=${s.title}>
    <h4>${s.title}</h4>
    ${s.rows.length || s.link ? html`<dl class="asked">
      ${s.rows.map(([label, value], i) => [html`<dt key=${'t' + i}>${label}</dt>`, html`<dd key=${'d' + i}>${value}</dd>`])}
      ${s.link ? [html`<dt key="lt">${s.link.label}</dt>`, html`<dd key="ld"><a href=${s.link.url} target="_blank" rel="noopener noreferrer">${s.link.text}</a></dd>`] : null}
    </dl>` : null}
    ${s.notes.map((n, i) => html`<p class="fine" key=${'n' + i}>${n}</p>`)}
    ${s.move ? html`<div><button type="button" class="btn small" onClick=${() => act.moveTexts(s.move.section)}>${s.move.label}</button></div>` : null}
  </section>`);
}
