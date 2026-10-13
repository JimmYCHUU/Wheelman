// What the search box matches, shared by the page (for the rows already loaded) and the server
// (for every row). Pure: no DOM, no state.

/**
 * True when a list row matches what was typed: a name, a word from the latest message, a car (or
 * an email's subject), the situation, a Marketplace account, an email address, what is due, an
 * order number, or three or more digits of the phone number in any spacing.
 */
export function rowMatches(r, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, '');
  return [r.name, r.preview?.text, r.car, r.situation, r.account, r.email, r.due, r.orderNo].some((f) => String(f || '').toLowerCase().includes(q))
    || (digits.length >= 3 && String(r.phone || '').replace(/\D/g, '').includes(digits));
}
