/* ── Shared UI utilities used by all pages ── */

// ── Toast ──────────────────────────────────
let _toastTimer;
window.showToast = function(msg, type = 'success', duration = 2800) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `toast ${type} show`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    el.className = 'toast';
  }, duration);
};

// ── Modal helpers ──────────────────────────
window.openModal = function(modalId) {
  const modal    = document.getElementById(modalId);
  const backdrop = document.getElementById('modalBackdrop');
  if (!modal || !backdrop) return;
  backdrop.classList.remove('hidden');
  modal.classList.remove('hidden');
  modal.classList.remove('closing');
  // Focus first interactive element
  const first = modal.querySelector('input:not([type="file"]), select, textarea');
  if (first) setTimeout(() => first.focus(), 80);
};

window.closeModal = function(modalId) {
  const modal    = document.getElementById(modalId);
  const backdrop = document.getElementById('modalBackdrop');
  if (!modal) return;
  modal.classList.add('closing');
  setTimeout(() => {
    modal.classList.add('hidden');
    modal.classList.remove('closing');
    // ✅ Check AFTER hidden is applied — fixes backdrop-stays-visible bug
    const stillOpen = document.querySelectorAll('.modal:not(.hidden)');
    if (!stillOpen.length && backdrop) backdrop.classList.add('hidden');
  }, 200);
};

// Close modal on backdrop click
document.addEventListener('DOMContentLoaded', () => {
  const backdrop = document.getElementById('modalBackdrop');
  if (backdrop) {
    backdrop.addEventListener('click', () => {
      document.querySelectorAll('.modal:not(.hidden)').forEach(m => {
        closeModal(m.id);
      });
    });
  }

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal:not(.hidden)').forEach(m => {
        closeModal(m.id);
      });
      // Also close lightbox
      const lb = document.getElementById('lightbox');
      if (lb && !lb.classList.contains('hidden')) lb.classList.add('hidden');
    }
  });
});
