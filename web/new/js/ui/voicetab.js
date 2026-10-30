// The Playbook's Voice tab: how every reply sounds and sells, one section at a time, with the house
// voice and the short voice card under Voice and the sales playbook under Selling. A section saved
// here goes into the next suggestion's request as it is, with nothing shown first: only the AI can
// show its effect. Every version is kept, and an earlier one, or the file's own when the file was
// changed by hand since, can be put back in the editor (the pieces are templatestab.js's).
import { html } from './html.js';
import { wordingGroups, changedLine } from '../wordingview.js';
import { EarlierVersions, FileChanged, useEditorFocus, openOn, rowsFor } from './templatestab.js';

const INTRO = 'How every reply sounds and sells. A change here goes into the next suggestion; there is no preview, because only the AI can show it.';

/** One section: its heading, its words in the quiet tone and the day they were changed, with Edit; or its editor. */
function Section({ p, n, pstate, actions, now }) {
  const open = openOn(pstate.editing, p);
  const { card, box, toBox } = useEditorFocus(open);
  const id = 'pb-voice-' + n;
  const text = open ? pstate.editing.text : '';
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
    ${open ? html`<div class="pb-editor">
      <textarea id=${id} ref=${box} rows=${rowsFor(text)} maxlength="7999" value=${text} aria-labelledby=${id + '-title'}
        onInput=${(e) => actions.type(e.currentTarget.value)}></textarea>
      <div class="pb-acts">
        <button type="button" class="btn main" aria-disabled=${busy} onClick=${() => actions.saveWording(p.name, p.part, text)}>Save</button>
        <button type="button" class="btn" onClick=${actions.cancel}>Cancel</button>
      </div>
    </div>` : html`<p class="pb-wording-text">${p.text}</p>`}
    ${p.fileChanged ? html`<${FileChanged} p=${p} use=${use} />` : null}
    ${p.versions ? html`<${EarlierVersions} p=${p} pstate=${pstate} actions=${actions} use=${use} now=${now} />` : null}
  </article>`;
}

/** pstate: the Playbook's store; actions: its actions; now: the time, for the days. */
export function VoiceTab({ pstate, actions, now }) {
  const groups = wordingGroups(pstate.wording, 'voice');
  let n = 0;
  return html`<div class="pb-body">
    <p class="pb-intro">${INTRO}</p>
    ${groups.map((g) => html`<section key=${g.group} class="pb-group" aria-labelledby=${'pb-voiceg-' + g.group.toLowerCase()}>
      <h3 id=${'pb-voiceg-' + g.group.toLowerCase()}>${g.group}</h3>
      ${g.parts.map((p) => html`<${Section} key=${p.name + '\n' + p.part} p=${p} n=${n++} pstate=${pstate} actions=${actions} now=${now} />`)}
    </section>`)}
  </div>`;
}
