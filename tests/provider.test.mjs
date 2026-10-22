import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { retrieveAgentCatalogue, PROVIDER_ENDPOINT } from "../server/provider.mjs";

const secret = () => randomBytes(32).toString("hex");

test("missing Agent key stops before any provider request", async () => {
  let called = false;
  await assert.rejects(retrieveAgentCatalogue({}, async () => { called = true; }), { code: "MFTBOOST_API_KEY_MISSING" });
  assert.equal(called, false);
});

test("an unconfirmed account tier cannot be silently treated as Agent", async () => {
  let called = false;
  await assert.rejects(retrieveAgentCatalogue({ MFTBOOST_API_KEY: secret() }, async () => { called = true; }), { code: "AGENT_ACCOUNT_UNCONFIRMED" });
  assert.equal(called, false);
});

test("currency mismatch stops before service pricing is imported", async () => {
  const actions = [];
  await assert.rejects(retrieveAgentCatalogue({ MFTBOOST_API_KEY: secret(), MFTBOOST_ACCOUNT_TIER: "agent" }, async (_, init) => {
    actions.push(init.body.get("action"));
    return new Response(JSON.stringify({ currency: "LKR" }));
  }), { code: "ACCOUNT_CURRENCY_NOT_USD" });
  assert.deepEqual(actions, ["balance"]);
});

test("authenticated service read uses the fixed POST endpoint and never creates orders", async () => {
  const key = secret(), actions = [];
  await assert.rejects(retrieveAgentCatalogue({ MFTBOOST_API_KEY: key, MFTBOOST_ACCOUNT_TIER: "agent" }, async (url, init) => {
    assert.equal(url, PROVIDER_ENDPOINT);
    assert.equal(url.includes(key), false);
    assert.equal(init.method, "POST");
    assert.equal(init.redirect, "error");
    assert.equal(init.body.get("key"), key);
    const action = init.body.get("action");
    actions.push(action);
    if (action === "balance") return new Response(JSON.stringify({ currency: "USD" }));
    return new Response(JSON.stringify({ error: `Do not expose ${key}` }));
  }), error => error.code === "PROVIDER_REJECTED_REQUEST" && !error.message.includes(key));
  assert.deepEqual(actions, ["balance", "services"]);
});

test("empty service lists cannot replace the verified catalogue", async () => {
  await assert.rejects(retrieveAgentCatalogue({ MFTBOOST_API_KEY: secret(), MFTBOOST_ACCOUNT_TIER: "agent" }, async (_, init) => new Response(JSON.stringify(init.body.get("action") === "balance" ? { currency: "USD" } : []))), { code: "EMPTY_OR_INVALID_CATALOGUE" });
});

test("provider transport errors are sanitized", async () => {
  const key = secret();
  await assert.rejects(retrieveAgentCatalogue({ MFTBOOST_API_KEY: key, MFTBOOST_ACCOUNT_TIER: "agent" }, async () => { throw new Error(key); }), error => error.code === "PROVIDER_UNREACHABLE" && !error.message.includes(key));
});
