/**
 * Storefront controller: config → data → route → render.
 *
 * The catalogue is fetched from Supabase at page load (or from bundled preview
 * data when the site has not been configured yet), so a price change made in
 * the owner dashboard appears on the next page load without redeploying the
 * frontend.
 */

import { loadConfig, assetUrl } from './lib/config.js';
import { createDataLayer, DataError, sanitizeSearch } from './lib/api.js';
import { startRouter, parseHash, navigate } from './lib/router.js';
import { clear, el, text } from './lib/dom.js';
import { formatNaira } from './lib/money.js';
import { availabilityInfo } from './lib/products.js';
import { buildGeneralEnquiryLink, productEnquiry } from './lib/whatsapp.js';
import {
  renderHome,
  renderCatalogue,
  renderProduct,
  renderInfo,
  notFoundState,
  notListedState,
  errorState,
  productUrl,
} from './pages/store-pages.js';

const main = document.getElementById('mh-main');
const sourceBar = document.getElementById('mh-datasource');
const config = loadConfig();

const state = {
  products: [],
  categories: [],
  settings: null,
  status: 'idle', // idle | loading | ready | error
  error: null,
  lastLoadedAt: null,
  realtimeBound: false,
};

let api = null;
try {
  api = createDataLayer();
} catch (error) {
  state.status = 'error';
  state.error = error;
}

document.getElementById('mh-year').textContent = String(new Date().getFullYear());
renderSourceBar();
render();

/* ------------------------------------------------------------------ loading -- */

async function load({ quiet = false } = {}) {
  if (!api) return;
  if (!quiet) {
    state.status = 'loading';
    render();
  }
  try {
    const [products, categories, settings] = await Promise.all([
      api.listPublicProducts(),
      api.listCategories(),
      api.getStoreSettings(),
    ]);
    state.products = products;
    state.categories = categories;
    state.settings = settings;
    state.status = 'ready';
    state.error = null;
    state.lastLoadedAt = new Date();
    applySettingsToShell(settings);
    bindRealtime();
  } catch (error) {
    state.status = 'error';
    state.error = error;
  }
  renderSourceBar();
  render();
}

/**
 * Realtime is a convenience, never a guarantee. A dropped socket, a slept
 * phone tab or a blocked websocket silently misses updates, so the visible
 * "Refresh prices" control stays in the UI and no copy claims instant push.
 */
function bindRealtime() {
  if (state.realtimeBound || !api || api.mode !== 'supabase' || !config.realtime) return;
  state.realtimeBound = true;
  try {
    api.subscribeProducts(() => load({ quiet: true }));
  } catch {
    state.realtimeBound = true; // do not retry in a loop
  }
}

/**
 * The strip under the header that states where the data on screen came from.
 *
 * This exists because a catalogue that shows example prices is a different
 * thing from a shop, and the difference must be on the screen rather than in a
 * README nobody opens. In live mode the same strip carries the last check time
 * and a manual refresh, because realtime delivery is a convenience and cannot be
 * promised on a phone that has been asleep.
 */
function renderSourceBar() {
  if (!sourceBar) return;
  clear(sourceBar);

  const mode = api?.mode || 'demo';
  if (mode !== 'supabase') {
    sourceBar.hidden = false;
    sourceBar.classList.remove('mh-datasource--live');
    sourceBar.appendChild(
      text('Preview data — the shop is not connected to the store database yet, so the products and prices below are examples.'),
    );
    return;
  }

  if (state.status === 'error') {
    sourceBar.hidden = false;
    sourceBar.classList.remove('mh-datasource--live');
    sourceBar.appendChild(text('The live catalogue could not be reached on this device — check the connection and try again.'));
    return;
  }

  sourceBar.hidden = false;
  sourceBar.classList.add('mh-datasource--live');
  const when = state.lastLoadedAt
    ? state.lastLoadedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'now';
  sourceBar.appendChild(text(`Live catalogue · prices checked ${when} · `));
  sourceBar.appendChild(
    el('button', {
      type: 'button',
      text: 'Check again',
      onClick: async () => {
        await load({ quiet: true });
        showToast('Catalogue refreshed');
      },
    }),
  );
  if (config.realtime) {
    sourceBar.appendChild(text(' · updates during browsing are best-effort'));
  }
}

/** Public settings drive brand copy, so no code edit is needed to change them. */
function applySettingsToShell(settings) {
  if (!settings) return;
  const name = settings.business_name || "Muna’s Haven";
  setText('mh-brand-name', name);
  setText('mh-footer-description', settings.public_description);
  document.title = `${name} — Fashion & Beauty Catalogue`;

  const link = buildGeneralEnquiryLink(settings.whatsapp_number, name);
  for (const id of ['mh-header-whatsapp', 'mh-footer-whatsapp']) {
    const node = document.getElementById(id);
    if (!node) continue;
    if (link) {
      node.setAttribute('href', link.url);
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener');
      node.removeAttribute('aria-disabled');
    } else {
      // Fail gracefully: point at the "how ordering works" note instead of a
      // dead wa.me link with a missing number.
      node.setAttribute('href', '#/info/ordering');
      node.removeAttribute('target');
      node.setAttribute('aria-disabled', 'true');
      node.title = 'No WhatsApp number has been set by the owner yet';
    }
  }
  setText('mh-footer-number', link ? formatDisplayNumber(settings.whatsapp_number) : 'Contact number not set yet');
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node && value) node.textContent = value;
}

function formatDisplayNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('234') && digits.length === 13) {
    return `+${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  }
  return digits ? `+${digits}` : '';
}

/* ----------------------------------------------------------------- rendering -- */

function render() {
  const route = parseHash();
  clear(main);
  highlightNav(route);
  document.title = "Muna’s Haven — Fashion & Beauty Catalogue";

  if (state.status === 'error') {
    main.appendChild(
      errorState(
        'The catalogue could not be loaded',
        state.error instanceof DataError
          ? state.error.message
          : 'Something went wrong while contacting the store. Check your data or Wi-Fi connection and try again.',
      ),
    );
    return;
  }
  if (state.status !== 'ready') {
    main.appendChild(loadingView(route));
    return;
  }

  const ctx = {
    products: state.products,
    categories: state.categories,
    settings: state.settings,
    config,
    onVariantChange: updateOrderLink,
  };

  switch (route.name) {
    case 'home':
      main.appendChild(renderHome(ctx));
      break;
    case 'catalogue':
    case 'search':
      main.appendChild(
        renderCatalogue(ctx, {
          category: route.params.category || route.query.get('c') || '',
          search: route.query.get('q') || '',
        }),
      );
      break;
    case 'product': {
      const reference = String(route.params.reference || '').trim();
      const product = findByReference(reference);
      if (!product) {
        // Not a plain 404: a shopper following an old WhatsApp link needs to know
        // the piece is simply not listed, and needs the way back to the catalogue.
        main.appendChild(notListedState(reference));
        document.title = `Not listed — ${shopName()}`;
        break;
      }
      main.appendChild(renderProduct(ctx, product));
      document.title = `${product.name} (${formatNaira(product.price, { currency: product.currency || 'NGN' }) || 'price on request'}) — ${shopName()}`;
      setOgTags(product);
      break;
    }
    case 'info':
      main.appendChild(renderInfo(ctx, route.params.section));
      document.title = `Good to know — ${shopName()}`;
      break;
    default:
      main.appendChild(notFoundState(route.path || ''));
      document.title = `Page not found — ${shopName()}`;
  }
}

function shopName() {
  return state.settings?.business_name || "Muna’s Haven";
}

/** Case-insensitive on purpose: references are typed by hand in WhatsApp. */
export function findByReference(reference) {
  const needle = String(reference || '').trim().toLowerCase();
  if (!needle) return null;
  return state.products.find((p) => String(p.reference).trim().toLowerCase() === needle) || null;
}

function setOgTags(product) {
  const availability = availabilityInfo(product);
  setMeta('og:title', product.name);
  setMeta('og:description', `${availability.label} · ${product.reference}`);
  setMeta('og:url', productUrl(product));
  if (product.image_url) {
    setMeta('og:image', assetUrl(product.image_url));
  }
}

function setMeta(key, value) {
  let node = document.querySelector(`meta[property="${key}"]`);
  if (!node) {
    node = document.createElement('meta');
    node.setAttribute('property', key);
    document.head.appendChild(node);
  }
  node.setAttribute('content', String(value ?? ''));
}

function loadingView(route) {
  return el('section', { class: 'mh-section mh-wrap' }, [
    el('p', {
      class: 'mh-eyebrow',
      text: route.name === 'product' ? 'Loading this product' : 'Loading the catalogue',
    }),
    el('div', { class: 'mh-grid', 'aria-hidden': 'true' }, [0, 1, 2].map(() =>
      el('div', { class: 'mh-skeleton-card' }, [
        el('div', { class: 'mh-skeleton mh-skeleton-card__media' }),
        el('div', { class: 'mh-skeleton mh-skeleton-card__line mh-skeleton-card__line--wide' }),
        el('div', { class: 'mh-skeleton mh-skeleton-card__line mh-skeleton-card__line--price' }),
      ]),
    )),
    el('p', { class: 'mh-visually-hidden', role: 'status', text: 'Loading, please wait.' }),
  ]);
}

function highlightNav(route) {
  const active =
    route.name === 'catalogue' && (route.params.category || route.query.get('c'))
      ? route.params.category || route.query.get('c')
      : route.name === 'catalogue'
        ? 'catalogue'
        : route.name === 'info'
          ? 'delivery'
          : '';
  for (const node of document.querySelectorAll('[data-nav]')) {
    if (active && active === node.dataset.nav) node.setAttribute('aria-current', 'page');
    else node.removeAttribute('aria-current');
  }
}

/**
 * Variant selection rewrites the WhatsApp link. Only options the owner
 * actually configured appear, and nothing is preselected, so no size or
 * colour is ever invented on the customer’s behalf.
 */
function updateOrderLink(product, variantLabels) {
  const anchor = main.querySelector('.mh-pdp__actions a.mh-btn--whatsapp');
  if (!anchor) return;
  const link = productEnquiry(product, {
    number: state.settings?.whatsapp_number,
    businessName: shopName(),
    priceLabel: formatNaira(product.price, { currency: product.currency || 'NGN' }),
    productUrl: productUrl(product),
    variantLabel: (variantLabels || []).join('; '),
    availabilityLabel: availabilityInfo(product).label,
  });
  if (link) anchor.setAttribute('href', link.url);
}

/* ------------------------------------------------------------- interactions -- */

let toastTimer = 0;
function showToast(message) {
  let toast = document.querySelector('.mh-toast');
  if (!toast) {
    toast = el('div', { class: 'mh-toast', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.dataset.visible = 'true';
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.dataset.visible = 'false';
  }, 2600);
}

async function copyToClipboard(value) {
  if (!value) return false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* clipboard API unavailable (insecure context / older Android WebView) */
  }
  try {
    const helper = el('textarea', { value, style: 'position:fixed;top:0;left:0;opacity:0' });
    document.body.appendChild(helper);
    helper.select();
    const ok = document.execCommand('copy');
    helper.remove();
    return ok;
  } catch {
    return false;
  }
}

function currentQuery() {
  return new URLSearchParams(String(window.location.hash || '').split('?')[1] || '');
}

function currentPath() {
  return String(window.location.hash || '').replace(/^#/, '').split('?')[0] || '/catalogue';
}

main.addEventListener('click', async (event) => {
  const chip = event.target.closest('[data-filter]');
  if (chip) {
    const value = chip.dataset.filter;
    const query = currentQuery();
    query.delete('q');
    const path = value ? `/catalogue/${value}` : '/catalogue';
    navigate(path);
    return;
  }

  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'reload' || action === 'retry') {
    await load({ quiet: action === 'reload' });
    if (action === 'reload') showToast('Catalogue refreshed');
    return;
  }
  if (action === 'copy-link') {
    const url = event.target.closest('[data-url]')?.dataset.url;
    showToast((await copyToClipboard(url)) ? 'Product link copied' : 'Copy failed — select the link above and copy it manually');
    return;
  }

  if (event.target.closest('.mh-search__clear')) {
    const input = document.getElementById('mh-search');
    if (input) {
      input.value = '';
      input.focus();
      applySearch('');
    }
  }
});

let searchTimer = 0;
main.addEventListener('input', (event) => {
  if (event.target.id !== 'mh-search') return;
  const value = event.target.value;
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => applySearch(value), 180);
});

function applySearch(value) {
  const clean = sanitizeSearch(value);
  const path = currentPath().startsWith('/catalogue') ? currentPath() : '/catalogue';
  const query = new URLSearchParams();
  if (clean) query.set('q', clean);
  navigate(`${path.replace(/\/$/, '')}${query.toString() ? `?${query}` : ''}`, { replace: true });
}

/* --------------------------------------------------------------------- start -- */

startRouter(() => render());
load();
