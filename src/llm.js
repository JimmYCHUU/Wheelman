// Talks to the AI model. Gemini (free tier) is the main provider; OpenRouter is the backup.
// Both are called through the same chat format.
//
// Free models are often busy. Each provider has a list of models, best first. A model that
// reports it is busy is rested for a few minutes and the next one is tried.
//
// Each free model also has its own daily allowance (in October 2026 Gemini gave 20 requests a
// day to each of its better models). A model that says its allowance is used up is left alone
// until the time it says the allowance returns, and the next model carries on.

import { config } from './config.js';
import { addUsage, usageToday } from './db.js';
import { sydneyDay, formatSydney } from './time.js';

export class LlmError extends Error {
  constructor(message, { status = 0, provider = '', model = '', retryAfter = 0, daily = false, detail = '' } = {}) {
    super(message);
    this.status = status; this.provider = provider; this.model = model; this.retryAfter = retryAfter; this.daily = daily;
    this.detail = detail; // what the AI services actually answered, for the log
  }
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let lastCallAt = 0;
const resting = new Map();   // "provider/model" -> time it may be tried again (it was busy)
const exhausted = new Map(); // "provider/model" -> time its daily allowance returns
const lastAnswered = { provider: '', model: '', at: 0 };
const keyOf = (p) => `${p.name}/${p.model}`;

/** Seconds until a model says it may be tried again: a header, "retryDelay": "63956s", or "retry in 17h45m56s". */
export function retrySeconds(text, header = '') {
  if (Number(header) > 0) return Math.ceil(Number(header));
  const d = String(text).match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/);
  if (d) return Math.ceil(Number(d[1]));
  const m = String(text).match(/retry in (?:(\d+)h)?(?:(\d+)m(?!s))?(?:([\d.]+)s)?/i);
  if (m && (m[1] || m[2] || m[3])) return Math.ceil((Number(m[1]) || 0) * 3600 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0));
  return 0;
}

/** True when a refusal means the day's allowance is used up, not that the model is busy for a moment. */
export function isDailyLimit(text, seconds = 0) {
  return /(per\s?day|per-day|daily|\bRPD\b|free-models-per-day)/i.test(String(text)) || seconds >= 30 * 60;
}

/** Forgets which models are resting or used up. For tests. */
export function resetModelState() { resting.clear(); exhausted.clear(); lastCallAt = 0; }

/**
 * Every provider + model the app may use, in the order they are tried.
 * For Marketplace chats the list starts at the small model: the better models before it are
 * never asked, so their daily allowance is kept for dashboard customers.
 */
export function providers({ marketplace = false } = {}) {
  const out = [];
  for (const name of ['gemini', 'openrouter']) {
    const p = config.llm[name];
    if (!p.apiKey) continue;
    for (const model of p.models) out.push({ name, model, url: p.url, apiKey: p.apiKey });
  }
  if (!marketplace || !config.llm.marketplaceModel) return out;
  const from = out.findIndex((p) => p.model === config.llm.marketplaceModel);
  return from > 0 ? out.slice(from) : out;
}

export function modelStatus() {
  const now = Date.now();
  const all = providers();
  const forChats = new Set(providers({ marketplace: true }).map(keyOf));
  return all.map((p) => {
    const out = exhausted.get(keyOf(p)) || 0;
    return {
      name: p.name, model: p.model,
      // False for a model kept for dashboard customers only.
      marketplace: forChats.has(keyOf(p)),
      restingMinutes: Math.max(0, Math.ceil(((resting.get(keyOf(p)) || 0) - now) / 60000)),
      // Set while the model's daily allowance is used up: when it says the allowance returns.
      usedUpUntil: out > now ? out : null,
    };
  });
}

export const lastModel = () => ({ ...lastAnswered });

export function usage() {
  const u = usageToday(sydneyDay());
  return { ...u, limit: config.llm.dailyLimit, remaining: Math.max(0, config.llm.dailyLimit - u.total) };
}

/** Finds the JSON object in a model reply, tolerating code fences and stray text. */
export function parseJsonReply(content) {
  let t = String(content || '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(t); } catch { /* fall through */ }
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try { return JSON.parse(t.slice(start, end + 1)); } catch { /* fall through */ }
  }
  throw new LlmError('The AI model did not return a readable answer.');
}

export async function callModel(p, system, user, { maxTokens = config.llm.maxOutputTokens, timeoutMs = 60000 } = {}) {
  const body = {
    model: p.model,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    temperature: config.llm.temperature,
    max_tokens: maxTokens,
    response_format: { type: 'json_object' },
  };
  if (p.name === 'gemini') body.reasoning_effort = 'low';

  const headers = { 'content-type': 'application/json', authorization: `Bearer ${p.apiKey}` };
  if (p.name === 'openrouter') headers['x-title'] = 'Wheelman (Carbarn)';

  let res, text;
  try {
    res = await fetch(p.url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
    text = await res.text();
  } catch (e) {
    throw new LlmError(`${p.model} did not answer in time (${e.name === 'TimeoutError' ? 'timed out' : e.message}).`, { status: 504, provider: p.name, model: p.model });
  }
  if (!res.ok) {
    const retryAfter = res.status === 429 ? retrySeconds(text, res.headers.get('retry-after')) : Number(res.headers.get('retry-after')) || 0;
    let detail = text.slice(0, 300);
    try { const j = JSON.parse(text); const e = (Array.isArray(j) ? j[0] : j)?.error; detail = [e?.message, e?.metadata?.raw].filter(Boolean).join(' — ').replace(/\s+/g, ' ').slice(0, 300) || detail; } catch { /* keep raw */ }
    const daily = res.status === 429 && isDailyLimit(text, retryAfter);
    throw new LlmError(`${p.model} returned ${res.status}: ${detail}`, { status: res.status, provider: p.name, model: p.model, retryAfter, daily });
  }
  let json;
  try { json = JSON.parse(text); } catch { throw new LlmError(`${p.model} returned an unreadable response.`, { status: 502, provider: p.name, model: p.model }); }
  const content = json.choices?.[0]?.message?.content;
  if (!content || !String(content).trim() || /^\s*\{\s*\}\s*$/.test(content)) {
    throw new LlmError(`${p.model} returned an empty answer (finish reason: ${json.choices?.[0]?.finish_reason || 'unknown'}).`, { status: 502, provider: p.name, model: p.model });
  }
  return { content, provider: p.name, model: p.model };
}

const isBusy = (status) => [408, 429, 500, 502, 503, 504, 529].includes(status);

/**
 * Sends one request. Respects the per-minute gap and the daily cap. Works down the list of
 * models until one answers; if all are busy it waits briefly and goes round once more.
 * With `marketplace`, only the models Marketplace chats may use are asked.
 */
export async function complete(system, user, { marketplace = false } = {}) {
  const list = providers({ marketplace });
  if (!list.length) throw new LlmError('No AI key is filled in. Add GEMINI_API_KEY (or OPENROUTER_API_KEY) to the .env file.');
  if (usage().remaining <= 0) throw new LlmError(`Daily limit of ${config.llm.dailyLimit} AI requests reached. It resets at midnight Sydney time.`, { daily: true });

  const errors = [];
  const badKey = new Set(); // providers that rejected the key
  for (let round = 0; round < 2; round++) {
    let tried = 0;
    for (const p of list) {
      const key = keyOf(p);
      if (badKey.has(p.name)) continue;
      // A model whose daily allowance is used up is not asked again until the allowance returns.
      if ((exhausted.get(key) || 0) > Date.now()) continue;
      // On the first round skip models that recently said they were busy; on the second, try them again.
      if (round === 0 && (resting.get(key) || 0) > Date.now()) continue;
      const wait = lastCallAt + config.llm.secondsBetween * 1000 - Date.now();
      if (wait > 0 && tried === 0) await pause(wait);
      lastCallAt = Date.now();
      tried++;
      try {
        const out = await callModel(p, system, user);
        const json = parseJsonReply(out.content);
        addUsage(sydneyDay(), p.name);
        resting.delete(key);
        exhausted.delete(key);
        Object.assign(lastAnswered, { provider: p.name, model: p.model, at: Date.now() });
        return { ...out, json };
      } catch (e) {
        errors.push(e.message);
        if (e.status === 401 || e.status === 403) { badKey.add(p.name); continue; }
        if (e.daily) {
          // The allowance is per model, so only this model is set aside. With no time given, look again in an hour.
          const seconds = Math.min(26 * 3600, Math.max(10 * 60, e.retryAfter || 3600));
          exhausted.set(key, Date.now() + seconds * 1000);
          continue;
        }
        if (isBusy(e.status) || !e.status) resting.set(key, Date.now() + config.llm.busyCooldownMinutes * 60000);
      }
    }
    if (round === 0) await pause(tried ? 8000 : 0);
  }

  const detail = [...new Set(errors)].slice(-4).join(' | ');
  const usable = list.filter((p) => !badKey.has(p.name));
  if (!usable.length) {
    throw new LlmError(`The AI service rejected the key in the .env file (${[...badKey].join(' and ')}). ${detail}`, { status: 401, detail });
  }
  const now = Date.now();
  const split = marketplace && list.length < providers().length;
  if (usable.every((p) => (exhausted.get(keyOf(p)) || 0) > now)) {
    const back = Math.min(...usable.map((p) => exhausted.get(keyOf(p))));
    if (split) throw new LlmError(`The AI models used for Marketplace have used up their allowance for today. Marketplace suggestions start again by themselves around ${formatSydney(back)}.`, { daily: true, detail });
    throw new LlmError(`Every free AI model has used up its allowance for today. Suggestions start again by themselves around ${formatSydney(back)}.`, { daily: true, detail });
  }
  if (split) throw new LlmError('The AI models used for Marketplace could not answer just now. Wheelman tries again by itself in a few minutes.', { detail });
  throw new LlmError('No AI model could answer just now. The free models are busy or have used up their allowance for today. Wheelman tries again by itself in a few minutes.', { detail });
}
