# VEZLIO — Everything Digital. One Place.

Existing light-mode storefront plus a server-only MFT Boost Agent catalogue integration. The original product discovery, search, category filters, navigation, campaign enquiry form, FAQ assistant, support links and policy dialogs remain available.

## Run

Requires Node.js 22.9 or newer. No third-party runtime dependencies.

```sh
cp .env.example .env
chmod 600 .env
npm start
```

Open `http://127.0.0.1:8000`. With no provider credentials, the marketplace honestly reports that prices are unavailable. It contains **no fallback catalogue, service IDs or prices**.

The integration admin is at `/admin/boosting`. Configure a separate strong `VEZLIO_ADMIN_TOKEN` server secret to unlock its private data. Never put secrets in public `config.js`, browser code, Git or chat.

## Import your actual Agent catalogue

Configure `MFTBOOST_API_KEY` as a server secret from your own authenticated Agent account. After confirming the key's account tier, set `MFTBOOST_ACCOUNT_TIER=agent`. The official API does not return an Agent-tier claim. Use either the owner integration console or:

```sh
npm run sync:mftboost
```

The importer performs read-only authenticated `balance` and `services` requests to `https://mftboost.com/api/v2`, requires USD account currency, validates source IDs and decimal rates, verifies every conversion, and atomically saves a private snapshot. Imports are manual; startup and browsing never import or create paid orders.

Customer pricing:

```text
Rate per 1,000 = Agent USD rate × 2.5 × 333
Quantity total = CEIL(Agent USD rate × quantity × 2.5 × 333 / 1000)
```

Rates remain full-precision decimal strings. Only the final quantity total rounds up to whole LKR. Raw USD costs and complete source properties are restricted to the owner API. Public services expose converted prices, exact names, original IDs, categories, quantity limits, descriptions and supported source properties.

All validated source records are retained without duplicate IDs. `Default` services with valid quantity limits are eligible for customer quotes. Other service types remain private for review until their pricing basis and required inputs are verified. Services absent from a later snapshot become inactive while their previous records remain retained.

## Verify

```sh
npm test
```

See [MFT Boost setup and operational details](docs/mftboost-integration.md) and [the verification record](docs/mftboost-verification.md).

## Hosting and scope

This integration requires the Node server and a persistent private data directory; serving the repository with a generic static file server is unsuitable for live imports and may expose private files. Use the explicit static allowlist in the supplied server, HTTPS in production, and keep the private data directory on persistent storage outside a public web root.

The requested repository's `main` at `58f43498ef5850dd2c8276992f03fc6d2415bd8d` contained six static files, with no existing videos, customer authentication, database or admin implementation. This change preserves that source version and adds a separate provider integration console. It does not replace an independently hosted, newer VEZLIO application.

Customer accounts, checkout, payments, paid provider ordering and general product management are not implemented by this change. Existing product listings and campaign forms continue to prepare enquiries. No website deployment or publication is part of this integration branch.
