// The panel's Car tab: the car's main photo and facts, then its photos, auction photos, videos and
// documents, what comes with it, and when they were read. The old page's Car tab (web/views/CarPanel.js)
// in the new page's components. Every picture comes through Wheelman (/api/vehicles/<stock>/picture/<id>).
// A link with shareable: false is the supplier's own address: it is for Jim only, so it opens and
// says "For you only", with no Copy link and no Add to reply.
import { html, useState, useEffect } from './html.js';
import { money, km, ago, plural } from '../../../lib/format.js';
import { replyLabel } from '../insertlink.js';
import { Viewer } from './viewer.js';

const SHOW = { car: 9, auction: 6 };
const KIND = { pdf: 'PDF', image: 'Picture', album: 'Google Photos album', file: 'File' };
// The availability words keep their colour: green to sell, amber reserved, red sold.
const TONE = { available: 'good', reserved: 'warn', sold: 'bad' };
const READING = 'Reading the photos, videos and documents';
const ADD_TITLE = 'Put this link in the reply, on its own line, where your cursor was';

export const pictureSrc = (stockNo, id) => '/api/vehicles/' + encodeURIComponent(stockNo) + '/picture/' + id;
const cap = (x) => { const w = String(x || '').trim().toLowerCase(); return w ? w[0].toUpperCase() + w.slice(1) : ''; };
const web = (u) => (/^https?:\/\//i.test(String(u || '')) ? u : '');
const outLink = (href, words, cls = 'btn small quiet', label = null) =>
  html`<a class=${cls} href=${href} target="_blank" rel="noopener noreferrer" aria-label=${label}>${words}</a>`;

/** The viewer's groups for a car's media: the same photos and videos the Car tab lists, in the same order. */
export function viewerGroups(stockNo, media) {
  const pic = (p) => ({ kind: 'picture', label: p.label, src: pictureSrc(stockNo, p.id), link: p.link, shareable: p.shareable !== false });
  const photos = media.photos || [];
  return [
    { id: 'car', label: 'Photos', items: photos.filter((p) => p.group === 'car').map(pic) },
    { id: 'auction', label: 'Auction photos', items: photos.filter((p) => p.group === 'auction').map(pic) },
    { id: 'videos', label: 'Videos', items: (media.videos || []).filter((v) => web(v.link)).map((v) => ({
      kind: 'video', label: v.label, link: v.link, plainLink: web(v.plainLink) || '', playable: v.playable, shareable: v.shareable !== false,
      poster: v.poster ? pictureSrc(stockNo, v.poster) : '' })) },
  ];
}

/** Copy link and Add to reply for a link a customer may have; Open and "For you only" for the supplier's. */
function LinkActions({ kind, label, link, shareable, open, act }) {
  if (!shareable) return html`<div class="media-actions">${outLink(link, 'Open', 'btn small')}<span class="for-you">For you only</span></div>`;
  return html`<div class="media-actions">
    ${open ? outLink(link, 'Open') : null}
    <button type="button" class="btn small quiet" onClick=${() => act.copy(link)}>Copy link</button>
    <button type="button" class="btn small" title=${ADD_TITLE} onClick=${() => act.add(replyLabel(kind, label), link)}>Add to reply</button>
  </div>`;
}

/** The main photo with its count, the name, the two lines of facts, the availability and the listing. */
function Top({ car, media, view }) {
  const photos = media.photos ? media.photos.filter((p) => p.group === 'car') : [];
  const auction = media.photos ? media.photos.filter((p) => p.group === 'auction') : [];
  const hero = photos[0] || auction[0];
  const a = car.availability || {};
  const priced = a.code !== 'sold' && car.price;
  const meta = ['Stock ' + car.stockNo, priced ? money(car.price) : '', km(car.odometer)].filter(Boolean).join(' · ');
  const facts = [cap(car.fuel), cap(car.transmission), car.seats ? plural(Number(car.seats), 'seat') : '', cap(car.colour)].filter(Boolean).join(' · ');
  const name = car.title || 'Stock ' + car.stockNo;
  const listing = web(car.url);
  return html`<div class="car-top">
    ${hero
      ? html`<button type="button" class="hero" title="See the photos large" onClick=${(e) => view(photos.length ? 'car' : 'auction', 0, e.currentTarget)}>
          <img src=${pictureSrc(car.stockNo, hero.id)} alt=${'Photo of the ' + name} decoding="async" />
          <span class="hero-count num">${plural(photos.length || auction.length, 'photo')}</span>
        </button>`
      : media.state === 'loading' ? html`<div class="hero loading" role="status" aria-label=${READING}></div>` : null}
    <h3 class="car-name">${name}</h3>
    <p class="car-meta num" title=${priced ? money(car.price) + ', government charges extra' : null}>${meta}</p>
    ${facts ? html`<p class="car-meta">${facts}</p>` : null}
    ${a.text ? html`<p class=${'avail ' + (TONE[a.code] || '')}>${a.text}</p>` : null}
    ${listing ? outLink(listing, 'Open listing', 'btn small') : null}
  </div>`;
}

/** A group of photos: the first few, the last of them a "+N" tile; "See all N" shows every one. */
function PhotoGroup({ id, title, stockNo, photos, show, empty, view }) {
  const shown = photos.slice(0, show);
  const left = photos.length - shown.length;
  const mine = photos.some((p) => p.shareable === false);
  return html`<section class="car-sec">
    <div class="sec-head"><h4>${title}</h4>
      ${left > 0 ? html`<button type="button" class="link-btn" onClick=${(e) => view(id, 0, e.currentTarget)}>See all ${photos.length}</button>` : null}
    </div>
    ${photos.length ? html`<div class="photo-grid">${shown.map((p, i) => {
      const more = left > 0 && i === shown.length - 1;
      return html`<button type="button" class="photo-tile" key=${p.id} onClick=${(e) => view(id, i, e.currentTarget)}
        aria-label=${more ? 'See all ' + photos.length + ' photos' : p.label} title=${more ? null : 'See ' + p.label + ' large'}>
        <img src=${pictureSrc(stockNo, p.id)} alt="" loading="lazy" decoding="async" />
        ${more ? html`<span class="photo-more num" aria-hidden="true">+${left + 1}</span>` : null}
        ${p.shareable === false ? html`<span class="tile-tag" aria-hidden="true">For you only</span>` : null}
      </button>`;
    })}</div>` : html`<p class="fine">${empty}</p>`}
    ${mine ? html`<p class="fine"><span class="for-you">For you only</span> Photos marked this way show our supplier's address: you can open them, but they cannot be copied or added to a reply.</p>` : null}
  </section>`;
}

function Videos({ stockNo, videos, act, view }) {
  const list = videos.filter((v) => web(v.link));
  return html`<section class="car-sec"><h4>Videos</h4>
    ${list.length ? html`<ul class="media-list">${list.map((v, i) => html`<li class="media-row" key=${i}>
      <button type="button" class="poster" aria-label=${'Play ' + v.label} onClick=${(e) => view('videos', i, e.currentTarget)}>
        ${v.poster ? html`<img src=${pictureSrc(stockNo, v.poster)} alt="" loading="lazy" decoding="async" />` : null}
        <span class="play" aria-hidden="true">Play</span>
      </button>
      <div class="media-main">
        <span class="media-name">${v.label}</span>
        <${LinkActions} kind="video" label=${v.label} link=${v.link} shareable=${v.shareable !== false} act=${act} />
      </div>
    </li>`)}</ul>` : html`<p class="fine">No videos of this car on the dashboard yet.</p>`}
  </section>`;
}

function Documents({ documents, act }) {
  const list = documents.filter((d) => web(d.link));
  return html`<section class="car-sec"><h4>Documents</h4>
    ${list.length ? html`<ul class="media-list">${list.map((d) => html`<li class="media-row" key=${d.type}>
      <div class="media-main">
        <span class="media-name">${d.label}</span>
        <span class="media-kind">${KIND[d.kind] || KIND.file}</span>
        <${LinkActions} kind="document" label=${d.label} link=${d.link} shareable=${d.shareable !== false} open act=${act} />
      </div>
    </li>`)}</ul>` : html`<p class="fine">No auction sheet or export certificate on the dashboard for this car yet.</p>`}
  </section>`;
}

/** A sentence, red, with Try again. */
const Problem = ({ text, busy, onRetry }) => html`<div class="car-problem" role="alert">
  <p>${text}</p>
  <button type="button" class="btn small" disabled=${busy} onClick=${onRetry}>Try again</button>
</div>`;

/** The photos, videos and documents, or why they are not there. Older ones stay below a failed read. */
function Media({ car, media, act, view }) {
  const busy = media.state === 'loading';
  if (!media.photos) {
    if (busy || !media.state) return html`<div class="car-sec" role="status" aria-label=${READING}><i class="skel-line"></i><i class="skel-line"></i><i class="skel-line"></i></div>`;
    return html`<${Problem} text=${media.error || 'The photos could not be read just now.'} busy=${busy} onRetry=${act.refresh} />`;
  }
  if (media.stale) return html`<${Problem} text=${media.error} busy=${busy} onRetry=${act.refresh} />`;
  const problem = media.state === 'error' ? media.error + ' These are from earlier.' : media.error;
  return html`
    ${problem ? html`<${Problem} text=${problem} busy=${busy} onRetry=${act.refresh} />` : null}
    <${PhotoGroup} id="car" title="Photos" stockNo=${car.stockNo} photos=${media.photos.filter((p) => p.group === 'car')} show=${SHOW.car} view=${view} empty="No photos of this car on the dashboard yet." />
    ${media.photos.some((p) => p.group === 'auction')
      ? html`<${PhotoGroup} id="auction" title="Auction photos" stockNo=${car.stockNo} photos=${media.photos.filter((p) => p.group === 'auction')} show=${SHOW.auction} view=${view} />`
      : null}
    <${Videos} stockNo=${car.stockNo} videos=${media.videos || []} act=${act} view=${view} />
    <${Documents} documents=${media.documents || []} act=${act} />`;
}

/** No car matched: says so, with what the customer asked about when the conversation says. */
function NoCar({ looking }) {
  const l = looking || {};
  const rows = [
    ['Asking about', l.car], ['Years', l.years], ['Kilometres', l.maxKm ? 'Up to ' + km(l.maxKm) : ''],
    ['Budget', l.budget ? money(l.budget) : ''], ['Auction grade', l.grade ? 'At least ' + l.grade : ''],
  ].filter((r) => r[1]);
  return html`<div class="car-none">
    <p>No car is linked to this conversation.</p>
    ${rows.length ? html`<dl class="asked">${rows.map(([k, v]) => [html`<dt key=${k}>${k}</dt>`, html`<dd key=${k + '='}>${v}</dd>`])}</dl>` : null}
  </div>`;
}

/**
 * car: the car shown (the conversation's, or "Another car"); media: the panel store's media for it;
 * other: the panel store's "Another car"; backTo: the conversation's name, for "Back to <name>";
 * act: { load(stockNo), refresh(), copy(url), add(label, url), back(), retryOther() }.
 */
export function CarTab({ car, media, other, backTo, looking, now, act }) {
  const stock = other ? other.stockNo : car && car.stockNo;
  useEffect(() => { if (stock && (!other || other.state === 'ready')) act.load(String(stock)); }, [stock, other && other.state]);
  // The viewer: where it opens and the tile that opened it, so the focus can go back there.
  const [seen, setSeen] = useState(null);
  const view = (group, index, opener) => setSeen({ group, index, opener });
  const back = other ? html`<div class="car-other">
    <span><b>Another car</b> · Stock ${other.stockNo}</span>
    <button type="button" class="link-btn" onClick=${act.back}>${backTo ? 'Back to ' + backTo : 'Close this car'}</button>
  </div>` : null;
  if (other && other.state === 'loading') return html`${back}<p class="fine" role="status">Opening the car…</p>`;
  if (other && other.state === 'error') return html`${back}<${Problem} text=${other.error} onRetry=${act.retryOther} />`;
  if (!car) return html`<${NoCar} looking=${looking} />`;
  const m = media || {};
  const busy = m.state === 'loading';
  const included = car.included || [];
  return html`${back}
    <${Top} car=${car} media=${m} view=${view} />
    <${Media} car=${car} media=${m} act=${act} view=${view} />
    ${seen && m.photos ? html`<${Viewer} title=${car.title || 'Stock ' + car.stockNo} groups=${viewerGroups(car.stockNo, m)} group=${seen.group}
      index=${seen.index} opener=${seen.opener} onClose=${() => setSeen(null)} onCopy=${act.copy}
      onAdd=${(it, from, url) => act.add(replyLabel(it.kind === 'video' ? 'video' : from === 'auction' ? 'auction' : 'picture', it.label), url)} />` : null}
    ${included.length ? html`<section class="car-sec"><h4>Included with this car</h4>
      <ul class="included">${included.map((x, i) => html`<li key=${i}>${x}</li>`)}</ul>
    </section>` : null}
    ${m.readAt ? html`<p class="car-read">Read from the dashboard ${ago(m.readAt, now)}.
      <button type="button" class="link-btn" disabled=${busy} onClick=${act.refresh}>${busy ? 'Reading…' : 'Read again'}</button>
    </p>` : null}`;
}
