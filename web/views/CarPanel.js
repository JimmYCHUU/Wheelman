// The Car tab of the panel on the right: the car's main photo, its photos, auction photos, videos
// and documents, each with Copy link and Add to reply, and the facts about it. Every picture comes
// through Wheelman (/api/vehicles/:stock/picture/:n); videos play from Carbarn's own storage.
import { h } from '../lib/h.js';
import { icon } from '../lib/icons.js';
import { t } from '../lib/copy.js';
import { money, km, ago } from '../lib/format.js';
import { Skeleton } from '../components/skeleton.js';

const SHOW = { car: 9, auction: 6 };

/** Where the page loads a car's picture from. */
export const pictureSrc = (stockNo, id) => `/api/vehicles/${encodeURIComponent(stockNo)}/picture/${id}`;

/** The groups the viewer shows for a car, from its media. */
export function viewerGroups(stockNo, media) {
  const pic = (p) => ({ kind: 'picture', label: p.label, src: pictureSrc(stockNo, p.id), link: p.link, words: p.group === 'auction' ? t('car.auction') : t('car.photos') });
  return [
    { id: 'car', label: t('car.photos'), items: media.photos.filter((p) => p.group === 'car').map(pic) },
    { id: 'auction', label: t('car.auction'), items: media.photos.filter((p) => p.group === 'auction').map(pic) },
    { id: 'videos', label: t('car.videos'), items: media.videos.map((v) => ({ kind: 'video', label: v.label, link: v.link, plainLink: v.plainLink, playable: v.playable, poster: v.poster ? pictureSrc(stockNo, v.poster) : '' })) },
  ];
}

/** What a link is called when it goes into a reply: "Walkaround 360 video", "Front photo", "Auction sheet". */
export function replyLabel(kind, label) {
  if (kind === 'video') return /video/i.test(label) ? label : `${label} video`;
  if (kind === 'auction') return 'Auction photo';
  if (kind === 'picture') return `${String(label).replace(/\s+\d+$/, '')} photo`;
  return label;
}

const actionsFor = (label, link, act, extra = null) => h('div', { class: 'media-actions' },
  extra,
  h('button', { class: 'mini-btn', type: 'button', onclick: () => act.copy(link) }, icon('link'), t('car.copyLink')),
  h('button', { class: 'mini-btn', type: 'button', title: t('car.addToReply.title'), onclick: () => act.add(label, link) }, icon('plus'), t('car.addToReply')));

/** One grid of photos: the first `n`, then a "+N" tile that opens the viewer on the rest. */
function grid(stockNo, photos, group, n, act) {
  const shown = photos.slice(0, n);
  const left = photos.length - shown.length;
  return h('div', { class: 'photo-grid' }, shown.map((p, i) => {
    const last = left > 0 && i === shown.length - 1;
    return h('button', { class: 'photo-tile', type: 'button', 'aria-label': last ? t('car.moreLabel', { n: photos.length }) : t('car.openPhoto', { label: p.label }), title: p.label, onclick: () => act.view(group, i) },
      h('img', { src: pictureSrc(stockNo, p.id), alt: '', loading: 'lazy', decoding: 'async' }),
      last ? h('span', { class: 'photo-more', text: t('car.more', { n: left + 1 }) }) : null);
  }));
}

/**
 * The Car tab. car: the car as the page knows it (title, stockNo, price, odometer, availability,
 * url, fuel, transmission, seats, colour, included). media: { status: 'loading'|'ready'|'error',
 * data, error }. other: { backTo } when the car was opened with Find a car. act: { view(group,
 * index), copy(link), add(label, link), refresh(), back(), close() }.
 */
export function CarTab({ car, media, other, act }) {
  if (!car) return h('div', { class: 'car-tab' }, h('p', { class: 'car-empty', text: t('car.none.match') }));
  const data = media?.status === 'ready' || media?.data ? media.data : null;
  const photos = data ? data.photos.filter((p) => p.group === 'car') : [];
  const auction = data ? data.photos.filter((p) => p.group === 'auction') : [];
  const hero = photos[0] || auction[0] || null;
  const a = car.availability || {};
  const cap = (x) => { const w = String(x || '').trim().toLowerCase(); return w ? w[0].toUpperCase() + w.slice(1) : ''; };
  const facts = [cap(car.fuel), cap(car.transmission), car.seats ? t('car.seats', { n: car.seats }) : '', cap(car.colour)].filter(Boolean);

  const head = [
    other ? h('div', { class: 'car-other' },
      h('span', {}, h('strong', { text: t('car.another') }), ' · ', t('car.stock', { stock: car.stockNo })),
      h('button', { class: 'link-btn', type: 'button', onclick: act.back }, other.backTo ? t('car.backTo', { name: other.backTo }) : t('car.close'))) : null,
    hero
      ? h('button', { class: 'car-hero', type: 'button', 'aria-label': t('car.openPhoto', { label: hero.label }), onclick: () => act.view(photos[0] ? 'car' : 'auction', 0) },
        h('img', { src: pictureSrc(car.stockNo, hero.id), alt: '', decoding: 'async' }),
        // The count of the group the main photo opens, the same number "See all" gives under it.
        h('span', { class: 'car-hero-count' }, icon('image'), t('car.n.photos', { n: photos.length || auction.length })))
      : media?.status === 'loading' ? h('div', { class: 'car-hero is-loading', role: 'status', 'aria-label': t('car.loading') }) : null,
    h('div', { class: 'car-headline' },
      h('h3', { text: car.title || t('car.stock', { stock: car.stockNo }) }),
      // Two short lines with the same separator: which car and what it costs, then what kind of car
      // it is. The advertised price excludes government charges; it says so when pointed at.
      h('p', { class: 'car-meta', title: a.code !== 'sold' && car.price ? t('car.price', { price: money(car.price) }) : null,
        text: [t('car.stock', { stock: car.stockNo }), a.code !== 'sold' && car.price ? money(car.price) : '', car.odometer ? km(car.odometer) : ''].filter(Boolean).join(' · ') }),
      facts.length ? h('p', { class: 'car-meta', text: facts.join(' · ') }) : null,
      h('p', { class: `avail ${a.code || 'unknown'}`, text: a.text || '' }),
      car.url ? h('a', { class: 'car-listing', href: car.url, target: '_blank', rel: 'noopener noreferrer' }, t('car.openListing'), icon('external')) : null),
  ];

  let body;
  if (!data && media?.status === 'loading') {
    body = [h('section', { class: 'car-sec' }, h('h4', { text: t('car.photos') }), Skeleton({ kind: 'lines', n: 3, label: t('car.loading') }))];
  } else if (data?.stale) {
    // A car stored before Wheelman kept chassis numbers: nothing can be read for it until the next check.
    body = [h('section', { class: 'car-sec' }, h('p', { class: 'car-error' }, icon('alert'), h('span', { text: data.error })))];
  } else if (!data) {
    body = [h('section', { class: 'car-sec' }, h('p', { class: 'car-error' }, icon('alert'), h('span', { text: media?.error || t('car.error') })),
      h('button', { class: 'btn outline', type: 'button', onclick: act.refresh }, icon('refresh'), t('car.tryAgain')))];
  } else {
    body = [
      data.error ? h('p', { class: 'car-error' }, icon('alert'), h('span', { text: data.error })) : null,
      h('section', { class: 'car-sec' },
        h('div', { class: 'car-sec-head' }, h('h4', { text: t('car.photos') }), photos.length > SHOW.car ? h('button', { class: 'link-btn', type: 'button', onclick: () => act.view('car', 0) }, t('car.seeAll', { n: photos.length })) : null),
        photos.length ? grid(car.stockNo, photos, 'car', SHOW.car, act) : h('p', { class: 'fine', text: t('car.none.photos') })),
      auction.length ? h('section', { class: 'car-sec' },
        h('div', { class: 'car-sec-head' }, h('h4', { text: t('car.auction') }), auction.length > SHOW.auction ? h('button', { class: 'link-btn', type: 'button', onclick: () => act.view('auction', 0) }, t('car.seeAll', { n: auction.length })) : null),
        grid(car.stockNo, auction, 'auction', SHOW.auction, act)) : null,
      h('section', { class: 'car-sec' },
        h('h4', { text: t('car.videos') }),
        data.videos.length ? h('ul', { class: 'media-list' }, data.videos.map((v, i) => h('li', { class: 'media-row' },
          h('button', { class: 'poster', type: 'button', 'aria-label': t('car.play', { label: v.label }), onclick: () => act.view('videos', i) },
            v.poster ? h('img', { src: pictureSrc(car.stockNo, v.poster), alt: '', loading: 'lazy' }) : null,
            h('span', { class: 'play-disc' }, icon('play'))),
          h('div', { class: 'media-main' },
            h('button', { class: 'media-name', type: 'button', onclick: () => act.view('videos', i), text: v.label }),
            actionsFor(replyLabel('video', v.label), v.link, act))))) : h('p', { class: 'fine', text: t('car.none.videos') })),
      h('section', { class: 'car-sec' },
        h('h4', { text: t('car.documents') }),
        data.documents.length ? h('ul', { class: 'media-list' }, data.documents.map((d) => h('li', { class: 'media-row doc' },
          h('span', { class: 'doc-icon' }, icon(d.kind === 'album' ? 'album' : d.kind === 'image' ? 'image' : 'file')),
          h('div', { class: 'media-main' },
            h('a', { class: 'media-name', href: d.link, target: '_blank', rel: 'noopener noreferrer' }, d.label),
            h('span', { class: 'media-kind', text: t(`car.kind.${d.kind}`) }),
            actionsFor(d.label, d.link, act, h('a', { class: 'mini-btn', href: d.link, target: '_blank', rel: 'noopener noreferrer' }, icon('external'), t('car.open'))))))) : h('p', { class: 'fine', text: t('car.none.documents') })),
    ];
  }

  // What comes with the car, as the dashboard lists it. The other facts are in the line under its name.
  const about = car.included?.length ? h('section', { class: 'car-sec' },
    h('h4', { text: t('car.included') }),
    h('ul', { class: 'facts' }, car.included.map((x) => h('li', { text: x })))) : null;

  const foot = data?.readAt ? h('p', { class: 'car-read fine' }, t('car.read', { ago: ago(data.readAt) }), ' ', h('button', { class: 'link-btn', type: 'button', onclick: act.refresh }, t('car.refresh'))) : null;
  return h('div', { class: 'car-tab' }, head, body, about, foot);
}
