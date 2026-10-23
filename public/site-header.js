// Renders the shared header + navbar into <header id="siteHeader">, on the main app and on every tool page.
// The "Steam" tab expands into a menu with all the Steam tools.
export const NAV = [
  {
    id: 'steam-group',
    label: 'Steam',
    children: [
      { id: 'steam', label: 'Steam Kit', desc: 'Logo, art, trailers, info card, price tag', href: '/#steam' },
      { id: 'steam-case', label: 'Case Generator', desc: 'Game covers in a Steam case, one or a whole list', href: '/tools/steam-case/' },
      { id: 'steam-review', label: 'Review Generator', desc: 'A Steam store review as a PNG', href: '/tools/steam-review/' },
      { id: 'steam-price', label: 'Price Generator', desc: 'Steam discount tags, one or in bulk', href: '/tools/steam-price/' },
    ],
  },
  { id: 'clipart', label: 'Clipart', href: '/#clipart' },
  { id: 'audio', label: 'Audio', href: '/#audio' },
  { id: 'comments', label: 'Comments', href: '/#comments' },
  { id: 'png', label: 'PNG', href: '/#png' },
  { id: 'thumbnails', label: 'Thumbnails', href: '/tools/thumbnail-viewer/' },
];

const CARET = '<svg class="site-caret" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const header = document.getElementById('siteHeader');
const onMainApp = location.pathname === '/' || location.pathname === '/index.html';
// On the main app, plain #hash links switch views without reloading.
const link = (href) => (onMainApp && href.startsWith('/#') ? href.slice(1) : href);

header.classList.add('site-top');
header.innerHTML = `
  <a class="site-brand" href="${link('/#home')}" aria-label="Home"><span class="site-dot"></span><span>awesome-vibe-site</span></a>
  <nav class="site-tabs" aria-label="Tools"></nav>`;
const tabs = header.querySelector('.site-tabs');

const menus = [];
for (const item of NAV) {
  if (!item.children) {
    const a = document.createElement('a');
    a.href = link(item.href);
    a.dataset.id = item.id;
    a.textContent = item.label;
    tabs.appendChild(a);
    continue;
  }
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.dataset.id = item.id;
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-haspopup', 'true');
  btn.innerHTML = `${item.label}${CARET}`;
  tabs.appendChild(btn);

  // The menu lives outside the (scrollable) tab strip so it never gets clipped on phones.
  const menu = document.createElement('ul');
  menu.className = 'site-menu';
  menu.hidden = true;
  menu.setAttribute('aria-label', `${item.label} tools`);
  for (const c of item.children) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = link(c.href);
    a.dataset.id = c.id;
    a.innerHTML = '<b></b><small></small>';
    a.querySelector('b').textContent = c.label;
    a.querySelector('small').textContent = c.desc;
    a.addEventListener('click', () => close());
    li.appendChild(a);
    menu.appendChild(li);
  }
  document.body.appendChild(menu);
  menus.push({ btn, menu, item });

  const place = () => {
    const r = btn.getBoundingClientRect();
    menu.style.top = `${Math.round(r.bottom + 8)}px`;
    menu.style.left = `${Math.round(Math.max(16, Math.min(r.left, window.innerWidth - menu.offsetWidth - 16)))}px`;
  };
  const open = (focusFirst) => {
    close();
    menu.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    place();
    if (focusFirst) menu.querySelector('a')?.focus();
  };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menu.hidden) open(e.detail === 0); // keyboard "click" (Enter/Space) focuses the first item
    else close();
  });
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      open(true);
    }
  });
  menu.addEventListener('keydown', (e) => {
    const links = [...menu.querySelectorAll('a')];
    const i = links.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      links[(i + 1) % links.length].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      links[(i - 1 + links.length) % links.length].focus();
    } else if (e.key === 'Escape') {
      close();
      btn.focus();
    }
  });
}

function close() {
  for (const { btn, menu } of menus) {
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  }
}
document.addEventListener('click', (e) => {
  if (!menus.some(({ menu }) => menu.contains(e.target))) close();
});
document.addEventListener('keydown', (e) => e.key === 'Escape' && close());
window.addEventListener('resize', close);
tabs.addEventListener('scroll', close);
window.addEventListener('hashchange', close);

/** Highlight the current tool (by id from NAV). */
export function setActive(id) {
  for (const el of header.querySelectorAll('.site-tabs [data-id]')) {
    el.classList.toggle('on', el.dataset.id === id);
    if (el.dataset.id === id) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  }
  for (const { btn, menu, item } of menus) {
    const inGroup = item.children.some((c) => c.id === id);
    btn.classList.toggle('on', inGroup);
    for (const a of menu.querySelectorAll('a')) {
      a.classList.toggle('on', a.dataset.id === id);
      if (a.dataset.id === id) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
  }
}

// Tool pages say which tool they are with <body data-tool="steam-case">.
if (document.body.dataset.tool) setActive(document.body.dataset.tool);
