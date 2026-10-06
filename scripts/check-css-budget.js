// Keeps the page's stylesheets on the design tokens. Outside web/css/tokens.css, a font size, a
// corner radius, a colour, or a space (padding, margin, gap) must be a token, not a number typed
// on the spot. Prints each offender with its file and line, and fails above the limits.
//
//   node scripts/check-css-budget.js

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'web', 'css');

// How many ad hoc values each kind may have. The goal is zero; a line here is a known exception.
export const LIMITS = { 'font-size': 0, space: 0, radius: 0, colour: 0 };

const SPACE_PROPS = /^(padding|margin|gap|row-gap|column-gap|padding-(top|right|bottom|left|block|inline)|margin-(top|right|bottom|left|block|inline))$/;
const okValue = (v) => /^(0|auto|inherit|initial|unset|none|100%|-?var\(.*\)|calc\(.*\)|clamp\(.*\)|min\(.*\)|max\(.*\)|-?\d+(\.\d+)?%|[-\d.]+px)$/.test(v);

export function checkCssBudget(folder = dir) {
  const offenders = [];
  const files = fs.readdirSync(folder).filter((f) => f.endsWith('.css') && f !== 'tokens.css');
  for (const file of files) {
    const text = fs.readFileSync(path.join(folder, file), 'utf8').replace(/\r/g, '');
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      const where = `${file}:${i + 1}`;
      const clean = line.replace(/\/\*.*?\*\//g, '');
      for (const decl of clean.split(';')) {
        const m = decl.match(/^\s*([a-z-]+)\s*:\s*(.+?)\s*}?\s*$/);
        if (!m) continue;
        const [, prop, value] = m;
        if (prop === 'font-size' && !/^var\(--fs-|^calc\(var\(/.test(value) && !/^(inherit|initial)$/.test(value)) offenders.push({ kind: 'font-size', where, text: decl.trim() });
        if (/^border(-top|-bottom)?(-left|-right)?-radius$/.test(prop) && !/^(0|var\(--r-)/.test(value)) offenders.push({ kind: 'radius', where, text: decl.trim() });
        if (SPACE_PROPS.test(prop)) {
          // A function call, nested or not, counts as one part: the spaces inside it are removed.
          let v = value;
          for (let n = 0; n < 5 && /\((?:[^()]*)\)/.test(v); n++) v = v.replace(/\(([^()]*)\)/g, (s) => s.replace(/\s/g, '').replace(/[()]/g, (c) => (c === '(' ? '\u0001' : '\u0002')));
          const parts = v.replace(/\u0001/g, '(').replace(/\u0002/g, ')').split(/\s+/);
          if (!parts.every(okValue)) offenders.push({ kind: 'space', where, text: decl.trim() });
        }
        if (/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i.test(value)) offenders.push({ kind: 'colour', where, text: decl.trim() });
      }
    });
  }
  const counts = {};
  for (const o of offenders) counts[o.kind] = (counts[o.kind] || 0) + 1;
  const over = Object.entries(LIMITS).filter(([k, limit]) => (counts[k] || 0) > limit);
  return { files, offenders, counts, over };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { files, offenders, counts, over } = checkCssBudget();
  for (const o of offenders) console.log(`  ${o.where}: ${o.kind}: ${o.text}`);
  console.log(`Checked ${files.length} stylesheets. Ad hoc values: ${Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(', ') || 'none'}.`);
  if (over.length) { console.log(`Over the limit: ${over.map(([k, l]) => `${k} (${counts[k]} > ${l})`).join(', ')}. Use a token from web/css/tokens.css.`); process.exit(1); }
  console.log('Every value is on the token scales.');
}
