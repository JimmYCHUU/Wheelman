// The deal panel's own state: open or closed, the tab, the cars' media and "Another car". No DOM. The server,
// storage and clock are passed in, so the tests run it with fakes. The UI reads get() and calls actions.
const PANEL_KEY = 'wheelman.new.panel';

export function createPanelStore({ api, storage, now, wide }) {
  // Wide windows remember it, open unless it was closed; elsewhere the panel starts closed.
  const remembered = () => {
    try { return storage.getItem(PANEL_KEY) !== 'closed'; } catch { return true; }
  };
  let state = { open: !!wide() && remembered(), tab: 'car', other: null, media: {} };
  const listeners = new Set();
  const set = (patch) => {
    state = { ...state, ...patch };
    for (const fn of [...listeners]) fn();
  };
  const setMedia = (stockNo, patch) => set({ media: { ...state.media, [stockNo]: { ...state.media[stockNo], ...patch } } });
  const path = (stockNo) => '/api/vehicles/' + encodeURIComponent(stockNo);
  let otherSeq = 0;

  function toggle(open = !state.open) {
    set({ open: !!open });
    if (!wide()) return;
    try { storage.setItem(PANEL_KEY, state.open ? 'open' : 'closed'); } catch { /* storage may be blocked */ }
  }

  /** The car's photos, videos and documents: read once for the visit, again only when asked. */
  async function media(stockNo, { fresh } = {}) {
    const have = state.media[stockNo];
    if (have && !fresh && have.state !== 'error') return;
    setMedia(stockNo, { state: 'loading', error: '' });
    try {
      const out = await api(path(stockNo) + '/media' + (fresh ? '?fresh=1' : ''));
      setMedia(stockNo, {
        state: 'ready', photos: out.photos || [], videos: out.videos || [], documents: out.documents || [],
        readAt: out.readAt || null, stale: !!out.stale, error: out.error || '',
      });
    } catch (e) {
      setMedia(stockNo, { state: 'error', error: e.message });
    }
  }

  /** "Another car": a car other than the conversation's, in the panel's Car tab. */
  async function showCar(stockNo) {
    const seq = ++otherSeq;
    set({ open: true, tab: 'car', other: { stockNo, vehicle: null, state: 'loading', error: '' } });
    try {
      const { vehicle } = await api(path(stockNo));
      if (seq === otherSeq) set({ other: { stockNo, vehicle, state: 'ready', error: '' } });
    } catch (e) {
      if (seq === otherSeq) set({ other: { stockNo, vehicle: null, state: 'error', error: e.message } });
    }
  }

  const back = () => { otherSeq++; set({ other: null }); };

  return {
    get: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    actions: { toggle, setTab: (tab) => set({ tab }), media, showCar, back, reset: back },
  };
}
