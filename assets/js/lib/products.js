/**
 * Shared presentation helpers for product display.
 * Used by the catalogue, the product page, featured strips and the owner
 * preview — so one record renders identically everywhere.
 */

import { el, icon, text } from './dom.js';
import { assetUrl } from './config.js';
import { formatNaira } from './money.js';

export const AVAILABILITY_LABELS = {
  unknown: 'Availability to be confirmed',
  in_stock: 'Available to order',
  low_stock: 'Low stock',
  out_of_stock: 'Out of stock',
  made_to_order: 'Made to order',
  discontinued: 'No longer stocked',
};

/**
 * Never invent a quantity. With no confirmed stock data the card states that
 * availability must be confirmed, which is also what the WhatsApp message says.
 */
export function availabilityInfo(product) {
  const key = product?.availability || 'unknown';
  const label = AVAILABILITY_LABELS[key] || AVAILABILITY_LABELS.unknown;
  const tone =
    key === 'in_stock' || key === 'made_to_order'
      ? 'ok'
      : key === 'low_stock'
        ? 'warn'
        : key === 'out_of_stock' || key === 'discontinued'
          ? 'danger'
          : 'neutral';
  return { key, label, tone };
}

export function priceTag(product, { size = 'sm', cls = '' } = {}) {
  const formatted = formatNaira(product?.price, { currency: product?.currency || 'NGN' });
  const classes = ['mh-price-tag', size === 'lg' ? 'mh-price-tag--lg' : '', cls].filter(Boolean).join(' ');
  if (!formatted) {
    return el('span', { class: `${classes} mh-badge--neutral`, text: 'Price on request' });
  }
  return el('span', { class: classes, 'aria-label': `Price: ${formatted}` }, [text(formatted)]);
}

/**
 * Product image with a graceful fallback. A single broken starter image must
 * never break the grid, so `onerror` swaps in the neutral brand placeholder
 * and marks it as such.
 */
export function productImage(product, { eager = false, cls = '' } = {}) {
  const wrap = el('div', { class: `mh-product-image ${cls}` });
  const fallbackSrc = assetUrl('assets/img/placeholder-product.svg');
  const src = resolveImageSrc(product?.image_url);

  if (!src) {
    wrap.appendChild(imageFallback());
    return wrap;
  }

  const img = el('img', {
    src,
    alt:
      product?.image_alt ||
      `Illustrative product image for ${product?.name || 'item'} — not a photograph of the actual item`,
    loading: eager ? 'eager' : 'lazy',
    decoding: 'async',
    width: '900',
    height: '900',
  });
  img.addEventListener('error', () => {
    img.src = fallbackSrc;
    img.dataset.fallback = 'true';
    wrap.querySelector('.mh-media-fallback') || wrap.appendChild(imageFallback());
  });
  wrap.appendChild(img);
  return wrap;
}

function resolveImageSrc(value) {
  // assetUrl passes absolute http(s)/data URLs through untouched and rebases a
  // repo-relative path such as `assets/img/placeholder-wig.svg`.
  return assetUrl(value);
}

export function imageFallback(message = 'Image unavailable — placeholder shown') {
  return el('div', { class: 'mh-media-fallback', role: 'presentation' }, [
    icon('image'),
    el('span', { text: message }),
  ]);
}

export function illustrativeNote(product) {
  if (!product?.image_is_illustrative) return null;
  const note =
    product.image_source_label ||
    'Illustrative starter image — not a photograph of Muna’s actual stock.';
  return el('p', { class: 'mh-illustrative-note' }, [icon('info'), el('span', { text: note })]);
}

export function statusFlags(product) {
  const flags = [];
  if (product.is_featured) flags.push(el('span', { class: 'mh-badge mh-badge--gold' }, [icon('sparkle'), text('Featured')]));
  if (product.is_new_arrival) flags.push(el('span', { class: 'mh-badge mh-badge--blush', text: 'New arrival' }));
  return flags;
}

/** Card used by the catalogue grid and the home page rails. */
export function productCard(product) {
  const availability = availabilityInfo(product);
  const href = `#/product/${encodeURIComponent(product.reference)}`;
  return el('article', { class: 'mh-product-card', 'data-reference': product.reference }, [
    el('a', {
      class: 'mh-product-card__hit',
      href,
      text: `View ${product.name}`,
      'aria-label': `View details for ${product.name}`,
    }),
    el('div', { class: 'mh-product-card__media' }, [
      productImage(product),
      statusFlags(product).length
        ? el('div', { class: 'mh-product-card__flags' }, statusFlags(product))
        : null,
      el('div', { class: 'mh-product-card__price' }, [priceTag(product)]),
    ]),
    el('div', { class: 'mh-product-card__body' }, [
      product.category_name ? el('p', { class: 'mh-product-card__cat', text: product.category_name }) : null,
      el('h3', { class: 'mh-product-card__title' }, [el('a', { href, text: product.name })]),
      el('p', { class: 'mh-ref', text: product.reference }),
      product.description ? el('p', { class: 'mh-product-card__desc', text: product.description }) : null,
      el('div', { class: 'mh-product-card__foot' }, [
        el('span', { class: `mh-badge mh-badge--${availability.tone}`, text: availability.label }),
        el('span', { class: 'mh-product-card__view' }, [text('View product'), icon('arrow')]),
      ]),
    ]),
  ]);
}

export function productGrid(products) {
  return el('div', { class: 'mh-grid', role: 'list' }, products.map((p) => el('div', { role: 'listitem' }, [productCard(p)])));
}
