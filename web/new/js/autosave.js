// What the person types in the message box is saved with its suggestion a moment after the typing
// stops, so it is still there after a reload. A save the server did not take is tried again every
// 5 s, and the last one goes out with keepalive when the page hides or closes. No DOM: the store
// hands in the server, the clock, the timers and its own state (get, and set for the save note).

const QUIET = 600;
const RETRY = 5000;

export function createAutosave({ api, now, timers, keepalive, get, set }) {
  let pending = null;   // { id, text }: an edit waiting to be sent, or on its way
  let leaving = null;   // the edit on its way with keepalive, so a second flush does not send it again
  let timer = null;
  const draftId = () => { const s = get(); return s.item && s.item.draft ? s.item.draft.id : null; };

  // The note speaks for the suggestion on screen. A save for another one (the box moved on to
  // another suggestion meanwhile) leaves it alone, except a "Saving…" it can no longer finish.
  function note(edit, save) {
    if (draftId() === edit.id) set({ save });
    else if (get().save.state === 'saving') set({ save: { state: 'idle', at: null } });
  }

  async function send(edit, post = api) {
    note(edit, { state: 'saving', at: get().save.at });
    try {
      await post('/api/drafts/' + edit.id + '/edit', { text: edit.text });
      if (pending === edit) pending = null;
      if (pending === null) note(edit, { state: 'saved', at: now() });
    } catch {
      if (pending !== edit) return;
      note(edit, { state: 'failed', at: get().save.at });
      timer = timers.set(() => send(edit), RETRY);
    }
  }

  function wait(edit, ms) {
    timers.clear(timer);
    pending = edit;
    timer = timers.set(() => send(edit), ms);
  }

  return {
    /** The text in the box changed: it is saved with this suggestion after a pause in the typing. */
    queue(id, text) {
      if (!id) { timers.clear(timer); pending = null; return; }
      wait({ id, text }, QUIET);
    },

    /**
     * The text now goes with another suggestion (one that could not be written, which the box shows
     * beside the text): it is saved there, and a save that was failing keeps its note and its retry.
     */
    move(id, text) {
      if (!id) return;
      wait({ id, text }, get().save.state === 'failed' ? RETRY : QUIET);
    },

    /** A new suggestion replaced the text: the edit waiting to be saved goes with it. */
    drop() { timers.clear(timer); pending = null; },

    /**
     * The page may be hiding or closing: the edit waiting goes out at once, with keepalive. The note
     * says when it lands, for a page that comes back; one that fails is tried again as usual.
     */
    flush() {
      timers.clear(timer);
      if (!pending || pending === leaving) return;
      const edit = pending;
      leaving = edit;
      send(edit, keepalive).finally(() => { if (leaving === edit) leaving = null; });
    },
  };
}
