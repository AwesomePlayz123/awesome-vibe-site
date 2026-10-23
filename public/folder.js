// Home screen "Steam" folder: shows mini versions of the apps inside, opens like a phone folder.
const btn = document.getElementById('openSteamFolder');
const overlay = document.getElementById('steamFolder');
const sheet = overlay.querySelector('.folder-sheet');
const apps = [...overlay.querySelectorAll('.folder-apps .app')];

// Mini icons: reuse each app's own icon so the folder always matches what's inside.
const preview = btn.querySelector('.folder-icon');
for (const a of apps.slice(0, 4)) {
  const icon = a.querySelector('.app-icon');
  const mini = document.createElement('span');
  mini.className = `mini ${[...icon.classList].filter((c) => c.startsWith('i-')).join(' ')}`;
  mini.innerHTML = icon.innerHTML;
  preview.appendChild(mini);
}

function open() {
  overlay.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
  apps[0]?.focus();
}
function close() {
  if (overlay.hidden) return;
  overlay.hidden = true;
  btn.setAttribute('aria-expanded', 'false');
  btn.focus();
}

btn.addEventListener('click', open);
overlay.addEventListener('click', (e) => {
  if (!sheet.contains(e.target)) close();
});
for (const a of apps) a.addEventListener('click', () => (overlay.hidden = true));
document.addEventListener('keydown', (e) => {
  if (overlay.hidden) return;
  if (e.key === 'Escape') close();
  if (e.key === 'Tab') {
    // keep keyboard focus inside the open folder
    const first = apps[0];
    const last = apps[apps.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});
// Leaving the home screen closes it.
document.addEventListener('viewchange', () => (overlay.hidden = true));
