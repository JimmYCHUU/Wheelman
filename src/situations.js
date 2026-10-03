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
  // Only a clear wish to see or drive the car. Opening-hours questions belong to location_hours,
  // and "what time can I pick it up" or "booking reference" are not inspection requests.
  inspection_booking: {
    label: 'Inspection or test drive',
    re: /(\binspect|test[\s-]?drive|\bavailable (to|for) (see|view|look at|check out|a look|an? (viewing|inspection))\b|\b(see|view|look at|check out) (this|that) (car|van|vehicle|one|bus|ute|truck|motorhome|camper\w*)\b|\b(see|view) (it|this|that|them)\b.{0,12}\b(today|tomorrow|tonight|this (week|weekend|morning|afternoon|arvo|evening)|(mon|tues?|wed(nes)?|thur?s?|fri|sat(ur)?|sun)(day)?)\b|\b(come|pop|drop|swing)\b.{0,14}\b(see|look|view|check)\b|\b(have|take) a look\b|\b(see|view|look at|check out) (it|the (car|van|vehicle|bus|ute|truck|one|motorhome|camper\w*))\b|\bin person\b|\bviewing\b|\bbook (an? |in an? )?(inspection|viewing|test|time to (see|view|look))|\b(can|could|may) (i|we) (come|visit|pop|drop)\b(?!.{0,25}\b(pick|collect|pay|grab)\b)|\b(like|love|want|wanting|hoping|keen|planning) to (come (in|down|by|over|past)?( and)? ?(see|look|view)?|visit|see it|view it)\b|\b(pop|drop|swing) (in|by|past)\b|\bgood (day|time) to (come|see|view|inspect|look|visit))/i,
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
    re: /(where (are|r) (you|u)|where ?abouts?|whereabouts|located|location|your address|what('s| is) (the|your) address|opening hours|what (hours|time) (are|do) you|which suburb|are you (guys )?open|open (today|tomorrow|on|this|sat|sun)|when (are|do) you (open|close))/i,
  },
  availability: {
    label: 'Is it still available',
    re: /(still available|available\s*\??|is (it|this|that|the \w+) (still )?(available|for sale|there)|still for sale|has (it|this) (been )?sold|is it sold|sold yet)/i,
  },
};

const PRIORITY = ['complaint', 'after_sale', 'price_negotiation', 'trade_in', 'finance', 'deposit_hold', 'delivery_interstate',
  'inspection_booking', 'history_kms', 'rego_roadworthy', 'warranty', 'photos_video', 'import_sourcing', 'vehicle_details',
  'location_hours', 'availability'];

/** Lead statuses that mean the customer has bought or paid a deposit. */
export const BUYER_STATUSES = /^(CAR_SOLD|DEPOSIT_RECEIVED|CLOSED_WON)$/i;

/**
 * @param {string} text   The customer's pending words (their own text only).
 * @param {object} extra  { events: string[], leadStatus: string, buyer: boolean }
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

  if (extra.buyer) {
    // Someone who has already bought is not asking to inspect the car or whether it is available.
    found.delete('inspection_booking');
    found.delete('availability');
    found.delete('general');
    found.add('after_sale');
  } else if (found.has('after_sale') && !BUYER_STATUSES.test(String(extra.leadStatus || ''))) {
    // "after the sale" only counts when the lead really has bought or paid a deposit.
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
 * Whether the customer is probably far from Sydney, and how we know.
 * source 'said': they wrote it themselves, so a reply may act on it.
 * source 'record': only their lead record says another state. That is a hint for which link to
 * offer; a reply must never say or imply where the customer lives on that basis.
 */
export function farAway(customerText, leadState = '') {
  if (FAR_AWAY.test(String(customerText || ''))) return { far: true, source: 'said' };
  const state = String(leadState || '').trim();
  if (state && !/^(nsw|new south wales)$/i.test(state)) return { far: true, source: 'record' };
  return { far: false, source: null };
}

/** True when the customer has said they live far away or cannot visit, or their record is in another state. */
export function livesFarAway(customerText, leadState = '') {
  return farAway(customerText, leadState).far;
}

/** States and cities away from Sydney. A reply must not name one unless the customer did first. */
export const PLACES = /\b(queensland|victoria|tasmania|western australia|south australia|northern territory|brisbane|melbourne|perth|adelaide|hobart|darwin|canberra|gold coast|sunshine coast|cairns|townsville|toowoomba|geelong|newcastle|coffs harbour|port macquarie|byron bay|lismore|tamworth|dubbo|wagga|albury|bathurst|armidale|broken hill)\b/i;

export const labelFor = (key) => SITUATIONS[key]?.label || 'General enquiry';
