// View switching: #home (default), #steam, #clipart, #audio.
const TITLES = { home: 'Home', steam: 'Steam Kit', clipart: 'Clipart Finder', audio: 'Audio Finder' };

function currentView() {
  const h = location.hash.slice(1);
  if (h in TITLES) return h;
  // Old-style Steam deep links (?app=548430) open Steam Kit.
  if (new URLSearchParams(location.search).has('app')) return 'steam';
  return 'home';
}

function show() {
  const view = currentView();
  for (const el of document.querySelectorAll('.view')) el.hidden = el.id !== `view-${view}`;
  for (const a of document.querySelectorAll('.tabs a')) {
    const on = a.dataset.view === view;
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  document.title = view === 'home' ? 'awesome-vibe-site' : `${TITLES[view]} · awesome-vibe-site`;
  document.dispatchEvent(new CustomEvent('viewchange', { detail: view }));
}

// Friendly greeting on the home screen.
const hour = new Date().getHours();
const greet = document.getElementById('greet');
if (greet) greet.textContent = hour < 5 ? 'Late night edit?' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

window.addEventListener('hashchange', show);
show();
