# Couple Budget

A budgeting app for two people. Upload monthly bank statements per person, let Claude categorize every transaction, review the results, and export a summary to Google Sheets.

- `index.html` is the whole app. GitHub Pages serves it from the `main` branch.
- `worker/worker.js` is a Cloudflare Worker that holds the Claude API key. Set two secrets on it: `ANTHROPIC_API_KEY` and `APP_PASSCODE`.

Statements, history and settings stay in each browser. Nothing financial is stored in this repository.
