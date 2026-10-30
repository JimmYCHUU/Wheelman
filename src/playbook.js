// The sales playbook (voice/sales-playbook.md), split into its sections, and the few that fit one
// message. The compact prompt style sends those few instead of the whole playbook.

import path from 'node:path';
import { config } from './config.js';
import { versionsStamp } from './db.js';
import { voiceText, inPreview } from './wording.js';

const CACHE_MS = 60 * 1000;
let cache = { at: 0, file: '', stamp: -1, sections: null };

/**
 * The playbook's sections, one per line starting with "## ", with the sections saved in the
 * Playbook laid over the file (voiceText in src/wording.js). Read again after a minute, or at once
 * after a save; inside a preview, read afresh and not kept.
 */
export function playbookSections() {
  const file = path.join(config.voiceDir, 'sales-playbook.md');
  const cached = !inPreview();
  const stamp = versionsStamp();
  if (cached && cache.sections && cache.file === file && cache.stamp === stamp && Date.now() - cache.at < CACHE_MS) return cache.sections;
  const raw = voiceText('sales-playbook.md') ?? '';
  const sections = [];
  let current = null;
  for (const line of raw.split('\n')) {
    if (line.startsWith('## ')) {
      current = { heading: line.slice(3).trim(), lines: [] };
      sections.push(current);
    } else if (current) current.lines.push(line);
  }
  const out = sections.map((s) => ({ heading: s.heading, body: s.lines.join('\n').trim() }));
  if (cached) cache = { at: Date.now(), file, stamp, sections: out };
  return out;
}

/** The section for each situation; buildPrompt works out which situation a message is in. */
export const SECTION_FOR = {
  complaint: 'Complaints are held',
  price: 'The price question',
  inspection: 'Inviting an inspection',
  far: 'The far-away customer',
  hold: 'Holding the car: the deposit is the only urgency',
  gone: 'The sold or reserved car',
  not_at_showroom: 'A car that is not at the showroom yet',
  after_sale: 'After the sale',
  no: 'Accepting a no',
  import: 'Imports: trust documents first',
};
const ALWAYS = 'Where the customer is, and the move';
const WORDS = 'Words that end a conversation, and words we never use';
export const PLAYBOOK_MAX = 3500;

const paragraphs = (body) => body.split(/\n\s*\n/).map((p) => p.replace(/\s+$/, '')).filter((p) => p.trim());
const isTable = (p) => p.trimStart().startsWith('|');
// A paragraph about Facebook Marketplace is for a Marketplace chat only.
const forChannel = (list, channel) => (channel === 'marketplace' ? list : list.filter((p) => !/^On Facebook Marketplace\b/.test(p.trim())));

/**
 * "Where the customer is, and the move" without its table of moves: THIS CUSTOMER'S NEXT STEP
 * already gives this message's move. The line that leads into the table goes with it.
 */
function withoutTables(list) {
  return list.filter((p, i) => !isTable(p) && !(/:\s*$/.test(p) && list[i + 1] && isTable(list[i + 1])));
}

const render = (heading, list) => `## ${heading}\n${list.join('\n\n')}`;

/**
 * The selling advice for one message: "Where the customer is, and the move", the one section for
 * its situation (SECTION_FOR; with none, the rung decides: a customer ready to commit gets the
 * deposit section, a buyer the after-sale one), and the words we never use. At most PLAYBOOK_MAX
 * characters: when the three are longer, whole paragraphs are dropped from the end of the
 * situation's section until they fit, so its first paragraph always stays.
 */
export function playbookFor({ situation = '', rung = '', channel = 'sms' } = {}) {
  const sections = playbookSections();
  const find = (heading) => sections.find((s) => s.heading === heading);
  const key = SECTION_FOR[situation] ? situation : rung === 'commit' ? 'hold' : rung === 'buyer' ? 'after_sale' : '';
  const always = find(ALWAYS);
  const special = key ? find(SECTION_FOR[key]) : null;
  const words = find(WORDS);

  const head = always ? render(always.heading, withoutTables(forChannel(paragraphs(always.body), channel))) : '';
  const tail = words ? render(words.heading, forChannel(paragraphs(words.body), channel)) : '';
  const join = (middle) => [head, middle, tail].filter(Boolean).join('\n\n');
  if (!special) return join('');

  const list = forChannel(paragraphs(special.body), channel);
  let n = list.length;
  while (n > 1 && join(render(special.heading, list.slice(0, n))).length > PLAYBOOK_MAX) n--;
  return join(render(special.heading, list.slice(0, n)));
}
