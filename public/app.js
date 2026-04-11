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
  identityContent.innerHTML = `
    <table>
      <tr><td>Product ID</td><td>${match.product_id}</td></tr>
      <tr><td>Style ID</td><td>${match.style_id}</td></tr>
      <tr><td>Supplier</td><td>${match.supplier_name}</td></tr>
    </table>
  `;

  const productId = match.product_id;
  fetchLinks(productId);
  fetchRedshift(productId);
  fetchFps(productId);
}

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

    fpsTabNav.innerHTML = '';
    fpsTabContent.innerHTML = '';
    const panes = {};

    entries.forEach(([name, responseData], idx) => {
      const btn = document.createElement('button');
      btn.textContent = name;
      btn.addEventListener('click', () => activateTab(name));
      if (idx === 0) btn.classList.add('active');
      fpsTabNav.appendChild(btn);

      const pane = document.createElement('div');
      pane.className = 'json-tree';
      pane.appendChild(renderJson(responseData));
      if (idx !== 0) pane.style.display = 'none';
      fpsTabContent.appendChild(pane);
      panes[name] = pane;
    });

    fpsTabs.classList.remove('hidden');

    function activateTab(name) {
      for (const b of fpsTabNav.children) {
        b.classList.toggle('active', b.textContent === name);
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
