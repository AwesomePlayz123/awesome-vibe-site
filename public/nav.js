// Tab switching: #steam (default) and #clipart.
const TITLES = { steam: 'Steam Kit', clipart: 'Clipart Finder' };

function show() {
  const view = location.hash.slice(1) in TITLES ? location.hash.slice(1) : 'steam';
  for (const el of document.querySelectorAll('.view')) el.hidden = el.id !== `view-${view}`;
  for (const a of document.querySelectorAll('.tabs a')) {
    const on = a.dataset.view === view;
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  document.title = `${TITLES[view]} · awesome-vibe-site`;
}

window.addEventListener('hashchange', show);
show();
