// The environment every test and the demo start from: an in-memory database, invented logins and
// keys, and no real address anywhere. Call applyTestEnv() before importing anything from src/,
// because src/config.js reads process.env once, when it is first imported.

export const BASE_ENV = {
  DB_PATH: ':memory:',
  SIGN_OFF: 'Regards,\\nTeam Carbarn',
  GEMINI_API_KEY: 'test-key',
  OPENROUTER_API_KEY: '',
  GEMINI_MODEL: 'model-a',
  GEMINI_FALLBACK_MODELS: '',
  SECONDS_BETWEEN_DRAFTS: '0',
  DAILY_DRAFT_LIMIT: '500',
  MARKETPLACE_ENABLED: '0',
  MARKETPLACE_URL: '',
  DASHBOARD_API_URL: '',
  AUCTION_API_URL: '',
  DASHBOARD_USERNAME: 'tester',
  DASHBOARD_PASSWORD: ['stand', 'in', 'only'].join('-'), // invented: the stand-in accepts anything
  VOICE_PEOPLE_FILE: 'voice/people.example.json',
  PHONE_ADDON: '1',
  PHONE_ADDON_ID: '',
  PORT: '0',
};

/** Sets the shared environment, then the given overrides, over whatever is already there. */
export function applyTestEnv(overrides = {}) {
  for (const [k, v] of Object.entries({ ...BASE_ENV, ...overrides })) process.env[k] = String(v);
}
