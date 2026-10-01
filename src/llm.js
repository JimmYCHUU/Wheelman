// Talks to the AI model. Gemini (free tier) is the main provider; OpenRouter is the backup.
// Both are called through the same chat format.
//
// Free models are often busy. Each provider has a list of models, best first. A model that
// reports it is busy is rested for a few minutes and the next one is tried.

import { config } from './config.js';
import { addUsage, usageToday } from './db.js';
import { sydneyDay } from './time.js';

export class LlmError extends Error {
  constructor(message, { status = 0, provider = '', model = '', retryAfter = 0, daily = false } = {}) {
    super(message);
    this.status = status; this.provider = provider; this.model = model; this.retryAfter = retryAfter; this.daily = daily;
  }
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let lastCallAt = 0;
const resting = new Map(); // "provider/model" -> time it may be tried again
const lastAnswered = { provider: '', model: '', at: 0 };

/** Every provider + model the app may use, in the order they are tried. */
export function providers() {
  const out = [];
  for (const name of ['gemini', 'openrouter']) {
    const p = config.llm[name];
    if (!p.apiKey) continue;
    for (const model of p.models) out.push({ name, model, url: p.url, apiKey: p.apiKey });
  }
  return out;
}

export function modelStatus() {
  const now = Date.now();
  return providers().map((p) => ({ name: p.name, model: p.model, restingMinutes: Math.max(0, Math.ceil(((resting.get(`${p.name}/${p.model}`) || 0) - now) / 60000)) }));
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
    const retryAfter = Number(res.headers.get('retry-after')) || 0;
    let detail = text.slice(0, 300);
    try { const j = JSON.parse(text); const e = (Array.isArray(j) ? j[0] : j)?.error; detail = [e?.message, e?.metadata?.raw].filter(Boolean).join(' — ').slice(0, 300) || detail; } catch { /* keep raw */ }
    const daily = res.status === 429 && /(per day|per-day|daily|requests per day|RPD|free-models-per-day|quota exceeded for metric.*day)/i.test(text);
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
 */
export async function complete(system, user) {
  const list = providers();
  if (!list.length) throw new LlmError('No AI key is filled in. Add GEMINI_API_KEY (or OPENROUTER_API_KEY) to the .env file.');
  if (usage().remaining <= 0) throw new LlmError(`Daily limit of ${config.llm.dailyLimit} AI requests reached. It resets at midnight Sydney time.`, { daily: true });

  const errors = [];
  const dailyOut = new Set();
  for (let round = 0; round < 2; round++) {
    let tried = 0;
    for (const p of list) {
      const key = `${p.name}/${p.model}`;
      if (dailyOut.has(p.name)) continue;
      // On the first round skip models that recently said they were busy; on the second, try everything.
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
        Object.assign(lastAnswered, { provider: p.name, model: p.model, at: Date.now() });
        return { ...out, json };
      } catch (e) {
        errors.push(e.message);
        if (e.status === 401 || e.status === 403) { dailyOut.add(p.name); continue; } // bad key: skip this provider
        if (e.daily) { dailyOut.add(p.name); continue; }
        if (isBusy(e.status) || !e.status) resting.set(key, Date.now() + config.llm.busyCooldownMinutes * 60000);
      }
    }
    if (round === 0) await pause(tried ? 8000 : 0);
  }
  const allDaily = dailyOut.size && [...new Set(list.map((p) => p.name))].every((n) => dailyOut.has(n));
  throw new LlmError('No AI model could answer. ' + [...new Set(errors)].slice(-3).join(' | '), { daily: !!allDaily });
}
