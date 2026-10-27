// The store's Remember actions: a lesson from the instruction a reply was written from, and its off switch.
// "Just this once" is no request at all: it only closes the note under the box.
import { scopeWords } from './lessons.js';

export function createRemember({ api, get, set, toast }) {
  const draftOf = () => get().item && get().item.draft;
  const without = (list, id) => list.filter((x) => x !== id);

  async function switchLesson(id, on) {
    try { return (await api('/api/lessons/' + id + '/switch', { on })).lesson; } catch (e) { toast(e.message); return null; }
  }

  // A lesson that was already there and switched on is left as it was: this press made nothing for
  // Undo to take back, so the toast offers none.
  async function remember(scope) {
    const d = draftOf();
    if (!d) return;
    try {
      const { lesson, wasOn } = await api('/api/drafts/' + d.id + '/remember', { scope });
      set({ remembered: [...without(get().remembered, d.id), d.id], closedNotes: [...without(get().closedNotes, d.id), d.id] });
      if (wasOn) { toast('Already remembered for ' + scopeWords(scope)); return; }
      toast('Remembered for ' + scopeWords(scope), { label: 'Undo', run: async () => {
        if (await switchLesson(lesson.id, false)) set({ remembered: without(get().remembered, d.id), closedNotes: without(get().closedNotes, d.id) });
      } });
    } catch (e) { toast(e.message); }
  }

  function justOnce() {
    const d = draftOf();
    if (d) set({ closedNotes: [...without(get().closedNotes, d.id), d.id] });
  }

  return { remember, justOnce, switchLesson };
}
