// Confirms the dashboard login in .env works and that the agent can read what it needs.
// Reads only. Run with: npm run check-login

import { config } from '../src/config.js';
import * as dash from '../src/dashboard.js';

if (!config.dashboard.username || !config.dashboard.password) {
  console.log('The dashboard login is not filled in yet.');
  console.log('Open the .env file and fill in DASHBOARD_USERNAME and DASHBOARD_PASSWORD, then run this again.');
  process.exit(1);
}

const step = async (label, fn) => {
  process.stdout.write(`${label} ... `);
  try { const out = await fn(); console.log(`OK${out ? ' (' + out + ')' : ''}`); return true; }
  catch (e) { console.log(`FAILED\n   ${e.message}`); return false; }
};

let ok = true;
ok = await step('Signing in', async () => { const u = await dash.login(); return `as ${u.username}`; }) && ok;
if (ok) {
  ok = await step('Reading leads', async () => { const j = await dash.fetchLeadsPage(1, 5); return `${j.totalLeads} leads in total`; }) && ok;
  ok = await step('Reading conversations', async () => { const j = await dash.fetchConversationsPage(0, 5); return `${j.totalElements} conversations in total`; }) && ok;
  ok = await step('Reading one conversation\'s messages', async () => {
    const j = await dash.fetchConversationsPage(0, 1);
    const id = j.content?.[0]?.id;
    if (!id) return 'no conversations to read';
    const m = await dash.fetchAllMessages(id);
    return `${m.length} messages`;
  }) && ok;
  ok = await step('Reading stock', async () => { const j = await dash.get('/carbarnau/api/v1/vehicles', { page: 0, size: 1 }); return `${j.page?.totalElements} vehicles in total`; }) && ok;
}

console.log(ok ? '\nAll good. The agent can read the dashboard.' : '\nSomething did not work. See the message above.');
process.exit(ok ? 0 : 1);
