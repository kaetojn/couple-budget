# Couple Budget

A budgeting app for two people. Upload monthly bank statements per person, let Claude categorize every transaction, review the results, and export a summary to Google Sheets.

- `index.html` is the whole app. GitHub Pages serves it from the `main` branch.
- `worker/worker.js` is a Cloudflare Worker that checks the passcode and holds the Claude key and Google Sheet connection. Set four secrets on it: `ANTHROPIC_API_KEY`, `APP_PASSCODE`, `SHEET_URL` and `SHEET_TOKEN`.
- `apps-script/Code.gs` is the script attached to the Google Sheet that adds a tab per export.

Statements, history and settings stay in each browser. Nothing financial is stored in this repository.
