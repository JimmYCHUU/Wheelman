// Initials in a coloured disc, the same colour for the same name every time; a person icon when
// there is no name.
import { h } from '../lib/h.js';
import { icon } from '../lib/icons.js';
import { initials, hue } from '../lib/format.js';

/** Avatar({ name: 'Priya Raman', size: 'md' }). Sizes: sm, md, lg. */
export function Avatar({ name, size = 'md' }) {
  const text = initials(name);
  const cls = `avatar ${size === 'sm' ? 'small' : size === 'lg' ? 'large' : ''}`.trim();
  if (!text) return h('span', { class: cls, 'aria-hidden': 'true' }, icon('user'));
  return h('span', { class: `${cls} h${hue(name)}`, 'aria-hidden': 'true', text });
}
