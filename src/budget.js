// What the AI has cost this month, and the monthly budget. Wheelman counts every request and its
// tokens (src/db.js llm_usage_models); the prices are the owner's to fill in, in data/ai-prices.json,
// because the providers change them and Wheelman must not guess. From the two comes an estimate in
// Australian dollars, shown in the Used so far panel, with a warning at 80% of the budget and, at
// 100%, the small roles (the customer read, Marketplace chats, lessons) kept to free models while
// the dashboard suggestions continue.

import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { usageByModel } from './db.js';
import { sydneyDay } from './time.js';
import { PROVIDER_ORDER } from './aimodels.js';

const NOTE = 'Prices in US dollars per million tokens, as the providers publish them. Gemini: https://ai.google.dev/pricing   ChatGPT: https://openai.com/api/pricing   OpenRouter: the model\'s own page under https://openrouter.ai/models. A blank (null) means Wheelman does not know the price: those requests are counted but cannot be costed, and the panel says so. 0 means free. audPerUsd is the exchange rate used for the Australian-dollar estimate.';

const key = (provider, model) => `${provider}/${model}`;

/** The file as first written: every configured model, with no price filled in. Free OpenRouter models are 0. */
export function defaultPrices() {
  const models = {};
  for (const name of PROVIDER_ORDER) {
    for (const model of config.llm[name]?.models || []) models[key(name, model)] = /:free$/.test(model) ? { in: 0, out: 0 } : { in: null, out: null };
  }
  return { _note: NOTE, audPerUsd: 1.55, models };
}

let cache = { mtime: -1, prices: null };

/** The price table, read again whenever the file changes; written with the defaults when there is none. */
export function loadPrices() {
  const file = config.aiPricesPath;
  let stat;
  try { stat = fs.statSync(file); } catch { stat = null; }
  if (!stat) {
    const p = defaultPrices();
    try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(p, null, 2) + '\n'); } catch { /* read-only folder: the defaults still apply */ }
    cache = { mtime: 0, prices: p };
    return p;
  }
  if (stat.mtimeMs !== cache.mtime || !cache.prices) {
    let p;
    try { p = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { p = null; }
    const fine = p && typeof p === 'object' && p.models && typeof p.models === 'object';
    cache = { mtime: stat.mtimeMs, prices: fine ? { ...defaultPrices(), ...p, models: { ...p.models } } : { ...defaultPrices(), broken: true } };
  }
  return cache.prices;
}

/** Adds to the file any model that has been asked but has no row yet, so the owner sees what to fill in. */
export function noteModels(rows) {
  const p = loadPrices();
  if (p.broken) return;
  let added = false;
  for (const r of rows) {
    const k = key(r.provider, r.model);
    if (!(k in p.models)) { p.models[k] = /:free$/.test(r.model) ? { in: 0, out: 0 } : { in: null, out: null }; added = true; }
  }
  if (!added) return;
  try {
    fs.writeFileSync(config.aiPricesPath, JSON.stringify({ _note: p._note, audPerUsd: p.audPerUsd, models: p.models }, null, 2) + '\n');
    cache.mtime = fs.statSync(config.aiPricesPath).mtimeMs;
  } catch { /* leave it */ }
}

const price = (v) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/** The price row for a model: { in, out } in US dollars per million tokens, each null when unknown. */
export function priceFor(provider, model) {
  const row = loadPrices().models[key(provider, model)];
  if (!row) return /:free$/.test(String(model)) ? { in: 0, out: 0 } : { in: null, out: null };
  return { in: price(row.in), out: price(row.out) };
}

/** True when the model is known to cost nothing: a 0/0 row, or an OpenRouter model named ":free". */
export function isFree(provider, model) {
  const p = priceFor(provider, model);
  return p.in === 0 && p.out === 0;
}

/** Whether a model's price is known, so its requests can be costed. */
export const isPriced = (provider, model) => { const p = priceFor(provider, model); return p.in !== null && p.out !== null; };

/** What one usage row cost, in Australian dollars, or null when the price is not known. */
export function costAud(row, audPerUsd = loadPrices().audPerUsd) {
  const p = priceFor(row.provider, row.model);
  if (p.in === null || p.out === null) return null;
  const usd = (Number(row.tokensIn || 0) / 1e6) * p.in + (Number(row.tokensOut || 0) / 1e6) * p.out;
  return Math.round(usd * (Number(audPerUsd) || 1.55) * 100) / 100;
}

/** The first day of the month after the given Sydney day, as YYYY-MM-DD. */
export function nextMonthStart(day) {
  const [y, m] = String(day).split('-').map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

/**
 * This month's spend against the budget. level: 'ok' below 80%, 'warn' from 80%, 'over' from 100%.
 * byModel carries each model's requests, tokens and estimated cost (null when unpriced).
 * priced: false when no request this month could be costed, so there is nothing to show.
 */
export function budgetStatus(now = Date.now()) {
  const day = sydneyDay(now);
  const month = day.slice(0, 7);
  const rows = usageByModel({ prefix: month });
  noteModels(rows);
  const prices = loadPrices();
  const byModel = rows.map((r) => ({ ...r, aud: costAud(r, prices.audPerUsd) }));
  const spentAud = Math.round(byModel.reduce((s, r) => s + (r.aud || 0), 0) * 100) / 100;
  const unpriced = byModel.filter((r) => r.aud === null && !isFree(r.provider, r.model)).map((r) => key(r.provider, r.model));
  const budgetAud = Number(config.llm.monthlyBudgetAud) || 0;
  const fraction = budgetAud > 0 ? spentAud / budgetAud : 0;
  const level = budgetAud > 0 && fraction >= 1 ? 'over' : budgetAud > 0 && fraction >= 0.8 ? 'warn' : 'ok';
  return {
    month, budgetAud, spentAud, fraction, level, byModel, unpriced,
    priced: byModel.some((r) => r.aud !== null && r.aud > 0) || unpriced.length === 0 && byModel.length > 0,
    audPerUsd: prices.audPerUsd, pricesPath: config.aiPricesPath, pricesBroken: !!prices.broken,
    resetsOn: nextMonthStart(day),
  };
}

/** Forgets the file read so far. For tests. */
export function forgetPrices() { cache = { mtime: -1, prices: null }; }
