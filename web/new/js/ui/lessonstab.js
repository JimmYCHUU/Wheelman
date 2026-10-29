// The Playbook's Lessons tab: the edits Jim made again and again, proposed as lessons for him to keep
// or mark as not a rule; the lessons in use and those switched off, each with its switch, where it
// came from and its history; and the edits marked not a rule. Proposals are counted only here and in
// the Menu: nothing about them appears while Jim works.
import { html, useEffect, useRef } from './html.js';
import { plural } from '../../../lib/format.js';
import { lessonGroups, lessonLine, historyLines, proposalWords, shownText, shownExamples } from '../playbookview.js';

const INTRO = 'Lessons come from your instructions when you choose Remember, your Could be better notes, and edits you make again and again. '
  + 'Texts teach texts and emails teach emails. Marketplace, phone-only texts and auction orders never teach.';
const NOTHING = 'Nothing to review. A lesson is proposed after you make the same edit on three suggestions.';

/** What Wheelman wrote, struck through, and what was sent instead. */
function Examples({ examples }) {
  return html`<ul class="pb-examples">${examples.map((e, i) => html`<li key=${i} class="pb-example">
    <span class="pb-label">Before</span><del>${e.before}</del>
    <span class="pb-label">What you sent</span><ins>${e.after}</ins>
  </li>`)}</ul>`;
}

function Proposal({ p, n, actions }) {
  const w = proposalWords(p);
  const id = 'pb-proposal-' + n;
  return html`<article class="pb-card" aria-labelledby=${id}>
    <div class="pb-card-top"><h4 class="pb-words" id=${id}>${w.headline}</h4><span class="reason info">Proposed</span></div>
    <p class="pb-meta">${w.applies}</p>
    <${Examples} examples=${w.examples} />
    <div class="pb-acts">
      <button type="button" class="btn main" aria-describedby=${id} onClick=${() => actions.keep(p.key)}>Keep as a lesson</button>
      <button type="button" class="btn" aria-describedby=${id} onClick=${() => actions.notRule(p.key)}>Not a rule</button>
    </div>
  </article>`;
}

/** Where a lesson came from: the instruction remembered, the note and what it was about, or the edit's examples. */
function From({ l }) {
  const f = l.from || {};
  if (l.kind === 'remember') return html`<p class="pb-from">Your instruction: “${shownText(f.instruction || l.do)}”</p>`;
  if (l.kind === 'edit') {
    return html`<div class="pb-from">
      ${f.count ? html`<p>You made this edit on ${plural(f.count, 'suggestion')}. The newest:</p>` : null}
      <${Examples} examples=${shownExamples(f.examples)} />
    </div>`;
  }
  return html`<div class="pb-from">
    <p>Your Could be better note: “${shownText(f.note)}”</p>
    ${f.customer ? html`<p>The customer wrote: “${shownText(f.customer)}”</p>` : null}
    ${f.draft ? html`<p>Wheelman had suggested: “${shownText(f.draft)}”</p>` : null}
  </div>`;
}

const lessonKey = (l) => l.id + '-' + (l.n || 0);

/**
 * A lesson with its switch: on, it shapes new suggestions of its kind; off, it is never sent to the
 * AI. press(l): the switch was pressed.
 */
function Lesson({ l, press, now }) {
  const on = !l.off;
  const history = historyLines(l, now);
  return html`<article class=${'pb-card' + (on ? '' : ' off')} data-lesson=${lessonKey(l)}>
    <div class="pb-card-top">
      <p class="pb-words">${l.do}</p>
      <button type="button" class="pb-switch" role="switch" aria-checked=${on} aria-label=${(on ? 'Switch off: ' : 'Switch on: ') + l.do}
        onClick=${() => press(l)}>
        <span class="pb-knob" aria-hidden="true"></span><span class="pb-switch-word" aria-hidden="true">${on ? 'On' : 'Off'}</span>
      </button>
    </div>
    <p class="pb-meta">${lessonLine(l, now)}</p>
    <details class="pb-more"><summary>Where it came from</summary><${From} l=${l} /></details>
    <details class="pb-more"><summary>History</summary>
      <ul class="pb-history">${history.map((h, i) => html`<li key=${i}>${h}</li>`)}</ul>
    </details>
  </article>`;
}

function NotRule({ p, n, actions }) {
  const w = proposalWords(p);
  const id = 'pb-notrule-' + n;
  return html`<article class="pb-card off" aria-labelledby=${id}>
    <div class="pb-card-top">
      <p class="pb-words" id=${id}>${w.headline}</p>
      <button type="button" class="btn" aria-describedby=${id} onClick=${() => actions.keep(p.key)}>Keep it after all</button>
    </div>
    <p class="pb-meta">${w.applies}</p>
  </article>`;
}

/** pstate: the Playbook's store; actions: its actions; now: the time, for the days. */
export function LessonsTab({ pstate, actions, now }) {
  const g = lessonGroups(pstate);
  // A switched lesson moves to the other group, drawn afresh there: the focus follows its switch.
  const root = useRef(null);
  const moving = useRef(null); // { key, off }: the switch pressed, until its lesson has moved
  useEffect(() => {
    const m = moving.current;
    const l = m && pstate.lessons.find((x) => lessonKey(x) === m.key);
    if (!l || l.off !== m.off || !root.current) return;
    moving.current = null;
    const sw = root.current.querySelector('[data-lesson="' + m.key + '"] [role="switch"]');
    if (sw && document.activeElement !== sw) sw.focus();
  });
  const press = (l) => {
    moving.current = { key: lessonKey(l), off: !l.off };
    actions.switchLesson(l.id, l.off).then((done) => { if (!done) moving.current = null; });
  };
  const lessons = (list) => list.map((l) => html`<${Lesson} key=${lessonKey(l)} l=${l} press=${press} now=${now} />`);
  return html`<div class="pb-body" ref=${root}>
    <p class="pb-intro">${INTRO}</p>
    <section class="pb-group" aria-labelledby="pb-review"><h3 id="pb-review">To review</h3>
      ${g.review.length ? g.review.map((p, i) => html`<${Proposal} key=${p.key} p=${p} n=${i} actions=${actions} />`) : html`<p class="pb-none">${NOTHING}</p>`}
    </section>
    <section class="pb-group" aria-labelledby="pb-on"><h3 id="pb-on">In use (${g.on.length})</h3>
      ${g.on.length ? lessons(g.on) : html`<p class="pb-none">No lesson is in use yet.</p>`}
    </section>
    ${g.off.length ? html`<section class="pb-group" aria-labelledby="pb-off"><h3 id="pb-off">Switched off</h3>${lessons(g.off)}</section>` : null}
    ${g.notRules.length ? html`<section class="pb-group" aria-labelledby="pb-notrules"><h3 id="pb-notrules">Not a rule</h3>
      ${g.notRules.map((p, i) => html`<${NotRule} key=${p.key} p=${p} n=${i} actions=${actions} />`)}
    </section>` : null}
  </div>`;
}
