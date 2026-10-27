// The reply run: everyone waiting in Needs reply, oldest first, one after the other. Copy opens the
// next customer, Skip moves on without marking anything done, End run stops, and the end says in
// one sentence what was done. No DOM: the store hands in its state and its own open.
import { visibleRows } from './listview.js';

/** Since when a row has been waiting: the customer's message, else the row's last one. */
const since = (r, now) => r.waitingSince || r.lastAt || now;
/** A row still waiting on us: not answered, by us or anyone else. */
const isWaiting = (r) => !r.answered && (r.state === undefined || r.state === 'awaiting');

/** When the longest-waiting of these rows started waiting, or null for none. */
export function oldestWaiting(rows) {
  const times = rows.filter(isWaiting).map((r) => since(r, 0)).filter(Boolean);
  return times.length ? Math.min(...times) : null;
}

/** A run over the rows visible in Needs reply, oldest first, frozen from now on. */
export function createRun(rows, now) {
  // The list is newest first: reversed, rows with the same time keep the older-listed one first.
  const queue = [...rows].reverse().filter(isWaiting).sort((a, b) => since(a, now) - since(b, now)).map((r) => r.key);
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

/** "All answered: 5 copied, 1 skipped, 1 answered elsewhere.", without the parts that are none. */
export function runSummary(run) {
  if (!run || !run.queue.length) return 'Nothing waiting.';
  const parts = [[run.copied, 'copied'], [run.skipped, 'skipped'], [run.elsewhere, 'answered elsewhere']]
    .filter(([n]) => n > 0).map(([n, words]) => n + ' ' + words);
  return parts.length ? 'All answered: ' + parts.join(', ') + '.' : 'All answered.';
}

/**
 * The run as the store drives it. The UI sees state.run ({ at, of }: "3 of 7") while it goes on,
 * then state.runSummary (the sentence) once it is over, until the person goes back to the list.
 * open(key) is the store's own open, which leaves the run on; refresh() reads the list again; close()
 * leaves no conversation open.
 */
export function createRunner({ get, set, now, open, refresh, close }) {
  let run = null;

  /** Every row of Needs reply, when it has more than the page shows. */
  async function loadAll() {
    const s = get();
    if (s.total <= s.rows.length) return;
    set({ limit: s.total });
    await refresh();
  }

  async function next() {
    const r = run;
    await loadAll(); // a customer beyond the rows loaded is not taken for answered
    if (run !== r) return; // ended, or started again, meanwhile
    const key = nextKey(r, visibleRows(get()));
    if (key === null) {
      run = null;
      set({ run: null, runSummary: runSummary(r) });
      close();
      return;
    }
    set({ run: { at: r.i + 1, of: r.queue.length } });
    await open(key);
  }

  return {
    /** Start replying: every customer waiting in Needs reply, the oldest first. */
    async start() {
      if (get().chip !== 'waiting') return;
      run = null;
      set({ run: null, runSummary: null });
      await loadAll();
      run = createRun(visibleRows(get()), now());
      await next();
    },

    /** After a copy that worked: the next customer, when that one was the run's. */
    async copied(key) {
      if (!run || run.queue[run.i] !== key) return;
      run.copied++;
      await next();
    },

    /** Skip: the next customer, and this one stays in Needs reply. */
    async skip() {
      if (!run || get().itemState === 'loading') return;
      run.skipped++;
      await next();
    },

    /** End run, Back to the list, or the person choosing elsewhere: no run and no summary. */
    end() {
      if (!run && get().run === null && get().runSummary === null) return;
      run = null;
      set({ run: null, runSummary: null });
    },
  };
}
