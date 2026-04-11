# Inspector Promo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a locally-run web tool that lets users enter a promo product ID and see all relevant data from Redshift, FPS APIs, and external systems in one page.

**Architecture:** Thin Express server proxies Redshift queries and FPS API calls, serves a vanilla HTML/JS/CSS frontend. Config-driven data sources make it easy to add queries and endpoints. Frontend fetches all sources in parallel and renders progressively.

**Tech Stack:** Node.js, Express, `pg` (for Redshift), vanilla HTML/JS/CSS, `dotenv`

---

## File Structure

```
inspector-promo/
├── server.js              # Express server — routes, Redshift connection, FPS proxy
├── config.js              # Data source definitions (queries, endpoints, URL patterns)
├── package.json           # Dependencies and scripts
├── .env.example           # Template for credentials
├── .gitignore             # Ignore node_modules, .env
├── public/
│   ├── index.html         # Single-page UI
│   ├── style.css          # All styles
│   └── app.js             # Frontend logic — fetching, rendering, tabs, tables
└── test/
    └── server.test.js     # Backend route tests
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `config.js`

- [ ] **Step 1: Initialize package.json**

```json
{
  "name": "inspector-promo",
  "version": "1.0.0",
  "description": "Promo product data inspector — look up product data across all systems in one place",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "test": "node --test test/server.test.js"
  },
  "dependencies": {
    "dotenv": "^16.4.7",
    "express": "^4.21.2",
    "pg": "^8.13.1"
  }
}
```

- [ ] **Step 2: Create .gitignore**

```
node_modules/
.env
```

- [ ] **Step 3: Create .env.example**

```
REDSHIFT_HOST=
REDSHIFT_PORT=5439
REDSHIFT_DATABASE=
REDSHIFT_USER=
REDSHIFT_PASSWORD=
FPS_BASE_URL=
PORT=3000
```

- [ ] **Step 4: Create config.js with placeholder structure**

```js
module.exports = {
  // Each entry: { name: 'Display Name', sql: 'SELECT ... WHERE product_id = $1' }
  // The $1 parameter receives the resolved product ID
  redshiftQueries: [
    {
      name: 'Product Details',
      sql: `SELECT * FROM products WHERE product_id = $1 LIMIT 100`,
    },
  ],

  // Each entry: { name: 'Display Name', path: '/endpoint/{id}' }
  // {id} is replaced with the product ID at request time
  fpsEndpoints: [
    {
      name: 'Product Info',
      path: '/products/{id}',
    },
  ],

  // Each entry: { name: 'Display Name', urlPattern: 'https://example.com/{id}' }
  // {id} is replaced with the product ID
  externalLinks: [
    {
      name: 'Supplier Website',
      urlPattern: 'https://supplier.example.com/product/{id}',
    },
    {
      name: 'MMS',
      urlPattern: 'https://mms.example.com/styles/{id}',
    },
  ],

  // SQL used by the lookup route to resolve a product ID and check for ambiguity
  // Must return rows with at least: product_id, style_id, supplier_name
  lookupSql: `SELECT product_id, style_id, supplier_name FROM products WHERE product_id = $1 OR style_id = $1`,
};
```

- [ ] **Step 5: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, `package-lock.json` generated

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore .env.example config.js
git commit -m "chore: scaffold project with package.json, config, and env template"
```

---

### Task 2: Express Server with Lookup Route

**Files:**
- Create: `server.js`
- Create: `test/server.test.js`

- [ ] **Step 1: Write the failing test for the lookup route**

Create `test/server.test.js`:

```js
const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert');

// We'll test the route handlers by extracting them into testable functions.
// But first, let's test the server module loads and exports an app.

describe('server', () => {
  it('exports an Express app', () => {
    // Mock pg so it doesn't try to connect
    mock.module('pg', {
      namedExports: {},
      defaultExport: { Pool: class { query() { return { rows: [] }; } end() {} } },
    });
    const app = require('../server');
    assert.ok(app);
    assert.strictEqual(typeof app.listen, 'function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/server.test.js`
Expected: FAIL — `Cannot find module '../server'`

- [ ] **Step 3: Write the Express server with lookup route**

Create `server.js`:

```js
require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const config = require('./config');

const app = express();
const port = process.env.PORT || 3000;

// Redshift connection pool
const pool = new Pool({
  host: process.env.REDSHIFT_HOST,
  port: parseInt(process.env.REDSHIFT_PORT || '5439', 10),
  database: process.env.REDSHIFT_DATABASE,
  user: process.env.REDSHIFT_USER,
  password: process.env.REDSHIFT_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

// Serve static frontend
app.use(express.static('public'));

// Lookup route — resolve product/style ID, check for ambiguity
app.get('/api/lookup/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(config.lookupSql, [id]);
    if (result.rows.length === 0) {
      return res.json({ found: false, matches: [] });
    }
    if (result.rows.length === 1) {
      return res.json({ found: true, ambiguous: false, match: result.rows[0] });
    }
    return res.json({ found: true, ambiguous: true, matches: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Only start listening if this file is run directly (not required by tests)
if (require.main === module) {
  app.listen(port, () => {
    console.log(`Inspector Promo running at http://localhost:${port}`);
    // Open browser automatically
    const { exec } = require('child_process');
    exec(`open http://localhost:${port}`);
  });
}

module.exports = app;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/server.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server.js test/server.test.js
git commit -m "feat: add Express server with lookup route and Redshift connection"
```

---

### Task 3: Redshift Data Route

**Files:**
- Modify: `server.js`
- Modify: `test/server.test.js`

- [ ] **Step 1: Write the failing test for the Redshift route**

Add to `test/server.test.js`:

```js
const http = require('node:http');

// Helper to make requests against the app
function request(app, path) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      http.get(`http://localhost:${port}${path}`, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          server.close();
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        });
      }).on('error', (err) => { server.close(); reject(err); });
    });
  });
}

describe('GET /api/redshift/:id', () => {
  it('returns query results keyed by query name', async () => {
    // Mock pg Pool to return fake data
    const { Pool } = require('pg');
    const originalQuery = Pool.prototype.query;
    Pool.prototype.query = async (sql, params) => {
      return { rows: [{ product_id: params[0], name: 'Test Product' }] };
    };

    const app = require('../server');
    const res = await request(app, '/api/redshift/ABC123');

    assert.strictEqual(res.status, 200);
    // Should have a key for each configured query
    const queryNames = config.redshiftQueries.map((q) => q.name);
    for (const name of queryNames) {
      assert.ok(Array.isArray(res.body[name]), `Expected array for "${name}"`);
    }

    Pool.prototype.query = originalQuery;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/server.test.js`
Expected: FAIL — route not found (404) or missing route handler

- [ ] **Step 3: Add the Redshift route to server.js**

Add after the lookup route in `server.js`:

```js
// Redshift data route — run all configured queries for a product
app.get('/api/redshift/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const results = {};
    const queries = config.redshiftQueries.map(async ({ name, sql }) => {
      const result = await pool.query(sql, [id]);
      results[name] = result.rows;
    });
    await Promise.all(queries);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/server.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server.js test/server.test.js
git commit -m "feat: add Redshift data route running configured queries"
```

---

### Task 4: FPS API Proxy Route

**Files:**
- Modify: `server.js`
- Modify: `test/server.test.js`

- [ ] **Step 1: Write the failing test for the FPS route**

Add to `test/server.test.js`:

```js
describe('GET /api/fps/:id', () => {
  it('returns proxied API responses keyed by endpoint name', async () => {
    // Mock global fetch to return fake API data
    const originalFetch = global.fetch;
    global.fetch = async (url) => ({
      ok: true,
      json: async () => ({ id: 'ABC123', source: url }),
    });

    const app = require('../server');
    const res = await request(app, '/api/fps/ABC123');

    assert.strictEqual(res.status, 200);
    const endpointNames = config.fpsEndpoints.map((e) => e.name);
    for (const name of endpointNames) {
      assert.ok(res.body[name] !== undefined, `Expected key "${name}"`);
    }

    global.fetch = originalFetch;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/server.test.js`
Expected: FAIL — 404 or missing route

- [ ] **Step 3: Add the FPS proxy route to server.js**

Add after the Redshift route in `server.js`:

```js
// FPS API proxy route — call all configured FPS endpoints for a product
app.get('/api/fps/:id', async (req, res) => {
  const { id } = req.params;
  const baseUrl = process.env.FPS_BASE_URL || '';
  try {
    const results = {};
    const calls = config.fpsEndpoints.map(async ({ name, path }) => {
      const url = `${baseUrl}${path.replace('{id}', id)}`;
      try {
        const response = await fetch(url);
        results[name] = response.ok
          ? await response.json()
          : { error: `HTTP ${response.status}`, url };
      } catch (err) {
        results[name] = { error: err.message, url };
      }
    });
    await Promise.all(calls);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/server.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server.js test/server.test.js
git commit -m "feat: add FPS API proxy route"
```

---

### Task 5: Links Route

**Files:**
- Modify: `server.js`
- Modify: `test/server.test.js`

- [ ] **Step 1: Write the failing test for the links route**

Add to `test/server.test.js`:

```js
describe('GET /api/links/:id', () => {
  it('returns constructed URLs for external systems', async () => {
    const app = require('../server');
    const res = await request(app, '/api/links/ABC123');

    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.links));
    for (const link of res.body.links) {
      assert.ok(link.name, 'Each link should have a name');
      assert.ok(link.url, 'Each link should have a url');
      assert.ok(link.url.includes('ABC123'), 'URL should contain the product ID');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/server.test.js`
Expected: FAIL — 404

- [ ] **Step 3: Add the links route to server.js**

Add after the FPS route in `server.js`:

```js
// Links route — construct URLs for external systems
app.get('/api/links/:id', (req, res) => {
  const { id } = req.params;
  const links = config.externalLinks.map(({ name, urlPattern }) => ({
    name,
    url: urlPattern.replace('{id}', id),
  }));
  res.json({ links });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/server.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server.js test/server.test.js
git commit -m "feat: add external links route"
```

---

### Task 6: Frontend HTML Shell

**Files:**
- Create: `public/index.html`
- Create: `public/style.css`

- [ ] **Step 1: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Inspector Promo</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header>
    <h1>Inspector Promo</h1>
    <form id="lookup-form">
      <input type="text" id="product-id" placeholder="Enter product ID or style ID" autofocus>
      <button type="submit">Look Up</button>
    </form>
  </header>

  <main id="results" class="hidden">
    <!-- Product Identity -->
    <section id="identity-section">
      <h2>Product Identity</h2>
      <div id="identity-content"></div>
      <div id="disambiguation" class="hidden"></div>
    </section>

    <!-- External Links -->
    <section id="links-section">
      <h2>External Links</h2>
      <div id="links-content"></div>
    </section>

    <!-- Redshift Data -->
    <section id="redshift-section">
      <h2>Redshift Data</h2>
      <div id="redshift-loading" class="loading hidden">Loading Redshift data...</div>
      <div id="redshift-content"></div>
    </section>

    <!-- FPS API Data -->
    <section id="fps-section">
      <h2>FPS API Data</h2>
      <div id="fps-loading" class="loading hidden">Loading FPS data...</div>
      <div id="fps-tabs" class="hidden">
        <nav id="fps-tab-nav"></nav>
        <div id="fps-tab-content"></div>
      </div>
    </section>
  </main>

  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create style.css**

```css
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #f5f5f5;
  color: #333;
  line-height: 1.5;
}

header {
  background: #1a1a2e;
  color: #fff;
  padding: 1rem 2rem;
  display: flex;
  align-items: center;
  gap: 2rem;
}

header h1 {
  font-size: 1.25rem;
  white-space: nowrap;
}

#lookup-form {
  display: flex;
  gap: 0.5rem;
  flex: 1;
  max-width: 500px;
}

#product-id {
  flex: 1;
  padding: 0.5rem 0.75rem;
  font-size: 1rem;
  border: none;
  border-radius: 4px;
}

#lookup-form button {
  padding: 0.5rem 1.25rem;
  font-size: 1rem;
  background: #e94560;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

#lookup-form button:hover {
  background: #c73e54;
}

main {
  padding: 1.5rem 2rem;
}

.hidden {
  display: none !important;
}

section {
  background: #fff;
  border-radius: 6px;
  padding: 1rem 1.25rem;
  margin-bottom: 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

section h2 {
  font-size: 1rem;
  margin-bottom: 0.75rem;
  color: #1a1a2e;
  border-bottom: 1px solid #eee;
  padding-bottom: 0.5rem;
}

/* Identity */
#identity-content table {
  width: 100%;
}

#identity-content td {
  padding: 0.25rem 0.75rem;
}

#identity-content td:first-child {
  font-weight: 600;
  width: 150px;
}

/* External Links */
#links-content {
  display: flex;
  gap: 0.75rem;
}

#links-content a {
  display: inline-block;
  padding: 0.5rem 1rem;
  background: #1a1a2e;
  color: #fff;
  text-decoration: none;
  border-radius: 4px;
  font-size: 0.9rem;
}

#links-content a:hover {
  background: #16213e;
}

/* Disambiguation */
#disambiguation {
  margin-top: 0.75rem;
}

#disambiguation button {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.5rem 0.75rem;
  margin-bottom: 0.25rem;
  background: #f0f0f0;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
}

#disambiguation button:hover {
  background: #e0e0e0;
}

/* Loading */
.loading {
  color: #888;
  font-style: italic;
  padding: 0.5rem 0;
}

/* Redshift tables */
.redshift-query {
  margin-bottom: 1rem;
}

.redshift-query h3 {
  font-size: 0.9rem;
  margin-bottom: 0.5rem;
  cursor: pointer;
  user-select: none;
}

.redshift-query h3::before {
  content: '\25BC ';
  font-size: 0.7rem;
}

.redshift-query.collapsed h3::before {
  content: '\25B6 ';
}

.redshift-query.collapsed .table-wrap {
  display: none;
}

.table-wrap {
  max-height: 300px;
  overflow: auto;
  border: 1px solid #eee;
  border-radius: 4px;
}

.table-wrap table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.table-wrap th {
  background: #f8f8f8;
  position: sticky;
  top: 0;
  text-align: left;
  padding: 0.4rem 0.6rem;
  border-bottom: 2px solid #ddd;
  cursor: pointer;
  white-space: nowrap;
}

.table-wrap th:hover {
  background: #eee;
}

.table-wrap td {
  padding: 0.3rem 0.6rem;
  border-bottom: 1px solid #f0f0f0;
  white-space: nowrap;
}

.table-wrap tr:hover td {
  background: #f8f9ff;
}

/* FPS Tabs */
#fps-tab-nav {
  display: flex;
  gap: 0;
  border-bottom: 2px solid #eee;
  margin-bottom: 0;
}

#fps-tab-nav button {
  padding: 0.5rem 1rem;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  cursor: pointer;
  font-size: 0.9rem;
  color: #666;
}

#fps-tab-nav button.active {
  border-bottom-color: #e94560;
  color: #1a1a2e;
  font-weight: 600;
}

#fps-tab-content {
  max-height: 500px;
  overflow: auto;
  padding: 0.75rem;
  border: 1px solid #eee;
  border-top: none;
  border-radius: 0 0 4px 4px;
  background: #fafafa;
}

/* JSON Tree */
.json-tree {
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 0.8rem;
  line-height: 1.6;
}

.json-tree .key {
  color: #881391;
}

.json-tree .string {
  color: #c41a16;
}

.json-tree .number {
  color: #1c00cf;
}

.json-tree .boolean {
  color: #0d22aa;
}

.json-tree .null {
  color: #808080;
}

.json-tree .toggle {
  cursor: pointer;
  user-select: none;
}

.json-tree .toggle::before {
  content: '\25BC ';
  font-size: 0.65rem;
  display: inline-block;
}

.json-tree .toggle.collapsed::before {
  content: '\25B6 ';
}

.json-tree .collapsible.collapsed > .json-children {
  display: none;
}

.json-tree .collapsible.collapsed > .collapse-preview {
  display: inline;
}

.json-tree .collapse-preview {
  display: none;
  color: #888;
}

/* Error display */
.error-message {
  color: #c0392b;
  background: #fdf0ef;
  padding: 0.5rem 0.75rem;
  border-radius: 4px;
  font-size: 0.9rem;
}

/* No data */
.no-data {
  color: #888;
  font-style: italic;
  padding: 0.5rem 0;
}
```

- [ ] **Step 3: Verify the page loads**

Run: `node -e "require('./server')" &` (or `npm start` and check `http://localhost:3000` manually)
Expected: The page loads with the header, input field, and empty results area hidden.

- [ ] **Step 4: Commit**

```bash
git add public/index.html public/style.css
git commit -m "feat: add frontend HTML shell and styles"
```

---

### Task 7: Frontend JavaScript — Lookup and Disambiguation

**Files:**
- Create: `public/app.js`

- [ ] **Step 1: Create app.js with lookup and disambiguation logic**

```js
const form = document.getElementById('lookup-form');
const input = document.getElementById('product-id');
const resultsEl = document.getElementById('results');
const identityContent = document.getElementById('identity-content');
const disambiguationEl = document.getElementById('disambiguation');
const linksContent = document.getElementById('links-content');
const redshiftLoading = document.getElementById('redshift-loading');
const redshiftContent = document.getElementById('redshift-content');
const fpsLoading = document.getElementById('fps-loading');
const fpsTabs = document.getElementById('fps-tabs');
const fpsTabNav = document.getElementById('fps-tab-nav');
const fpsTabContent = document.getElementById('fps-tab-content');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = input.value.trim();
  if (!id) return;
  resetResults();
  resultsEl.classList.remove('hidden');
  await doLookup(id);
});

function resetResults() {
  identityContent.innerHTML = '';
  disambiguationEl.innerHTML = '';
  disambiguationEl.classList.add('hidden');
  linksContent.innerHTML = '';
  redshiftContent.innerHTML = '';
  redshiftLoading.classList.add('hidden');
  fpsTabNav.innerHTML = '';
  fpsTabContent.innerHTML = '';
  fpsTabs.classList.add('hidden');
  fpsLoading.classList.add('hidden');
}

async function doLookup(id) {
  identityContent.innerHTML = '<span class="loading">Looking up product...</span>';
  try {
    const res = await fetch(`/api/lookup/${encodeURIComponent(id)}`);
    const data = await res.json();

    if (!data.found) {
      identityContent.innerHTML = '<span class="error-message">No product found for this ID.</span>';
      return;
    }

    if (data.ambiguous) {
      identityContent.innerHTML = '<span>Multiple matches found. Please select one:</span>';
      disambiguationEl.classList.remove('hidden');
      disambiguationEl.innerHTML = '';
      data.matches.forEach((match) => {
        const btn = document.createElement('button');
        btn.textContent = `${match.product_id} — ${match.supplier_name} (Style: ${match.style_id})`;
        btn.addEventListener('click', () => {
          disambiguationEl.classList.add('hidden');
          showProduct(match);
        });
        disambiguationEl.appendChild(btn);
      });
      return;
    }

    showProduct(data.match);
  } catch (err) {
    identityContent.innerHTML = `<span class="error-message">Lookup failed: ${err.message}</span>`;
  }
}

function showProduct(match) {
  // Display identity
  identityContent.innerHTML = `
    <table>
      <tr><td>Product ID</td><td>${match.product_id}</td></tr>
      <tr><td>Style ID</td><td>${match.style_id}</td></tr>
      <tr><td>Supplier</td><td>${match.supplier_name}</td></tr>
    </table>
  `;

  // Fetch all other data in parallel
  const productId = match.product_id;
  fetchLinks(productId);
  fetchRedshift(productId);
  fetchFps(productId);
}
```

- [ ] **Step 2: Verify form submission triggers lookup**

Run: Start the server with `npm start`, enter a product ID, verify the lookup request fires in the browser Network tab (it will 500 without Redshift, but the request should fire).

- [ ] **Step 3: Commit**

```bash
git add public/app.js
git commit -m "feat: add frontend lookup and disambiguation logic"
```

---

### Task 8: Frontend — External Links Rendering

**Files:**
- Modify: `public/app.js`

- [ ] **Step 1: Add the fetchLinks function to app.js**

Append to `public/app.js`:

```js
async function fetchLinks(productId) {
  try {
    const res = await fetch(`/api/links/${encodeURIComponent(productId)}`);
    const data = await res.json();
    linksContent.innerHTML = '';
    data.links.forEach(({ name, url }) => {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = name;
      linksContent.appendChild(a);
    });
  } catch (err) {
    linksContent.innerHTML = `<span class="error-message">Failed to load links: ${err.message}</span>`;
  }
}
```

- [ ] **Step 2: Verify links render**

Run: Start the server, do a lookup. The External Links section should show buttons with the configured link names.

- [ ] **Step 3: Commit**

```bash
git add public/app.js
git commit -m "feat: add external links rendering"
```

---

### Task 9: Frontend — Redshift Data Tables

**Files:**
- Modify: `public/app.js`

- [ ] **Step 1: Add fetchRedshift and table rendering to app.js**

Append to `public/app.js`:

```js
async function fetchRedshift(productId) {
  redshiftLoading.classList.remove('hidden');
  redshiftContent.innerHTML = '';
  try {
    const res = await fetch(`/api/redshift/${encodeURIComponent(productId)}`);
    const data = await res.json();
    redshiftLoading.classList.add('hidden');

    if (data.error) {
      redshiftContent.innerHTML = `<span class="error-message">Redshift error: ${data.error}</span>`;
      return;
    }

    for (const [name, rows] of Object.entries(data)) {
      const section = document.createElement('div');
      section.className = 'redshift-query';

      const h3 = document.createElement('h3');
      h3.textContent = name;
      h3.addEventListener('click', () => section.classList.toggle('collapsed'));
      section.appendChild(h3);

      if (rows.length === 0) {
        const noData = document.createElement('div');
        noData.className = 'no-data';
        noData.textContent = 'No data found';
        section.appendChild(noData);
      } else {
        section.appendChild(buildTable(rows));
      }

      redshiftContent.appendChild(section);
    }
  } catch (err) {
    redshiftLoading.classList.add('hidden');
    redshiftContent.innerHTML = `<span class="error-message">Failed to load Redshift data: ${err.message}</span>`;
  }
}

function buildTable(rows) {
  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';

  const table = document.createElement('table');
  const columns = Object.keys(rows[0]);

  // Header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  let sortCol = null;
  let sortAsc = true;

  columns.forEach((col) => {
    const th = document.createElement('th');
    th.textContent = col;
    th.addEventListener('click', () => {
      if (sortCol === col) {
        sortAsc = !sortAsc;
      } else {
        sortCol = col;
        sortAsc = true;
      }
      const sorted = [...rows].sort((a, b) => {
        const av = a[col], bv = b[col];
        if (av == null) return 1;
        if (bv == null) return -1;
        if (av < bv) return sortAsc ? -1 : 1;
        if (av > bv) return sortAsc ? 1 : -1;
        return 0;
      });
      tbody.innerHTML = '';
      sorted.forEach((row) => tbody.appendChild(buildRow(row, columns)));
    });
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Body
  const tbody = document.createElement('tbody');
  rows.forEach((row) => tbody.appendChild(buildRow(row, columns)));
  table.appendChild(tbody);

  wrap.appendChild(table);
  return wrap;
}

function buildRow(row, columns) {
  const tr = document.createElement('tr');
  columns.forEach((col) => {
    const td = document.createElement('td');
    td.textContent = row[col] ?? '';
    tr.appendChild(td);
  });
  return tr;
}
```

- [ ] **Step 2: Verify tables render with sortable columns**

Run: Start the server with a valid Redshift connection, look up a product. Tables should appear with clickable column headers for sorting. Without Redshift, verify the error message appears cleanly.

- [ ] **Step 3: Commit**

```bash
git add public/app.js
git commit -m "feat: add Redshift data table rendering with sortable columns"
```

---

### Task 10: Frontend — FPS API Tabs and JSON Tree

**Files:**
- Modify: `public/app.js`

- [ ] **Step 1: Add fetchFps, tab switching, and JSON tree renderer to app.js**

Append to `public/app.js`:

```js
async function fetchFps(productId) {
  fpsLoading.classList.remove('hidden');
  fpsTabs.classList.add('hidden');
  try {
    const res = await fetch(`/api/fps/${encodeURIComponent(productId)}`);
    const data = await res.json();
    fpsLoading.classList.add('hidden');

    if (data.error) {
      fpsTabContent.innerHTML = `<span class="error-message">FPS error: ${data.error}</span>`;
      fpsTabs.classList.remove('hidden');
      return;
    }

    const entries = Object.entries(data);
    if (entries.length === 0) {
      fpsTabContent.innerHTML = '<span class="no-data">No FPS data</span>';
      fpsTabs.classList.remove('hidden');
      return;
    }

    // Build tabs
    fpsTabNav.innerHTML = '';
    fpsTabContent.innerHTML = '';
    const panes = {};

    entries.forEach(([name, responseData], idx) => {
      // Tab button
      const btn = document.createElement('button');
      btn.textContent = name;
      btn.addEventListener('click', () => activateTab(name));
      if (idx === 0) btn.classList.add('active');
      fpsTabNav.appendChild(btn);

      // Pane
      const pane = document.createElement('div');
      pane.className = 'json-tree';
      pane.appendChild(renderJson(responseData));
      if (idx !== 0) pane.style.display = 'none';
      fpsTabContent.appendChild(pane);
      panes[name] = pane;
    });

    fpsTabs.classList.remove('hidden');

    function activateTab(name) {
      fpsTabNav.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
      fpsTabNav.querySelector(`button`);
      // Find the button with matching text
      for (const b of fpsTabNav.children) {
        if (b.textContent === name) b.classList.add('active');
      }
      Object.entries(panes).forEach(([n, p]) => {
        p.style.display = n === name ? '' : 'none';
      });
    }
  } catch (err) {
    fpsLoading.classList.add('hidden');
    fpsTabContent.innerHTML = `<span class="error-message">Failed to load FPS data: ${err.message}</span>`;
    fpsTabs.classList.remove('hidden');
  }
}

function renderJson(data) {
  const container = document.createElement('span');

  if (data === null) {
    container.innerHTML = '<span class="null">null</span>';
    return container;
  }

  if (typeof data === 'string') {
    container.innerHTML = `<span class="string">"${escapeHtml(data)}"</span>`;
    return container;
  }

  if (typeof data === 'number') {
    container.innerHTML = `<span class="number">${data}</span>`;
    return container;
  }

  if (typeof data === 'boolean') {
    container.innerHTML = `<span class="boolean">${data}</span>`;
    return container;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      container.textContent = '[]';
      return container;
    }

    const wrapper = document.createElement('span');
    wrapper.className = 'collapsible';

    const toggle = document.createElement('span');
    toggle.className = 'toggle';
    toggle.textContent = '';
    toggle.addEventListener('click', () => wrapper.classList.toggle('collapsed'));
    wrapper.appendChild(toggle);

    wrapper.appendChild(document.createTextNode('['));

    const preview = document.createElement('span');
    preview.className = 'collapse-preview';
    preview.textContent = `${data.length} items...`;
    wrapper.appendChild(preview);

    const children = document.createElement('div');
    children.className = 'json-children';
    children.style.paddingLeft = '1.25rem';

    data.forEach((item, idx) => {
      const line = document.createElement('div');
      line.appendChild(renderJson(item));
      if (idx < data.length - 1) line.appendChild(document.createTextNode(','));
      children.appendChild(line);
    });

    wrapper.appendChild(children);
    wrapper.appendChild(document.createTextNode(']'));
    container.appendChild(wrapper);
    return container;
  }

  if (typeof data === 'object') {
    const keys = Object.keys(data);
    if (keys.length === 0) {
      container.textContent = '{}';
      return container;
    }

    const wrapper = document.createElement('span');
    wrapper.className = 'collapsible';

    const toggle = document.createElement('span');
    toggle.className = 'toggle';
    toggle.textContent = '';
    toggle.addEventListener('click', () => wrapper.classList.toggle('collapsed'));
    wrapper.appendChild(toggle);

    wrapper.appendChild(document.createTextNode('{'));

    const preview = document.createElement('span');
    preview.className = 'collapse-preview';
    preview.textContent = `${keys.length} keys...`;
    wrapper.appendChild(preview);

    const children = document.createElement('div');
    children.className = 'json-children';
    children.style.paddingLeft = '1.25rem';

    keys.forEach((key, idx) => {
      const line = document.createElement('div');
      const keySpan = document.createElement('span');
      keySpan.className = 'key';
      keySpan.textContent = `"${key}"`;
      line.appendChild(keySpan);
      line.appendChild(document.createTextNode(': '));
      line.appendChild(renderJson(data[key]));
      if (idx < keys.length - 1) line.appendChild(document.createTextNode(','));
      children.appendChild(line);
    });

    wrapper.appendChild(children);
    wrapper.appendChild(document.createTextNode('}'));
    container.appendChild(wrapper);
    return container;
  }

  container.textContent = String(data);
  return container;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
```

- [ ] **Step 2: Verify FPS tabs and JSON tree render**

Run: Start the server with `FPS_BASE_URL` configured, look up a product. Verify:
- Tabs appear for each configured FPS endpoint
- Clicking a tab switches the visible JSON pane
- JSON tree nodes are expandable/collapsible
- The pane scrolls independently at its fixed max height

- [ ] **Step 3: Commit**

```bash
git add public/app.js
git commit -m "feat: add FPS API tab rendering with collapsible JSON tree viewer"
```

---

### Task 11: End-to-End Verification

**Files:** None (verification only)

- [ ] **Step 1: Create a .env file with real credentials**

Copy `.env.example` to `.env` and fill in actual Redshift and FPS connection details.

- [ ] **Step 2: Update config.js with real queries and endpoints**

Replace placeholder queries and endpoints in `config.js` with actual Redshift SQL, FPS paths, and external URL patterns for the team's systems.

- [ ] **Step 3: Run the app and test end-to-end**

Run: `npm start`
Expected:
- Browser opens to `http://localhost:3000`
- Enter a known product ID
- Verify: identity resolves, links appear, Redshift tables populate with sortable data, FPS tabs show JSON responses
- Test with ambiguous product ID if available — disambiguation picker should appear
- Test with unknown ID — "No product found" message
- Test with Redshift down — error in Redshift section, FPS still works

- [ ] **Step 4: Commit config.js with real data source definitions**

```bash
git add config.js
git commit -m "feat: configure real Redshift queries, FPS endpoints, and external links"
```
