/**
 * Storefront page renderers.
 *
 * Each returns a DOM node. All database values go through `el({text})`, which
 * uses `textContent`, so a product name or description containing markup is
 * displayed literally and can never execute.
 */

import { el, icon, text } from '../lib/dom.js';
import { siteOrigin } from '../lib/config.js';
import { priceTag, productGrid, productImage, illustrativeNote, availabilityInfo, statusFlags } from '../lib/products.js';
import { formatNaira } from '../lib/money.js';
import { productEnquiry, buildGeneralEnquiryLink } from '../lib/whatsapp.js';

/* -------------------------------------------------------------------- home -- */

export function renderHome(ctx) {
  const { products, categories, settings } = ctx;
  const featured = products.filter((p) => p.is_featured).slice(0, 3);
  const arrivals = products.filter((p) => p.is_new_arrival).slice(0, 3);
  const rails = featured.length ? featured : products.slice(0, 3);

  return el('div', {}, [
    heroSection(ctx),

    section(
      'The catalogue',
      featured.length ? 'Featured pieces' : 'Currently listed',
      featured.length
        ? 'Pieces Muna has chosen to show first. Every price is the current price in the store record.'
        : 'Products that are published right now. More will appear as Muna adds them.',
      [
        rails.length
          ? productGrid(rails)
          : emptyState(
              'The catalogue is being prepared',
              'No products are published yet. New pieces will appear here as soon as they are added.',
            ),
        rails.length
          ? el('p', { style: 'margin-top:1.5rem' }, [
              el('a', { class: 'mh-section__link', href: '#/catalogue', style: 'display:inline-flex' }, [
                text('See the full catalogue'),
                icon('arrow'),
              ]),
            ])
          : null,
      ],
    ),

    arrivals.length
      ? section('Just added', 'New arrivals', 'Recently listed pieces, in the order Muna published them.', [
          productGrid(arrivals),
        ])
      : null,

    section('Browse by category', 'Categories', 'Jump straight to the kind of piece you are after.', [
      categories.length
        ? el(
            'div',
            { class: 'mh-cats' },
            categories.map((cat) =>
              el('a', { class: 'mh-cat-tile', href: `#/catalogue/${cat.slug}` }, [
                el('span', {}, [
                  el('strong', { text: cat.name }),
                  el('span', {
                    text: `${ctx.products.filter((p) => p.category_slug === cat.slug).length} listed`,
                  }),
                ]),
                icon('arrow'),
              ]),
            ),
          )
        : el('p', { class: 'mh-muted', text: 'Categories will appear once Muna sets them up.' }),
    ]),

    promisesSection(settings),
  ]);
}

function heroSection(ctx) {
  const waLink = buildGeneralEnquiryLink(ctx.settings?.whatsapp_number, ctx.settings?.business_name);
  return el('section', { class: 'mh-hero' }, [
    el('div', { class: 'mh-wrap mh-hero__grid' }, [
      el('div', {}, [
        el('p', { class: 'mh-eyebrow', text: 'Fashion & Beauty · Lagos' }),
        el('h1', {}, [text('Everyday '), el('em', { text: 'elegance' }), text(', and shine for the occasions.')]),
        el('p', { class: 'mh-lede', text: ctx.settings?.public_description || DEFAULT_INTRO }),
        el('div', { class: 'mh-hero__actions' }, [
          el('a', { class: 'mh-btn mh-btn--primary', href: '#/catalogue' }, [
            text('Browse products'),
            icon('arrow'),
          ]),
          waLink
            ? el('a', { class: 'mh-btn', href: waLink.url, target: '_blank', rel: 'noopener' }, [
                icon('whatsapp'),
                text('Message Muna'),
              ])
            : el('span', { class: 'mh-btn', 'aria-disabled': 'true', text: 'WhatsApp number not set' }),
        ]),
        el('ul', { class: 'mh-hero__meta' }, [
          metaItem('Order on WhatsApp'),
          metaItem('Prices in naira'),
          metaItem('Delivery: coming soon'),
        ]),
      ]),
      el('div', { class: 'mh-hero__art' }, [
        el('img', {
          src: 'assets/img/hero-atelier.svg',
          alt: 'Illustrative brand artwork in blush, ivory and champagne: a full bob wig on a stand beside a jewellery set.',
          width: '900',
          height: '1080',
          loading: 'eager',
          fetchpriority: 'high',
        }),
        el('p', { class: 'mh-hero__art-caption', text: 'Brand artwork — product photographs are added by Muna' }),
      ]),
    ]),
  ]);
}

const DEFAULT_INTRO =
  'Muna’s Haven is a small, considered edit of hair and jewellery. Browse the catalogue, then message Muna directly on WhatsApp to confirm availability and order.';

function metaItem(label) {
  return el('li', {}, [el('span', { class: 'mh-hero__dot', 'aria-hidden': 'true' }), text(label)]);
}

function section(eyebrow, heading, lede, children) {
  return el('section', { class: 'mh-section mh-wrap', 'aria-labelledby': `h-${slugify(heading)}` }, [
    el('header', { class: 'mh-section__head' }, [
      el('div', {}, [
        el('p', { class: 'mh-eyebrow', text: eyebrow }),
        el('h2', { id: `h-${slugify(heading)}`, text: heading }),
        lede ? el('p', { text: lede }) : null,
      ]),
    ]),
    ...children,
  ]);
}

function promisesSection(settings) {
  return el('section', { class: 'mh-section mh-wrap' }, [
    el('div', { style: 'display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(min(100%,17rem),1fr))' }, [
      el('div', { class: 'mh-coming-soon' }, [
        icon('truck', 'mh-coming-soon__icon'),
        el('div', {}, [
          el('h3', { text: 'Delivery' }),
          el('p', { text: settings?.delivery_notice || 'Delivery: Coming soon.' }),
        ]),
      ]),
      el('div', { class: 'mh-coming-soon' }, [
        icon('sparkle', 'mh-coming-soon__icon'),
        el('div', {}, [
          el('h3', { text: 'Referral programme' }),
          el('p', { text: settings?.referral_notice || 'Referral programme: Coming soon.' }),
        ]),
      ]),
    ]),
  ]);
}

/* --------------------------------------------------------------- catalogue -- */

export function renderCatalogue(ctx, { category = '', search = '' } = {}) {
  const { categories, products } = ctx;
  const active = category || '';
  const needle = search.trim().toLowerCase();

  let rows = products;
  if (active) rows = rows.filter((p) => p.category_slug === active);
  if (needle) {
    rows = rows.filter((p) =>
      [p.name, p.reference, p.description, p.category_name]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle)),
    );
  }

  const activeName = categories.find((c) => c.slug === active)?.name;

  return el('div', {}, [
    el('section', { class: 'mh-section mh-wrap', style: 'padding-top:2rem' }, [
      el('header', { class: 'mh-section__head' }, [
        el('div', {}, [
          el('p', { class: 'mh-eyebrow', text: 'Muna’s Haven' }),
          el('h1', { text: activeName || (needle ? 'Search results' : 'The catalogue') }),
          el('p', {
            text: needle
              ? `Matching “${search.trim()}”.`
              : 'Only published products are shown. Prices are the current listed prices in naira.',
          }),
        ]),
      ]),

      toolbar(ctx, { category: active, search }),

      rows.length
        ? productGrid(rows)
        : emptyState(
            needle || active
              ? 'Nothing matches that yet'
              : 'The catalogue is being prepared',
            needle
              ? 'Try a shorter word, or the product reference such as MH-JEW-001.'
              : active
                ? 'No published products are listed in this category right now.'
                : 'No products are published yet. They will appear here as soon as Muna adds them.',
            el('a', { class: 'mh-btn mh-btn--sm', href: '#/catalogue', text: 'Show all products' }),
          ),
    ]),
  ]);
}

function toolbar(ctx, { category, search }) {
  const chips = [
    el('button', {
      class: 'mh-chip',
      type: 'button',
      'data-filter': '',
      'aria-pressed': String(!category),
      text: 'All',
    }),
    ...ctx.categories.map((cat) =>
      el('button', {
        class: 'mh-chip',
        type: 'button',
        'data-filter': cat.slug,
        'aria-pressed': String(category === cat.slug),
        text: cat.name,
      }),
    ),
  ];

  const input = el('input', {
    type: 'search',
    id: 'mh-search',
    name: 'q',
    placeholder: 'Search by name or reference…',
    autocomplete: 'off',
    value: search,
    'aria-describedby': 'mh-search-help',
  });

  return el('div', { class: 'mh-toolbar' }, [
    el('div', { class: 'mh-search' }, [
      icon('search'),
      input,
      el('button', {
        class: 'mh-search__clear',
        type: 'button',
        'aria-label': 'Clear search',
        text: '×',
        hidden: !search,
      }),
    ]),
    el('div', { class: 'mh-filters', role: 'group', 'aria-label': 'Filter by category' }, chips),
    el('p', { id: 'mh-search-help', class: 'mh-visually-hidden', text: 'Filters the catalogue as you type.' }),
  ]);
}

/* ----------------------------------------------------------------- product -- */

export function renderProduct(ctx, product) {
  const settings = ctx.settings || {};
  const availability = availabilityInfo(product);
  const priceLabel = formatNaira(product.price, { currency: product.currency || 'NGN' });
  const canonicalUrl = productUrl(product);
  const orderable = product.availability !== 'out_of_stock' && product.availability !== 'discontinued';

  if (product.availability === 'discontinued') {
    return el('div', {}, [breadcrumbs(product), unavailableProductState(product)]);
  }

  const wa = productEnquiry(product, {
    number: settings.whatsapp_number,
    businessName: settings.business_name,
    priceLabel,
    productUrl: canonicalUrl,
    availabilityLabel: orderable ? availability.label : 'Not currently available',
  });

  return el('article', { class: 'mh-wrap', style: 'padding-bottom:3rem' }, [
    breadcrumbs(product),
    el('div', { class: 'mh-pdp', style: 'margin-top:1.25rem' }, [
      el('div', { class: 'mh-pdp__media' }, [
        productImage(product, { eager: true }),
        statusFlags(product).length
          ? el('div', { class: 'mh-product-card__flags' }, statusFlags(product))
          : null,
      ]),

      el('div', { class: 'mh-pdp__body' }, [
        product.category_name
          ? el('a', {
              class: 'mh-eyebrow',
              style: 'text-decoration:none',
              href: `#/catalogue/${product.category_slug}`,
              text: product.category_name,
            })
          : null,
        el('h1', { class: 'mh-pdp__title', text: product.name }),
        el('p', { class: 'mh-ref', text: `Reference ${product.reference}` }),

        el('div', { class: 'mh-pdp__pricerow' }, [
          priceTag(product, { size: 'lg', cls: 'mh-pdp__price' }),
          el('span', { class: `mh-badge mh-badge--${availability.tone}`, text: availability.label }),
        ]),

        product.description
          ? el(
              'div',
              { class: 'mh-pdp__desc' },
              String(product.description)
                .split(/\n{1,}/)
                .filter((p) => p.trim())
                .map((p) => el('p', { text: p.trim() })),
            )
          : null,

        product.image_is_illustrative ? illustrativeNote(product) : null,

        variantsBlock(product, ctx),

        el('div', { class: 'mh-facts' }, [
          fact('Product reference', product.reference),
          fact('Listed price', priceLabel || 'Price on request'),
          fact('Category', product.category_name || '—'),
          fact('Availability', availability.label),
          fact('Delivery', settings.delivery_notice || 'Delivery: Coming soon.'),
          // The referral wording belongs on the product page rather than only in
          // the footer, because this is where a customer decides whether to ask
          // about a friend. It stays a plain sentence: no code, no reward.
          fact('Referral programme', settings.referral_notice || 'Referral programme: Coming soon.'),
        ]),

        el('div', { class: 'mh-pdp__actions' }, [
          orderable
            ? wa
              ? el('a', { class: 'mh-btn mh-btn--whatsapp', href: wa.url, target: '_blank', rel: 'noopener' }, [
                  icon('whatsapp'),
                  text('Order on WhatsApp'),
                ])
              : disabledOrderButton('WhatsApp contact is not set up yet — please ask Muna directly.')
            : disabledOrderButton('Muna has marked this piece as out of stock, so it cannot be ordered from the site yet. Ask her on WhatsApp if you would like to be told when it returns.'),
          el('a', { class: 'mh-btn mh-btn--ghost', href: '#/catalogue' }, [icon('arrowLeft'), text('Back to catalogue')]),
          el('button', {
            class: 'mh-btn mh-btn--ghost',
            type: 'button',
            'data-action': 'copy-link',
            'data-url': canonicalUrl,
          }, [icon('share'), text('Copy product link')]),
          el('p', { class: 'mh-enquiry-note' }, [
            icon('info'),
            el('span', {
              text: wa
                ? 'Opening WhatsApp only sends an enquiry. It does not confirm a reservation or a payment — Muna replies with availability and next steps.'
                : 'No WhatsApp number is configured, so the order button is disabled. Ask Muna directly for now.',
            }),
          ]),
        ]),

        el('div', { class: 'mh-panel' }, [
          el('h3', { text: 'Share this piece' }),
          el('p', { class: 'mh-small mh-muted', style: 'margin:0 0 .6rem' }, [
            text('This link opens this exact product on any device:'),
          ]),
          el('p', {
            class: 'mh-ref',
            style: 'word-break:break-all;margin:0',
            text: canonicalUrl,
          }),
        ]),
      ]),
    ]),
  ]);
}

function variantsBlock(product, ctx) {
  const variants = (product.variants || []).filter((v) => v.is_enabled !== false);
  if (!variants.length) return null;
  const groups = new Map();
  for (const variant of variants) {
    const key = variant.option_type || 'Option';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(variant);
  }
  return el('div', { class: 'mh-panel' }, [
    el('h3', { text: 'Available options' }),
    el('p', { class: 'mh-small mh-muted', style: 'margin:0 0 .75rem', text: 'Only options confirmed by the owner are listed. Choosing one adds it to your WhatsApp message — nothing is selected for you.' }),
    ...[...groups.entries()].map(([optionType, items], groupIndex) =>
      el('fieldset', { style: 'border:0;padding:0;margin:0 0 .75rem' }, [
        el('legend', { class: 'mh-small', style: 'font-weight:600;margin-bottom:.4rem', text: optionType }),
        el('div', { class: 'mh-variants' }, items.map((variant, index) => {
          const id = `v-${groupIndex}-${index}`;
          const label = `${optionType}: ${variant.option_value}`;
          const input = el('input', {
            type: 'radio',
            id,
            name: `variant-${groupIndex}`,
            value: label,
            'data-variant-label': label,
          });
          if (ctx && typeof ctx.onVariantChange === 'function') {
            input.addEventListener('change', () => {
              const chosen = [...document.querySelectorAll('.mh-variant input:checked')]
                .map((node) => node.dataset.variantLabel)
                .filter(Boolean);
              ctx.onVariantChange(product, chosen);
            });
          }
          return el('div', { class: 'mh-variant' }, [input, el('label', { for: id, text: variant.option_value })]);
        })),
      ]),
    ),
  ]);
}

function fact(label, value) {
  return el('div', {}, [el('span', { class: 'mh-facts__label', text: label }), el('span', { class: 'mh-facts__value', text: value })]);
}

/**
 * Rendered instead of the order button when a product is published but not
 * orderable, or when no WhatsApp number exists. A real disabled button plus a
 * plain-language reason, so the customer is never invited to "order" nothing.
 */
function disabledOrderButton(reason) {
  return el('div', { style: 'display:grid;gap:.4rem' }, [
    el('button', {
      class: 'mh-btn mh-btn--whatsapp',
      type: 'button',
      disabled: true,
      'aria-describedby': 'mh-order-blocked-reason',
      text: 'Ordering is not available for this piece',
    }),
    el('p', { id: 'mh-order-blocked-reason', class: 'mh-enquiry-note', text: reason }),
  ]);
}

function breadcrumbs(product) {
  const items = [el('li', {}, [el('a', { href: '#/catalogue', text: 'Catalogue' })])];
  if (product.category_slug) {
    items.push(el('li', {}, [el('a', { href: `#/catalogue/${product.category_slug}`, text: product.category_name })]));
  }
  items.push(el('li', { 'aria-current': 'page', text: product.name }));
  return el('nav', { 'aria-label': 'Breadcrumb' }, [el('ol', { class: 'mh-breadcrumbs' }, items)]);
}

export function productUrl(product) {
  // Absolute link (site origin + hash route) so the message a customer sends
  // works from any device, and the hash survives the lack of Pages rewrites.
  return `${siteOrigin()}/#/product/${encodeURIComponent(product.reference)}`;
}

/* -------------------------------------------------------------------- info -- */

export function renderInfo(ctx, sectionKey) {
  const settings = ctx.settings || {};
  const content = {
    delivery: {
      title: 'Delivery',
      body: [settings.delivery_notice || 'Delivery: Coming soon.'],
      note: 'Muna has not published delivery fees, zones or timelines yet. When she does, they appear here without any change to the website code.',
    },
    referrals: {
      title: 'Referral programme',
      body: [settings.referral_notice || 'Referral programme: Coming soon.'],
      note: 'No referral codes, rewards or discounts are active. Nothing on the site currently issues or tracks them.',
    },
    ordering: {
      title: 'How ordering works',
      body: [
        'Open any product, check the price and availability, then tap “Order on WhatsApp”. Your message arrives with the product name, reference, listed price and a link to this page already written.',
        'Muna replies to confirm availability and the next step. Payment is arranged with her directly — the website never takes payment and never marks anything as paid.',
      ],
    },
  };
  const chosen = content[sectionKey] || content.delivery;
  return el('section', { class: 'mh-section mh-wrap', style: 'max-width:var(--mh-maxw-prose)' }, [
    el('p', { class: 'mh-eyebrow', text: 'Good to know' }),
    el('h1', { text: chosen.title }),
    ...chosen.body.map((line) => el('p', { class: 'mh-pdp__desc', style: 'font-size:var(--mh-text-base)', text: line })),
    chosen.note ? el('p', { class: 'mh-illustrative-note', style: 'display:inline-flex' }, [icon('info'), el('span', { text: chosen.note })]) : null,
    el('p', { style: 'margin-top:1.5rem' }, [el('a', { class: 'mh-btn mh-btn--primary', href: '#/catalogue', text: 'Browse the catalogue' })]),
  ]);
}

/* ------------------------------------------------------------- shared bits -- */

export function emptyState(title, body, action) {
  return el('div', { class: 'mh-state' }, [
    el('div', { class: 'mh-state__icon' }, [icon('box')]),
    el('h2', { text: title }),
    el('p', { text: body }),
    action || null,
  ]);
}

export function errorState(title, body, retryLabel = 'Try again') {
  return el('div', { class: 'mh-state' }, [
    el('div', { class: 'mh-state__icon', style: 'background:var(--mh-danger-bg);color:var(--mh-danger)' }, [icon('alert')]),
    el('h2', { text: title }),
    el('p', { text: body }),
    el('button', { class: 'mh-btn mh-btn--sm', type: 'button', 'data-action': 'retry', text: retryLabel }),
  ]);
}

export function notFoundState(path) {
  return el('div', { class: 'mh-state' }, [
    el('div', { class: 'mh-state__icon' }, [icon('search')]),
    el('h2', { text: 'We could not find that page' }),
    el('p', {
      text: path
        ? `Nothing is published at “${path}”. The product may have been unpublished, archived, or the reference may be mistyped.`
        : 'Nothing is published at that address.',
    }),
    el('div', { style: 'display:flex;gap:.6rem;flex-wrap:wrap;justify-content:center' }, [
      el('a', { class: 'mh-btn mh-btn--primary mh-btn--sm', href: '#/catalogue', text: 'Browse all products' }),
      el('a', { class: 'mh-btn mh-btn--sm', href: '#/', text: 'Back to home' }),
    ]),
  ]);
}

export function unavailableProductState(product) {
  return el('div', { class: 'mh-state' }, [
    el('div', { class: 'mh-state__icon', style: 'background:var(--mh-warn-bg);color:var(--mh-warn)' }, [icon('clock')]),
    el('h2', { text: 'This piece is not available to order' }),
    el('p', {
      text: `${product.name} (${product.reference}) is no longer offered for ordering, so the order button is not shown. Message Muna if you would like to be told if it returns.`,
    }),
    el('div', { style: 'display:flex;gap:.6rem;flex-wrap:wrap;justify-content:center' }, [
      el('a', { class: 'mh-btn mh-btn--primary mh-btn--sm', href: '#/catalogue', text: 'Browse other pieces' }),
      el('a', { class: 'mh-btn mh-btn--sm', href: '#/', text: 'Back to home' }),
    ]),
  ]);
}

/**
 * A reference that resolves to nothing the shopper may see. The wording is
 * deliberately unable to distinguish "never existed" from "was unpublished":
 * confirming that a product exists while hiding it would leak the owner's stock
 * decisions into a public page, and a mistyped reference deserves the same
 * helpful answer anyway.
 */
export function notListedState(reference) {
  return el('div', { class: 'mh-state' }, [
    el('div', { class: 'mh-state__icon' }, [icon('search')]),
    el('h2', { text: 'That piece is not listed at the moment' }),
    el('p', {
      text: reference
        ? `Nothing is listed under the reference “${reference}”. It may have sold out and been retired, the reference may be mistyped, or the piece may not have been published yet. Muna can confirm on WhatsApp.`
        : 'Nothing is listed at that address. It may have been unpublished or retired.',
    }),
    el('div', { style: 'display:flex;gap:.6rem;flex-wrap:wrap;justify-content:center' }, [
      el('a', { class: 'mh-btn mh-btn--primary mh-btn--sm', href: '#/catalogue', text: 'Browse what is listed' }),
      el('a', { class: 'mh-btn mh-btn--sm', href: '#/', text: 'Back to home' }),
    ]),
  ]);
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
