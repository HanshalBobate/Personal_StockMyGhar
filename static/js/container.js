/* ── Container Detail Page Logic: Item management + quantity slider ── */

// ── State ─────────────────────────────────
let items          = [];
let editingItemId  = null;
let deletingItemId = null;
let pendingImage   = null;   // base64 data-URL or null

// ── API helpers ────────────────────────────
const api = {
  async json(url, opts = {}) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },
};

// ── Fetch & Render ─────────────────────────
async function loadItems() {
  try {
    items = await api.json(`/api/containers/${CONTAINER_ID}/items`);
    renderItems(items);
    updateCountLabel(items.length);
    refreshNavStats();
  } catch (e) {
    showToast('Failed to load items', 'error');
  }
}

async function refreshNavStats() {
  try {
    const stats = await api.json('/api/stats');
    document.getElementById('statContainers').textContent =
      `${stats.containers} container${stats.containers !== 1 ? 's' : ''}`;
    document.getElementById('statItems').textContent =
      `${stats.items} item${stats.items !== 1 ? 's' : ''}`;
  } catch (_) {}
}

function updateCountLabel(n) {
  document.getElementById('itemCountLabel').textContent =
    `${n} item${n !== 1 ? 's' : ''}`;
}

function renderItems(list) {
  const grid   = document.getElementById('itemsGrid');
  const empty  = document.getElementById('emptyState');
  const loader = document.getElementById('gridLoader');

  if (loader) loader.remove();
  grid.innerHTML = '';

  if (!list.length) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  list.forEach((item, i) => {
    const numQty   = parseFloat(item.quantity);
    const isNumeric = !isNaN(numQty);
    const card = document.createElement('div');
    card.className = 'item-card';
    card.dataset.id = item.id;
    card.style.animationDelay = `${i * 50}ms`;

    const imgHtml = item.image_url
      ? `<img src="${item.image_url}" alt="${escHtml(item.name)}" loading="lazy" />`
      : `<div class="item-img-placeholder">🛒</div>`;

    // Slider section – only for numeric quantities; max = max(item.qty*4, 20)
    const sliderMax  = isNumeric ? Math.max(numQty * 4, 20) : 0;
    const sliderStep = isNumeric ? (numQty < 10 ? 0.5 : 1) : 1;
    const sliderHtml = isNumeric ? `
      <div class="item-slider-wrap">
        <div class="qty-slider-label">
          <span>Qty</span>
          <span class="qty-slider-val" id="sliderVal-${item.id}">${escHtml(item.quantity)} ${escHtml(item.unit)}</span>
        </div>
        <input
          type="range"
          class="qty-slider"
          id="slider-${item.id}"
          data-id="${item.id}"
          data-unit="${escHtml(item.unit)}"
          min="0"
          max="${sliderMax}"
          step="${sliderStep}"
          value="${numQty}"
          style="--slider-color: ${CONTAINER_COLOR};"
          aria-label="Quantity for ${escHtml(item.name)}"
        />
        <div class="qty-slider-saving hidden" id="sliderSaving-${item.id}">saving…</div>
      </div>` : '';

    card.innerHTML = `
      <div class="item-img-wrap" data-action="lightbox" data-url="${item.image_url || ''}" title="View full image">
        ${imgHtml}
      </div>
      <div class="item-body">
        <div class="item-name" title="${escHtml(item.name)}">${escHtml(item.name)}</div>
        <div class="item-qty-badge" id="qtyBadge-${item.id}" style="background:${CONTAINER_COLOR}22; color:${CONTAINER_COLOR};">
          ${escHtml(item.quantity)} ${escHtml(item.unit)}
        </div>
        ${item.notes ? `<div class="item-notes" title="${escHtml(item.notes)}">${escHtml(item.notes)}</div>` : ''}
      </div>
      ${sliderHtml}
      <div class="item-footer">
        <button class="btn-icon-sm btn-edit"   data-action="edit-item"   data-id="${item.id}" title="Edit item" aria-label="Edit ${item.name}">✏️</button>
        <button class="btn-icon-sm btn-delete" data-action="delete-item" data-id="${item.id}" title="Delete item" aria-label="Delete ${item.name}">🗑️</button>
      </div>
    `;
    grid.appendChild(card);
  });
}

// ── Slider Logic ───────────────────────────
// Debounce map: itemId → timeout handle
const _sliderTimers = {};

function handleSliderInput(slider) {
  const id      = parseInt(slider.dataset.id);
  const unit    = slider.dataset.unit;
  const rawVal  = parseFloat(slider.value);
  // Display value: strip trailing zeros
  const display = rawVal % 1 === 0 ? String(rawVal | 0) : String(rawVal);

  // Update badge and label in real time
  const badge = document.getElementById(`qtyBadge-${id}`);
  const label = document.getElementById(`sliderVal-${id}`);
  if (badge) badge.textContent = `${display} ${unit}`;
  if (label) label.textContent = `${display} ${unit}`;

  // Show saving indicator and debounce API call (600ms)
  const saving = document.getElementById(`sliderSaving-${id}`);
  if (saving) saving.classList.remove('hidden');
  clearTimeout(_sliderTimers[id]);
  _sliderTimers[id] = setTimeout(async () => {
    try {
      await api.json(`/api/items/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ quantity: display }),
      });
      // Update local state
      const item = items.find(x => x.id === id);
      if (item) item.quantity = display;
      if (saving) saving.classList.add('hidden');
    } catch (e) {
      if (saving) saving.classList.add('hidden');
      showToast('Failed to save quantity', 'error');
    }
  }, 600);
}

// ── Item Modal ─────────────────────────────
function resetItemModal() {
  document.getElementById('iName').value  = '';
  document.getElementById('iQty').value   = '1';
  document.getElementById('iUnit').value  = 'pcs';
  document.getElementById('iNotes').value = '';
  clearImagePreview();
  pendingImage = null;
}

function openCreateItem() {
  editingItemId = null;
  resetItemModal();
  document.getElementById('itemModalTitle').textContent = 'Add Item';
  openModal('itemModal');
}

function openEditItem(id) {
  const item = items.find(x => x.id === id);
  if (!item) return;
  editingItemId = id;

  document.getElementById('iName').value  = item.name;
  document.getElementById('iQty').value   = item.quantity;
  document.getElementById('iUnit').value  = item.unit;
  document.getElementById('iNotes').value = item.notes || '';

  if (item.image_url) {
    document.getElementById('imagePreview').src = item.image_url;
    document.getElementById('imagePreviewWrap').classList.remove('hidden');
    document.getElementById('imagePlaceholder').classList.add('hidden');
  } else {
    clearImagePreview();
  }
  pendingImage = null;

  document.getElementById('itemModalTitle').textContent = 'Edit Item';
  openModal('itemModal');
}

async function saveItem() {
  const name  = document.getElementById('iName').value.trim();
  const qty   = document.getElementById('iQty').value.trim();
  const unit  = document.getElementById('iUnit').value;
  const notes = document.getElementById('iNotes').value.trim();

  if (!name) {
    document.getElementById('iName').focus();
    showToast('Item name is required', 'error');
    return;
  }
  if (!qty) {
    document.getElementById('iQty').focus();
    showToast('Quantity is required', 'error');
    return;
  }

  const payload = { name, quantity: qty, unit, notes };
  if (pendingImage !== null) payload.image = pendingImage;

  try {
    if (editingItemId) {
      await api.json(`/api/items/${editingItemId}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Item updated ✓');
    } else {
      await api.json(`/api/containers/${CONTAINER_ID}/items`, { method: 'POST', body: JSON.stringify(payload) });
      showToast('Item added ✓');
    }
    closeModal('itemModal');
    await loadItems();
  } catch (e) {
    showToast(e.message || 'Save failed', 'error');
  }
}

// ── Delete Item ────────────────────────────
function openDeleteItem(id) {
  deletingItemId = id;
  const item = items.find(x => x.id === id);
  document.getElementById('deleteItemName').textContent = item?.name || 'this item';
  openModal('deleteItemModal');
}

async function confirmDeleteItem() {
  if (!deletingItemId) return;
  try {
    await api.json(`/api/items/${deletingItemId}`, { method: 'DELETE' });
    showToast('Item deleted');
    closeModal('deleteItemModal');
    deletingItemId = null;
    await loadItems();
  } catch (e) {
    showToast('Delete failed', 'error');
  }
}

// ── Image Handling ─────────────────────────
function clearImagePreview() {
  document.getElementById('imagePreview').src = '';
  document.getElementById('imagePreviewWrap').classList.add('hidden');
  document.getElementById('imagePlaceholder').classList.remove('hidden');
  document.getElementById('imageFile').value = '';
}

function handleImageFile(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast('Please select an image file', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = (ev) => {
    pendingImage = ev.target.result;
    document.getElementById('imagePreview').src = pendingImage;
    document.getElementById('imagePreviewWrap').classList.remove('hidden');
    document.getElementById('imagePlaceholder').classList.add('hidden');
  };
  reader.readAsDataURL(file);
}

// ── Lightbox ───────────────────────────────
function openLightbox(url) {
  if (!url) return;
  document.getElementById('lightboxImg').src = url;
  document.getElementById('lightbox').classList.remove('hidden');
}

// ── Search ─────────────────────────────────
document.getElementById('searchItems')?.addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase().trim();
  const filtered = q ? items.filter(i =>
    i.name.toLowerCase().includes(q) ||
    (i.notes && i.notes.toLowerCase().includes(q))
  ) : items;
  renderItems(filtered);
  updateCountLabel(filtered.length);
});

// ── Delegated click + input handler on the page ─
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const id  = parseInt(btn.dataset.id);
  const act = btn.dataset.action;
  if (act === 'edit-item')   openEditItem(id);
  if (act === 'delete-item') openDeleteItem(id);
  if (act === 'lightbox') { const url = btn.dataset.url; if (url) openLightbox(url); }
});

// Slider input delegation on the items grid
document.addEventListener('input', (e) => {
  if (e.target.classList.contains('qty-slider')) {
    handleSliderInput(e.target);
  }
});

// ── Event Wiring ───────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadItems();

  // Both desktop and mobile FAB open the same modal
  document.getElementById('btnAddItemDesktop')?.addEventListener('click', openCreateItem);
  document.getElementById('btnAddItemFab')?.addEventListener('click', openCreateItem);

  document.getElementById('saveItem').addEventListener('click', saveItem);
  document.getElementById('cancelItemModal').addEventListener('click', () => closeModal('itemModal'));
  document.getElementById('itemModalClose').addEventListener('click',   () => closeModal('itemModal'));

  document.getElementById('confirmDeleteItem').addEventListener('click', confirmDeleteItem);
  document.getElementById('cancelDeleteItemModal').addEventListener('click', () => closeModal('deleteItemModal'));
  document.getElementById('deleteItemModalClose').addEventListener('click',  () => closeModal('deleteItemModal'));

  document.getElementById('imageFile').addEventListener('change', (e) => {
    handleImageFile(e.target.files[0]);
  });

  document.getElementById('removeImage').addEventListener('click', (e) => {
    e.stopPropagation();
    clearImagePreview();
    pendingImage = '';
  });

  document.getElementById('lightboxClose').addEventListener('click', () => {
    document.getElementById('lightbox').classList.add('hidden');
  });
  document.getElementById('lightbox').addEventListener('click', (e) => {
    if (e.target === document.getElementById('lightbox'))
      document.getElementById('lightbox').classList.add('hidden');
  });

  document.getElementById('iName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveItem();
  });
});

// ── Helpers ────────────────────────────────
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
