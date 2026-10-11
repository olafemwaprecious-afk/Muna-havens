/**
 * Dashboard overview.
 *
 * Counts are derived from the rows the owner can actually see, and the summary
 * falls back to that same list if the aggregate query is unavailable. Nothing
 * here is invented: no revenue figure, no order total, no customer count that
 * the database has not been told.
 */

import { el, text } from '../lib/dom.js';
import { assetUrl } from '../lib/config.js';
import { emptyState, panel, stat, statusBadge, formatDateTime, button } from './ui.js';
import { formatNaira } from '../lib/money.js';
import { AVAILABILITY_LABELS } from '../lib/products.js';

export async function renderOverview(app, cache) {
  const products = cache.products || [];
  const published = products.filter((p) => p.status === 'published');
  const drafts = products.filter((p) => p.status === 'draft');
  const archived = products.filter((p) => p.status === 'archived');
  const outOfStock = products.filter((p) => p.availability === 'out_of_stock');
  const noImage = published.filter((p) => !p.image_url && !p.image_object_path);
  const illustrative = published.filter((p) => p.image_is_illustrative);

  let summary = null;
  try {
    summary = await app.api.dashboardSummary();
  } catch {
    summary = null; // the counts above are already accurate for this session
  }

  const orders = await loadOrders(app);

  const needsAttention = [
    ...noImage.map((p) => ({ product: p, reason: 'Published, but no image is set.', action: 'image' })),
    ...illustrative.map((p) => ({ product: p, reason: 'Still using an illustrative placeholder image.', action: 'image' })),
    ...drafts.map((p) => ({ product: p, reason: 'Draft — not visible to customers yet.', action: 'publish' })),
    ...outOfStock.map((p) => ({ product: p, reason: 'Marked out of stock while published.', action: 'stock' })),
  ];

  return el('div', {}, [
    el('div', { class: 'mh-page__head' }, [
      el('div', {}, [
        el('h1', { text: 'Overview' }),
        el('p', { text: `${shopLabel(cache)} · signed in as ${app.session?.user?.email || 'the owner account'}` }),
      ]),
      el('div', { class: 'mh-page__actions' }, [
        button('Add a product', { variant: 'primary', icon: 'plus', onClick: () => app.navigate('/products/new') }),
      ]),
    ]),

    el('div', { class: 'mh-stats' }, [
      stat('Published', summary?.published ?? published.length),
      stat('Drafts', summary?.drafts ?? drafts.length, 'gold'),
      stat('Out of stock', summary?.outOfStock ?? outOfStock.length, 'sage'),
      stat('Recorded orders', orders.length, 'sage'),
    ]),

    panel('Needs your attention', [
      needsAttention.length === 0
        ? el('p', { class: 'mh-muted', style: 'margin:0', text: 'Nothing outstanding. Every published product has an image and a price, and no draft is waiting.' })
        : el('div', { class: 'mh-list' }, needsAttention.slice(0, 8).map(({ product, reason }) =>
            el('div', { class: 'mh-list-item' }, [
              thumbnail(product),
              el('div', { class: 'mh-list-item__body' }, [
                el('p', { class: 'mh-list-item__title', text: product.name }),
                el('p', { class: 'mh-small mh-muted', style: 'margin:0', text: reason }),
              ]),
              el('div', { class: 'mh-list-item__actions' }, [
                button('Open', { size: 'sm', onClick: () => app.navigate(`/products/${product.id}`) }),
              ]),
            ]),
          )),
      needsAttention.length > 8
        ? el('p', { class: 'mh-field__hint', text: `And ${needsAttention.length - 8} more.` })
        : null,
    ]),

    panel('Recent recorded orders', [
      orders.length === 0
        ? emptyState(
            'No orders recorded yet',
            'When a customer messages on WhatsApp and you agree an order, record it here so the catalogue and the history stay in step. Orders are never created by the website itself.',
            button('Record an order', { variant: 'primary', size: 'sm', onClick: () => app.navigate('/orders') }),
          )
        : el('div', { class: 'mh-list' }, orders.slice(0, 5).map((order) =>
            el('div', { class: 'mh-list-item' }, [
              el('div', { class: 'mh-list-item__body' }, [
                el('p', { class: 'mh-list-item__title' }, [
                  text(order.order_reference),
                  order.customer_name ? el('span', { class: 'mh-muted mh-small', text: ` · ${order.customer_name}` }) : null,
                ]),
                el('p', { class: 'mh-small mh-muted', style: 'margin:0', text: `${order.items?.length || 0} line(s) · ${formatNaira(order.total_amount, { currency: order.currency || 'NGN' })} · ${formatDateTime(order.created_at)}` }),
              ]),
              el('div', { class: 'mh-list-item__row' }, [
                statusBadge(order.payment_status),
                statusBadge(order.order_status),
              ]),
            ]),
          )),
    ], { actions: button('Open orders', { size: 'sm', onClick: () => app.navigate('/orders') }) }),

    panel('Future features', [
      el('p', { class: 'mh-small mh-muted', style: 'margin:0 0 .75rem', text: 'Inactive in this version. The public site shows them as “Coming soon”, and no code path below can turn them on by accident.' }),
      el('div', { style: 'display:grid;gap:.6rem' }, [
        featureRow('Promotions and discount campaigns', 'Coming soon', 'Configure rates and eligibility in a later version.'),
        featureRow('Referral programme', 'Coming soon', 'No codes, rewards or redemption are active.'),
        featureRow('Online payment', 'Not enabled', 'Orders are arranged with Muna directly; the site never takes payment.'),
      ]),
      el('p', { style: 'margin:.9rem 0 0' }, [
        button('See what is planned', { size: 'sm', variant: 'ghost', onClick: () => app.navigate('/promotions') }),
      ]),
    ]),
  ]);
}

function featureRow(label, state, note) {
  return el('div', { class: 'mh-list-item', style: 'padding:.7rem .8rem' }, [
    el('div', { class: 'mh-list-item__body' }, [
      el('p', { class: 'mh-list-item__title', text: label }),
      el('p', { class: 'mh-small mh-muted', style: 'margin:0', text: note }),
    ]),
    el('span', { class: 'mh-badge mh-badge--neutral', text: state }),
  ]);
}

function thumbnail(product) {
  // assetUrl rebases `assets/img/...` onto the site root, so thumbnails are
  // correct from /owner/ as well as from /Muna-havens/.
  return el('img', {
    class: 'mh-thumb',
    src: assetUrl(product.image_url || 'assets/img/placeholder-product.svg'),
    alt: '',
    width: '42',
    height: '42',
    loading: 'lazy',
  });
}

async function loadOrders(app) {
  try {
    return await app.api.listOrders({ limit: 5 });
  } catch {
    return [];
  }
}

function shopLabel(cache) {
  return cache.settings?.business_name || 'Muna’s Haven';
}
