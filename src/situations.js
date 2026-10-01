// Works out what a customer is asking about, using plain keyword rules (no AI call).
// The result picks which real example replies and which facts go into the draft request.

export const SITUATIONS = {
  complaint: {
    label: 'Complaint or dispute',
    re: /(fair trading|\brefund|not happy|unhappy|disappoint|dishonest|\bcomplaint|complain (to|about)|lawyer|solicitor|legal action|tribunal|\bncat\b|\baccc\b|scam|rip.?off|misleading|\blemon\b|faulty|still broken|still not (working|fixed)|warranty claim|unacceptable|ridiculous|waste of (my )?time)/i,
  },
  after_sale: {
    label: 'After the sale (paperwork, pickup, delivery)',
    re: /(invoice|receipt|payment (done|sent|made)|(have|i've|ive|just) (paid|transferred|sent the)|notice of disposal|personalised plates?|number plates?|transfer(red)? the rego|tracking|booking (number|reference)|when (will|can) (it|the car|the van|my car|my van) (be )?(ready|arrive|delivered|picked)|ready (for|to) pick ?up|pick(ing)? (it )?up (on|at|tomorrow|today)|bank cheque|who (do )?i pay)/i,
  },
  price_negotiation: {
    label: 'Price, discount or offer',
    re: /(best price|lowest|discount|negotiab|\boffer\b|would you (take|accept|do|sell)|will you (take|accept|do)|can you do (it for |\$)|accept \$?\d|drive.?away|cash price|knock (some|anything|a bit) off|room to move|any movement|wiggle room|final price|how much (is it|for|total|all up)|total (cost|price|amount)|\bfor \$?\d{2}(k|,?\d{3})\b)/i,
  },
  trade_in: {
    label: 'Trade-in',
    re: /(trade[\s-]?in|trade my|trading (in )?my|\bswap\b|part exchange|valuation|what would you give)/i,
  },
  finance: {
    label: 'Finance',
    re: /(financ|\bloan\b|repayment|pre[\s-]?approv|weekly payment|per week|interest rate|credit (score|check|history)|payment plan|instal?lment|novated|\blease\b)/i,
  },
  deposit_hold: {
    label: 'Deposit or holding the car',
    re: /(deposit|hold (it|the car|the van|this|that)|put (it )?on hold|reserve|secure (it|the))/i,
  },
  delivery_interstate: {
    label: 'Delivery or interstate buyer',
    re: /(deliver|interstate|transport|shipping|ship (it|to)|freight|sight unseen|site unseen|\b(qld|vic|tas|queensland|victoria|tasmania|western australia|south australia|northern territory|brisbane|melbourne|perth|adelaide|hobart|darwin|canberra|gold coast|sunshine coast|cairns|townsville|toowoomba|geelong)\b|\b(i'?m|we'?re|i am|we are|live) (in|from) (wa|sa|nt|act)\b)/i,
  },
  inspection_booking: {
    label: 'Inspection or test drive',
    re: /(inspect|test[\s-]?drive|come (in|and|to|down|by|over|see|look)|have a look|take a look|view(ing)?\b|see (it|the car|the van|the vehicle)|appointment|\bbook\b|booking|pop in|drop (by|in)|visit|good (day|time) to|what time|are you open|open (today|tomorrow|on|this|sat|sun))/i,
  },
  history_kms: {
    label: 'Kilometres, history and condition',
    re: /(\bkms?\b|\bklms?\b|kilomet|odomet|mileage|log ?books?|service (history|record)|auction (sheet|grade|report)|export cert|genuine|accident|written[\s-]?off|how many owners|previous owners?|\brust|flood|repaired|condition report|ppsr|history (check|report))/i,
  },
  rego_roadworthy: {
    label: 'Registration, roadworthy and on-road costs',
    re: /(\brego\b|registration|registered|blue slip|pink slip|roadworthy|\brwc\b|\bctp\b|green slip|stamp duty|on[\s-]?road|government charges|gov charges|transfer fee)/i,
  },
  warranty: {
    label: 'Warranty',
    re: /warrant/i,
  },
  photos_video: {
    label: 'Photos or video',
    re: /(photo|video|picture|\bpics?\b|walk[\s-]?around|images|footage)/i,
  },
  import_sourcing: {
    label: 'Importing or sourcing a car from Japan',
    re: /(\bimport|\bsource\b|sourcing|auction|from japan|\bbid\b|landed (price|cost)|compliance|\bcomply\b|can you (find|get) (me )?(a|an|one))/i,
  },
  vehicle_details: {
    label: 'Features and specifications',
    re: /(seat|sunroof|camera|carplay|android auto|tow ?bar|towing|\btow\b|cruise control|\bawd\b|\b4wd\b|4x4|\b2wd\b|diesel|petrol|hybrid|battery|turbo|engine|timing (belt|chain)|transmission|manual|automatic|\bauto\b|height|length|width|dimension|how (tall|long|wide|high)|colour|color|\bkeys?\b|spare (tyre|tire|wheel|key)|tyres|tires|toilet|shower|fridge|solar|awning|pop ?top|high ?roof|low ?roof|sliding door|bluetooth|navigation|english|leather|air ?con|heater|fuel (economy|consumption)|how many doors|cc\b)/i,
  },
  location_hours: {
    label: 'Location and opening hours',
    re: /(where (are|r) (you|u)|where ?abouts?|whereabouts|located|location|your address|what('s| is) (the|your) address|opening hours|what (hours|time) (are|do) you|which suburb)/i,
  },
  availability: {
    label: 'Is it still available',
    re: /(still available|available\s*\??|is (it|this|that|the \w+) (still )?(available|for sale|there)|still for sale|has (it|this) (been )?sold|is it sold|sold yet)/i,
  },
};

const PRIORITY = ['complaint', 'after_sale', 'price_negotiation', 'trade_in', 'finance', 'deposit_hold', 'delivery_interstate',
  'inspection_booking', 'history_kms', 'rego_roadworthy', 'warranty', 'photos_video', 'import_sourcing', 'vehicle_details',
  'location_hours', 'availability'];

const SOLD_STATUSES = /^(CAR_SOLD|DEPOSIT_RECEIVED|SOLD|DELIVERED)$/i;

/**
 * @param {string} text   The customer's pending words (their own text only).
 * @param {object} extra  { events: string[], leadStatus: string }
 * @returns {{ primary: string, all: string[], label: string }}
 */
export function classify(text, extra = {}) {
  const t = String(text || '');
  const events = (extra.events || []).join(' ');
  const found = new Set();
  for (const key of PRIORITY) if (SITUATIONS[key].re.test(t)) found.add(key);

  if (/finance application/i.test(events)) found.add('finance');
  if (/booked (an inspection|a test drive)/i.test(events)) found.add('inspection_booking');
  if (/trade-in request|vehicle to trade in/i.test(events)) found.add('trade_in');
  if (/online purchase steps/i.test(events)) found.add('deposit_hold');
  if (/call back/i.test(events)) found.add('general');

  // "after the sale" only counts when the lead really has bought or paid a deposit.
  if (found.has('after_sale') && !SOLD_STATUSES.test(String(extra.leadStatus || ''))) {
    if (found.size > 1) found.delete('after_sale');
  }
  if (!found.size) found.add('general');

  const all = PRIORITY.filter((k) => found.has(k));
  if (found.has('general') && !all.length) all.push('general');
  const primary = all[0] || 'general';
  return { primary, all, label: SITUATIONS[primary]?.label || 'General enquiry' };
}

// Signs that a customer cannot easily come to the Lidcombe yard.
const FAR_AWAY = new RegExp([
  'interstate', 'far away', 'too far', 'long (way|drive|distance)', '\\d+\\s?(hours?|hrs?) (away|drive)', 'hours? away',
  'not in sydney', 'out of (town|state|sydney)', 'outside (of )?(sydney|nsw)', 'sight unseen', 'site unseen', 'regional',
  "(can'?t|cannot|unable to|not able to|aren'?t able to|won'?t be able to) (come|get|travel|make it|drive) (all the way|that far|to sydney|to lidcombe|down there|up there|over there)",
  '\\b(qld|vic|tas|queensland|victoria|tasmania|western australia|south australia|northern territory)\\b',
  '\\b(brisbane|melbourne|perth|adelaide|hobart|darwin|canberra|gold coast|sunshine coast|cairns|townsville|toowoomba|geelong|newcastle|coffs harbour|port macquarie|byron bay|lismore|tamworth|dubbo|wagga|albury|bathurst|armidale|broken hill)\\b',
  "\\b(i'?m|we'?re|i am|we are|live|living|based) (in|from) (wa|sa|nt|act)\\b",
].join('|'), 'i');

/**
 * True when the customer has said they live far from Sydney or cannot visit, or their lead
 * record is in another state. Used to choose between the two inspection booking links.
 */
export function livesFarAway(customerText, leadState = '') {
  const state = String(leadState || '').trim();
  if (state && !/^(nsw|new south wales)$/i.test(state)) return true;
  return FAR_AWAY.test(String(customerText || ''));
}

export const labelFor = (key) => SITUATIONS[key]?.label || 'General enquiry';
