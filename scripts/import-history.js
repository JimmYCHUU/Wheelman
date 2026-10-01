// One-off: loads the history already saved in data/raw into the local database,
// so the app has the full picture before its first live sync.

import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/config.js';
import { openDb, countRows, closeDb } from '../src/db.js';
import { storeLeads, storeVehicles, storeConversation } from '../src/sync.js';

const read = (name) => {
  const file = path.join(config.rawDir, name);
  if (!fs.existsSync(file)) { console.log(`  (skipped: ${name} not found)`); return null; }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
};

openDb();

const leads = read('leads.json');
if (leads) console.log(`Leads imported: ${storeLeads(leads.leads)}`);

const vehicles = read('vehicles.json');
if (vehicles) console.log(`Vehicles imported: ${storeVehicles(vehicles.vehicles)}`);

const sms = read('sms-conversations.json');
if (sms) {
  let messages = 0;
  for (const conv of sms.conversations) {
    const list = sms.messages[conv.id] || [];
    storeConversation(conv, list);
    messages += list.length;
  }
  console.log(`Conversations imported: ${sms.conversations.length} (${messages} messages)`);
}

console.log('\nDatabase now holds:');
for (const t of ['leads', 'conversations', 'messages', 'vehicles']) console.log(`  ${t}: ${countRows(t)}`);
closeDb();
