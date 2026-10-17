// Writes the suggestion for one of the owner's templates, filled in already (composed), and keeps
// it under that template: each template has its own suggestion. Shared by the auction messages
// (src/ordermessages.js) and the other sections' templates (src/sectiontemplates.js).
//
// With `fitWith` (draftFor in src/drafter.js, passed in so the modules do not import each other)
// the template is fitted to the customer by the AI with every fact kept out of its hands
// (src/fitter.js), and an `instruction` (the owner's Prompt, Rewrite or "Add what you know") is
// given to the AI with it. The same wording written again with the same instruction (new facts
// only, or Refresh figures) uses the earlier fitting with no request. Without `fitWith`, or when
// fitting gives nothing usable, the owner's wording is written as it stands: never a refusal.

import { insertDraft, latestDraft } from './db.js';
import { maskTemplate } from './fitter.js';
import { restore } from './redact.js';
import { unfilled } from './templates.js';
import { tagMarketplaceLinks } from './marketplace.js';
import { logLine } from './log.js';

const BLANK = /\[[A-Z][A-Z0-9 &'/-]{1,30}\?\]/g;

/**
 * @param composed { text, part, values, tail }: the template filled in (see maskTemplate)
 * @param checks   the template's own checks (unfilled words, blanks, notes), whoever writes it
 * @param used     what the facts were taken from, for "What the suggestion relies on"
 * @param typed    what the owner typed, kept as the suggestion's instruction
 * @param context  more to keep with the suggestion
 */
export async function draftFromTemplate(item, { id, label, composed, checks = [], used = [], typed = '', instruction = '', fitWith = null, save = true, fitLater = false, context = {}, file = '', okWords = 'Written from your wording, with the facts from your records.' } = {}) {
  const base = {
    itemKey: item.itemKey, anchorKey: item.anchorKey, situation: item.order ? id : item.situation?.primary || id, instruction: typed || instruction, template: id,
    context: { channel: item.order ? 'auction' : item.channel, template: id, ...context, ...(fitLater ? { fitLater: true } : {}) },
  };
  const left = unfilled(composed.text);
  let reply = restore(composed.text, item.lead);
  if (item.channel === 'marketplace') reply = tagMarketplaceLinks(reply);
  // The template's own blanks: highlighted for the owner however the message is written.
  const blanks = [...new Set(reply.match(BLANK) || [])];
  const own = [
    ...(left.length ? [{ level: 'fail', code: 'template', tokens: left, message: `The wording file has ${left.length === 1 ? 'a word' : 'words'} in curly brackets that Wheelman cannot fill in: ${left.join(', ')}. Check voice/${file}.` }] : []),
    ...(blanks.length ? [{ level: 'input', code: 'marker', tokens: blanks, message: 'Fill in the highlighted parts before sending.' }] : []),
    ...checks,
  ];
  if (fitWith && save && !left.length) {
    const masked = maskTemplate(composed);
    const before = latestDraft(item.itemKey, item.anchorKey, id);
    const again = before?.status === 'ready' && before.context?.fitted && before.context.masked === masked.masked && (before.context.asked || '') === instruction;
    const fitted = await fitWith(item, {
      instruction,
      template: { id, label, masked, wordChecks: own, factsUsed: used, typed: typed || instruction, fitted: again ? before.context.fitted : null, fittedBy: again ? { provider: before.provider, model: before.model } : null, asked: instruction },
    });
    if (fitted?.status === 'ready') return fitted;
    // Never a refusal: whatever went wrong in fitting, the owner's wording is written as it stands.
    logLine('suggestion', `${item.itemKey} ${id}: the template could not be fitted (${fitted?.error || 'no answer'}); written word for word`);
  }
  const all = [...own];
  if (!all.length) all.push({ level: 'ok', code: 'ok', tokens: [], message: okWords });
  const d = { ...base, status: 'ready', reply, needsHuman: [], factsUsed: used, checks: all, provider: 'none', model: 'your wording', exampleIds: [] };
  if (save) d.id = insertDraft(d);
  return d;
}
