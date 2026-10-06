// A small store around the page's one state object. The older parts of the page still change
// the state directly and then call notify(); the newer views subscribe with a selector, and are
// repainted only when what they selected has changed.

const shallowEqual = (a, b) => {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => a[k] === b[k]);
};

export function createStore(state) {
  const subs = new Set();
  let scheduled = false;

  /** Something changed: every subscriber checks its selection. Batched to one pass per tick. */
  function notify() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; for (const run of subs) run(); });
  }

  /**
   * select(s => ({ a: s.a, b: s.b }), (next, prev) => paint(next)): the callback runs once now,
   * then after any notify() where the selected object differs (shallowly) from the last one.
   */
  function select(selector, cb) {
    let last = selector(state);
    cb(last, undefined);
    const run = () => {
      const next = selector(state);
      if (shallowEqual(next, last)) return;
      const prev = last;
      last = next;
      cb(next, prev);
    };
    subs.add(run);
    return () => subs.delete(run);
  }

  return { state, notify, select };
}
