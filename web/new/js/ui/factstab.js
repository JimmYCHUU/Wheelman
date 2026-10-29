// The Playbook's Business facts tab: the facts a reply may state, by state (Needs your answer,
// Working, Confirmed). An answer saved here is a new version, used from the next suggestion; every
// earlier one is kept and can be put back in the box, as can the file's own answer when the file was
// changed by hand since. Putting an answer in the box saves nothing: saving is always Jim's press.
// The fact the address names (Answer it, above the message box) is scrolled to and focused.
import { html, useState, useEffect, useRef } from './html.js';
import { dayLabel } from '../../../lib/format.js';
import { factGroups, factTag } from '../playbookview.js';

const INTRO = 'Every fact a reply states comes from here or from the stock records. A fact that needs your answer is a blank in replies until you answer it.';

const STATE = { confirmed: 'Confirmed', working: 'Working', needs_answer: 'Needs answer' };
/** An earlier version's day (or "In your file" for the file's own), and its state then: "Today, Confirmed". */
const earlierDay = (e, now) => (e.from === 'file' || !e.at ? 'In your file' : dayLabel(e.at, now)) + (STATE[e.status] ? ', ' + STATE[e.status] : '');

function Fact({ f, n, actions, now }) {
  const needs = f.status === 'needs_answer';
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const box = useRef(null);
  const toBox = useRef(false); // the caret goes into the box once it is on screen
  useEffect(() => {
    if (!toBox.current || !box.current) return;
    toBox.current = false;
    box.current.focus();
  });
  const id = 'pb-fact-' + n;
  const tag = factTag(f, now);
  const open = needs || editing;
  /** An answer in the box, to change or save. */
  const use = (answer) => { setText(answer); setEditing(true); toBox.current = true; };
  const close = () => { setEditing(false); setText(''); };
  const save = async () => { if (await actions.saveFact(f.title, text, 'confirmed')) close(); };

  return html`<article class="pb-card" data-fact=${f.title} aria-labelledby=${id + '-title'}>
    <div class="pb-card-top"><h4 class="pb-words" id=${id + '-title'}>${f.title}</h4><span class=${'reason ' + tag.tone}>${tag.text}</span></div>
    ${!open ? html`<p class="pb-answer">${f.answer}</p>` : null}
    ${f.file ? html`<div class="pb-file" role="note">
      <span>${f.file.answer ? 'Your file has a different answer since you saved this one: “' + f.file.answer + '”' + (/[.!?]$/.test(f.file.answer) ? '' : '.') : 'Your file has no answer for it since you saved this one.'}</span>
      ${f.file.answer ? html`<button type="button" class="btn small" onClick=${() => use(f.file.answer)}>Use the file's answer</button>` : null}
    </div>` : null}
    ${open ? html`<div class="pb-editor">
      <label for=${id}>Your answer</label>
      <textarea id=${id} ref=${box} rows="3" maxlength="2000" value=${text} aria-describedby=${id + '-title'}
        onInput=${(e) => setText(e.currentTarget.value)}></textarea>
      <div class="pb-acts">
        <button type="button" class="btn main" onClick=${save}>Save as Confirmed</button>
        ${editing && !needs ? html`<button type="button" class="btn" onClick=${close}>Cancel</button>` : null}
      </div>
    </div>` : html`<div class="pb-acts">
      ${f.status === 'working' ? html`<button type="button" class="btn main" aria-describedby=${id + '-title'} onClick=${() => actions.saveFact(f.title, f.answer, 'confirmed')}>Confirm</button>` : null}
      <button type="button" class="btn" aria-describedby=${id + '-title'} onClick=${() => use(f.answer)}>Change the answer</button>
    </div>`}
    ${f.earlier && f.earlier.length ? html`<details class="pb-more"><summary>Earlier answers (${f.earlier.length})</summary>
      <ul class="pb-earlier">${f.earlier.map((e, i) => html`<li key=${i}>
        <span class="pb-day">${earlierDay(e, now)}</span>
        <span class="pb-said">${e.answer ? '“' + e.answer + '”' : 'No answer.'}</span>
        ${e.answer ? html`<button type="button" class="btn small" onClick=${() => use(e.answer)}>Use this answer</button>` : null}
      </li>`)}</ul>
    </details>` : null}
  </article>`;
}

/** pstate: the Playbook's store; actions: its actions; now: the time, for the days. */
export function FactsTab({ pstate, actions, now }) {
  const root = useRef(null);
  const focused = useRef(null);
  // The fact the address names, once: scrolled to, with its box or first button focused.
  useEffect(() => {
    const want = pstate.focus;
    if (!want || focused.current === want || !root.current) return;
    const card = [...root.current.querySelectorAll('[data-fact]')].find((el) => el.dataset.fact === want);
    if (!card) return;
    focused.current = want;
    card.scrollIntoView({ block: 'center' });
    const target = card.querySelector('textarea') || card.querySelector('button');
    if (target) target.focus({ preventScroll: true });
  }, [pstate.focus, pstate.facts]);

  const g = factGroups(pstate.facts);
  const n = (f) => pstate.facts.indexOf(f);
  const cards = (list) => list.map((f) => html`<${Fact} key=${f.title} f=${f} n=${n(f)} actions=${actions} now=${now} />`);
  return html`<div class="pb-body" ref=${root}>
    <p class="pb-intro">${INTRO}</p>
    ${g.needs.length ? html`<section class="pb-group" aria-labelledby="pb-needs"><h3 id="pb-needs">Needs your answer</h3>${cards(g.needs)}</section>` : null}
    ${g.working.length ? html`<section class="pb-group" aria-labelledby="pb-working">
      <h3 id="pb-working">Working <span class="pb-quiet">(in use, not yet confirmed by you)</span></h3>${cards(g.working)}
    </section>` : null}
    ${g.confirmed.length ? html`<section class="pb-group" aria-labelledby="pb-confirmed"><h3 id="pb-confirmed">Confirmed</h3>${cards(g.confirmed)}</section>` : null}
    ${pstate.facts.length ? null : html`<p class="pb-none">There are no business facts yet.</p>`}
  </div>`;
}
