// The one small label: "Dismissed", "Phone only", "Check the reply", "In progress". Its tone says
// how much it matters; its words say what it is. Nothing else on the page labels things this way.
import { h } from '../lib/h.js';

/** Tag({ text: 'Blank to fill', tone: 'warning' }). Tones: neutral, warning, danger, info, success. */
export function Tag({ text, tone = 'neutral', title = null }) {
  return h('span', { class: `tag ${tone}`, text, title });
}
