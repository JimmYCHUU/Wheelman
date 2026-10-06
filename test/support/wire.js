// Points the app's settings at the stand-ins. The clients read config at call time, so this is all
// a test has to do after starting them.

/**
 * @param config      the object from src/config.js
 * @param standins    what startStandins() returned
 * @param sessionPath where the stand-in dashboard's cookie is kept (never the real session file)
 */
export function pointConfigAt(config, standins, { sessionPath, port } = {}) {
  config.llm.gemini.url = `${standins.base}/chat`;
  config.llm.openrouter.url = `${standins.base}/chat`;
  config.dashboard.baseUrl = standins.base;
  config.auction.baseUrl = standins.base;
  config.marketplace.url = `${standins.engineBase}/inbox`;
  if (sessionPath) config.sessionPath = sessionPath;
  if (port !== undefined) config.port = port;
}
