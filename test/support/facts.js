// Invented business facts for the tests and the preview: a scratch folder holding business-facts.md,
// so nothing that reads business facts there ever reads the real facts file. No figures and no names.
// Point the app at it with `config.knowledgeDir = inventedFacts()`.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** The topics, in the file's order, as loadBusinessFacts reads them. */
export const INVENTED_FACTS = [
  { title: 'Opening hours', status: 'confirmed', answer: 'Open every day of the week.' },
  { title: 'Holding deposit', status: 'confirmed', answer: 'A refundable holding deposit takes a car off the market.' },
  { title: 'Roof racks', status: 'working', answer: 'We can fit roof racks before pickup; a person quotes the cost.' },
  { title: 'Tinted windows', status: 'needs_answer', answer: '' },
  { title: 'Car covers', status: 'needs_answer', answer: '' },
];

const STATUS_LINE = { confirmed: 'CONFIRMED', working: 'WORKING', needs_answer: 'NEEDS ANSWER' };

/** Makes a scratch folder under the system's temporary folder with business-facts.md in it, and returns its path. */
export function inventedFacts(facts = INVENTED_FACTS) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wheelman-test-facts-'));
  const topics = facts.map((f) => `## ${f.title}\nStatus: ${STATUS_LINE[f.status]}\nAnswer: ${f.answer}\n`).join('\n');
  fs.writeFileSync(path.join(dir, 'business-facts.md'), `# Business facts (invented, for the tests)\n\nEvery topic here is made up.\n\n---\n\n${topics}`);
  return dir;
}
