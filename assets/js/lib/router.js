/**
 * Hash router.
 *
 * Hash routing is deliberate: GitHub Pages is static file hosting with no
 * rewrite rules, so `/product/MH-HAIR-001` would 404 on refresh while
 * `#/product/MH-HAIR-001` always loads `index.html`. Every link the app
 * produces therefore stays usable when shared on WhatsApp.
 */

const ROUTES = [
  { name: 'home', pattern: /^\/?$/, params: () => ({}) },
  {
    name: 'catalogue',
    pattern: /^\/catalogue(?:\/([a-z0-9-]+))?(?:\?(.*))?$/i,
    params: (m, query) => ({ category: m[1] || '', query }),
  },
  { name: 'search', pattern: /^\/search(?:\?(.*))?$/i, params: (m, query) => ({ query }) },
  { name: 'product', pattern: /^\/product\/([^/?]+)(?:\?(.*))?$/i, params: (m) => ({ reference: decodeURIComponent(m[1]) }) },
  { name: 'info', pattern: /^\/info(?:\/([a-z0-9-]+))?$/i, params: (m) => ({ section: m[1] || 'delivery' }) },
];

export function parseHash(hash = window.location.hash) {
  const raw = String(hash || '').replace(/^#/, '');
  // A `?query` inside the hash carries search text and category filters.
  const [path, search = ''] = raw.split('?');
  const query = new URLSearchParams(search);

  for (const route of ROUTES) {
    const match = path.match(route.pattern);
    if (match) {
      return {
        name: route.name,
        params: route.params(match, query),
        query,
        path,
      };
    }
  }
  return { name: 'not-found', params: { path }, query, path };
}

/** `/product/MH-HAIR-001` -> `#/product/MH-HAIR-001` (safe encoding). */
export function toHash(path) {
  return `#${path.startsWith('/') ? path : `/${path}`}`;
}

export function buildUrl(path) {
  const base = `${window.location.origin}${stripIndex(document.baseURI)}`;
  return `${base}${toHash(path)}`;
}

function stripIndex(href) {
  const url = new URL(href);
  return url.pathname.replace(/index\.html$/, '');
}

export function navigate(path, { replace = false } = {}) {
  const target = toHash(path);
  if (window.location.hash === target) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }
  if (replace) window.location.replace(target);
  else window.location.hash = target;
}

export function startRouter(render) {
  let currentKey = '';
  const run = () => {
    const route = parseHash();
    const key = `${route.name}:${route.path}:${route.query.toString()}`;
    if (key === currentKey) return;
    currentKey = key;
    render(route);
  };
  window.addEventListener('hashchange', run);
  run();
  return () => window.removeEventListener('hashchange', run);
}

/** Focus management for SPA navigation, for keyboard and screen-reader users. */
export function announceNavigation(label) {
  const live = document.getElementById('mh-route-status');
  if (live) live.textContent = label;
  const heading = document.querySelector('main h1');
  if (heading) {
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }
}
