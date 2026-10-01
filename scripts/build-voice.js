// Rebuilds the bank of our salespeople's genuine replies from the stored dashboard conversations.
// The app does this by itself once a day; run this to do it now: npm run build-voice

import { buildVoiceBank } from '../src/voicebank.js';
import { closeDb } from '../src/db.js';

const s = buildVoiceBank();
console.log(`Examples kept: ${s.count}`);
console.log('By author:', s.byAuthor);
console.log('By situation:', s.bySituation);
console.log('First replies:', s.firstReplies);
console.log(`Reply length in words: median ${s.medianWords}, 90% under ${s.p90Words}`);
console.log('Left out:', s.skipped);
closeDb();
