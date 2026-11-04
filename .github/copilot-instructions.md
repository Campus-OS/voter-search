# Project notes

- This app uses JavaScript, Express, Mongoose, and a vanilla HTML/CSS/JS frontend.
- Keep MongoDB collection and field mappings compatible with the provided existing records.
- Never render voter timestamps or internal identifiers in the UI.
- Any real deployment that changes voting status must add authentication, authorization, audit logging, and operator training; the current endpoint is a local workflow starter only.
- Run `npm test` and `npm run check` after changing application code.
