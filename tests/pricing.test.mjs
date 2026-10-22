import test from "node:test";
import assert from "node:assert/strict";
import "../public/pricing.js";
const price = globalThis.VezlioPricing;

// Arithmetic inputs only. These are not provider rates or catalogue records.
test("fixed multiplier and exchange rate preserve every decimal", () => {
  assert.equal(price.agentRateToLkr("1"), "832.5");
  assert.equal(price.agentRateToLkr("0.4"), "333");
  assert.equal(price.agentRateToLkr("0.08"), "66.6");
  assert.equal(price.agentRateToLkr("0.00000000000000000001"), "0.000000000000000008325");
  assert.equal(price.agentRateToLkr("0"), "0");
});

test("ceil is applied once at the final whole-LKR total", () => {
  assert.equal(price.agentTotalLkr("0.4", "1000"), "333");
  assert.equal(price.agentTotalLkr("0.08", "5000"), "333");
  assert.equal(price.agentTotalLkr("0.1", "12000"), "999");
  assert.equal(price.agentTotalLkr("0.1", "1000"), "84");
  assert.equal(price.agentTotalLkr("0.00000000000000000001", "1"), "1");
  assert.equal(price.agentTotalLkr("0", "1"), "0");
});

test("large quantities and high precision never pass through Number", () => {
  assert.equal(price.agentTotalLkr("1", "999999999999999999999999"), "832500000000000000000000");
  assert.equal(price.totalFromLkrRate("999999999999999999999.0000000000001", "1000"), "1000000000000000000000");
});

test("customer calculation uses unrounded converted rate", () => {
  for (const rate of ["0", "0.08", "0.4", "0.10000000000000000001", "123456.7890123456789"]) {
    for (const quantity of ["1", "7", "1000", "5000", "999999999999999999999999"]) {
      assert.equal(price.totalFromLkrRate(price.agentRateToLkr(rate), quantity), price.agentTotalLkr(rate, quantity));
    }
  }
});

test("ambiguous or binary floating-point price inputs are rejected", () => {
  for (const rate of [0.4, null, undefined, "-1", "1e-8", "1,000", "NaN", "Infinity", "", ".4", "1.", " 1", "9".repeat(257)]) {
    assert.throws(() => price.agentRateToLkr(rate));
  }
  for (const quantity of [1, "0", "-1", "1.5", "1e3", "", "1".repeat(25)]) assert.throws(() => price.agentTotalLkr("1", quantity));
});

test("display formatting retains the entire decimal", () => {
  assert.equal(price.formatLkr("1234567.123456789"), "LKR 1,234,567.123456789");
  assert.equal(price.formatLkr("0"), "LKR 0");
});
