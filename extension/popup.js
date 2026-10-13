// The add-on's small window: what happened on the last round, in plain words, and three buttons.

const $ = (s) => document.querySelector(s);

function ago(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)} h ago`;
}

function words(last) {
  if (!last) return { state: 'Nothing read yet.', detail: 'Press Read now.', bad: false, noTab: false };
  const when = ago(last.at);
  if (last.ok) {
    const n = last.threads || 0;
    const bits = [`Connected to Wheelman`, `last sent ${when}`, `${n} conversation${n === 1 ? '' : 's'}`];
    let detail = last.stored ? `${last.stored} new text${last.stored === 1 ? '' : 's'} handed over on the last round.` : '';
    let bad = false;
    if (last.signedOut) { detail = 'Messages for web is signed out. Open the Messages tab and sign in again.'; bad = true; }
    else if (last.found && last.found.listItems === 0) { detail = 'No conversations could be read. The page may have changed: use Copy page details.'; bad = true; }
    return { state: bits.join(' · '), detail, bad, noTab: false };
  }
  const P = {
    'no-tab': ['The Messages tab is not open.', 'Open it and leave it open; the add-on pins it.'],
    'tab-asleep': ['The browser put the Messages tab to sleep.', 'Waking it. In Chrome, add messages.google.com to "Always keep these sites active" (Performance settings) so this stops happening.'],
    'no-reader': ['The reader is not running in the Messages tab yet.', 'Reloading the tab. Press Read now in a moment.'],
    'no-wheelman': ['Wheelman is not running on this computer.', 'Start it with Start Wheelman.cmd, then press Read now.'],
    refused: ['Wheelman did not accept the report.', last.error || ''],
    error: ['Something went wrong.', last.error || ''],
  };
  const [state, detail] = P[last.problem] || ['Not working.', last.error || ''];
  return { state: `${state} (${when})`, detail, bad: true, noTab: last.problem === 'no-tab' };
}

function paint(last) {
  const w = words(last);
  $('#state').textContent = w.state;
  $('#state').classList.toggle('bad', w.bad);
  $('#detail').textContent = w.detail;
  $('#open').hidden = !w.noTab;
}

/** The last email thread the Gmail button sent, in a line. */
function mailWords(m) {
  if (!m) return { text: 'Gmail: nothing sent yet. Open an email and press Send to Wheelman.', bad: false };
  const n = m.messages || 0;
  const what = `"${(m.subject || 'no subject').slice(0, 60)}" ${ago(m.at)} · ${n} message${n === 1 ? '' : 's'}`;
  if (m.ok) return { text: `Gmail: sent ${what}.${m.collapsed ? ` ${m.collapsed} folded: press Expand all in Gmail and send again.` : ''}`, bad: false };
  const why = m.problem === 'no-wheelman' ? 'Wheelman is not running on this computer.' : m.problem === 'refused' ? `Wheelman did not accept it: ${m.error || ''}` : m.error || 'Something went wrong.';
  return { text: `Gmail: could not send ${what}. ${why}`, bad: true };
}

function paintMail(lastMail) {
  const w = mailWords(lastMail);
  $('#mail').textContent = w.text;
  $('#mail').classList.toggle('bad', w.bad);
}

async function load() {
  const { last, lastMail } = await chrome.storage.local.get(['last', 'lastMail']);
  paint(last);
  paintMail(lastMail);
}

$('#read').addEventListener('click', async () => {
  $('#state').textContent = 'Reading…';
  const last = await chrome.runtime.sendMessage({ type: 'readNow' });
  paint(last);
});

$('#open').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'openTab' });
  $('#detail').textContent = 'Opened. Sign in there if it asks, then press Read now.';
});

$('#shape').addEventListener('click', async () => {
  const out = await chrome.runtime.sendMessage({ type: 'shape' });
  if (!out || out.error) { $('#detail').textContent = (out && out.error) || 'Could not read the page.'; return; }
  try {
    await navigator.clipboard.writeText(JSON.stringify(out, null, 1));
    $('#detail').textContent = `Copied the shape of the page (${out.listItems} conversation${out.listItems === 1 ? '' : 's'} found). Paste it where the reader is being fixed.`;
  } catch {
    $('#detail').textContent = 'The clipboard could not be used.';
  }
});

$('#mailShape').addEventListener('click', async () => {
  const out = await chrome.runtime.sendMessage({ type: 'mailShape' });
  if (!out || out.error) { $('#mail').textContent = (out && out.error) || 'Could not read the Gmail page.'; return; }
  try {
    await navigator.clipboard.writeText(JSON.stringify(out, null, 1));
    $('#mail').textContent = `Copied the shape of the Gmail page (${out.containers} message${out.containers === 1 ? '' : 's'} found). Paste it where the reader is being fixed.`;
  } catch {
    $('#mail').textContent = 'The clipboard could not be used.';
  }
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.last) paint(changes.last.newValue);
  if (changes.lastMail) paintMail(changes.lastMail.newValue);
});
load();
