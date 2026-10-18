# Validation and remaining live setup

The implementation is based on GitHub `main` commit `58f43498ef5850dd2c8276992f03fc6d2415bd8d`, on an isolated feature branch. The existing six-file storefront layout and enquiry behavior are retained. No unrelated repository, remote database, DNS record, payment provider or public deployment is changed.

## Recorded local results (2026-10-18)

- **79/79 Node security/database/packaging checks passed**, including the actual PostgreSQL RLS migration tests. The same 79 checks passed under Node.js 22, the configured deployment runtime, as well as the workspace's Node.js 24.
- **14/14 Chromium browser cases passed**, across desktop and an emulated phone viewport/touch environment. They exercised storefront discovery, mandatory MFA and incorrect codes, first TOTP setup, product/plan creation, price edits, package selection, service/contact updates, deletion, missing-data fallbacks, XSS text rendering and no horizontal overflow. No uncaught page exceptions were observed in the checked flows. This is browser emulation, not a claim of physical-device testing.
- JS/credential-pattern checks, `git diff --check` and the local allowlisted build passed. A Node 22-targeted esbuild bundle of the Netlify function was created and invoked locally; it returned a locked/no-store setup response when configuration was absent. This does not verify Netlify's hosted routing or edge controls.
- Runtime `npm audit --omit=dev` reported **0 known vulnerabilities** at validation time; this is not a security guarantee or an audit of future dependency versions.
- The live Supabase test was **skipped**, as intended: no real project settings, owner UUID or ephemeral provider sessions have been supplied. No hosted endpoint, remote migration, DNS setup or real payment was exercised.

Browser validation identified a credential-form fallback issue. All owner forms now use POST, and submit buttons stay disabled until the CSRF/session initialization and handlers are ready. A regression case delays initialization and verifies that passwords cannot enter a query string through the normal form flow.

## Repeatable checks

| Command | What it establishes | Boundary |
| --- | --- | --- |
| `npm run check` | JS syntax and embedded-credential pattern checks | Not a substitute for review |
| `npm test` | API authorization/CSRF/input tests, cryptographic JWT checks, PostgreSQL RLS and packaging/deploy guards | Local execution with isolated fixtures |
| `npm run test:rls` | Applies the real SQL migration to PGlite PostgreSQL; tests anon/customers/owner `aal1` denial and owner `aal2` CRUD | Supabase Auth helpers/JWT context are simulated, not a live Auth service |
| `npm run test:browser` | Real HTML/JS navigation/forms, MFA UI, plans/prices, services, contacts, enquiry drafts, mobile layouts, XSS text rendering and console exceptions | Isolated test-only Auth/data transport; not proof of live provider setup |
| `npm run build` | Allowlisted public `dist/`; protected templates/server/config stay outside publish output | Packages locally; does not deploy or bundle a Netlify-hosted runtime |
| `npm run test:live` | Optional real Supabase signature/user/MFA/RLS checks, including direct Data API attempts | Requires explicit disposable-project setup and fresh test JWTs |

Normal tests have no production credentials and create no real customer orders or payments. Browser fixtures are under `tests/browser/`; production imports never load them, and the public build excludes them. There is no production demo-login switch.

## Tests covered

- Anonymous/customer (`aal1` and `aal2`) cannot read/create/update/delete protected catalogue/settings data.
- The owner without MFA, without a verified TOTP factor, or with a server/DB UUID mismatch is denied.
- JWT payload tampering, invalid signatures, expiry, wrong issuer/audience/role, future/old issue time, deleted users and user/subject mismatch are rejected.
- Client-supplied admin/owner/role/metadata fields do not grant privilege; unexpected write fields are rejected.
- Every admin CRUD request verifies the server session and database designation before accessing data.
- Same-origin and CSRF checks apply to login, MFA, logout and catalogue mutations; cross-site requests, invalid content and oversized bodies fail.
- Existing verified MFA factors cannot be replaced from a password-only session. Factor ownership and upgraded tokens are checked.
- Direct table access is denied by PostgreSQL permissions/RLS, even when bypassing the website API.
- The public RPC contains only reviewed published records and named contact fields, never drafts/internal notes or the owner UUID.
- Owner-only SQL constraints enforce publication review, legitimate promotion methods, valid prices and contact destinations.
- Public packaging does not expose `.env`, server templates, tests or migrations; hosted builds require approval and branch/PR deploys are blocked.

## Run the browser suite

```sh
npm ci
npx playwright install chromium
npm run test:browser
```

The suite starts its own test-only server on `127.0.0.1:8991`, uses independent desktop/mobile browser contexts, intercepts enquiry windows and sends no external message. It does not connect to Supabase. For a preinstalled compatible Chromium executable, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its absolute path before running the suite. Browser binaries are not committed or deployed.

## Optional real Supabase test

**Never use the production catalogue for this test.** Use a disposable VEZLIO test project, apply the migration and designate its actual owner. Complete TOTP enrollment for that owner and a separate test customer. The test customer must not be the designated UUID.

Place these local-only values in the gitignored `.env` (never in chat, a PR, browser source or logs):

```dotenv
VEZLIO_TEST_DISPOSABLE=YES_I_AM_USING_A_DISPOSABLE_PROJECT
SUPABASE_TEST_OWNER_AAL1_JWT=<fresh-password-only-owner-access-token>
SUPABASE_TEST_OWNER_AAL2_JWT=<fresh-owner-access-token-after-TOTP>
SUPABASE_TEST_CUSTOMER_AAL2_JWT=<fresh-separate-customer-access-token-after-TOTP>
```

The four ordinary server variables from `SETUP.md` must reference this disposable project and its designated owner. Acquire the short-lived sessions through your own trusted Supabase sign-in/testing tooling; a password-only owner token must be captured before TOTP verification, and the other tokens after their own TOTP verification. Do not use a service-role token or spoof/decode-only claim as a substitute. Do not overwrite your production environment values.

```sh
npm run test:live
```

This opt-in runner verifies the real signed sessions, creates unpublished security-test product/plan/service fixtures, attempts forbidden anonymous/customer/owner-`aal1` reads and writes through Supabase's Data API, and deletes its fixture records in `finally`. All prices are null and nothing is published. If interrupted or a test exposes a policy defect, inspect/remove the marked `SECURITY TEST ONLY` records in that disposable project. Contact-update denial is tested against the disposable project's singleton. An unset opt-in flag reports a skip rather than claiming success.

## Deployment and manual acceptance

Live Supabase MFA enrollment, a real Netlify function bundle/route, host rate limiting, HTTPS/custom-domain behavior and deployed browser checks remain unverified until actual project values are configured and publication is approved. No real project values or designated owner UUID have been provided in this task.

Before approval, verify locally with the real project: correct owner password then TOTP; wrong password/code; expired session and logout; protected direct URL/refresh/back navigation; draft/public records and real selected-package terms; blank contacts; customer/direct API denial. After an approved deployment, repeat on the canonical HTTPS origin and confirm function response headers, no public server files, both screen sizes and DNS/certificate behavior.
