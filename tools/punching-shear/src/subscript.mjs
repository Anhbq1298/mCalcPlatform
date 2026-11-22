// Engineering symbols written with underscores (d_H, v_Rd,c, u_out,ef, V_Ed) or with a trailing
// index (u1, u1,int, u0, u1*, c1, l2) are displayed with true subscripts: <sub> in HTML, a shifted
// <tspan> in SVG and a smaller, lowered run on the 3D canvas. The text itself is unchanged.
const SUB = /([A-Za-zα-ωΔ])_(\{[^}]*\}|[A-Za-z0-9*]+(?:,[A-Za-z0-9]+)*)|\b(u)([01](?:,(?:int|ext))?\*?)(?![A-Za-z0-9])|\b([cl])([12])\b/g;

// Splits text into runs: [{ text, sub }].
export function segments(text) {
  const out = [];
  let last = 0;
  for (const match of String(text).matchAll(SUB)) {
    const base = match[1] ?? match[3] ?? match[5];
    const index = (match[2] ?? match[4] ?? match[6]).replace(/^\{|\}$/g, '');
    out.push({ text: String(text).slice(last, match.index) + base, sub: false });
    out.push({ text: index, sub: true });
    last = match.index + match[0].length;
  }
  out.push({ text: String(text).slice(last), sub: false });
  return out.filter(run => run.text);
}

// SVG: rewrites the content of every <text> element (content is already XML-escaped).
export function svgSubscripts(svg) {
  return svg.replace(/(<text\b[^>]*>)([^<]*)(<\/text>)/g, (_, open, body, close) => open
    + segments(body).map(run => (run.sub ? `<tspan baseline-shift="-22%" font-size="78%">${run.text}</tspan>` : run.text)).join('') + close);
}

// HTML: replaces matching text nodes under `root` with text + <sub> runs. Form controls, MathML and
// SVG are left alone (labels are MathML, drawings are handled by svgSubscripts).
export function htmlSubscripts(root) {
  if (!root) return;
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: node => (node.parentElement?.closest('option, select, textarea, input, math, svg, sub, script, style') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes = [];
  const probe = new RegExp(SUB.source);
  while (walker.nextNode()) if (probe.test(walker.currentNode.nodeValue)) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const fragment = root.ownerDocument.createDocumentFragment();
    for (const run of segments(node.nodeValue)) {
      if (!run.sub) { fragment.append(run.text); continue; }
      const sub = root.ownerDocument.createElement('sub');
      sub.textContent = run.text;
      fragment.append(sub);
    }
    node.replaceWith(fragment);
  }
}

// Canvas 2D: draws text with lowered, smaller subscript runs. Returns the drawn width.
export function fillSubscripted(ctx, text, x, y, size) {
  let cursor = x;
  const font = ctx.font;
  for (const run of segments(text)) {
    ctx.font = font.replace(/\d+(\.\d+)?px/, `${run.sub ? (size * 0.78).toFixed(1) : size}px`);
    ctx.fillText(run.text, cursor, run.sub ? y + size * 0.25 : y);
    cursor += ctx.measureText(run.text).width;
  }
  ctx.font = font;
  return cursor - x;
}

// HTML string (may contain tags): subscripts in the text between tags.
export const htmlStringSubscripts = html => String(html).split(/(<[^>]+>)/).map(part => (part.startsWith('<') ? part
  : segments(part).map(run => (run.sub ? `<sub>${run.text}</sub>` : run.text)).join(''))).join('');
