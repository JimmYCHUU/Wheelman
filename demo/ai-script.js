// What the stand-in AI answers in the demo: plausible replies written without any AI, from what the
// request itself says. Every figure and link comes out of the request's own vehicle facts, so the
// replies pass the same checks as a real model's would. Nothing here is sent anywhere.

const RULES = [
  [/\b(still )?(available|for sale|still have|still got|sold)\b/i, availability],
  [/\b(best price|price|discount|cheaper|lowest|best you can do|change ?over|any better)\b/i, price],
  [/\btrade[\s-]?in\b/i, tradeIn],
  [/\b(video|facetime|whatsapp call|interstate|brisbane|melbourne|perth|adelaide|cannot get|can't get|far)\b/i, videoInspection],
  [/\b(come and see|see it|look at|inspect|test drive|visit|drop in|saturday|sunday|weekend)\b/i, inspection],
  [/\b(blue slip|paperwork|rego|registration|invoice|receipt|pink slip|documents?)\b/i, afterSale],
  [/\b(import|auction|japan)\b/i, importing],
];

const section = (text, name) => { const m = text.split(`=== ${name} ===`)[1]; return m ? m.split('\n===')[0] : ''; };
const fact = (text, label) => { const m = section(text, 'VEHICLE FACTS').match(new RegExp(`^${label}: (.+)$`, 'm')); return m ? m[1].trim() : ''; };

function facts(prompt) {
  const vehicle = section(prompt, 'VEHICLE FACTS');
  const title = (vehicle.match(/^(?:Vehicle|Car): (.+)$/m) || vehicle.match(/^(\d{4} [A-Z][^\n]+)$/m) || [])[1] || '';
  const price = (fact(prompt, 'Advertised price').match(/\$[\d,]+/) || [])[0] || '';
  const model = title.replace(/^\d{4}\s+/, '').split(' ').slice(1, 3).join(' ').replace(/\(.*$/, '').trim();
  const sold = /\b(sold|no longer available)\b/i.test(vehicle);
  const alternative = (section(prompt, 'SIMILAR VEHICLES').match(/^(\d{4} [^\n]+)$/m) || [])[1] || '';
  return { title, model: model || 'car', price, sold, alternative };
}

const reply = (text, needs = []) => ({ reply: text, next_step: '', facts_used: [], needs_human: needs, hold: false });

// Links are left out on purpose: the standard first-reply block adds the listing and the booking
// link under the text, and a reply that repeats one is sent back by the checks.
function availability({ model, price, sold, alternative }) {
  if (sold) return reply(`Hi {{NAME}}, sorry, that ${model} has just sold.${alternative ? ` We have a ${alternative} that is similar, if you would like to have a look.` : ' We get similar ones in regularly and can let you know when the next one arrives.'}`);
  return reply(`Hi {{NAME}}, yes, the ${model} is still available${price ? ` at ${price} plus on-roads` : ''}. Would you like to come and see it?`);
}
function price({ model }) {
  return reply(`Hi {{NAME}}, the best we can do on the ${model} is [PRICE?]. It comes with 6 months rego and our warranty. Would you like to come and see it?`, [{ marker: '[PRICE?]', reason: 'Only a person can decide the price.' }]);
}
function tradeIn({ model }) {
  return reply(`Hi {{NAME}}, happy to look at your trade-in against the ${model}. Could you send the rego number, the kilometres and a few photos, and we will come back with a figure?`);
}
function inspection({ model }) {
  return reply(`Hi {{NAME}}, Saturday morning works. The ${model} is at the yard, and you can book a time that suits you. Let us know when you are on your way.`);
}
function videoInspection({ model }) {
  return reply(`Hi {{NAME}}, no problem at all. We do live video inspections of the ${model} on WhatsApp or FaceTime, where we walk around the car with you. Pick a day and time that suits you and we will set it up.`);
}
function afterSale({ model }) {
  return reply(`Hi {{NAME}}, no worries. We will check on the paperwork for your ${model} and email it through [CHECK?].`, [{ marker: '[CHECK?]', reason: 'A person must find the document.' }]);
}
function importing() {
  return reply('Hi {{NAME}}, thanks for your enquiry. To find the right car we need the year range, the most kilometres you would accept and your landed budget. Once we have those we can send you what is coming up at auction.');
}
function fallback({ model }) {
  return reply(`Hi {{NAME}}, thanks for your message. Happy to help with the ${model}. What would you like to know?`);
}

/** The reply for one request to the stand-in AI, from the customer's last message and the facts in the request. */
export function demoReply(requestBody) {
  const messages = Array.isArray(requestBody?.messages) ? requestBody.messages : [];
  const prompt = messages.map((m) => String(m?.content || '')).join('\n');
  const asked = (prompt.match(/<customer_message>\n([\s\S]*?)\n<\/customer_message>/g) || []).map((m) => m.replace(/<\/?customer_message>/g, '')).join('\n');
  const f = facts(prompt);
  for (const [re, write] of RULES) if (re.test(asked)) return write(f);
  return fallback(f);
}
