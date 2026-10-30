// The pieces the Playbook's Templates and Voice tabs both use for a part's editor: where the caret
// goes, the box's height and length limit, the note when the file was changed by hand since, and
// the part's earlier versions, each of which can be put back in the box.
import { html, useState, useEffect, useRef } from './html.js';
import { versionLines, partKey } from '../wordingview.js';

/** The longest wording the server takes: "keep it under 8,000 characters". */
export const LONGEST = 7999;

const FILE_DIFFERS = 'Your file has other wording for this part since you saved yours.';

/** The box's height in lines: its words and one more, from 5 to 18. */
export const rowsFor = (text) => Math.min(18, Math.max(5, String(text || '').split('\n').length + 1));

/**
 * A part's editor focus: the caret goes into the box when it opens from a press (Edit, Use this
 * version, Use the file's wording: set toBox first), and back to Edit when the editor closes with
 * nothing focused (its Cancel or Save pressed and gone).
 */
export function useEditorFocus(open) {
  const card = useRef(null);
  const box = useRef(null);
  const toBox = useRef(false);
  const was = useRef(open);
  useEffect(() => {
    if (open && toBox.current && box.current) { toBox.current = false; box.current.focus(); }
    if (was.current && !open && card.current && document.activeElement === document.body) {
      const edit = card.current.querySelector('[data-edit]');
      if (edit) edit.focus();
    }
    was.current = open;
  });
  return { card, box, toBox };
}

/** The file changed by hand since the wording in use was saved: its wording can go in the editor (use). */
export function FileChanged({ p, use }) {
  return html`<div class="pb-file" role="note">
    <span>${FILE_DIFFERS}</span>
    <button type="button" class="btn small" onClick=${() => use(p.fileText)}>Use the file's wording</button>
  </div>`;
}

/**
 * Earlier versions (N), closed until asked for, then read: each with Use this version, which puts it
 * in the editor (use). N is the number of versions saved. The newest of them is the wording in use,
 * so the list is the ones before it and the file's own.
 */
export function EarlierVersions({ p, pstate, actions, use, now }) {
  const [open, setOpen] = useState(false);
  const entry = pstate.earlier[partKey(p.name, p.part)];
  useEffect(() => { if (open && !entry) actions.versions(p.name, p.part); }, [open, entry]);
  const toggle = (e) => setOpen(e.currentTarget.open);
  let list;
  if (!entry || entry.state === 'loading') list = html`<p class="pb-wait" role="status">Reading the earlier versions…</p>`;
  else if (entry.state === 'error') {
    list = html`<div class="pb-problem" role="alert"><span>The earlier versions could not be read: ${entry.error}</span>
      <button type="button" class="btn small" onClick=${() => actions.versions(p.name, p.part)}>Try again</button>
    </div>`;
  } else {
    list = html`<ul class="pb-earlier pb-versions">${versionLines(entry.out, now).filter((l) => !l.inUse).map((l, i) => html`<li key=${i}>
      <span class="pb-day">${l.label}</span>
      <span class="pb-wording-text">${l.text}</span>
      <button type="button" class="btn small" onClick=${() => use(l.text)}>Use this version</button>
    </li>`)}</ul>`;
  }
  return html`<details class="pb-more" onToggle=${toggle}><summary>Earlier versions (${p.versions})</summary>${open ? list : null}</details>`;
}
