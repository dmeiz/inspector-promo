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
