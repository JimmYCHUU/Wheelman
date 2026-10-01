// Saves a text copy of Carbarn's public policy pages into knowledge/website/.
// Run again whenever the website changes: npm run fetch-website

import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/config.js';

const PAGES = [
  'faq', 'warranty', 'finance', 'how-it-works', 'importing', 'how-importing-works',
  'how-compliance-works', 'live-auction', 'terms-and-conditions', 'about', 'contact', 'delivery/brisbane',
];

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', bull: '•', middot: '·', copy: '©' };
const decode = (s) => s
  .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d)))
  .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);

export function htmlToText(html) {
  let h = html;
  // Pages can hold several nested <main> blocks; take everything from the first to the last.
  const start = h.search(/<main[\s>]/i);
  const end = h.toLowerCase().lastIndexOf('</main>');
  if (start !== -1 && end > start) h = h.slice(start, end + 7);
  h = h.replace(/<(script|style|noscript|svg|template|iframe|select)[\s\S]*?<\/\1>/gi, ' ');
  // FAQ questions sit inside accordion buttons: keep their words as headings.
  h = h.replace(/<button[^>]*>/gi, '\n\n### ').replace(/<\/button>/gi, '\n\n');
  h = h.replace(/<(nav|footer|header)[\s\S]*?<\/\1>/gi, ' ');
  h = h.replace(/<!--[\s\S]*?-->/g, ' ');
  h = h.replace(/<h1[^>]*>/gi, '\n\n# ').replace(/<h2[^>]*>/gi, '\n\n## ').replace(/<h[3-6][^>]*>/gi, '\n\n### ');
  h = h.replace(/<\/h[1-6]>/gi, '\n\n');
  h = h.replace(/<li[^>]*>/gi, '\n- ').replace(/<\/(li|ul|ol)>/gi, '\n');
  h = h.replace(/<(br|hr)\s*\/?>/gi, '\n');
  h = h.replace(/<\/(p|div|section|article|tr|table|summary|details|dd|dt)>/gi, '\n');
  h = h.replace(/<\/(td|th)>/gi, ' | ');
  h = h.replace(/<[^>]+>/g, ' ');
  h = decode(h);
  const lines = h.split('\n').map((l) => l.replace(/[ \t ]+/g, ' ').trim());
  const out = [];
  for (const l of lines) {
    if (!l || l === '-' || l === '|') { if (out[out.length - 1] !== '') out.push(''); continue; }
    if (out[out.length - 1] === l) continue; // repeated mobile/desktop copies
    out.push(l);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

const dir = path.join(config.knowledgeDir, 'website');
fs.mkdirSync(dir, { recursive: true });

// "npm run fetch-website" saves the policy pages.
// "npm run fetch-website -- --all" also saves every guide, blog post and import model page listed in the site map.
const all = process.argv.includes('--all');
let pages = PAGES.map((p) => ({ path: p, folder: '' }));

if (all) {
  const res = await fetch(`${config.site.baseUrl}/sitemap.xml`, { signal: AbortSignal.timeout(30000) });
  const xml = await res.text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname.replace(/^\/+|\/+$/g, ''));
  const seen = new Set(PAGES);
  for (const p of urls) {
    if (!p || seen.has(p)) continue;
    seen.add(p);
    const top = p.split('/')[0];
    if (top === 'vehicles') continue; // stock comes from the dashboard, which is always current
    const folder = p.includes('/') ? top : '';
    pages.push({ path: p, folder });
  }
}

// Guides and stock pages first, the long list of import model pages last.
const rank = (p) => (!p.folder ? 0 : p.folder === 'delivery' ? 1 : p.folder === 'used-cars' ? 2 : p.folder === 'blog' ? 3 : 4);
pages.sort((a, b) => rank(a) - rank(b));

let ok = 0, n = 0, next = 0;
async function saveOne(page) {
  const url = `${config.site.baseUrl}/${page.path}`;
  const outDir = page.folder ? path.join(dir, page.folder) : dir;
  const name = (page.folder ? page.path.slice(page.folder.length + 1) : page.path).replace(/\//g, '-') + '.md';
  const file = path.join(outDir, name);
  if (all && page.folder && fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < 7 * 24 * 3600 * 1000) { ok++; return; } // saved this week
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'Wheelman/0.2 (Carbarn internal knowledge snapshot)' }, signal: AbortSignal.timeout(45000) });
    if (!res.ok) { console.log(`  skipped ${page.path}: HTTP ${res.status}`); return; }
    const text = htmlToText(await res.text());
    if (text.length < 200) { console.log(`  skipped ${page.path}: page had no readable text`); return; }
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(file, `<!-- source: ${url} | saved: ${new Date().toISOString().slice(0, 10)} -->\n\n${text}\n`);
    ok++;
    if (!all) console.log(`  saved ${page.path} (${text.split(/\s+/).length} words)`);
  } catch (e) {
    console.log(`  skipped ${page.path}: ${e.message}`);
  }
}
// A few pages at a time: quick, without leaning on the website.
async function worker() {
  while (next < pages.length) {
    const page = pages[next++];
    await saveOne(page);
    n++;
    if (all && n % 50 === 0) console.log(`  ${n} of ${pages.length} pages done`);
    await new Promise((r) => setTimeout(r, all ? 150 : 600));
  }
}
await Promise.all(Array.from({ length: all ? 5 : 1 }, worker));
console.log(`\n${ok} of ${pages.length} pages saved to knowledge/website/`);
