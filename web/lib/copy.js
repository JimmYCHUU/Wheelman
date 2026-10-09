// Every sentence the page shows, in one place, so the same thing is always called the same thing.
//
// The words: Wheelman (never "the agent"). A suggestion is what Wheelman wrote; a reply is what goes
// to the customer; a message is an auction template. A conversation (never a chat); a customer, a
// buyer or an order, from the section. "Phone only" means the dashboard does not have it; "From the
// shop phone" means our side sent it from the phone. "Needs you" is a Marketplace chat handed to a
// person. "Due: …" on an auction row, never "Send:". Links say "Open …". One "Put back in {list}".
//
// t('status.checked', { place: 'the dashboard', ago: '2 min ago' }) fills {place} and {ago}.
// A plural reads {n, one: message, other: messages} and picks by the number given as n.

export const COPY = {
  'app.name': 'Wheelman',
  'app.by': 'by Carbarn',

  'status.notResponding': 'Wheelman is not responding',
  'status.checking': 'Checking {place}',
  'status.writing': 'Writing suggestions',
  'status.checked': '{place} checked {ago}',
  'status.notReached': '{place} not reached',
  'status.notChecked': '{place} not checked yet',
  'status.ai': '{used} of {limit} AI requests used today',
  'status.alerts.checked': 'Lead alerts checked {ago}',
  'status.alerts.notReached': 'Lead alerts not reached',
  'status.phone.heard': 'Phone add-on heard {ago}',
  'status.phone.stale': 'The phone add-on has not reported since {time}',
  'status.models': 'AI models, tried in order:',
  'status.model.dashboardOnly': 'dashboard customers only',
  'status.model.usedUp': "today's free allowance used up, back about {time}",
  'status.model.busy': 'busy',

  'action.checkNow': 'Check for new messages now',
  'action.search': 'Search conversations',
  'action.backToList': 'Back to conversations',

  'tag.check': 'Check the reply',
  'tag.blank': 'Blank to fill',
  'tag.needsYou': 'Needs you',
  'tag.dismissed': 'Dismissed',
  'tag.phoneOnly': 'Phone only',
  'tag.standard.proposed': 'To rate',
  'tag.standard.changed': 'Written again',
  'tag.standard.approved': 'Approved',
  'tag.standard.rejected': 'Set aside',

  'thread.loadOlder': 'Load older messages',
  'thread.older': '{n} more',
  'list.more': '{n} more',

  'row.you': 'You: ',
  'row.photo': 'Photo',
  'row.unread': '{n, one: unread message, other: unread messages}',
  'row.newIn.dashboard': '{n, one: conversation with new messages, other: conversations with new messages}',
  'row.newIn.marketplace': '{n, one: conversation with new messages, other: conversations with new messages}',
  'row.newIn.auction': '{n, one: order with something new, other: orders with something new}',
  'row.newIn.importquery': '{n, one: enquiry with new messages, other: enquiries with new messages}',
  'tag.folded': 'Folded in Gmail',
  'row.newIn.standards': '{n, one: model reply not looked at yet, other: model replies not looked at yet}',
  'standards.done': 'Every model reply is rated. The Standards tab leaves the page until one needs rating again.',

  'notice.setup.title': 'Setup is not finished',
  'notice.setup.body': 'Open the file .env, fill in what is listed here, then restart Wheelman.',
  'notice.dashboard.title': 'The dashboard could not be reached',
  'notice.marketplace.title': 'The Marketplace inbox could not be reached',
  'notice.marketplace.body': '{message} The Dashboard section is not affected.',
  'notice.draft.title': 'A suggestion could not be written',
  'notice.paused.title': 'Suggestions are paused',
  'notice.paused.body': 'Every free AI model has used up its allowance for today. Suggestions resume by themselves.',
  'notice.phone.stale.title': 'The phone add-on has not reported since {time}',
  'notice.phone.stale.body': 'Wheelman keeps working from the dashboard. Check that Chrome is open with the Messages tab in it.',
  'notice.phone.signedOut.title': 'Messages for web is signed out',
  'notice.phone.signedOut.body': 'Open the Messages tab in Chrome and sign in again. Until then, texts the dashboard misses are not caught.',
  'notice.phone.unreadable.title': 'The phone add-on could not read the Messages list',
  'notice.phone.unreadable.body': 'The Messages page may have changed. In the add-on, use Copy page details so the reader can be fixed.',

  'list.notResponding.title': 'Wheelman is not responding',
  'list.notResponding.body': 'Check that it is still running in its black window, then reload this page.',
  'list.loading': 'Loading conversations',

  'footer.orders': '{orders} read from the dashboard: {waiting} to do, {quiet} in progress, {other} finished.',
  'footer.orders.title': "Every order on the dashboard's auction page is read on each check. To do: a message is due, or the customer wrote. In progress: under way, nothing due. Finished: completed, cancelled or refunded (kept for 60 days). Search looks through all of them.",

  'welcome.waiting': '{n} {noun} waiting for a reply',
  'welcome.todo': '{n} {noun} with something to do',
  'welcome.nobody': 'Nobody is waiting right now',
  'welcome.noOrder': 'No auction order needs a message right now',
  'welcome.fromList': 'from the list.',
  'welcome.checkIt': 'waiting in the message box. Fill in anything highlighted.',
  'welcome.copy': 'Copy it',
  'welcome.send': 'Send it',
  'welcome.copyOnly': 'Nothing is sent to a customer from this page. You copy the reply and send it yourself.',
  'welcome.sendOnly': 'A reply reaches the buyer only when you press Send. Nothing is sent by itself.',
  'welcome.learned': 'Learned from {bits}',
  'welcome.learned.title': 'Wheelman learns from the replies you change before sending, the ones you mark Good reply, and what you write under Could be better. Only dashboard conversations are used.',
  'learned.changed': '{n} {n, one: reply, other: replies} you changed',
  'learned.approved': '{n} you approved',
  'learned.notes': '{n} {n, one: note, other: notes}',
  'welcome.backup': 'Backed up {when} to {dir}',
  'welcome.backup.none': 'Not backed up yet. A backup is written when Wheelman closes, and once a day.',
  'welcome.backup.off': 'Backups are switched off (BACKUPS=0 in the .env file).',
  'welcome.backup.title': 'One file with the database, the settings, the staff names and the voice files. Copy it to another computer and double-click "Restore Wheelman.cmd" there to carry Wheelman across, with everything it has learned.',

  'toast.phoneCopied': 'Phone number copied',
  'toast.sent': 'Sent. It is on its way to the buyer.',
  'toast.sentQueued': 'Queued. The Marketplace system sends it as soon as its phone is back online.',
  'composer.sending': 'Your reply is on its way. The Marketplace system is typing it into the chat from the phone.',
  'composer.replied': 'We have replied. Nothing is waiting here.',
  'composer.copyEmail': 'Copied. Paste it into your reply in Gmail.',
  'toast.emailCopied': 'Email address copied',
  'info.research.none': 'Notes from the website about the model they asked for will appear here.',
  'toast.checked': '{placeShort} checked',
  'toast.notReached': '{place} could not be reached',
};

const PLURAL = /\{(\w+), one: ([^,}]*), other: ([^}]*)\}/g;

/** The sentence for a key, with {name} and {n, one: …, other: …} filled in from vars. */
export function t(key, vars = {}) {
  let s = COPY[key];
  if (s === undefined) return key;
  s = s.replace(PLURAL, (m, n, one, other) => (Number(vars[n]) === 1 ? one : other));
  return s.replace(/\{(\w+)\}/g, (m, name) => (vars[name] === undefined || vars[name] === null ? '' : String(vars[name])));
}

/** "a, b and c" */
export function listOf(parts) {
  const p = parts.filter(Boolean);
  return p.length > 1 ? `${p.slice(0, -1).join(', ')} and ${p[p.length - 1]}` : p[0] || '';
}
