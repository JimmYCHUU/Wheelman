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

// ---- the choice: which model does which job -------------------------------------------------

/**
 * The jobs a model can be given. write: the suggestions for dashboard customers, import emails and
 * auction orders, on the best model. The other three need no better model: the customer read, the
 * Marketplace chats and the lessons taken from the owner's notes keep to the small model and the
 * free ones after it unless the page chose one for the job.
 */
export const ROLES = ['write', 'read', 'marketplace', 'lessons'];
export const ROLE_LABELS = { write: 'Dashboard, import and auction replies', read: 'The customer read', marketplace: 'Marketplace chats', lessons: 'Lessons from your notes' };

// A model's name as the providers write them: gemini-3.8-flash, gpt-5.6, google/gemma-4-31b-it:free.
const MODEL_NAME = /^[\w.:/-]{1,120}$/;
let cached; // the choices by job, read from the database once; undefined until then

const valid = (c) => (c && PROVIDERS[c.provider] && MODEL_NAME.test(String(c.model || '')) ? { provider: c.provider, model: String(c.model), at: Number(c.at) || 0 } : null);

function roles() {
  if (cached === undefined) {
    let r = getMeta('ai_roles', null);
    if (!r || typeof r !== 'object') {
      // Before the jobs there was one choice, for the dashboard, with a tick for Marketplace too.
      const old = getMeta('ai_choice', null);
      const w = valid(old);
      r = w ? { write: w, ...(old.marketplace ? { marketplace: w } : {}) } : {};
      if (w) setMeta('ai_roles', r);
    }
    cached = Object.fromEntries(ROLES.map((role) => [role, valid(r[role])]).filter(([, v]) => v));
  }
  return cached;
}

/** The provider and model chosen on the page for a job, or null when none was. */
export function roleChoice(role) { return roles()[role] || null; }

/** Every job's choice, by job. */
export function allRoleChoices() { return { ...roles() }; }

/** Keeps the page's choice for a job. Refuses, in plain words, a job or provider Wheelman does not know, a provider without a key, or no model. */
export function setRoleChoice(role, { provider, model } = {}) {
  if (!ROLES.includes(role)) throw plain('That is not a job Wheelman gives a model.');
  if (!PROVIDERS[provider]) throw plain('That AI provider is not one Wheelman knows.');
  if (!config.llm[provider].apiKey) throw plain(`No ${providerLabel(provider)} key is filled in yet. Paste one first.`);
  const name = String(model || '').trim();
  if (!MODEL_NAME.test(name)) throw plain('Pick a model, or type its name as the provider writes it.');
  const next = { ...roles(), [role]: { provider, model: name, at: Date.now() } };
  cached = next;
  setMeta('ai_roles', next);
  return next[role];
}

/** The dashboard's choice as the page first offered it: the write job, with whether Marketplace was given the same model. Null when nothing has been chosen. */
export function aiChoice() {
  const w = roleChoice('write');
  if (!w) return null;
  const m = roleChoice('marketplace');
  return { ...w, marketplace: !!m && m.provider === w.provider && m.model === w.model };
}

/** The dashboard's choice, with Marketplace given the same model when ticked and left to the small ones when not. */
export function setAiChoice({ provider, model, marketplace = false } = {}) {
  const w = setRoleChoice('write', { provider, model });
  if (marketplace) setRoleChoice('marketplace', { provider, model });
  else if (roleChoice('marketplace')) { const next = { ...roles() }; delete next.marketplace; cached = next; setMeta('ai_roles', next); }
  return { ...w, marketplace: !!marketplace };
}

/** Forgets what was read from the database, so the next look reads it again. For tests. */
export function forgetAiChoice() { cached = undefined; }
/** Takes every choice away, in the database too. For tests. */
export function clearAiChoice() { setMeta('ai_choice', null); setMeta('ai_roles', null); cached = undefined; }

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
