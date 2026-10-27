// The viewer: a car's photos, auction photos and videos large, over the page, on a dark ground as in
// any photo app. The old page's viewer (web/views/Viewer.js) in the new page's components: a modal
// <dialog> with the groups that have items, the picture or video with its place in the group, a
// filmstrip, and Copy link, Add to reply and Open original. Left and Right move, Home and End jump,
// Escape closes, and the focus goes back to the tile that opened it. An item with shareable: false
// is the supplier's own address: it has Open original and "For you only", and nothing to pass on.
import { html, useState, useEffect, useRef } from './html.js';

const NOUN = { car: 'Photo', auction: 'Auction photo', videos: 'Video' };
const COPIED_FOR = 2000;

/**
 * title: the car's name; groups: [{ id: 'car'|'auction'|'videos', label, items: [{ kind: 'picture'|'video',
 * label, src, poster, link, plainLink, playable, shareable }] }]; group and index: where it opens;
 * opener: the tile to give the focus back to; onCopy(link) returns false when the copy failed;
 * onAdd(item, groupId, link) puts the link in the reply (the viewer has closed by then); onClose().
 */
export function Viewer({ title, groups, group, index, opener, onCopy, onAdd, onClose }) {
  const full = groups.filter((g) => g.items.length);
  const dlg = useRef(null);
  const quiet = useRef(false); // closed by Add to reply: the editor has the focus, not the tile
  const [gid, setGid] = useState(group);
  const [at, setAt] = useState(index || 0);
  const [voice, setVoice] = useState(true); // the voice-over version first, as the website plays it
  const [copied, setCopied] = useState(''); // what the Copy button says for 2 s: Copied, or Could not copy

  const g = full.find((x) => x.id === gid) || full[0];
  const n = g ? g.items.length : 0;
  const i = Math.max(0, Math.min(n - 1, at));
  const it = g ? g.items[i] : null;

  useEffect(() => {
    const d = dlg.current;
    if (!d) return undefined;
    const done = () => {
      onClose();
      if (!quiet.current && opener && opener.isConnected) opener.focus({ preventScroll: true });
    };
    d.addEventListener('close', done);
    d.showModal();
    (d.querySelector('.viewer-nav.next') || d.querySelector('.viewer-close')).focus({ preventScroll: true });
    return () => { d.removeEventListener('close', done); if (d.open) d.close(); };
  }, []);
  useEffect(() => { setCopied(''); }, [gid, i, voice]);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(''), COPIED_FOR);
    return () => clearTimeout(timer);
  }, [copied]);
  useEffect(() => {
    const on = dlg.current && dlg.current.querySelector('.viewer-thumb[aria-current="true"]');
    if (on) on.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [gid, i]);

  if (!it) return null;
  const go = (step) => setAt((i + step + n) % n);
  const pick = (id) => { setGid(id); setAt(0); };
  const link = it.kind === 'video' && !voice && it.plainLink ? it.plainLink : it.link;
  const mine = it.shareable === false;
  const close = () => dlg.current.close();

  const keys = (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.target && e.target.tagName === 'VIDEO') return;
    const to = { ArrowLeft: () => go(-1), ArrowRight: () => go(1), Home: () => setAt(0), End: () => setAt(n - 1) }[e.key];
    if (!to) return;
    e.preventDefault();
    to();
  };
  // A click on the dark ground around the picture closes it, as in any photo app.
  const ground = (e) => { if (e.target === dlg.current || e.target.classList.contains('viewer-stage')) close(); };
  const copy = async () => { setCopied((await onCopy(link)) === false ? 'Could not copy' : 'Copied'); };
  const add = () => { quiet.current = true; close(); onAdd(it, g.id, link); };

  const word = (NOUN[g.id] || 'Item') + ' ' + (i + 1) + ' of ' + n;
  const thumb = (x) => (x.kind === 'video' ? x.poster : x.src);
  return html`<dialog class="viewer" ref=${dlg} aria-label=${title + ', ' + g.label.toLowerCase()} onKeyDown=${keys} onClick=${ground}>
    <header class="viewer-head">
      <h2 class="viewer-title">${title}</h2>
      <div class="viewer-groups" role="group" aria-label="Show">
        ${full.map((x) => html`<button type="button" key=${x.id} class=${'viewer-group' + (x.id === g.id ? ' is-on' : '')} aria-pressed=${x.id === g.id ? 'true' : 'false'}
          onClick=${() => pick(x.id)}>${x.label} <span class="num">${x.items.length}</span></button>`)}
      </div>
      <button type="button" class="btn viewer-close" onClick=${close} title="Close (Esc)">Close</button>
    </header>
    <div class="viewer-stage">
      ${n > 1 ? html`<button type="button" class="viewer-nav prev" aria-label="Previous" title="Previous (left arrow)" onClick=${() => go(-1)}><span aria-hidden="true">‹</span></button>` : null}
      <figure class="viewer-figure">
        ${it.kind === 'video'
          ? it.playable
            ? html`<video key=${link} class="viewer-media" src=${link} poster=${it.poster || null} controls preload="metadata" playsinline aria-label=${it.label}></video>`
            : html`${it.poster ? html`<img class="viewer-media" src=${it.poster} alt=${it.label} />` : null}
                <figcaption class="viewer-note">This video cannot play on this page. Open it to watch.</figcaption>`
          : html`<img key=${it.src} class="viewer-media" src=${it.src} alt=${it.label} decoding="async" />`}
      </figure>
      ${n > 1 ? html`<button type="button" class="viewer-nav next" aria-label="Next" title="Next (right arrow)" onClick=${() => go(1)}><span aria-hidden="true">›</span></button>` : null}
    </div>
    <div class="viewer-bar">
      <p class="viewer-caption" aria-live="polite"><strong>${it.label}</strong> <span>${word}</span></p>
      ${it.kind === 'video' && it.playable && it.plainLink ? html`<div class="viewer-voice" role="group" aria-label="Sound of the video">
        <button type="button" class=${'viewer-group' + (voice ? ' is-on' : '')} aria-pressed=${voice ? 'true' : 'false'} onClick=${() => setVoice(true)}>With voice-over</button>
        <button type="button" class=${'viewer-group' + (!voice ? ' is-on' : '')} aria-pressed=${!voice ? 'true' : 'false'} onClick=${() => setVoice(false)}>Without</button>
      </div>` : null}
      <span class="viewer-grow"></span>
      ${mine ? html`<span class="for-you">For you only</span>` : null}
      ${mine ? null : html`<button type="button" class="btn" onClick=${copy}><span aria-live="polite">${copied || 'Copy link'}</span></button>`}
      ${mine ? null : html`<button type="button" class="btn" title="Put this link in the reply, on its own line, where your cursor was" onClick=${add}>Add to reply</button>`}
      <a class="btn" href=${link} target="_blank" rel="noopener noreferrer">Open original</a>
    </div>
    <ul class="viewer-strip" aria-label=${g.label}>
      ${g.items.map((x, k) => html`<li key=${k}><button type="button" class=${'viewer-thumb' + (k === i ? ' is-on' : '')} aria-label=${NOUN[g.id] + ' ' + (k + 1) + ': ' + x.label}
        aria-current=${k === i ? 'true' : null} onClick=${() => setAt(k)}>
        ${thumb(x) ? html`<img src=${thumb(x)} alt="" loading="lazy" decoding="async" />` : html`<span class="viewer-thumb-none" aria-hidden="true">${x.kind === 'video' ? 'Video' : ''}</span>`}
        ${x.kind === 'video' ? html`<span class="viewer-play" aria-hidden="true">Play</span>` : null}
      </button></li>`)}
    </ul>
  </dialog>`;
}
