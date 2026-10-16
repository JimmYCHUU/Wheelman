// A customer who asks for a video, the auction sheet, the export certificate or photos gets the
// link in the suggestion: added by code from the car's own media, each with what it is, never
// typed by the AI and never pointed at with "below". All data is invented.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { applyTestEnv } from './support/env.js';
import { startStandins, aiBehaviour } from './support/standins.js';
import { pointConfigAt } from './support/wire.js';
import { world as makeWorld } from './support/fixtures.js';

applyTestEnv({ DAILY_DRAFT_LIMIT: '50' });

const now = Date.now();
const sessionFile = path.join(os.tmpdir(), `wheelman-medialinks-session-${process.pid}.json`);
const WALK = 'https://fastlycb.s3.ap-southeast-2.amazonaws.com/inventory/media-v2/ZRR80-0101010/videos/1159_walkaround-360-voiceover.mp4';
const INSIDE = 'https://fastlycb.s3.ap-southeast-2.amazonaws.com/inventory/media-v2/ZRR80-0101010/videos/1159_inside-front-voiceover.mp4';
const EXPORT = 'https://fastlycb.s3.ap-southeast-2.amazonaws.com/docs/export.pdf';
const PAGE = 'https://www.carbarn.com.au/vehicles/toyota/noah/zrr80g/1159';
const ai = aiBehaviour();
let standins, world, vm, config;

before(async () => {
  world = makeWorld(now);
  standins = await startStandins({ world, ai });
  ({ config } = await import('../src/config.js'));
  pointConfigAt(config, standins, { sessionPath: sessionFile });
  const db = await import('../src/db.js');
  const { normalizeVehicle } = await import('../src/normalize.js');
  db.openDb();
  db.upsertVehicle(normalizeVehicle(world.vehicles[0])); // the Noah, stock 1159, with its chassis number
  vm = await import('../src/vehiclemedia.js');
  let mid = 1;
  const customer = (id, first, text, { earlier = null } = {}) => {
    db.upsertLead({ id, conversationId: id + 100, firstName: first, lastName: 'Test', phone: `049157010${id}`, email: '', source: 'carsales', status: 'FOLLOW_UP', platform: 'CARSALES', state: 'NSW', leadAt: now - 3600e3, updatedAt: now - 3600e3, stocks: ['1159'], inquiries: [] });
    db.upsertConversation({ id: id + 100, phone: `+6149157010${id}`, channel: 'SMS', status: 'OPEN', leadId: id, customerName: `${first} Test`, latestDirection: 'IN', latestAt: now - 120e3, latestBody: 'x' });
    if (earlier) db.upsertMessage({ id: mid++, conversationId: id + 100, direction: 'OUT', body: earlier, sentBy: 'Alex STONE', status: 'SENT', mediaType: null, at: now - 2 * 86400e3, importedAt: now - 2 * 86400e3 });
    db.upsertMessage({ id: mid++, conversationId: id + 100, direction: 'IN', body: text, sentBy: null, status: 'SENT', mediaType: null, at: now - 120e3, importedAt: now - 120e3 });
  };
  const SAID = 'Hello, yes the Noah is still available.';
  customer(1, 'Priya', 'Could you send me a walkaround video and the auction sheet please?', { earlier: SAID });
  customer(2, 'Tom', 'Do you have a video of the inside? And the export certificate?', { earlier: SAID });
  customer(3, 'Ana', 'Can you send more photos?', { earlier: SAID });
  customer(4, 'Ken', 'Can you send me some photos of it?');
  customer(5, 'Max', 'How many seats does it have?', { earlier: SAID });
});

after(async () => { await standins.close(); fs.rmSync(sessionFile, { force: true }); });

const item = async (conversationId) => (await import('../src/items.js')).buildItem({ conversationId });
const draft = async (conversationId, reply) => {
  const { draftFor } = await import('../src/drafter.js');
  ai.seen.length = 0;
  ai.script = [{ reply, needs_human: [], facts_used: [], hold: false, next_step: 'invite to inspect' }];
  const d = await draftFor(await item(conversationId), { save: false, now });
  return { d, asked: ai.seen[0]?.messages?.[1]?.content || '' };
};
const fails = (d) => d.checks.filter((c) => c.level === 'fail');

test('what the customer asks for, in their own words', () => {
  const a = vm.askedFor('Could you send me a walkaround video and the auction sheet please?');
  assert.deepEqual([a.video, a.inside, a.engine, a.photos, a.auctionSheet, a.exportCertificate], [true, false, false, false, true, false]);
  const b = vm.askedFor('Any vids of the interior? Also the export cert');
  assert.deepEqual([b.video, b.inside, b.exportCertificate], [true, true, true]);
  assert.equal(vm.askedFor('Can you send more pics').photos, true);
  assert.equal(vm.askedFor('Is it still available?').video, false);
  assert.equal(vm.askedFor('Video of the engine running?').engine, true);
});

test('the links answer only what was asked: the walkaround for a video, the inside videos when asked, the documents by name', () => {
  const media = { stockNo: '1159', photos: [{ group: 'car' }], videos: [{ label: 'Walkaround 360', link: 'w' }, { label: 'Inside Front', link: 'f' }, { label: 'Inside Rear', link: 'r' }, { label: 'Engine Bay & Tyres', link: 'e' }],
    documents: [{ type: 'AUCTION_SHEET', link: 's' }, { type: 'EXPORT_CERTIFICATE', link: 'x' }, { type: 'RAW_FOOTAGE_LINK', link: 'album' }, { type: 'VIA_APPROVAL', link: 'via' }] };
  const car = { stockNo: '1159', url: PAGE, status: 'PUBLISHED', soldStatus: 'UnSold', stockIn: 'Online' };
  const ask = (text, opts) => vm.replyLinks(media, car, vm.askedFor(text), opts).map((l) => `${l.label}: ${l.url}`);
  assert.deepEqual(ask('a video please'), ['Walkaround 360 video: w']);
  assert.deepEqual(ask('a video of the inside'), ['Walkaround 360 video: w', 'Inside Front video: f', 'Inside Rear video: r']);
  assert.deepEqual(ask('video of the engine and the auction sheet'), ['Walkaround 360 video: w', 'Engine Bay & Tyres video: e', 'Auction sheet: s']);
  assert.deepEqual(ask('export certificate?'), ['Export certificate: x']);
  assert.deepEqual(ask('more photos'), [`Photos: ${PAGE}`]);
  assert.deepEqual(ask('more photos', { pageInBlock: true }), [], 'the page link is in the standard block already');
  assert.deepEqual(vm.replyLinks(media, { ...car, stockIn: 'Transit', status: 'UNPUBLISHED' }, vm.askedFor('photos')), [], 'a car not yet listed has no photos line');
  assert.ok(!ask('send me the footage album and the VIA').some((l) => /album|via/.test(l)), 'albums and the import approval are never added by code');
});

test('a customer who asks for the walkaround video and the auction sheet gets both links, labelled, under the reply', async () => {
  vm.forgetMedia();
  const { d, asked } = await draft(101, 'Hi {{NAME}},\nOf course. The Noah is ready to inspect at our Lidcombe showroom.');
  assert.match(asked, /=== LINKS THEY ASKED FOR ===/);
  assert.match(asked, /walkaround 360 video and auction sheet/);
  assert.match(asked, /Do not write these links yourself/);
  assert.ok(d.reply.includes(`Walkaround 360 video: ${WALK}`), d.reply);
  assert.match(d.reply, /Auction sheet: http:\/\/127\.0\.0\.1:\d+\/pic\/sheet\.png/);
  assert.ok(d.reply.indexOf('Walkaround 360 video') > d.reply.indexOf('ready to inspect'), 'the links come after the AI\'s own lines');
  assert.deepEqual(fails(d), [], JSON.stringify(d.checks));
  assert.doesNotMatch(d.reply, /secret|PROFORMA|form5|INSPECTION/i);
});

test('the inside videos and the export certificate when those are asked for; a link the AI typed is given once', async () => {
  vm.forgetMedia();
  const { d } = await draft(102, `Hi {{NAME}},\nCertainly. Here is the walkaround:\n${WALK}`);
  assert.equal(d.reply.split(WALK).length - 1, 1, d.reply);
  assert.ok(d.reply.includes(`Inside Front video: ${INSIDE}`), d.reply);
  assert.ok(d.reply.includes(`Export certificate: ${EXPORT}`), d.reply);
  assert.deepEqual(fails(d), [], JSON.stringify(d.checks));
});

test('pointing at the links with "below" is sent back for one rewrite', async () => {
  vm.forgetMedia();
  const { d } = await draft(101, 'Hi {{NAME}},\nThe video and the auction sheet are below.');
  // The first answer failed the check and was sent back; the rewrite request says why.
  assert.equal(ai.seen.length, 2, 'the reply was written again');
  assert.match(ai.seen[1].messages[1].content, /leave out "below"/);
  assert.ok(!/are below/.test(d.reply), d.reply);
  assert.ok(d.reply.includes(`Walkaround 360 video: ${WALK}`), 'the links are still added to the rewrite');
});

test('photos: the car\'s page in a later reply; on a first reply the page is already in the standard block', async () => {
  vm.forgetMedia();
  const later = await draft(103, 'Hi {{NAME}},\nCertainly, every photo of the Noah is on its page.');
  assert.ok(later.d.reply.includes(`Photos: ${PAGE}`), later.d.reply);
  const first = await draft(104, 'Hi {{NAME}},\nThank you for your enquiry. Every photo of the Noah is on its page on our website.');
  assert.match(first.asked, /every photo of this vehicle is on its page/);
  assert.ok(!first.d.reply.includes('Photos: '), first.d.reply);
  assert.ok(first.d.reply.includes(`Vehicle details:\n${PAGE}`), 'the standard block carries the page');
});

test('nothing is added when nothing was asked for, or when the dashboard does not answer', async () => {
  vm.forgetMedia();
  const plain = await draft(105, 'Hi {{NAME}},\nIt has 8 seats.');
  assert.doesNotMatch(plain.asked, /LINKS THEY ASKED FOR/);
  assert.doesNotMatch(plain.d.reply, /video:|Auction sheet:/);
  world.mediaDown = true;
  try {
    vm.forgetMedia();
    const down = await draft(101, 'Hi {{NAME}},\nOf course. We will send the video and the auction sheet shortly.');
    assert.doesNotMatch(down.asked, /LINKS THEY ASKED FOR/);
    assert.doesNotMatch(down.d.reply, /Walkaround 360 video:/);
  } finally { world.mediaDown = false; }
});
