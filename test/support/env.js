// The environment every test starts from: an in-memory database, invented logins and
// keys, and no real address anywhere. Call applyTestEnv() before importing anything from src/,
// because src/config.js reads process.env once, when it is first imported.

import os from 'node:os';
import path from 'node:path';

export const BASE_ENV = {
  DB_PATH: ':memory:',
  // No test writes a backup unless it says so, and never into the real backup folder.
  BACKUPS: '0',
  BACKUP_DIR: path.join(os.tmpdir(), `wheelman-test-backups-${process.pid}`),
  // The example bank is this computer's own: a check that runs a cycle rebuilds the bank, so it is
  // built in a scratch file.
  EXAMPLES_PATH: path.join(os.tmpdir(), `wheelman-test-examples-${process.pid}.json`),
  // The website's eligible-models list, as read by the Import Query section: a scratch file, never data/.
  ELIGIBLE_MODELS_PATH: path.join(os.tmpdir(), `wheelman-test-eligible-${process.pid}.json`),
  SIGN_OFF: 'Regards,\\nTeam Carbarn',
  GEMINI_API_KEY: 'test-key',
  OPENAI_API_KEY: '',
  OPENROUTER_API_KEY: '',
  // A key pasted on the page is written to the .env file: in tests, a scratch file, never the real one.
  ENV_PATH: path.join(os.tmpdir(), `wheelman-test-env-${process.pid}`),
  // The AI price file and the month's budget: a scratch file, never data/, and the usual budget.
  AI_PRICES_PATH: path.join(os.tmpdir(), `wheelman-test-prices-${process.pid}.json`),
  AI_MONTHLY_BUDGET_AUD: '50',
  // Review runs go to a scratch folder, never data/review.
  REVIEW_DIR: path.join(os.tmpdir(), `wheelman-test-review-${process.pid}`),
  GEMINI_MODEL: 'model-a',
  GEMINI_FALLBACK_MODELS: '',
  SECONDS_BETWEEN_DRAFTS: '0',
  DAILY_DRAFT_LIMIT: '500',
  MARKETPLACE_ENABLED: '0',
  MARKETPLACE_URL: '',
  // The Import Query section is off unless a test switches it on, and the website's list is never
  // the real website: a dead local address that a test points at a stand-in.
  MAIL_INTAKE: '0',
  SITE_API_URL: 'http://127.0.0.1:9',
  DASHBOARD_API_URL: '',
  AUCTION_API_URL: '',
  DASHBOARD_USERNAME: 'tester',
  DASHBOARD_PASSWORD: ['stand', 'in', 'only'].join('-'), // invented: the stand-in accepts anything
  VOICE_PEOPLE_FILE: 'voice/people.example.json',
  PHONE_ADDON: '1',
  PHONE_ADDON_ID: '',
  PHONE_WRITE_AT_ONCE: '0', // a test switches it on when it is what the test is about: a background write would otherwise take other tests' scripted answers
  PORT: '0',
  // The stand-ins serve their pictures from this computer; the real app never fetches one from here.
  MEDIA_ALLOW_LOCAL: '1',
  // Sharing with the team is off, with no password, unless a test switches it on. No test ever
  // starts a tunnel.
  SHARE: '0',
  TEAM_PASSWORD: '',
};

/** Sets the shared environment, then the given overrides, over whatever is already there. */
export function applyTestEnv(overrides = {}) {
  for (const [k, v] of Object.entries({ ...BASE_ENV, ...overrides })) process.env[k] = String(v);
}
