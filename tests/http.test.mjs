import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { createAppServer } from "../server/http.mjs";
import { publicService, normaliseService } from "../server/catalogue.mjs";

async function app(t, env = {}) {
  const directory = await mkdtemp(join(tmpdir(), "vezlio-test-"));
  let calls = 0;
  const { server, store } = createAppServer({ env, directory, fetchImpl: async () => { calls++; throw new Error("Unexpected provider request"); } });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });
  return { base: `http://127.0.0.1:${server.address().port}`, store, calls: () => calls };
}

test("no catalogue produces an honest unavailable state with no source timestamp", async t => {
  const { base, calls } = await app(t);
  const response = await fetch(base + "/api/boosting/services");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { available: false, count: 0, revision: null, fetchedAt: null, services: [] });
  assert.equal(calls(), 0);
});

test("private routes require owner authentication for reads and imports", async t => {
  const token = randomBytes(32).toString("hex"), { base, calls } = await app(t, { VEZLIO_ADMIN_TOKEN: token });
  for (const [path, method] of [["/api/admin/boosting", "GET"], ["/api/admin/boosting/sync", "POST"]]) {
    const response = await fetch(base + path, { method, headers: { "content-type": "application/json" }, ...(method === "POST" ? { body: "{}" } : {}) });
    assert.equal(response.status, 401);
    const result = await response.json();
    assert.equal(result.error, "OWNER_AUTH_REQUIRED");
    assert.equal("services" in result, false);
  }
  assert.equal(calls(), 0);
});

test("owner sees the exact missing-key blocker; sync cannot fabricate an import", async t => {
  const token = randomBytes(32).toString("hex"), { base, store, calls } = await app(t, { VEZLIO_ADMIN_TOKEN: token });
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const status = await (await fetch(base + "/api/admin/boosting", { headers })).json();
  assert.equal(status.blocker.code, "MFTBOOST_API_KEY_MISSING");
  assert.equal(status.receipt, null);
  assert.deepEqual(status.services, []);
  const response = await fetch(base + "/api/admin/boosting/sync", { method: "POST", headers, body: "{}" });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "MFTBOOST_API_KEY_MISSING");
  assert.equal(await store.read(), null);
  assert.equal(calls(), 0);
});

test("cross-origin admin and quote requests are rejected", async t => {
  const token = randomBytes(32).toString("hex"), { base } = await app(t, { VEZLIO_ADMIN_TOKEN: token });
  for (const path of ["/api/admin/boosting/sync", "/api/boosting/quote"]) {
    const response = await fetch(base + path, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", origin: "https://unrelated.invalid" }, body: "{}" });
    assert.equal(response.status, 403);
  }
});

test("static server never serves server files, secrets or private catalogue paths", async t => {
  const { base } = await app(t);
  for (const path of ["/.env", "/.env.example", "/private-data/mftboost-catalogue.json", "/server/http.mjs", "/server/../.env", "/README.md", "/package.json", "/.git/config", "/%2e%2e/.env"]) {
    assert.equal((await fetch(base + path)).status, 404, path);
  }
});

test("existing storefront assets and enquiry features are preserved", async t => {
  const { base } = await app(t);
  const response = await fetch(base + "/");
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-security-policy"), /script-src 'self'/);
  assert.match(response.headers.get("cache-control"), /no-store/);
  for (const id of ["productGrid", "toolSearch", "platformGrid", "smmForm", "botPanel", "infoDialog", "whatsappButton", "telegramButton", "boostingGrid"]) assert.ok(html.includes(`id="${id}"`), id);
  assert.ok(html.includes("Social Media Boosting Services"));
  assert.equal(html.includes(">SMM services<"), false);
  for (const path of ["/styles.css", "/app.js", "/config.js", "/favicon.svg", "/public/pricing.js", "/public/boosting.js", "/public/boosting.css", "/admin/boosting", "/admin/boosting.js"]) assert.equal((await fetch(base + path)).status, 200, path);
});

test("customer data projection has a strict allowlist and no provider cost fields", () => {
  const projected = publicService({ agentUsdRate: randomBytes(32).toString("hex"), providerRecord: { key: randomBytes(32).toString("hex") } });
  assert.equal("agentUsdRate" in projected, false);
  assert.equal("providerRecord" in projected, false);
  assert.equal("key" in projected, false);
});

test("malformed service records fail closed without manufacturing IDs or prices", () => {
  for (const malformed of [null, [], {}, { rate: 0.4 }]) assert.throws(() => normaliseService(malformed, new Date().toISOString()), { code: "INVALID_SERVICE_RECORD" });
});

test("server refuses a production configuration without an HTTPS origin", () => {
  assert.throws(() => createAppServer({ env: { NODE_ENV: "production" } }), /PUBLIC_ORIGIN/);
});
