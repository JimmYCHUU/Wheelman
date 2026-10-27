// The list column: the three chips, one row per conversation with its one reason in words, and the
// states a list can be in (loading, empty, a problem, more to load).
import { html, useState, useRef } from './html.js';
import { CHIPS, rowView } from '../model.js';
import { hashFor, parseRoute } from '../route.js';
import { openAction } from '../hashsync.js';
import { visibleRows, waitingCount } from '../store.js';
import { oldestWaiting, runTakes } from '../runstore.js';
import { initials, hue, ago } from '../../../lib/format.js';

const EMPTY = {
  waiting: 'No one is waiting.',
  followups: 'No follow-ups are due.',
  all: 'There are no conversations yet.',
};
const PROBLEM = 'Wheelman is not responding. It tries again every 20 seconds.';

/** How the reason reads: green for done, red for a failed check, amber for something to fill, blue for a follow-up. */
function toneOf(row, view) {
  if (view.done) return 'good';
  if (row.followUp) return 'info';
  if (row.flag === 'fail') return 'bad';
  if (row.flag === 'input' || row.flag === 'error') return 'warn';
  return '';
}

function Avatar({ name }) {
  const letters = /\p{L}/u.test(name) ? initials(name) : '#';
  return html`<span class=${'avatar av-' + hue(name)} aria-hidden="true">${letters}</span>`;
}

function Row({ row, view, selected, tabbable, onOpen }) {
  const tone = toneOf(row, view);
  return html`<button type="button" class=${'row' + (view.unread ? ' unread' : '')} data-key=${row.key}
      aria-current=${selected ? 'true' : null} tabindex=${tabbable ? 0 : -1} onClick=${() => onOpen(row)}>
    <${Avatar} name=${view.name} />
    <span class="row-text">
      <span class="who">${view.name}</span>
      ${view.car ? html`<span class="car">${view.car}</span>` : null}
      <span class="sub">${view.preview}</span>
      ${view.reason ? html`<span class=${'reason ' + tone}>${view.reason}</span>` : null}
    </span>
    <span class="meta">
      <span class="num">${view.when}</span>
      ${view.unread ? html`<span class="badge">${view.unread}<span class="sr"> unread</span></span>` : null}
    </span>
  </button>`;
}

/**
 * Above Needs reply: how many are waiting, and Start replying (gone from the moment a run starts, and
 * while a run would take nobody: the ten newest are all copied, until the replies show on the
 * dashboard). How long the oldest has waited is said once every waiting row is loaded (the list
 * comes newest first, so until then it is not known).
 */
function RunOffer({ state, now, onStart }) {
  const n = waitingCount(state);
  const rows = visibleRows(state);
  if (state.chip !== 'waiting' || state.run || state.listState !== 'ready' || !n || !runTakes(state)) return null;
  const oldest = (state.total || 0) <= state.rows.length ? oldestWaiting(rows) : null;
  return html`<p class="run-start">
    <span class="num">${n} waiting${oldest ? ', oldest ' + ago(oldest, now) : ''}</span>
    <span class="sep" aria-hidden="true">·</span>
    <button type="button" class="btn small" onClick=${onStart}>Start replying</button>
  </p>`;
}

function Skeleton() {
  return html`<div class="skeleton" role="status" aria-label="Loading conversations">
    ${[0, 1, 2, 3, 4, 5].map((i) => html`<div class="skel" key=${i}><i class="round"></i><span class="lines"><i></i><i></i></span></div>`)}
  </div>`;
}

export function List({ state, actions, now, section = 'dashboard' }) {
  const [cursor, setCursor] = useState(null);
  const box = useRef(null);
  const rows = visibleRows(state);
  const counts = { waiting: waitingCount(state), followups: (state.counts && state.counts.followups) || 0 };
  const active = rows.some((r) => r.key === cursor) ? cursor : rows.some((r) => r.key === state.key) ? state.key : rows[0] && rows[0].key;

  // A chip or a row pressed is a new entry in the address first, so Back undoes it (hashsync.js).
  const choose = (id) => { location.hash = hashFor({ section, chip: id }); actions.setChip(id); };
  const openRow = (row) => {
    setCursor(row.key);
    // The row already open stays as it is: opening it again would blank the conversation and lose what is typed.
    const todo = openAction(state.key, parseRoute(location.hash).key, row.key);
    if (todo === 'none') return;
    location.hash = hashFor({ section, chip: state.chip, key: row.key });
    if (todo === 'view') return; // the store has it open; the address switches the view
    actions.open(row.key, state.chip === 'followups' && row.followUp ? { followup: row.followUp.id } : undefined);
  };
  // Start replying is an entry of its own, which the run's first customer then takes, so one Back
  // from anywhere in the run comes back here (web/new/js/hashsync.js).
  const start = () => { history.pushState(null, '', location.href); actions.startRun(); };
  const onKey = (e) => {
    const keys = { ArrowDown: 1, ArrowUp: -1, Home: 'first', End: 'last' };
    if (!(e.key in keys) || !rows.length) return;
    e.preventDefault();
    const here = e.target.closest ? e.target.closest('.row') : null;
    const at = Math.max(0, rows.findIndex((r) => r.key === (here ? here.dataset.key : active)));
    const to = keys[e.key] === 'first' ? 0 : keys[e.key] === 'last' ? rows.length - 1 : Math.min(rows.length - 1, Math.max(0, at + keys[e.key]));
    setCursor(rows[to].key);
    const buttons = box.current ? box.current.querySelectorAll('.row') : [];
    if (buttons[to]) buttons[to].focus();
  };

  const loading = state.listState === 'loading';
  const failed = state.listState === 'error';
  const left = Math.max(0, (state.total || 0) - state.rows.length);
  return html`<div class="list-inner">
    <div class="chips" role="group" aria-label="Show">
      ${CHIPS.map((c) => html`<button type="button" class="chip" aria-pressed=${state.chip === c.id} onClick=${() => choose(c.id)}>
        ${c.label}${c.id !== 'all' ? html`<span class="count num">${counts[c.id]}</span>` : null}
      </button>`)}
    </div>
    ${failed ? html`<p class="problem" role="alert">${PROBLEM}</p>` : null}
    <${RunOffer} state=${state} now=${now} onStart=${start} />
    <div class="rows" ref=${box} onKeyDown=${onKey}>
      ${loading ? html`<${Skeleton} />` : null}
      ${!loading && !failed && rows.length === 0 ? html`<p class="empty">${EMPTY[state.chip]}</p>` : null}
      ${!loading ? rows.map((r) => {
        const view = rowView(r, { now, doneAnchor: state.done[r.key] });
        return html`<${Row} key=${r.key} row=${r} view=${view} selected=${r.key === state.key} tabbable=${r.key === active} onOpen=${openRow} />`;
      }) : null}
      ${!loading && left > 0 ? html`<button type="button" class="btn more" onClick=${() => actions.more()}>Load older conversations<span class="num">${left} more</span></button>` : null}
    </div>
  </div>`;
}
