// The message box under the conversation, top to bottom: the context line, the suggested reply in
// its editor, what the checks say about it, other answers ("Instead:"), then the Tell Wheelman line,
// Clear and the one main button, its channel's (web/new/js/channel.js). Only a Facebook chat sends
// from here, and only when Send on Facebook is pressed; every other reply is copied, then pasted
// where it goes. When there is no suggestion to show, one sentence says why, with one button.
import { html, useState, useEffect, useRef, useLayoutEffect } from './html.js';
import { boxText, liveChecks, checkLines, trustLine, wordsLine, saveWords, segments, rememberOffer } from '../model.js';
import { boxViewOf } from '../boxsections.js';
import { messageOptions } from '../messages.js';
import { typeView } from '../enquiry.js';
import { MenuButton } from './menu.js';
import { Research } from './research.js';
import { replyChannel, mainFor, sendFor, sendingNow, sendFailedWords } from '../channel.js';
import { Trust } from './trust.js';
import { Editor, focusFirstBlank, focusText } from './editor.js';
import { cutBlock, putBackText } from '../segments.js';
import { boxIsNext } from '../runstore.js';

/**
 * Ctrl+Enter (Cmd+Enter on a Mac) runs main.current, unless focus is in a field outside the editor.
 * A key held down runs it once: in a reply run, Copy opens the next customer, who must be read first.
 */
function useCtrlEnter(main, editor) {
  useEffect(() => {
    const on = (e) => {
      if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.repeat || e.defaultPrevented || !main.current) return;
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
 * has text, Wheelman holds back from writing this conversation by itself. disabled: while the
 * reply is sending, nothing can be asked for.
 */
function Tell({ onSend, holdTell, button, disabled = false }) {
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
    <input type="text" maxlength="600" enterkeyhint="send" autocomplete="off" value=${value} disabled=${disabled}
      placeholder="Tell Wheelman what to say…" aria-label="Tell Wheelman what to say, then press Enter"
      onInput=${(e) => { const v = e.currentTarget.value; setValue(v); holdTell(!!v.trim()); }} onKeyDown=${keys} />
    ${value.trim() && !disabled ? html`<button type="button" class="btn small quiet" onClick=${send}>${button}</button>` : null}
  </div>`;
}

/**
 * The line above the box: the store's (a new message arrived while typing), else the box's own (the
 * follow-up in hand), else why it was read as an import enquiry (enquiry.js typeView).
 */
function Context({ context, words }) {
  if (context) {
    return html`<div class="context" role="status"><span>${context.message}</span>
      ${context.action ? html`<button type="button" class="btn small" onClick=${context.action.run}>${context.action.label}</button>` : null}
    </div>`;
  }
  return words ? html`<div class="context info"><span>${words}</span></div>` : null;
}

/**
 * After a rewrite from an instruction: one line under the box. "Just this once" only closes it; Remember
 * keeps the instruction for this kind of reply (the store asks the server, and Undo is in the toast).
 */
function Note({ state, actions, item }) {
  const d = item.draft;
  if (!d || d.status !== 'ready' || !d.instruction || state.closedNotes.includes(d.id)) return null;
  const offer = rememberOffer(item, d, state.remembered);
  return html`<p class="note" role="status"><span>Rewritten from your instruction.</span>
    ${offer ? html`<span class="note-acts">
      <button type="button" class="btn small quiet" onClick=${actions.justOnce}>Just this once</button>
      <button type="button" class="btn small" onClick=${() => actions.remember(offer.scope)}>${offer.label}</button>
    </span>` : null}
  </p>`;
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
    // A reply sent from here that did not reach the buyer: that suggestion's text again (sender.js).
    resend: () => actions.send({ again: true }),
  };
  const tell = view.button && view.button.act === 'write-followup'
    ? (v) => actions.write({ instruction: v, followup: fu.id })
    : (v) => actions.tell(v);
  const b = view.button;
  // Send it again reads Sending… while it goes, and says why if it does not go.
  const send = b && b.act === 'resend' ? sendFor(item, state.sending[state.key]) : null;
  const resending = !!send && send.state === 'sending';
  const resendFailed = send && send.state === 'failed' ? send : null;
  return html`<div class="box" role="group" aria-label="Message box">
    <${Context} context=${state.context} words=${view.tell ? typeView(item).reason : ''} />
    ${resendFailed ? html`<div class="context bad" role="alert"><span>${sendFailedWords(resendFailed.error, resendFailed.outcome, { kept: false })}</span></div>` : null}
    <p class=${'box-note ' + view.tone} role="status">${view.sentence}</p>
    ${view.suggestion ? html`<div class="ghost"><span class="ghost-label">${view.suggestionLabel || 'The suggestion that was here'}</span><p>${view.suggestion}</p></div>` : null}
    ${view.tell || b ? html`<div class="foot">
      ${view.tell ? html`<${Tell} onSend=${tell} holdTell=${actions.holdTell} button="Write from this" disabled=${resending} />` : null}
      <div class="right">${view.copy && !resending ? html`<button type="button" class="btn quiet" onClick=${() => actions.copy({})}>Copy</button>` : null}
        ${resending ? html`<button type="button" class="btn main" disabled>Sending…</button>`
        : b ? html`<button type="button" class=${'btn' + (b.main ? ' main' : '')} onClick=${run[b.act]}>${b.label}</button>` : null}</div>
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
  const facebook = replyChannel(item) === 'facebook';
  // A send of this chat's reply on its way, or one that did not go (kept by conversation, so it
  // outlives closing the chat).
  const sending = sendFor(item, state.sending[state.key]);
  // While it is on its way the box is read-only, as on the old page: what goes is the text as Send
  // was pressed. It is Jim's again if the send fails, and cleared once it is sent.
  const locked = sendingNow(item, state.sending[state.key]);
  const failedSend = sending && sending.state === 'failed' ? sending : null;
  const action = empty ? null : mainFor({ item, text, checks: live, overridden: state.overridden, sending });
  const { shown: options, more } = messageOptions(item);

  const fill = () => focusFirstBlank(editor.current);
  // Send on Facebook: a blank still in the text sends nothing, and the caret goes to it.
  const send = async () => { if ((await actions.send()) === 'fill') fill(); };
  const run = () => {
    if (!action || action.kind === 'blocked' || action.kind === 'sending') return;
    if (action.kind === 'fill') fill();
    else if (action.kind === 'send') send();
    else actions.copy({});
  };
  // Answered elsewhere, the text kept: no reply is needed, so no copy is the main button. In a reply
  // run Next is, and Ctrl+Enter with it: the run moves on and counts this one as answered elsewhere.
  // Otherwise Ctrl+Enter copies (or goes to a blank) and never sends: Send needs its button.
  const next = boxIsNext(state, view) ? () => actions.skipRun() : null;
  main.current = view.elsewhere ? next : action && action.byKey ? run : null;
  // Copy anyway, or Send anyway on Facebook: the person's own decision. Offered only while no blank
  // is empty, so it copies or sends.
  const anyway = () => {
    actions.override();
    if (facebook) send();
    else actions.copy({});
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
      <${Context} context=${state.context} words=${view.context || typeView(item).reason} />
      ${view.failure ? html`<div class="context bad" role="status"><span>${view.failure}</span>
        <button type="button" class="btn small" disabled=${locked} onClick=${() => actions.write({ instruction: (item.draft && item.draft.instruction) || undefined })}>${failedSend ? 'Write it again' : 'Try again'}</button>
      </div>` : null}
      ${failedSend ? html`<div class="context bad" role="alert"><span>${sendFailedWords(failedSend.error, failedSend.outcome)}</span></div>` : null}
      <div class="box-head">
        <span class="box-label"><b>Suggested reply</b> · not sent</span>
        ${note ? html`<span class=${'save-note' + (state.save.state === 'failed' ? ' bad' : '')}>${note}</span>` : null}
        <span class="count num">${wordsLine(text)}</span>
      </div>
      <${Editor} text=${text} parts=${d ? d.parts : null} onChange=${actions.type} onRemove=${remove} readOnly=${locked}
        bad=${lines.fails.length > 0 && !state.overridden} root=${editor} handle=${reply} />
    </div>
    <div class="box-foot">
      ${empty ? null : html`<div class="checks">
        ${trust ? html`<${Trust} line=${trust} id=${d ? d.id : 'none'} key=${d ? d.id : 'none'} />` : null}
        ${lines.fails.map((m, i) => html`<p class="check bad" key=${'f' + i}><span>${m}</span>
          ${state.overridden || blanks ? null : html`<button type="button" class="btn small" onClick=${anyway}>${facebook ? 'Send anyway' : 'Copy anyway'}</button>`}</p>`)}
        ${[...lines.warns, ...lines.inputs].map((m, i) => html`<p class="check warn" key=${'w' + i}>${m}</p>`)}
      </div>`}
      ${options.length || more.length ? html`<div class="instead"><span>Instead:</span>
        ${options.map((o) => html`<button type="button" class="opt" disabled=${locked} key=${o.id} onClick=${() => actions.instead(o.id)}>${o.label}</button>`)}
        ${more.length && !locked ? html`<${MenuButton} label="More messages" items=${more.map((o) => ({ label: o.label, run: () => actions.instead(o.id) }))} />` : null}
      </div>` : null}
      <div class="foot">
        <${Tell} disabled=${locked} onSend=${(v) => actions.tell(v)} holdTell=${actions.holdTell} button="Rewrite" />
        <div class="right">
          ${empty
            ? (d && d.reply ? html`<button type="button" class="btn" onClick=${bringBack}>Bring back the suggestion</button>` : null)
            : locked ? null : html`<button type="button" class="btn quiet" onClick=${clear}>Clear</button>`}
          ${action && action.secondary ? html`<button type="button" class="btn quiet" onClick=${() => actions.copy({ withBlanks: true })}>${action.secondary}</button>` : null}
          ${action ? html`<button type="button" class=${view.elsewhere ? 'btn' : 'btn main'} disabled=${action.kind === 'blocked' || action.kind === 'sending'}
            title=${view.elsewhere || !action.byKey || action.kind === 'blocked' ? null : action.label + ' (Ctrl+Enter)'} onClick=${run}>${action.label}</button>` : null}
          ${next ? html`<button type="button" class="btn main" title="Next (Ctrl+Enter)" onClick=${next}>Next</button>` : null}
        </div>
      </div>
      <${Note} state=${state} actions=${actions} item=${item} />
      ${d ? html`<${Research} research=${d.research} />` : null}
    </div>
  </div>`;
}

function Box({ state, actions, item, reply }) {
  const editor = useRef(null);
  const main = useRef(null);
  useCtrlEnter(main, editor);
  // sectionBox's view (boxsections.js): the same one the run bar reads.
  const view = boxViewOf(state, Date.now());
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
