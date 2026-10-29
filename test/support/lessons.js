// What Wheelman learned from the preview's invented people (test/support/preview.js), for the
// Playbook's Lessons: edits copied from Wheelman again and again, a Remember lesson and a Could be
// better note. Every word is invented.

// What each person asked (preview.js gives Ada the first line, Bo the second, and so on), and the
// kind of message it is.
const ASKED = [
  ['Is it still available?', 'availability'],
  ['Can I come and see it this week?', 'inspection_booking'],
  ['What is the best price?', 'price_negotiation'],
  ['Does it have a service history?', 'history_kms'],
  ['Can you hold it until Saturday?', 'deposit_hold'],
];
// [conversation, what Wheelman wrote, what was copied]
const EDITS = [
  // "kindly" taken out on four suggestions (Ada, Bo, Cleo, Dev): proposed.
  [701, 'Could you kindly send us your number?', 'Could you send us your number?'],
  [702, 'We would kindly ask you to call first.', 'We ask you to call first.'],
  [703, 'Kindly let us know a time.', 'Let us know a time.'],
  [704, 'Please kindly confirm the day.', 'Please confirm the day.'],
  // "assist" changed to "help" on three (Esme, Finn, Gia): proposed.
  [705, 'We are happy to assist.', 'We are happy to help.'],
  [706, 'Let us know if we can assist with anything else.', 'Let us know if we can help with anything else.'],
  [707, 'Our team can assist you on the day.', 'Our team can help you on the day.'],
  // "vehicle" changed to "car" on two (Hugo, Ines): not yet.
  [708, 'The vehicle is ready to inspect.', 'The car is ready to inspect.'],
  [709, 'We can hold the vehicle until Saturday.', 'We can hold the car until Saturday.'],
];
const LONG = 'Thanks for your message. Yes, it is still available and ready to inspect. It has a full service history and six months of registration. You are welcome to come and see it any day this week, and we can arrange a test drive on the day. Let us know a time that suits you.';

/**
 * Writes them into the preview's database, once the people c:701 to c:711 are there. Each edit is a
 * suggestion for an earlier message, copied with the change, so each person's box today is as it was.
 */
export function seedLessons(db, now = Date.now()) {
  const HOUR = 3600e3;
  EDITS.forEach(([id, wrote, sent], n) => {
    const itemKey = `c:${id}`;
    const [customerText, situation] = ASKED[(id - 701) % ASKED.length];
    const draftId = db.insertDraft({ itemKey, anchorKey: `m:${id}00`, situation, reply: wrote, status: 'ready', checks: [] });
    db.recordCopied(draftId, sent);
    db.upsertLearned({ draftId, itemKey, situations: [situation], firstReply: false, customerText, draftText: wrote, finalText: sent, source: 'copied', changed: true, similarity: 0.9, at: now - (EDITS.length - n) * 6 * HOUR });
  });
  // Jax's instruction, remembered for finance questions, switched off and on again.
  const jax = db.insertRemember({ itemKey: 'c:710', scope: 'finance', instruction: 'Do not mention finance unless they ask.', at: now - 50 * HOUR });
  db.switchLesson(jax, false, { at: now - 30 * HOUR });
  db.switchLesson(jax, true, { at: now - 20 * HOUR });
  // Kira's suggestion was too long: a Could be better note, with the lesson taken from it.
  const kira = db.insertDraft({ itemKey: 'c:711', anchorKey: 'm:71100', situation: 'availability', reply: LONG, status: 'ready', checks: [] });
  db.insertAdvice({ draftId: kira, itemKey: 'c:711', situations: ['availability'], firstReply: false, customerText: ASKED[0][0], draftText: LONG, note: 'Too long. Keep it to three lines.',
    lessons: [{ scope: 'any', when: '', do: 'Keep a reply to three short lines.', internal: false }], at: now - 8 * HOUR });
}
