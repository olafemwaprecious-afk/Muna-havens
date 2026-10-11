/**
 * Promotions and referrals — planned, not built.
 *
 * This panel is deliberately read-only. It documents what the store intends, and
 * what has to be true before any of it can be switched on. There is no form here
 * that writes a flag, because a toggle with nothing behind it would promise
 * customers a discount mechanism that does not exist. The `features` column on
 * the settings row stays at its defaults, and the storefront shows “Coming soon”.
 */

import { el, text, icon } from '../lib/dom.js';
import { panel, button } from './ui.js';
import { formatNaira } from '../lib/money.js';

export function renderPromotions(app, cache) {
  const features = readFeatures(cache.settings);

  return el('div', {}, [
    el('div', { class: 'mh-page__head' }, [
      el('div', {}, [
        el('h1', { text: 'Promotions and referrals' }),
        el('p', { text: 'Recorded for the next version. Nothing on this screen changes what a customer sees.' }),
      ]),
    ]),

    el('p', { class: 'mh-notice-strip' }, [
      icon('alert'),
      el('span', {
        text:
          'These are not switched on, and no discount, code or reward is calculated anywhere in the store. ' +
          'Prices on the catalogue are the prices a customer is quoted. That is intentional: a half-built ' +
          'promotion system would show a discount nobody can honour.',
      }),
    ]),

    panel('What is planned', [
      el('div', { class: 'mh-list' }, PLAN.map((item) =>
        el('article', { class: 'mh-list-item' }, [
          el('div', { class: 'mh-list-item__body' }, [
            el('p', { class: 'mh-list-item__title', text: item.title }),
            el('p', { class: 'mh-small', style: 'margin:0;color:var(--mh-ink-70)', text: item.what }),
            el('p', { class: 'mh-small mh-muted', style: 'margin:.4rem 0 0', text: `Before it can go live: ${item.before}` }),
          ]),
          el('span', { class: 'mh-badge mh-badge--neutral', text: item.state }),
        ]),
      )),
    ]),

    panel('Current state of the switches', [
      el('p', { class: 'mh-small mh-muted', style: 'margin:0 0 .75rem', text: 'Read straight from the settings row. They stay false while nothing acts on them, and that is the honest answer.' }),
      el('div', { class: 'mh-table-wrap--wide-only mh-table-wrap' }, [
        el('table', { class: 'mh-table', style: 'min-width:0' }, [
          el('thead', {}, [el('tr', {}, [el('th', { text: 'Flag' }), el('th', { text: 'Meaning' }), el('th', { text: 'Value' })])]),
          el('tbody', {}, Object.keys(features).map((key) =>
            el('tr', {}, [
              el('td', {}, [el('code', { text: key })]),
              el('td', { text: FLAG_MEANING[key] || '—' }),
              el('td', {}, [el('span', { class: `mh-badge mh-badge--${features[key] ? 'warn' : 'neutral'}`, text: features[key] ? 'on (nothing reads it yet)' : 'off' })]),
            ]),
          )),
        ]),
      ]),
      el('p', { class: 'mh-field__hint', style: 'margin-top:.75rem', text: 'There is no button to change these here on purpose. Flipping one without the code behind it would advertise something that does not work.' }),
    ]),

    panel('How a price is agreed in the meantime', [
      el('ol', { style: 'margin:0;padding-left:1.2rem;display:grid;gap:.4rem;font-size:var(--mh-text-sm)' }, [
        el('li', { text: 'Update the product price, and every card, page and enquiry message changes together. That is the only lever for a real price in this version.' }),
        el('li', { text: 'For a one-off agreed figure with a customer, record the order with the negotiated unit price on the line — the order keeps its own copy and the catalogue price stays untouched.' }),
        el('li', { text: 'Never write a discount into the product description: it would read as a standing price to the next customer.' }),
      ]),
      el('p', { style: 'margin:.9rem 0 0' }, [
        button('Go to products', { size: 'sm', onClick: () => app.navigate('/products') }),
        ' ',
        button('Record an order', { size: 'sm', variant: 'ghost', onClick: () => app.navigate('/orders') }),
      ]),
    ]),

    panel('Money already agreed outside the catalogue', [
      el('p', { class: 'mh-small mh-muted', style: 'margin:0 0 .5rem', text: 'Order lines keep the unit price they were recorded with. If a negotiated figure appears below, it is history, not a standing discount.' }),
      el('p', { class: 'mh-field__hint', style: 'margin:0', text: `Example of how it is stored: a ${formatNaira('3500.00')} listing recorded in an order at ${formatNaira('3200.00')} keeps ₦3,200 on that order, and ₦3,500 on the shelf.` }),
    ]),
  ]);
}

const FLAG_MEANING = {
  promotions: 'Discount campaigns, codes and expiry dates.',
  referrals: 'Invite-a-friend rewards and redemption history.',
  payments: 'Any payment collection through the site at all.',
};

const PLAN = [
  {
    title: 'Promotion periods with a real discount rule',
    state: 'Not built',
    what: 'A start and end date, which products or categories it covers, and a percentage or fixed amount off, applied to the displayed price everywhere at once.',
    before:
      'an exact money type for the rate, a rule for whether a price can go below cost, a way to show the old price honestly, and a decision on whether the WhatsApp message quotes the discounted figure',
  },
  {
    title: 'Referral rewards',
    state: 'Not built',
    what: 'A code a customer can share, credit for the person who sent them, and a reward that is only granted once the order is genuinely completed.',
    before:
      'agreement on what the reward actually is, a rule for self-referral, a record of who referred whom, and a limit so the offer cannot be farmed',
  },
  {
    title: 'Promotion audit log',
    state: 'Not built',
    what: 'Who created a campaign, when it was live, and what it changed — so a later question about a price can be answered from fact.',
    before: 'the promotion tables themselves; a log for a feature that does not exist would have nothing to record',
  },
  {
    title: 'Payment on the website',
    state: 'Out of scope',
    what: 'Checkout, a gateway, refunds, and the obligations that come with holding customer money.',
    before: 'a business decision, not a build task. Enquiry-based ordering is the design of this version.',
  },
];

function readFeatures(settings) {
  const raw = settings?.features;
  const base = { promotions: false, referrals: false, payments: false };
  if (!raw) return base;
  if (typeof raw === 'string') {
    try {
      return { ...base, ...JSON.parse(raw) };
    } catch {
      return base;
    }
  }
  return { ...base, ...raw };
}
