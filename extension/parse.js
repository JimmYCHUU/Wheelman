// Pure string work for the Wheelman phone reader. Nothing here touches the browser, so the same file
// runs in Node for the tests. It turns what the Google Messages list shows (a name or number, the
// latest message, a short time such as "5 min" or "Yesterday") into plain records.

const TZ = 'Australia/Sydney';
const MIN = 60e3;
const HOUR = 3600e3;
const DAY = 24 * HOUR;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const dtf = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hourCycle: 'h23', weekday: 'short',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

/** The Sydney wall-clock parts of a moment. */
export function sydneyParts(ms) {
  const p = Object.fromEntries(dtf.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour, minute: +p.minute, second: +p.second, weekday: DAYS.indexOf(String(p.weekday).toLowerCase().slice(0, 3)) };
}

function offsetAt(ms) {
  const p = sydneyParts(ms);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

/** The moment of a Sydney wall-clock time. */
export function fromSydney(year, month, day, hour = 0, minute = 0) {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  // The offset at about that time; a second pass settles a time close to a clock change.
  const guess = naive - offsetAt(naive);
  return naive - offsetAt(guess);
}

/**
 * An Australian phone number reduced to its last nine digits, so "+61 400 111 222" and
 * "0400 111 222" compare equal. The same rule as src/normalize.js. Anything else gives ''.
 */
export function phoneKey(s) {
  const d = String(s ?? '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('61')) return d.slice(2);
  if (d.length === 10 && d.startsWith('0')) return d.slice(1);
  if (d.length === 9) return d;
  return '';
}

/**
 * What the name on the list is: a phone number, a short code (a few digits, as login codes come
 * from), a sender id rather than a person (AUSPOST, CarbarnAU), or the name of a saved contact.
 */
export function senderKind(name) {
  const t = String(name ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return 'contact';
  if (phoneKey(t)) return 'number';
  if (/^\+?[\d\s().-]+$/.test(t)) {
    const n = t.replace(/\D/g, '').length;
    return n >= 3 && n <= 8 ? 'shortcode' : 'number';
  }
  // One word with a digit, in capitals, or in CamelCase. A saved contact is normally two words, or one in title case.
  if (/^[A-Za-z0-9._-]{2,11}$/.test(t) && (/\d/.test(t) || /^[A-Z0-9._-]+$/.test(t) || /^[A-Z][a-z]+[A-Z]/.test(t))) return 'alpha';
  return 'contact';
}

const MEDIA = /^(?:[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]\s*)*(photo|image|picture|gif|sticker|video|audio|voice message|voice note|file|attachment|location|contact card)s?$/iu;

/**
 * The latest-message line of a conversation on the list. "You:" in front means we sent it. A photo
 * or file shows as a short label rather than words. A text cut short ends with an ellipsis.
 */
export function parseSnippet(s) {
  let text = String(s ?? '').replace(/\s+/g, ' ').trim();
  let direction = 'in';
  const you = text.match(/^(?:You|Me):\s*/i);
  if (you) { direction = 'out'; text = text.slice(you[0].length).trim(); }
  const truncated = /(\u2026|\.\.\.)$/.test(text);
  if (truncated) text = text.replace(/(\u2026|\.\.\.)$/, '').trim();
  const m = text.match(MEDIA);
  const media = m ? (/photo|image|picture|gif|sticker/i.test(m[1]) ? 'photo' : 'attachment') : null;
  return { direction, text: media ? '' : text, media, truncated: truncated && !media };
}

function hour24(h, ampm) {
  let hour = +h;
  if (!ampm) return hour;
  const pm = /p/i.test(ampm);
  if (hour === 12) return pm ? 12 : 0;
  return pm ? hour + 12 : hour;
}

/** A full date and time, as a tooltip gives it: "6 Oct 2026, 10:31 am", "October 6, 2026 at 10:31 AM", "2026-10-06T10:31:00+11:00". */
export function parseFullDate(s, now = Date.now()) {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  if (/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(t) && /([zZ]|[+-]\d\d:?\d\d)$/.test(t)) {
    const at = Date.parse(t);
    return Number.isNaN(at) ? null : at;
  }
  const time = t.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?/i);
  if (!time) return null;
  const hour = hour24(time[1], time[4]);
  const minute = +time[2];
  let y, mo, d, m;
  if ((m = t.match(/\b([A-Za-z]{3,9})\.? (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})\b/)) && MONTHS.includes(m[1].toLowerCase().slice(0, 3))) {
    mo = MONTHS.indexOf(m[1].toLowerCase().slice(0, 3)) + 1; d = +m[2]; y = +m[3];
  } else if ((m = t.match(/\b(\d{1,2}) ([A-Za-z]{3,9})\.?,? (\d{4})\b/)) && MONTHS.includes(m[2].toLowerCase().slice(0, 3))) {
    d = +m[1]; mo = MONTHS.indexOf(m[2].toLowerCase().slice(0, 3)) + 1; y = +m[3];
  } else if ((m = t.match(/\b(\d{4})-(\d\d)-(\d\d)\b/))) {
    y = +m[1]; mo = +m[2]; d = +m[3];
  } else if ((m = t.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/))) {
    d = +m[1]; mo = +m[2]; y = +m[3]; // day/month/year, as Australian pages write it
  } else return null;
  const at = fromSydney(y, mo, d, hour, minute);
  return Number.isFinite(at) && at < now + DAY ? at : null;
}

/**
 * The short time on the list as a moment, with how precise it is: "now" (exact), "5 min" (minute),
 * "2 hr" (hour), "10:31 AM" (minute, today or else yesterday), "Yesterday", "Mon", "1 Oct" (day).
 * A full date in the tooltip, when there is one, beats the short form.
 */
export function parseWhen(when, { now = Date.now(), title = '' } = {}) {
  const full = parseFullDate(title, now);
  if (full !== null) return { at: full, precision: 'exact' };
  const w = String(when ?? '').replace(/\s+/g, ' ').trim();
  if (!w) return null;
  const today = sydneyParts(now);
  const noon = (p) => fromSydney(p.year, p.month, p.day, 12, 0);
  let m;
  if (/^(now|just now|moments? ago)$/i.test(w)) return { at: now, precision: 'exact' };
  if ((m = w.match(/^(\d+)\s*(?:min|mins|minute|minutes|m)(?: ago)?$/i))) return { at: now - m[1] * MIN, precision: 'minute' };
  if ((m = w.match(/^(\d+)\s*(?:hr|hrs|hour|hours|h)(?: ago)?$/i))) return { at: now - m[1] * HOUR, precision: 'hour' };
  if ((m = w.match(/^(\d{1,2}):(\d{2})\s*([ap]\.?m\.?)?$/i))) {
    let at = fromSydney(today.year, today.month, today.day, hour24(m[1], m[3]), +m[2]);
    if (at > now + 5 * MIN) at -= DAY; // a clock time later than now is yesterday's
    return { at, precision: 'minute' };
  }
  if (/^yesterday$/i.test(w)) return { at: noon(sydneyParts(now - DAY)), precision: 'day' };
  const lower = w.toLowerCase();
  if (DAYS.includes(lower) || DAY_NAMES.includes(lower)) {
    const wd = DAYS.indexOf(lower.slice(0, 3));
    let back = (today.weekday - wd + 7) % 7;
    if (back === 0) back = 7;
    return { at: noon(sydneyParts(now - back * DAY)), precision: 'day' };
  }
  const md = w.match(/^([A-Za-z]{3,9})\.? (\d{1,2})(?:,? (\d{4}))?$/) || w.match(/^(\d{1,2}) ([A-Za-z]{3,9})\.?(?:,? (\d{4}))?$/);
  if (md) {
    const [monthWord, dayNum] = /^\d/.test(md[1]) ? [md[2], md[1]] : [md[1], md[2]];
    const mo = MONTHS.indexOf(monthWord.toLowerCase().slice(0, 3));
    if (mo >= 0) {
      let at = fromSydney(md[3] ? +md[3] : today.year, mo + 1, +dayNum, 12, 0);
      if (!md[3] && at > now + DAY) at = fromSydney(today.year - 1, mo + 1, +dayNum, 12, 0);
      return { at, precision: 'day' };
    }
  }
  if ((m = w.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/))) {
    const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return { at: fromSydney(year, +m[2], +m[1], 12, 0), precision: 'day' };
  }
  return null;
}

/**
 * One conversation as the list shows it, in a plain record.
 * raw: { ref, name, snippet, when, whenTitle, unread } as reader.js lifts them off the page.
 */
export function parseListItem(raw, { now = Date.now() } = {}) {
  const name = String(raw.name ?? '').replace(/\s+/g, ' ').trim();
  const s = parseSnippet(raw.snippet);
  const w = parseWhen(raw.when, { now, title: raw.whenTitle });
  return {
    ref: String(raw.ref ?? '').trim(),
    name,
    phoneKey: phoneKey(name),
    kind: senderKind(name),
    unread: !!raw.unread,
    latest: {
      direction: s.direction, text: s.text, media: s.media, truncated: s.truncated,
      when: String(raw.when ?? '').replace(/\s+/g, ' ').trim(),
      at: w ? w.at : null, precision: w ? w.precision : 'unknown',
    },
  };
}
