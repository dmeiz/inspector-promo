# Inspector Promo — Design Spec

## Problem

Investigating a promo product at CustomInk requires looking up data across multiple systems — Redshift (warehouse data from FPDB and MMS origins), FPS API endpoints, supplier websites, and the MMS web UI. This means copying product IDs between systems, remembering API endpoints and URL patterns, and opening many browser tabs. It's slow and error-prone, especially for non-engineers who may not know all the systems.

## Solution

A locally-run web tool where you enter a product ID (or style ID) and immediately see all relevant data from every system in one page.

## Users

- Engineers investigating product data
- Product managers and stakeholders reviewing product information
- Anyone with Redshift credentials (broadly available across the org)

## Tech Stack

- **Backend:** Node.js with Express — thin proxy layer for Redshift queries and FPS API calls
- **Frontend:** Vanilla HTML/JS/CSS served as static files by Express — no build step, no framework

## Architecture

### Two Layers

**Backend (Express server):**
- REST endpoints that accept a product/style ID and return JSON
- Redshift connection via `pg` library (Redshift speaks the Postgres wire protocol)
- Proxies FPS API calls and returns responses as-is
- Constructs external URLs (supplier site, MMS UI) from configured patterns
- Credentials and connection info loaded from `.env`
- Query definitions, API endpoints, and URL patterns defined in a config file
- On startup, opens the browser automatically

**Frontend (static HTML/JS/CSS):**
- Single page with product ID input
- Calls backend endpoints in parallel, renders results progressively
- Tables for Redshift data, JSON tree viewer for API responses, clickable links for external systems

### Data Flow

1. User enters a product ID or style ID
2. Frontend calls `GET /api/lookup/:id` to resolve the ID and check for ambiguity
3. If the ID matches multiple suppliers, a disambiguation picker is shown
4. Once resolved, frontend calls remaining endpoints in parallel
5. Each section renders independently as its data arrives

## Backend API Routes

### `GET /api/lookup/:id`

Resolves the input ID. Determines whether it's a product ID or style ID, returns the mapping (product ID, style ID, supplier name). If the product ID matches multiple suppliers, returns all matches so the frontend can show a disambiguation picker.

### `GET /api/redshift/:id`

Runs predefined Redshift queries for the product. Returns an object keyed by query name, where each value is an array of row objects. Queries cover data from FPDB-origin and MMS-origin tables in the warehouse (e.g., product details, pricing, categories — specific queries to be defined during implementation).

### `GET /api/fps/:id`

Proxies multiple FPS API endpoints for the product (e.g., product info, inventory). Returns an object keyed by endpoint name, where each value is the raw JSON response from that endpoint.

### `GET /api/links/:id`

Returns constructed URLs for external systems:
- Supplier website product page
- MMS web UI product page

URL patterns are configured in the server config file.

## Frontend Layout

### Top Bar

- Text input for product/style ID
- Submit button (Enter key also submits)
- Per-section loading indicators

### Results Area (stacked vertically, single scrollable page)

**Product Identity:**
- Resolved IDs (product ID, style ID, supplier name)
- If ambiguous: disambiguation picker shown here; nothing else loads until the user picks

**External Links:**
- Row of buttons that open supplier website and MMS UI in new browser tabs

**Redshift Data:**
- Multiple collapsible sub-sections, one per query
- Each sub-section contains a sortable, scrollable table
- Column headers derived from query results
- Fixed max height per section to prevent page blowout

**FPS API Data:**
- Sub-tabs across the top of this section (one per FPS endpoint, e.g., "Product Info", "Inventory")
- Clicking a tab shows that endpoint's JSON response in a scrollable pane below
- One pane visible at a time, fixed height, independently scrollable
- JSON displayed in an expandable/collapsible tree viewer

## Configuration

### `.env` file

```
REDSHIFT_HOST=...
REDSHIFT_PORT=5439
REDSHIFT_DATABASE=...
REDSHIFT_USER=...
REDSHIFT_PASSWORD=...
FPS_BASE_URL=...
PORT=3000
```

### `config.js`

Defines the data sources in a declarative format:

```js
module.exports = {
  redshiftQueries: [
    { name: 'Product Details', sql: 'SELECT ... FROM ... WHERE product_id = $1' },
    { name: 'Pricing', sql: 'SELECT ... FROM ... WHERE product_id = $1' },
    // easy to add more
  ],
  fpsEndpoints: [
    { name: 'Product Info', path: '/products/{id}' },
    { name: 'Inventory', path: '/products/{id}/inventory' },
    // easy to add more
  ],
  externalLinks: [
    { name: 'Supplier Website', urlPattern: 'https://supplier.example.com/product/{id}' },
    { name: 'MMS', urlPattern: 'https://mms.internal/styles/{id}' },
  ],
};
```

This keeps queries, endpoints, and URL patterns easy to modify without touching application code.

## Running the Tool

```bash
npm install   # once
npm start     # starts server, opens browser
```

No build step. No Docker. No deploy.

## Product ID Disambiguation

Product IDs are not guaranteed unique across suppliers. The lookup route returns all matches. If there is exactly one match, the app proceeds directly. If there are multiple, the user sees a picker (supplier name + any distinguishing info) and selects one before data loads.

## Deferred to Future Versions

- **S3 raw data access** — requires AWS SSO auth, engineer-only; adds auth complexity
- **Supplier-level views** — browsing/searching across all products for a supplier
- **FPDB direct access** — Redshift covers the same data with broader credential availability

## Error Handling

- If Redshift connection fails: show a clear error in the Redshift section with connection troubleshooting hints (check `.env`, VPN, etc.)
- If an FPS endpoint fails: show the error in that endpoint's tab; other tabs still work
- If a query returns no results: show "No data found" in that section
- Sections are independent — one failure doesn't block the others
