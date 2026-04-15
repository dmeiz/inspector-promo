# Inspector Promo

A local tool for looking up promotional product data across multiple CustomInk systems (FPDB, FPS API, MMS) from a single page.

Enter a product ID or style ID, and the app fetches everything it knows about that product: raw supplier data, live API responses, and related links to external systems.

## Requirements

- **Node.js** 18 or newer (uses native `fetch` and `node:test`)
- Network access to Redshift and the FPS API
- Redshift credentials

## Setup

1. **Clone the repo and install dependencies**

   ```bash
   git clone <repo-url>
   cd inspector-promo
   npm install
   ```

2. **Create your `.env` file** by copying the example and filling in your Redshift credentials:

   ```bash
   cp .env.example .env
   ```

   Then edit `.env` and set `REDSHIFT_USER` and `REDSHIFT_PASSWORD` to your credentials.

3. **Run the app**

   ```bash
   npm start
   ```

   The server listens on `http://localhost:3000` and opens your default browser automatically.

## Usage

- Type a product ID (e.g. `CSCG`) or style ID into the search field and press **Look Up**.
- If the ID matches multiple products, pick one from the disambiguation buttons.
- Use the left nav to switch between sections:
  - **Links** — external system URLs (supplier site, MMS, etc.)
  - **FPDB** — raw rows from `rawdata.fulfillment_products_service_*` tables
  - **FPS** — live JSON from the FPS API endpoints
  - **MMS** — raw rows from `rawdata.mms_*` tables
- Each FPDB/FPS/MMS section has multiple tabs for different data sources.
- Tables are sortable (click a column header) and cells show full values on hover.
- FPS tabs show the actual API URL that was fetched at the top — click it to open the raw JSON.

## Configuration

All queries, API endpoints, and link templates live in `config.js`. To add a new data source:

- **FPDB query** — append to `fpdbQueries` (takes `product_id` as `$1`)
- **MMS query** — append to `mmsQueries` (takes `style_id` as `$1`)
- **FPS endpoint** — append to `fpsEndpoints` (use `{id}` and `{provider}` placeholders)
- **Supplier link** — add a key to `supplierLinks` with a URL pattern using `{id}`

The frontend builds tabs dynamically from the config — no UI changes needed.

## Development

### Run tests

```bash
npm test
```

Tests live in `test/server.test.js` and cover all API routes. They mock the database and `fetch`, so no live credentials are needed.

### Project structure

```
config.js          — queries, API endpoints, link templates
server.js          — Express routes, Redshift pool, FPS proxy
public/
  index.html       — Bootstrap 5 markup (Zephyr theme via Bootswatch CDN)
  style.css        — layout overrides + JSON tree syntax highlighting
  app.js           — frontend rendering and tab switching
test/
  server.test.js   — API route tests
```

No build step. Edit files in `public/` and refresh the browser.

## Troubleshooting

**Lookup fails with a connection error**
Check your `.env` values and that you're on the CustomInk network or VPN.

**FPS tabs show errors for every endpoint**
Verify `FPS_BASE_URL` is set and reachable.

**Browser doesn't open automatically**
The `npm start` script tries to run `open http://localhost:3000`. On non-macOS systems, open the URL manually.
