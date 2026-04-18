const form = document.getElementById('lookup-form');
const input = document.getElementById('product-id');
input.addEventListener('focus', () => input.select());
const resultsEl = document.getElementById('results');
const identityContent = document.getElementById('identity-content');
const disambiguationEl = document.getElementById('disambiguation');

// Left nav
const navButtons = document.querySelectorAll('#left-nav .nav-link');
const sections = document.querySelectorAll('.content-section');

navButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    navButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    sections.forEach((s) => s.classList.add('d-none'));
    document.getElementById(`${btn.dataset.section}-section`).classList.remove('d-none');
  });
});

// Form submit
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = input.value.trim();
  if (!id) return;
  resetResults();
  resultsEl.classList.remove('d-none');
  await doLookup(id);
});

function resetResults() {
  identityContent.innerHTML = '';
  disambiguationEl.innerHTML = '';
  disambiguationEl.classList.add('d-none');
  // Reset all sections' loading spinner and content areas
  ['fpdb', 'fps', 'mms', 's3', 'links'].forEach((key) => {
    document.getElementById(`${key}-loading`).classList.add('d-none');
    document.getElementById(`${key}-tab-nav`).innerHTML = '';
    document.getElementById(`${key}-tab-content`).innerHTML = '';
  });
  // Reset nav to Links
  navButtons.forEach((b) => b.classList.remove('active'));
  navButtons[0].classList.add('active');
  sections.forEach((s) => s.classList.add('d-none'));
  sections[0].classList.remove('d-none');
}

async function doLookup(id) {
  identityContent.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Looking up...';
  try {
    const res = await fetch(`/api/lookup/${encodeURIComponent(id)}`);
    const data = await res.json();

    if (!data.found) {
      identityContent.innerHTML = '<span class="text-danger">No product found for this ID.</span>';
      return;
    }

    if (data.ambiguous) {
      identityContent.innerHTML = '<span>Multiple matches — select one:</span>';
      disambiguationEl.classList.remove('d-none');
      disambiguationEl.innerHTML = '';
      data.matches.forEach((match) => {
        const btn = document.createElement('button');
        btn.className = 'btn btn-outline-light btn-sm me-2';
        btn.textContent = `${match.product_id} — ${match.supplier_name}`;
        btn.addEventListener('click', () => {
          disambiguationEl.classList.add('d-none');
          showProduct(match);
        });
        disambiguationEl.appendChild(btn);
      });
      return;
    }

    showProduct(data.match);
  } catch (err) {
    identityContent.innerHTML = `<span class="text-danger">Lookup failed: ${err.message}</span>`;
  }
}

function showProduct(match) {
  saveRecent(match);
  renderRecents();

  const descParts = [];
  if (match.supplier_name) descParts.push(match.supplier_name);
  if (match.product_name) descParts.push(match.product_name);
  if (match.style_id) descParts.push(`Style: ${match.style_id}`);
  identityContent.textContent = descParts.join(' · ');

  renderSection('links', fetchLinks(match));
  renderSection('fpdb',  fetchFpdb(match));
  renderSection('fps',   fetchFps(match));
  renderSection('mms',   fetchMms(match));
  renderSection('s3',    fetchS3(match));
}

// --- Recents (localStorage-backed) ---

const RECENTS_KEY = 'inspector-promo.recent';
const RECENTS_MAX = 10;

function loadRecents() {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecent(match) {
  const entry = {
    product_id: match.product_id,
    supplier_name: match.supplier_name,
    product_name: match.product_name,
    style_id: match.style_id,
  };
  const existing = loadRecents().filter((e) => e.product_id !== entry.product_id);
  const next = [entry, ...existing].slice(0, RECENTS_MAX);
  localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  return next;
}

function renderRecents() {
  const menu = document.getElementById('recents-menu');
  const entries = loadRecents();
  menu.innerHTML = '';
  if (entries.length === 0) {
    const li = document.createElement('li');
    li.innerHTML = '<span class="dropdown-item disabled">No recent lookups</span>';
    menu.appendChild(li);
    return;
  }
  entries.forEach((e) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dropdown-item';
    const parts = [e.product_id];
    if (e.supplier_name) parts.push(e.supplier_name);
    if (e.product_name) parts.push(e.product_name);
    btn.textContent = parts.join(' — ');
    btn.title = btn.textContent;
    btn.addEventListener('click', () => {
      input.value = e.product_id;
      resetResults();
      resultsEl.classList.remove('d-none');
      doLookup(e.product_id);
    });
    li.appendChild(btn);
    menu.appendChild(li);
  });
}

renderRecents();
const mostRecent = loadRecents()[0];
if (mostRecent) {
  input.value = mostRecent.product_id;
  resultsEl.classList.remove('d-none');
  doLookup(mostRecent.product_id);
}
