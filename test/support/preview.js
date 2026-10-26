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
import { world } from './fixtures.js';
import { pointConfigAt } from './wire.js';

const PORT = 3211;
applyTestEnv({ DAILY_DRAFT_LIMIT: '200' });

// The stand-in model answers every draft with a plain reply that leaves one price blank.
const ai = aiBehaviour({
  behave: () => ({ reply: 'Thanks for your message. The price is [PRICE?], and we can book you in to see it.', needs_human: [{ marker: '[PRICE?]', reason: 'A person decides the price.' }], facts_used: [], hold: false }),
});
const standins = await startStandins({ world: world(Date.now()), ai });
const { config } = await import('../../src/config.js');
pointConfigAt(config, standins, { port: PORT, sessionPath: path.join(os.tmpdir(), `wheelman-preview-session-${process.pid}.json`) });

const worker = await import('../../src/worker.js');
const app = await (await import('../../src/server.js')).startServer();
await worker.runSync();
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
  const person = (n, first, { waiting = true } = {}) => {
    const id = 700 + n, phone = `0491 570 ${String(130 + n).padStart(3, '0')}`;
    db.upsertLead({ id, conversationId: id, firstName: first, lastName: 'Invented', phone, email: '', source: 'carsales', status: 'NEW', platform: 'CARSALES', state: 'NSW', leadAt: now - 3 * 24 * HOUR, updatedAt: now - n * 7 * MIN, stocks: ['1201'], inquiries: [] });
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

let closing = false;
process.on('SIGINT', async () => {
  if (closing) return;
  closing = true;
  await new Promise((r) => { app.close(r); app.closeAllConnections?.(); });
  await standins.close();
  process.exit(0);
});
console.log(`Preview: http://127.0.0.1:${PORT}/new/ (invented data)`);
