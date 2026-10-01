// Confirms the AI key(s) in .env work and shows which free models are answering right now.
// Sends one short made-up question to each (no customer data). Run with: npm run check-model

import { config } from '../src/config.js';
import { providers, callModel, parseJsonReply } from '../src/llm.js';

const list = providers();
if (!list.length) {
  console.log('No AI key is filled in yet.');
  console.log('Open the .env file and fill in GEMINI_API_KEY (create one free at https://aistudio.google.com/apikey), then run this again.');
  process.exit(1);
}

console.log('Models are tried in this order. The first one that answers is used.\n');
let answering = 0, badKey = new Set();
for (const p of list) {
  process.stdout.write(`${p.name.padEnd(11)} ${p.model.padEnd(34)} `);
  const started = Date.now();
  try {
    const out = await callModel(p, 'You reply with one JSON object only.', 'Return {"reply": "<a six-word friendly greeting from a car dealer>"}', { maxTokens: 400, timeoutMs: 45000 });
    const parsed = parseJsonReply(out.content);
    console.log(`answering  (${((Date.now() - started) / 1000).toFixed(1)}s)  "${String(parsed.reply || '').slice(0, 60)}"`);
    answering++;
  } catch (e) {
    if (e.status === 401 || e.status === 403) { badKey.add(p.name); console.log('KEY REJECTED'); }
    else if ([429, 500, 502, 503, 504].includes(e.status)) console.log(`busy right now (${e.status})`);
    else console.log(`failed: ${e.message.slice(0, 90)}`);
  }
}

console.log('');
if (badKey.size) console.log(`The key for ${[...badKey].join(' and ')} was rejected. Check it in the .env file.`);
if (answering) console.log(`${answering} of ${list.length} models are answering. The agent can write suggestions. Daily cap: ${config.llm.dailyLimit} requests.`);
else if (!badKey.size) console.log('The keys were accepted, but every free model is busy at the moment. This usually clears within minutes; the agent keeps trying by itself.');
process.exit(answering ? 0 : 1);
