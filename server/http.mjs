import { createServer } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CatalogueStore } from "./catalogue.mjs";
import { IntegrationError, assertAgentConfiguration } from "./provider.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Explicit allowlist: .env, private snapshots, server source and docs are never served.
const STATIC = new Map([
  ["/", ["index.html", "text/html"]], ["/index.html", ["index.html", "text/html"]],
  ["/app.js", ["app.js", "text/javascript"]], ["/config.js", ["config.js", "text/javascript"]],
  ["/styles.css", ["styles.css", "text/css"]], ["/favicon.svg", ["favicon.svg", "image/svg+xml"]],
  ["/public/pricing.js", ["public/pricing.js", "text/javascript"]],
  ["/public/boosting.js", ["public/boosting.js", "text/javascript"]],
  ["/public/boosting.css", ["public/boosting.css", "text/css"]],
  ["/admin/boosting", ["admin/boosting.html", "text/html"]],
  ["/admin/boosting.js", ["admin/boosting.js", "text/javascript"]]
]);

function headers(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  response.setHeader("Cache-Control", "no-store");
}

function json(response, status, value) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

async function body(request) {
  if (request.headers["content-type"]?.split(";")[0] !== "application/json") {
    throw new IntegrationError("JSON_REQUIRED", "Send an application/json request.", 415);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 4096) throw new IntegrationError("REQUEST_TOO_LARGE", "Request is too large.", 413);
    chunks.push(chunk);
  }
  try {
    const result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!result || Array.isArray(result) || typeof result !== "object") throw new Error();
    return result;
  } catch { throw new IntegrationError("INVALID_JSON", "Send a valid JSON object.", 400); }
}

function requireMethod(request, method) {
  if (request.method !== method) throw new IntegrationError("METHOD_NOT_ALLOWED", "Method not allowed.", 405);
}

export function createAppServer({ env = process.env, directory, fetchImpl = fetch } = {}) {
  if (env.NODE_ENV === "production" && (!env.PUBLIC_ORIGIN || new URL(env.PUBLIC_ORIGIN).protocol !== "https:")) {
    throw new Error("Set PUBLIC_ORIGIN to the production HTTPS origin before starting.");
  }
  if (env.PUBLIC_ORIGIN && new URL(env.PUBLIC_ORIGIN).origin !== env.PUBLIC_ORIGIN) {
    throw new Error("PUBLIC_ORIGIN must be an exact origin with no path or trailing slash.");
  }
  const store = new CatalogueStore(directory || resolve(env.VEZLIO_DATA_DIR || "./private-data"), env, fetchImpl);
  const limits = new Map();

  function limit(request, group, maximum) {
    const now = Date.now();
    // Bound memory even if an attacker can create many source addresses.
    if (limits.size > 4096) for (const [key, entry] of limits) if (entry.until <= now) limits.delete(key);
    if (limits.size > 8192) throw new IntegrationError("RATE_LIMITED", "Please try again shortly.", 429);
    const key = `${group}:${request.socket.remoteAddress}`;
    let entry = limits.get(key);
    if (!entry || entry.until <= now) { entry = { count: 0, until: now + 60_000 }; limits.set(key, entry); }
    if (++entry.count > maximum) throw new IntegrationError("RATE_LIMITED", "Please try again shortly.", 429);
  }

  function sameOrigin(request) {
    if (request.headers["sec-fetch-site"] === "cross-site") throw new IntegrationError("ORIGIN_REJECTED", "Cross-site requests are not permitted.", 403);
    const expected = env.PUBLIC_ORIGIN || `http://${request.headers.host}`;
    if (request.headers.origin && request.headers.origin !== expected) throw new IntegrationError("ORIGIN_REJECTED", "Request origin is not permitted.", 403);
  }

  function owner(request) {
    sameOrigin(request);
    limit(request, "owner", 30);
    const expected = env.VEZLIO_ADMIN_TOKEN;
    if (!expected || expected.length < 32 || expected === env.MFTBOOST_API_KEY) {
      throw new IntegrationError("OWNER_AUTH_NOT_CONFIGURED", "Set a separate strong VEZLIO_ADMIN_TOKEN server secret before using the integration admin.");
    }
    const auth = request.headers.authorization || "";
    const given = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (given.length > 1024 || !timingSafeEqual(createHash("sha256").update(given).digest(), createHash("sha256").update(expected).digest())) {
      throw new IntegrationError("OWNER_AUTH_REQUIRED", "Owner authorization is required.", 401);
    }
  }

  const server = createServer(async (request, response) => {
    headers(response);
    try {
      const url = new URL(request.url, "http://localhost");
      const path = url.pathname;
      if (path === "/api/boosting/services") {
        requireMethod(request, "GET");
        limit(request, "catalogue", 120);
        return json(response, 200, await store.publicCatalogue());
      }
      if (path === "/api/boosting/quote") {
        requireMethod(request, "POST");
        sameOrigin(request);
        limit(request, "quote", 60);
        const input = await body(request);
        if (typeof input.serviceId !== "string" || typeof input.quantity !== "string" || typeof input.revision !== "string") {
          throw new IntegrationError("INVALID_QUOTE", "Service ID, quantity and catalogue revision must be strings.", 400);
        }
        return json(response, 200, await store.quote(input.serviceId, input.quantity, input.revision));
      }
      if (path === "/api/admin/boosting" || path === "/api/admin/boosting/sync") {
        requireMethod(request, path.endsWith("/sync") ? "POST" : "GET");
        owner(request);
        if (path.endsWith("/sync")) {
          await body(request);
          return json(response, 200, { receipt: await store.sync(), published: false, ordersCreated: 0 });
        }
        const catalogue = await store.read();
        let blocker = null;
        try { assertAgentConfiguration(env); }
        catch (error) { blocker = { code: error.code, message: error.message }; }
        return json(response, 200, {
          blocker, syncing: store.syncing, lastAttempt: store.lastAttempt,
          receipt: catalogue?.receipt || null,
          // Costs and complete provider properties are exposed only after owner().
          services: catalogue?.services || []
        });
      }
      if (path.startsWith("/api/")) return json(response, 404, { error: "NOT_FOUND", message: "Endpoint not found." });
      if (!["GET", "HEAD"].includes(request.method)) throw new IntegrationError("METHOD_NOT_ALLOWED", "Method not allowed.", 405);
      const asset = STATIC.get(path);
      if (!asset) return json(response, 404, { error: "NOT_FOUND", message: "Page not found." });
      const content = await readFile(resolve(ROOT, asset[0]));
      response.writeHead(200, { "content-type": asset[1] + "; charset=utf-8" });
      response.end(request.method === "HEAD" ? undefined : content);
    } catch (error) {
      const safe = error instanceof IntegrationError ? error : new IntegrationError("SERVER_ERROR", "The request could not be completed.", 500);
      json(response, safe.status, { error: safe.code, message: safe.message });
    }
  });
  server.requestTimeout = 45_000;
  server.headersTimeout = 15_000;
  server.keepAliveTimeout = 5000;
  return { server, store };
}
