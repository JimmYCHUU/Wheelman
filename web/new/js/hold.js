// The Tell hold: automatic writing never replaces a draft while an instruction is being typed.
export function createHold({ api, get, timers }) {
  let holdKey = null;
  let holdTimer = null;

  async function release() {
    timers.clear(holdTimer);
    const key = holdKey;
    holdKey = null;
    if (key) { try { await api('/api/items/' + key + '/hold', { on: false }); } catch { /* it lapses by itself */ } }
  }

  /** Releases a hold on any conversation but this one (opening a conversation calls it). */
  async function releaseFor(key) {
    if (holdKey && holdKey !== key) await release();
  }

  async function holdTell(on) {
    if (!on) { await release(); return; }
    if (!get().key) return;
    if (holdKey && holdKey !== get().key) await release();
    const key = get().key;
    const beat = async () => {
      if (holdKey !== key) return;
      try { await api('/api/items/' + key + '/hold', { on: true }); } catch { /* retried at the next beat */ }
      if (holdKey === key) holdTimer = timers.set(beat, 30000);
    };
    if (holdKey === key) return;
    holdKey = key;
    await beat();
  }

  return { holdTell, releaseFor };
}
