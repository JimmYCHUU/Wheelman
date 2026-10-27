// The message box under the conversation, top to bottom: the context line, the suggested reply in
// its editor, what the checks say about it, other answers ("Instead:"), then the Tell Wheelman line,
// Clear and the one main button. Nothing is sent from here: a Dashboard reply is copied, then pasted
// into the dashboard. When there is no suggestion to show, one sentence says why, with one button.
import { html, useState, useEffect, useRef, useLayoutEffect } from './html.js';
import { boxText, boxView, liveChecks, checkLines, mainAction, insteadOptions, trustLine, wordsLine, saveWords, segments } from '../model.js';
import { Trust } from './trust.js';
import { Editor, focusFirstBlank, focusText } from './editor.js';
import { cutBlock, putBackText } from '../segments.js';

/** Ctrl+Enter (Cmd+Enter on a Mac) runs main.current, unless focus is in a field outside the editor. */
function useCtrlEnter(main, editor) {
  useEffect(() => {
    const on = (e) => {
      if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.defaultPrevented || !main.current) return;
      const a = document.activeElement;
      const inEditor = !!(a && editor.current && editor.current.contains(a));
      const typing = !!a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
      if (typing && !inEditor) return;
      e.preventDefault();
      main.current();
    };
    document.addEventListener('keydown', on);
    return () => document.removeEventListener('keydown', on);
  }, []);
}

/**
 * "Tell Wheelman what to say…": Enter sends it and empties the line, Escape empties it. While it
 * has text, Wheelman holds back from writing this conversation by itself.
 */
function Tell({ onSend, holdTell, button }) {
  const [value, setValue] = useState('');
  useEffect(() => () => { holdTell(false); }, []);
  const send = () => {
    const v = value.trim();
    if (!v) return;
    setValue('');
    holdTell(false);
    onSend(v);
  };
  const keys = (e) => {
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
    else if (e.key === 'Escape' && value) { e.preventDefault(); e.stopPropagation(); setValue(''); holdTell(false); }
  };
  return html`<div class="tell">
    <input type="text" maxlength="600" enterkeyhint="send" autocomplete="off" value=${value}
      placeholder="Tell Wheelman what to say…" aria-label="Tell Wheelman what to say, then press Enter"
      onInput=${(e) => { const v = e.currentTarget.value; setValue(v); holdTell(!!v.trim()); }} onKeyDown=${keys} />
    ${value.trim() ? html`<button type="button" class="btn small quiet" onClick=${send}>${button}</button>` : null}
  </div>`;
}

/** The line above the box: the store's (a new message arrived while typing), else the follow-up in hand. */
function Context({ context, words }) {
  if (context) {
    return html`<div class="context" role="status"><span>${context.message}</span>
      ${context.action ? html`<button type="button" class="btn small" onClick=${context.action.run}>${context.action.label}</button>` : null}
    </div>`;
  }
  return words ? html`<div class="context info"><span>${words}</span></div>` : null;
}

function Writing({ state }) {
  return html`<div class="box" role="group" aria-label="Message box">
    <${Context} context=${state.context} />
    <div class="box-head"><span class="box-label"><b>Writing…</b></span></div>
    <div class="editor writing" role="status" aria-label="Writing a suggestion"><i></i><i></i><i></i></div>
  </div>`;
}

/** One sentence, with at most one button and, where a reply can be written, the Tell Wheelman line. */
function Quiet({ state, actions, item, view }) {
  const d = item.draft || {};
  const fu = item.followUp;
  const run = {
    write: () => actions.write({}),
    'write-followup': () => actions.write({ followup: fu.id }),
    retry: () => actions.write({ instruction: d.instruction || undefined }),
    'put-back': () => actions.putBack(),
    restore: () => actions.restore(),
    'restore-followup': () => actions.restoreFollowUp(),
  };
  const tell = view.button && view.button.act === 'write-followup'
    ? (v) => actions.write({ instruction: v, followup: fu.id })
    : (v) => actions.tell(v);
  const b = view.button;
  return html`<div class="box" role="group" aria-label="Message box">
    <${Context} context=${state.context} />
    <p class=${'box-note ' + view.tone} role="status">${view.sentence}</p>
    ${view.tell || b ? html`<div class="foot">
      ${view.tell ? html`<${Tell} onSend=${tell} holdTell=${actions.holdTell} button="Write from this" />` : null}
      <div class="right">${b ? html`<button type="button" class=${'btn' + (b.main ? ' main' : '')} onClick=${run[b.act]}>${b.label}</button>` : null}</div>
    </div>` : null}
  </div>`;
}

/**
 * The suggestion in its editor, with the checks, Instead, Tell Wheelman, Clear and the main button.
 * Typed text stays here even when the conversation has no ready suggestion (a new message has
 * arrived, or the suggestion could not be written): then nothing is checked and there is nothing
 * to bring back. A suggestion that could not be written is told above the text, with Try again.
 */
function Draft({ state, actions, item, view, editor, main, reply }) {
  const d = item.draft && item.draft.status === 'ready' ? item.draft : null;
  const text = state.typed !== null ? state.typed : boxText(item.draft);
  const empty = !text.trim();
  const live = liveChecks(d, text);
  const lines = checkLines(live);
  const blanks = segments(text).filter((x) => x.kind === 'blank').length;
  const action = empty ? null : mainAction({ text, checks: live, overridden: state.overridden });
  const options = insteadOptions(item);

  const fill = () => focusFirstBlank(editor.current);
  const run = () => {
    if (!action || action.kind === 'blocked') return;
    if (action.kind === 'fill') fill();
    else actions.copy({});
  };
  main.current = run;
  // Copy anyway: the person's own decision. Offered only while no blank is empty, so it copies.
  const copyAnyway = () => {
    actions.override();
    actions.copy({});
  };
  // After Clear or Bring back the button pressed is gone, so the caret goes into the text, once the
  // new text is on screen.
  const refocus = useRef(false);
  useLayoutEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    focusText(editor.current);
  });
  const clear = () => { refocus.current = true; actions.clear(); };
  const bringBack = () => { refocus.current = true; actions.bringBack(); };

  // Remove: a block goes with the blank line that joined it, and the caret goes where it was. Put
  // back returns it while the reply it came out of is still in this box (see putBackText), and says
  // so when it is not.
  const inBox = useRef(null);
  inBox.current = { text, id: d ? d.id : null };
  useEffect(() => () => { inBox.current = null; }, []);
  const remove = (block, was) => {
    const out = cutBlock(was, block);
    if (out.at === -1) return;
    const removal = { text: out.text, id: d ? d.id : null, block, was };
    if (reply && reply.current) reply.current.land(out.text, out.at);
    actions.type(out.text);
    actions.toast('Removed', { label: 'Put back', run: () => {
      const back = putBackText(inBox.current, removal);
      if (back === null) actions.toast('Nothing put back: that reply is no longer in the box');
      else actions.type(back);
    } });
  };

  // The summary above the checks: facts counted for Wheelman's own text, or that typed text was not checked.
  const trust = trustLine(d, text);
  const note = saveWords({ save: state.save, draft: item.draft, typed: state.typed });

  return html`<div class="box" role="group" aria-label="Message box">
    <div class="box-scroll">
      <${Context} context=${state.context} words=${view.context} />
      ${view.failure ? html`<div class="context bad" role="status"><span>${view.failure}</span>
        <button type="button" class="btn small" onClick=${() => actions.write({ instruction: item.draft.instruction || undefined })}>Try again</button>
      </div>` : null}
      <div class="box-head">
        <span class="box-label"><b>Suggested reply</b> · not sent</span>
        ${note ? html`<span class=${'save-note' + (state.save.state === 'failed' ? ' bad' : '')}>${note}</span>` : null}
        <span class="count num">${wordsLine(text)}</span>
      </div>
      <${Editor} text=${text} parts=${d ? d.parts : null} onChange=${actions.type} onRemove=${remove}
        bad=${lines.fails.length > 0 && !state.overridden} root=${editor} handle=${reply} />
    </div>
    <div class="box-foot">
      ${empty ? null : html`<div class="checks">
        ${trust ? html`<${Trust} line=${trust} id=${d ? d.id : 'none'} key=${d ? d.id : 'none'} />` : null}
        ${lines.fails.map((m, i) => html`<p class="check bad" key=${'f' + i}><span>${m}</span>
          ${state.overridden || blanks ? null : html`<button type="button" class="btn small" onClick=${copyAnyway}>Copy anyway</button>`}</p>`)}
        ${[...lines.warns, ...lines.inputs].map((m, i) => html`<p class="check warn" key=${'w' + i}>${m}</p>`)}
      </div>`}
      ${options.length ? html`<div class="instead"><span>Instead:</span>
        ${options.map((o) => html`<button type="button" class="opt" key=${o.id} onClick=${() => actions.instead(o.id)}>${o.label}</button>`)}
      </div>` : null}
      <div class="foot">
        <${Tell} onSend=${(v) => actions.tell(v)} holdTell=${actions.holdTell} button="Rewrite" />
        <div class="right">
          ${empty
            ? (d && d.reply ? html`<button type="button" class="btn" onClick=${bringBack}>Bring back the suggestion</button>` : null)
            : html`<button type="button" class="btn quiet" onClick=${clear}>Clear</button>`}
          ${action && action.secondary ? html`<button type="button" class="btn quiet" onClick=${() => actions.copy({ withBlanks: true })}>${action.secondary}</button>` : null}
          ${action ? html`<button type="button" class="btn main" disabled=${action.kind === 'blocked'} title=${action.kind === 'blocked' ? null : action.label + ' (Ctrl+Enter)'} onClick=${run}>${action.label}</button>` : null}
        </div>
      </div>
    </div>
  </div>`;
}

function Box({ state, actions, item, reply }) {
  const editor = useRef(null);
  const main = useRef(null);
  useCtrlEnter(main, editor);
  const view = boxView({ item, writing: state.writing === state.key, done: state.done[state.key] === item.anchor, doneAt: state.doneAt[state.key], typed: state.typed !== null });
  if (view.kind !== 'editor') main.current = null;
  if (view.kind === 'writing') return html`<${Writing} state=${state} />`;
  if (view.kind === 'quiet') return html`<${Quiet} state=${state} actions=${actions} item=${item} view=${view} />`;
  return html`<${Draft} state=${state} actions=${actions} item=${item} view=${view} editor=${editor} main=${main} reply=${reply} />`;
}

/** reply: a ref the editor fills while it is on screen, for Add to reply (see Editor's handle). */
export function MessageBox({ state, actions, reply }) {
  if (!state.key || !state.item || state.itemState !== 'ready') return null;
  return html`<${Box} key=${state.key} state=${state} actions=${actions} item=${state.item} reply=${reply} />`;
}
