// The shape of a page: element names and the attributes that name things, with no words from any
// message. Shared by the Messages reader and the Gmail button for "Copy page details": when Google
// changes a page, the shape shows which element names to look for instead.

export function shape(el, depth = 0) {
  if (!el || depth > 7) return '';
  const attrs = [...el.attributes].map((a) => {
    if (a.name === 'class') return `class=${a.value.split(/\s+/).filter(Boolean).slice(0, 4).join('.')}`;
    return a.name;
  }).join(' ');
  const kids = [...el.children].slice(0, 12).map((k) => shape(k, depth + 1)).filter(Boolean);
  return `${el.tagName.toLowerCase()}${attrs ? ` [${attrs}]` : ''}${kids.length ? ` { ${kids.join(' ; ')} }` : ''}`;
}

/** The details given, plus the shape of the root, cut to 8000 characters. */
export function pageShape(root, extra = {}) {
  return { ...extra, shape: root ? shape(root).slice(0, 8000) : '' };
}
