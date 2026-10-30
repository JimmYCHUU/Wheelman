// The Playbook: everything Wheelman knows and follows, in one place. It stands in place of the work
// grid while its address (#/playbook/<tab>) is on screen; the conversation stays open in the main
// store behind it, with what was typed, and "Back to <section>" returns to it as it was. Its four
// tabs are links, so Back and forward move between them; the Playbook's own store reads each one
// (web/new/js/playbookstore.js, made in main.js).
import { html } from './html.js';
import { sectionName } from '../model.js';
import { backHref, tabNotes } from '../playbookview.js';
import { playbookHash } from '../playbookroute.js';
import { LessonsTab } from './lessonstab.js';
import { FactsTab } from './factstab.js';
import { TemplatesTab } from './templatestab.js';
import { VoiceTab } from './voicetab.js';

const LEAD = 'Everything Wheelman knows and follows, in one place. Change it here and new suggestions use it.';

function Body({ pstate, actions, now }) {
  if (pstate.state === 'error') {
    return html`<div class="pb-problem" role="alert"><span>The Playbook could not be read: ${pstate.error}</span>
      <button type="button" class="btn small" onClick=${() => actions.load(pstate.tab, pstate.focus)}>Try again</button>
    </div>`;
  }
  if (pstate.state !== 'ready') return html`<p class="pb-wait" role="status">Reading the Playbook…</p>`;
  if (pstate.tab === 'facts') return html`<${FactsTab} pstate=${pstate} actions=${actions} now=${now} />`;
  if (pstate.tab === 'templates') return html`<${TemplatesTab} pstate=${pstate} actions=${actions} now=${now} />`;
  if (pstate.tab === 'voice') return html`<${VoiceTab} pstate=${pstate} actions=${actions} now=${now} />`;
  return html`<${LessonsTab} pstate=${pstate} actions=${actions} now=${now} />`;
}

/**
 * state: the main store's (the conversation to go back to); pstate and playbook: the Playbook's
 * store and the store itself; left: the address on screen before the Playbook opened, or null.
 */
export function PlaybookPage({ state, pstate, playbook, left = null, now }) {
  const notes = tabNotes(pstate, state.status);
  const tabs = [{ id: 'lessons', label: 'Lessons' }, { id: 'facts', label: 'Business facts' }, { id: 'templates', label: 'Templates' }, { id: 'voice', label: 'Voice' }];
  return html`<main class="tile playbook" aria-labelledby="pb-title">
    <div class="pb-inner">
      <a class="pb-back" href=${backHref(state, left)}>‹ Back to ${sectionName(state.section)}</a>
      <header class="pb-head">
        <h2 id="pb-title">Playbook</h2>
        <p class="pb-lead">${LEAD}</p>
      </header>
      <nav class="pb-tabs" aria-label="Playbook">
        ${tabs.map((t) => html`<a key=${t.id} class="pb-tab" href=${playbookHash(t.id)} aria-current=${pstate.tab === t.id ? 'page' : null}>
          ${t.label}${notes[t.id] ? html`<span class="pb-tab-note">${notes[t.id]}</span>` : null}
        </a>`)}
      </nav>
      <${Body} pstate=${pstate} actions=${playbook.actions} now=${now} />
    </div>
  </main>`;
}
