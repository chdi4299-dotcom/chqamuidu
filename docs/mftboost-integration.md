# MFT Boost Agent integration

## Configure secrets

Use the hosting service's server environment/secret settings, or a private local `.env` file when developing. `.env`, private snapshots and temporary import files are excluded from Git. The server serves only explicitly allowed frontend files.

| Variable | Purpose |
| --- | --- |
| `MFTBOOST_API_KEY` | Actual API key copied securely from the owner's authenticated Agent account. Never a password or public price source. |
| `MFTBOOST_ACCOUNT_TIER` | Set to `agent` after confirming the key belongs to the Agent account. This is owner attestation, not API verification of account tier. |
| `VEZLIO_ADMIN_TOKEN` | Independent owner token. Generate with `openssl rand -hex 32`; store as a secret. Never reuse the provider key. |
| `VEZLIO_DATA_DIR` | Persistent private directory, default `./private-data`. Keep it outside public hosting directories. |
| `PUBLIC_ORIGIN` | Exact HTTPS production origin, without a path or trailing slash. Required with `NODE_ENV=production`. |
| `HOST`, `PORT` | Bind interface and port. Defaults `127.0.0.1:8000`; use an appropriate container interface behind the HTTPS reverse proxy. |

Do not supply an API key through chat, URL parameters, `config.js`, frontend environment variables or GitHub source. If the account is not authenticated or the key is missing, stop the live import and configure the server secret through the host's secure interface.

The new `/admin/boosting` console accepts only the separate owner token. It holds the token in page memory, clears it when locked/closed, and uses an Authorization header. It does not store credentials in localStorage, sessionStorage, cookies or URLs. Use HTTPS; loopback HTTP is allowed for local development. Server-side authorization runs on every private read and sync. Cross-origin mutations are rejected and requests are rate-limited. Rotate the owner token through the host secret settings if access needs to be revoked. This is a separate integration console because the supplied source has no existing auth/admin backend.

## Read-only provider contract

Official documentation: https://mftboost.com/api

Endpoint: `https://mftboost.com/api/v2`; POST form body contains `key` and a fixed `action`.

1. `action=balance` verifies that the authenticated account currency is USD. Balance amounts are not retained or returned to customers.
2. `action=services` retrieves the account-specific service catalogue. Only that authenticated response supplies rates.

There is no public-catalogue fallback. The API reference's sample rows are not imported. No provider order endpoint, action proxy, `action=add`, refill or cancel operation exists in this integration. Browsing and requesting a quote cannot charge the provider account.

The documented response includes no account-tier identity field. A successful key-authenticated request establishes the rates returned for that key, not independent proof of Agent status. The owner must confirm the key belongs to their Agent account; compare a returned service rate against the signed-in account before enabling commerce. The receipt distinguishes `agentAccountConfirmedByOwner` from `agentTierVerifiedByApi`.

## Validation, import and retention

Service IDs remain the exact original source IDs; numeric IDs must be safe integers and string IDs must be positive integer strings. Names, categories, types, descriptions and original source properties are retained. Rates must be non-negative plain decimal **strings** as documented; numeric JSON rates are rejected to avoid silent precision loss. Quantity limits must be consistent integer ranges.

Every valid source record is saved privately. `Default` is the eligible service type for this implementation's simple quantity quote flow. Other types, including packages, subscriptions and custom-input services, stay in the admin review list; they are not represented as per-1,000 quantity offers without verifying their billing/input contract. Unsupported types may have zero limits and remain private. No eligibility is inferred from invented service names or prices.

If the provider includes a platform field, it is retained. Otherwise the platform filter is derived from the real name/category; `platformSource` explicitly records this inference. The original category is never replaced. An unmatched platform is grouped under `Other`.

Identical duplicate IDs are collapsed. Conflicting duplicates, malformed rows, a non-USD currency, empty response, transport failure or invalid JSON aborts the whole import. A prior good snapshot stays available with its original retrieval timestamp. Missing IDs are made inactive on the next successful import; their prior records remain retained. Repeated imports update the same IDs and preserve `firstImportedAt`.

The snapshot is atomically replaced after verification, with file mode `0600` in a private directory created with mode `0700`. A cross-process lock prevents concurrent writes. Use a single running Node instance with persistent storage for this implementation. After a crash, remove a stale `.sync.lock` only after verifying no import process is running. A database-backed shared store is required before scaling to multiple hosts. Back up the private directory securely.

## Pricing and customer quotes

The fixed multiplier is `2.5` and USD exchange rate is `333`. Neither comes from a live FX feed. BigInt rational arithmetic preserves all decimal places. Converted rates are not rounded or formatted with `toFixed()` before calculating totals. The final whole-LKR total is the mathematical ceiling.

The server rechecks every converted rate and the minimum, maximum and 1,000-unit arithmetic before saving. Public cards use the same exact decimal calculation. The enquiry button requests a server quote using the original service ID, quantity and catalogue revision; the server validates the range and recomputes using the private USD rate. A stale revision produces HTTP 409 and requires a refreshed catalogue. A quote verifies the saved catalogue price; provider availability is confirmed separately before payment.

Customers can search by service name, category or original ID, filter by platform/category, inspect descriptions and actual refill/cancellation/drip-feed flags, and select quantity. Rendering is paginated in batches of 24 cards. No-card/unavailable states never show sample services. General campaign enquiries and existing tool browsing remain functional without a provider catalogue.

Public API: `GET /api/boosting/services`, `POST /api/boosting/quote`.

Owner API: `GET /api/admin/boosting`, `POST /api/admin/boosting/sync`.

No API accepts a customer-supplied cost, exchange rate or multiplier. No raw cost, complete provider record or API key is included in a public service or quote response.

## Verification receipt

After a successful import, the private receipt records authentication, USD currency verification, exact endpoint, retrieval timestamp, actual received count, unique count, customer catalogue count, review/inactive/duplicate counts, verified-price count, source SHA-256 and catalogue revision. The public response shows the eligible count and source retrieval timestamp. The timestamp is when this server retrieved the source, not an invented provider update time.

Do not report a live import as complete until the owner's actual key has returned a catalogue, the receipt exists and the real customer-facing rows/quantity quotes have been checked. Keep deployment separate from this source branch and obtain owner approval before publishing.
