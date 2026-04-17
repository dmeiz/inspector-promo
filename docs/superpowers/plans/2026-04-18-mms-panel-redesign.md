# MMS Panel Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the style_id-keyed MMS panel with a product_id-keyed panel that selects the most-recently-deployed eligible style, renders Style / Colors / SKUs & SUIDs tabs, and flags any other matches via a ⚠️ emoji + `title` tooltip on the left-nav MMS button.

**Architecture:** Server does five scoped SQL queries (3 style-discovery queries keyed on `mill_no = product_id`, 2 drill-down queries keyed on the selected style's id). Response is a flat object shaped for the existing `renderTable` helper plus a `_meta` companion with non-selected matches. Client replaces the generic `fetchTabbedData('mms', ...)` call with a purpose-built `fetchMmsData(productId)` that extracts `_meta`, updates the left-nav button, and wires 3 tabs. No HTML changes.

**Tech Stack:** Node.js + Express (server), `pg` against Redshift (`rawdata.mms_*`), vanilla JS frontend, `node:test` for server tests. No build step.

**Spec:** `docs/superpowers/specs/2026-04-18-mms-panel-redesign-design.md`

**Testing note:** Backend changes are covered by `test/server.test.js` (node:test with module-level `pg` mocking — existing pattern). Frontend changes (warning emoji, `fetchMmsData`) have no test harness in this repo; manual browser verification is called out explicitly in the last task.

---

## File Structure

- Modify: `config.js` — replace `mmsQueries` with 5 named SQL constants and update `mmsTabOrder`.
- Modify: `server.js` — rewrite `app.get('/api/mms/:id', ...)` handler to the new orchestration.
- Modify: `test/server.test.js` — rewrite the `GET /api/mms/:id` test block for the new response shape; add a second test for the empty-match case.
- Modify: `public/app.js` — add `fetchMmsData`, `applyMmsWarning`, `formatMmsWarningTitle`; change the MMS call in `showProduct`; reset the nav button in `resetResults`.

No files created; `public/index.html` and `public/style.css` unchanged.

---

## Task 1: Config — replace mmsQueries with named SQL constants

**Files:**
- Modify: `config.js:213-251` (delete the `mmsQueries` array) and `config.js:349` (update `mmsTabOrder`).

- [ ] **Step 1: Delete the old `mmsQueries` block**

In `config.js`, delete the entire block from the `// MMS Data` comment through the closing `],` of the `mmsQueries` array:

```js
  // MMS Data — raw MMS tables from rawdata
  // $1 = style_id (mms_styles.id)
  mmsQueries: [
    {
      name: 'Style',
      sql: `SELECT id, name, manufacturer, mill_no, status,
              decoration_method, brand, brand_type, style_type,
              price_level, min_qty, color_limit,
              material, features, sizing, sizes,
              allow_blank, fitted, specialty, sponsorship,
              has_lineup, has_singles_enabled_colors, ihp_bulk_enabled,
              individual_ship_eligible, international_ship_eligible,
              deploy_type, role, unit_of_measure, quantity_per_unit,
              standard_decoration_days, rush_decoration_days,
              created_at, updated_at, deployed_at, retired_at
            FROM rawdata.mms_styles
            WHERE id = CAST($1 AS INT)
            LIMIT 1`,
    },
    {
      name: 'Colors',
      sql: `SELECT id, style_id, name, status,
              pricing_group_id, mill_no, branding_method,
              realb, singles_price, singles_enabled,
              abo_enabled, dtg_enabled, inventory_enabled,
              deploy_type, suppliers,
              deployed_at, retired_at, created_at, updated_at
            FROM rawdata.mms_colors
            WHERE style_id = CAST($1 AS INT)
            ORDER BY name
            LIMIT 200`,
    },
    {
      name: 'SKUs',
      sql: `SELECT id, style_id, color_id, size_id, status,
              created_at, updated_at
            FROM rawdata.mms_skus
            WHERE style_id = CAST($1 AS INT)
            ORDER BY color_id, size_id
            LIMIT 200`,
    },
  ],
```

- [ ] **Step 2: Insert the 5 new SQL constants in the same place**

At the location where `mmsQueries` was, insert:

```js
  // MMS Data — raw MMS tables from rawdata, keyed on product_id via mill_no.
  // mmsSelectedStyleSql: $1 = product_id — returns 0..1 row (most-recently deployed eligible style)
  mmsSelectedStyleSql: `SELECT id, name, manufacturer, mill_no, status,
           decoration_method, brand, brand_type, style_type,
           price_level, min_qty, color_limit,
           material, features, sizing, sizes,
           allow_blank, fitted, specialty, sponsorship,
           has_lineup, has_singles_enabled_colors, ihp_bulk_enabled,
           individual_ship_eligible, international_ship_eligible,
           deploy_type, role, unit_of_measure, quantity_per_unit,
           standard_decoration_days, rush_decoration_days,
           created_at, updated_at, deployed_at, retired_at
    FROM rawdata.mms_styles
    WHERE mill_no = $1
      AND status IN ('active','inactive','preview')
    ORDER BY deployed_at DESC NULLS LAST, id ASC
    LIMIT 1`,

  // mmsOtherMatchesSql: $1 = product_id — eligible matches other than the first (offset 1)
  mmsOtherMatchesSql: `SELECT id, name, status, deployed_at
    FROM rawdata.mms_styles
    WHERE mill_no = $1
      AND status IN ('active','inactive','preview')
    ORDER BY deployed_at DESC NULLS LAST, id ASC
    OFFSET 1 LIMIT 20`,

  // mmsIneligibleMatchesSql: $1 = product_id — everything else on the same mill_no
  mmsIneligibleMatchesSql: `SELECT id, name, status, deployed_at
    FROM rawdata.mms_styles
    WHERE mill_no = $1
      AND status NOT IN ('active','inactive','preview')
    ORDER BY deployed_at DESC NULLS LAST, id ASC
    LIMIT 20`,

  // mmsColorsSql: $1 = selected style.id
  mmsColorsSql: `SELECT id, style_id, name, status,
           pricing_group_id, mill_no, branding_method,
           realb, singles_price, singles_enabled,
           abo_enabled, dtg_enabled, inventory_enabled,
           deploy_type, suppliers,
           deployed_at, retired_at, created_at, updated_at
    FROM rawdata.mms_colors
    WHERE style_id = CAST($1 AS INT)
    ORDER BY name
    LIMIT 500`,

  // mmsSkusSuidsSql: $1 = selected style.id — one row per (size × SUID); sizes with no SUID row still appear via LEFT JOIN
  mmsSkusSuidsSql: `SELECT c.id AS color_id, c.name AS color_name, c.status AS color_status,
           sz.id AS size_id, sz.name AS size_name, sz.position,
           sz.status AS size_status, sz.gtin, sz.in_stock,
           sz.last_known_supplier_quantity, sz.oos_threshold,
           sk.status AS sku_status,
           u.supplier_id, u.uid, u.part_group
    FROM rawdata.mms_colors c
    JOIN rawdata.mms_sizes sz ON sz.color_id = c.id
    LEFT JOIN rawdata.mms_skus sk
      ON sk.style_id = c.style_id
     AND sk.color_id = c.id
     AND UPPER(sk.size_id) = UPPER(sz.name)
    LEFT JOIN rawdata.mms_supplier_unique_ids u
      ON u.size_id = sz.id
    WHERE c.style_id = CAST($1 AS INT)
    ORDER BY c.name, sz.position, u.supplier_id
    LIMIT 500`,
```

- [ ] **Step 3: Update `mmsTabOrder` on line ~349**

Replace:
```js
  mmsTabOrder: ['Style', 'Colors', 'SKUs'],
```

with:
```js
  mmsTabOrder: ['Style', 'Colors', 'SKUs & SUIDs'],
```

- [ ] **Step 4: Verify the config still parses**

Run:
```bash
node -e "console.log(Object.keys(require('./config')).sort().join('\n'))"
```

Expected output contains (among others):
```
mmsColorsSql
mmsIneligibleMatchesSql
mmsOtherMatchesSql
mmsSelectedStyleSql
mmsSkusSuidsSql
mmsTabOrder
```
and does NOT contain `mmsQueries`.

- [ ] **Step 5: Commit**

```bash
git add config.js
git commit -m "refactor(config): replace mmsQueries with 5 named SQL constants"
```

---

## Task 2: Server — rewrite `/api/mms/:product_id` route

**Files:**
- Modify: `server.js:68-83` (current MMS route handler)

- [ ] **Step 1: Replace the MMS route handler**

Find the block in `server.js`:

```js
// MMS data route — raw MMS tables from rawdata
// :id is the style_id (mms_styles.id)
app.get('/api/mms/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const results = {};
    const queries = config.mmsQueries.map(async ({ name, sql }) => {
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

Replace it with:

```js
// MMS data route — raw MMS tables from rawdata, keyed by product_id via mill_no.
// :product_id matches mms_styles.mill_no. Selects the most-recently-deployed
// eligible style (status in active/inactive/preview) and returns its colors plus
// a size×SUID join. _meta carries other eligible matches and ineligible matches.
app.get('/api/mms/:product_id', async (req, res) => {
  const productId = req.params.product_id;
  try {
    const [selectedRes, otherRes, ineligibleRes] = await Promise.all([
      pool.query(config.mmsSelectedStyleSql, [productId]),
      pool.query(config.mmsOtherMatchesSql, [productId]),
      pool.query(config.mmsIneligibleMatchesSql, [productId]),
    ]);

    const selectedStyle = selectedRes.rows[0] || null;
    let colorsRows = [];
    let skusSuidsRows = [];

    if (selectedStyle) {
      const [colorsRes, skusSuidsRes] = await Promise.all([
        pool.query(config.mmsColorsSql, [selectedStyle.id]),
        pool.query(config.mmsSkusSuidsSql, [selectedStyle.id]),
      ]);
      colorsRows = colorsRes.rows;
      skusSuidsRows = skusSuidsRes.rows;
    }

    res.json({
      Style: selectedStyle ? [selectedStyle] : [],
      Colors: colorsRows,
      'SKUs & SUIDs': skusSuidsRows,
      _meta: {
        millNo: productId,
        otherMatches: otherRes.rows,
        ineligibleMatches: ineligibleRes.rows,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 2: Smoke-run the server**

Run:
```bash
node -e "require('./server'); console.log('server module loads')"
```

Expected: prints `server module loads` and exits 0. (The `Pool` will attempt to resolve hostnames, but we're not hitting the network here; no error should be thrown from module evaluation since only the `require` is executed.)

If it does throw (e.g. `config.mms... is undefined`), fix the reference mismatch and rerun.

NOTE: `npm test` will fail at this point because the existing MMS test block still references the now-deleted `config.mmsQueries`. Task 3 replaces that test. Do not run the full test suite until Task 3 is complete.

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat(api): key /api/mms on product_id via mill_no match"
```

---

## Task 3: Update server test for new MMS response

**Files:**
- Modify: `test/server.test.js:74-105` (existing `GET /api/mms/:id` describe block) and add an adjacent describe block for the empty-match case.

- [ ] **Step 1: Replace the existing MMS describe block**

Find the block starting with `describe('GET /api/mms/:id', () => {` and ending at the closing `});` of that describe (currently lines 74-105). Replace with:

```js
describe('GET /api/mms/:product_id', () => {
  it('returns Style, Colors, SKUs & SUIDs and _meta when a style is selected', async () => {
    const Module = require('module');
    const originalRequire = Module.prototype.require;

    Module.prototype.require = function(id) {
      if (id === 'pg') {
        return {
          Pool: class {
            query() {
              return { rows: [{ id: 1, name: 'Test Style', mill_no: 'ABC123', status: 'active' }] };
            }
            end() {}
          }
        };
      }
      return originalRequire.apply(this, arguments);
    };

    delete require.cache[require.resolve('../server')];
    const app = require('../server');
    const res = await request(app, '/api/mms/ABC123');

    Module.prototype.require = originalRequire;

    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.Style), 'Style should be an array');
    assert.strictEqual(res.body.Style.length, 1, 'Style should have the selected row');
    assert.ok(Array.isArray(res.body.Colors), 'Colors should be an array');
    assert.ok(Array.isArray(res.body['SKUs & SUIDs']), 'SKUs & SUIDs should be an array');
    assert.ok(res.body._meta, '_meta should be present');
    assert.strictEqual(res.body._meta.millNo, 'ABC123');
    assert.ok(Array.isArray(res.body._meta.otherMatches));
    assert.ok(Array.isArray(res.body._meta.ineligibleMatches));
  });

  it('returns empty tab arrays when no style is selected', async () => {
    const Module = require('module');
    const originalRequire = Module.prototype.require;

    // Track call order; first 3 calls are selected/other/ineligible in parallel.
    let callIndex = 0;
    Module.prototype.require = function(id) {
      if (id === 'pg') {
        return {
          Pool: class {
            query() {
              callIndex += 1;
              // First call is selected style — return empty to simulate no match.
              if (callIndex === 1) return { rows: [] };
              // Subsequent calls (other/ineligible) return empty too.
              return { rows: [] };
            }
            end() {}
          }
        };
      }
      return originalRequire.apply(this, arguments);
    };

    delete require.cache[require.resolve('../server')];
    const app = require('../server');
    const res = await request(app, '/api/mms/NOPE');

    Module.prototype.require = originalRequire;

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body.Style, []);
    assert.deepStrictEqual(res.body.Colors, []);
    assert.deepStrictEqual(res.body['SKUs & SUIDs'], []);
    assert.strictEqual(res.body._meta.millNo, 'NOPE');
    assert.deepStrictEqual(res.body._meta.otherMatches, []);
    assert.deepStrictEqual(res.body._meta.ineligibleMatches, []);
  });
});
```

- [ ] **Step 2: Run the test suite**

Run:
```bash
npm test -- --test-name-pattern='GET /api/mms'
```

Expected: both tests pass. Sample output:
```
✔ returns Style, Colors, SKUs & SUIDs and _meta when a style is selected
✔ returns empty tab arrays when no style is selected
```

If they fail with `ReferenceError: config.mmsQueries is not defined`, the test block still has a leftover reference — remove it. (The new block does not use `config.mmsQueries`.)

- [ ] **Step 3: Run the full test suite to confirm no regressions**

Run:
```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add test/server.test.js
git commit -m "test(server): cover new /api/mms response shape"
```

---

## Task 4: Client — add fetchMmsData and wire it into the lookup flow

**Files:**
- Modify: `public/app.js` — add new functions near the existing `fetchTabbedData`; change the MMS call in `showProduct`; extend `resetResults`; update `MMS_TAB_ORDER`.

- [ ] **Step 1: Update the MMS_TAB_ORDER constant**

Near the top of `public/app.js` there's:
```js
const MMS_TAB_ORDER = ['Style', 'Colors', 'SKUs'];
```

Change it to:
```js
const MMS_TAB_ORDER = ['Style', 'Colors', 'SKUs & SUIDs'];
```

- [ ] **Step 2: Replace the MMS branch in `showProduct`**

Find the block in `showProduct`:

```js
  if (styleId) {
    fetchTabbedData('mms', styleId, 'MMS', renderTable, MMS_TAB_ORDER);
  } else {
    document.getElementById('mms-tab-content').innerHTML =
      '<span class="text-muted fst-italic">No style ID available — MMS data requires a style ID</span>';
  }
```

Replace with:
```js
  fetchMmsData(productId);
```

- [ ] **Step 3: Extend `resetResults` to clear the MMS warning**

Find `resetResults()` and append these lines immediately before its closing `}` (after the existing section-reset logic):

```js
  const mmsNavBtn = document.querySelector('#left-nav [data-section="mms"]');
  if (mmsNavBtn) {
    mmsNavBtn.textContent = 'MMS';
    mmsNavBtn.removeAttribute('title');
  }
```

- [ ] **Step 4: Add the `fetchMmsData` + helpers**

Find the comment `// --- Grouped tabbed data fetcher (for FPDB) ---` in `public/app.js`. Immediately before that comment, insert this block:

```js
// --- MMS fetcher (product_id keyed, with left-nav warning) ---

function fetchMmsData(productId) {
  const loadingEl = document.getElementById('mms-loading');
  const tabNavEl = document.getElementById('mms-tab-nav');
  const tabContentEl = document.getElementById('mms-tab-content');
  const mmsNavBtn = document.querySelector('#left-nav [data-section="mms"]');

  loadingEl.classList.remove('d-none');
  tabNavEl.innerHTML = '';
  tabContentEl.innerHTML = '';
  if (mmsNavBtn) {
    mmsNavBtn.textContent = 'MMS';
    mmsNavBtn.removeAttribute('title');
  }

  fetch(`/api/mms/${encodeURIComponent(productId)}`)
    .then((res) => res.json())
    .then((data) => {
      loadingEl.classList.add('d-none');

      if (data.error) {
        tabContentEl.innerHTML = `<div class="alert alert-danger">MMS error: ${data.error}</div>`;
        return;
      }

      const meta = data._meta || { otherMatches: [], ineligibleMatches: [] };
      delete data._meta;
      if (mmsNavBtn) applyMmsWarning(mmsNavBtn, meta);

      const entries = MMS_TAB_ORDER.map((name) => [name, Array.isArray(data[name]) ? data[name] : []]);
      const panes = {};

      entries.forEach(([name, rows], idx) => {
        const li = document.createElement('li');
        li.className = 'nav-item';
        const btn = document.createElement('button');
        btn.className = `nav-link${idx === 0 ? ' active' : ''}`;
        btn.textContent = name;
        btn.addEventListener('click', () => activateTab(name));
        li.appendChild(btn);
        tabNavEl.appendChild(li);

        const pane = document.createElement('div');
        pane.className = `tab-pane${idx === 0 ? ' active' : ''}`;
        renderTable(pane, rows);
        if (idx !== 0) pane.style.display = 'none';
        tabContentEl.appendChild(pane);
        panes[name] = pane;
      });

      function activateTab(name) {
        for (const li of tabNavEl.children) {
          const b = li.querySelector('.nav-link');
          b.classList.toggle('active', b.textContent === name);
        }
        Object.entries(panes).forEach(([n, p]) => {
          p.style.display = n === name ? '' : 'none';
          p.classList.toggle('active', n === name);
        });
      }
    })
    .catch((err) => {
      loadingEl.classList.add('d-none');
      tabContentEl.innerHTML = `<div class="alert alert-danger">Failed to load MMS data: ${err.message}</div>`;
    });
}

function applyMmsWarning(btn, meta) {
  const total = (meta.otherMatches?.length || 0) + (meta.ineligibleMatches?.length || 0);
  if (total === 0) {
    btn.textContent = 'MMS';
    btn.removeAttribute('title');
    return;
  }
  btn.textContent = 'MMS ⚠️';
  btn.title = formatMmsWarningTitle(meta);
}

function formatMmsWarningTitle(meta) {
  const formatEntries = (list) => {
    const top = list.slice(0, 5).map((m) => {
      const date = m.deployed_at ? String(m.deployed_at).slice(0, 10) : '—';
      const name = m.name || '(no name)';
      return `${m.id}: ${name} (${m.status}, ${date})`;
    }).join('; ');
    const more = list.length > 5 ? ` +${list.length - 5} more` : '';
    return `${top}${more}`;
  };
  const parts = [];
  if (meta.otherMatches?.length) {
    parts.push(`${meta.otherMatches.length} other eligible — ${formatEntries(meta.otherMatches)}`);
  }
  if (meta.ineligibleMatches?.length) {
    parts.push(`${meta.ineligibleMatches.length} ineligible — ${formatEntries(meta.ineligibleMatches)}`);
  }
  return parts.join('. ') + '.';
}
```

- [ ] **Step 5: Sanity check — static grep**

Run:
```bash
grep -n "fetchTabbedData('mms'" public/app.js || echo "none (good)"
grep -n "No style ID available" public/app.js || echo "none (good)"
grep -n "fetchMmsData" public/app.js
```

Expected:
- First two commands print `none (good)` (no leftover references to the old path).
- Third command shows at least two lines: the definition (inside the MMS fetcher block) and the call in `showProduct`.

- [ ] **Step 6: Commit**

```bash
git add public/app.js
git commit -m "feat(ui): product_id-keyed MMS panel with nav warning for other matches"
```

---

## Task 5: Manual end-to-end verification

- [ ] **Step 1: Start the server**

Run:
```bash
bin/server
```

Expected: `Inspector Promo running at http://localhost:3000`.

- [ ] **Step 2: Look up a product known to have exactly one eligible MMS style**

In the browser at `http://localhost:3000`, enter a product id with a single `mill_no` match in MMS. Click `MMS` in the left nav.

- Expected: `Style` tab shows one row with the selected style's fields.
- Expected: `Colors` tab shows the color rows.
- Expected: `SKUs & SUIDs` tab shows one row per (size × supplier).
- Expected: the `MMS` nav button has NO ⚠️ emoji and NO tooltip.

- [ ] **Step 3: Look up a product with multiple MMS styles for the same mill_no**

In the browser, enter a product id known to have >1 MMS style (e.g. a product with separate embroidery/screen-print styles).

- Expected: the `MMS` nav button text becomes `MMS ⚠️`.
- Expected: hovering the button reveals a tooltip summarizing the other matches (e.g. `"1 other eligible — 12346: Name (preview, 2026-02-01)."`).
- Expected: the panel shows data for the most-recently-deployed match. The `Style` tab's row's `id` matches the first id in the left nav tooltip (if there are multiple, the selected one is distinct from the ones listed).

- [ ] **Step 4: Look up a product with only retired/offsite MMS styles**

In the browser, enter a product id whose only MMS matches are `retired` or `offsite`.

- Expected: the `MMS` nav button becomes `MMS ⚠️`.
- Expected: tooltip says `N ineligible — ...`.
- Expected: all three tabs in the panel render "No data found".

- [ ] **Step 5: Look up a product with zero MMS presence**

- Expected: `MMS` nav button stays `MMS` (no emoji, no tooltip).
- Expected: all three tabs render "No data found".

- [ ] **Step 6: Start a fresh lookup after a warning — verify reset**

Do a lookup that triggers the ⚠️, then without reloading the page enter a different product id with no other matches and submit.

- Expected: during the new lookup, the `MMS` button reverts to `MMS` (warning cleared by `resetResults` + the new fetch).

- [ ] **Step 7: No regressions**

- Click each left-nav section (Links, FPDB, FPS, MMS, S3) — they still switch correctly.
- Recents dropdown still works (top entry, click-to-lookup).
- Ambiguous-product disambiguation still renders buttons and drills in on click.

- [ ] **Step 8: No commit (verification only)**

This task produces no code changes.
