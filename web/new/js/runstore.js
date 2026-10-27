// The reply run: the ten newest customers waiting in Needs reply (the ones written ahead), the
// oldest of them first, one after the other. Copy opens the next customer, Skip moves on without
// marking anything done, End run stops, and the end says in one sentence what was done. No DOM:
// the store hands in its state and its own open.
import { visibleRows, waitingCount } from './listview.js';

/** How many customers a run takes: the ten newest waiting, which are written ahead (R4.6). */
export const RUN_SIZE = 10;
/** After the run opens a customer, a Copy this soon is a second click meant for the one before. */
export const SETTLE_MS = 600;

/** Since when a row has been waiting: the customer's message, else the row's last one. */
const since = (r, now) => r.waitingSince || r.lastAt || now;
/** A row still waiting on us: not answered, by us or anyone else. */
const isWaiting = (r) => !r.answered && (r.state === undefined || r.state === 'awaiting');

/** When the longest-waiting of these rows started waiting, or null for none. */
export function oldestWaiting(rows) {
  const times = rows.filter(isWaiting).map((r) => since(r, 0)).filter(Boolean);
  return times.length ? Math.min(...times) : null;
}

/** A run over the ten newest rows visible in Needs reply, the oldest of them first, frozen from now on. */
export function createRun(rows, now) {
  // The list is newest first: the ten at its top, reversed, so rows with the same time keep the older-listed one first.
  const queue = rows.filter(isWaiting).slice(0, RUN_SIZE).reverse().sort((a, b) => since(a, now) - since(b, now)).map((r) => r.key);
  return { queue, i: 0, copied: 0, skipped: 0, elsewhere: 0, seen: new Set() };
}

/**
 * The next customer of the run, or null at the end; the run moves to it. rowsNow are the rows
 * visible in Needs reply now. One that was answered meanwhile, or has left Needs reply, is passed
 * over and counted as answered elsewhere. A customer is never opened twice in one run, even when
 * they write again.
 */
export function nextKey(run, rowsNow) {
  const now = new Map(rowsNow.map((r) => [r.key, r]));
  for (let j = run.i; j < run.queue.length; j++) {
    const key = run.queue[j];
    if (run.seen.has(key)) continue;
    run.seen.add(key);
    run.i = j;
    const r = now.get(key);
    if (r && isWaiting(r)) return key;
    run.elsewhere++;
  }
  run.i = run.queue.length;
  return null;
}

/**
 * "All answered: 5 copied, 1 answered elsewhere." without the parts that are none; "Run finished:"
 * when someone was skipped; then how many more are waiting, beyond the run, if any.
 */
export function runSummary(run, more = 0) {
  const rest = more > 0 ? ' ' + more + ' more waiting.' : '';
  if (!run || !run.queue.length) return (more > 0 ? rest.trim() : 'Nothing waiting.');
  const parts = [[run.copied, 'copied'], [run.skipped, 'skipped'], [run.elsewhere, 'answered elsewhere']]
    .filter(([n]) => n > 0).map(([n, words]) => n + ' ' + words);
  const head = run.skipped ? 'Run finished' : 'All answered';
  return (parts.length ? head + ': ' + parts.join(', ') + '.' : head + '.') + rest;
}

/**
 * The run as the store drives it. The UI sees state.run ({ at, of, key }: "3 of 7", and the
 * customer it is opening) while it goes on, then state.runSummary (the sentence) and state.runMore
 * (how many more are waiting) once it is over, until the person goes elsewhere. open(key) is the
 * store's own open, which leaves the run on; close() leaves no conversation open.
 *
 * One step at a time: while a copy, a skip or a dismiss is moving the run on, another is not taken,
 * and a Copy just after the next customer opened is taken for a second click on the one before.
 */
export function createRunner({ get, set, now, open, close }) {
  let run = null;        // the run under way, a new one at every start: a step of an ended run does nothing
  let stepping = false;  // a step is under way, from the press until the next customer is on screen
  let shownAt = -Infinity;

  /** The customers waiting beyond the run: all of them, less the run's own still in Needs reply. */
  function more(r) {
    const s = get();
    const still = new Set(visibleRows(s).map((x) => x.key));
    return Math.max(0, waitingCount(s) - r.queue.filter((k) => still.has(k)).length);
  }

  async function advance(r) {
    const key = nextKey(r, visibleRows(get()));
    if (key === null) {
      const left = more(r);
      run = null;
      stepping = false;
      set({ run: null, runSummary: runSummary(r, left), runMore: left });
      close();
      return;
    }
    set({ run: { at: r.i + 1, of: r.queue.length, key } });
    try {
      // The conversation already open (on a phone, the one behind the list) is only shown: what is typed stays.
      if (key !== get().key) await open(key);
    } finally {
      if (run === r) { stepping = false; shownAt = now(); }
    }
  }

  return {
    /** Start replying (or Start again): a second press while a run is under way does nothing. */
    start() {
      if (run || get().chip !== 'waiting') return undefined;
      const r = createRun(visibleRows(get()), now());
      run = r;
      stepping = true;
      set({ runSummary: null, runMore: 0 });
      return advance(r);
    },

    /**
     * Copy, through the run: work() copies and says whether it worked. Not while a step is under
     * way, nor just after the next customer opened. After a copy that worked, the next customer.
     */
    async copy(key, work) {
      const r = run;
      if (r && (stepping || now() - shownAt < SETTLE_MS)) return;
      const mine = !!r && r.queue[r.i] === key;
      if (mine) stepping = true;
      let ok = false;
      try { ok = await work(); } finally { if (mine && run === r && !ok) stepping = false; }
      if (!mine || run !== r || !ok) return; // a copy that failed: the run stays on this customer
      r.copied++;
      await advance(r);
    },

    /** Skip: the next customer, and this one stays in Needs reply. */
    async skip() {
      const r = run;
      if (!r || stepping) return;
      stepping = true;
      r.skipped++;
      await advance(r);
    },

    /** The run's customer was dismissed: the next one, and nothing is counted. */
    async dismissed(key) {
      const r = run;
      if (!r || stepping || r.queue[r.i] !== key) return;
      stepping = true;
      await advance(r);
    },

    /** End run, Back to the list, or the person going elsewhere: no run and no summary. */
    end() {
      if (!run && get().run === null && get().runSummary === null) return;
      run = null;
      stepping = false;
      set({ run: null, runSummary: null, runMore: 0 });
    },
  };
}
