// Theme toggle (floating bottom-right on every screen)
(function() {
  const KEY = 'verstande-theme';
  const saved = localStorage.getItem(KEY) || 'dark';
  document.documentElement.setAttribute('data-theme', saved);

  function mount() {
    if (document.getElementById('v-theme-toggle')) return;
    const wrap = document.createElement('div');
    wrap.id = 'v-theme-toggle';
    wrap.innerHTML = `
      <style>
        #v-theme-toggle {
          position: fixed; right: 20px; bottom: 20px; z-index: 1000;
          display: flex; gap: 2px; padding: 3px;
          background: var(--bg-elev); border: 1px solid var(--line);
          border-radius: 999px; font-family: var(--font-mono);
          font-size: 10px; box-shadow: var(--shadow-md);
        }
        #v-theme-toggle button {
          padding: 6px 12px; border-radius: 999px;
          color: var(--ink-3); letter-spacing: 0.1em; text-transform: uppercase;
          transition: background 200ms, color 200ms;
        }
        #v-theme-toggle button.on {
          background: var(--accent); color: var(--accent-ink);
        }
      </style>
      <button data-t="dark">Dark</button>
      <button data-t="light">Light</button>
    `;
    document.body.appendChild(wrap);
    function sync() {
      const t = document.documentElement.getAttribute('data-theme');
      wrap.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
    }
    wrap.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => {
        document.documentElement.setAttribute('data-theme', b.dataset.t);
        localStorage.setItem(KEY, b.dataset.t);
        sync();
      });
    });
    sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
