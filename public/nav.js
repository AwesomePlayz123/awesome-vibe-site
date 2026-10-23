// View switching for the main app: #home (default), #steam, #clipart, #audio, #comments, #png.
import { setActive } from './site-header.js';
const TITLES = { home: 'Home', steam: 'Steam Kit', clipart: 'Clipart Finder', audio: 'Audio Finder', comments: 'Comment Cards', png: 'PNG Converter' };

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
  setActive(view);
  document.title = view === 'home' ? 'awesome-vibe-site' : `${TITLES[view]} · awesome-vibe-site`;
  document.dispatchEvent(new CustomEvent('viewchange', { detail: view }));
}

// Friendly greeting on the home screen.
const hour = new Date().getHours();
const greet = document.getElementById('greet');
if (greet) greet.textContent = hour < 5 ? 'Late night edit?' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

window.addEventListener('hashchange', show);
show();
