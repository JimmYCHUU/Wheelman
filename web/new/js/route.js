// The new page's address: #/<section>/<chip>/<key>. The key (c:123) is encoded in the hash. A chip
// is one the section has (web/new/js/sections.js), else the section's first.
import { SECTIONS } from './model.js';
import { validChip } from './sections.js';

const decode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

export function parseRoute(hash) {
  const parts = String(hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
  const section = SECTIONS.some((s) => s.id === parts[0]) ? parts[0] : 'dashboard';
  const chip = validChip(section, parts[1]);
  return { section, chip, key: parts[2] ? decode(parts[2]) : null };
}

export function hashFor({ section = 'dashboard', chip = 'waiting', key = null } = {}) {
  return '#/' + section + '/' + chip + (key ? '/' + encodeURIComponent(key) : '');
}
