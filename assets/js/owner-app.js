/**
 * Owner dashboard shell: session, guard, router.
 *
 * The route guard below exists for usability — it stops the owner staring at an
 * empty panel. It is NOT the security boundary. Every query this app makes is
 * authorised again by Row Level Security in PostgreSQL, so a request written by
 * hand and aimed straight at the API receives the same refusal. "Hide the
 * button" is never treated as protection anywhere in this project.
 */

import { loadConfig, siteRoot, assetUrl } from './lib/config.js';
import { createDataLayer, DataError } from './lib/api.js';
import { clear, el, icon, text } from './lib/dom.js';
import { renderLogin, renderWorking } from './owner/login.js';
import { renderOverview } from './owner/overview.js';
import { renderProducts, renderProductEditor } from './owner/products.js';
import { renderOrders } from './owner/orders.js';
import { renderSettings } from './owner/settings.js';
import { renderPromotions } from './owner/promotions.js';
import { button, toast } from './owner/ui.js';

const root = document.getElementById('mh-owner-root');
const config = loadConfig();

const NAV = [
  { path: '/', label: 'Overview', icon: 'box' },
  { path: '/products', label: 'Products', icon: 'tag' },
  { path: '/orders', label: 'Orders', icon: 'clock' },
  { path: '/settings', label: 'Store settings', icon: 'edit' },
  { path: '/promotions', label: 'Promotions', icon: 'sparkle' },
];

const PREVIEW_FLAG = 'muna-haven-local-preview';

const app = {
  api: null,
  config,
  session: null,
  status: 'checking', // checking | signed-out | signed-in | error
  cache: { products: [], categories: [], settings: null },
  error: null,
  preview: false,
};

try {
  app.api = createDataLayer();
} catch (error) {
  app.status = 'error';
  app.error = error;
}

/**
 * A local-only layout preview, so the design can be reviewed before any
 * database exists. Gated on loopback *and* unconfigured mode: on GitHub Pages
 * this is false, and no preview data reaches a real visitor.
 */
function previewAllowed() {
  if (app.api?.mode !== 'demo') return false;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '0.0.0.0';
}

/* ------------------------------------------------------------------- auth -- */

function parsePath() {
  const raw = String(window.location.hash || '').replace(/^#/, '');
  const [path] = raw.split('?');
  return path.startsWith('/') ? path : `/${path}`;
}

app.navigate = (path) => {
  window.location.hash = path;
};

/**
 * Supabase completes a password-recovery or email-verification link by
 * returning to this page with tokens in the URL. The client consumes them; we
 * only need to recognise that state so the shell waits instead of bouncing to
 * the login screen mid-redirect.
 */
function isAuthCallback() {
  const probe = `${window.location.search || ''}${window.location.hash || ''}`;
  return /(access_token|refresh_token|code=|type=recovery|type=verify)/.test(probe);
}

async function refreshSession() {
  if (!app.api || app.api.mode !== 'supabase') {
    app.session = null;
    app.status = 'signed-out';
    return;
  }
  try {
    const session = await app.api.authSession();
    app.session = session;
    app.status = session ? 'signed-in' : 'signed-out';
  } catch (error) {
    // An unreadable session is treated as signed out. Never assume access.
    app.session = null;
    app.status = 'signed-out';
    app.error = error;
  }
}

function attachAuthListener() {
  const auth = app.api?.client?.auth;
  if (!auth || typeof auth.onAuthStateChange !== 'function') return;
  auth.onAuthStateChange((event, session) => {
    app.session = session;
    const signedIn = Boolean(session);
    if (signedIn === Boolean(app.session) && app.status !== 'error') {
      app.status = signedIn ? 'signed-in' : app.status;
    } else {
      app.status = signedIn ? 'signed-in' : 'signed-out';
    }
    if (event === 'SIGNED_OUT') toast('You have been signed out.');
    if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') return; // silent
    render();
  });
}

async function signOut() {
  try {
    await app.api.signOut();
  } catch {
    toast('Sign-out could not be confirmed. Close this tab as well, to be sure.');
  }
  app.session = null;
  app.status = 'signed-out';
  app.navigate('/login');
  render();
}

/* ------------------------------------------------------------- data cache -- */

async function requireData() {
  if (app.api.mode === 'demo') {
    const [products, categories, settings] = await Promise.all([
      app.api.listPublicProducts(),
      app.api.listCategories(),
      app.api.getStoreSettings(),
    ]);
    app.cache = { products, categories, settings };
    return;
  }
  const [products, categories, settings] = await Promise.all([
    app.api.listOwnerProducts({ includeArchived: true }),
    app.api.listAllCategories(),
    // The owner projection, not the public one: the form edits contact_email and
    // instagram_handle, which the public settings view deliberately omits.
    app.api.getOwnerStoreSettings ? app.api.getOwnerStoreSettings() : app.api.getStoreSettings(),
  ]);
  app.cache = { products, categories, settings };
}

/** Called by every view after a write, so the list on screen stays truthful. */
app.reload = async () => {
  try {
    await requireData();
  } catch (error) {
    if (error instanceof DataError && error.kind === 'auth') {
      app.session = null;
      app.status = 'signed-out';
      toast('Your session no longer has permission, so you have been signed out.');
      render();
      return;
    }
    toast(error?.message || 'Could not refresh the dashboard data.');
  }
  render();
};

/* ---------------------------------------------------------------- render -- */

let rendering = false;

async function render() {
  if (rendering) return;
  rendering = true;
  try {
    await renderInner();
  } finally {
    rendering = false;
  }
}

async function renderInner() {
  const path = parsePath();
  clear(root);

  if (app.status === 'checking') {
    root.appendChild(renderWorking('Checking your session…'));
    return;
  }

  if (app.status === 'error') {
    root.appendChild(
      el('div', { class: 'mh-login' }, [
        el('div', { class: 'mh-login__card' }, [
          el('h1', { text: 'The dashboard cannot start' }),
          el('p', { class: 'mh-notice mh-notice--error', role: 'alert', text: describeError(app.error) }),
          el('p', { class: 'mh-field__hint', text: 'This usually means assets/js/config.js was generated with a wrong project URL, or the database tables have not been created yet. Re-run npm run build after editing .env.' }),
        ]),
      ]),
    );
    return;
  }

  const signedIn = app.status === 'signed-in';
  const previewing = app.preview && previewAllowed();

  if (!signedIn && !previewing) {
    if (path !== '/login' && path !== '/login/recover') {
      app.navigate('/login');
      return;
    }
    const login = renderLogin(app, { mode: path.endsWith('/recover') ? 'recover' : 'signin' });
    if (previewAllowed()) {
      login.querySelector('.mh-login__card').appendChild(
        el('div', { style: 'margin-top:1rem;padding-top:1rem;border-top:var(--mh-border)' }, [
          el('p', { class: 'mh-field__hint', style: 'margin-bottom:.5rem', text: 'This computer is running the site locally with no store connected, so the layout can be reviewed.' }),
          button('Preview the dashboard layout (local only)', {
            variant: 'ghost',
            onClick: () => {
              app.preview = true;
              render();
            },
          }),
        ]),
      );
    }
    root.appendChild(login);
    return;
  }

  if (path === '/login' || path === '/login/recover') {
    app.navigate('/');
    return;
  }

  try {
    await requireData();
  } catch (error) {
    if (error instanceof DataError && error.kind === 'auth') {
      app.session = null;
      app.status = 'signed-out';
      toast('Your session no longer has permission, so you have been signed out.');
      render();
      return;
    }
    root.appendChild(shell(path, errorState(error)));
    return;
  }

  let content;
  try {
    content = await viewFor(path, app);
  } catch (error) {
    content = errorState(error);
  }
  root.appendChild(shell(path, content));
}

export async function viewFor(path, context) {
  const productEdit = path.match(/^\/products\/([^/]+)$/);
  if (path === '/' || path === '') return renderOverview(context, context.cache);
  if (path === '/products') return renderProducts(context, context.cache);
  if (path === '/products/new') return renderProductEditor(context, null);
  if (productEdit) return renderProductEditor(context, decodeURIComponent(productEdit[1]));
  if (path === '/orders') return renderOrders(context);
  if (path === '/settings') return renderSettings(context, context.cache);
  if (path === '/promotions') return renderPromotions(context, context.cache);
  return el('div', { class: 'mh-panel' }, [
    el('h2', { text: 'No such dashboard page' }),
    el('p', { text: `Nothing is at “${path}”. Use the menu to the left.` }),
  ]);
}

function describeError(error) {
  if (error instanceof DataError) return error.message;
  return error?.message || 'Unknown error.';
}

function errorState(error) {
  return el('div', { class: 'mh-panel' }, [
    el('h2', { text: 'This could not be loaded' }),
    el('p', { text: describeError(error) }),
    el('p', { class: 'mh-field__hint', text: 'If the message mentions Row Level Security or missing tables, the migrations in db/migrations have not all been run yet.' }),
    el('button', { class: 'mh-btn mh-btn--sm', type: 'button', text: 'Try again', onClick: () => render() }),
  ]);
}

function shell(activePath, content) {
  const navItems = NAV.map((item) => {
    const current = item.path === '/' ? activePath === '/' : activePath.startsWith(item.path);
    return el('a', { href: `#${item.path}`, 'aria-current': current ? 'page' : null }, [
      icon(item.icon),
      text(item.label),
    ]);
  });

  const email = app.session?.user?.email || 'local preview — no account';

  return el('div', { class: 'mh-shell' }, [
    el('aside', { class: 'mh-side' }, [
      el('a', { class: 'mh-side__brand', href: siteRoot(), 'aria-label': 'Open the public storefront in this tab' }, [
        el('img', { src: assetUrl('assets/img/mark.svg'), alt: '', width: '32', height: '32' }),
        el('span', {}, [
          el('strong', { text: app.cache.settings?.business_name || 'Muna’s Haven' }),
          el('span', { text: 'Owner dashboard' }),
        ]),
      ]),
      el('nav', { 'aria-label': 'Dashboard sections' }, navItems),
      el('div', { class: 'mh-side__foot' }, [
        el('p', { class: 'mh-small', style: 'margin:0 0 .5rem;overflow-wrap:anywhere', text: email }),
        el('button', { class: 'mh-side__signout', type: 'button', onClick: signOut }, [icon('logout'), text('Sign out')]),
      ]),
    ]),
    el('main', { class: 'mh-main', id: 'mh-owner-main', tabindex: '-1' }, [
      app.preview && previewAllowed()
        ? el('p', { class: 'mh-notice-strip' }, [
            icon('alert'),
            el('span', { text: 'Local layout preview — no store is connected. Nothing typed here can be saved, and no visitor sees this. Sign-in and saving both require the Supabase connection described in docs/SETUP.md.' }),
          ])
        : null,
      content,
    ]),
  ]);
}

/* ------------------------------------------------------------------- boot -- */

window.addEventListener('hashchange', () => render());
window.addEventListener('mh:reload', () => app.reload());

(async function boot() {
  if (app.api && app.api.mode === 'supabase') {
    attachAuthListener();
    if (isAuthCallback()) {
      // Let the vendored client consume the tokens, then settle on the shell.
      await new Promise((resolve) => window.setTimeout(resolve, 600));
      if (window.history?.replaceState) {
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/`);
      }
    }
    await refreshSession();
    if (app.status === 'signed-out' && isAuthCallback()) await refreshSession();
    render();
  } else {
    app.status = 'signed-out';
    render();
  }
})();
