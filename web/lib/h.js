// The small element builder every view and component uses. Customer text is always inserted as
// text, never as HTML: `text` sets textContent and children are text nodes unless they are nodes.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** h('button', { class: 'btn', onclick }, 'Copy', icon('copy')) */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  put(el, ...children);
  return el;
}

/** Like append, but skips empty values and accepts lists. The browser's own append would print 'null'. */
export function put(parent, ...children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false || c === '') continue;
    parent.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return parent;
}
