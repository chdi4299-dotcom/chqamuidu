export const PROVIDER_ENDPOINT = "https://mftboost.com/api/v2";
const MAX_BYTES = 32 * 1024 * 1024;

export class IntegrationError extends Error {
  constructor(code, message, status = 503) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function assertAgentConfiguration(env) {
  if (!env.MFTBOOST_API_KEY?.trim()) {
    throw new IntegrationError("MFTBOOST_API_KEY_MISSING", "Set the server-side MFTBOOST_API_KEY secret from your authenticated Agent account.");
  }
  if (env.MFTBOOST_ACCOUNT_TIER !== "agent") {
    throw new IntegrationError("AGENT_ACCOUNT_UNCONFIRMED", "Confirm the configured key belongs to your Agent account, then set MFTBOOST_ACCOUNT_TIER=agent. The API does not report the account tier.");
  }
  if (env.MFTBOOST_API_KEY === env.VEZLIO_ADMIN_TOKEN) {
    throw new IntegrationError("SEPARATE_ADMIN_TOKEN_REQUIRED", "The owner token must be different from the provider API key.");
  }
}

async function readJson(response) {
  if (Number(response.headers.get("content-length")) > MAX_BYTES) {
    throw new IntegrationError("PROVIDER_RESPONSE_TOO_LARGE", "The provider catalogue exceeded the safe response size.");
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > MAX_BYTES) {
      throw new IntegrationError("PROVIDER_RESPONSE_TOO_LARGE", "The provider catalogue exceeded the safe response size.");
    }
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  try { return { data: JSON.parse(text), text }; }
  catch { throw new IntegrationError("PROVIDER_INVALID_JSON", "The provider did not return a valid JSON response."); }
}

// Deliberately no action=add, order, refill, cancel, or generic provider proxy.
async function readProvider(action, apiKey, fetchImpl) {
  if (!["balance", "services"].includes(action)) throw new Error("Read-only provider action required.");
  let response;
  try {
    response = await fetchImpl(PROVIDER_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({ key: apiKey, action }),
      signal: AbortSignal.timeout(30_000),
      redirect: "error"
    });
    if (!response.ok) {
      throw new IntegrationError("PROVIDER_HTTP_ERROR", `Provider authentication/request failed (HTTP ${response.status}).`);
    }
    const result = await readJson(response);
    if (result.data && !Array.isArray(result.data) && Object.hasOwn(result.data, "error")) {
      // Never echo provider error text: it can contain credentials or private data.
      throw new IntegrationError("PROVIDER_REJECTED_REQUEST", "MFT Boost rejected the authenticated request. Check the key and its API access in your account.");
    }
    return result;
  } catch (error) {
    if (error instanceof IntegrationError) throw error;
    throw new IntegrationError("PROVIDER_UNREACHABLE", "The authenticated MFT Boost request could not complete. No catalogue was replaced.");
  }
}

export async function retrieveAgentCatalogue(env, fetchImpl = fetch) {
  assertAgentConfiguration(env);
  const key = env.MFTBOOST_API_KEY.trim();
  // Currency must come from this authenticated account, never from assumptions.
  const balance = await readProvider("balance", key, fetchImpl);
  if (balance.data?.currency !== "USD") {
    throw new IntegrationError("ACCOUNT_CURRENCY_NOT_USD", "The authenticated account currency is not confirmed as USD. Import stopped before applying the fixed USD-to-LKR conversion.");
  }
  const { data, text } = await readProvider("services", key, fetchImpl);
  if (!Array.isArray(data) || data.length === 0) {
    throw new IntegrationError("EMPTY_OR_INVALID_CATALOGUE", "No non-empty authenticated service catalogue was returned. Existing records were preserved.");
  }
  return { services: data, sourceText: text, fetchedAt: new Date().toISOString() };
}
