// The parts of a finished reply: the AI's own words, then each block code added under them, each
// with its label and why it was added. They are found in the reply word for word; the reply itself
// never changes. All data is invented. A stand-in AI service on this computer plays the model, and
// a stand-in content engine the Marketplace inbox; the page's own routes are called.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { applyTestEnv } from './support/env.js';
import { startStandins, aiBehaviour } from './support/standins.js';
import { marketplace } from './support/fixtures.js';

applyTestEnv({ DAILY_DRAFT_LIMIT: '200', MARKETPLACE_ENABLED: '1' });

const now = Date.now();
const MIN = 60e3, HOUR = 3600e3;
const NOAH = 'https://www.carbarn.com.au/vehicles/toyota/noah/zrr80g/1159';
const VELL = 'https://www.carbarn.com.au/vehicles/toyota/vellfire/abc10/1800';

// The Marketplace inbox holds one chat: a buyer asking for the booking link for the Noah.
const listed = marketplace(now).get(501);
const chats = new Map([[501, { ...listed, messages: [{ ...listed.messages[0], text: 'Hi, can you send me the link to book an inspection? Thanks, Liam.' }] }]]);
const ai = aiBehaviour({ behave: () => ({ reply: 'Of course. You are welcome to inspect the Noah at our Lidcombe showroom.', needs_human: [], facts_used: [], hold: false }) });

let standins, app, base, db, items, drafter, sync, partsOf, standardBlock;

before(async () => {
  standins = await startStandins({ world: { now, chats }, ai });
  const { config } = await import('../src/config.js');
  config.llm.gemini.url = `${standins.base}/chat`;
  config.marketplace.url = `${standins.engineBase}/inbox`;
  config.port = 0;
  db = await import('../src/db.js');
  items = await import('../src/items.js');
  drafter = await import('../src/drafter.js');
  sync = await import('../src/sync.js');
  ({ partsOf } = await import('../src/parts.js'));
  ({ standardBlock } = await import('../src/firstreply.js'));
  const { normalizeVehicle } = await import('../src/normalize.js');
  db.upsertVehicle(normalizeVehicle({ id: 1, stockNo: '1159', year: '2021', title: '2021 Toyota Noah X (8 Seater)', make: 'TOYOTA', model: 'Noah', modelCode: 'ZRR80G', auPublishPrice: 28900, odometer: 62733, seats: 8, fuel: 'Petrol', transmission: 'Automatic', status: 'PUBLISHED', soldStatus: 'UnSold', stockIn: 'Online', outline: ['6 Months NSW Registration'] }));
  db.upsertVehicle(normalizeVehicle({ id: 8, stockNo: '1800', year: '2019', title: '2019 Toyota Vellfire Z', make: 'TOYOTA', model: 'Vellfire', modelCode: 'ABC10', auPublishPrice: 21900, odometer: 60000, seats: 7, status: 'PUBLISHED', soldStatus: 'UnSold', stockIn: 'Online', outline: ['6 Months NSW Registration', 'CTP Insurance', 'Fresh Roadworthy Certificate', 'Doorstep Delivery (Greater Sydney)'] }));
  app = await (await import('../src/server.js')).startServer();
  base = `http://127.0.0.1:${app.address().port}`;
});

after(async () => {
  if (app) await new Promise((r) => { app.close(r); app.closeAllConnections?.(); });
  await standins?.close();
});

const post = async (path, body = {}) => { const res = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: res.status, ...(await res.json()) }; };
const get = async (path) => (await fetch(base + path)).json();
const joined = (parts) => parts.map((p) => p.text).join('\n\n');

// ---- partsOf, on its own ------------------------------------------------------------------------

const AI = 'Hello Ivy,\nYes, the Noah is still available.';
const LINKS = `Video: ${NOAH}#video\nAuction sheet: ${NOAH}#auction-sheet`;
const PRICE = 'The price includes 6 months NSW registration. Government charges are extra.\n\nWe generally keep our prices competitive considering everything included, but we may offer a small discount for a serious buyer.';
const SIGN = 'Regards,\nTeam Carbarn';
const BLOCKS = [
  { kind: 'links', label: 'Links you asked for', text: LINKS, why: 'The customer asked for a video and the auction sheet.' },
  { kind: 'price', label: 'Price reply', text: PRICE, why: 'The customer asked about the price: the best price, a discount, or an offer.' },
  { kind: 'signoff', label: 'Sign-off', text: SIGN, why: 'The first reply to this customer today' },
];

test('partsOf splits a reply into the AI text and its blocks', () => {
  const reply = [AI, LINKS, PRICE, SIGN].join('\n\n');
  const given = structuredClone(BLOCKS);
  const parts = partsOf(reply, given);
  assert.deepEqual(parts, [
    { kind: 'ai', label: '', text: AI, why: '' },
    { kind: 'block', label: 'Links you asked for', text: LINKS, why: 'The customer asked for a video and the auction sheet.' },
    // The price reply's own blank line stays inside it.
    { kind: 'block', label: 'Price reply', text: PRICE, why: 'The customer asked about the price: the best price, a discount, or an offer.' },
    { kind: 'block', label: 'Sign-off', text: SIGN, why: 'The first reply to this customer today' },
  ]);
  assert.equal(joined(parts), reply);
  assert.deepEqual(given, BLOCKS, 'the blocks given are left as they were');

  // The AI's words are whatever comes before the first block, blank lines and all.
  const long = `${AI}\n\nCome and see it any day this week.`;
  assert.deepEqual(partsOf(`${long}\n\n${SIGN}`, [BLOCKS[2]]).map((p) => [p.kind, p.text]), [['ai', long], ['block', SIGN]]);
  // A reply that is only blocks has no AI part.
  assert.deepEqual(partsOf(`${PRICE}\n\n${SIGN}`, BLOCKS.slice(1)).map((p) => p.label), ['Price reply', 'Sign-off']);
});

test('partsOf falls back to one AI part when the blocks are not found word for word', () => {
  const whole = (reply) => [{ kind: 'ai', label: '', text: reply, why: '' }];
  // A block whose words differ from the reply's (two spaces where the reply has one).
  const tidied = [AI, PRICE, SIGN].join('\n\n');
  assert.deepEqual(partsOf(tidied, [{ ...BLOCKS[1], text: PRICE.replace('registration. ', 'registration.  ') }, BLOCKS[2]]), whole(tidied));
  // Words after the last block that are not a block of their own.
  const after = [AI, PRICE, 'See you soon.'].join('\n\n');
  assert.deepEqual(partsOf(after, [BLOCKS[1]]), whole(after));
  // Blocks given out of their order in the reply.
  const both = [AI, PRICE, SIGN].join('\n\n');
  assert.deepEqual(partsOf(both, [BLOCKS[2], BLOCKS[1]]), whole(both));
  // A block that does not sit on its own paragraph.
  const inline = `${AI} ${SIGN}`;
  assert.deepEqual(partsOf(inline, [BLOCKS[2]]), whole(inline));
  // No blocks at all, and no reply at all.
  assert.deepEqual(partsOf(AI, []), whole(AI));
  assert.deepEqual(partsOf(AI), whole(AI));
  assert.deepEqual(partsOf('', BLOCKS), whole(''));
});

// ---- a written draft --------------------------------------------------------------------------

test('a written draft carries its parts and the reply is unchanged', async () => {
  // A brand-new enquiry about the best price: the price reply, then the standard first-reply block.
  db.upsertLead({ id: 41, conversationId: 261, firstName: 'Omar', lastName: 'Test', phone: '0491 570 141', email: '', source: 'carsales', status: 'FOLLOW_UP', platform: 'CARSALES', state: 'NSW', leadAt: now - 2 * HOUR, updatedAt: now - HOUR, stocks: ['1800'], inquiries: [], statusHistory: [] });
  db.upsertConversation({ id: 261, phone: '+61491570141', channel: 'SMS', status: 'OPEN', leadId: 41, customerName: 'Omar Test', latestDirection: 'IN', latestAt: now - 5 * MIN, latestBody: 'x' });
  db.upsertMessage({ id: 1, conversationId: 261, direction: 'IN', body: 'Hi, what is your best price on the Vellfire?', sentBy: null, status: 'SENT', mediaType: null, at: now - 5 * MIN, importedAt: now - 5 * MIN });
  ai.script = [{ reply: 'Hi {{NAME}},\nThe Vellfire is available for inspection at our Lidcombe showroom.', needs_human: [], facts_used: [], hold: false }];
  const out = await post('/api/items/c:261/draft', { instruction: '' });
  assert.equal(out.ok, true, out.error);

  const opening = 'Hello Omar,\nThe Vellfire is available for inspection at our Lidcombe showroom.';
  const price = 'The price includes 6 months NSW registration, CTP insurance, a fresh roadworthy certificate and Greater Sydney delivery. Government charges are extra.\n\n'
    + 'We generally keep our prices competitive considering everything included, but we may offer a small discount for a serious buyer.\n\n'
    + `You can book an inspection here:\n${VELL}#inspection=onsite\nOr let us know your preferred date and time, and we'll arrange it for you.`;
  const first = standardBlock({ vehicleUrl: VELL });
  const draft = (await get('/api/items/c:261')).item.draft;
  // The reply is exactly what it was before parts were kept.
  assert.equal(draft.reply, [opening, price, first].join('\n\n'));
  assert.deepEqual(draft.parts, [
    { kind: 'ai', label: '', text: opening, why: '' },
    { kind: 'block', label: 'Price reply', text: price, why: 'The customer asked about the price: the best price, a discount, or an offer.' },
    { kind: 'block', label: 'First-reply details', text: first, why: 'A first reply to a new enquiry' },
  ]);
  assert.equal(joined(draft.parts), draft.reply);
  // Kept with the draft itself, so they come back with it later.
  assert.deepEqual(db.getDraft(draft.id).context.parts, draft.parts);
  // The draft's facts: the booking link is from the stock record, the price reply's own figures from the wording file.
  assert.ok(Array.isArray(draft.facts) && draft.facts.length > 0, JSON.stringify(draft.facts));
  assert.ok(draft.facts.some((f) => f.value === `${VELL}#inspection=onsite` && f.source === 'the stock record' && f.ok), JSON.stringify(draft.facts));
  assert.ok(draft.facts.every((f) => f.ok), JSON.stringify(draft.facts));
});

test("a Marketplace draft's parts carry the same link tags as its reply", async () => {
  await sync.syncMarketplace();
  const item = items.itemFromKey('mp:501');
  assert.equal(item.vehicles[0]?.url, NOAH, 'the listing is matched to the Noah');
  const d = await drafter.draftFor(item, { save: false, now });
  assert.equal(d.status, 'ready', d.error);
  const tagged = `${NOAH}?utm_source=marketplace#inspection=onsite`;
  assert.ok(d.reply.includes(tagged), d.reply);
  const parts = d.context.parts;
  assert.equal(joined(parts), d.reply);
  const invite = parts.find((p) => p.label === 'Invitation to see the car');
  assert.ok(invite, JSON.stringify(parts));
  assert.equal(invite.kind, 'block');
  assert.ok(invite.text.includes(tagged), invite.text);
  assert.ok(!parts.some((p) => p.text.includes(`${NOAH}#`)), 'no part keeps the link without its tag');
  assert.equal(invite.why, 'The customer wants to see this vehicle.');
  assert.equal(parts[0].kind, 'ai');
});
