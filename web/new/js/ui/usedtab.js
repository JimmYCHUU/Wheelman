// The panel's What Wheelman used tab: what the suggestion relied on, in plain words. The old page's
// "What the suggestion relies on". There is no cost line: a request's cost is not stored for each draft.
import { html } from './html.js';
import { plural } from '../../../lib/format.js';
import { writtenBy, lessonLines, ruleWords } from '../model.js';
import { playbookHash } from '../playbookroute.js';

/** item: the open conversation. now: the time, for the day a lesson was taught. */
export function UsedTab({ item, now = Date.now() }) {
  const d = item && item.draft && item.draft.status === 'ready' ? item.draft : null;
  if (!d) return html`<p class="empty">No suggestion yet.</p>`;
  const facts = d.factsUsed || [];
  const where = [d.rungLabel ? 'Where the customer is: ' + d.rungLabel + '.' : '', d.nextStep ? 'Next step: ' + d.nextStep + '.' : ''].filter(Boolean).join(' ');
  const lessons = lessonLines(d.lessonsApplied, now);
  const rules = ruleWords(d.rules);
  return html`
    <section class="car-sec"><h4>Facts it relied on</h4>
      ${facts.length ? html`<ul class="included">${facts.map((f, i) => html`<li key=${i}>${f}</li>`)}</ul>` : html`<p class="fine">No particular facts were listed.</p>`}
    </section>
    ${lessons.length ? html`<section class="car-sec"><h4>Lessons it followed</h4>
      <ul class="included">${lessons.map((l, i) => html`<li key=${i}>${l.text}${l.from ? html` <span class="fine">${l.from}</span>` : null}</li>`)}</ul>
      <a class="fine used-playbook" href=${playbookHash('lessons')}>See every lesson in the Playbook</a>
    </section>` : null}
    ${rules.length ? html`<section class="car-sec"><h4>Rules that fired</h4>
      <ul class="included">${rules.map((r, i) => html`<li key=${i}>${r}</li>`)}</ul>
    </section>` : null}
    ${d.practiceUsed > 0 ? html`<p class="fine">What the team really sent for similar messages: ${plural(d.practiceUsed, 'reply', 'replies')}.</p>` : null}
    ${d.instruction ? html`<p class="fine">Your instruction: “${d.instruction}”</p>` : null}
    ${where ? html`<p class="fine">${where}</p>` : null}
    <p class="fine">${writtenBy(d)}</p>`;
}
