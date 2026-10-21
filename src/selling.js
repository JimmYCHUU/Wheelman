// What a reply is for. Every customer who writes about a car is somewhere on a ladder that ends
// in a sale: interested, wanting proof, working out fit and cost, ready to commit, a buyer. A reply
// answers what was asked and then moves them one rung up, in one concrete next step, with a
// question only when the answer is needed. This module works out the rung and the move from the records; the words come from
// voice/sales-playbook.md and the two voices. Nothing here reads customer details.

import { SITUATIONS, farAway } from './situations.js';
import { availability } from './normalize.js';
import { reservedByAnother } from './deal.js';
import { findUrls, hasEmoji } from './text.js';
import { config } from './config.js';
import { dayRefs } from './promises.js';
import { sydneyDay } from './time.js';

const DAY = 24 * 3600 * 1000;

export const RUNGS = ['interest', 'proof', 'fit', 'commit', 'buyer'];

/** Where the customer is, in words the AI and the page both use. */
export const RUNG_LABELS = {
  interest: 'interested: asking whether the car is real, available or right for them',
  proof: 'wants proof: history, condition, photos, or cannot see the car in person',
  fit: 'working out fit and cost: price, finance, trade-in, delivery, what is included',
  commit: 'ready to commit: has seen the car, asked to hold it, accepted our figure, or started buying',
  buyer: 'a buyer: a deposit is paid or a sale is recorded',
};

/** The one next step to aim for from each rung. */
export const AIMS = {
  interest: `get them to see the car: an inspection at ${config.site.showroom}, or the online video inspection when they are far away`,
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
export const CANNOT_COME = /\b(can'?t|cannot|can not|unable to|not able to|won'?t be able to|will not be able to) (come|make it|get (there|down|up|in|over)|get to|travel|drive)\b|\b(come|visit|make it|pop in|drop in) (another|some other|a different) (time|day)\b/i;

/** The customer says they have seen or driven the car, or watched its video. */
export const SEEN_WORDS = /\b(saw it|seen it|inspected it|test[\s-]?drove|test[\s-]?drive (yesterday|today|the other day|last|on)|drove it|had a look at it|looked at it (yesterday|today|on|last)|came (in|down|by|past) (yesterday|today|on|last)|visited (yesterday|today|on|last)|after (the|my|our) (inspection|visit|test[\s-]?drive)|thanks for (showing|the test[\s-]?drive|your time (yesterday|today|the other day))|(watched|seen) the (walkaround |video|walkaround))\b/i;
/** A deposit proposed in a reply. */
export const DEPOSIT_MENTION = /\$1,000 (refundable )?(holding )?deposit|\bholding deposit\b|\b(secur|reserv)\w* (it|the \w+( \w+)?) with a deposit\b/i;
/** The licence photo and email address asked for. */
export const LICENCE_ASK = /\b(driver'?s? licen[cs]e|licen[cs]e photo|photo of your licen[cs]e)\b/i;
/** Yes to the deposit we proposed. */
export const AGREES_DEPOSIT = /\b(yes|ok(ay)?|sure|let'?s do (it|that)|i can do that|go ahead|sounds good|happy to|i'?ll (pay|put|place|send|transfer) (the |a )?deposit|how do i pay|send (me |through )?the invoice|(bank|account) details|where do i pay)\b/i;

/** Leaving, kindly: the deal does not suit them. Nothing is sold to them after this. */
export const PARTING = /\b(all the best|best of luck|good luck|never ?mind|forget (it|about it)|(i'?ll|i will) keep (saving|looking)|keep(ing)? saving|no deal|not worth (it|that)|still not worth|thanks anyway|thank you anyway|cheers anyway|maybe (next time|another time))\b/i;
/** An insult. It is answered with the same calm courtesy, and with nothing to sell. */
export const RUDE = /\b(dick ?head|idiot|moron|clown|wanker|f+u+c+k\w*|f\*+k\w*|bullshit|greedy|thie(f|ves)|(you'?re|your|you are|ur|u r) dreaming)\b/i;

// ---- the price: agreed, or still open ------------------------------------------------------------

/** They accept the price: "deal", "I'll take it", "happy with that price". */
export const ACCEPTS_PRICE = /(^\s*((ok(ay)?|yes|sure)[\s,.!]*)?deal\b|\b(it'?s|that'?s|you'?ve got|you have|we have) a deal\b|\b(i'?ll|i will|we'?ll|we will) take (it|her|the (car|van|vehicle))\b(?!\s+(to|out|around|on|for an? |for (a )?(test|spin|drive)))|\bhappy (with|to pay) (that|the|your) (price|figure)\b|\b(that|the) (price|figure) is (fine|good|ok(ay)?)\b|\bagreed\b)/i;
/** The price is too high for them: never an agreement, whatever else they wrote. */
const PRICE_OBJECTION = /\b(too (expensive|dear|steep|pricey|high)|too much (for|money)|over ?priced|not worth|isn'?t worth|ain'?t worth|tapped out|can'?t afford|cannot afford|out of (my|our) (budget|price range|range)|over (my|our) budget|(my|our) (max|limit) is|that'?s my (max|limit|best))\b/i;
/** Our own price reply, or the owner's words in it, already sent. */
const PRICE_REPLY_SENT = /government charges are extra|(small|slight) discount (only )?for (a |the )?serious buyers?/i;

const dollars = (s) => Number(String(s ?? '').replace(/[^\d.]/g, '')) || 0;
// Units that make a number something other than money.
const NOT_MONEY = /^\s*(km|kms|klms?|kilomet|miles?|ks\b|m\b|ms\b|mm|cc\b|l\b|litres?|seats?|doors?|months?|years?|yrs?|days?|weeks?|hours?|hrs?|mins?|am\b|pm\b|:|%)/i;
// A bare "23" means $23,000 only where it reads as an offer: "23 will do", "would you take 23".
const THOUSANDS_AFTER = /^\s+(will do|is my|tops|max|cash|and i\b|and im\b|for it|final|is all|ono|neg)\b/i;
const THOUSANDS_BEFORE = /\b(take|do|pay|give|offer|consider|accept|for|at)\s*$/i;

/** Dollar figures in a message, as numbers: "16k", "18 k", "$14000", "22,900", "23 will do". Kilometres, years and times are not figures. */
export function priceFigures(text) {
  const s = String(text || '');
  const out = [];
  for (const m of s.matchAll(/(\$\s?)?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(\s?k\b)?/gi)) {
    const end = m.index + m[0].length;
    if (NOT_MONEY.test(s.slice(end, end + 12))) continue;
    let n = Number(m[2].replace(/,/g, ''));
    if (m[3]) n *= 1000;
    else if (!m[1] && !m[2].includes(',')) {
      if (n < 1000) {
        if (!THOUSANDS_AFTER.test(s.slice(end, end + 16)) && !THOUSANDS_BEFORE.test(s.slice(Math.max(0, m.index - 12), m.index))) continue;
        n *= 1000;
      } else if (/^\d{4}$/.test(m[2]) && n >= 1950 && n <= 2035) continue; // a year
    }
    out.push(n);
  }
  return out;
}

/**
 * What the customer's waiting words say about the price.
 * open: they are talking price and have not agreed it: an offer, a budget, "too dear", a best-price ask.
 * agreed: they accept our price, or the figure our staff gave them, and name nothing lower.
 * answered: we have already answered the price here: our price reply, or a figure our staff typed.
 */
export function priceTalk(item) {
  const text = item?.pendingText || '';
  const ours = (item?.timeline || []).filter((e) => e.who === 'us' && !e.internal && !e.auto && e.text);
  const advertised = dollars(item?.vehicles?.[0]?.price);
  const plausible = (n) => (advertised ? n >= advertised * 0.3 && n <= advertised * 1.5 : n >= 3000 && n <= 300000);
  // Figures our staff gave below the advertised price: what they offered this customer.
  const quoted = ours.flatMap((e) => priceFigures(e.text)).filter(plausible).filter((n) => !advertised || n < advertised);
  const known = [advertised, ...quoted].filter(Boolean);
  const floor = known.length ? Math.min(...known) : 0;
  const offers = priceFigures(text).filter(plausible);
  const below = offers.length > 0 && floor > 0 && Math.max(...offers) < floor;
  const agreed = ACCEPTS_PRICE.test(text) && !PRICE_OBJECTION.test(text) && !below;
  const talk = SITUATIONS.price_negotiation.re.test(text);
  return {
    open: talk && !agreed,
    agreed,
    answered: ours.some((e) => PRICE_REPLY_SENT.test(e.text)) || quoted.length > 0,
  };
}

/**
 * The moves. Each is what the reply does after answering, and the one question it may ask, which
 * exists only where the reply cannot proceed without the answer (a postcode for a delivery quote,
 * the details of a trade-in). The AI is told the move in words.
 */
export const MOVES = {
  accept_no: {
    text: 'They have said no. Accept it in a line, thank them, and stop: no next step, no question, and no other car unless they asked for one. A customer who feels no pressure comes back.',
    question: '',
  },
  invite_inspection: {
    text: `Answer, then invite them to see it at ${config.site.showroom}, in words. The booking link is governed by INSPECTION: give it only if that section supplies it. If it helps them decide, offer the walkaround video and the auction sheet.`,
    question: '',
  },
  answer_then_invite: {
    text: 'Answer the question from the facts, add the one detail that matters for what they asked, then invite them to see the car in words. No booking link unless INSPECTION supplies it.',
    question: '',
  },
  confirm_or_link: {
    text: 'They want to see it: follow INSPECTION for the link or the confirmation. If the day and time they named work, confirm them in a line and say the vehicle will be ready for them.',
    question: '',
  },
  offer_proof: {
    text: 'Give the proof the records hold: the auction grade and sheet, the export certificate with the odometer history, PPSR, the service done. If VEHICLE FACTS list a flaw, name it before they ask. Offer the walkaround video and underbody photos. Then invite them to see it, or to have their own mechanic look at it.',
    question: '',
  },
  offer_online_inspection: {
    text: 'Say that most of our interstate buyers do a live video inspection on WhatsApp or FaceTime and we deliver Australia-wide by car carrier. The online video inspection link is governed by INSPECTION. A delivery price is quoted by a person: [DELIVERY COST?] if one is needed.',
    question: 'What is your postcode, so we can quote the delivery?',
  },
  invite_before_price: {
    text: 'The price question. Our standard price reply is added under your text by code (see PRICE REPLY): what the price includes, that government charges are extra, that we may offer a small discount to a serious buyer, and the invitation with the booking link. Write only the greeting when one is due and one or two sentences that answer anything else asked and place the vehicle. Do not repeat the advertised price, name no figure, and neither accept nor refuse an offer: a figure is [PRICE?] for a person.',
    question: '',
  },
  answer_offer: {
    text: 'We have already answered the price in this conversation, and they came back with an offer or a view of their own. Thank them for their offer in a few words. Neither accept nor refuse it: if they named a figure, write "Regarding your offer, [PRICE?]." for a person to complete (list it under needs_human); if they named none, acknowledge their view in one courteous sentence. Never say that their offer is too low or below what we accept, never argue about what the car is worth, and do not repeat what the price includes. Invite them to see the car only if we have not invited them in this conversation.',
    question: '',
  },
  part_well: {
    text: 'They are leaving: the price does not suit them, or they are annoyed. Thank them for their offer or their interest in one sentence, and leave the door open: if their plans change, they are welcome to message us at any time. Then stop. No [PRICE?] blank and no figure, no link (not even the car\'s page on a first reply), no invitation, no deposit, no other car, and no argument about the price or what the car is worth. Answer an insult with the same calm courtesy, and do not mention it.',
    question: '',
  },
  ask_trade_in_details: {
    text: 'Say we take trade-ins against a car from our stock, and list what we need so a figure is ready before they come: the rego number and state, the kilometres, the condition, and a few clear photos. The value is confirmed on inspection and a person decides it: [TRADE-IN VALUE?] if a figure is asked for. No deposit is proposed with a trade-in figure.',
    question: 'Could you send the rego, the kilometres and a few photos?',
  },
  send_finance_link: {
    text: 'Say finance is arranged through our lenders: the application is on the car\'s page or the finance page, takes a few minutes, starts with a soft check that does not affect their credit score, and our finance partner then contacts them. Never a rate, a repayment or a likelihood of approval.',
    question: '',
  },
  propose_deposit: {
    text: 'Propose the $1,000 refundable holding deposit as the next step: it takes the car off the market for them; it is refundable if they do not go ahead after inspecting it, or if their finance is not approved; registration and preparation start once it is paid. Two or three short sentences. Do not ask for their driver licence or email address yet: that comes once they say yes.',
    question: '',
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
export const FILLER = /\b(i hope (this|you|that)|hope (you'?re|you are) (well|doing well)|let (me|us) know if you (have any|would like|want|'?d like|need)|if you have any (questions|queries)|just (following up|checking in|touching base|reaching out)|following up on|checking in (on|to)|touch(ing)? base|great question|as per my (last|previous)|thank(s| you) for (your interest|reaching out|getting in touch|contacting)|(feel free|don'?t hesitate|do not hesitate) to|hope (it|this|that) helps)\b|\?\?/i;

/** Pressure, or interest from other buyers that the records cannot show. */
export const URGENCY = /\b(other (buyers?|people|customers?|parties)|others? (are |is )?(also )?(interested|asking|looking|keen)|(a )?lot of interest|(a lot|plenty|lots|heaps) of (people|enquiries|interest|buyers)|selling fast|(won'?t|will not|wont) last|only one left|last one left|price (goes|will go|is going) up|don'?t miss out|act (now|fast)|hurry|limited time|before (it'?s gone|someone else)|once in a lifetime)\b/i;

/** The true mechanism: a deposit takes the car off the market, and until then it stays for sale. */
export const STAYS_FOR_SALE = /\b((stays|remains|is still|will stay|will remain) (for sale|on the market|on sale|available to (anyone|others|other buyers))|(takes?|take) (it|the (car|van|vehicle)) off the market|off the market for you|(secures?|secure|reserves?|reserve) (it|the (car|van|vehicle)) for you)\b/i;

/** A claim about condition, history, approval or warranty that no record can back. */
export const CLAIM = /\b(no accidents?|accident[- ]free|never (been )?in an accident|perfect condition|immaculate condition|(is|looks|in) like[- ]new|nothing wrong with it|no (issues|problems) (at all|whatsoever)|guaranteed? (approval|finance)|you will be approved|approval is (certain|guaranteed)|no cooling[- ]off|sold as[\s-]is|no warranty|without warranty)\b/i;

/** Words that show a reply ends on something concrete. */
export const NEXT_STEP_SIGNS = /\b(welcome to|come (in|and|by|down|over|past|through|see)|pop (in|by)|drop (in|by)|book|see you|video (call|walkaround|inspection)|walkaround|send (you|through|over|it|them)|send (me|us) (your|a) (best |phone |contact |mobile )?number|give you a call|call you|we can (send|hold|arrange|deliver|do|organi[sz]e|quote)|deposit|apply|application|have a look|which day|what day|suit|happy to|let us know which|inspect(ion)?|preferred (date|day|time)|look forward to seeing you|arrange it for you)\b/i;

/**
 * The same moves on Facebook Marketplace, in the shape the team sends there (October 2026): the
 * next step is the buyer's phone number, booked by a person and confirmed by text, not the booking
 * link; a price is the figure as [PRICE?] and then the number; finance and a trade-in are the
 * forms on the car's own page. Moves not listed here read as on a text.
 */
const CHAT_MOVES = {
  invite_inspection: 'Answer from the facts with the one detail that matters, then ask them to send us their number and the day and time that suit them, so we can get the inspection booked and confirm it by text. No booking link unless INSPECTION says they asked for one.',
  answer_then_invite: 'Answer the question from the facts, with the one detail that matters for what they asked, then ask them to send us their number and the day and time that suit them, so we can get the inspection booked. No booking link unless INSPECTION says they asked for one.',
  confirm_or_link: 'They want to see it: ask them to send us their number and the day and time that suit them, and say we will get the inspection booked for them and confirm it by text. If they named a day and a time inside our hours, say it suits and still ask for their number. The booking link only if INSPECTION says they asked for one.',
  offer_proof: 'Give the proof the records hold: the auction grade and what it means, the export certificate with the odometer history, PPSR, the service done. If VEHICLE FACTS list a flaw, name it before they ask. Offer the auction sheet. Then ask them to send us their number and a time that suits them to see it, unless we have asked for their number already.',
  invite_before_price: 'The price question. A figure is a person\'s: write "The lowest we can do on the <car> is [PRICE?]." and list it under needs_human; then their number as the next step, in the team\'s words and as its own paragraph: "If that works for you, send us your number and the day and time that suit you, and we will get the inspection booked for you." Do not repeat the advertised price, say nothing about what the price includes unless they asked, and never say that an offer is too low or that we cannot accept it.',
  answer_offer: 'We have already answered the price in this chat, and they came back with an offer or a view of their own. Thank them for the offer in a few words and neither accept nor refuse it: if they named a figure, write "The lowest we can do is [PRICE?]." for a person to complete (list it under needs_human), then their number and the day and time that suit them, if that works for them. Never say that their offer is too low or below what we accept, and never argue about what the car is worth.',
  send_finance_link: 'Say "Yes, we do." and give the finance form on the car\'s page from VEHICLE FACTS ("Start a finance application") on its own line, asking them to let us know once it is done. Never a rate, a repayment or a likelihood of approval.',
  ask_trade_in_details: 'Say we take trade-ins against a car from our stock, and give the trade-in form on the car\'s page from VEHICLE FACTS ("Start a trade-in request") on its own line, with what to put in it: the rego number and state, the kilometres, the condition, a few clear photos and their number. The value is a person\'s: [TRADE-IN VALUE?] if a figure is asked for.',
};

// ---- the rung and the move ---------------------------------------------------------------------

/**
 * The visit our "see you" line arranged has passed: the latest day it names is before today, or no
 * day is readable and more than a day has gone by since we wrote it.
 */
function visitPassed(entry, now) {
  const dates = dayRefs(entry.text, entry.at || now, { loose: true }).flatMap((r) => r.dates).sort();
  if (dates.length) return dates[dates.length - 1] < sydneyDay(now);
  return !!entry.at && now - entry.at > DAY;
}

/**
 * Where this customer is and what the reply should do.
 * @returns {null|{ rung, label, aim, move, moveText, question, signals, told, allowsUrgency, far, channel }}
 *   null for an auction order or an import enquiry: those replies have their own plan.
 */
export function saleStage(item, { now = Date.now(), videoViewed = false } = {}) {
  // An import email has its own plan (the research), not the sales ladder.
  if (!item || item.order || item.imports || item.channel === 'email') return null;
  const sit = item.situation?.all || [];
  const primary = item.situation?.primary || 'general';
  const channel = item.channel || 'sms';
  const t = item.timeline || [];
  const recent = (e) => !e.at || now - e.at <= 14 * DAY;
  const ours = (e) => e.who === 'us' && !e.internal && !e.auto && e.text;
  const customer = t.filter((e) => e.who === 'customer' && e.text);
  const said = customer.slice(-8).map((e) => `${e.text} ${e.event || ''}`).join('\n');
  const far = farAway(said, item.lead?.state, item.lead?.signals?.postcode);

  const told = {
    deposit: t.some((e) => ours(e) && /\bdeposit\b/i.test(e.text)),
    depositAgreed: false,
    links: t.some((e) => ours(e) && /#inspection=/.test(e.text)),
    // Offered by us earlier, or watched on the website (the dashboard records that; insider.js).
    video: t.some((e) => ours(e) && /\b(video|walkaround)\b/i.test(e.text)) || !!videoViewed,
    // On Marketplace, asking for their number is the invitation: the team books the visit from it.
    invited: t.some((e) => ours(e) && /welcome to (come|visit|inspect|see)|come (in|and see|down|by)|(available|ready) (for|to) (inspection|inspect|view|see)|(send|give) (us|me) (your|a) (best |phone |contact |mobile )?number/i.test(e.text)),
  };

  // Yes to the deposit we proposed (not a price complaint): only then are the licence and email asked for.
  told.depositAgreed = told.deposit && AGREES_DEPOSIT.test(item.pendingText || '') && !PRICE_OBJECTION.test(item.pendingText || '');

  const signals = [];
  const events = t.filter((e) => e.event && recent(e)).map((e) => e.event);
  // A booking or a finance application shows interest, not commitment: neither is a signal.
  if (events.some((e) => /online purchase steps/i.test(e))) signals.push('started the online purchase steps');
  if (customer.some((e) => recent(e) && SITUATIONS.deposit_hold.re.test(e.text))) signals.push('asked to hold or secure it');
  if (customer.some((e) => recent(e) && SEEN_WORDS.test(e.text))) signals.push('they have seen the car');
  // We confirmed a visit, the day has passed, and they wrote again without declining. A booking
  // link we sent is an invitation, not an arranged visit: since Marketplace replies carry it, it
  // would make almost every buyer who writes back look ready for the deposit. A visit still to
  // come is no commitment either.
  let arranged = -1;
  for (let i = t.length - 1; i >= 0; i--) if (ours(t[i]) && recent(t[i]) && /\bsee you\b/i.test(t[i].text)) { arranged = i; break; }
  if (arranged >= 0) {
    const after = t.slice(arranged + 1).filter((e) => e.who === 'customer' && e.text);
    if (after.length && !after.some((e) => DECLINED.test(e.text) || CANNOT_COME.test(e.text)) && visitPassed(t[arranged], now)) signals.push('the visit we arranged has taken place and they wrote again');
  }
  // The price: while it is open (an offer, a budget, "too dear"), nobody is asked for a deposit.
  const price = priceTalk(item);
  if (price.agreed) signals.push('accepted our price');
  // The message waiting for a reply is a no: the only move is to accept it.
  const declined = !item.deal && DECLINED.test(item.pendingText || '');
  // They are leaving over the price, or are rude. Someone still asking to see the car is not leaving.
  const parting = !item.deal && !sit.includes('inspection_booking') && (PARTING.test(item.pendingText || '') || RUDE.test(item.pendingText || ''));

  let rung;
  if (item.deal) rung = 'buyer';
  else if (signals.length && !price.open && !parting) rung = 'commit';
  else if (price.open || sit.some((s) => FIT.has(s)) || (sit.includes('vehicle_details') && customer.length > 1)) rung = 'fit';
  else if (sit.includes('history_kms') || sit.includes('photos_video') || (far.far && sit.includes('inspection_booking'))) rung = 'proof';
  else rung = 'interest';

  const vehicle = item.vehicles?.[0] || null;
  const gone = !!vehicle && !item.deal && (availability(vehicle).code === 'sold' || (availability(vehicle).code === 'available' && reservedByAnother(vehicle)));

  let move;
  if (rung === 'buyer') move = sit.includes('complaint') ? 'hold' : 'after_sale_step';
  else if (sit.includes('complaint')) move = 'hold';
  else if (declined) move = 'accept_no';
  else if (parting) move = 'part_well';
  else if (gone) move = 'offer_alternative';
  // Our price reply goes once; after that an offer is answered for a person to decide.
  else if (price.open) move = price.answered ? 'answer_offer' : 'invite_before_price';
  else if (rung === 'commit') move = told.deposit ? 'confirm_step' : 'propose_deposit';
  else {
    move = MOVE_BY_SITUATION[primary] || 'answer_then_invite';
    if (far.far && far.source === 'said' && ['invite_inspection', 'confirm_or_link', 'answer_then_invite'].includes(move)) move = 'offer_online_inspection';
  }

  // On Marketplace a trade-in is sent to the form on the car's page, so nothing is asked.
  let question = channel === 'marketplace' && move === 'ask_trade_in_details' ? '' : MOVES[move].question;
  // Do not ask what the customer has already answered.
  if (move === 'invite_before_price' && sit.includes('finance')) question = '';
  if (move === 'offer_online_inspection' && /\b\d{4}\b/.test(item.pendingText || '')) question = '';
  if (move === 'send_finance_link' && events.some((e) => /finance application/i.test(e))) question = '';

  return {
    rung,
    label: RUNG_LABELS[rung],
    aim: AIMS[rung],
    move,
    moveText: (channel === 'marketplace' && CHAT_MOVES[move]) || MOVES[move].text,
    question,
    signals,
    told,
    allowsUrgency: rung === 'commit' && !told.deposit,
    far: far.far && far.source === 'said',
    channel,
  };
}

/** Moves that close politely: nothing is offered after them, not even the price reply or the invitation. */
export const QUIET_MOVES = new Set(['accept_no', 'part_well']);
// Moves whose words end on an invitation to see the car.
const INVITING_MOVES = new Set(['invite_inspection', 'answer_then_invite', 'offer_proof', 'answer_offer']);

/** The lines the AI is given under THIS CUSTOMER'S NEXT STEP. */
export function stageLines(stage) {
  if (!stage) return [];
  const L = [];
  L.push(`Where they are: ${stage.label}${stage.signals.length ? ` (${stage.signals.join('; ')})` : ''}.`);
  L.push(`Aim for: ${stage.aim}.`);
  L.push(`The move: ${stage.moveText}`);
  L.push(stage.question
    ? `If you ask a question, ask only this one, in your own words: "${stage.question}". Ask nothing else.`
    : QUIET_MOVES.has(stage.move) ? 'Ask no question, and offer no next step.' : 'Ask no question: end on the next step.');
  // On Marketplace the invitation is given once in a chat; repeating it reads as pushing.
  if (stage.channel === 'marketplace' && (stage.told.invited || stage.told.links) && INVITING_MOVES.has(stage.move)) {
    L.push('We have already invited them to see the car in this chat: do not invite them again and give no booking link, unless they ask to see it. End on the answer, or on one useful thing they have not been offered.');
  }
  if (stage.allowsUrgency) {
    L.push('Urgency, once, and only as a fact about how we work: a $1,000 refundable holding deposit is what takes the car off the market, and until one is paid the car stays for sale. Never say that other people are interested, that it is selling fast, or that the price will change.');
  } else {
    L.push('No urgency of any kind: nothing about other buyers, nothing about selling fast, and nothing about the deposit taking the car off the market.');
  }
  if (stage.told.deposit) L.push('We have already proposed the deposit to this customer: do not propose it again.');
  if (stage.told.deposit) L.push(stage.told.depositAgreed ? 'They have said yes to the deposit: ask for a photo of their driver licence and their email address, so the invoice can be sent.' : 'They have not yet said yes to the deposit: do not ask for their licence or email.');
  if (stage.told.video) L.push('We have already offered a video: do not offer it again.');
  L.push(`Set "rung" in your answer to "${stage.rung}".`);
  return L;
}

// ---- the register, and the sales score ---------------------------------------------------------

/** Slang and chat shorthand: not in the brand register. */
export const SLANG = /\b(no worries|no problem|no probs|no dramas?|too easy|all good|cheers|mate|heaps|arvo|yep|yeah|nope|nah|awesome|cool|guys|gonna|wanna|kinda|sorta|okay|ok|lol|btw|asap|pls|thx)\b/i;
/** Apologising for existing, or asking permission to be useful: servile, not courteous. */
export const SERVILE = /\b(sorry to (bother|trouble|disturb)|if that('s| is) (okay|ok|alright|fine) with you|if that works for you|apologies for|so sorry|i apologi[sz]e|just (checking|wondering|following)|hope you don'?t mind|whenever you get a chance|no rush|no pressure)\b/i;

const words = (s) => String(s || '').replace(/https?:\/\/\S+/g, ' ').split(/\s+/).filter(Boolean).length;

/**
 * A rule-based score out of six for one reply: does it do what a selling reply does in the brand
 * register. Used by the review, the replay and the report, so a change to the playbook or the
 * voice can be judged before it is merged.
 * question: the one question the request allowed ('' for none); null when it is not known.
 * due: { price, priceGiven, invite, inviteGiven }: whether the price reply or the invitation was
 *      due under the text, and whether it is there.
 */
export function salesScore({ body = '', nextStep = '', rung = '', situations = [], channel = 'sms', farAway: far = false, firstReply = false, question = null, due = null } = {}) {
  const b = String(body || '');
  const n = words(b);
  const questions = (b.match(/\?/g) || []).length - (b.match(/\[[A-Z][A-Z0-9 &'/-]{1,30}\?\]/g) || []).length;
  const needed = question === null || question === undefined ? null : !!String(question).trim();
  const proofDue = situations.includes('history_kms') || situations.includes('photos_video') || far;
  const parts = {
    nextStep: /\?/.test(b) || findUrls(b).length > 0 || NEXT_STEP_SIGNS.test(b) || !!String(nextStep || '').trim() || !!(due && (due.priceGiven || due.inviteGiven)),
    // No question is right unless one was needed; one question is right unless none was.
    questionOnlyWhenNeeded: questions === 0 ? needed !== true : questions === 1 && needed !== false,
    length: channel === 'marketplace' ? n > 0 && n <= 90 : channel === 'email' ? n > 0 && n <= 180 : firstReply ? n >= 12 && n <= 70 : n >= 4 && n <= 50,
    register: !SLANG.test(b) && !SERVILE.test(b) && !hasEmoji(b) && (b.match(/!/g) || []).length <= 1,
    noUrgency: !URGENCY.test(b) && !CLAIM.test(b) && (!STAYS_FOR_SALE.test(b) || rung === 'commit'),
    dueBlocks: (!due?.price || !!due.priceGiven) && (!due?.invite || !!due.inviteGiven) && (!proofDue || /auction sheet|export certificate|walkaround|video|photos?|odometer history|ppsr/i.test(b)),
  };
  const notes = Object.entries(parts).filter(([, ok]) => !ok).map(([k]) => ({
    nextStep: 'no next step', questionOnlyWhenNeeded: 'a question that was not needed, or a needed one missing', length: 'outside the length band',
    register: 'informal or apologetic wording', noUrgency: 'urgency or a claim', dueBlocks: 'a due block or proof missing',
  }[k]));
  return { score: Object.values(parts).filter(Boolean).length, parts, notes };
}
