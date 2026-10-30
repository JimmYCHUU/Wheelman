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
  // Replay runs set this: no request goes to the dashboard, the content engine or the car-media addresses.
  offline: env.OFFLINE === '1',
  // Photos from texts, fetched once and kept beside the database. Tests keep theirs in a temporary folder.
  mediaDir: env.MEDIA_DIR || (env.DB_PATH === ':memory:' ? path.join(os.tmpdir(), `wheelman-media-${process.pid}`) : path.join(path.dirname(env.DB_PATH || path.join(root, 'data', 'app.db')), 'media')),
  // Pictures from this computer itself (http://127.0.0.1): only the tests' stand-ins serve them.
  mediaAllowLocal: env.MEDIA_ALLOW_LOCAL === '1',
  sessionPath: env.SESSION_PATH || path.join(root, 'data', '.session.json'),
  knowledgeDir: path.join(root, 'knowledge'),
  // The website's "import this model" pages, saved by fetch-website. One file per model.
  importPagesDir: path.join(root, 'knowledge', 'website', 'importing'),
  voiceDir: path.join(root, 'voice'),
  // The voice folder the Playbook's saved wording belongs to: read from there, each file has it
  // laid over (src/wording.js). A script that points voiceDir at a folder of its own (the review's
  // --b-voice) reads that folder as written.
  playbookVoiceDir: path.join(root, 'voice'),
  webDir: path.join(root, 'web'),
  // The .env file itself: where a key pasted on the page is written. Tests point this at a scratch file.
  envPath: env.ENV_PATH || path.join(root, '.env'),
  // The prices of the AI models, in the owner's hand: what each provider charges per million
  // tokens, for the month's estimate on the page. Written with blanks on first start.
  aiPricesPath: env.AI_PRICES_PATH || path.join(root, 'data', 'ai-prices.json'),
  // The review runs (scripts/review.js): real customer text, so under data/, which git never sees.
  reviewDir: env.REVIEW_DIR || path.join(root, 'data', 'review'),

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
    // Whether an auction message is fitted to the customer by the AI (one request each; the
    // figures stay as code put them in). Off: every message is the owner's wording word for word.
    fit: !/^(0|false|no|off)$/i.test((env.AUCTION_FIT ?? '1').trim()),
    // Whether the message that is due is fitted in the background too, or only when one is picked or written on the page.
    fitInBackground: !/^(0|false|no|off)$/i.test((env.AUCTION_FIT_BACKGROUND ?? '1').trim()),
  },

  site: {
    baseUrl: 'https://www.carbarn.com.au',
    // Where the website's own data (the eligible-models list) is read from. The website itself
    // unless set otherwise; tests point it at a stand-in. Page links always use baseUrl.
    apiUrl: (env.SITE_API_URL || '').trim().replace(/\/+$/, '') || 'https://www.carbarn.com.au',
    // The address of the yard, as written in every message. No map link is sent anywhere.
    address: '136 Frances Street, Lidcombe NSW 2141',
    // What a reply calls the premises. The team says "the yard"; the brand says showroom.
    showroom: 'our Lidcombe showroom',
    phone: '0423 840 130',
    // Other numbers of ours that may appear in a text (a staff mobile, say). They are not customer
    // details and are left as they are when a text goes to the AI. Set in .env; never in the code.
    otherPhones: list(env.BUSINESS_PHONES || ''),
  },

  llm: {
    // Three providers, each with the models the .env file names, best first. The page chooses
    // which provider and model write (src/aimodels.js); the rest are tried in this order when it
    // does not answer. Free models are often busy. Each provider also has a models address, where
    // the page reads what the provider offers right now.
    gemini: {
      apiKey: (env.GEMINI_API_KEY || '').trim(),
      models: list(env.GEMINI_MODEL || 'gemini-3.8-flash', env.GEMINI_FALLBACK_MODELS ?? 'gemini-3.7-flash,gemini-3.5-flash,gemini-3.5-flash-lite'),
      url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      modelsUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    },
    // ChatGPT: OpenAI's own service, paid by the request. gpt-5.6 is OpenAI's name for its current
    // model; the page lists the ones the key can use.
    openai: {
      apiKey: (env.OPENAI_API_KEY || '').trim(),
      models: list(env.OPENAI_MODEL || 'gpt-5.6', env.OPENAI_FALLBACK_MODELS ?? ''),
      url: 'https://api.openai.com/v1/chat/completions',
      modelsUrl: 'https://api.openai.com/v1/models',
    },
    openrouter: {
      apiKey: (env.OPENROUTER_API_KEY || '').trim(),
      models: list(env.OPENROUTER_MODEL || 'google/gemma-4-31b-it:free', env.OPENROUTER_FALLBACK_MODELS ?? 'google/gemma-4-26b-a4b-it:free'),
      url: 'https://openrouter.ai/api/v1/chat/completions',
      modelsUrl: 'https://openrouter.ai/api/v1/models',
      // The models list is public, so a pasted key is checked here.
      keyCheckUrl: 'https://openrouter.ai/api/v1/auth/key',
    },
    // The small model: where the list starts for the jobs that need no better one (the customer
    // read, Marketplace chats, lessons from the owner's notes), keeping to the free models after
    // it unless the page chose one for the job. Empty: no split. MARKETPLACE_MODEL is the old
    // name of the same setting and is still read.
    marketplaceModel: (env.SMALL_MODEL ?? env.MARKETPLACE_MODEL ?? 'gemini-3.5-flash-lite').trim(),
    get smallModel() { return this.marketplaceModel; },
    // The month's budget for the paid models, in Australian dollars. The page warns at 80%; at
    // 100% the small jobs keep to free models while dashboard suggestions continue.
    monthlyBudgetAud: num(env.AI_MONTHLY_BUDGET_AUD, 50),
    busyCooldownMinutes: num(env.BUSY_COOLDOWN_MINUTES, 5),
    temperature: 0.4,
    maxOutputTokens: 1500,
    dailyLimit: num(env.DAILY_DRAFT_LIMIT, 200),
    secondsBetween: num(env.SECONDS_BETWEEN_DRAFTS, 8),
    // How much each request carries (src/prompt.js): 'full', the whole voice file and sales
    // playbook, unless PROMPT_STYLE is 'compact', a short voice card and the advice for that message.
    // Compact is used only for a plain reply to a text on the dashboard (styleFor in src/drafter.js).
    promptStyle: env.PROMPT_STYLE === 'compact' ? 'compact' : 'full',
  },

  // Facebook Marketplace chats, read from the content engine. Read-only.
  marketplace: {
    // Where the Marketplace inbox is read from. Set in .env; the section stays off until it is.
    url: (env.MARKETPLACE_URL || '').trim().replace(/\/+$/, ''),
    switchedOn: !/^(0|false|no|off)$/i.test((env.MARKETPLACE_ENABLED ?? '1').trim()),
    get enabled() { return this.switchedOn && !!this.url; },
    dailyDrafts: num(env.MARKETPLACE_DAILY_DRAFTS, 60),
    windowDays: 14,
    // Every link to the website in a Marketplace reply carries utm_source=<this>, so a visit (and
    // the lead it becomes) shows it came from a Marketplace chat. "facebook" until 20 Oct 2026.
    linkSource: 'marketplace',
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
    // A new text seen on the phone sets off a dashboard check and the suggestion at once, instead
    // of waiting for the next few-minute check. PHONE_WRITE_AT_ONCE=0 leaves it to that check.
    writeAtOnce: !/^(0|false|no|off)$/i.test((env.PHONE_WRITE_AT_ONCE ?? '1').trim()),
  },

  // Email threads the owner hands in from Gmail with the add-on's "Send to Wheelman" button: the
  // Import Query section. MAIL_INTAKE=0 switches the intake off. A message from one of these
  // domains is our side of a thread; everything else is the customer.
  mail: {
    switchedOn: !/^(0|false|no|off)$/i.test((env.MAIL_INTAKE ?? '1').trim()),
    ourDomains: list(env.MAIL_OUR_DOMAINS ?? 'carbarn.com.au').map((d) => d.toLowerCase().replace(/^@/, '')),
    // An email older than this still shows under Waiting, but no reply is written until asked.
    autoDraftMaxAgeDays: num(env.MAIL_AUTO_DRAFT_MAX_AGE_DAYS, 7),
  },

  // Import Query research: the website's eligible-models list, read once a day into a file beside
  // the database and looked up for every import email; the live auction for a snapshot of what
  // is coming up. IMPORT_RESEARCH_DAILY caps the emails researched with live requests in a day.
  importQuery: {
    researchDaily: num(env.IMPORT_RESEARCH_DAILY, 60),
    auctionSnapshot: !/^(0|false|no|off)$/i.test((env.IMPORT_AUCTION_SNAPSHOT ?? '1').trim()),
    modelsMaxAgeMs: 24 * 3600 * 1000,
    modelsPath: env.ELIGIBLE_MODELS_PATH || path.join(path.dirname(env.DB_PATH && env.DB_PATH !== ':memory:' ? env.DB_PATH : path.join(root, 'data', 'app.db')), 'eligible-models.json'),
  },

  // Backups: one dated zip file of everything that lives only on this computer, written when
  // Wheelman closes and once a day while it is open. BACKUPS=0 switches that off ("npm run backup"
  // still works). The folder is outside the Wheelman folder on purpose, so a copy survives the
  // folder being deleted; point BACKUP_DIR at a USB drive or a synced folder to survive the computer.
  backup: {
    on: !/^(0|false|no|off)$/i.test((env.BACKUPS ?? '1').trim()),
    dir: (env.BACKUP_DIR || '').trim() || path.join(os.homedir(), 'Documents', 'Wheelman backups'),
    keep: Math.max(1, num(env.BACKUP_KEEP, 20)),
  },

  // Sharing with the team: the page reached from other computers through a Cloudflare tunnel
  // (SHARE=1, or "Share Wheelman.cmd"), behind a password everyone on the team types once.
  // Sharing stays off while the password is empty. A named tunnel's token and its address give a
  // fixed address of your own; without them the address is a free one that changes each start.
  share: {
    on: /^(1|true|yes|on)$/i.test((env.SHARE ?? '0').trim()),
    password: (env.TEAM_PASSWORD || '').trim(),
    days: num(env.TEAM_SIGNIN_DAYS, 30),
    tunnelToken: (env.CLOUDFLARE_TUNNEL_TOKEN || '').trim(),
    url: (env.SHARE_URL || '').trim().replace(/\/+$/, ''),
    cloudflaredPath: (env.CLOUDFLARED_PATH || '').trim(),
  },

  // Senders that are never customers: a contact saved on the phone under a label, a finance company,
  // a courier, a code sender. A conversation under one of these names is kept but never listed.
  // Matched on the name without spaces or case, so "Credit One" and "creditone" are the same.
  ignoredSenders: list(env.IGNORED_SENDERS ?? 'Not customer, OTP, Delivery Service, Autotrader, CreditOne'),
  // The example bank of genuine replies. Tests point this at a scratch copy.
  examplesPath: env.EXAMPLES_PATH || path.join(root, 'voice', 'examples.json'),

  port: num(env.PORT, 3210),
  syncMinutes: num(env.SYNC_MINUTES, 3),
  // How often the dashboard's notification feed is read for a new lead, in seconds. 0 switches it
  // off; anything else is at least 15, so the dashboard is not asked more than four times a minute.
  notificationsSeconds: (() => { const n = num(env.NOTIFICATIONS_SECONDS, 45); return n > 0 ? Math.max(15, n) : 0; })(),
  draftMaxAgeHours: num(env.DRAFT_MAX_AGE_HOURS, 72),
  // A message older than this still shows under Waiting, but no suggestion is written until asked.
  autoDraftMaxAgeHours: num(env.AUTO_DRAFT_MAX_AGE_HOURS, 24),
  // Follow-ups: when a conversation we replied to last is put in front of you again (src/followup.js).
  // Quiet: hours after our last message with nothing from them. After an inspection: hours after
  // the booked time. Max age: our last message older than this gets no follow-up. The reminder
  // hour is the hour (Sydney) of the reminder the day before; stock days is how far back a change
  // to a car reaches the people who asked about it.
  followUp: {
    on: !/^(0|false|no|off)$/i.test((env.FOLLOW_UPS ?? '1').trim()),
    quietHours: num(env.FOLLOW_UP_QUIET_HOURS, 60),
    afterInspectionHours: num(env.FOLLOW_UP_AFTER_INSPECTION_HOURS, 3),
    maxAgeDays: num(env.FOLLOW_UP_MAX_AGE_DAYS, 14),
    reminderHour: num(env.FOLLOW_UP_REMINDER_HOUR, 16),
    stockDays: num(env.FOLLOW_UP_STOCK_DAYS, 30),
  },
  signOff: (env.SIGN_OFF ?? 'Regards,\\nTeam Carbarn').replace(/\\n/g, '\n').trim(),
  // The name on the last lines of the standard first reply (voice/first-reply.md).
  firstReplySender: (env.FIRST_REPLY_SENDER || 'Team Carbarn').trim(),
};

export function missingSettings() {
  const missing = [];
  if (!config.dashboard.baseUrl) missing.push('dashboard address (DASHBOARD_API_URL)');
  if (!config.dashboard.username || !config.dashboard.password) missing.push('dashboard login (DASHBOARD_USERNAME and DASHBOARD_PASSWORD)');
  if (!config.llm.gemini.apiKey && !config.llm.openai.apiKey && !config.llm.openrouter.apiKey) missing.push('an AI key (GEMINI_API_KEY, OPENAI_API_KEY or OPENROUTER_API_KEY)');
  return missing;
}
