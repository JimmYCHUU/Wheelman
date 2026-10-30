// The Playbook's Templates tab: every message Wheelman writes from, by section, then the blocks code
// puts into a reply, each listed by its label and first line, so the list can be scanned; Edit
// shows all of its wording in use, in the box. A change is shown on three conversations, written
// word for word by the code that writes each message, before it can be saved: Save waits for a
// preview of the very words in the editor. Every version is kept: an earlier one, or the file's own
// wording when the file was changed by hand since, goes into the editor, to be shown and saved in its
// turn. The editor stays open with its words across tabs, Back and the Menu (the Playbook's store).
// The Voice tab (voicetab.js) uses this file's Earlier versions, file note and editor focus.
import { html, useState, useEffect, useRef } from './html.js';
import { wordingGroups, canSave, previewLabel, previewHead, changedLine, nextVersionLine, versionLines } from '../wordingview.js';

const BRACES = 'Words in braces, such as {car_link}, are filled in by code from the records. Keep them, and the facts stay exact.';
const FILE_DIFFERS = 'Your file has other wording for this part since you saved yours.';

const keyOf = (p) => p.name + '\n' + p.part;
/** Whether the editor is open on this part. */
export const openOn = (editing, p) => !!editing && editing.name === p.name && editing.part === p.part;
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
  const entry = pstate.earlier[keyOf(p)];
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

/** The words shown on three conversations, each headed by the customer's name and car, with its note; or why there is none. */
export function Previews({ previewed }) {
  if (previewed.none) return html`<p class="pb-none">${previewed.none}</p>`;
  return html`<div class="pb-previews" role="group" aria-label="How it reads">
    ${previewed.previews.map((c, i) => html`<article key=${i + '-' + c.key} class="pb-preview">
      <div class="pb-preview-head"><span>${previewHead(c)}</span>${c.fits ? null : html`<span class="reason">Not offered here</span>`}</div>
      <p class="pb-preview-text">${c.text}</p>
      ${c.note ? html`<p class="pb-preview-note">${c.note}</p>` : null}
    </article>`)}
  </div>`;
}

/** Save this version, held until the words in the editor were shown (canSave), and Cancel, with the version it would be. */
export function SaveRow({ p, text, previewed, busy, save, cancel }) {
  return html`<div class="pb-acts pb-save">
    <button type="button" class="btn main" disabled=${!canSave(previewed, text)} aria-disabled=${busy} onClick=${save}>Save this version</button>
    <button type="button" class="btn" onClick=${cancel}>Cancel</button>
    <span class="pb-meta">${nextVersionLine(p.versions)}</span>
  </div>`;
}

/** One part: its label, its first line in the quiet tone and the day it was changed, with Edit; or its editor, with all of it. */
function Wording({ p, n, pstate, actions, now }) {
  const open = openOn(pstate.editing, p);
  const { card, box, toBox } = useEditorFocus(open);
  const id = 'pb-tpl-' + n;
  const text = open ? pstate.editing.text : '';
  const previewed = open && openOn(pstate.previewed, p) ? pstate.previewed : null;
  const busy = !!pstate.busy;
  const changed = changedLine(p.at, now);
  /** Words in the editor (an earlier version, the file's), with the caret in it. */
  const use = (words) => { toBox.current = true; actions.edit(p.name, p.part, words); };
  return html`<article class="pb-card" ref=${card} aria-labelledby=${id + '-title'}>
    <div class="pb-card-top">
      <h4 class="pb-words" id=${id + '-title'}>${p.label}</h4>
      ${changed ? html`<span class="pb-meta">${changed}</span>` : null}
      ${open ? null : html`<button type="button" class="btn small" data-edit aria-describedby=${id + '-title'} onClick=${() => use(undefined)}>Edit</button>`}
    </div>
    ${open ? null : html`<p class="pb-first">${p.first}</p>`}
    ${p.fileChanged ? html`<${FileChanged} p=${p} use=${use} />` : null}
    ${open ? html`<div class="pb-editor">
        <textarea id=${id} ref=${box} rows=${rowsFor(text)} maxlength="7999" value=${text} aria-labelledby=${id + '-title'} aria-describedby=${id + '-hint'}
          onInput=${(e) => actions.type(e.currentTarget.value)}></textarea>
        <p class="pb-meta" id=${id + '-hint'}>${BRACES}</p>
        <div class="pb-acts">
          <button type="button" class="btn" aria-disabled=${busy} onClick=${() => actions.preview(p.name, p.part, text)}>${previewLabel(previewed, text)}</button>
        </div>
      </div>
      ${previewed ? html`<${Previews} previewed=${previewed} />` : null}
      <${SaveRow} p=${p} text=${text} previewed=${previewed} busy=${busy} save=${() => actions.saveWording(p.name, p.part, text)} cancel=${actions.cancel} />
      ${p.versions ? html`<${EarlierVersions} p=${p} pstate=${pstate} actions=${actions} use=${use} now=${now} />` : null}` : null}
  </article>`;
}

/** pstate: the Playbook's store; actions: its actions; now: the time, for the days. */
export function TemplatesTab({ pstate, actions, now }) {
  const groups = wordingGroups(pstate.wording);
  let n = 0;
  return html`<div class="pb-body">
    ${groups.map((g) => html`<section key=${g.group} class="pb-group" aria-labelledby=${'pb-tplg-' + g.group.toLowerCase()}>
      <h3 id=${'pb-tplg-' + g.group.toLowerCase()}>${g.group}</h3>
      ${g.parts.map((p) => html`<${Wording} key=${keyOf(p)} p=${p} n=${n++} pstate=${pstate} actions=${actions} now=${now} />`)}
    </section>`)}
  </div>`;
}
