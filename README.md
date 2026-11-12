# Couple Budget

A budgeting app for two people. Upload each partner's monthly statements, let Claude categorize every transaction, and see budgets, a settle-up, a payment plan and your net worth in one place.

## How it fits together

| Part | Where | What it does |
|---|---|---|
| Web app | `src/`, deployed to GitHub Pages by `.github/workflows/deploy.yml` | React, TypeScript, Tailwind CSS |
| Backend | `worker/worker.js`, a Cloudflare Worker | Checks the passcode, holds the Claude API key, writes to Google Sheets, stores the household's data in Workers KV |
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

Secrets: `ANTHROPIC_API_KEY`, `APP_PASSCODE`, `SHEET_URL`, `SHEET_TOKEN`. Binding: a KV namespace named `DB`.
