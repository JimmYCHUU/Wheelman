// Full against compact, over the cases both styles answered: the numbers and the gate.

// The ceiling is the pass/fail line; the target is for information only.
export const MAX_COMPACT_MEDIAN_TOKENS_IN = 6000;
export const TARGET_COMPACT_MEDIAN_TOKENS_IN = 4000;
export const MAX_MEDIAN_DROP = 0.02;
export const CLOSE80_TOLERANCE = 0.03;

const median = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const share = (a, test) => (a.length ? a.filter(test).length / a.length : 0);

function styleStats(rows) {
  return {
    n: rows.length,
    medianSimilarity: median(rows.map((r) => r.similarity)),
    close80: share(rows, (r) => r.similarity >= 0.8),
    near95: share(rows, (r) => r.similarity >= 0.95),
    failRate: share(rows, (r) => r.worst === 'fail'),
    // Failed drafts carry no tokens; they must not make the ceiling easier to pass.
    medianTokensIn: median(rows.filter((r) => !r.error).map((r) => r.tokensIn)),
  };
}

/** Only cases present in both styles count toward the comparison and the gate. */
export function pairStats(results) {
  const by = { full: new Map(), compact: new Map() };
  for (const r of results) if (by[r.style]) by[r.style].set(r.key, r);
  const keys = [...by.full.keys()].filter((k) => by.compact.has(k));
  const full = styleStats(keys.map((k) => by.full.get(k)));
  const compact = styleStats(keys.map((k) => by.compact.get(k)));
  const reasons = [];
  if (!keys.length) reasons.push('no case was answered in both styles');
  else {
    const f2 = (n) => n.toFixed(2);
    const pc = (n) => `${Math.round(n * 1000) / 10}%`;
    if (full.medianSimilarity - compact.medianSimilarity > MAX_MEDIAN_DROP + 1e-9) reasons.push(`compact median similarity ${f2(compact.medianSimilarity)} is more than ${f2(MAX_MEDIAN_DROP)} below full ${f2(full.medianSimilarity)}`);
    if (compact.close80 < full.close80 - CLOSE80_TOLERANCE - 1e-9) reasons.push(`compact share close to sent (0.8+) ${pc(compact.close80)} is more than 3 points below full ${pc(full.close80)}`);
    if (compact.failRate > full.failRate + 1e-9) reasons.push(`compact fail rate ${pc(compact.failRate)} is above full ${pc(full.failRate)}`);
    if (compact.medianTokensIn > MAX_COMPACT_MEDIAN_TOKENS_IN) reasons.push(`compact median tokens in ${Math.round(compact.medianTokensIn)} is above the ceiling of 6,000`);
  }
  return { paired: keys.length, targetTokensIn: TARGET_COMPACT_MEDIAN_TOKENS_IN, full, compact, gate: { pass: reasons.length === 0, reasons } };
}
