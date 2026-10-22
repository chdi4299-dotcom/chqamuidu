// Decimal arithmetic shared by the server and browser. No provider costs here.
// All values crossing JSON boundaries are strings; no binary float arithmetic.
(function (root) {
  "use strict";
  function decimal(value) {
    if (typeof value !== "string" || value.length > 256 || !/^\d+(?:\.\d+)?$/.test(value)) {
      throw new Error("A non-negative plain decimal string is required.");
    }
    const [whole, fraction = ""] = value.split(".");
    return { numerator: BigInt(whole + fraction), denominator: 10n ** BigInt(fraction.length) };
  }
  function integer(value) {
    if (typeof value !== "string" || !/^\d{1,24}$/.test(value) || BigInt(value) < 1n) {
      throw new Error("Quantity must be a positive whole number.");
    }
    return BigInt(value);
  }
  function plain(numerator, denominator) {
    const whole = numerator / denominator;
    let remainder = numerator % denominator;
    if (!remainder) return String(whole);
    let fraction = "";
    while (remainder) {
      remainder *= 10n;
      fraction += String(remainder / denominator);
      remainder %= denominator;
    }
    return `${whole}.${fraction}`;
  }
  function agentRateToLkr(agentUsdRate) {
    const rate = decimal(agentUsdRate);
    // 2.5 × 333 = 1665 / 2. Keep the entire decimal, without rounding.
    return plain(rate.numerator * 1665n, rate.denominator * 2n);
  }
  function totalFromLkrRate(ratePer1000Lkr, quantity) {
    const rate = decimal(ratePer1000Lkr);
    const numerator = rate.numerator * integer(quantity);
    const denominator = rate.denominator * 1000n;
    return String((numerator + denominator - 1n) / denominator);
  }
  function agentTotalLkr(agentUsdRate, quantity) {
    const rate = decimal(agentUsdRate);
    const numerator = rate.numerator * integer(quantity) * 1665n;
    const denominator = rate.denominator * 2000n;
    return String((numerator + denominator - 1n) / denominator);
  }
  function formatLkr(value) {
    decimal(value);
    const [whole, fraction = ""] = value.split(".");
    return `LKR ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction ? "." + fraction : ""}`;
  }
  const api = Object.freeze({ decimal, integer, agentRateToLkr, totalFromLkrRate, agentTotalLkr, formatLkr });
  root.VezlioPricing = api;
})(typeof window === "object" ? window : globalThis);
