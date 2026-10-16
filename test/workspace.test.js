// The redesigned page's own rules, without a browser: where Add to reply puts a link, what a link
// is called in a reply, the few words of the status in the top bar, and the viewer's groups.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkLine, placeLine } from '../web/lib/insert.js';
import { replyLabel, viewerGroups, pictureSrc } from '../web/views/CarPanel.js';
import { statusWords } from '../web/views/TopBar.js';
import { t, COPY } from '../web/lib/copy.js';

const put = (text, line, caret) => { const { at, insert } = placeLine(text, line, caret); return text.slice(0, at) + insert + text.slice(at); };

test('Add to reply puts the link on a line of its own: at the cursor, else before the sign-off or the standard block', () => {
  const link = linkLine('Walkaround 360 video', 'https://videos.example/walk.mp4');
  assert.equal(link, 'Walkaround 360 video: https://videos.example/walk.mp4');
  assert.equal(linkLine('', 'https://x.example/a'), 'https://x.example/a');
  // No cursor: before "Regards," (the sign-off), keeping the blank line above it.
  assert.equal(put('Hello Tom,\nYes, it is here.\n\nRegards,\nTeam Carbarn', link), `Hello Tom,\nYes, it is here.\n${link}\n\nRegards,\nTeam Carbarn`);
  // No cursor: before the standard block.
  assert.equal(put('Hello Priya,\nThank you.\n\nVehicle details:\nhttps://site.example/car', link), `Hello Priya,\nThank you.\n${link}\n\nVehicle details:\nhttps://site.example/car`);
  // No sign-off at all: at the end, after any trailing space.
  assert.equal(put('Yes, it is here.  ', link), `Yes, it is here.\n${link}  `);
  // A cursor in the middle of a line: the line is split around the link.
  assert.equal(put('Yes it is here.', link, 4), `Yes \n${link}\nit is here.`);
  // A cursor at the start of a line: no empty line is added.
  assert.equal(put('One\nTwo', link, 4), `One\n${link}\nTwo`);
  // An empty box: just the line.
  assert.equal(put('', link), link);
});

test('a link in a reply says what it is', () => {
  assert.equal(replyLabel('video', 'Walkaround 360'), 'Walkaround 360 video');
  assert.equal(replyLabel('video', 'Engine Bay video'), 'Engine Bay video');
  assert.equal(replyLabel('picture', 'Front 2'), 'Front photo');
  assert.equal(replyLabel('auction', 'Auction photo 4'), 'Auction photo');
  assert.equal(replyLabel('document', 'Export certificate'), 'Export certificate');
});

test('the viewer shows the photos, the auction photos and the videos, every picture through Wheelman', () => {
  const media = {
    photos: [{ id: '0', group: 'car', label: 'Front', link: 'https://pics.example/f.jpg' }, { id: '1', group: 'auction', label: 'Auction photo 1', link: 'https://pics.example/a.jpg', shareable: false }],
    videos: [{ label: 'Walkaround 360', link: 'https://videos.example/v.mp4', plainLink: 'https://videos.example/p.mp4', poster: '2', playable: true }],
    documents: [],
  };
  const groups = viewerGroups('T07', media);
  assert.deepEqual(groups.map((g) => [g.id, g.items.length]), [['car', 1], ['auction', 1], ['videos', 1]]);
  assert.equal(groups[0].items[0].src, '/api/vehicles/T07/picture/0');
  assert.equal(groups[0].items[0].link, 'https://pics.example/f.jpg', 'Copy link gives the public address');
  assert.deepEqual([groups[0].items[0].shareable, groups[1].items[0].shareable], [true, false], 'a supplier picture has no Copy link or Add to reply');
  assert.equal(groups[2].items[0].poster, pictureSrc('T07', '2'));
  assert.equal(pictureSrc('A B', '3'), '/api/vehicles/A%20B/picture/3');
});

test('the status in the top bar is a few words; the whole story is in the panel', () => {
  const at = Date.now() - 60e3;
  const s = { lastSync: { ok: true, at }, syncing: false, drafting: false, ai: { usedToday: 3, limit: 200, providers: [{ model: 'model-a' }] }, marketplace: {}, phone: null, alerts: null };
  const ok = statusWords(s, 'dashboard');
  assert.equal(ok.short, 'Up to date');
  assert.equal(ok.dot, 'ok');
  assert.match(ok.parts[0], /Dashboard checked/);
  assert.equal(ok.parts[1], '3 of 200 AI requests used today');
  assert.deepEqual(ok.models, ['model-a']);
  assert.equal(statusWords({ ...s, lastSync: { ok: false, at } }, 'dashboard').short, 'Dashboard not reached');
  assert.equal(statusWords({ ...s, syncing: true }, 'dashboard').short, 'Checking');
  assert.equal(statusWords(null, 'dashboard').short, 'Not responding');
});

test('every word the new parts use is in the copy table', () => {
  for (const key of ['find.placeholder', 'find.none', 'panel.tab.car', 'panel.tab.customer', 'car.copyLink', 'car.addToReply', 'car.none.photos', 'car.none.videos', 'car.none.documents', 'viewer.openOriginal', 'viewer.voice', 'toast.noReply', 'status.short.ok', 'welcome.findCar']) {
    assert.ok(COPY[key], key);
  }
  assert.equal(t('car.count.photos', { n: 1 }), 'photo');
  assert.equal(t('car.count.photos', { n: 45 }), 'photos');
  // The settled words still hold: links say Open, nothing says the page sends.
  assert.ok(!Object.values(COPY).some((v) => /\bSend:|the agent\b/.test(v)));
});
