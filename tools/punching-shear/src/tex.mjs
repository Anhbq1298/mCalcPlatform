// Minimal LaTeX → MathML for input labels: symbols, sub/superscripts, groups, \mathrm, Greek letters
// and a few operators. Text between $…$ is math; the rest is plain text. MathML Core renders natively
// in current Chrome, Firefox and Safari, so no runtime dependency is added.
const SYMBOLS = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', theta: 'θ', nu: 'ν', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ', varphi: 'φ',
  times: '×', cdot: '·', le: '≤', ge: '≥', pm: '±', varnothing: '∅', circ: '°',
};
const esc = text => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function tokenize(src) {
  const tokens = [];
  for (let i = 0; i < src.length;) {
    const ch = src[i];
    if (ch === '\\') {
      const m = /^\\([A-Za-z]+|.)/.exec(src.slice(i));
      tokens.push({ cmd: m[1] });
      i += m[0].length;
    } else if (/\d/.test(ch)) {
      const m = /^\d+(\.\d+)?/.exec(src.slice(i));
      tokens.push({ num: m[0] });
      i += m[0].length;
    } else if (ch === ' ') i += 1;
    else { tokens.push({ ch }); i += 1; }
  }
  return tokens;
}

// Parses a token list into MathML. `upright` renders letter runs upright (subscript labels like Ed).
function parse(tokens, upright = false) {
  let pos = 0;
  const group = () => {
    const out = [];
    while (pos < tokens.length && tokens[pos].ch !== '}') out.push(postfix());
    pos += 1;
    return out.length === 1 ? out[0] : `<mrow>${out.join('')}</mrow>`;
  };
  const script = () => {
    const token = tokens[pos];
    if (token?.ch === '{') {
      pos += 1;
      const start = pos;
      let depth = 0;
      while (pos < tokens.length && !(tokens[pos].ch === '}' && depth === 0)) {
        if (tokens[pos].ch === '{') depth += 1;
        if (tokens[pos].ch === '}') depth -= 1;
        pos += 1;
      }
      const inner = tokens.slice(start, pos);
      pos += 1;
      const letters = inner.filter(item => item.ch && /[A-Za-z]/.test(item.ch)).length;
      return parse(inner, letters > 1);
    }
    pos += 1;
    return parse([token]);
  };
  const atom = () => {
    const token = tokens[pos++];
    if (token.ch === '{') return group();
    if (token.num) return `<mn>${token.num}</mn>`;
    if (token.cmd === 'mathrm' || token.cmd === 'text') {
      pos += 1;
      const start = pos;
      while (pos < tokens.length && tokens[pos].ch !== '}') pos += 1;
      const text = tokens.slice(start, pos).map(item => item.ch ?? item.num ?? '').join('');
      pos += 1;
      return `<mi mathvariant="normal">${esc(text)}</mi>`;
    }
    if (token.cmd) {
      const symbol = SYMBOLS[token.cmd] ?? token.cmd;
      return /^[α-ω]$/.test(symbol) ? `<mi>${symbol}</mi>` : `<mo>${esc(symbol)}</mo>`;
    }
    if (/[A-Za-z]/.test(token.ch)) {
      if (!upright) return `<mi>${token.ch}</mi>`;
      let run = token.ch;
      while (pos < tokens.length && tokens[pos].ch && /[A-Za-z]/.test(tokens[pos].ch)) run += tokens[pos++].ch;
      return run.length > 1 ? `<mi mathvariant="normal">${run}</mi>` : `<mi>${run}</mi>`;
    }
    return `<mo>${esc(token.ch)}</mo>`;
  };
  function postfix() {
    const base = atom();
    let sub = null;
    let sup = null;
    while (pos < tokens.length && (tokens[pos].ch === '_' || tokens[pos].ch === '^')) {
      const kind = tokens[pos++].ch;
      if (kind === '_') sub = script();
      else sup = script();
    }
    if (sub && sup) return `<msubsup>${base}${sub}${sup}</msubsup>`;
    if (sub) return `<msub>${base}${sub}</msub>`;
    if (sup) return `<msup>${base}${sup}</msup>`;
    return base;
  }
  const out = [];
  while (pos < tokens.length) out.push(postfix());
  return out.length === 1 ? out[0] : `<mrow>${out.join('')}</mrow>`;
}

export const texToMathML = tex => `<math>${parse(tokenize(tex))}</math>`;

// Label markup: plain text with $…$ math spans.
export const labelHtml = label => String(label).split(/(\$[^$]+\$)/).map(part => (part.startsWith('$') && part.endsWith('$') && part.length > 2 ? texToMathML(part.slice(1, -1)) : esc(part))).join('');

// Plain-text form for aria-label and title attributes.
export const labelText = label => String(label).replace(/\$([^$]+)\$/g, (_, tex) => tex
  .replace(/\\(mathrm|text)\{([^}]*)\}/g, '$2')
  .replace(/\\([A-Za-z]+)/g, (m, name) => SYMBOLS[name] ?? name)
  .replace(/[{}]/g, ''));
