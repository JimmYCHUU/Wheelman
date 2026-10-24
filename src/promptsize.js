// What a prompt costs, section by section. A rough count (four characters to a token), enough to
// compare prompt styles before any money is spent. Sizes and section names only; never the text.

export const estimateTokens = (text) => Math.ceil(String(text ?? '').length / 4);

const HEADING = /^=== (.+) ===$/;

// Splits one string into { name, text } pieces; the text before the first heading gets `headName`.
function split(text, headName) {
  const pieces = [];
  let current = { name: headName, text: '' };
  for (const line of String(text ?? '').split('\n')) {
    const m = HEADING.exec(line);
    if (m) {
      pieces.push(current);
      current = { name: m[1], text: '' };
    }
    current.text += `${line}\n`;
  }
  pieces.push(current);
  // The loop adds a newline after every line, including the last, which the source may not have had.
  const last = pieces[pieces.length - 1];
  if (!String(text ?? '').endsWith('\n')) last.text = last.text.slice(0, -1);
  return pieces.filter((p) => p.text.length > 0);
}

export function sectionSizes({ system, user }) {
  return [...split(system, '(system)'), ...split(user, '(user head)')]
    .map((p) => ({ name: p.name, chars: p.text.length, tokens: estimateTokens(p.text) }));
}
