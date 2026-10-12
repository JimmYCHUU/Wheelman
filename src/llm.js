// Talks to the AI model. Three providers: Gemini (free tier), ChatGPT (OpenAI, paid) and OpenRouter
// (free models). All are called through the same chat format, with OpenAI's own names for two of
// the fields. The page chooses which provider and model write (src/aimodels.js); the others are
// asked only when it does not answer.
//
// Free models are often busy. Each provider has a list of models, best first. A model that
// reports it is busy is rested for a few minutes and the next one is tried.
//
// Each free model also has its own daily allowance (in October 2026 Gemini gave 20 requests a
// day to each of its better models). A model that says its allowance is used up is left alone
// until the time it says the allowance returns, and the next model carries on.

import { config } from './config.js';
import { addUsage, usageToday, usageByModel } from './db.js';
import { sydneyDay, formatSydney } from './time.js';
import { aiChoice, PROVIDER_ORDER, PROVIDERS, providerLabel } from './aimodels.js';

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
 * Every provider + model the app may use, in the order they are tried. The model chosen on the
 * page comes first, whether or not the .env file names it; the rest follow in their usual order,
 * asked only when it does not answer.
 * For Marketplace chats the list starts at the small model and keeps to the free models: the
 * better models before it are never asked, so their daily allowance is kept for dashboard
 * customers, and nothing paid is spent on Marketplace. The chosen model is asked for Marketplace
 * too only when the page said so (or when it is one of the small free ones already). With no free
 * model at all, Marketplace uses what there is.
 */
export function providers({ marketplace = false } = {}) {
  const all = [];
  for (const name of PROVIDER_ORDER) {
    const p = config.llm[name];
    if (!p?.apiKey) continue;
    for (const model of p.models) all.push({ name, model, url: p.url, apiKey: p.apiKey });
  }
  const choice = aiChoice();
  let chosen = null;
  if (choice && config.llm[choice.provider]?.apiKey) {
    const p = config.llm[choice.provider];
    chosen = all.find((x) => x.name === choice.provider && x.model === choice.model) || { name: choice.provider, model: choice.model, url: p.url, apiKey: p.apiKey };
  }
  const after = (list) => list.filter((x) => x !== chosen);
  if (!marketplace || !config.llm.marketplaceModel) return chosen ? [chosen, ...after(all)] : all;
  const from = all.findIndex((x) => x.model === config.llm.marketplaceModel);
  const tail = from > 0 ? all.slice(from) : all;
  const free = tail.filter((x) => PROVIDERS[x.name].free);
  const small = free.length ? free : tail;
  if (chosen && (choice.marketplace || small.includes(chosen))) return [chosen, ...after(small)];
  return small;
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

/**
 * What the AI has been asked so far, for the panel on the page: requests and tokens by provider
 * and model, today and this month (Sydney days), and the day's count against the cap. What the
 * tokens cost is on each provider's own page; Wheelman does not know the prices.
 */
export function usageDetail() {
  const day = sydneyDay();
  const month = day.slice(0, 7);
  return { day, month, usedToday: usageToday(day).total, limit: config.llm.dailyLimit, today: usageByModel({ day }), thisMonth: usageByModel({ prefix: month }) };
}

/**
 * The tokens one request used, from the provider's own count: what went in, and what came out
 * including the model's thinking, which the paid providers charge as output. Gemini folds the
 * thinking into the total only; OpenAI counts it inside the completion. Null when the provider
 * gave no count.
 */
export function tokenCounts(u) {
  if (!u || typeof u !== 'object') return null;
  const n = (v) => Math.max(0, Math.round(Number(v) || 0));
  const tin = n(u.prompt_tokens);
  return { in: tin, out: Math.max(n(u.completion_tokens), n(u.total_tokens) - tin) };
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

/**
 * The request one model is sent. Gemini and OpenRouter take the plain chat form. OpenAI's current
 * models take max_completion_tokens instead of max_tokens; its reasoning ones (the o-series, GPT-5
 * and later) think before they answer out of the same allowance, keep their own temperature, and
 * are asked to think briefly, since a text message does not need more.
 */
export function requestBody(p, system, user, maxTokens = config.llm.maxOutputTokens) {
  const body = {
    model: p.model,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    temperature: config.llm.temperature,
    max_tokens: maxTokens,
    response_format: { type: 'json_object' },
  };
  if (p.name === 'gemini') body.reasoning_effort = 'low';
  if (p.name === 'openai') {
    delete body.max_tokens;
    const reasoning = /^(o\d|gpt-5)/.test(p.model);
    body.max_completion_tokens = reasoning ? maxTokens + 4000 : maxTokens;
    if (reasoning) { delete body.temperature; body.reasoning_effort = 'low'; }
  }
  return body;
}

/**
 * The field a model's 400 answer names as one it does not take, when the request has it. OpenAI
 * names the field ("param"); other services only say so in the message.
 */
export function unsupportedField(text, body) {
  const fields = Object.keys(body).filter((k) => k !== 'model' && k !== 'messages');
  let param = '';
  try { param = String(JSON.parse(text)?.error?.param || ''); } catch { /* not json */ }
  if (!param && /unsupported|not supported|does not support|unknown (parameter|field)/i.test(text)) param = fields.find((k) => new RegExp(`\\b${k}\\b`).test(text)) || '';
  return fields.includes(param) ? param : '';
}

export async function callModel(p, system, user, { maxTokens = config.llm.maxOutputTokens, timeoutMs = 60000 } = {}) {
  const body = requestBody(p, system, user, maxTokens);
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${p.apiKey}` };
  if (p.name === 'openrouter') headers['x-title'] = 'Wheelman (Carbarn)';

  for (let attempt = 0; ; attempt++) {
    let res, text;
    try {
      res = await fetch(p.url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
      text = await res.text();
    } catch (e) {
      throw new LlmError(`${p.model} did not answer in time (${e.name === 'TimeoutError' ? 'timed out' : e.message}).`, { status: 504, provider: p.name, model: p.model });
    }
    if (res.ok) {
      let json;
      try { json = JSON.parse(text); } catch { throw new LlmError(`${p.model} returned an unreadable response.`, { status: 502, provider: p.name, model: p.model }); }
      const content = json.choices?.[0]?.message?.content;
      if (!content || !String(content).trim() || /^\s*\{\s*\}\s*$/.test(content)) {
        throw new LlmError(`${p.model} returned an empty answer (finish reason: ${json.choices?.[0]?.finish_reason || 'unknown'}).`, { status: 502, provider: p.name, model: p.model });
      }
      return { content, provider: p.name, model: p.model, usage: tokenCounts(json.usage) };
    }
    // A model that does not take one of the fields (a newer or an older one than the request
    // expects) says which. The request goes again without it, up to twice.
    if (res.status === 400 && attempt < 2) {
      const field = unsupportedField(text, body);
      if (field) { delete body[field]; continue; }
    }
    const retryAfter = res.status === 429 ? retrySeconds(text, res.headers.get('retry-after')) : Number(res.headers.get('retry-after')) || 0;
    let detail = text.slice(0, 300);
    try { const j = JSON.parse(text); const e = (Array.isArray(j) ? j[0] : j)?.error; detail = [e?.message, e?.metadata?.raw].filter(Boolean).join(' — ').replace(/\s+/g, ' ').slice(0, 300) || detail; } catch { /* keep raw */ }
    // An account with no credit left (OpenAI's "insufficient_quota") is set aside like a used-up allowance.
    const daily = res.status === 429 && (isDailyLimit(text, retryAfter) || /insufficient_quota/i.test(text));
    throw new LlmError(`${p.model} returned ${res.status}: ${detail}`, { status: res.status, provider: p.name, model: p.model, retryAfter, daily });
  }
}

const isBusy = (status) => [408, 429, 500, 502, 503, 504, 529].includes(status);

/**
 * Sends one request. Respects the per-minute gap and the daily cap. Works down the list of
 * models until one answers; if all are busy it waits briefly and goes round once more.
 * With `marketplace`, only the models Marketplace chats may use are asked.
 */
export async function complete(system, user, { marketplace = false } = {}) {
  const list = providers({ marketplace });
  if (!list.length) throw new LlmError('No AI key is filled in. Choose the AI on the page (the cog at the top right) and paste a key there, or add GEMINI_API_KEY, OPENAI_API_KEY or OPENROUTER_API_KEY to the .env file.');
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
        addUsage(sydneyDay(), p.name, p.model, out.usage);
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
    throw new LlmError(`The AI service rejected the key in the .env file (${[...badKey].map(providerLabel).join(' and ')}). ${detail}`, { status: 401, detail });
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
