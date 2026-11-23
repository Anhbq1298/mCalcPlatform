import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runBenchmarks } from '../scripts/benchmarks.mjs';

// A published value printed with n decimals carries ±0.5·10^-n of rounding; the tool must fall inside it
// (plus 0.1 % for intermediate rounding in the source, e.g. u_out from v_Rd,c printed as 0.66). Values marked 'different' rest on another
// rule or National Annex and are documented, not asserted.
const tolerance = published => {
  const decimals = (String(published).split('.')[1] ?? '').length;
  return 0.5 * 10 ** -decimals / Math.abs(published) + 1e-3;
};

for (const bench of runBenchmarks()) {
  test(`published benchmark ${bench.id}: same-basis values within the source rounding`, () => {
    for (const value of bench.values.filter(item => item.basis === 'same')) {
      assert.ok(Math.abs(value.diff) <= tolerance(value.published), `${value.quantity}: published ${value.published}, tool ${value.tool}`);
    }
  });
}
