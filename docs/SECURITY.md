# Owner workspace security

## Trust boundary

The public storefront remains a static application. Browser JavaScript does not decide who is an administrator. `/admin` is HTML returned by a Netlify Function only after authorization; no protected dashboard HTML is copied into `dist/`.

Every admin page and catalogue/settings read/create/update/delete repeats:

1. Read the host-only HttpOnly access-token cookie. Request headers, localStorage, URL parameters, profile flags and `user_metadata` cannot designate an owner.
2. Use Supabase `getClaims(token)` for verified claims and `getUser(token)` for a network-backed account check. Check issuer, audience, subject, expiry, role and issue time. Never authorize from a raw decoded JWT or `getSession()`.
3. Match **both** the verified subject and returned user ID to `SUPABASE_OWNER_UUID`.
4. Require signed `aal2` and a currently verified TOTP factor on that user.
5. Call `vezlio_is_owner()` using that user's JWT. PostgreSQL compares `auth.uid()` with the single UUID in `vezlio_private.owner_config` and requires signed `aal2` plus the authenticated database role.
6. Perform the data operation with the same user JWT and the publishable key. RLS checks the authorization rule again for the actual SELECT/INSERT/UPDATE/DELETE. Mutations also require the configured Origin, a matching CSRF token, JSON content type and whitelisted validated fields.

The app does not use a service-role key or database password. Adding one to browser configuration is forbidden; the runtime key validator also rejects secret/service-role keys. Infrastructure-level Supabase/database administrators are trusted and can bypass/change policies; protect those accounts separately.

## Access matrix

| Caller | Login/MFA screen | Public catalogue projection | Protected admin page/API | Protected tables through Data API |
| --- | --- | --- | --- | --- |
| Unauthenticated | Public login only | Published public fields | Denied / login redirect | No direct privileges |
| Customer, `aal1` or `aal2` | No owner enrollment/access | Published public fields | Denied | RLS denies reads/writes |
| Designated owner, `aal1` | Password-authenticated TOTP setup/challenge only | Published public fields | MFA required | RLS denies reads/writes |
| Designated owner, `aal2`, verified TOTP | Allowed | Published public fields | Allowed if DB designation also matches | Owner RLS permits CRUD |
| Owner UUID differs between server and DB | No catalogue privileges | Published public fields | Denied | DB authorizes only its configured UUID; server authorizes only its configured UUID |

There is no endpoint to set roles or the owner UUID. The protected singleton is not exposed through PostgREST. Roles `anon` and `authenticated` cannot access its schema/table or create objects in `public`. No customer-editable metadata is part of a policy. Each protected table also has a restrictive owner/MFA guard, so adding a broad permissive policy cannot silently bypass this condition.

## Public projection and SQL functions

Raw product/package/service/settings tables are owner-only, including published rows. Public users call the zero-argument `vezlio_public_catalog()` function instead. Its fixed SQL returns only reviewed, published listings and enumerated public fields. It never returns authorization/compliance notes, drafts, timestamps, the owner UUID, customer data or orders.

`vezlio_public_catalog()` is a deliberate **SECURITY DEFINER** boundary: the migration/database owner reads protected tables to form the safe projection. `vezlio_is_owner()` also uses definer rights solely to read the private designation. Both use an empty `search_path`, qualified object references, fixed SQL, no user-controlled SQL and explicit execution grants. Do not add arbitrary arguments, `SELECT *`, dynamic SQL or internal fields to the public function. Keep the function/table owner trusted; do not grant ownership/BYPASSRLS to application roles.

## Sessions and MFA

- Production cookies use the `__Host-` prefix, Secure, HttpOnly, Path `/`, no Domain and SameSite Strict. A localhost-only explicit development mode uses separate cookie names without Secure.
- Refresh tokens returned by Supabase are not persisted or sent to the browser. Sessions end when the access token expires (recommended project expiry: 15 minutes; application maximum issue age: one hour). Re-authentication is intentional.
- Login, logout, MFA setup/verify and all catalogue mutations require same-origin CSRF verification. There is no permissive CORS. The canonical origin is server-configured, not taken from an arbitrary Host/Origin header.
- First TOTP enrollment is available only to the designated password-authenticated owner with no verified factor. Existing verified factors cannot be replaced or removed through these endpoints. Incomplete setup may be restarted; only unverified TOTP factors are removed during that restart.
- Challenge IDs and codes are verified by Supabase Auth. The application validates the chosen factor belongs to the verified owner and re-verifies the upgraded JWT before issuing an admin cookie.
- QR/secret values are returned only during authorized setup with `no-store`. The QR is shown in an image context, not inserted as executable SVG/HTML. Do not share the manual secret.
- Auth responses and errors omit access/refresh tokens, passwords, OTPs, SQL details and private exceptions. Catalogue input is rendered as escaped text/DOM text content.
- Netlify's function-level rate limit is configured for 120 requests/minute per IP/domain; Supabase also rate-limits Auth/MFA. Confirm host enforcement after an approved deployment. No in-memory limiter is presented as distributed protection.

Signing out clears the cookie and asks Supabase to revoke that session's refresh capability. Already-issued JWTs can remain cryptographically valid until expiry; sign-out is not a promise of instant JWT invalidation at the Data API. The app additionally checks current user/factor status on protected server requests. **Remove the owner designation for immediate database privilege revocation**, including for a stolen still-valid owner JWT.

## Owner recovery or suspected compromise

Use trusted Supabase project administration with its own MFA; do not add a password-only factor reset to the website.

1. Immediately lock database admin access using the trusted SQL editor:

   ```sql
   delete from vezlio_private.owner_config where singleton;
   ```

   This removes RLS admin privileges. It does not delete the owner's Auth account or catalogue data. Stop Netlify builds while investigating and remove any exposed credential from its source.
2. Recover the owner's Auth account/password and revoke sessions through trusted Supabase administration. If a TOTP device was lost, use the official [Auth Admin MFA API](https://supabase.com/docs/reference/javascript/auth-admin-mfa-deletefactor) from a trusted administrative environment. Any service-role credential used for that manual recovery stays outside this app/repository/browser and must never become a runtime variable here. Review who has infrastructure access.
3. To enroll a replacement factor while database access remains locked, sign in through the local configured owner UI after the old factor has been removed by the trusted administrator. Enroll and verify the new TOTP factor. The workspace will still deny data access because the DB designation is empty; the new factor is nevertheless verified by Supabase.
4. After verifying the legitimate owner, restore the one designation with `supabase/designate-owner.sql` and matching server UUID. Test MFA and the authorization matrix again. For a new Auth user UUID, update both places deliberately; no metadata edit can transfer ownership.
5. Review changed products, prices, contacts, service claims and Supabase/Netlify logs before resuming publication. Rotate signing/API/infrastructure credentials if the incident warrants it, following provider procedures.

There is no application-specific immutable audit log or backup scheduler in this small release. Use the project's actual provider logs/backups and export catalogue data before major changes; do not assume an audit or recovery feature exists because a UI control is present.

## Orders, payments and limits

No orders, customers, wallets, payments, webhooks or fulfillment API is implemented. Enquiry URLs are generated locally and contain only what the visitor chooses to share. No message is sent automatically and no transaction is inferred from a browser redirect. A future orders backend needs its own schema, customer isolation, server validation and tests before those controls can be enabled.

The public legal text remains explicitly draft. Owner-entered facts and rights-to-offer/platform compliance require business verification; a publish checkbox cannot verify a third party's authorization. The admin boundary does not make the public storefront private. Netlify site-access controls and explicit publication approval are separate hosting decisions.

## Primary references

[Supabase verified claims](https://supabase.com/docs/reference/javascript/auth-getclaims) · [MFA enforcement](https://supabase.com/docs/guides/auth/auth-mfa) · [RLS and metadata caveats](https://supabase.com/docs/guides/database/postgres/row-level-security) · [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) · [Netlify Functions API](https://docs.netlify.com/build/functions/api/)
