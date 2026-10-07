import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;
const num = (v, d) => (v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d);
const list = (...parts) => [...new Set(parts.join(',').split(',').map((s) => s.trim()).filter(Boolean))];

export const config = {
  root,
  dataDir: path.join(root, 'data'),
  rawDir: path.join(root, 'data', 'raw'),
  dbPath: env.DB_PATH || path.join(root, 'data', 'app.db'),
  // Photos from texts, fetched once and kept beside the database. Tests keep theirs in a temporary folder.
  mediaDir: env.MEDIA_DIR || (env.DB_PATH === ':memory:' ? path.join(os.tmpdir(), `wheelman-media-${process.pid}`) : path.join(path.dirname(env.DB_PATH || path.join(root, 'data', 'app.db')), 'media')),
  sessionPath: path.join(root, 'data', '.session.json'),
  knowledgeDir: path.join(root, 'knowledge'),
  // The website's "import this model" pages, saved by fetch-website. One file per model.
  importPagesDir: path.join(root, 'knowledge', 'website', 'importing'),
  voiceDir: path.join(root, 'voice'),
  webDir: path.join(root, 'web'),

  dashboard: {
    // The address of the dashboard's data service. Set in .env; it is not written in the code.
    baseUrl: (env.DASHBOARD_API_URL || '').trim().replace(/\/+$/, ''),
    // The dashboard's own web address, sent as the origin of each read. Set in .env; when it is
    // not, the data service's own address is used.
    origin: (env.DASHBOARD_ORIGIN || '').trim().replace(/\/+$/, '') || (() => { try { return new URL((env.DASHBOARD_API_URL || '').trim()).origin; } catch { return ''; } })(),
    platform: 'carbarnau',
    // Import and auction enquiries are kept on a list of their own on the dashboard.
    importsPlatform: 'IMPORTS',
    channel: 'SMS',
    username: env.DASHBOARD_USERNAME || '',
    password: env.DASHBOARD_PASSWORD || '',
    timezone: 'Australia/Sydney',
  },

  // The website's live Japan auction feed: the cars, Carbarn's suggested bid and the landed-cost
  // calculator. Public (no login). It is on the same service as the dashboard unless set otherwise.
  auction: {
    baseUrl: (env.AUCTION_API_URL || env.DASHBOARD_API_URL || '').trim().replace(/\/+$/, ''),
    // The bid Wheelman suggests is Carbarn's suggested bid rounded up to the next step.
    bidStepYen: num(env.AUCTION_BID_STEP_YEN, 50000),
    // How far over the customer's budget a car may be and still be offered (0.15 = 15%).
    budgetSlack: num(env.AUCTION_BUDGET_SLACK, 0.15),
  },

  site: {
    baseUrl: 'https://www.carbarn.com.au',
    mapsUrl: 'https://maps.app.goo.gl/EQfdkTE7FYDF4DTT8',
    phone: '0423 840 130',
    // Other numbers of ours that may appear in a text (a staff mobile, say). They are not customer
    // details and are left as they are when a text goes to the AI. Set in .env; never in the code.
    otherPhones: list(env.BUSINESS_PHONES || ''),
  },

  llm: {
    // Free models are often busy. Each list is tried in order, best first, until one answers.
    gemini: {
      apiKey: (env.GEMINI_API_KEY || '').trim(),
      models: list(env.GEMINI_MODEL || 'gemini-3.8-flash', env.GEMINI_FALLBACK_MODELS ?? 'gemini-3.7-flash,gemini-3.5-flash,gemini-3.5-flash-lite'),
      url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    },
    openrouter: {
      apiKey: (env.OPENROUTER_API_KEY || '').trim(),
      models: list(env.OPENROUTER_MODEL || 'google/gemma-4-31b-it:free', env.OPENROUTER_FALLBACK_MODELS ?? 'google/gemma-4-26b-a4b-it:free'),
      url: 'https://openrouter.ai/api/v1/chat/completions',
    },
    // Marketplace chats are written by this model and the ones after it in the list, so the
    // small daily allowance of the better models is kept for dashboard customers. Empty: no split.
    marketplaceModel: (env.MARKETPLACE_MODEL ?? 'gemini-3.5-flash-lite').trim(),
    busyCooldownMinutes: num(env.BUSY_COOLDOWN_MINUTES, 5),
    temperature: 0.4,
    maxOutputTokens: 1500,
    dailyLimit: num(env.DAILY_DRAFT_LIMIT, 200),
    secondsBetween: num(env.SECONDS_BETWEEN_DRAFTS, 8),
  },

  // Facebook Marketplace chats, read from the content engine. Read-only.
  marketplace: {
    // Where the Marketplace inbox is read from. Set in .env; the section stays off until it is.
    url: (env.MARKETPLACE_URL || '').trim().replace(/\/+$/, ''),
    switchedOn: !/^(0|false|no|off)$/i.test((env.MARKETPLACE_ENABLED ?? '1').trim()),
    get enabled() { return this.switchedOn && !!this.url; },
    dailyDrafts: num(env.MARKETPLACE_DAILY_DRAFTS, 60),
    windowDays: 14,
  },

  // Texts seen on the business phone, reported by the browser add-on (extension/) that reads
  // Google Messages for web. Reports are accepted only from an add-on in a browser on this
  // computer (see allowed() in server.js). PHONE_ADDON=0 switches the intake off.
  phone: {
    switchedOn: !/^(0|false|no|off)$/i.test((env.PHONE_ADDON ?? '1').trim()),
    // Optional: the add-on's id (chrome://extensions shows it), so no other add-on is listened to.
    addonId: (env.PHONE_ADDON_ID || '').trim().toLowerCase(),
    // After this many minutes without a report the page says the add-on has gone quiet.
    staleMinutes: num(env.PHONE_STALE_MINUTES, 10),
  },

  // Senders that are never customers: a contact saved on the phone under a label, a finance company,
  // a courier, a code sender. A conversation under one of these names is kept but never listed.
  // Matched on the name without spaces or case, so "Credit One" and "creditone" are the same.
  ignoredSenders: list(env.IGNORED_SENDERS ?? 'Not customer, OTP, Delivery Service, Autotrader, CreditOne'),
  // The example bank of genuine replies. Tests point this at a scratch copy.
  examplesPath: env.EXAMPLES_PATH || path.join(root, 'voice', 'examples.json'),
  // The model replies: invented scenarios with a reply in the house voice, rated by the owner on the
  // page. The markdown is edited by hand; the status of each one is kept beside it in JSON.
  modelRepliesPath: env.MODEL_REPLIES_PATH || path.join(root, 'voice', 'model-replies.md'),
  modelRepliesStatePath: env.MODEL_REPLIES_STATE_PATH || path.join(root, 'voice', 'model-replies.json'),

  port: num(env.PORT, 3210),
  syncMinutes: num(env.SYNC_MINUTES, 3),
  draftMaxAgeHours: num(env.DRAFT_MAX_AGE_HOURS, 72),
  // A message older than this still shows under Waiting, but no suggestion is written until asked.
  autoDraftMaxAgeHours: num(env.AUTO_DRAFT_MAX_AGE_HOURS, 24),
  signOff: (env.SIGN_OFF ?? 'Regards,\\nTeam Carbarn').replace(/\\n/g, '\n').trim(),
  // The name on the last lines of the standard first reply (voice/first-reply.md).
  firstReplySender: (env.FIRST_REPLY_SENDER || 'Team Carbarn').trim(),
};

export function missingSettings() {
  const missing = [];
  if (!config.dashboard.baseUrl) missing.push('dashboard address (DASHBOARD_API_URL)');
  if (!config.dashboard.username || !config.dashboard.password) missing.push('dashboard login (DASHBOARD_USERNAME and DASHBOARD_PASSWORD)');
  if (!config.llm.gemini.apiKey && !config.llm.openrouter.apiKey) missing.push('an AI key (GEMINI_API_KEY or OPENROUTER_API_KEY)');
  return missing;
}
