// The add-on's background: every 30 seconds it asks the reader in the Messages tab for the list and
// hands the result to Wheelman on this computer. It keeps the Messages tab open, and wakes it when
// the browser has put it to sleep. When the Send to Wheelman button is pressed in Gmail, it hands
// that one email thread over the same way. It sends nothing anywhere else.

const SERVER = 'http://127.0.0.1:3210'; // must match PORT in Wheelman's .env file
const MESSAGES = 'https://messages.google.com/web/*';
const MAIL = 'https://mail.google.com/*';
const OPEN_AT = 'https://messages.google.com/web/conversations';
const EVERY_MINUTES = 0.5;
const RELOAD_GAP = 2 * 60 * 1000;

let lastReload = 0;

chrome.runtime.onInstalled.addListener(() => setup());
chrome.runtime.onStartup.addListener(() => setup());

async function setup() {
  await chrome.alarms.create('read', { periodInMinutes: EVERY_MINUTES });
  await ensureTab();
  tick('start');
}

async function findTab() {
  const tabs = await chrome.tabs.query({ url: MESSAGES });
  return tabs[0] || null;
}

async function ensureTab() {
  const tab = await findTab();
  if (tab) return tab;
  return chrome.tabs.create({ url: OPEN_AT, pinned: true, active: false });
}

async function reloadOnce(tab) {
  if (Date.now() - lastReload < RELOAD_GAP) return;
  lastReload = Date.now();
  try { await chrome.tabs.reload(tab.id); } catch { /* the tab may have just closed */ }
}

chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'read') tick('alarm'); });

/** One round: read the list, send it, remember what happened for the popup. */
async function tick(why) {
  const last = { at: Date.now(), why };
  try {
    const tab = await findTab();
    if (!tab) return finish({ ...last, ok: false, problem: 'no-tab' });
    if (tab.discarded) { await reloadOnce(tab); return finish({ ...last, ok: false, problem: 'tab-asleep' }); }
    let report;
    try { report = await chrome.tabs.sendMessage(tab.id, { type: 'read' }); } catch { report = null; }
    if (!report) {
      // No reader in the tab (the add-on was just installed or reloaded): a reload of the tab puts it there.
      await reloadOnce(tab);
      return finish({ ...last, ok: false, problem: 'no-reader' });
    }
    let res;
    try {
      res = await fetch(`${SERVER}/api/phone/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-wheelman-phone': '1' },
        body: JSON.stringify(report),
      });
    } catch {
      return finish({ ...last, ok: false, problem: 'no-wheelman', signedOut: report.signedOut, found: report.found });
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return finish({ ...last, ok: false, problem: 'refused', error: body.error || `HTTP ${res.status}`, signedOut: report.signedOut, found: report.found });
    return finish({ ...last, ok: true, stored: body.stored || 0, threads: body.threads || 0, signedOut: report.signedOut, found: report.found });
  } catch (e) {
    return finish({ ...last, ok: false, problem: 'error', error: String((e && e.message) || e) });
  }
}

async function finish(last) {
  await chrome.storage.local.set({ last });
  return last;
}

/** One email thread, read by the Gmail button, handed to Wheelman. What happened is kept for the popup. */
async function postMail(report) {
  const lastMail = { at: Date.now(), subject: report.subject || '', messages: (report.messages || []).length, collapsed: (report.found && report.found.collapsed) || 0 };
  let res;
  try {
    res = await fetch(`${SERVER}/api/mail/threads`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-wheelman-mail': '1' },
      body: JSON.stringify(report),
    });
  } catch {
    return finishMail({ ...lastMail, ok: false, problem: 'no-wheelman' });
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return finishMail({ ...lastMail, ok: false, problem: 'refused', error: body.error || `HTTP ${res.status}` });
  return finishMail({ ...lastMail, ok: true, added: body.added || 0, updated: body.updated || 0, key: body.key || '' });
}

async function finishMail(lastMail) {
  await chrome.storage.local.set({ lastMail });
  return lastMail;
}

const fromGmail = (sender) => !!(sender && sender.tab && /^https:\/\/mail\.google\.com\//.test(sender.tab.url || ''));

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg) return false;
  if (msg.type === 'readNow') { tick('button').then(reply); return true; }
  if (msg.type === 'openTab') { ensureTab().then(() => reply({ ok: true }), () => reply({ ok: false })); return true; }
  // The Gmail button. Only the reader in a Gmail tab may ask for a thread to be sent.
  if (msg.type === 'sendMail') {
    if (!fromGmail(sender) || !msg.report) { reply({ ok: false, problem: 'error', error: 'Not from the Gmail page.' }); return false; }
    postMail(msg.report).then(reply, (e) => reply({ ok: false, problem: 'error', error: String((e && e.message) || e) }));
    return true;
  }
  if (msg.type === 'mailShape') {
    (async () => {
      const tabs = await chrome.tabs.query({ url: MAIL });
      const tab = tabs.find((t) => t.active) || tabs[0];
      if (!tab) return reply({ error: 'No Gmail tab is open.' });
      try { reply(await chrome.tabs.sendMessage(tab.id, { type: 'mailShape' })); } catch { reply({ error: 'The reader is not running in the Gmail tab. Reload the tab and try again.' }); }
    })();
    return true;
  }
  if (msg.type === 'shape') {
    (async () => {
      const tab = await findTab();
      if (!tab) return reply({ error: 'The Messages tab is not open.' });
      try { reply(await chrome.tabs.sendMessage(tab.id, { type: 'shape' })); } catch { reply({ error: 'The reader is not running in the Messages tab. Reload the tab and try again.' }); }
    })();
    return true;
  }
  return false;
});
