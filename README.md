# VEZLIO — Digital Tools & Social Promotion Storefront

A dependency-free, responsive **light-mode storefront foundation** for the planned `vezlio.store` domain.

## What is implemented
- Accessible, responsive landing page and mobile navigation
- Product discovery catalog for YouTube Premium, Spotify, CapCut, InShot, Google AI Pro and other tool categories
- Real-time client-side search and category filters
- Product enquiry messages that can be copied to clipboard
- Platform-aware SMM **enquiry** form (no ordering, no fabricated engagement automation)
- Interactive FAQ-based support widget (not a live AI bot)
- Configurable WhatsApp/Telegram support buttons
- Clearly marked preliminary privacy, terms and refund drafts
- Basic metadata and branded SVG favicon
- No framework/dependency installation needed

## Start locally

Open `index.html` directly, or serve the directory with:

```sh
python3 -m http.server 8000
```

Navigate to `http://localhost:8000`.

## Configure support

Edit the public values in `config.js`:

```js
window.VEZLIO_CONFIG = {
  whatsappNumber: "947XXXXXXXX",
  telegramUrl: "https://t.me/your_verified_channel",
  supportEmail: ""
};
```

**No credentials, access tokens or API secrets belong in `config.js`.**

When a verified contact is not configured, the floating button displays a clear message instead of opening a made-up contact.

## Deployment

For a simple frontend preview, deploy the directory as static files (for example, GitHub Pages or another static host). Set DNS for `vezlio.store` only after domain ownership and hosting configuration are confirmed.

## Important limitations and remaining work

**This is not a production commerce system.** It does not yet have authentication, a database, administrative controls, transactions, payments, purchases, order tracking, email delivery, paid provider integrations or an LLM-powered chatbot. Catalog entries are informational enquiries; they are not promises of authorization, availability or prices. All UI descriptions state these boundaries.

Before accepting real payments, implement a secure backend with:
1. Auth + role-checked admin access, isolated customer records and row-level security.
2. Admin-controlled product and service catalog with documented sourcing/authorization.
3. Real checkout/payment provider with webhook signature verification and transactional order state.
4. Order history, audited refunds and secure fulfillment.
5. Admin-managed verified contacts and real support tickets.
6. Privacy/security/legal review, testing, monitoring and operational deployment.

Only list/resell third-party subscriptions where terms and authorization allow it. Social media promotion must comply with applicable platform policies and avoid manipulated engagement or spam.

No fake statistics, mock orders or paid transactions are presented as real.
