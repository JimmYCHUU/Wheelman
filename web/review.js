// The Review page: a run of real conversations written two ways, side by side, rated blind. Each
// case shows what the customer wrote, the two suggestions as Left and Right (shuffled per case),
// their checks and their sales score, and three buttons. A vote is saved to the run file at once
// and then says which side was A. Keys 1, 2 and 3 rate the next unrated case. Customer text is
// always inserted as text, never as HTML.

import { $, h } from './lib/h.js';
import { t } from './lib/copy.js';
import { clock, dayLabel } from './lib/format.js';

const root = $('#review');
const state = { runs: [], run: null, summary: null };

async function api(path, body = null) {
  const res = await fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  let json = {};
  try { json = await res.json(); } catch { /* nothing */ }
  if (!res.ok) throw new Error(json.error || `${res.status}`);
  return json;
}

function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.style.left = '50%';
  el.style.top = '16px';
  el.classList.add('is-on');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('is-on'), 2500);
}

const when = (at) => `${dayLabel(at, Date.now())} ${clock(at)}`.trim();
const aud = (n) => Number(n || 0).toFixed(2);

function strip(run, s) {
  const lines = [
    t('review.sides', { a: run.sides.A.label, b: run.sides.B.label }),
    t('review.progress', { done: s.rated, n: s.n }),
    t('review.wins', { a: s.wins.A, b: s.wins.B, poor: s.wins.poor, left: s.unrated }),
    t('review.score', { a: s.A.score, b: s.B.score }),
    t('review.fails', { a: s.A.fails, b: s.B.fails }),
    t('review.words', { a: s.A.medianWords, b: s.B.medianWords }),
    t('review.cost', { a: aud(s.A.costAud), b: aud(s.B.costAud) }) + (s.A.unpriced || s.B.unpriced ? ` ${t('review.cost.unpriced')}` : ''),
  ];
  const bySituation = s.bySituation.filter((r) => r.A + r.B + r.poor > 0).map((r) => t('review.situation', { label: r.label, a: r.A, b: r.B, poor: r.poor }));
  return h('div', { class: 'review-strip' }, lines.map((l) => h('p', { text: l })), bySituation.length ? h('p', { text: `${t('review.situations')} ${bySituation.join('; ')}.` }) : null, h('p', { class: 'fine', text: t('review.keys') }));
}

function sideBox(c, letter, headKey) {
  const side = letter === 'L' ? c.left : (c.left === 'A' ? 'B' : 'A');
  const x = c[side] || {};
  const picked = c.vote && c.vote.side === side;
  const box = h('div', { class: `review-side ${picked ? 'is-picked' : ''}`.trim() },
    h('div', { class: 'k', text: t(headKey) }),
    x.status === 'ready'
      ? h('div', { class: 'review-reply', text: x.reply || '' })
      : h('div', { class: 'review-reply fine', text: t('review.unwritten', { error: x.error || '' }) }),
    (x.checks || []).length ? h('ul', { class: 'review-checks' }, x.checks.filter((k) => k.level !== 'ok').map((k) => h('li', { class: k.level, text: k.message }))) : null,
    h('p', { class: 'fine', text: `${t('review.sells', { n: x.score?.score ?? 0 })}${x.score?.notes?.length ? ` (${x.score.notes.join(', ')})` : ''}${x.model ? ` · ${t('review.model', { model: x.model })}` : ''}` }),
    c.vote ? h('p', { class: 'fine', text: `${side}: ${state.run.sides[side].label}` }) : null);
  return box;
}

function caseBox(c) {
  const kind = c.kind === 'buyer' ? t('review.kind.buyer') : c.kind === 'new' ? t('review.kind.new') : t('review.kind.mid');
  const sec = h('section', { class: 'review-case', id: `case-${c.i}` },
    h('div', { class: 'review-head' },
      h('strong', { text: t('review.case', { n: c.i + 1 }) }),
      h('span', { text: c.label || c.situation }),
      h('span', { text: kind }),
      c.vehicle ? h('span', { text: c.vehicle }) : null,
      h('span', { text: when(c.at) })),
    h('div', { class: 'review-customer' }, h('div', { class: 'k', text: t('review.customer') }), h('div', { text: c.customer || '' })),
    c.actual ? h('details', { class: 'review-actual' }, h('summary', { text: t('review.actual') }), h('div', { class: 'review-reply', text: c.actual })) : null,
    h('div', { class: 'review-sides' }, sideBox(c, 'L', 'review.left.head'), sideBox(c, 'R', 'review.right.head')),
    h('div', { class: 'review-vote' },
      h('button', { class: `btn ${c.vote?.pick === 'left' ? 'primary' : 'outline'}`, type: 'button', text: t('review.left'), onclick: () => cast(c.i, 'left') }),
      h('button', { class: `btn ${c.vote?.pick === 'right' ? 'primary' : 'outline'}`, type: 'button', text: t('review.right'), onclick: () => cast(c.i, 'right') }),
      h('button', { class: `btn ${c.vote?.pick === 'both_poor' ? 'primary' : 'outline'}`, type: 'button', text: t('review.poor'), onclick: () => cast(c.i, 'both_poor') }),
      c.vote ? h('span', { class: 'fine', text: t('review.was', { side: c.left }) }) : null));
  return sec;
}

function render() {
  root.replaceChildren();
  const run = state.run;
  const picker = h('select', { class: 'pick', 'aria-label': t('review.runs'), onchange: (e) => load(e.target.value) },
    state.runs.map((r) => h('option', { value: r.id, selected: run && r.id === run.id ? '' : null, text: `${when(r.createdAt)} · ${r.rated} of ${r.n} rated` })));
  root.append(h('h1', { text: t('review.title') }), h('p', { text: t('review.intro') }));
  if (!state.runs.length) { root.append(h('p', { class: 'fine', text: t('review.none') })); return; }
  root.append(h('label', { class: 'field' }, t('review.runs'), picker));
  if (!run) return;
  root.append(strip(run, state.summary));
  for (const c of run.cases) root.append(caseBox(c));
}

async function cast(i, pick) {
  try {
    const out = await api(`/api/review/${encodeURIComponent(state.run.id)}/vote`, { case: i, pick });
    state.run.cases[i] = out.case;
    state.summary = out.summary;
    render();
    toast(t('review.saved', { side: out.case.vote.side || t('review.neither') }));
  } catch (e) { toast(e.message); }
}

async function load(id) {
  try {
    const run = await api(`/api/review/${encodeURIComponent(id)}`);
    state.run = run;
    state.summary = run.summary;
    render();
  } catch (e) { toast(e.message); }
}

document.addEventListener('keydown', (e) => {
  if (!state.run || e.target.matches('input, select, textarea')) return;
  const pick = { 1: 'left', 2: 'right', 3: 'both_poor' }[e.key];
  if (!pick) return;
  const next = state.run.cases.find((c) => !c.vote);
  if (!next) return;
  e.preventDefault();
  cast(next.i, pick);
  $(`#case-${next.i + 1}`)?.scrollIntoView({ block: 'start' });
});

(async () => {
  try {
    const { runs } = await api('/api/review');
    state.runs = runs;
    const wanted = new URLSearchParams(location.search).get('run');
    render();
    if (runs.length) await load(wanted && runs.some((r) => r.id === wanted) ? wanted : runs[0].id);
  } catch (e) { root.replaceChildren(h('p', { text: e.message })); }
})();
