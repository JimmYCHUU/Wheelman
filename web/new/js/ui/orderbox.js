// The message picker and an auction order's paste box. The picker is the Instead line, the messages
// that fit with the one in the box left out, and every other one behind More messages
// (web/new/js/messages.js): an order's own messages for an order, a conversation's for any other.
// The paste box adds what the customer wrote on WhatsApp (Wheelman cannot read WhatsApp), or what
// we sent by hand, to the order. Nothing is sent from here.
import { html, useState, useRef, useEffect } from './html.js';
import { messageOptions } from '../messages.js';
import { MenuButton } from './menu.js';

/**
 * The Instead line, with More messages; none when there is nothing else to write. locked: while
 * the reply is sending. extra: one more control at the end of the line (an order's Paste button).
 */
export function Picker({ item, actions, locked = false, extra = null }) {
  const { shown, more } = messageOptions(item);
  if (!shown.length && !more.length && !extra) return null;
  return html`<div class="instead">${shown.length || more.length ? html`<span>Instead:</span>` : null}
    ${shown.map((o) => html`<button type="button" class="opt" disabled=${locked} key=${o.id} onClick=${() => actions.instead(o.id)}>${o.label}</button>`)}
    ${more.length && !locked ? html`<${MenuButton} label="More messages" items=${more.map((o) => ({ label: o.label, run: () => actions.instead(o.id) }))} />` : null}
    ${extra}
  </div>`;
}

/**
 * The paste box's state, held by the message box so that a paste on its way (while the box reads
 * Writing…) keeps its text. paste(direction, text) is the store's: true once the paste is in, and
 * the box then closes and empties; otherwise the text stays. Opened, the focus goes into the box;
 * cancelled, back to the button that opened it.
 */
export function usePaste(paste) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const area = useRef(null);
  const opener = useRef(null);
  const back = useRef(false);
  useEffect(() => {
    if (open && area.current) area.current.focus();
    else if (!open && back.current && opener.current) opener.current.focus();
    back.current = false;
  }, [open]);
  const send = async (direction) => {
    if (busy) return;
    setBusy(true);
    let taken = false;
    try { taken = await paste(direction, text); } finally { setBusy(false); }
    if (taken) { setText(''); setOpen(false); }
  };
  const show = () => setOpen(true);
  const cancel = () => { back.current = true; setText(''); setOpen(false); };
  return { open, text, busy, area, opener, setText, send, show, cancel };
}

/** "Paste what they wrote", the button that opens the paste box; none while it is open. */
export function PasteButton({ paste }) {
  if (paste.open) return null;
  return html`<button type="button" class="btn small quiet paste-open" ref=${paste.opener} onClick=${paste.show}
    title="Paste what the customer wrote on WhatsApp, or type what they said on the phone. Wheelman then suggests a reply.">Paste what they wrote</button>`;
}

/** The paste box itself, once opened: They wrote this, We sent this and Cancel. */
export function PasteBox({ paste }) {
  if (!paste.open) return null;
  return html`<div class="paste" role="group" aria-label="Paste what they wrote">
    <textarea ref=${paste.area} rows="3" value=${paste.text} readOnly=${paste.busy} placeholder="Paste what the customer wrote on WhatsApp, or type what they said"
      aria-label="What the customer wrote" onInput=${(e) => paste.setText(e.currentTarget.value)}></textarea>
    <div class="paste-foot">
      <p class="fine">Nothing is sent. It is added to this order so the reply knows what was said.</p>
      <div class="right">
        <button type="button" class="btn quiet" onClick=${paste.cancel}>Cancel</button>
        <button type="button" class="btn" disabled=${paste.busy} title="Add a message we sent by hand, so the conversation here stays true. No reply is written."
          onClick=${() => paste.send('out')}>We sent this</button>
        <button type="button" class="btn main" disabled=${paste.busy} onClick=${() => paste.send('in')}>They wrote this</button>
      </div>
    </div>
  </div>`;
}
