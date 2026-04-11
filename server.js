require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const config = require('./config');

const app = express();
const port = process.env.PORT || 3000;

// Redshift connection pool
const pool = new Pool({
  host: process.env.REDSHIFT_HOST || 'redshift-production.db.customink.com',
  port: parseInt(process.env.REDSHIFT_PORT || '5439', 10),
  database: process.env.REDSHIFT_DATABASE || 'cink',
  user: process.env.REDSHIFT_USER || process.env.REDSHIFT_USERNAME,
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

// FPDB data route — raw supplier data from fulfillment_products_service tables
// :id is the product_id (supplier's product ID)
app.get('/api/fpdb/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const results = {};
    const queries = config.fpdbQueries.map(async ({ name, sql }) => {
      const result = await pool.query(sql, [id]);
      results[name] = result.rows;
    });
    await Promise.all(queries);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

// FPS API proxy route — call all configured FPS endpoints for a product
// Accepts ?provider= query param for endpoints that need provider_name
app.get('/api/fps/:id', async (req, res) => {
  const { id } = req.params;
  const provider = req.query.provider || '';
  const baseUrl = process.env.FPS_BASE_URL || '';
  try {
    const results = {};
    const calls = config.fpsEndpoints.map(async ({ name, path }) => {
      const url = `${baseUrl}${path.replace('{id}', encodeURIComponent(id)).replace('{provider}', encodeURIComponent(provider))}`;
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

// Links route — construct URLs for external systems
app.get('/api/links/:id', (req, res) => {
  const { id } = req.params;
  const styleId = req.query.style_id || id;
  const links = config.externalLinks.map(({ name, urlPattern }) => ({
    name,
    url: urlPattern.replace('{id}', id).replace('{style_id}', styleId),
  }));
  res.json({ links });
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
