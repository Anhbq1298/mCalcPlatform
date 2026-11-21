export const fmt = (v: number, d = 1) => (Number.isFinite(v) ? v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '–');

/** Subscript runs of engineering text: "M_Ed(x)" → M, Ed(sub), (x). */
const SUB = /([A-Za-zα-ωΑ-Ω]+)_(\{[^}]*\}|[A-Za-z0-9α-ω]+(?:[.,][A-Za-z0-9α-ω]+)*)/g;

export function subParts(text: string): { t: string; sub?: boolean }[] {
  const out: { t: string; sub?: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(SUB)) {
    out.push({ t: text.slice(last, m.index) + m[1] });
    out.push({ t: m[2].replace(/^\{|\}$/g, ''), sub: true });
    last = (m.index ?? 0) + m[0].length;
  }
  out.push({ t: text.slice(last) });
  return out.filter((p) => p.t);
}
