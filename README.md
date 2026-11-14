# Couple Budget

A budgeting app for two people. Upload each partner's monthly statements, let Claude categorize every transaction, and see budgets, a settle-up, a payment plan and your net worth in one place.

## How it fits together

| Part | Where | What it does |
|---|---|---|
| Web app | `src/`, deployed to GitHub Pages by `.github/workflows/deploy.yml` | React, TypeScript, Tailwind CSS |
| Backend | `worker/worker.js`, a Cloudflare Worker | Checks the passcode or account sign-in, holds the Claude API key, writes to Google Sheets, stores each household's data in Workers KV, and serves the Claude connector (MCP with OAuth) |
| Sheet script | `apps-script/Code.gs` | Adds a tab to the Google Sheet for each export |

Nothing financial lives in this repository. Data is stored in the Worker's KV namespace and cached in each browser.

## Code layout

```
src/
  lib/          Pure logic with no UI: types, calculations, plan maths, Worker client, AI prompts, store
  components/   Reusable pieces: ui/ (buttons, sheets, inputs), charts/, icons, logo
  features/     One file per screen: Home, Month, Budgets, Plan, NetWorth, Settings, Onboarding, Lock
```

`src/lib` has no browser-specific code beyond storage, so it can be reused as-is if the app is later rebuilt with React Native.

## Develop

```
npm install
npm run dev        # local server
npm run typecheck  # TypeScript
npm run build      # production build in dist/
```

## Worker setup

Secrets: `ANTHROPIC_API_KEY`, `APP_PASSCODE`, `AUTH_SECRET`, `SHEET_URL`, `SHEET_TOKEN`, and optionally `SIGNUP_CODE`. Binding: a KV namespace named `DB`.

- `AUTH_SECRET` is any long random string (`openssl rand -base64 32`). It signs sign-in tokens; changing it signs everyone out, Claude included.
- `MARKET_API_KEY` is an optional free Alpha Vantage key for daily investment prices. Prices are cached for 20 hours in KV (`px:<symbol>`) and shared by all households; the free tier allows 25 calls a day and 5 a minute, so the app fetches at most 5 new prices per request and retries the rest. Without a key, the Invest tab uses the prices from the uploaded holdings report.
- `SIGNUP_CODE` lets new households sign up. Leave it unset to keep sign-ups closed; partners can still join with an invite code.
- `TURNSTILE_SECRET` (secret) and `TURNSTILE_SITE_KEY` (plain variable) add Cloudflare's free bot check to sign-up and emailed password resets. Leave them unset to turn the check off.
- `RESEND_API_KEY` (secret) and `MAIL_FROM` (plain variable, such as `Couple Budget <hello@yourdomain.ca>`) send password-reset emails through Resend. Resend's free plan sends 100 emails a day, and only to your own address until you verify a domain. Without them, partners reset each other's passwords with a one-time code from Settings, under Accounts.
- `APP_URL` (optional) is the app address used in reset emails.
- `CLAUDE_DAILY_LIMIT` (optional, default 60) caps Claude requests a day for each household except the original one.
- `APP_PASSCODE` opens the original household, whose data stays under the KV key `household`. Other households are stored under `hh:<id>`.

### Accounts

| KV key | Holds |
| --- | --- |
| `user:<email>` | Account: name, salted PBKDF2 password hash, household id, token version |
| `meta:<household>` | Members and the current invite code |
| `invite:<code>` | Household id, expires after 7 days |
| `fail:<ip>` | Failed sign-in count, expires after 15 minutes |
| `reset:<code>` | Partner-issued password reset code, single use, expires after 24 hours |
| `use:<household>:<date>` | Claude requests that day, expires after 2 days |

### Free plan limits

The Worker runs on Cloudflare's free plan, which allows 1,000 KV writes a day across the account. The app waits 2.5 seconds after an edit so a burst of edits becomes one save, never sends a document that has not changed, and the Worker skips writing a save identical to what is stored. If the limit is reached anyway, changes stay on the device and save after midnight UTC. This comfortably covers two or three households.

### Deploying the Worker

`.github/workflows/worker.yml` deploys `worker/worker.js` with `wrangler.toml` whenever the Worker changes on `main` (or from the Actions tab). It needs two repository secrets: `CLOUDFLARE_API_TOKEN` (a token made from the "Edit Cloudflare Workers" template) and `CLOUDFLARE_ACCOUNT_ID`. Secrets and variables set in the Cloudflare dashboard are kept (`keep_vars = true`).

### Exports

Every household can download a month as a CSV file. The Google Sheets export only works for the original household, because the sheet belongs to its owner.

Sign-in tokens are HMAC-signed and carry their own expiry (app sessions 90 days, connector access 1 hour, refresh 60 days), so nothing waits on KV replication. "Sign out everywhere" and password changes bump the account's token version, which ends every session and the Claude connection.

### Claude connector

The connector lives at `https://couple-budget.kaetojn.workers.dev/mcp` (MCP over HTTP, JSON responses). OAuth 2.1 with PKCE, dynamic client registration and protected-resource metadata are served from the same Worker. Tools: `get_overview`, `list_categories`, `list_transactions`, `add_transactions`, `update_transaction`, `set_budget`, `get_bills`, `get_investments`, `update_account`.

### Investments

The Invest tab reads Wealthsimple holdings reports (Profile, Documents, Generate document, Holdings report CSV) locally, matching columns by name; other brokerages' CSVs are read by Claude. Logic lives in `src/lib/invest.ts`: asset classes (all-in-one ETFs are split by approximate weights), target mixes, how to place new money to rebalance without selling, and TFSA/RRSP guidance from each partner's marginal rate. Each investment account is mirrored into Net worth as an `inv-<id>` account.
