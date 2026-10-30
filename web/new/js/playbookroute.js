// The Playbook's address: #/playbook/<tab>, and #/playbook/<tab>/<id> for one entry on it (a fact by
// its title). The id is encoded in the hash. It imports nothing, so anything may build the address.

export const PLAYBOOK_TABS = ['lessons', 'facts', 'templates', 'voice'];

const decode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

/** { tab, id } for a Playbook address (an unknown tab is Lessons; id null when there is none), else null. */
export function playbookRoute(hash) {
  const parts = String(hash || '').replace(/^#\/?/, '').split('/');
  if (parts[0] !== 'playbook') return null;
  const tab = PLAYBOOK_TABS.includes(parts[1]) ? parts[1] : 'lessons';
  return { tab, id: parts[2] ? decode(parts[2]) : null };
}

/** The address of a Playbook tab, or of one entry on it. */
export function playbookHash(tab, id) {
  return '#/playbook/' + tab + (id ? '/' + encodeURIComponent(id) : '');
}
