// Runs the whole app on invented data, for looking at the page in a browser:
//
//   node test/support/preview.js      then open http://127.0.0.1:3211/new/
//
// The dashboard, the website and the model are stand-ins on this computer, so nothing real is read
// and nothing is sent. Run with plain `node`, so .env is never read. Stop it with Ctrl+C.
import os from 'node:os';
import path from 'node:path';
import { applyTestEnv } from './env.js';
import { startStandins, aiBehaviour } from './standins.js';
import { world, rawLead, rawConversation, rawMessage, STAFF, chatRow, chatMessage } from './fixtures.js';
import { pointConfigAt } from './wire.js';

const PORT = 3211;
// Every section is on, as they all open on the new page: Marketplace reads the stand-in engine's
// invented chats, and Imports takes a thread posted the way the Gmail add-on posts one (none at start).
applyTestEnv({ DAILY_DRAFT_LIMIT: '200', MARKETPLACE_ENABLED: '1', MAIL_INTAKE: '1' });

// The stand-in model answers a draft with a plain reply that leaves one price blank. A follow-up
// gets one that names Carbarn first, as the follow-up checks want; a draft written from Tell
// Wheelman gets a shorter one, so the rewrite shows. Three instructions are for seeing the rarer
// states: "fail this one" makes the model fail, "use the right figure" gives the car's own price and link,
// and "use a wrong figure" gives a price that is not
// in the records, so the check fails.
const said = (req) => (req.messages || []).map((m) => String(m.content || '')).join('\n');
const ai = aiBehaviour({
  behave: (req) => {
    const prompt = said(req);
    const told = /=== INSTRUCTION FROM OUR STAFF FOR THIS DRAFT ===/.test(prompt);
    if (told && /fail this one/i.test(prompt)) return { status: 503, message: 'The model is overloaded.' };
    if (told && /use the right figure/i.test(prompt)) return { reply: 'The price is $31,900. See it here: https://www.carbarn.com.au/vehicles/toyota/voxy/zrr85w/1800', needs_human: [], facts_used: [], hold: false };
    if (told && /use a wrong figure/i.test(prompt)) return { reply: 'The price is $31,990, and we can book you in to see it.', needs_human: [], facts_used: [], hold: false };
    // A template to fit to the customer (between <<< and >>>) comes back as it is, as in the tests.
    const template = prompt.match(/<<<\n([\s\S]*?)\n>>>/);
    if (template) return { reply: template[1], next_step: '', needs_human: [], facts_used: [], hold: false };
    if (/=== FOLLOW-UP ===/.test(prompt)) return { reply: 'Team Carbarn here. How did you find the Hiace? You are welcome to come and see it again.', needs_human: [], facts_used: [], hold: false };
    if (told) return { reply: 'The price is [PRICE?]. When would you like to come and see it?', needs_human: [{ marker: '[PRICE?]', reason: 'A person decides the price.' }], facts_used: [], hold: false };
    return { reply: 'Thanks for your message. The price is [PRICE?], and we can book you in to see it.', needs_human: [{ marker: '[PRICE?]', reason: 'A person decides the price.' }], facts_used: [], hold: false };
  },
});
// One more invented car for the deal panel: more photos than it shows at once, auction photos, a
// video, and an auction sheet at the supplier's address (for Jim only). Nothing in it is fetched
// from elsewhere: the pictures are the stand-in's, and no link is opened by the preview.
const invented = world(Date.now());
const VOXY = 'ZRR85-0303030';
const ROLES = ['front_exterior', 'side_exterior', 'rear_exterior', 'interior_front', 'dashboard', 'odometer', 'climate_control', 'gear_shifter', 'door_controls', 'rear_seats', 'boot_space'];
invented.vehicles.push({
  id: 9, stockNo: '1800', year: '2020', title: '2020 Toyota Voxy ZS', make: 'TOYOTA', model: 'Voxy', modelCode: 'ZRR85W', auPublishPrice: 31900, odometer: 54000,
  seats: 7, fuel: 'Petrol', transmission: 'Automatic', color: 'Black', status: 'PUBLISHED', soldStatus: 'UnSold', stockIn: 'Online',
  outline: ['6 Months NSW Registration', 'Roadside assistance'], chassisNo: VOXY,
});
invented.vehicleMedia = { ...invented.vehicleMedia, [VOXY]: [
  ...Array.from({ length: 14 }, (_, i) => ({ id: 100 + i, chassisNo: VOXY, mediaType: 'IMAGE', imageRole: ROLES[i % ROLES.length], displayOrder: i, url: `{base}/pic/voxy-${i}.png` })),
  { id: 120, chassisNo: VOXY, mediaType: 'VIDEO', label: 'Walkaround 360', url: 'https://fastlycb.s3.ap-southeast-2.amazonaws.com/inventory/media-v2/invented/walk.mp4', thumbnailUrl: '{base}/pic/voxy-poster.png' },
] };
invented.vehicleRecords = { ...invented.vehicleRecords, [VOXY]: {
  id: 9, chassisNo: VOXY, stockNo: '1800',
  auctionPhotos: Array.from({ length: 8 }, (_, i) => `{base}/pic/voxy-auction-${i}.png`),
  operation: { id: 9, vehicleId: 9, documents: [
    { id: 91, documentType: 'AUCTION_SHEET', url: 'https://www.nichibojapan.com/invented/voxy-sheet.pdf', active: true },
    { id: 92, documentType: 'EXPORT_CERTIFICATE', url: 'https://fastlycb.s3.ap-southeast-2.amazonaws.com/docs/invented-voxy-export.pdf', active: true },
  ] },
} };
// Two more invented people, waiting at the start. About a minute later they are answered elsewhere, to
// see the page change: Wynn by a colleague on the dashboard (the stand-in dashboard gets the reply and the
// next check reads it), Pell from the phone (the add-on's report, posted to the app as the add-on does).
const ANSWER_AFTER_MS = 60e3;
const wynn = ['Wynn', 'Invented', '0491 570 190'];
const pell = ['Pell', 'Invented', '0491 570 191'];
{
  const now = Date.now(), MIN = 60e3;
  for (const [id, who, ask] of [[790, wynn, 'Is the Voxy still available?'], [791, pell, 'Can I see the Voxy tomorrow?']]) {
    const lead = rawLead(id, id, who, now, { stocks: ['1800'], agoMs: 3 * 3600e3 });
    invented.leads.carbarnau.push(lead);
    invented.conversations.push({ row: rawConversation(id, lead, who, { direction: 'IN', at: now - 5 * MIN, body: ask }), messages: [rawMessage(id * 10, id, 'IN', ask, 5 * MIN, now)] });
  }
  // Maria (the sold car) is left out of the preview and a number with no customer record takes a place, so that Oldham
  // is the tenth newest waiting when the first suggestions are written.
  invented.conversations = invented.conversations.filter((c) => c.row.id !== 209 && c.row.id !== 210);
  // A number with no customer record and no name: listed, but nothing is written for it unasked.
  invented.conversations.push({ row: rawConversation(793, null, ['', '', '0491 570 193'], { direction: 'IN', at: now - 12 * MIN, body: 'Hi, is the Hiace still for sale?' }), messages: [rawMessage(7930, 793, 'IN', 'Hi, is the Hiace still for sale?', 12 * MIN, now)] });
  // Oldham wrote 30 hours ago and is still waiting. At the first writing-ahead pass he is the tenth newest waiting, so his
  // suggestion is written then. The people added later push him out of the ten; the suggestion stays.
  const oldham = ['Oldham', 'Invented', '0491 570 192'];
  const lead = rawLead(792, 792, oldham, now, { stocks: ['1800'], agoMs: 31 * 3600e3 });
  invented.leads.carbarnau.push(lead);
  invented.conversations.push({ row: rawConversation(792, lead, oldham, { direction: 'IN', at: now - 30 * 3600e3, body: 'Is the Voxy still for sale?' }), messages: [rawMessage(7920, 792, 'IN', 'Is the Voxy still for sale?', 30 * 3600e3, now)] });
  // Two more Facebook buyers beside the fixtures' five, to see what the engine's auto-reply is doing:
  // Tove's chat it handed to a person; Ulla's answer it wrote 20 minutes ago is still queued, not sent.
  // Ulla's listing is not in the stock list, so her chat has the listing's own strip.
  const tove = chatRow(506, 'Tove Invented', 25, now);
  tove.agent = { ...tove.agent, locked: true, lock_reason: 'Asked to speak to a person' };
  invented.chats.set(506, { row: tove, messages: [chatMessage(11, 'in', 'phone', 'Can I speak to someone about the Noah?', 25, now)] });
  const alphard = { listing_title: '2019 Toyota Alphard SC', listing_price: '$45,900', car: { post_id: 3, vehicle_id: null, stock_id: '', title: '2019 Toyota Alphard SC', price: '$45,900', listing_url: 'https://www.facebook.com/marketplace/item/468135', image: '', dashboard_url: '' } };
  const ulla = chatRow(507, 'Ulla Invented', 20, now, { ...alphard, last_direction: 'out', pending_outbound: 1, last_outbound_at: new Date(now - 20 * MIN).toISOString() });
  invented.chats.set(507, { row: ulla, messages: [chatMessage(12, 'in', 'phone', 'Does it have a reversing camera?', 22, now), chatMessage(13, 'out', 'agent', 'Yes, it has a reversing camera.', 20, now, 'queued')] });
  // The first Send to Liam (chat 501) is refused, as if the engine's phone were offline, so the
  // refusal and Try again can be seen. The stand-in engine takes the reply after that.
  invented.refuseSendOnce = new Set([501]);
}
const standins = await startStandins({ world: invented, ai });
const { config } = await import('../../src/config.js');
pointConfigAt(config, standins, { port: PORT, sessionPath: path.join(os.tmpdir(), `wheelman-preview-session-${process.pid}.json`) });

const worker = await import('../../src/worker.js');
const app = await (await import('../../src/server.js')).startServer();
await worker.runSync();
await worker.runMarketplaceSync();
await worker.draftWaiting();

// More invented people, so the list has several pages, a long conversation and a due follow-up.
const db = await import('../../src/db.js');
const { parseDashboardTime, sydneyDay } = await import('../../src/time.js');
{
  const now = Date.now();
  const MIN = 60e3, HOUR = 3600e3;
  const lines = ['Is it still available?', 'Can I come and see it this week?', 'What is the best price?', 'Does it have a service history?', 'Can you hold it until Saturday?'];
  let mid = 90000;
  const talk = (id, direction, body, at) => db.upsertMessage({ id: mid++, conversationId: id, direction, body, sentBy: direction === 'OUT' ? 'Alex STONE' : null, status: 'SENT', mediaType: null, at, importedAt: at });
  // Cleo has an inspection booked; Ada asks about the Voxy, Bo about no car at all; everyone else about the Hiace 1201.
  const stocksOf = { Ada: ['1800'], Bo: [] };
  const person = (n, first, { waiting = true } = {}) => {
    const id = 700 + n, phone = `0491 570 ${String(130 + n).padStart(3, '0')}`;
    db.upsertLead({ id, conversationId: id, firstName: first, lastName: 'Invented', phone, email: '', source: 'carsales', status: first === 'Cleo' ? 'INSPECTION' : 'NEW', platform: 'CARSALES', state: 'NSW', leadAt: now - 3 * 24 * HOUR, updatedAt: now - n * 7 * MIN, stocks: stocksOf[first] || ['1201'], inquiries: [] });
    db.upsertConversation({ id, phone: `+61${phone.replace(/\D/g, '').slice(1)}`, channel: 'SMS', status: 'OPEN', leadId: id, customerName: `${first} Invented`, latestDirection: waiting ? 'IN' : 'OUT', latestAt: now - n * 7 * MIN, latestBody: 'x' });
    return id;
  };
  const names = ['Ada', 'Bo', 'Cleo', 'Dev', 'Esme', 'Finn', 'Gia', 'Hugo', 'Ines', 'Jax', 'Kira', 'Leo', 'Mina', 'Noel', 'Orla', 'Pax', 'Rui', 'Sana', 'Teo', 'Uma', 'Vik', 'Wren', 'Xan', 'Yara', 'Zed', 'Alma'];
  names.forEach((first, i) => {
    const id = person(i + 1, first);
    talk(id, 'IN', lines[i % lines.length], now - (i + 1) * 7 * MIN);
  });
  // One conversation of 45 messages, for Load older messages.
  const long = person(40, 'Longtalk');
  for (let k = 0; k < 45; k++) talk(long, k % 2 ? 'OUT' : 'IN', `Message ${k + 1} of 45: ${lines[k % lines.length]}`, now - (47 - k) * 3 * HOUR);
  db.upsertConversation({ id: long, phone: '+61491570170', channel: 'SMS', status: 'OPEN', leadId: long, customerName: 'Longtalk Invented', latestDirection: 'IN', latestAt: now - 3 * HOUR, latestBody: 'x' });
  // One conversation we answered last, with an inspection whose time has passed: a follow-up is due.
  const visit = parseDashboardTime(`${sydneyDay(now - 24 * HOUR)}T12:00`);
  const quiet = 741;
  db.upsertLead({ id: quiet, conversationId: quiet, firstName: 'Quietly', lastName: 'Invented', phone: '0491 570 171', email: '', source: 'carsales', status: 'NEW', platform: 'CARSALES', state: 'NSW', leadAt: visit - 3 * 24 * HOUR, updatedAt: visit - 25 * HOUR, stocks: ['1201'],
    inquiries: [{ id: 99001, type: 'product_page_inspection', subject: 'Vehicle enquiry', text: `Preferred inspection: On-site on ${sydneyDay(visit)} at 12:00 PM.`, stockNo: '1201', at: visit - 26 * HOUR, status: 'NEW', url: '', leadType: '', priceAtTime: null, loanAmount: null, depositAmount: null, years: null, staffNotes: [], financeStatus: null, weeklyRepayment: null, stockStatus: null, actionType: null, sourceBlock: null, videoViewed: false }] });
  talk(quiet, 'OUT', 'Hello Quietly, your inspection of the Hiace is booked. See you then.', visit - 25 * HOUR);
  db.upsertConversation({ id: quiet, phone: '+61491570171', channel: 'SMS', status: 'OPEN', leadId: quiet, customerName: 'Quietly Invented', latestDirection: 'OUT', latestAt: visit - 25 * HOUR, latestBody: 'x' });
  (await import('../../src/followup.js')).refreshFollowUps();
}
// The people just added are waiting too: the ten newest get their suggestions written ahead, as in daily use.
await worker.draftWaiting();

setTimeout(async () => {
  const now = Date.now();
  const conv = invented.conversations.find((c) => c.row.id === 790);
  const reply = rawMessage(7901, 790, 'OUT', 'Hi Wynn, yes it is. Come and see it any day this week.', 0, now, STAFF.alex);
  conv.messages.push(reply);
  Object.assign(conv.row, { latestMessageDirection: 'OUT', latestMessageAt: reply.providerCreatedAt, latestMessageBody: reply.body });
  const text = 'Hi Pell, tomorrow is fine. See you at 10.';
  try {
    await fetch(`http://127.0.0.1:${PORT}/api/phone/messages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      v: 1, seenAt: now, hidden: true, path: '/web/conversations', signedOut: false, found: { listItems: 1, parsed: 1 },
      threads: [{ ref: 'p1', name: pell[2], kind: 'number', unread: false, latest: { direction: 'out', text, media: null, truncated: false, when: 'now', at: now, precision: 'minute' } }],
    }) });
  } catch (e) { console.log('Preview: the phone report was not accepted: ' + e.message); }
  await worker.runSync();
  console.log('Preview: Wynn was answered on the dashboard and Pell from the phone.');
}, ANSWER_AFTER_MS);

let closing = false;
process.on('SIGINT', async () => {
  if (closing) return;
  closing = true;
  await new Promise((r) => { app.close(r); app.closeAllConnections?.(); });
  await standins.close();
  process.exit(0);
});
console.log(`Preview: http://127.0.0.1:${PORT}/new/ (invented data)`);
