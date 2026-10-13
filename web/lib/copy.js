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
  'action.aiModel': 'Which AI writes the suggestions',
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
  'welcome.learned.title': 'Wheelman learns from the replies you change before sending, the ones you mark Good reply, what you write under Could be better, and the reply later seen sent. Dashboard conversations teach the dashboard; import emails teach Import Query.',
  'welcome.reads.dashboard': 'Reads {team} the team sent in the last year, whoever sent them and from wherever, and {voice} of our salespeople\'s own replies',
  'welcome.reads.dashboard.title': 'Every reply in a dashboard conversation in the last year is shown to the AI when a similar message comes in, whoever sent it: from the dashboard, from the phone, or in person. The salespeople\'s own replies set the voice. Nothing sent from Wheelman is needed for this.',
  'welcome.reads.email': 'Reads {n} past import {n, one: email, other: emails} the team answered',
  'welcome.reads.email.title': 'Every email thread sent from Gmail where the team wrote back is shown to the AI when a similar import enquiry comes in, whoever wrote the reply. Send the old threads too.',
  'welcome.reads.none': 'Nothing of the team\'s replies read yet',
  'practice.team': '{n} {n, one: reply, other: replies}',
  'learned.changed': '{n} {n, one: reply, other: replies} you changed',
  'learned.approved': '{n} you approved',
  'learned.notes': '{n} {n, one: note, other: notes}',
  'welcome.backup': 'Backed up {when} to {dir}',
  'welcome.backup.none': 'Not backed up yet. A backup is written when Wheelman closes, and once a day.',
  'welcome.backup.off': 'Backups are switched off (BACKUPS=0 in the .env file).',
  'welcome.backup.title': 'One file with the database, the settings, the staff names and the voice files. Copy it to another computer and double-click "Restore Wheelman.cmd" there to carry Wheelman across, with everything it has learned.',
  'welcome.shared': 'Shared with the team at',
  'welcome.shared.title': 'Colleagues open this address in any browser and type the team password (TEAM_PASSWORD in the .env file). A trycloudflare.com address changes each time Wheelman starts.',
  'welcome.shared.opening': 'Opening the team link ...',
  'welcome.shared.down': 'The team link is down: {why}',
  'welcome.ai': 'Suggestions are written by {model}.',
  // An ordinary enquiry read as an import enquiry, and the owner's rulings on it.
  'judged.title': 'Import enquiry',
  'judged.read': 'Read as an import enquiry: {why}. The reply is written the import way.',
  'judged.ai': 'The AI thought this might be an import enquiry: a car to find in Japan, not one on the yard.',
  'judged.move': 'Move to Import Query',
  'judged.back': 'Move back to Dashboard',
  'judged.not': 'Not an import enquiry',
  'judged.treat': 'Treat as an import enquiry',
  'judged.info.read': 'Wheelman reads this as an import enquiry: {why}. The reply is written the import way: what they are looking for is asked first, then the Japan auctions are searched.',
  'judged.info.owner': 'You said this is an import enquiry. The reply is written the import way.',
  'judged.info.general': 'You said this is not an import enquiry. The reply is written the ordinary way.',
  'judged.info.moved': 'You moved this conversation to Import Query. It still came from the dashboard, and the reply still goes out from there.',
  'judged.info.none': 'An ordinary enquiry. If this customer wants a car found in Japan, say so and the reply is written the import way.',
  'toast.movedToImport': 'Moved to Import Query.',
  'toast.movedToDashboard': 'Moved back to Dashboard.',
  'toast.ruledGeneral': 'Treated as an ordinary enquiry.',
  'toast.ruledImport': 'Treated as an import enquiry.',
  'toast.rewriting': ' The reply is being written again.',
  'welcome.ai.none': 'No AI key is filled in yet, so no suggestions can be written.',
  'welcome.ai.change': 'Change',

  // The panel behind the cog: which AI writes.
  'ai.title': 'Which AI writes',
  'ai.close': 'Close',
  'ai.reading': 'Reading the settings…',
  'ai.intro': 'The provider and the model that write the suggestions. The other models are asked only when this one does not answer.',
  'ai.provider': 'Provider',
  'ai.provider.noKey': '{label}, no key yet',
  'ai.paid': '{label} charges for every request and has no free allowance, so Wheelman\'s own cap of {limit} requests a day is the only limit.',
  'ai.model': 'Model',
  'ai.other': 'Another model…',
  'ai.other.label': "The model's name",
  'ai.other.placeholder': "Type the model's name as the provider writes it",
  'ai.other.empty': "Type the model's name first.",
  'ai.list.loading': 'Reading the list of models…',
  'ai.list.live': 'The models {label} offers right now.',
  'ai.list.known': 'The list could not be read from {label} ({why}) These are the models Wheelman knows of.',
  'ai.refresh': 'Read it again',
  'ai.marketplace': 'Use it for Marketplace too',
  'ai.marketplace.note': 'Otherwise Marketplace keeps to {model} and the free models after it: the better ones stay with dashboard customers, and nothing paid is spent on Marketplace.',
  'ai.key.missing': 'No {label} key is filled in yet. Create one at',
  'ai.key.kept': 'and paste it here. It is kept in the .env file on this computer and is never shown again.',
  'ai.key.remote': 'A key can only be pasted on the computer Wheelman runs on. There, open this panel or add {name} to the .env file.',
  'ai.key.label': 'The key',
  'ai.key.placeholder': 'Paste the key',
  'ai.key.save': 'Save the key',
  'ai.key.checking': 'Trying the key…',
  'ai.key.saved': 'The {label} key works and is saved.',
  'ai.key.savedUnchecked': 'The {label} key is saved. {label} could not be reached to check it.',
  'ai.use': 'Use this model',
  'ai.cancel': 'Cancel',
  'ai.writing': 'Written by {model} now.',
  'ai.writing.none': 'Nothing writes suggestions yet.',
  // "Used so far", lower in the same panel: what the AI has been asked, by model.
  'ai.usage.title': 'Used so far',
  'ai.usage.model': 'Model',
  'ai.usage.today': 'Today',
  'ai.usage.month': 'This month',
  'ai.usage.requests': '{n} {n, one: request, other: requests}',
  'ai.usage.tokens': '{in} tokens in, {out} out',
  'ai.usage.none': 'none',
  'ai.usage.nothing': 'Nothing has been asked yet.',
  'ai.usage.cap': '{used} of {limit} requests used today across every model. The cap starts again at midnight Sydney time.',
  'ai.usage.intro': "Tokens are what the paid providers charge for, roughly four letters each; a model's thinking counts as tokens out. What it has cost is on the provider's own page:",
  'toast.aiChosen': 'Suggestions are now written by {model}.',

  'toast.phoneCopied': 'Phone number copied',
  'toast.sent': 'Sent. It is on its way to the buyer.',
  'toast.sentQueued': 'Queued. The Marketplace system sends it as soon as its phone is back online.',
  'composer.sending': 'Your reply is on its way. The Marketplace system is typing it into the chat from the phone.',
  'composer.replied': 'We have replied. Nothing is waiting here.',
  'composer.waiting': 'A suggestion will be written within a few minutes.',
  'composer.retry.busy': 'The free AI models are busy. Wheelman tries again at {time}, or you can write it now.',
  'composer.retry.daily': "The free AI models have used up today's allowance. Wheelman tries again at {time}.",
  'composer.retry.marketplace': 'The AI model for Marketplace is busy. Wheelman tries again at {time}, or you can write it now.',
  'composer.prompt': 'Prompt',
  'composer.prompt.title': 'Say what this reply should say before Wheelman writes it. Use it when you want something particular said; otherwise Wheelman writes by itself.',
  'composer.prompt.placeholder': 'What should the reply say? For example: we have none of that model, we can source one',
  'composer.prompt.label': 'What this reply should say',
  'composer.prompt.write': 'Write from this',
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
