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
  // seq moves on whenever the words change, so an answer for other words (on its way, or still
  // waiting its 200 ms) is dropped and never reads ready under what the box says now.
  let seq = 0;
  let words = ''; // the trimmed words of the newest search: waiting, on its way or answered
  let timer = null;
  const stop = () => { if (timer !== null) { timers.clear(timer); timer = null; } };

  async function ask(q, mine) {
    try {
      const out = await api('/api/search?q=' + encodeURIComponent(q));
      if (mine !== seq) return; // the words have changed since: this answer is old
      set({ state: 'ready', results: { customers: out.customers || [], cars: out.cars || [], messages: out.messages || [] } });
    } catch {
      if (mine === seq) set({ state: 'error', results: none() });
    }
  }

  function type(q) {
    const raw = String(q || '');
    const typed = raw.trim();
    // A space more is the same search: what is waiting or on its way stays. A failed one is asked again.
    if (typed === words && typed.length >= MIN_CHARS && state.state !== 'error') { set({ q: raw }); return; }
    stop();
    const mine = ++seq; // whatever is on its way is for other words
    words = typed;
    if (typed.length < MIN_CHARS) {
      set({ q: raw, state: 'idle', results: none() });
      return;
    }
    set({ q: raw, state: 'loading' });
    timer = timers.set(() => { timer = null; ask(typed, mine); }, WAIT_MS);
  }

  function clear() {
    stop();
    seq++;
    words = '';
    set({ q: '', state: 'idle', results: none() });
  }

  return {
    get: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    actions: { type, clear },
  };
}
