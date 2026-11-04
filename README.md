# Voter Search

A one-page voter lookup app built with Node.js, Express, MongoDB/Mongoose, and vanilla browser JavaScript. Searches run automatically after a short typing pause, with the Search button retained as a manual fallback. Name and EPIC results are cards; house-number results are a household table. Record timestamps and internal database IDs are not displayed.

## Requirements

- Node.js 20 or newer
- MongoDB with the voter and master/ward collections populated

## Setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env`, replace the MongoDB URI placeholders with your connection string, and set `MONGODB_DB`, `VOTERS_COLLECTION`, and `WARD_COLLECTION` to the exact names in your database. The ward collection defaults to `wards`.
3. Set `DEFAULT_DATASET_ID` to your active dataset. Search also supports choosing a dataset on the page.
4. Generate the 10 per-user device keys with `npm run access-keys:generate`. It stores the distributable 32-character secrets in `.device-access-keys.generated.json` and the corresponding SHA-256 hashes in `.device-access-key-hashes.json`. Both files are excluded from Git. Securely give one key to each user and copy the hash file to the server. Each key binds to the first browser profile that successfully searches. Set a separate random `VOTE_API_KEY` (at least 24 characters) in `.env` for vote marking.
5. Start with `npm start` and open `http://localhost:3000`.

### Open on a phone on the same Wi-Fi

- The server listens on `0.0.0.0` by default. Find the server computer's private LAN IPv4 address and open `http://<server-lan-ip>:3000` on the phone. Allow inbound TCP port 3000 through the computer's firewall and keep both devices on the same Wi-Fi.
- Use that exact address consistently. `localhost`, a LAN IP, a DNS name, HTTP, and HTTPS each have separate browser storage; changing between them makes the device key appear to come from a new browser profile. Each physical browser should have its own access key. A key already bound on another profile must be reset by an administrator or replaced with an unused key.
- Use HTTPS for access over the internet or any untrusted network; do not expose the development HTTP port publicly. Put the app behind a TLS reverse proxy/firewall in a real deployment.

With a generated hash file, every environment requires a valid device key for search. In development, search remains open only when no key file exists. Production startup requires 1–10 configured device keys and `VOTE_API_KEY`. The browser creates a device UUID and sends it with the key; the database stores only the key hash and binds each key to one device. The page remembers the access key only when the user explicitly checks “Remember key on this browser.”

## Data mapping

- Voters default to the MongoDB `voters` collection and ward records default to `wards`. Override these using `VOTERS_COLLECTION` and `WARD_COLLECTION`.
- Each search fetches ward documents for the matching voters: `ward_id` or `wardId` MongoDB ObjectIds are joined to ward `_id`. Legacy numeric ward IDs continue to match `id` within the same dataset. Ward name, number, booth, village, contact, and notes are included as `ward` details on each voter and rendered on the results page.
- Imported numeric voter `_id` values are preserved. Search responses include a non-displayed action key so the UI can request the mark-voted operation.
- When available, a four-digit number in `row_text` is used as the displayed serial number (including leading zeros); otherwise the existing `serial_no` is shown. `row_text` is also available in the expanded voter details.
- The mark-voted route sets `voted: true` and `voted_at` on a voter record. `voted_at` is never shown. The update is atomic; a repeat returns HTTP 409 and “Already voted.”
- The UI detects numeric input of up to 3 digits as a house number and longer numeric input as EPIC. Slash/hyphen codes and mixed letter-number values (such as `RJ/109`) are EPIC; short alphabetic codes (such as `xka`) are also treated as EPIC. Other text is searched as a name. The search-type tabs can be used to select a mode manually.
- Roman-script name queries are transliterated to Devanagari locally on the server and searched alongside the original text; no query is sent to a third-party transliteration service. Name and EPIC searches tolerate one character insertion, deletion, or substitution; EPIC separators are ignored. Two-character names are kept exact to avoid overly broad fuzzy matches. House numbers match exactly. Responses are capped at 50 records (100 for a household).
- Fuzzy search uses bounded MongoDB candidate queries, scores at most 500 candidates, and returns the closest matches first.

## API

- `GET /api/health` — readiness status.
- `GET /api/search?type=name|house|epic&q=...&datasetId=...` — lookup results. When device keys are enabled, provide both `X-Access-Key` and the browser's `X-Device-Id`.
- `POST /api/voters/:key/voted` — mark a voter as voted with JSON `{ "datasetId": 1 }` and the `X-Vote-Key` header.

## Checks

- `npm test` covers fuzzy search, Hindi transliteration, serial-number extraction, and device-key generation.
- `npm run check` performs JavaScript syntax checks.

## Deployment security

This includes per-device access keys, rate limits, Helmet security headers, input validation, bounded result sizes, and request-body limits. The per-device binding is browser-profile based, not cryptographic hardware attestation; a user who copies both the key and browser storage can duplicate that profile. Before real election use, deploy behind HTTPS and add individually authenticated operator accounts, stronger device enrollment, role-based authorization, audit logging, key rotation, backups, and formal verification of election rules. Restrict database credentials to only the required collections and operations. Do not expose this service publicly with development settings.
