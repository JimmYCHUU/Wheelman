// "Which message?": the owner's templates that fit this conversation, to write the suggestion
// from. Picking one writes it (fitted to the customer), or shows it again when it was written
// before. Used by the Auction section's order bar; the other sections use it once they have
// templates of their own.
import { h } from '../lib/h.js';

/**
 * The options, in the order given: the first choice (nothing picked yet, or a reply to what they
 * wrote), then each template, the one that is due marked "(due now)".
 * templates: [{ id, label, due? }]
 */
export function pickerOptions(templates, { first = 'Choose a message' } = {}) {
  return [{ value: '', text: first }, ...(templates || []).map((tpl) => ({ value: tpl.id, text: tpl.due ? `${tpl.label} (due now)` : tpl.label }))];
}

/** The labelled select. `onPick(id)` is called with the template chosen ('' for the first choice). */
export function TemplatePicker({ templates, value = '', first, onPick, label = 'Which message?' }) {
  const select = h('select', { class: 'pick', 'aria-label': 'Which message to write' },
    pickerOptions(templates, { first }).map((o) => h('option', { value: o.value, text: o.text })));
  select.value = value;
  select.addEventListener('change', () => onPick(select.value));
  return h('label', { class: 'pick-label' }, h('span', { text: label }), select);
}
