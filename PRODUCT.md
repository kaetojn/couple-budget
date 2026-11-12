# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two people: the owner and their partner, one household. Nobody else signs up, and there are no plans to open the app to other couples. They both use it as an installed home-screen PWA on their phones; desktop is secondary.

## Product Purpose

Couple Budget lets one couple run their shared money in one place. Each partner uploads their monthly statements, Claude categorizes every transaction, and the app shows the month against the budget, who owes whom, which paycheque covers which bill, and the household's net worth.

Success means that a monthly session is quick and trustworthy and ends without argument. The categories are right, the split is visibly fair, and both partners know what's due before the next payday.

The jobs, in priority order:

1. **Monthly review.** Upload statements, check and correct categories, and see how the month went against budget.
2. **Bills and paydays.** Line paydays up against bills, see which paycheque covers what, and pay down debt.
3. **Settle-up fairness.** Know who owes whom and trust that shared costs are split the way the couple agreed.

Net worth and long-term savings are supported but secondary.

## Positioning

The app is built around two partners, not a single account holder. Every transaction has an owner (`p1`, `p2` or `shared`) and a payer (`p1`, `p2` or `joint`). The couple's real arrangement (one joint account, separate accounts with shared expenses, or fully separate finances) decides whether a settle-up exists and how advice is worded. Shared costs are split by income, 50/50 or a custom share. The couple uploads their own statements, and Claude categorizes them instead of a bank aggregator.

## Operating Context

- A monthly session: each partner exports statements (PDF or text) from their bank, uploads them, and reviews Claude's categorization before trusting the totals.
- Quick checks on a phone between sessions: what's left in a budget, what bill is due next, and whether this paycheque covers it.
- Both partners see the same household data, synced across devices through Workers KV and cached in each browser.
- An optional export writes a tab to a Google Sheet for each export.
- An AI "check-up" gives a plain-spoken summary of how the month went, with a headline and wins.

## Capabilities and Constraints

- **Screens:** Home, Month, Budgets, Plan (bills, debts and paydays), Net Worth, Settings, Onboarding, Lock, and the Check-up sheet.
- **Stack:** React 19, TypeScript, Tailwind CSS 4, Vite, Jotai, Headless UI, d3-scale/d3-shape for charts and react-icons. The app is deployed to GitHub Pages.
- **Backend:** a Cloudflare Worker (`worker/worker.js`) checks the passcode, holds the Anthropic API key, proxies Claude calls, writes to Google Sheets, and stores data in KV. `apps-script/Code.gs` adds sheet tabs.
- **Access:** one shared household passcode. There are no per-user accounts.
- **Currency and locale:** CAD, en-CA formatting ("paycheque", "chequing"). Pay schedules can be monthly, semimonthly or biweekly.
- **Data:** nothing financial lives in the repository. `src/lib` stays free of UI code so it can be reused if the app is rebuilt in React Native, which has been considered but not decided.
- **Terminology in use:** settle-up, shared vs personal, take-home, plan, check-up, joint savings, arrangement.

## Brand Commitments

- Name "Couple Budget", with "Budget" as the short name on the home screen. The app has its own logo (`src/components/logo.tsx`), favicon and app icons in `public/`.
- Voice from the existing copy is plain, direct, second person and addressed to both partners by name ("You are set, {p1} and {p2}"). It explains why something is asked ("This decides whether there is a settle-up…"). The check-up persona is a "plain-spoken household finance coach".

## Evidence on Hand

- `src/lib/sample.ts` holds synthetic sample transactions (Toronto merchants, made-up amounts) for demos and empty states. It is not real household data.
- There are no testimonials, users, metrics or external claims, and future work must not invent any.

## Product Principles

1. **The month has to add up.** Totals, splits and settle-ups have to be trustworthy enough that neither partner rechecks them by hand. Make categorization easy to review and correct.
2. **Both partners are equal.** Neither partner is the "main" user. Names, shares and ownership are always visible and symmetric.
3. **Thumb-first, phone-first.** Quick checks happen on an installed phone app; design for one hand and short glances first.
4. **Say why.** Every setup choice and number explains what it affects, in plain language.
5. **Private by construction.** Financial data stays out of the repo and off third parties beyond the Worker, Claude and the couple's own Sheet.
