import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import "../public/pricing.js";
import { IntegrationError, PROVIDER_ENDPOINT, retrieveAgentCatalogue } from "./provider.mjs";

export const Pricing = globalThis.VezlioPricing;
const PLATFORMS = ["YouTube", "Instagram", "TikTok", "Facebook", "Telegram", "WhatsApp", "Spotify", "Twitch", "Discord", "Pinterest", "Snapchat", "LinkedIn", "Reddit", "SoundCloud", "Threads"];
const fail = () => { throw new IntegrationError("INVALID_SERVICE_RECORD", "A service contains an invalid ID, rate, name, type, category, or quantity range. The entire import was stopped; previous records were preserved."); };

function digits(value, allowZero = false) {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) return fail();
    return String(value);
  }
  if (typeof value !== "string" || !(allowZero ? /^(?:0|[1-9]\d{0,23})$/ : /^[1-9]\d{0,23}$/).test(value)) return fail();
  return value;
}

export function normaliseService(raw, fetchedAt) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail();
  for (const key of ["name", "category", "type"]) {
    if (typeof raw[key] !== "string" || !raw[key].trim() || raw[key].length > 100_000) return fail();
  }
  const eligible = raw.type.trim().toLowerCase() === "default";
  const id = digits(raw.service), min = digits(raw.min, !eligible), max = digits(raw.max, !eligible);
  if (BigInt(min) > BigInt(max)) return fail();
  // Provider documentation specifies rate as a decimal string. Reject numeric
  // JSON rates rather than import a value that JSON.parse may have rounded.
  let ratePer1000Lkr;
  try { ratePer1000Lkr = Pricing.agentRateToLkr(raw.rate); }
  catch { return fail(); }
  if (raw.desc != null && typeof raw.desc !== "string") return fail();
  const platformFromProvider = typeof raw.platform === "string" && raw.platform.trim() ? raw.platform : null;
  const sourceLabel = `${raw.category} ${raw.name}`;
  const inferred = PLATFORMS.find(name => new RegExp(`\\b${name}\\b`, "i").test(sourceLabel)) || (/\b(?:twitter|x\.com)\b/i.test(sourceLabel) ? "X / Twitter" : "Other");
  // Only Default has the simple quantity contract this storefront implements.
  // Retain every other real record privately for review; don't invent package,
  // subscription, comments, poll, or other service-type billing semantics.
  return {
    id, originalServiceId: raw.service, name: raw.name, category: raw.category,
    platform: platformFromProvider || inferred,
    platformSource: platformFromProvider ? "provider" : "inferred_from_name_or_category",
    type: raw.type, agentUsdRate: raw.rate, ratePer1000Lkr, min, max,
    description: raw.desc ?? null,
    properties: Object.fromEntries(["dripfeed", "refill", "cancel"].filter(key => typeof raw[key] === "boolean").map(key => [key, raw[key]])),
    providerRecord: raw, active: true, eligible,
    reviewReason: eligible ? null : "This service type requires a verified pricing and input contract before customer quantity quotes can be enabled.",
    sourceFetchedAt: fetchedAt
  };
}

export function verifyServicePrices(services) {
  for (const service of services) {
    if (Pricing.agentRateToLkr(service.agentUsdRate) !== service.ratePer1000Lkr) {
      throw new IntegrationError("PRICE_VERIFICATION_FAILED", "A converted service price did not match the exact formula. Import stopped.");
    }
    for (const quantity of [service.min, service.max, "1000"].filter(value => BigInt(value) > 0n)) {
      if (Pricing.totalFromLkrRate(service.ratePer1000Lkr, quantity) !== Pricing.agentTotalLkr(service.agentUsdRate, quantity)) {
        throw new IntegrationError("QUANTITY_VERIFICATION_FAILED", "A service quantity price did not match the exact formula. Import stopped.");
      }
    }
  }
}

// This projection is the only source of customer-facing service data.
export function publicService(service) {
  return {
    id: service.id, originalServiceId: service.originalServiceId,
    name: service.name, platform: service.platform, platformSource: service.platformSource,
    category: service.category, type: service.type, description: service.description,
    properties: service.properties, min: service.min, max: service.max,
    ratePer1000Lkr: service.ratePer1000Lkr, currency: "LKR",
    sourceFetchedAt: service.sourceFetchedAt
  };
}

async function atomicJson(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(JSON.stringify(value));
    await handle.sync();
    await handle.close();
    await rename(temporary, path);
  } catch (error) {
    await handle.close().catch(() => {});
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

export class CatalogueStore {
  constructor(directory, env, fetchImpl = fetch) {
    this.directory = directory;
    this.file = join(directory, "mftboost-catalogue.json");
    this.env = env;
    this.fetchImpl = fetchImpl;
    this.lastAttempt = null;
    this.syncing = false;
  }

  async read() {
    try {
      const value = JSON.parse(await readFile(this.file, "utf8"));
      if (value.schema !== 1 || !Array.isArray(value.services) || !value.receipt?.authenticated || !value.receipt?.fetchedAt) throw new Error("Invalid snapshot");
      verifyServicePrices(value.services);
      if (new Set(value.services.map(service => service.id)).size !== value.services.length) throw new Error("Duplicate snapshot IDs");
      return value;
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw new IntegrationError("CATALOGUE_STORAGE_INVALID", "The private catalogue could not be validated. Restore a verified snapshot or run a successful authenticated sync.");
    }
  }

  async publicCatalogue() {
    const catalogue = await this.read();
    if (!catalogue) return { available: false, count: 0, revision: null, fetchedAt: null, services: [] };
    const services = catalogue.services.filter(service => service.active && service.eligible).map(publicService);
    return {
      available: true, count: services.length, revision: catalogue.receipt.revision,
      fetchedAt: catalogue.receipt.fetchedAt, services
    };
  }

  async quote(id, quantity, revision) {
    const catalogue = await this.read();
    if (!catalogue) throw new IntegrationError("CATALOGUE_UNAVAILABLE", "Service prices are not available yet.");
    if (!revision || revision !== catalogue.receipt.revision) {
      throw new IntegrationError("CATALOGUE_CHANGED", "Service prices changed. Refresh the catalogue before requesting a quote.", 409);
    }
    const service = catalogue.services.find(item => item.id === id && item.active && item.eligible);
    if (!service) throw new IntegrationError("SERVICE_UNAVAILABLE", "The selected service is unavailable.", 404);
    let amount;
    try { amount = Pricing.integer(quantity); }
    catch { throw new IntegrationError("INVALID_QUANTITY", "Enter a positive whole-number quantity.", 400); }
    if (amount < BigInt(service.min) || amount > BigInt(service.max)) {
      throw new IntegrationError("QUANTITY_OUT_OF_RANGE", `Quantity must be between ${service.min} and ${service.max}.`, 400);
    }
    return {
      serviceId: service.id, name: service.name, quantity,
      totalLkr: Pricing.agentTotalLkr(service.agentUsdRate, quantity), currency: "LKR",
      ratePer1000Lkr: service.ratePer1000Lkr, revision: catalogue.receipt.revision,
      sourceFetchedAt: catalogue.receipt.fetchedAt, quotedAt: new Date().toISOString(),
      orderCreated: false
    };
  }

  async sync() {
    if (this.syncing) throw new IntegrationError("SYNC_IN_PROGRESS", "A catalogue import is already running.", 409);
    this.syncing = true;
    let lock;
    const lockPath = join(this.directory, ".sync.lock");
    this.lastAttempt = { attemptedAt: new Date().toISOString(), succeeded: false, error: null };
    try {
      // Configuration is checked by retrieveAgentCatalogue before any network IO.
      const result = await retrieveAgentCatalogue(this.env, this.fetchImpl);
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      try { lock = await open(lockPath, "wx", 0o600); }
      catch (error) {
        if (error.code === "EEXIST") throw new IntegrationError("SYNC_LOCKED", "Another process holds the catalogue import lock. Confirm it has stopped before removing a stale lock.", 409);
        throw error;
      }
      const previous = await this.read();
      const old = new Map((previous?.services || []).map(service => [service.id, service]));
      const incoming = new Map();
      let duplicateCount = 0;
      for (const raw of result.services) {
        const service = normaliseService(raw, result.fetchedAt);
        const duplicate = incoming.get(service.id);
        if (duplicate) {
          if (JSON.stringify(duplicate.providerRecord) !== JSON.stringify(raw)) {
            throw new IntegrationError("CONFLICTING_SERVICE_IDS", "MFT Boost returned conflicting records for the same service ID. No prices were imported.");
          }
          duplicateCount++;
          continue;
        }
        service.firstImportedAt = old.get(service.id)?.firstImportedAt || result.fetchedAt;
        incoming.set(service.id, service);
      }
      verifyServicePrices([...incoming.values()]);
      const retired = [...old.values()].filter(service => !incoming.has(service.id)).map(service => ({ ...service, active: false }));
      const services = [...incoming.values(), ...retired];
      const eligibleCount = [...incoming.values()].filter(service => service.eligible).length;
      const receipt = {
        revision: randomUUID(), provider: "MFT Boost", endpoint: PROVIDER_ENDPOINT,
        authenticated: true, currencyVerified: "USD", agentAccountConfirmedByOwner: true,
        agentTierVerifiedByApi: false, rateSource: "authenticated_services_for_owner_designated_agent_key",
        fetchedAt: result.fetchedAt, receivedCount: result.services.length,
        uniqueReceivedCount: incoming.size, importedCount: eligibleCount,
        retainedForReviewCount: incoming.size - eligibleCount,
        inactiveCount: retired.length, duplicateCount,
        verifiedPriceCount: incoming.size, multiplier: "2.5", usdToLkr: "333",
        sourceSha256: createHash("sha256").update(result.sourceText).digest("hex")
      };
      await atomicJson(this.file, { schema: 1, receipt, services });
      this.lastAttempt.succeeded = true;
      return receipt;
    } catch (error) {
      const safe = error instanceof IntegrationError ? error : new IntegrationError("IMPORT_STORAGE_FAILED", "The catalogue could not be saved. No new catalogue was activated.");
      this.lastAttempt.error = { code: safe.code, message: safe.message };
      throw safe;
    } finally {
      if (lock) {
        await lock.close();
        await unlink(lockPath);
      }
      this.syncing = false;
    }
  }
}
