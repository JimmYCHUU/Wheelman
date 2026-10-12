// Confirms the AI key(s) in .env work and shows which models are answering right now, in the
// order Wheelman tries them (the one chosen on the page first).
// Sends one short made-up question to each (no customer data). Run with: npm run check-model

import { config } from '../src/config.js';
import { providers, callModel, parseJsonReply } from '../src/llm.js';

const list = providers();
if (!list.length) {
  console.log('No AI key is filled in yet.');
  console.log('Open the .env file and fill in GEMINI_API_KEY (create one free at https://aistudio.google.com/apikey) or OPENAI_API_KEY (ChatGPT), then run this again. The page can also take a key: the cog at the top right.');
  process.exit(1);
}

console.log('Models are tried in this order. The first one that answers is used.\n');
let answering = 0, badKey = new Set();
for (const p of list) {
  process.stdout.write(`${p.name.padEnd(11)} ${p.model.padEnd(34)} `);
  const started = Date.now();
  try {
    // The full allowance: a thinking model spends part of it before it answers, and a short one cuts the answer off.
    const out = await callModel(p, 'You reply with one JSON object only.', 'Return {"reply": "<a six-word friendly greeting from a car dealer>"}', { timeoutMs: 45000 });
    const parsed = parseJsonReply(out.content);
    const tokens = out.usage ? `, ${out.usage.in + out.usage.out} tokens` : '';
    console.log(`answering  (${((Date.now() - started) / 1000).toFixed(1)}s${tokens})  "${String(parsed.reply || '').slice(0, 60)}"`);
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
