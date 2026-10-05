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
  sessionPath: path.join(root, 'data', '.session.json'),
  knowledgeDir: path.join(root, 'knowledge'),
  // The website's "import this model" pages, saved by fetch-website. One file per model.
  importPagesDir: path.join(root, 'knowledge', 'website', 'importing'),
  voiceDir: path.join(root, 'voice'),
  webDir: path.join(root, 'web'),

  dashboard: {
    // The address of the dashboard's data service. Set in .env; it is not written in the code.
    baseUrl: (env.DASHBOARD_API_URL || '').trim().replace(/\/+$/, ''),
    origin: 'https://dashboard.carbarn.com.au',
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
