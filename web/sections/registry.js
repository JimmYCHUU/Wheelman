// The three sections as data: what each is called, its three lists, its search, its empty
// states and its welcome words. The views read this instead of branching on the section name.

export const SECTIONS = {
  dashboard: {
    id: 'dashboard',
    label: 'Dashboard',
    prefixes: ['c:', 'l:', 'ph:'],
    noun: ['customer', 'customers'],
    person: 'Customer',
    unknown: 'Unknown number',
    // "All" is every conversation, newest message first whoever wrote it; "Waiting" those that need a
    // reply. Senders that are not customers (codes, couriers, the ignore list) are never listed.
    tabs: [
      { id: 'all', label: 'All' },
      { id: 'waiting', label: 'Waiting', counted: true },
      null,
    ],
    search: { placeholder: 'Search name, number or message', phone: true },
    place: 'the dashboard',
    placeShort: 'Dashboard',
    phone: true,
    empty: {
      all: ['No conversations yet', 'Conversations appear here as they come in, newest first.'],
      waiting: ['Nobody is waiting', 'New customer messages appear here with a reply ready to check.'],
      quiet: ['Nothing here', 'Customers who only said thanks, opted out, or are no longer looking, and conversations you dismissed.'],
      other: ['Nothing here', 'Texts from suppliers, couriers and marketers.'],
      search: ['Nothing matches', 'Try a name, part of a phone number, or a word from the message.'],
    },
    welcome: { pick: 'Pick a customer', check: 'Check the reply', paste: 'and send it from the dashboard.' },
    more: 'Load older conversations',
    backTo: 'Waiting',
    dismiss: 'Dismiss this conversation',
    copyTarget: 'the dashboard',
  },
  marketplace: {
    id: 'marketplace',
    label: 'Marketplace',
    prefixes: ['mp:'],
    noun: ['buyer', 'buyers'],
    person: 'Buyer',
    unknown: 'Marketplace buyer',
    tabs: [
      { id: 'all', label: 'All' },
      { id: 'waiting', label: 'Waiting', counted: true },
      null,
    ],
    search: { placeholder: 'Search name, car or message', phone: false },
    place: 'Marketplace',
    placeShort: 'Marketplace',
    phone: false,
    empty: {
      all: ['No chats yet', 'Marketplace chats appear here as they come in, newest first.'],
      waiting: ['Nobody is waiting', 'Marketplace chats where the buyer wrote last appear here with a reply ready to check.'],
      quiet: ['Nothing here', 'Buyers who only said thanks, archived chats, and chats you dismissed.'],
      other: ['Nothing here', ''],
      search: ['Nothing matches', 'Try a name, a car or a word from the message.'],
    },
    welcome: { pick: 'Pick a buyer', check: 'Check the reply', paste: 'and it goes to the Marketplace chat. Or copy it and paste it there yourself.' },
    more: 'Load older conversations',
    backTo: 'Waiting',
    dismiss: 'Dismiss this conversation',
    copyTarget: 'the Marketplace chat',
  },
  auction: {
    id: 'auction',
    label: 'Auction',
    prefixes: ['ao:'],
    noun: ['order', 'orders'],
    person: 'Customer',
    unknown: 'Auction customer',
    tabs: [
      { id: 'waiting', label: 'To do', counted: true },
      { id: 'quiet', label: 'In progress' },
      { id: 'other', label: 'Finished' },
    ],
    search: { placeholder: 'Search name, car or order number', phone: true },
    place: 'the dashboard',
    placeShort: 'Dashboard',
    phone: false,
    empty: {
      waiting: ['Nothing to do', 'Auction orders that need a message appear here with the message ready to check.'],
      quiet: ['Nothing here', 'Orders that are under way with no message due.'],
      other: ['Nothing here', 'Orders that are completed, cancelled or refunded.'],
      search: ['No order matches', 'Every order on the dashboard was searched: To do, In progress and Finished. Try a name, a car or an order number.'],
    },
    welcome: { pick: 'Pick an order', check: 'Check the message', paste: 'and paste it into WhatsApp.' },
    more: 'Load more orders',
    backTo: 'To do',
    dismiss: 'Dismiss this message',
    copyTarget: 'WhatsApp',
  },
};

// The model replies: invented scenarios with a reply in the house voice, rated one by one. An
// approved one sets the standard the AI matches for similar messages.
SECTIONS.standards = {
  id: 'standards',
  label: 'Standards',
  prefixes: ['tr:'],
  noun: ['model reply', 'model replies'],
  person: 'Customer',
  unknown: 'Invented customer',
  tabs: [
    { id: 'waiting', label: 'To rate', counted: true },
    { id: 'quiet', label: 'Approved' },
    { id: 'other', label: 'Set aside' },
  ],
  search: { placeholder: 'Search situation, car or message', phone: false },
  place: 'the dashboard',
  placeShort: 'Dashboard',
  phone: false,
  empty: {
    waiting: ['Nothing to rate', 'Every model reply has been rated. Edit voice/model-replies.md to add more.'],
    quiet: ['Nothing approved yet', 'Model replies you mark Good reply appear here and set the standard.'],
    other: ['Nothing set aside', 'Model replies you set aside appear here and can be put back.'],
    search: ['Nothing matches', 'Try a situation, a car or a word from the message.'],
  },
  welcome: { pick: 'Pick a model reply', check: 'Read the reply', paste: 'then mark it Good reply, or say what could be better and it is written again.' },
  backTo: 'To rate',
  dismiss: 'Set this one aside',
  copyTarget: '',
};

export const SECTION_IDS = Object.keys(SECTIONS);

/** Which section a conversation key belongs to: c:, l: and ph: are the dashboard; mp: Marketplace; ao: Auction. */
export const sectionOf = (key) => SECTION_IDS.find((id) => SECTIONS[id].prefixes.some((p) => String(key || '').startsWith(p))) || 'dashboard';

/** The list a conversation state sits on, and the name of that list for an order found by a search on another list. */
export const TAB_STATE = { waiting: 'awaiting', quiet: 'answered', other: 'closed' };
export const ORDER_LIST = { awaiting: 'To do', answered: 'In progress', closed: 'Finished' };
