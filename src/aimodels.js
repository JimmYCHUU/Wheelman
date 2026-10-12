// Which AI writes the suggestions. Three providers can be asked: Gemini (Google), ChatGPT (OpenAI)
// and OpenRouter. The .env file holds each one's key. The page chooses the provider and the model
// that write, and the choice is kept in the database so it survives a restart; the other models
// stay behind it and are asked only when it does not answer (see providers() in llm.js).
//
// The page also reads the list of models each provider offers right now, so the choice is made
// from real names, and takes a key pasted on it into the .env file on this computer. A key is
// tried on the provider first; one the provider rejects is not kept. No key is ever logged.

import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { getMeta, setMeta } from './db.js';
import { logLine } from './log.js';

// usageUrl: the provider's own usage page, where what the requests have cost is shown.
export const PROVIDERS = {
  gemini: { label: 'Gemini (Google)', keyName: 'GEMINI_API_KEY', keyUrl: 'https://aistudio.google.com/apikey', usageUrl: 'https://aistudio.google.com/usage', free: true },
  openai: { label: 'ChatGPT (OpenAI)', keyName: 'OPENAI_API_KEY', keyUrl: 'https://platform.openai.com/api-keys', usageUrl: 'https://platform.openai.com/usage', free: false },
  openrouter: { label: 'OpenRouter', keyName: 'OPENROUTER_API_KEY', keyUrl: 'https://openrouter.ai/keys', usageUrl: 'https://openrouter.ai/activity', free: true },
};
/** The order the providers are tried in when nothing is chosen: ChatGPT first when it has a key, then the free ones. */
export const PROVIDER_ORDER = ['openai', 'gemini', 'openrouter'];

export const providerLabel = (id) => PROVIDERS[id]?.label || String(id);

const plain = (message) => Object.assign(new Error(message), { status: 400 });

// ---- the choice ------------------------------------------------------------------------------

// A model's name as the providers write them: gemini-3.8-flash, gpt-5.6, google/gemma-4-31b-it:free.
const MODEL_NAME = /^[\w.:/-]{1,120}$/;
let cached; // the choice, read from the database once; undefined until then

/** The provider and model chosen on the page, with whether Marketplace uses it too. Null when nothing has been chosen. */
export function aiChoice() {
  if (cached === undefined) {
    const c = getMeta('ai_choice', null);
    cached = c && PROVIDERS[c.provider] && MODEL_NAME.test(String(c.model || ''))
      ? { provider: c.provider, model: String(c.model), marketplace: !!c.marketplace, at: Number(c.at) || 0 }
      : null;
  }
  return cached;
}

/** Keeps the page's choice. Refuses, in plain words, a provider Wheelman does not know, one without a key, or no model. */
export function setAiChoice({ provider, model, marketplace = false } = {}) {
  if (!PROVIDERS[provider]) throw plain('That AI provider is not one Wheelman knows.');
  if (!config.llm[provider].apiKey) throw plain(`No ${providerLabel(provider)} key is filled in yet. Paste one first.`);
  const name = String(model || '').trim();
  if (!MODEL_NAME.test(name)) throw plain('Pick a model, or type its name as the provider writes it.');
  cached = { provider, model: name, marketplace: !!marketplace, at: Date.now() };
  setMeta('ai_choice', cached);
  return cached;
}

/** Forgets what was read from the database, so the next look reads it again. For tests. */
export function forgetAiChoice() { cached = undefined; }
/** Takes the choice away, in the database too. For tests. */
export function clearAiChoice() { setMeta('ai_choice', null); cached = undefined; }

// ---- the models each provider offers ---------------------------------------------------------

const lists = new Map(); // provider -> { models, live, error, at }
const LIST_KEEP_MS = 60 * 60 * 1000;
const versionOf = (id) => Number((String(id).match(/(\d+(?:\.\d+)?)/) || [])[1]) || 0;

/**
 * Reads a provider's answer to "which models do you have?" into [{ id, label, free }]: the ones
 * that can write a reply, the newest first. Models for speech, pictures, embeddings and live
 * audio are left out, and so are dated copies of a model that is also listed by its plain name.
 */
export function parseModelList(provider, json) {
  if (provider === 'gemini') {
    const rows = (json?.models || [])
      .filter((m) => /^models\/gemini-/.test(m.name || '') && (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => ({ id: String(m.name).replace(/^models\//, ''), label: m.displayName || String(m.name).replace(/^models\//, ''), free: true }))
      .filter((m) => !/(tts|image|embedding|live|audio|dialog|robotics|computer-use|aqa)/.test(m.id));
    const ids = new Set(rows.map((m) => m.id));
    return rows
      .filter((m) => !(/-(\d{3}|latest)$/.test(m.id) && ids.has(m.id.replace(/-(\d{3}|latest)$/, ''))))
      .sort((a, b) => versionOf(b.id) - versionOf(a.id) || a.id.localeCompare(b.id));
  }
  if (provider === 'openai') {
    return (json?.data || [])
      .filter((m) => /^(gpt-|o\d|chatgpt-)/.test(m.id || ''))
      .filter((m) => !/(audio|realtime|tts|transcribe|whisper|embedding|moderation|image|search|instruct|codex|computer-use|-pro\b|-\d{4}-\d{2}-\d{2}$|-\d{4}$)/.test(m.id))
      .sort((a, b) => (b.created || 0) - (a.created || 0) || a.id.localeCompare(b.id))
      .map((m) => ({ id: m.id, label: m.id, free: false }));
  }
  if (provider === 'openrouter') {
    const isFree = (m) => Number(m.pricing?.prompt) === 0 && Number(m.pricing?.completion) === 0;
    return (json?.data || [])
      .filter((m) => m.id)
      .map((m) => ({ id: m.id, label: `${m.name || m.id}${isFree(m) && !/\(free\)/i.test(m.name || '') ? ' (free)' : ''}`, free: isFree(m) }))
      .sort((a, b) => Number(b.free) - Number(a.free) || a.label.localeCompare(b.label));
  }
  return [];
}

/** What a provider's error answer says, in one line, for a message. */
function errorText(text, status) {
  try {
    const j = JSON.parse(text);
    const e = (Array.isArray(j) ? j[0] : j)?.error;
    const m = (typeof e === 'string' ? e : e?.message) || '';
    if (m) return String(m).replace(/\s+/g, ' ').slice(0, 200);
  } catch { /* not json */ }
  return `answered ${status}`;
}

// Gemini says "API key not valid" with a 400; the others say 401 or 403.
const keyRejected = (status, text) => status === 401 || status === 403 || (status === 400 && /API key not valid|API_KEY_INVALID|invalid api key/i.test(text));

async function ask(url, headers, timeoutMs) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  if (!res.ok) throw Object.assign(new Error(errorText(text, res.status)), { status: res.status, rejected: keyRejected(res.status, text) });
  return text;
}

const headersFor = (provider, key) => (provider === 'gemini' ? { 'x-goog-api-key': key } : { authorization: `Bearer ${key}` });

/** Asks the provider for its models with this key. Throws with `rejected` when the key is the problem. */
async function fetchList(provider, key, timeoutMs = 15000) {
  const p = config.llm[provider];
  // OpenRouter's list is public, so a key is checked at its own key address first.
  if (p.keyCheckUrl) await ask(p.keyCheckUrl, headersFor(provider, key), timeoutMs);
  const url = provider === 'gemini' ? `${p.modelsUrl}?pageSize=200` : p.modelsUrl;
  const text = await ask(url, headersFor(provider, key), timeoutMs);
  let json;
  try { json = JSON.parse(text); } catch { throw new Error('answered with something that is not a list'); }
  return parseModelList(provider, json);
}

/** The models a provider is set up with in the .env file, in the shape of the list. */
const knownModels = (provider) => config.llm[provider].models.map((id) => ({ id, label: id, free: PROVIDERS[provider].free }));

/**
 * The models a provider offers right now, read from the provider and kept for an hour. When the
 * provider cannot be read, or has no key, the models the .env file names, and why.
 * Returns { models, live, error, needsKey, rejected, at }.
 */
export async function listModels(provider, { fresh = false } = {}) {
  if (!PROVIDERS[provider]) throw plain('That AI provider is not one Wheelman knows.');
  const key = config.llm[provider].apiKey;
  if (!key) return { models: knownModels(provider), live: false, error: `No ${providerLabel(provider)} key is filled in yet.`, needsKey: true, at: 0 };
  const hit = lists.get(provider);
  if (!fresh && hit && Date.now() - hit.at < LIST_KEEP_MS) return hit;
  let out;
  try {
    const models = await fetchList(provider, key);
    out = models.length
      ? { models, live: true, error: '', at: Date.now() }
      : { models: knownModels(provider), live: false, error: `${providerLabel(provider)} listed no model that can write a reply.`, at: Date.now() };
  } catch (e) {
    out = {
      models: knownModels(provider), live: false, rejected: !!e.rejected, at: Date.now(),
      error: e.rejected ? `${providerLabel(provider)} rejected the key in the .env file.` : `${providerLabel(provider)} could not be read: ${e.name === 'TimeoutError' ? 'it did not answer in time' : e.message}.`,
    };
  }
  lists.set(provider, out);
  return out;
}

/** Forgets the lists read so far. For tests. */
export function forgetModelLists() { lists.clear(); }

// ---- a key pasted on the page -----------------------------------------------------------------

/**
 * Writes NAME=value into an .env-style file: the line that has NAME is replaced, or one is added
 * at the end. Every other line, and the file's own line endings, stay as they are. The file is
 * made when there is none.
 */
export function setEnvValue(file, name, value) {
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch { /* no file yet */ }
  const eol = /\r\n/.test(text) ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  const i = lines.findIndex((l) => l.trimStart().startsWith(`${name}=`));
  if (i >= 0) lines[i] = `${name}=${value}`;
  else lines.push(`${name}=${value}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, lines.join(eol) + eol);
  fs.renameSync(tmp, file);
}

// A key is one run of printable characters; the providers' are 39 to about 170 long.
const KEY_SHAPE = /^[\x21-\x7e]{20,400}$/;

/**
 * Takes a key pasted on the page: tries it on the provider, and when it is accepted writes it
 * into the .env file and starts using it at once. A key the provider rejects is not kept. When
 * the provider cannot be reached the key is kept unchecked, and `checked` says so.
 * Returns { checked, models }.
 */
export async function saveKey(provider, key) {
  if (!PROVIDERS[provider]) throw plain('That AI provider is not one Wheelman knows.');
  const value = String(key || '').trim();
  if (!KEY_SHAPE.test(value)) throw plain('That does not look like a key. Paste the whole key, with nothing else.');
  let models = [];
  let checked = true;
  try { models = await fetchList(provider, value); } catch (e) {
    if (e.rejected) throw plain(`${providerLabel(provider)} did not accept that key. Check it and paste it again.`);
    checked = false;
  }
  setEnvValue(config.envPath, PROVIDERS[provider].keyName, value);
  config.llm[provider].apiKey = value;
  if (models.length) lists.set(provider, { models, live: true, error: '', at: Date.now() });
  else lists.delete(provider);
  logLine('ai', `A ${providerLabel(provider)} key was saved to the .env file from the page${checked ? '' : ' (the provider could not be reached to check it)'}`);
  return { checked, models };
}
