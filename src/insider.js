// What the dashboard knows about a customer that the customer was never told: how engaged the
// lead looks, a finance decision, how they found us, whether they watched the video, how widely
// they are enquiring. These shape a reply and are never stated in one. Shape only: no number,
// name or postcode reaches the prompt from here. The postcode is used elsewhere, only to pick the
// online inspection link when the customer may be far from Sydney (situations.js farAway).

// Where a lead came from, by the dashboard's utm_source, as a sentence the AI may act on.
// Specific sources are tested before the general words they contain (Marketplace before Facebook,
// Google Ads before Google).
const SOURCES = [
  [/carsales/, 'They came to us from Carsales.'],
  [/autotrader/, 'They came to us from an Autotrader listing.'],
  // "marketplace" is also the tag on the links in our Marketplace replies (config.marketplace.linkSource, since 20 Oct 2026).
  [/market ?place/, 'They came to us from our Facebook Marketplace listing.'],
  // Plain "facebook" was that tag until 20 Oct 2026, so a lead that carries it is not an advertisement.
  [/^facebook$/, 'They came to us from Facebook.'],
  [/meta ads|facebook|\bfb\b|instagram|\big\b|l\.wl\.co/, 'They came to us from a Facebook or Instagram advertisement.'],
  [/google ?ads|ads\.google|criteo/, 'They came to us from an online advertisement.'],
  [/google|bing|duckduckgo|syndicatedsearch|copilot/, 'They came to us from a web search.'],
  [/\bdrive\b|cars ?guide|only ?cars|just 4x4|gumtree|findmycars|car for sale|country cars/, 'They came to us from a car listing site.'],
  [/walk in|previous customer|referral|whatsapp/, 'They have dealt with us before, or were referred to us.'],
  [/direct|website|carbarn|dashboard/, 'They came to our website directly.'],
];

/** The sentence for a utm_source, or '' when it says nothing useful. */
export function sourceLine(utmSource) {
  const s = String(utmSource || '').toLowerCase().trim();
  if (!s) return '';
  for (const [re, line] of SOURCES) if (re.test(s)) return line;
  return '';
}

const EMPTY = Object.freeze({ lines: [], labels: [], video: false });

/**
 * The lines the AI is given to shape a reply by, and the labels the details panel lists.
 * Nothing for an auction order, an import enquiry, an email or a buyer: those replies have their
 * own plans. Each line carries the instruction it implies; none carries a figure.
 * @returns {{ lines: string[], labels: string[], video: boolean }}
 */
export function insiderFacts(item) {
  if (!item || item.order || item.imports || item.channel === 'email' || item.deal) return EMPTY;
  const lead = item.lead;
  const sig = lead?.signals;
  if (!sig || typeof sig !== 'object') return EMPTY;
  const lines = [];
  const labels = [];
  const add = (line, label) => { lines.push(line); labels.push(label); };

  if (sig.leadScore >= 5) add('Our dashboard scores their engagement as high.', 'engagement score');
  else if (sig.leadScore >= 2) add('Our dashboard scores their engagement as moderate.', 'engagement score');

  // The inquiries, oldest first; the latest one with an answer decides.
  const inquiries = (Array.isArray(lead.inquiries) ? lead.inquiries : []).slice().sort((a, b) => (a?.at || 0) - (b?.at || 0));
  const latest = (key) => { for (let i = inquiries.length - 1; i >= 0; i--) { const v = inquiries[i]?.[key]; if (v !== null && v !== undefined && v !== '') return v; } return null; };
  const finance = String(latest('financeStatus') || '').toUpperCase();
  if (finance === 'REJECTED') add('A finance application was declined. Do not raise finance or approval; keep to the car, the inspection and the deposit.', 'finance status');
  else if (finance === 'APPROVED') add('Finance is approved: the cost question is settled; move to the inspection or the deposit.', 'finance status');
  else if (finance === 'NEW') add('A finance application is in progress: do not ask them to apply.', 'finance status');
  if (latest('weeklyRepayment') !== null) add('They were shown a weekly repayment figure on the website. Never state a repayment.', 'repayment viewed');
  if (String(latest('stockStatus') || '').toLowerCase() === 'reserved') add('They enquired while the car showed as reserved: they know it may not be free.', 'stock status at enquiry');
  const video = inquiries.some((i) => i?.videoViewed === true);
  if (video) add('They have watched the walkaround video on the page: do not offer it.', 'video viewed');

  const source = sourceLine(sig.utmSource);
  if (source) add(source, 'source');
  if (sig.otherLeadCount >= 2) add('They have enquired about other cars on Carsales too: they are comparing.', 'comparing on Carsales');

  return { lines, labels, video };
}
