// The one search box's state: what was typed, whether the answer is on its way, and the answer. No
// DOM. The server and the timers are passed in, so the tests run it with fakes. A request goes out
// 200 ms after typing stops, only for 2 or more characters, and only the newest one's answer is kept.
export const MIN_CHARS = 2;
export const WAIT_MS = 200;

/** Which result Enter opens: the highlighted one, else the first once the newest answer is in; -1 for none (a stale list is never opened by Enter). */
export function enterPick(s, at, count) {
  if (count === 0) return -1;
  if (at >= 0) return at;
  return s.state === 'ready' ? 0 : -1;
}

const none = () => ({ customers: [], cars: [], messages: [] });

export function createSearchStore({ api, timers }) {
  let state = { q: '', state: 'idle', results: none() };
  const listeners = new Set();
  const set = (patch) => {
    state = { ...state, ...patch };
    for (const fn of [...listeners]) fn();
  };
  let seq = 0;
  let timer = null;
  const stop = () => { if (timer !== null) { timers.clear(timer); timer = null; } };

  async function ask(q) {
    const mine = ++seq;
    try {
      const out = await api('/api/search?q=' + encodeURIComponent(q));
      if (mine !== seq) return; // a newer search has gone out: this answer is old
      set({ state: 'ready', results: { customers: out.customers || [], cars: out.cars || [], messages: out.messages || [] } });
    } catch {
      if (mine === seq) set({ state: 'error', results: none() });
    }
  }

  function type(q) {
    stop();
    const typed = String(q || '').trim();
    if (typed.length < MIN_CHARS) {
      seq++; // whatever is on its way is no longer wanted
      set({ q: String(q || ''), state: 'idle', results: none() });
      return;
    }
    set({ q: String(q), state: 'loading' });
    timer = timers.set(() => { timer = null; ask(typed); }, WAIT_MS);
  }

  function clear() {
    stop();
    seq++;
    set({ q: '', state: 'idle', results: none() });
  }

  return {
    get: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    actions: { type, clear },
  };
}
