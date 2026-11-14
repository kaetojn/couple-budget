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
- `APP_PASSCODE` opens the original household, whose data stays under the KV key `household`. Other households are stored under `hh:<id>`.

### Accounts

| KV key | Holds |
| --- | --- |
| `user:<email>` | Account: name, salted PBKDF2 password hash, household id, token version |
| `meta:<household>` | Members and the current invite code |
| `invite:<code>` | Household id, expires after 7 days |
| `fail:<ip>` | Failed sign-in count, expires after 15 minutes |

Sign-in tokens are HMAC-signed and carry their own expiry (app sessions 90 days, connector access 1 hour, refresh 60 days), so nothing waits on KV replication. "Sign out everywhere" and password changes bump the account's token version, which ends every session and the Claude connection.

### Claude connector

The connector lives at `https://couple-budget.kaetojn.workers.dev/mcp` (MCP over HTTP, JSON responses). OAuth 2.1 with PKCE, dynamic client registration and protected-resource metadata are served from the same Worker. Tools: `get_overview`, `list_categories`, `list_transactions`, `add_transactions`, `update_transaction`, `set_budget`, `get_bills`, `get_investments`, `update_account`.

### Investments

The Invest tab reads Wealthsimple holdings reports (Profile, Documents, Generate document, Holdings report CSV) locally, matching columns by name; other brokerages' CSVs are read by Claude. Logic lives in `src/lib/invest.ts`: asset classes (all-in-one ETFs are split by approximate weights), target mixes, how to place new money to rebalance without selling, and TFSA/RRSP guidance from each partner's marginal rate. Each investment account is mirrored into Net worth as an `inv-<id>` account.
