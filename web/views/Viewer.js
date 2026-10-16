// The viewer: a car's photos and videos large, over the page, on a dark ground as in any photo app.
// Groups (Photos, Auction photos, Videos) as tabs, the picture or video in the middle with its name
// and place in the group, a filmstrip, and the same actions as the panel: Copy link, Add to reply,
// Open original. Arrow keys move, Home and End jump, Escape closes (the dialog's own).
import { h, put } from '../lib/h.js';
import { icon } from '../lib/icons.js';
import { t } from '../lib/copy.js';
import { Segmented } from '../components/segmented.js';

let dialog = null;

/**
 * openViewer({ title, groups: [{ id, label, items: [{ kind: 'picture'|'video', label, src, poster,
 * link, plainLink, playable }] }], group, index, onCopy(link, { quiet }), onAdd(label, link, groupId) })
 */
export function openViewer(opts) {
  const groups = opts.groups.filter((g) => g.items.length);
  if (!groups.length) return;
  let group = groups.find((g) => g.id === opts.group) || groups[0];
  let index = Math.max(0, Math.min(group.items.length - 1, opts.index || 0));
  let voice = true; // the voice-over version first, as the website plays it

  dialog?.remove();
  dialog = h('dialog', { class: 'viewer', 'aria-label': t('viewer.label', { title: opts.title }) });
  const tabs = Segmented({ items: [], value: group.id, label: t('viewer.label', { title: opts.title }), kind: 'tabs', onChange: (id) => { group = groups.find((g) => g.id === id) || group; index = 0; paint(); } });
  tabs.classList.add('viewer-groups');
  const stage = h('figure', { class: 'viewer-figure' });
  const caption = h('p', { class: 'viewer-caption', 'aria-live': 'polite' });
  const extras = h('div', { class: 'viewer-extras' });
  const strip = h('div', { class: 'viewer-strip', role: 'list' });
  const prev = h('button', { class: 'viewer-nav prev', type: 'button', 'aria-label': t('viewer.prev'), title: `${t('viewer.prev')} (←)`, onclick: () => go(-1) }, icon('prev'));
  const next = h('button', { class: 'viewer-nav next', type: 'button', 'aria-label': t('viewer.next'), title: `${t('viewer.next')} (→)`, onclick: () => go(1) }, icon('next'));
  // The page's toast would sit behind the viewer: Copy link says Copied on the button itself, and
  // Add to reply closes the viewer so the link is seen arriving in the reply.
  const copyWords = h('span', { text: t('car.copyLink') });
  let copied = null;
  const copyBtn = h('button', { class: 'btn viewer-btn', type: 'button', onclick: async () => {
    const ok = await opts.onCopy(shownLink(), { quiet: true });
    copyWords.textContent = ok === false ? t('car.copyLink') : t('viewer.copied');
    clearTimeout(copied); copied = setTimeout(() => { copyWords.textContent = t('car.copyLink'); }, 1600);
  } }, icon('link'), copyWords);
  const addBtn = h('button', { class: 'btn viewer-btn', type: 'button', title: t('car.addToReply.title'), onclick: () => { const it = current(); const link = shownLink(); const from = group.id; dialog.close(); opts.onAdd(it.label, link, from); } }, icon('plus'), t('car.addToReply'));
  const openLink = h('a', { class: 'btn viewer-btn', target: '_blank', rel: 'noopener noreferrer' }, icon('external'), t('viewer.openOriginal'));

  dialog.append(
    h('header', { class: 'viewer-head' },
      h('h2', { class: 'viewer-title', text: opts.title }),
      tabs,
      h('button', { class: 'icon-btn viewer-close', type: 'button', 'aria-label': t('viewer.close'), title: `${t('viewer.close')} (Esc)`, onclick: () => dialog.close() }, icon('x'))),
    h('div', { class: 'viewer-stage' }, prev, stage, next),
    h('div', { class: 'viewer-bar' }, caption, extras, h('span', { class: 'u-grow' }), copyBtn, addBtn, openLink),
    strip);

  const current = () => group.items[index];
  // The link of what is on screen: a video's version without the voice-over when that one is chosen.
  const shownLink = () => { const it = current(); return it.kind === 'video' && !voice && it.plainLink ? it.plainLink : it.link; };
  function go(step) { index = (index + step + group.items.length) % group.items.length; paint(); }

  function paint() {
    tabs.update({ items: groups.map((g) => ({ id: g.id, label: `${g.label} ${g.items.length}` })), value: group.id });
    const it = current();
    // A video that was playing stops when another item is shown.
    stage.querySelector('video')?.pause();
    if (it.kind === 'video') {
      if (it.playable) {
        const src = voice || !it.plainLink ? it.link : it.plainLink;
        stage.replaceChildren(h('video', { class: 'viewer-media', src, poster: it.poster || null, controls: true, preload: 'metadata', playsinline: true, 'aria-label': it.label }));
      } else {
        stage.replaceChildren();
        put(stage, it.poster ? h('img', { class: 'viewer-media', src: it.poster, alt: it.label }) : null, h('figcaption', { class: 'viewer-note', text: t('viewer.notHere') }));
      }
    } else {
      stage.replaceChildren(h('img', { class: 'viewer-media', src: it.src, alt: it.label, decoding: 'async' }));
    }
    caption.replaceChildren(h('strong', { text: it.label }), h('span', { text: t('viewer.of', { n: index + 1, total: group.items.length }) }));
    // With or without the voice-over, for a video that has both.
    extras.replaceChildren();
    if (it.kind === 'video' && it.playable && it.plainLink) {
      const pick = (v) => { voice = v; paint(); };
      extras.append(h('div', { class: 'viewer-voice', role: 'group', 'aria-label': t('viewer.voiceLabel') },
        h('button', { class: `filter ${voice ? 'is-on' : ''}`.trim(), type: 'button', 'aria-pressed': voice ? 'true' : 'false', onclick: () => pick(true) }, t('viewer.voice')),
        h('button', { class: `filter ${!voice ? 'is-on' : ''}`.trim(), type: 'button', 'aria-pressed': !voice ? 'true' : 'false', onclick: () => pick(false) }, t('viewer.plain'))));
    }
    openLink.href = shownLink();
    prev.hidden = next.hidden = group.items.length < 2;
    strip.replaceChildren(...group.items.map((x, i) => h('button', {
      class: `viewer-thumb ${i === index ? 'is-on' : ''}`.trim(), type: 'button', role: 'listitem', 'aria-label': x.label, 'aria-current': i === index ? 'true' : null,
      onclick: () => { index = i; paint(); },
    }, (x.kind === 'video' ? x.poster : x.src) ? h('img', { src: x.kind === 'video' ? x.poster : x.src, alt: '', loading: 'lazy' }) : h('span', { class: 'viewer-thumb-none' }, icon('play')),
    x.kind === 'video' ? h('span', { class: 'play-disc small' }, icon('play')) : null)));
    strip.children[index]?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  dialog.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA', 'VIDEO'].includes(document.activeElement?.tagName) && e.key !== 'Escape') return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    else if (e.key === 'Home') { e.preventDefault(); index = 0; paint(); }
    else if (e.key === 'End') { e.preventDefault(); index = group.items.length - 1; paint(); }
  });
  // A click on the dark ground around the picture closes it, as in any photo app.
  dialog.addEventListener('click', (e) => { if (e.target === dialog || e.target.classList.contains('viewer-stage')) dialog.close(); });
  dialog.addEventListener('close', () => { stage.querySelector('video')?.pause(); dialog.remove(); dialog = null; });
  document.body.append(dialog);
  paint();
  dialog.showModal();
  (group.items.length > 1 ? next : dialog.querySelector('.viewer-close')).focus({ preventScroll: true });
}
