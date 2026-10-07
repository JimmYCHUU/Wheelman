// What a reply is for. Every customer who writes about a car is somewhere on a ladder that ends
// in a sale: interested, wanting proof, working out fit and cost, ready to commit, a buyer. A reply
// answers what was asked and then moves them one rung up, in one concrete next step, with at most
// one question. This module works out the rung and the move from the records; the words come from
// voice/sales-playbook.md and the two voices. Nothing here reads customer details.

import { SITUATIONS, farAway } from './situations.js';
import { availability } from './normalize.js';
import { reservedByAnother } from './deal.js';
import { findUrls } from './text.js';

const DAY = 24 * 3600 * 1000;

export const RUNGS = ['interest', 'proof', 'fit', 'commit', 'buyer'];

/** Where the customer is, in words the AI and the page both use. */
export const RUNG_LABELS = {
  interest: 'interested: asking whether the car is real, available or right for them',
  proof: 'wants proof: history, condition, photos, or cannot see the car in person',
  fit: 'working out fit and cost: price, finance, trade-in, delivery, what is included',
  commit: 'ready to commit: has booked or seen the car, asked to hold it, or started buying',
  buyer: 'a buyer: a deposit is paid or a sale is recorded',
};

/** The one next step to aim for from each rung. */
export const AIMS = {
  interest: 'get them to see the car: an inspection at Lidcombe, or the online video inspection when they are far away',
  proof: 'give the proof, then get them to see the car',
  fit: 'settle the cost question in one line, then get them to see the car or to the finance application',
  commit: 'the $1,000 refundable holding deposit, with what it needs and what happens next',
  buyer: 'the next practical step of their purchase',
};

// Situations that mean the customer is working out whether the deal fits.
const FIT = new Set(['price_negotiation', 'finance', 'trade_in', 'delivery_interstate', 'rego_roadworthy', 'warranty']);

// A customer who has said no, or has bought elsewhere. Nothing is pushed after this.
export const DECLINED = /\b(not interested|no longer (interested|looking|need)|already (bought|purchased|got one|sorted)|bought (one |something )?(elsewhere|somewhere else|another)|gone with (another|someone else)|changed (my|our) mind|found (one|something|another)|no thanks?|not (for me|what i'?m after)|give it a miss|pass on (it|this)|i'?ll pass)\b/i;

/** They cannot make the visit that was arranged: not a no to the car, but not a commitment either. */
export const CANNOT_COME = /\b(can'?t|cannot|can not|unable to|not able to|won'?t be able to|will not be able to) (come|make it|get (there|down|up|in|over)|get to|travel|drive)\b/i;

/**
 * The moves. Each is what the reply does after answering, and the one question it may ask.
 * The AI is told the move in words; the question is the only one it may ask unprompted.
 */
export const MOVES = {
  accept_no: {
    text: 'They have said no. Accept it in a line, thank them, and stop: no next step, no question, and no other car unless they asked for one. A customer who feels no pressure comes back.',
    question: '',
  },
  invite_inspection: {
    text: 'Answer, then invite them to come and see it at Lidcombe, in words. The booking link is governed by INSPECTION: give it only if that section supplies it. If it helps them decide, offer the walkaround video and the auction sheet.',
    question: 'Would a weekday after work or Saturday morning suit you to see it?',
  },
  answer_then_invite: {
    text: 'Answer the question from the facts, add the one detail that matters for what they asked, then invite them to see the car in words. No booking link unless INSPECTION supplies it.',
    question: '',
  },
  confirm_or_link: {
    text: 'They want to see it: follow INSPECTION for the link or the confirmation. If the day and time they named work, confirm them in a line and say the car will be out the front for them.',
    question: '',
  },
  offer_proof: {
    text: 'Give the proof the records hold: the auction grade and sheet, the export certificate with the odometer history, PPSR, the service done. If VEHICLE FACTS list a flaw, name it before they ask. Offer the walkaround video and underbody photos. Then invite them to see it, or to have their own mechanic look at it.',
    question: 'Would you like the auction sheet and the export certificate sent through?',
  },
  offer_online_inspection: {
    text: 'Say that most of our interstate buyers do a live video inspection on WhatsApp or FaceTime and we deliver Australia-wide by car carrier. The online video inspection link is governed by INSPECTION. A delivery price is quoted by a person: [DELIVERY COST?] if one is needed.',
    question: 'What is your postcode, so we can quote the delivery?',
  },
  invite_before_price: {
    text: 'Do not repeat the advertised price and never name a lower one. Say in one line what the price includes, from VEHICLE FACTS under Included, and that government charges are extra. Say the price is talked about once they have seen the car, and invite them to see it.',
    question: 'Are you paying cash, or going through finance?',
  },
  ask_trade_in_details: {
    text: 'Say we take trade-ins against a car from our stock, and list what we need so a figure is ready before they come: the rego number and state, the kilometres, the condition, and a few clear photos. The value is confirmed on inspection and a person decides it: [TRADE-IN VALUE?] if a figure is asked for.',
    question: 'Could you send the rego, the kilometres and a few photos?',
  },
  send_finance_link: {
    text: 'Say finance is arranged through our lenders: the application is on the car\'s page or the finance page, takes a few minutes, starts with a soft check that does not affect their credit score, and our finance partner then contacts them. Never a rate, a repayment or a likelihood of approval.',
    question: 'Have you started the application yet?',
  },
  propose_deposit: {
    text: 'Propose the $1,000 refundable holding deposit as the next step: it takes the car off the market for them; it is refundable if they do not go ahead after inspecting it, or if their finance is not approved; to send the invoice we need a photo of their driver licence and their email address; then registration and preparation start. Two or three short sentences.',
    question: 'Would you like to secure it with the deposit?',
  },
  confirm_step: {
    text: 'The deposit has already been proposed. Answer, and confirm the step they are on without proposing it again.',
    question: '',
  },
  offer_alternative: {
    text: 'The car is gone. Say so in one line, then offer one similar car from SIMILAR VEHICLES or the stock page for the model, and invite them to see that one.',
    question: '',
  },
  after_sale_step: {
    text: 'Answer, then the next practical step of their purchase: the invoice, the deposit, the registration, the pickup or the delivery.',
    question: '',
  },
  hold: {
    text: 'A person decides this. Acknowledge it calmly and hold.',
    question: '',
  },
};

const MOVE_BY_SITUATION = {
  availability: 'invite_inspection',
  general: 'answer_then_invite',
  location_hours: 'invite_inspection',
  vehicle_details: 'answer_then_invite',
  history_kms: 'offer_proof',
  photos_video: 'offer_proof',
  inspection_booking: 'confirm_or_link',
  delivery_interstate: 'offer_online_inspection',
  price_negotiation: 'invite_before_price',
  trade_in: 'ask_trade_in_details',
  finance: 'send_finance_link',
  rego_roadworthy: 'answer_then_invite',
  warranty: 'answer_then_invite',
  deposit_hold: 'propose_deposit',
  after_sale: 'after_sale_step',
  complaint: 'hold',
};

// ---- the wording the checks and the replay score look for ------------------------------------

/** Reads as a reply for the sake of replying. */
export const FILLER = /\b(i hope (this|you|that)|hope (you'?re|you are) (well|doing well)|let (me|us) know if you (have any|would like|want|'?d like|need)|if you have any (questions|queries)|just (following up|checking in|touching base|reaching out)|following up on|checking in (on|to)|touch(ing)? base|great question|as per my (last|previous)|thank(s| you) for (your interest|reaching out|getting in touch|contacting)|(feel free|don'?t hesitate|do not hesitate) to)\b|\?\?/i;

/** Pressure, or interest from other buyers that the records cannot show. */
export const URGENCY = /\b(other (buyers?|people|customers?|parties)|others? (are |is )?(also )?(interested|asking|looking|keen)|(a )?lot of interest|(a lot|plenty|lots|heaps) of (people|enquiries|interest|buyers)|selling fast|(won'?t|will not|wont) last|only one left|last one left|price (goes|will go|is going) up|don'?t miss out|act (now|fast)|hurry|limited time|before (it'?s gone|someone else)|once in a lifetime)\b/i;

/** The true mechanism: a deposit takes the car off the market, and until then it stays for sale. */
export const STAYS_FOR_SALE = /\b((stays|remains|is still|will stay|will remain) (for sale|on the market|on sale|available to (anyone|others|other buyers))|(takes?|take) (it|the (car|van|vehicle)) off the market|off the market for you|(secures?|secure|reserves?|reserve) (it|the (car|van|vehicle)) for you)\b/i;

/** A claim about condition, history, approval or warranty that no record can back. */
export const CLAIM = /\b(no accidents?|accident[- ]free|never (been )?in an accident|perfect condition|immaculate condition|(is|looks|in) like[- ]new|nothing wrong with it|no (issues|problems) (at all|whatsoever)|guaranteed? (approval|finance)|you will be approved|approval is (certain|guaranteed)|no cooling[- ]off|sold as[\s-]is|no warranty|without warranty)\b/i;

/** Words that show a reply ends on something concrete. */
export const NEXT_STEP_SIGNS = /\b(welcome to|come (in|and|by|down|over|past|through|see)|pop (in|by)|drop (in|by)|book|see you|video (call|walkaround|inspection)|walkaround|send (you|through|over|it|them)|we can (send|hold|arrange|deliver|do|organi[sz]e|quote)|deposit|apply|application|have a look|which day|what day|suit|happy to|let us know which)\b/i;

// ---- the rung and the move ---------------------------------------------------------------------

/**
 * Where this customer is and what the reply should do.
 * @returns {null|{ rung, label, aim, move, moveText, question, signals, told, allowsUrgency, far, channel }}
 *   null for an auction order or an import enquiry: those replies have their own plan.
 */
export function saleStage(item, { now = Date.now() } = {}) {
  if (!item || item.order || item.imports) return null;
  const sit = item.situation?.all || [];
  const primary = item.situation?.primary || 'general';
  const channel = item.channel || 'sms';
  const t = item.timeline || [];
  const recent = (e) => !e.at || now - e.at <= 14 * DAY;
  const ours = (e) => e.who === 'us' && !e.internal && !e.auto && e.text;
  const customer = t.filter((e) => e.who === 'customer' && e.text);
  const said = customer.slice(-8).map((e) => `${e.text} ${e.event || ''}`).join('\n');
  const far = farAway(said, item.lead?.state);

  const told = {
    deposit: t.some((e) => ours(e) && /\bdeposit\b/i.test(e.text)),
    links: t.some((e) => ours(e) && /#inspection=/.test(e.text)),
    video: t.some((e) => ours(e) && /\b(video|walkaround)\b/i.test(e.text)),
    invited: t.some((e) => ours(e) && /welcome to (come|visit|inspect)|come (in|and see|down|by)/i.test(e.text)),
  };

  const signals = [];
  const events = t.filter((e) => e.event && recent(e)).map((e) => e.event);
  if (events.some((e) => /booked (an inspection|a test drive)/i.test(e))) signals.push('booked an inspection or test drive');
  if (events.some((e) => /online purchase steps/i.test(e))) signals.push('started the online purchase steps');
  if (events.some((e) => /finance application/i.test(e))) signals.push('applied for finance');
  if (customer.some((e) => recent(e) && SITUATIONS.deposit_hold.re.test(e.text))) signals.push('asked to hold or secure it');
  // We confirmed a visit or sent the booking link, and they wrote again without declining.
  let arranged = -1;
  for (let i = t.length - 1; i >= 0; i--) if (ours(t[i]) && recent(t[i]) && (/\bsee you\b/i.test(t[i].text) || /#inspection=/.test(t[i].text))) { arranged = i; break; }
  if (arranged >= 0) {
    const after = t.slice(arranged + 1).filter((e) => e.who === 'customer' && e.text);
    if (after.length && !after.some((e) => DECLINED.test(e.text) || CANNOT_COME.test(e.text))) signals.push('a visit was arranged and they wrote again');
  }
  // The message waiting for a reply is a no: the only move is to accept it.
  const declined = !item.deal && DECLINED.test(item.pendingText || '');

  let rung;
  if (item.deal) rung = 'buyer';
  else if (signals.length) rung = 'commit';
  else if (sit.some((s) => FIT.has(s)) || (sit.includes('vehicle_details') && customer.length > 1)) rung = 'fit';
  else if (sit.includes('history_kms') || sit.includes('photos_video') || (far.far && sit.includes('inspection_booking'))) rung = 'proof';
  else rung = 'interest';

  const vehicle = item.vehicles?.[0] || null;
  const gone = !!vehicle && !item.deal && (availability(vehicle).code === 'sold' || (availability(vehicle).code === 'available' && reservedByAnother(vehicle)));

  let move;
  if (rung === 'buyer') move = sit.includes('complaint') ? 'hold' : 'after_sale_step';
  else if (sit.includes('complaint')) move = 'hold';
  else if (declined) move = 'accept_no';
  else if (gone) move = 'offer_alternative';
  else if (rung === 'commit') move = told.deposit ? 'confirm_step' : 'propose_deposit';
  else {
    move = MOVE_BY_SITUATION[primary] || 'answer_then_invite';
    if (far.far && far.source === 'said' && ['invite_inspection', 'confirm_or_link', 'answer_then_invite'].includes(move)) move = 'offer_online_inspection';
  }

  let question = MOVES[move].question;
  // Do not ask what the customer has already answered.
  if (move === 'invite_before_price' && sit.includes('finance')) question = '';
  if (move === 'offer_online_inspection' && /\b\d{4}\b/.test(item.pendingText || '')) question = '';
  if (move === 'send_finance_link' && events.some((e) => /finance application/i.test(e))) question = '';
  if (channel === 'marketplace' && move === 'invite_inspection') question = 'Would you like to come and see it?';

  return {
    rung,
    label: RUNG_LABELS[rung],
    aim: AIMS[rung],
    move,
    moveText: MOVES[move].text,
    question,
    signals,
    told,
    allowsUrgency: rung === 'commit' && !told.deposit,
    far: far.far && far.source === 'said',
    channel,
  };
}

/** The lines the AI is given under THIS CUSTOMER'S NEXT STEP. */
export function stageLines(stage) {
  if (!stage) return [];
  const L = [];
  L.push(`Where they are: ${stage.label}${stage.signals.length ? ` (${stage.signals.join('; ')})` : ''}.`);
  L.push(`Aim for: ${stage.aim}.`);
  L.push(`The move: ${stage.moveText}`);
  L.push(stage.question
    ? `If you ask a question, ask only this one, in your own words: "${stage.question}". Ask nothing else.`
    : 'Ask no question: end on the next step.');
  if (stage.allowsUrgency) {
    L.push('Urgency, once, and only as a fact about how we work: a $1,000 refundable holding deposit is what takes the car off the market, and until one is paid the car stays for sale. Never say that other people are interested, that it is selling fast, or that the price will change.');
  } else {
    L.push('No urgency of any kind: nothing about other buyers, nothing about selling fast, and nothing about the deposit taking the car off the market.');
  }
  if (stage.told.deposit) L.push('We have already proposed the deposit to this customer: do not propose it again.');
  if (stage.told.video) L.push('We have already offered a video: do not offer it again.');
  L.push(`Set "rung" in your answer to "${stage.rung}".`);
  return L;
}

// ---- the replay score ---------------------------------------------------------------------------

const words = (s) => String(s || '').replace(/https?:\/\/\S+/g, ' ').split(/\s+/).filter(Boolean).length;

/**
 * A rule-based score out of six for one reply: does it do what a selling reply does. Used by the
 * replay script and the report so a change to the playbook can be judged before it is merged.
 */
export function salesScore({ body = '', nextStep = '', rung = '', situations = [], channel = 'sms', farAway: far = false, firstReply = false } = {}) {
  const b = String(body || '');
  const n = words(b);
  const questions = (b.match(/\?/g) || []).length - (b.match(/\[[A-Z][A-Z0-9 &'/-]{1,30}\?\]/g) || []).length;
  const parts = {
    nextStep: /\?/.test(b) || findUrls(b).length > 0 || NEXT_STEP_SIGNS.test(b) || !!String(nextStep || '').trim(),
    oneQuestion: questions <= 1,
    length: channel === 'marketplace' ? n > 0 && n <= 40 : firstReply ? n >= 12 && n <= 45 : n >= 4 && n <= 40,
    proof: !(situations.includes('history_kms') || situations.includes('photos_video') || far) || /auction sheet|export certificate|walkaround|video|photos?|odometer history|ppsr/i.test(b),
    noFiller: !FILLER.test(b),
    noUrgency: !URGENCY.test(b) && (!STAYS_FOR_SALE.test(b) || rung === 'commit'),
  };
  const notes = Object.entries(parts).filter(([, ok]) => !ok).map(([k]) => ({
    nextStep: 'no next step', oneQuestion: 'more than one question', length: 'outside the length band', proof: 'proof not offered', noFiller: 'filler', noUrgency: 'urgency',
  }[k]));
  return { score: Object.values(parts).filter(Boolean).length, parts, notes };
}
