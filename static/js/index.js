/* ── Index Page Logic: Container management ── */

// ── State ─────────────────────────────────
let containers    = [];
let editingCidFor = null;   // null = create, number = edit
let deletingCid   = null;

// Selected emoji / color in modal
let selectedEmoji = '📦';
let selectedColor = '#10b981';

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
async function loadContainers() {
  try {
    const [data, stats] = await Promise.all([
      api.json('/api/containers'),
      api.json('/api/stats'),
    ]);
    containers = data;
    renderContainers(containers);
    document.getElementById('statContainers').textContent = `${stats.containers} container${stats.containers !== 1 ? 's' : ''}`;
    document.getElementById('statItems').textContent      = `${stats.items} item${stats.items !== 1 ? 's' : ''}`;
  } catch (e) {
    showToast('Failed to load containers', 'error');
  }
}

function renderContainers(list) {
  const grid   = document.getElementById('containerGrid');
  const empty  = document.getElementById('emptyState');
  const loader = document.getElementById('gridLoader');

  if (loader) loader.remove();

  grid.innerHTML = '';

  if (!list.length) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  list.forEach((c, i) => {
    const card = document.createElement('div');
    card.className = 'container-card';
    card.dataset.id = c.id;
    card.style.setProperty('--card-accent', c.color);
    card.style.animationDelay = `${i * 60}ms`;

    card.innerHTML = `
      <div class="card-accent-bar"></div>
      <div class="card-body">
        <div class="card-top">
          <div class="card-icon" style="background:${c.color}18; border:1px solid ${c.color}33;">
            ${c.icon}
          </div>
          <div class="card-actions">
            <button class="btn-icon-sm btn-edit"   data-action="edit"   data-id="${c.id}" title="Edit container" aria-label="Edit ${c.name}">✏️</button>
            <button class="btn-icon-sm btn-delete" data-action="delete" data-id="${c.id}" title="Delete container" aria-label="Delete ${c.name}">🗑️</button>
          </div>
        </div>
        <div class="card-name">${escHtml(c.name)}</div>
        <div class="card-count">
          <strong>${c.item_count}</strong> item${c.item_count !== 1 ? 's' : ''}
        </div>
      </div>
      <div class="card-footer">
        <span>Added ${relativeDate(c.created)}</span>
        <span class="card-open-btn">Open →</span>
      </div>
    `;

    // Click card body (not action buttons) → navigate
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-action]')) return;
      window.location.href = `/container/${c.id}`;
    });

    grid.appendChild(card);
  });

  // Delegate action-button clicks
  grid.addEventListener('click', handleGridAction, { once: false });
}

function handleGridAction(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  e.stopPropagation();
  const id  = parseInt(btn.dataset.id);
  const act = btn.dataset.action;

  if (act === 'edit') {
    openEditContainer(id);
  } else if (act === 'delete') {
    openDeleteConfirm(id);
  }
}

// ── Container Modal ────────────────────────
function resetContainerModal() {
  document.getElementById('cName').value = '';
  setActiveEmoji('📦');
  setActiveColor('#10b981');
}

function openCreateContainer() {
  editingCidFor = null;
  resetContainerModal();
  document.getElementById('containerModalTitle').textContent = 'New Container';
  openModal('containerModal');
}

function openEditContainer(id) {
  const c = containers.find(x => x.id === id);
  if (!c) return;
  editingCidFor = id;
  document.getElementById('cName').value = c.name;
  setActiveEmoji(c.icon);
  setActiveColor(c.color);
  document.getElementById('containerModalTitle').textContent = 'Edit Container';
  openModal('containerModal');
}

async function saveContainer() {
  const name = document.getElementById('cName').value.trim();
  if (!name) {
    document.getElementById('cName').focus();
    showToast('Please enter a container name', 'error');
    return;
  }
  const payload = { name, icon: selectedEmoji, color: selectedColor };
  try {
    if (editingCidFor) {
      await api.json(`/api/containers/${editingCidFor}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Container updated ✓');
    } else {
      await api.json('/api/containers', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Container created ✓');
    }
    closeModal('containerModal');
    await loadContainers();
  } catch (e) {
    showToast(e.message || 'Save failed', 'error');
  }
}

// ── Delete Modal ───────────────────────────
function openDeleteConfirm(id) {
  deletingCid = id;
  const c = containers.find(x => x.id === id);
  document.getElementById('deleteModalMsg').innerHTML =
    `This will permanently delete <strong>${escHtml(c?.name || 'this container')}</strong> and <strong>all its items</strong>. This cannot be undone.`;
  openModal('deleteModal');
}

async function confirmDelete() {
  if (!deletingCid) return;
  try {
    await api.json(`/api/containers/${deletingCid}`, { method: 'DELETE' });
    showToast('Container deleted');
    closeModal('deleteModal');
    deletingCid = null;
    await loadContainers();
  } catch (e) {
    showToast('Delete failed', 'error');
  }
}

// ── Emoji & Color Pickers ──────────────────
function setActiveEmoji(emoji) {
  selectedEmoji = emoji;
  document.querySelectorAll('.emoji-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.emoji === emoji);
  });
}

function setActiveColor(color) {
  selectedColor = color;
  document.querySelectorAll('.swatch').forEach(b => {
    b.classList.toggle('active', b.dataset.color === color);
  });
}

// ── Search ─────────────────────────────────
document.getElementById('searchContainers')?.addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase().trim();
  renderContainers(q ? containers.filter(c => c.name.toLowerCase().includes(q)) : containers);
});

// ── Event Wiring ───────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadContainers();

  // Both desktop header button and mobile FAB trigger the same modal
  document.getElementById('btnNewContainerDesktop')?.addEventListener('click', openCreateContainer);
  document.getElementById('btnNewContainerFab')?.addEventListener('click', openCreateContainer);
  document.getElementById('saveContainer').addEventListener('click', saveContainer);
  document.getElementById('cancelContainerModal').addEventListener('click', () => closeModal('containerModal'));
  document.getElementById('containerModalClose').addEventListener('click', () => closeModal('containerModal'));

  document.getElementById('confirmDelete').addEventListener('click', confirmDelete);
  document.getElementById('cancelDeleteModal').addEventListener('click', () => closeModal('deleteModal'));
  document.getElementById('deleteModalClose').addEventListener('click',  () => closeModal('deleteModal'));

  // Emoji picker
  document.getElementById('emojiPicker').addEventListener('click', (e) => {
    const btn = e.target.closest('.emoji-btn');
    if (btn) setActiveEmoji(btn.dataset.emoji);
  });

  // Color swatches
  document.getElementById('colorSwatches').addEventListener('click', (e) => {
    const sw = e.target.closest('.swatch');
    if (sw) setActiveColor(sw.dataset.color);
  });

  // Enter key submits container modal
  document.getElementById('cName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveContainer();
  });
});

// ── Helpers ────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function relativeDate(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)   return 'just now';
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30)  return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
