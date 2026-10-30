// The Playbook's Templates tab: every message Wheelman writes from, by section, then the blocks code
// puts into a reply, each listed by its label and first line, so the list can be scanned; Edit
// shows all of its wording in use, in the box. A change is shown on three conversations, written
// word for word by the code that writes each message, before it can be saved: Save waits for a
// preview of the very words in the editor. Every version is kept: an earlier one, or the file's own
// wording when the file was changed by hand since, goes into the editor, to be shown and saved in its
// turn. The editor stays open with its words across tabs, Back and the Menu (the Playbook's store).
// The pieces the Voice tab shares are in wordingeditor.js.
import { html } from './html.js';
import { wordingGroups, canSave, previewLabel, previewHead, changedLine, nextVersionLine, partKey, openOn } from '../wordingview.js';
import { LONGEST, rowsFor, useEditorFocus, FileChanged, EarlierVersions } from './wordingeditor.js';

const BRACES = 'Words in braces, such as {car_link}, are filled in by code from the records. Keep them, and the facts stay exact.';

/**
 * The words shown on three conversations, each headed by the customer's name and car, with its
 * note; the server's sentence about them first (none of them shows the change), or alone (why
 * there is none).
 */
export function Previews({ previewed }) {
  const said = previewed.none ? html`<p class="pb-none">${previewed.none}</p>` : null;
  if (!previewed.previews.length) return said;
  return html`${said}<div class="pb-previews" role="group" aria-label="How it reads">
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
        <textarea id=${id} ref=${box} rows=${rowsFor(text)} maxlength=${LONGEST} value=${text} aria-labelledby=${id + '-title'} aria-describedby=${id + '-hint'}
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
      ${g.parts.map((p) => html`<${Wording} key=${partKey(p.name, p.part)} p=${p} n=${n++} pstate=${pstate} actions=${actions} now=${now} />`)}
    </section>`)}
  </div>`;
}
