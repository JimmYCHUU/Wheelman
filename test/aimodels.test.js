// Which AI writes. The provider and model chosen on the page come first and the others follow;
// ChatGPT is asked in its own request shape; each provider's list of models is read into the ones
// that can write a reply; and a key pasted on the page is tried, then kept in a scratch .env file.
// A stand-in on this computer plays the three providers. Every name, key and model is invented.
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyTestEnv } from './support/env.js';

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'wheelman-ai-test-'));
const envFile = path.join(scratch, '.env');
const OPENAI_KEY = 'invented-openai-key-0000-aaaa';
applyTestEnv({ GEMINI_FALLBACK_MODELS: 'model-b', MARKETPLACE_MODEL: 'model-b', OPENAI_API_KEY: OPENAI_KEY, OPENAI_MODEL: 'gpt-test', ENV_PATH: envFile });

// What the providers answer when asked for their models, shaped like the real answers.
const GEMINI_LIST = { models: [
  { name: 'models/gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', supportedGenerationMethods: ['generateContent', 'countTokens'] },
  { name: 'models/gemini-3.8-flash-001', displayName: 'Gemini 3.8 Flash 001', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/gemini-3.8-pro', displayName: 'Gemini 3.8 Pro', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/gemini-3.5-flash-lite', displayName: 'Gemini 3.5 Flash-Lite', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/gemini-3.5-flash-tts', displayName: 'Gemini 3.5 Flash TTS', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/gemini-embedding-2', displayName: 'Gemini Embedding 2', supportedGenerationMethods: ['embedContent'] },
  { name: 'models/gemini-3.8-flash-image', displayName: 'Gemini 3.8 Flash Image', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/imagen-5', displayName: 'Imagen 5', supportedGenerationMethods: ['predict'] },
] };
const OPENAI_LIST = { data: [
  { id: 'gpt-5.6-luna', created: 1783000000 }, { id: 'gpt-5.6', created: 1783000000 }, { id: 'gpt-5.5', created: 1780000000 },
  { id: 'gpt-5.5-2026-06-01', created: 1780000000 }, { id: 'gpt-5-pro', created: 1760000000 }, { id: 'gpt-audio', created: 1770000000 },
  { id: 'gpt-realtime', created: 1770000000 }, { id: 'gpt-5.5-codex', created: 1780000000 }, { id: 'o4-mini', created: 1745000000 },
  { id: 'text-embedding-3-large', created: 1700000000 }, { id: 'whisper-1', created: 1680000000 }, { id: 'chatgpt-4o-latest', created: 1720000000 },
  { id: 'gpt-4.1', created: 1744000000 }, { id: 'gpt-4-0613', created: 1686000000 }, { id: 'gpt-image-1', created: 1745000000 },
] };
const OPENROUTER_LIST = { data: [
  { id: 'google/gemma-4-31b-it:free', name: 'Google: Gemma 4 31B (free)', pricing: { prompt: '0', completion: '0' } },
  { id: 'openai/gpt-5.6', name: 'OpenAI: GPT-5.6', pricing: { prompt: '0.00000125', completion: '0.00001' } },
  { id: 'meta-llama/llama-5-70b-instruct:free', name: 'Meta: Llama 5 70B Instruct', pricing: { prompt: '0', completion: '0' } },
  { id: 'anthropic/claude-sonnet-5.5', name: 'Anthropic: Claude Sonnet 5.5', pricing: { prompt: '0.000003', completion: '0.000015' } },
] };

const GOOD_KEYS = new Set([OPENAI_KEY, 'test-key', 'invented-openai-key-pasted-1111', 'invented-openrouter-key-2222-bbbb']);
const OK_REPLY = { choices: [{ message: { content: JSON.stringify({ reply: 'Hi {{NAME}},\nNo worries.', needs_human: [], facts_used: [], hold: false }) }, finish_reason: 'stop' }] };

let server, base, app, appBase, config, llm, ai, db;
const seen = [];        // every request the stand-in saw: { path, key, body }
let chatAnswer = null;  // (body, path) => { status, json } to script what a model answers; null answers well
let listsDown = false;  // when true, every models address answers 503

before(async () => {
  server = http.createServer((req, res) => {
    let text = '';
    req.on('data', (c) => { text += c; });
    req.on('end', () => {
      const url = new URL(req.url, 'http://x');
      let body = null;
      try { body = JSON.parse(text); } catch { /* no body */ }
      const bearer = String(req.headers.authorization || '').replace(/^Bearer /, '');
      const key = bearer || String(req.headers['x-goog-api-key'] || '');
      seen.push({ method: req.method, path: url.pathname, key, body });
      const json = (status, data) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); };
      if (listsDown && /models$/.test(url.pathname)) return json(503, { error: { message: 'down for a moment' } });
      if (url.pathname === '/openai/chat/completions' || url.pathname === '/gemini/chat') {
        const out = chatAnswer ? chatAnswer(body, url.pathname) : null;
        return out ? json(out.status, out.json) : json(200, OK_REPLY);
      }
      if (url.pathname === '/openai/models') return GOOD_KEYS.has(key) ? json(200, OPENAI_LIST) : json(401, { error: { message: 'Incorrect API key provided.', type: 'invalid_request_error', code: 'invalid_api_key' } });
      if (url.pathname === '/gemini/models') return GOOD_KEYS.has(key) ? json(200, GEMINI_LIST) : json(400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } });
      if (url.pathname === '/or/auth/key') return GOOD_KEYS.has(key) ? json(200, { data: { label: 'invented', usage: 0 } }) : json(401, { error: { message: 'No auth credentials found', code: 401 } });
      if (url.pathname === '/or/models') return json(200, OPENROUTER_LIST);
      return json(404, { error: 'no' });
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;

  ({ config } = await import('../src/config.js'));
  config.port = 0;
  config.llm.gemini.url = `${base}/gemini/chat`;
  config.llm.gemini.modelsUrl = `${base}/gemini/models`;
  config.llm.openai.url = `${base}/openai/chat/completions`;
  config.llm.openai.modelsUrl = `${base}/openai/models`;
  config.llm.openrouter.url = `${base}/or/chat`;
  config.llm.openrouter.modelsUrl = `${base}/or/models`;
  config.llm.openrouter.keyCheckUrl = `${base}/or/auth/key`;
  db = await import('../src/db.js');
  db.openDb();
  llm = await import('../src/llm.js');
  ai = await import('../src/aimodels.js');
  app = await (await import('../src/server.js')).startServer();
  appBase = `http://127.0.0.1:${app.address().port}`;
});

after(async () => {
  for (const s of [server, app]) await new Promise((r) => { s.close(r); s.closeAllConnections?.(); });
  fs.rmSync(scratch, { recursive: true, force: true });
});

beforeEach(() => { ai.clearAiChoice(); ai.forgetModelLists(); llm.resetModelState(); seen.length = 0; chatAnswer = null; listsDown = false; });

const models = (list) => list.map((p) => p.model);
const chats = () => seen.filter((r) => /chat/.test(r.path));

/** A request to the page's own server, as its page makes it. */
function call(method, p, body = null) {
  return new Promise((resolve, reject) => {
    const data = body === null ? '' : JSON.stringify(body);
    const headers = data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {};
    const req = http.request(`${appBase}${p}`, { method, headers }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(text); } catch { /* nothing */ } resolve({ status: res.statusCode, json }); });
    });
    req.on('error', reject);
    req.end(data);
  });
}

test('with nothing chosen, ChatGPT comes first when it has a key and Gemini follows; Marketplace keeps to the small free model', () => {
  assert.deepEqual(models(llm.providers()), ['gpt-test', 'model-a', 'model-b']);
  assert.deepEqual(models(llm.providers({ marketplace: true })), ['model-b'], 'nothing paid on Marketplace unasked');
  assert.equal(ai.aiChoice(), null);
  const kept = config.llm.openai.apiKey;
  config.llm.openai.apiKey = '';
  try { assert.deepEqual(models(llm.providers()), ['model-a', 'model-b'], 'without a ChatGPT key, Gemini writes'); } finally { config.llm.openai.apiKey = kept; }
});

test('the model chosen on the page is asked first and the others follow; Marketplace keeps its small model unless told otherwise', () => {
  const choice = ai.setAiChoice({ provider: 'openai', model: 'gpt-test' });
  assert.equal(choice.marketplace, false);
  assert.deepEqual(models(llm.providers()), ['gpt-test', 'model-a', 'model-b']);
  assert.deepEqual(models(llm.providers({ marketplace: true })), ['model-b'], 'Marketplace is not moved to the paid model unasked');
  assert.deepEqual(llm.modelStatus().map((m) => [m.model, m.marketplace]), [['gpt-test', false], ['model-a', false], ['model-b', true]]);

  ai.setAiChoice({ provider: 'openai', model: 'gpt-test', marketplace: true });
  assert.deepEqual(models(llm.providers({ marketplace: true })), ['gpt-test', 'model-b']);

  // A model typed by name, one the .env file does not list, still goes first.
  ai.setAiChoice({ provider: 'gemini', model: 'gemini-typed' });
  assert.deepEqual(models(llm.providers()), ['gemini-typed', 'gpt-test', 'model-a', 'model-b']);
  assert.equal(llm.providers()[0].url, config.llm.gemini.url);

  // Choosing one of the small models makes it Marketplace's too, since it already is.
  ai.setAiChoice({ provider: 'gemini', model: 'model-b' });
  assert.deepEqual(models(llm.providers()), ['model-b', 'gpt-test', 'model-a']);
  assert.deepEqual(models(llm.providers({ marketplace: true })), ['model-b']);

  // The choice is kept in the database and read back after a restart.
  ai.forgetAiChoice();
  assert.equal(ai.aiChoice().model, 'model-b');
  // Something unreadable left in the database is ignored, not trusted.
  db.setMeta('ai_choice', { provider: 'nobody', model: 'x' });
  ai.forgetAiChoice();
  assert.equal(ai.aiChoice(), null);
  db.setMeta('ai_choice', { provider: 'gemini', model: 'bad name with spaces' });
  ai.forgetAiChoice();
  assert.equal(ai.aiChoice(), null);

  assert.throws(() => ai.setAiChoice({ provider: 'openrouter', model: 'anything' }), /No OpenRouter key is filled in yet/);
  assert.throws(() => ai.setAiChoice({ provider: 'gemini', model: '' }), /Pick a model/);
  assert.throws(() => ai.setAiChoice({ provider: 'someone', model: 'x' }), /not one Wheelman knows/);
});

test('ChatGPT is asked in its own shape, and a field a model refuses is dropped and the request sent again', async () => {
  const reasoning = llm.requestBody({ name: 'openai', model: 'gpt-5.6' }, 's', 'u');
  assert.equal(reasoning.max_tokens, undefined);
  assert.equal(reasoning.max_completion_tokens, config.llm.maxOutputTokens + 4000, 'room to think, then answer');
  assert.equal(reasoning.temperature, undefined);
  assert.equal(reasoning.reasoning_effort, 'low');
  assert.deepEqual(reasoning.response_format, { type: 'json_object' });
  const plain = llm.requestBody({ name: 'openai', model: 'gpt-4.1' }, 's', 'u');
  assert.equal(plain.max_completion_tokens, config.llm.maxOutputTokens);
  assert.equal(plain.temperature, config.llm.temperature);
  assert.equal(plain.reasoning_effort, undefined);
  const gemini = llm.requestBody({ name: 'gemini', model: 'model-a' }, 's', 'u');
  assert.equal(gemini.max_tokens, config.llm.maxOutputTokens);
  assert.equal(gemini.reasoning_effort, 'low');
  assert.equal(llm.requestBody({ name: 'openrouter', model: 'x' }, 's', 'u').reasoning_effort, undefined);

  // The field is read from OpenAI's "param", or found in another service's wording.
  const body = { model: 'm', messages: [], temperature: 0.4, max_tokens: 10 };
  assert.equal(llm.unsupportedField(JSON.stringify({ error: { message: "Unsupported value: 'temperature' does not support 0.4 with this model.", param: 'temperature' } }), body), 'temperature');
  assert.equal(llm.unsupportedField(JSON.stringify({ error: { message: 'max_tokens is not supported with this model.' } }), body), 'max_tokens');
  assert.equal(llm.unsupportedField(JSON.stringify({ error: { message: 'Unsupported parameter: messages', param: 'messages' } }), body), '', 'never the message itself');
  assert.equal(llm.unsupportedField('bad request', body), '');

  // The model refuses the temperature once; the next request leaves it out and is answered.
  ai.setAiChoice({ provider: 'openai', model: 'gpt-test' });
  chatAnswer = (b) => (b.temperature !== undefined ? { status: 400, json: { error: { message: "Unsupported value: 'temperature' does not support 0.4 with this model. Only the default (1) value is supported.", type: 'invalid_request_error', param: 'temperature', code: 'unsupported_value' } } } : null);
  const out = await llm.complete('system words', 'user words');
  assert.equal(out.provider, 'openai');
  assert.equal(out.model, 'gpt-test');
  assert.equal(chats().length, 2);
  assert.ok('temperature' in chats()[0].body && !('temperature' in chats()[1].body));
  assert.equal(chats()[0].key, OPENAI_KEY, 'the key from .env, as a bearer token');
  assert.equal(chats()[1].body.max_completion_tokens, config.llm.maxOutputTokens);
});

test('a ChatGPT account with no credit left is set aside like a used-up allowance, and the next model writes', async () => {
  ai.setAiChoice({ provider: 'openai', model: 'gpt-test' });
  chatAnswer = (b, p) => (p.startsWith('/openai') ? { status: 429, json: { error: { message: 'You exceeded your current quota, please check your plan and billing details.', type: 'insufficient_quota', code: 'insufficient_quota' } } } : null);
  const out = await llm.complete('s', 'u');
  assert.equal(out.model, 'model-a');
  assert.deepEqual(chats().map((c) => c.body.model), ['gpt-test', 'model-a']);
  const status = llm.modelStatus().find((m) => m.model === 'gpt-test');
  assert.ok(status.usedUpUntil > Date.now(), 'not asked again for a while');
});

test("each provider's list is read into the models that can write a reply, newest first", () => {
  const gemini = ai.parseModelList('gemini', GEMINI_LIST);
  assert.deepEqual(gemini.map((m) => m.id), ['gemini-3.8-flash', 'gemini-3.8-pro', 'gemini-3.5-flash-lite'], 'no speech, picture or embedding models, and no dated copy of a listed model');
  assert.equal(gemini[0].label, 'Gemini 3.8 Flash');
  assert.ok(gemini.every((m) => m.free));

  const openai = ai.parseModelList('openai', OPENAI_LIST);
  assert.deepEqual(openai.map((m) => m.id), ['gpt-5.6', 'gpt-5.6-luna', 'gpt-5.5', 'o4-mini', 'gpt-4.1', 'chatgpt-4o-latest']);
  assert.ok(openai.every((m) => !m.free));

  const openrouter = ai.parseModelList('openrouter', OPENROUTER_LIST);
  assert.deepEqual(openrouter.map((m) => m.label), ['Google: Gemma 4 31B (free)', 'Meta: Llama 5 70B Instruct (free)', 'Anthropic: Claude Sonnet 5.5', 'OpenAI: GPT-5.6'], 'free ones first, each said once');
  assert.deepEqual(openrouter.map((m) => m.free), [true, true, false, false]);

  assert.deepEqual(ai.parseModelList('gemini', {}), []);
  assert.deepEqual(ai.parseModelList('nobody', OPENAI_LIST), []);
});

test('the list is read from the provider and kept for an hour; without a key or a provider, the .env models stand in', async () => {
  const first = await ai.listModels('openai');
  assert.equal(first.live, true);
  assert.deepEqual(first.models.map((m) => m.id).slice(0, 2), ['gpt-5.6', 'gpt-5.6-luna']);
  assert.equal(seen.filter((r) => r.path === '/openai/models').length, 1);
  assert.equal(seen[0].key, OPENAI_KEY);
  await ai.listModels('openai');
  assert.equal(seen.filter((r) => r.path === '/openai/models').length, 1, 'kept, not asked again');
  await ai.listModels('openai', { fresh: true });
  assert.equal(seen.filter((r) => r.path === '/openai/models').length, 2, 'asked again when told to');

  const noKey = await ai.listModels('openrouter');
  assert.equal(noKey.needsKey, true);
  assert.equal(noKey.live, false);
  assert.deepEqual(noKey.models.map((m) => m.id), config.llm.openrouter.models);
  assert.match(noKey.error, /No OpenRouter key is filled in yet/);

  listsDown = true;
  const down = await ai.listModels('gemini');
  assert.equal(down.live, false);
  assert.deepEqual(down.models.map((m) => m.id), ['model-a', 'model-b'], 'the models the .env file names');
  assert.match(down.error, /Gemini \(Google\) could not be read: down for a moment/);
  listsDown = false;

  // A key the provider rejects is said so, and the .env models stand in.
  const kept = config.llm.gemini.apiKey;
  config.llm.gemini.apiKey = 'invented-wrong-gemini-key-9999';
  try {
    const bad = await ai.listModels('gemini', { fresh: true });
    assert.equal(bad.rejected, true);
    assert.match(bad.error, /rejected the key in the \.env file/);
  } finally { config.llm.gemini.apiKey = kept; }
  await assert.rejects(() => ai.listModels('nobody'), /not one Wheelman knows/);
});

test('a key pasted on the page is tried first, then kept in the .env file; a rejected one is not', async () => {
  // Writing a value into the file: the line is replaced or added, and nothing else moves.
  const f = path.join(scratch, 'sample.env');
  ai.setEnvValue(f, 'OPENAI_API_KEY', 'first');
  assert.equal(fs.readFileSync(f, 'utf8'), 'OPENAI_API_KEY=first\n', 'the file is made when there is none');
  fs.writeFileSync(f, 'DASHBOARD_USERNAME=tester\r\n# OPENAI_API_KEY=a note, not the setting\r\nOPENAI_API_KEY=\r\nPORT=3210\r\n');
  ai.setEnvValue(f, 'OPENAI_API_KEY', 'second');
  assert.equal(fs.readFileSync(f, 'utf8'), 'DASHBOARD_USERNAME=tester\r\n# OPENAI_API_KEY=a note, not the setting\r\nOPENAI_API_KEY=second\r\nPORT=3210\r\n', 'replaced in place, the comment and the line endings kept');
  ai.setEnvValue(f, 'OPENROUTER_API_KEY', 'third');
  assert.ok(fs.readFileSync(f, 'utf8').endsWith('PORT=3210\r\nOPENROUTER_API_KEY=third\r\n'), 'a setting the file lacks is added at the end');

  fs.writeFileSync(envFile, 'DASHBOARD_USERNAME=tester\nGEMINI_API_KEY=test-key\n');
  await assert.rejects(() => ai.saveKey('openai', 'short'), /does not look like a key/);
  await assert.rejects(() => ai.saveKey('openai', 'invented key with spaces in it 1234'), /does not look like a key/);
  await assert.rejects(() => ai.saveKey('openai', 'invented-wrong-openai-key-7777-zzzz'), /ChatGPT \(OpenAI\) did not accept that key/);
  assert.ok(!fs.readFileSync(envFile, 'utf8').includes('OPENAI_API_KEY'), 'a rejected key is not written');
  assert.equal(config.llm.openai.apiKey, OPENAI_KEY, 'and not used');

  try {
    const out = await ai.saveKey('openai', ' invented-openai-key-pasted-1111 ');
    assert.equal(out.checked, true);
    assert.equal(out.models[0].id, 'gpt-5.6');
    assert.equal(fs.readFileSync(envFile, 'utf8'), 'DASHBOARD_USERNAME=tester\nGEMINI_API_KEY=test-key\nOPENAI_API_KEY=invented-openai-key-pasted-1111\n');
    assert.equal(config.llm.openai.apiKey, 'invented-openai-key-pasted-1111', 'used from now on, with no restart');
    assert.equal(llm.providers().find((p) => p.name === 'openai').apiKey, 'invented-openai-key-pasted-1111');
    assert.equal((await ai.listModels('openai')).live, true);
    assert.equal(seen.filter((r) => r.path === '/openai/models').length, 2, 'the list read while trying the key is kept; it is not read again');

    // OpenRouter's list is public, so its key is tried at its own key address first.
    seen.length = 0;
    await assert.rejects(() => ai.saveKey('openrouter', 'invented-wrong-openrouter-key-5555'), /OpenRouter did not accept that key/);
    assert.deepEqual(seen.map((r) => r.path), ['/or/auth/key']);
    const or = await ai.saveKey('openrouter', 'invented-openrouter-key-2222-bbbb');
    assert.equal(or.checked, true);
    assert.deepEqual(seen.map((r) => r.path), ['/or/auth/key', '/or/auth/key', '/or/models']);
    assert.ok(models(llm.providers()).includes('google/gemma-4-31b-it:free'), 'OpenRouter joins the list at once');
    assert.match(fs.readFileSync(envFile, 'utf8'), /\nOPENROUTER_API_KEY=invented-openrouter-key-2222-bbbb\n$/);

    // When the provider cannot be reached, the key is kept unchecked and the answer says so.
    listsDown = true;
    const unchecked = await ai.saveKey('openai', 'invented-openai-key-unreachable-3333');
    assert.equal(unchecked.checked, false);
    assert.equal(config.llm.openai.apiKey, 'invented-openai-key-unreachable-3333');
  } finally {
    config.llm.openai.apiKey = OPENAI_KEY;
    config.llm.openrouter.apiKey = '';
    listsDown = false;
  }
  await assert.rejects(() => ai.saveKey('nobody', 'invented-openai-key-pasted-1111'), /not one Wheelman knows/);
});

test("the page's routes: what is on offer, one provider's list, the choice, and a key", async () => {
  const offer = await call('GET', '/api/ai');
  assert.equal(offer.status, 200);
  assert.deepEqual(offer.json.providers.map((p) => [p.id, p.hasKey]), [['openai', true], ['gemini', true], ['openrouter', false]]);
  assert.equal(offer.json.providers[0].label, 'ChatGPT (OpenAI)');
  assert.equal(offer.json.providers[0].keyUrl, 'https://platform.openai.com/api-keys');
  assert.deepEqual(offer.json.providers[0].known, ['gpt-test']);
  assert.equal(offer.json.choice, null);
  assert.deepEqual(offer.json.writing, { provider: 'openai', model: 'gpt-test' }, 'ChatGPT writes by default once it has a key');
  assert.deepEqual(offer.json.marketplaceWriting, { provider: 'gemini', model: 'model-b' });
  assert.equal(offer.json.marketplaceModel, 'model-b');
  assert.equal(offer.json.canSaveKey, true, 'from this computer');

  const list = await call('GET', '/api/ai/models?provider=openai');
  assert.equal(list.status, 200);
  assert.equal(list.json.live, true);
  assert.equal(list.json.models[0].id, 'gpt-5.6');
  assert.equal((await call('GET', '/api/ai/models?provider=nobody')).status, 400);
  const noKey = await call('GET', '/api/ai/models?provider=openrouter');
  assert.equal(noKey.json.needsKey, true);

  const refused = await call('POST', '/api/ai/choice', { provider: 'openrouter', model: 'anything' });
  assert.equal(refused.status, 400);
  assert.match(refused.json.error, /No OpenRouter key is filled in yet/);
  assert.equal((await call('POST', '/api/ai/choice', { provider: 'openai', model: '' })).status, 400);

  const chosen = await call('POST', '/api/ai/choice', { provider: 'openai', model: 'gpt-5.6', marketplace: true });
  assert.equal(chosen.status, 200);
  assert.equal(chosen.json.choice.model, 'gpt-5.6');
  assert.equal(chosen.json.choice.marketplace, true);
  assert.equal(chosen.json.status.ai.providers[0].model, 'gpt-5.6', 'the status the page shows has the new order at once');
  assert.deepEqual((await call('GET', '/api/ai')).json.writing, { provider: 'openai', model: 'gpt-5.6' });
  assert.deepEqual((await call('GET', '/api/ai')).json.marketplaceWriting, { provider: 'openai', model: 'gpt-5.6' });

  const badKey = await call('POST', '/api/ai/key', { provider: 'openai', key: 'invented-wrong-openai-key-7777-zzzz' });
  assert.equal(badKey.status, 400);
  assert.match(badKey.json.error, /did not accept that key/);
  assert.equal(config.llm.openai.apiKey, OPENAI_KEY);
});

test('every answer is counted by model with the tokens it used, and the panel reads the usage today and this month', async () => {
  const count = (list, model) => list.find((r) => r.model === model) || { requests: 0, tokensIn: 0, tokensOut: 0 };
  const before = llm.usageDetail();
  // Gemini's count folds the thinking into the total only. It is charged as output, so it counts as tokens out.
  chatAnswer = () => ({ status: 200, json: { ...OK_REPLY, usage: { prompt_tokens: 27, completion_tokens: 13, total_tokens: 544 } } });
  ai.setAiChoice({ provider: 'gemini', model: 'model-a' });
  await llm.complete('sys', 'user');
  await llm.complete('sys', 'user');
  // An answer with no count still counts as a request.
  chatAnswer = () => ({ status: 200, json: OK_REPLY });
  await llm.complete('sys', 'user');

  const after = llm.usageDetail();
  assert.match(after.day, /^\d{4}-\d\d-\d\d$/);
  assert.equal(after.month, after.day.slice(0, 7));
  const today = count(after.today, 'model-a'), was = count(before.today, 'model-a');
  assert.equal(today.provider, 'gemini');
  assert.equal(today.requests - was.requests, 3);
  assert.equal(today.tokensIn - was.tokensIn, 54);
  assert.equal(today.tokensOut - was.tokensOut, 1034, 'thinking hidden in the total counts as tokens out');
  assert.equal(count(after.thisMonth, 'model-a').requests - count(before.thisMonth, 'model-a').requests, 3);
  assert.equal(after.usedToday - before.usedToday, 3, "the day's count against the cap moved with them");
  assert.equal(after.limit, 500);

  // OpenAI counts the thinking inside the completion; a provider that gives no count gives nothing to add.
  assert.deepEqual(llm.tokenCounts({ prompt_tokens: 34, completion_tokens: 84, total_tokens: 118, completion_tokens_details: { reasoning_tokens: 60 } }), { in: 34, out: 84 });
  assert.equal(llm.tokenCounts(undefined), null);

  const offer = await call('GET', '/api/ai');
  assert.equal(offer.status, 200);
  assert.equal(count(offer.json.usage.today, 'model-a').tokensOut, today.tokensOut, 'the panel reads the same numbers');
  assert.equal(offer.json.usage.usedToday, after.usedToday);
  assert.equal(offer.json.providers.find((p) => p.id === 'gemini').usageUrl, 'https://aistudio.google.com/usage');
});
