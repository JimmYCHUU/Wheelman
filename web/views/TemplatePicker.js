// "Which message?": the owner's templates that fit this conversation, to write the suggestion
// from. Picking one writes it (fitted to the customer), or shows it again when it was written
// before. Used in every section: an auction order's messages, and the templates that fit any
// other conversation (voice/*-messages.md).
import { h } from '../lib/h.js';

/**
 * The options, in the order given: the first choice (nothing picked yet, or a reply to what they
 * wrote), then each template, the one that is due marked "(due now)" and the one that fits the
 * conversation best "(best fit)".
 * templates: [{ id, label, due?, best? }]
 */
export function pickerOptions(templates, { first = 'Choose a message' } = {}) {
  return [{ value: '', text: first }, ...(templates || []).map((tpl) => ({ value: tpl.id, text: tpl.due ? `${tpl.label} (due now)` : tpl.best ? `${tpl.label} (best fit)` : tpl.label }))];
}

/** The labelled select. `onPick(id)` is called with the template chosen ('' for the first choice). */
export function TemplatePicker({ templates, value = '', first, onPick, label = 'Which message?' }) {
  const select = h('select', { class: 'pick', 'aria-label': 'Which message to write' },
    pickerOptions(templates, { first }).map((o) => h('option', { value: o.value, text: o.text })));
  select.value = value;
  select.addEventListener('change', () => onPick(select.value));
  return h('label', { class: 'pick-label' }, h('span', { text: label }), select);
}
