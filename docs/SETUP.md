# VEZLIO setup: Supabase + Netlify GitHub

This guide prepares deployment; it is not permission to publish. The code has not applied a remote migration, configured a domain, enabled payments or deployed a public site. Use a **dedicated VEZLIO Supabase project and Netlify site**; do not reuse ALPlanner or Lumerynx resources.

## 1. Prerequisites and checkout

- GitHub repository: `chdi4299-dotcom/chqamuidu`, target branch `main`.
- Review the feature branch/PR before merging. The existing storefront remains vanilla HTML/CSS/JS.
- Node.js 22.12+ and npm. Dependency versions are locked in `package-lock.json`.
- A Supabase project you control. No service-role key or database password is needed in this app's runtime.
- Domain ownership is required before configuring `vezlio.store`; the domain is currently a plan, not assumed to be purchased.

```sh
npm ci
cp .env.example .env
npm run check
npm test
npm run build
npm run dev
```

Open `http://localhost:8888`. Without project values, the storefront shows its original informational categories and `/admin` returns a locked setup-required page. Do not use `file://` or a plain static server for owner access: the Node/Netlify backend must run.

## 2. Configure a real Supabase project

1. Create a separate project named for VEZLIO, choose an available region appropriate for your users, and keep the database password in your password manager. Do not put it in the repository, chat, browser config or Netlify runtime.
2. Protect the Supabase/GitHub/Netlify administrative accounts with MFA. These infrastructure accounts have privileges beyond the website's RLS.
3. In Supabase Authentication settings, enable email/password login. Disable **Allow new users to sign up**, anonymous sign-ins and unused login providers for this owner-only release. There is no website signup endpoint. Existing/customer Supabase users still receive no admin access.
4. Enable **TOTP authenticator enrollment and challenge/verification** in Supabase MFA settings. Do not select “Verification Disabled”. This application uses TOTP; phone-only factors are not sufficient for its protected server routes.
5. Create **one real owner Auth user** in Authentication → Users using your own email and a strong unique password. Complete/confirm its email as appropriate. Copy that user's UUID; this is not an email address or a database role name.
6. Under project API settings, copy the project URL and a **publishable key** (`sb_publishable_…`). A legacy `anon` key also works. Do not use `sb_secret_…`, `service_role`, the JWT signing secret or the database password. The runtime rejects secret/service-role keys.
7. Set the Auth access-token/JWT expiry to **900 seconds (15 minutes)** for this owner workspace. The app does not retain refresh tokens; the owner signs in again on expiry. The server also rejects tokens issued more than one hour ago. Project signing keys may be asymmetric (recommended by Supabase) or legacy symmetric; verification uses the Supabase SDK and checks the project issuer/audience.
8. Keep only the intended public Data API schema exposed. **Never expose `vezlio_private`.** The migration grants no browser role access to that schema. Do not add permissive policies or grant customer roles table ownership/BYPASSRLS.

The site has no public password reset or factor-reset endpoint. Owner recovery uses trusted project administration, described in [SECURITY.md](SECURITY.md).

## 3. Apply the migration and designate the owner

The migration is `supabase/migrations/202610170001_owner_catalog.sql`. It is transactional and intended to run **once on the dedicated project**, using the database-owner SQL editor or a trusted migration terminal. It does not delete existing storefront files or touch any other project.

1. Open the project's Supabase SQL editor.
2. Paste the complete contents of the migration file and run it once. If any statement fails, the transaction rolls back; resolve the error before retrying. Do not remove security statements to bypass an error.
3. Open `supabase/designate-owner.sql` locally. Replace `REPLACE_WITH_REAL_SUPABASE_AUTH_USER_UUID` with the UUID copied in step 2.5, then run that script in the same trusted SQL editor. The unchanged marker deliberately fails. The foreign key also rejects a UUID that does not exist in Auth.
4. Do not commit a locally edited owner script. The tracked script retains its marker. In the server environment, set `SUPABASE_OWNER_UUID` to the **same** real UUID.

The owner configuration is a single-row table. There is no owner-change API, signup privilege, writable profile role or client-side admin flag. An empty/mismatched owner configuration denies access.

You can verify the designation using the trusted SQL editor:

```sql
select auth_user_id from vezlio_private.owner_config where singleton;
select tablename, policyname, roles, qual, with_check
from pg_policies where tablename like 'vezlio_%';
select relname, relrowsecurity from pg_class
where relname in ('vezlio_products','vezlio_packages','vezlio_services','vezlio_contact_settings');
```

Expected: one owner UUID, four `owner_mfa_only` policies plus four restrictive `owner_mfa_guard` policies, RLS enabled on all four catalogue/settings tables. Browser users cannot read the private owner table. Do **not** test RLS by reading public tables as the SQL editor's database owner; that privileged role bypasses RLS.

Tables created:

| Table/function | Purpose | Browser/Data API access |
| --- | --- | --- |
| `vezlio_private.owner_config` | One designated Auth UUID | No anon/authenticated grants |
| `public.vezlio_products` | Products and private sourcing notes | Owner UUID + `aal2` only |
| `public.vezlio_packages` | Real plans, optional LKR prices/support | Owner UUID + `aal2` only |
| `public.vezlio_services` | Legitimate listings and private compliance notes | Owner UUID + `aal2` only |
| `public.vezlio_contact_settings` | Public business contact values | Owner UUID + `aal2` for table access |
| `public.vezlio_is_owner()` | Boolean DB authorization check | Returns no owner identity or private data |
| `public.vezlio_public_catalog()` | Explicit published-field projection | Readable by anon/authenticated |

Products, packages and services start empty. The migration seeds only the owner's supplied WhatsApp `94788245211` and Telegram `https://t.me/VEZLIO`. It creates no order, customer-payment or transaction tables.

## 4. Environment variables

Use `.env` locally (gitignored). On Netlify, use the site's environment-variable UI and the stated scopes/contexts. Do not put runtime values in `netlify.toml`, `config.js`, HTML, GitHub Actions secrets or a frontend `PUBLIC_`/`VITE_` variable.

| Variable | Local value/source | Netlify scope and production setting |
| --- | --- | --- |
| `SUPABASE_URL` | Your project URL, `https://<project-ref>.supabase.co` | **Functions**, Production |
| `SUPABASE_PUBLISHABLE_KEY` | Your project's publishable key (or legacy anon key) | **Functions**, Production; not a service-role key |
| `SUPABASE_OWNER_UUID` | The one Auth UUID matching the private DB row | **Functions**, Production |
| `SITE_ORIGIN` | Exactly `http://localhost:8888` | **Functions**, Production; exact canonical HTTPS origin, initially your approved Netlify URL, eventually `https://vezlio.store` |
| `VEZLIO_LOCAL_DEV` | `1` for the local Node server | **Unset** on Netlify |
| `VEZLIO_ALLOW_NETLIFY_DEPLOY` | Leave blank; local packaging does not require it | **Builds**, Production; leave unset until explicit approval, then deliberately set `approved` |
| `PORT` | Optional local override; update `SITE_ORIGIN` to match | Not needed on Netlify |
| `NODE_VERSION` / `AWS_LAMBDA_JS_RUNTIME` | Node 22.12+ locally | Already declared as Node 22 / `nodejs22.x` in `netlify.toml` |

`SITE_ORIGIN` has no trailing slash, path, query or fragment. Hosted authentication requires HTTPS. Alternate/preview hosts cannot perform owner operations. Cookies are host-only, so a domain change requires a fresh owner sign-in.

## 5. First owner sign-in and real content

1. Start `npm run dev` with the real project configuration.
2. Visit `http://localhost:8888/admin`. You are sent to `/admin/login`.
3. Enter the designated owner's email/password. Customer accounts cannot proceed.
4. For first setup, choose **Set up an authenticator**, scan the QR code in your authenticator app, and enter its current six-digit code. Keep the displayed manual key private. Setup does not grant catalogue access until verification succeeds.
5. Later logins require the existing authenticator code. The UI does not replace/remove verified factors using a password-only session.
6. Add real products in **Products & plans**. Leave unsupported facts empty. A product cannot be published until its right-to-offer/platform-terms review is confirmed. Internal authorization notes are never in the public catalogue.
7. Save the product, then add actual subscription plans. Leave unknown LKR prices, durations or support terms blank. Availability defaults to “Contact to confirm”. Publish only confirmed plans.
8. Add genuine advertising, content-strategy, creator-outreach or community-promotion listings under **Promotion services**. Each package/listing has its own unique service ID, scope and optional confirmed LKR price/terms. Use separate listings/IDs for separate service packages. Do not list fake engagement, invented refill/warranty promises or unsupported results.
9. Edit **Contact settings** as needed. Blank destinations disable that contact flow. When the API is available, the database is authoritative; `config.js` is only the static/offline contact fallback.
10. Refresh the storefront to load published changes. Search and filters continue working. Product/service enquiries include the selected offer details and open a WhatsApp draft; the visitor still chooses whether to send it. No order/payment is created.

Edits use `updated_at` for conflict detection. If another tab changed a record, reload before editing again. Product deletion also deletes its packages. No customer-order management is presented because no customer orders backend is implemented.

## 6. Validate before any publication

```sh
npm run check
npm test
npm run test:rls
npx playwright install chromium
npm run test:browser
npm run build
npm run test:live
```

- Normal tests require no credentials or remote resources. PGlite runs the actual migration and RLS in a PostgreSQL engine; JWT tests verify real cryptographic signatures with test keys. Browser tests use **isolated test-only Auth/data fixtures**, not a fake production sign-in.
- `test:live` intentionally skips unless a **disposable real Supabase project** is explicitly configured. See [VALIDATION.md](VALIDATION.md) for exact opt-in variables. It creates/deletes unpublished security-test fixtures only, never orders/payments.
- Test the configured project manually on desktop and mobile: correct owner password → mandatory MFA → workspace; wrong OTP rejected; logout/refresh/back navigation; add/edit/delete a draft; selected plan and WhatsApp draft; missing contacts; customer/anonymous denial. No real messages or payments need to be sent.
- GitHub Actions validates syntax, Node/security/RLS tests and local packaging. It has no deployment or database credentials and applies no migration.

## 7. Prepare Netlify GitHub deployment — remain unpublished

A Netlify Git import may immediately attempt a deployment. **Do not connect/create/publish a site until the owner explicitly approves doing so.** The checked-in build guard is a backstop, not an instruction to publish now.

After approval:

1. In Netlify, import only `chdi4299-dotcom/chqamuidu` from GitHub. Choose the reviewed `main` as the production branch, repository root as the base, build command `npm run check && npm test && npm run build`, publish directory `dist`, functions directory `netlify/functions`. The checked-in `netlify.toml` supplies these values.
2. Disable Deploy Previews and branch deploys in the Netlify UI. They are also blocked by their build-context commands even if the production approval flag exists.
3. Set the four required Functions variables in section 4 with your actual values. Never add a service-role key. Set `SITE_ORIGIN` to the single intended HTTPS address.
4. Only with explicit publication approval, set `VEZLIO_ALLOW_NETLIFY_DEPLOY=approved` in the **Builds / Production** scope. Trigger/retry the production build. Without the flag, the build exits before producing deployable output.
5. Verify the deployment bundles one `vezlio` Node function. Its custom routes serve `/admin`, `/admin/*` and `/api/*`. Do not add a catch-all static rewrite to `index.html`; `/admin` must execute the server authorization gate. There is no static `admin.html` to bypass it.
6. Enable the site's available access protection if the approved deployment should remain private. An unguessable Netlify URL or `noindex` does **not** make the whole storefront private. This code protects admin/data; it does not by itself password-protect the public storefront.
7. Check the actual deployed `/admin`/API responses: HTTPS, cookies with Secure/HttpOnly/SameSite, `Cache-Control: no-store`, MFA and customer denial, no function console errors or exposed server files. Confirm the Netlify per-IP/domain rate limit applies; Supabase also enforces Auth/MFA rate limits.
8. Future GitHub merges to the production branch can trigger automatic publication while the flag remains set. Stop builds/unset the flag when publication is not authorized. A code rollback cannot undo database data changes; back up the database before later schema changes.

The runtime rejects missing configuration and server/database owner mismatches. Do not use disabled RLS, client role flags or an exposed service-role key to “fix” a setup error.

## 8. Planned `vezlio.store` custom domain — only after approval

No domain purchase, DNS change or public deployment is performed here.

1. Confirm you own/control `vezlio.store`. In the approved Netlify site's **Domain management**, add `vezlio.store` and `www.vezlio.store`. Choose `vezlio.store` as the primary domain and use Netlify's primary-domain redirect for the other hostname.
2. Use the DNS values shown in **that site's** domain-verification dialog. With external DNS, the standard recommended apex record is ALIAS/ANAME/flattened CNAME `@` → `apex-loadbalancer.netlify.com`; if unsupported, Netlify's standard fallback is an A record `@` → `75.2.60.5`. High-Performance Edge can use different values; the site's dialog takes precedence.
3. Set `www` CNAME → your actual `<site-name>.netlify.app`. Preserve existing email MX/TXT records. Remove only conflicting web-host records after checking their purpose. If using Netlify DNS instead, use its assigned nameservers and recreate needed email records before delegation.
4. Wait for DNS verification, then confirm the Netlify-managed HTTPS certificate covers both hostnames. Do not enter owner credentials while HTTPS/certificate validation is failing.
5. Change the Functions `SITE_ORIGIN` to exactly `https://vezlio.store`, update Supabase Auth's Site URL to the same origin, and apply the environment change with the approved deploy. This password/TOTP flow has no OAuth/email callback handler; do not add broad wildcard Auth redirect URLs.
6. Verify `https://vezlio.store/`, `/admin`, direct page refresh and logout. Sign in again because host-only cookies from the prior Netlify hostname do not transfer. Other hosts must redirect at Netlify or return a safe canonical-host error from protected routes.

## Primary references

- Supabase: [MFA enforcement](https://supabase.com/docs/guides/auth/auth-mfa), [TOTP](https://supabase.com/docs/guides/auth/auth-mfa/totp), [verified claims](https://supabase.com/docs/reference/javascript/auth-getclaims), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [production checklist](https://supabase.com/docs/guides/deployment/going-into-prod).
- Netlify: [Functions API and routes](https://docs.netlify.com/build/functions/api/), [runtime environment variables](https://docs.netlify.com/build/functions/environment-variables/), [file configuration](https://docs.netlify.com/build/configure-builds/file-based-configuration/), [external DNS](https://docs.netlify.com/manage/domains/configure-domains/configure-external-dns/), [HTTPS](https://docs.netlify.com/manage/domains/secure-domains-with-https/https-ssl/).
