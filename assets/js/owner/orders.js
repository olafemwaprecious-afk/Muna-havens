/**
 * Order recording.
 *
 * The website never receives an order — a customer sends a WhatsApp message and
 * the owner agrees the details. This screen is where that conversation becomes a
 * record: three independent status axes (order, payment, delivery), each line
 * snapshotting the product name and unit price at the moment of recording, so a
 * later price change cannot rewrite history.
 */

import { el, text, clear, icon } from '../lib/dom.js';
import {
  button,
  field,
  input,
  textarea,
  select,
  busy,
  toast,
  statusBadge,
  formatDateTime,
  panel,
  emptyState,
  formValues,
  showFieldErrors,
} from './ui.js';
import { formatNaira, parseAmount } from '../lib/money.js';

const ORDER_STATUS = [
  ['recorded', 'Recorded — agreed, nothing done yet'],
  ['confirmed', 'Confirmed — you have committed to it'],
  ['completed', 'Completed'],
  ['cancelled', 'Cancelled'],
];
const PAYMENT_STATUS = [
  ['unpaid', 'Payment not received'],
  ['partial', 'Part paid'],
  ['paid', 'Paid in full'],
  ['refunded', 'Refunded'],
];
/* Column names here are the database's three independent status axes. There is
   deliberately no "delivered and paid" combined state: they move separately. */
const FULFILMENT_STATUS = [
  ['pending', 'Not started'],
  ['packed', 'Packed'],
  ['dispatched', 'On its way / dispatched'],
  ['delivered', 'Delivered'],
  ['collected', 'Collected in person'],
  ['cancelled', 'Not going ahead'],
];

export async function renderOrders(app) {
  const wrap = el('div', {});
  const body = el('div', {});

  const state = {
    orders: [],
    filter: app.ordersFilter || 'all',
    loading: true,
    error: null,
  };

  async function load() {
    state.loading = true;
    state.error = null;
    render();
    try {
      state.orders = await app.api.listOrders({ limit: 100 });
    } catch (error) {
      state.error = error;
    } finally {
      state.loading = false;
      render();
    }
  }

  function render() {
    clear(body);
    if (state.loading) {
      body.appendChild(el('div', { class: 'mh-panel' }, [el('p', { class: 'mh-muted', text: 'Loading recorded orders…' })]));
      return;
    }
    if (state.error) {
      body.appendChild(
        el('div', { class: 'mh-panel' }, [
          el('h2', { text: 'The order list could not be read' }),
          el('p', { text: state.error.message || 'Unknown error.' }),
          el('p', { class: 'mh-field__hint', text: 'If it mentions permission or Row Level Security, check that this account has a row in mh_app_role and that migration 0002 has been applied.' }),
          button('Try again', { size: 'sm', onClick: load }),
        ]),
      );
      return;
    }

    const rows = state.orders.filter((order) =>
      state.filter === 'all' ? true : order.order_status === state.filter,
    );

    if (!state.orders.length) {
      body.appendChild(
        el('div', { class: 'mh-panel' }, [
          emptyState(
            'No orders recorded yet',
            'Record one when a WhatsApp conversation turns into an agreed order. Nothing here is visible to customers, and the store never charges or collects payment.',
          ),
        ]),
      );
      return;
    }

    body.appendChild(
      el('div', { class: 'mh-filters', role: 'group', 'aria-label': 'Filter orders', style: 'margin-bottom:1rem' }, [
        ...[['all', `All (${state.orders.length})`], ...ORDER_STATUS.map(([value, label]) => [value, `${label.split(' —')[0]} (${state.orders.filter((o) => o.order_status === value).length})`])].map(
          ([value, label]) =>
            el('button', {
              class: 'mh-chip',
              type: 'button',
              'aria-pressed': String(state.filter === value),
              text: label,
              onClick: () => {
                state.filter = value;
                app.ordersFilter = value;
                render();
              },
            }),
        ),
      ]),
    );

    body.appendChild(
      el('div', { class: 'mh-list' }, rows.map((order) => orderCard(app, order, load))),
    );
  }

  const recordButton = button('Record an order', { variant: 'primary', icon: 'plus', onClick: () => openRecorder(app, load) });

  wrap.appendChild(
    el('div', { class: 'mh-page__head' }, [
      el('div', {}, [
        el('h1', { text: 'Orders' }),
        el('p', { text: 'Private record of what was agreed with each customer. Payment is never taken here.' }),
      ]),
      el('div', { class: 'mh-page__actions' }, [recordButton]),
    ]),
  );
  wrap.appendChild(body);

  if (app.api.mode === 'demo') {
    wrap.prepend(
      el('p', { class: 'mh-notice-strip' }, [
        icon('alert'),
        el('span', { text: 'Preview mode: recorded orders cannot be saved until the store database is connected.' }),
      ]),
    );
  }

  await load();
  return wrap;
}

function orderCard(app, order, reload) {
  const total = formatNaira(order.total_amount, { currency: order.currency || 'NGN' });

  const selects = {
    order_status: statusSelect(app, order, 'order_status', ORDER_STATUS, 'Order status', reload),
    payment_status: statusSelect(app, order, 'payment_status', PAYMENT_STATUS, 'Payment status', reload),
    fulfilment_status: statusSelect(app, order, 'fulfilment_status', FULFILMENT_STATUS, 'Fulfilment status', reload),
  };

  return el('article', { class: 'mh-panel', style: 'padding:1rem' }, [
    el('div', { style: 'display:flex;gap:.75rem;justify-content:space-between;flex-wrap:wrap;align-items:flex-start' }, [
      el('div', {}, [
        el('h2', { style: 'font-size:var(--mh-text-md);margin:0 0 .2rem' }, [
          text(order.order_reference),
          order.customer_name ? el('span', { class: 'mh-muted', style: 'font-weight:400', text: ` · ${order.customer_name}` }) : null,
        ]),
        el('p', { class: 'mh-small mh-muted', style: 'margin:0', text: `Recorded ${formatDateTime(order.created_at)} · ${total}` }),
      ]),
      el('span', { class: 'mh-price-tag mh-price-tag--sm', text: total }),
    ]),

    order.customer_contact
      ? el('p', { class: 'mh-small', style: 'margin:.5rem 0 0' }, [
          el('a', {
            href: `https://wa.me/${String(order.customer_contact).replace(/[^0-9]/g, '')}`,
            target: '_blank',
            rel: 'noopener noreferrer',
            text: `Reopen the conversation with ${order.customer_name || 'this customer'} on WhatsApp`,
          }),
          el('span', { class: 'mh-muted', text: ` · ${order.customer_contact}` }),
        ])
      : null,
    order.notes ? el('p', { class: 'mh-small', style: 'margin:.5rem 0 0', text: `Note: ${order.notes}` }) : null,

    el('ul', { style: 'list-style:none;margin:.75rem 0 0;padding:0;display:grid;gap:.35rem' }, (order.items || []).map((item) =>
      el('li', { style: 'display:flex;gap:.5rem;justify-content:space-between;border-top:var(--mh-border);padding-top:.35rem' }, [
        el('span', { class: 'mh-small', text: `${item.quantity} × ${item.product_name}${item.variant_label ? ` (${item.variant_label})` : ''}${item.product_reference ? ` · ${item.product_reference}` : ''}` }),
        el('span', { class: 'mh-small', style: 'white-space:nowrap', text: formatNaira(item.line_total) }),
      ]),
    )),

    el('div', { class: 'mh-row mh-row--2', style: 'margin-top:.9rem;grid-template-columns:1fr' }, [
      el('div', { class: 'mh-row mh-row--2' }, [
        selects.order_status,
        selects.payment_status,
        selects.delivery_status,
      ]),
    ]),
  ]);
}

function statusSelect(app, order, key, options, label, reload) {
  const id = `mh-${key}-${order.id}`;
  const control = select(id, options.map(([value, optionLabel]) => ({ value, label: optionLabel })), order[key]);
  const save = button('Update', {
    size: 'sm',
    variant: 'ghost',
    onClick: async () => {
      busy(save, true, 'Saving…');
      try {
        // No per-axis timestamp column: `updated_at` is maintained by a trigger,
        // and the note field is where a real-time detail belongs.
        await app.api.updateOrder(order.id, { [key]: control.value });
        toast(`${label} set to “${control.options[control.selectedIndex].text}”.`);
        await reload();
      } catch (error) {
        toast(error.message || 'That status change was refused.', 'error');
      } finally {
        busy(save, false);
      }
    },
  });

  return el('div', { class: 'mh-field' }, [
    el('label', { class: 'mh-label', for: id, text: label }),
    el('div', { style: 'display:flex;gap:.5rem;align-items:flex-start' }, [
      el('div', { style: 'flex:1;min-width:0' }, [control]),
      save,
    ]),
    el('p', {
      class: 'mh-field__hint',
      text:
        key === 'payment_status'
          ? 'Set this only once the money has actually arrived. An enquiry is never payment.'
          : key === 'delivery_status'
            ? 'Delivery is arranged with the customer directly — the site does not track couriers.'
            : null,
    }),
  ]);
}

/* ------------------------------------------------------------- recorder -- */

/**
 * Suggests the next MH-ORD-nnnnnn from what is already recorded. It is a
 * convenience only: the unique constraint on the column is what decides, and a
 * collision is reported as a normal validation failure.
 */
function suggestOrderReference(orders) {
  let highest = 0;
  for (const order of orders || []) {
    const match = /^(\d+)$/.exec(String(order.order_reference || '').replace(/^MH-ORD-/, ''));
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return `MH-ORD-${String(highest + 1).padStart(6, '0')}`;
}

function openRecorder(app, reload) {
  const products = (app.cache.products || []).filter((p) => p.status !== 'archived');
  if (!products.length) {
    toast('Add a published product before recording an order, so the line can snapshot a real price.');
    return;
  }

  const lines = el('div', { class: 'mh-variant-rows' });
  const totals = el('p', { class: 'mh-field__hint', style: 'margin:.4rem 0 0', text: 'Total: ₦0' });
  const feedback = el('div', {});

  const addLine = (line = {}) => {
    const row = { product_id: line.product_id || products[0].id, quantity: line.quantity || 1, unit_price: '' };
    const productSelect = select(
      `mh-rec-p-${lines.children.length}`,
      products.map((p) => ({ value: p.id, label: `${p.reference} — ${p.name} (${formatNaira(p.price)})` })),
      row.product_id,
    );
    const qty = input(`mh-rec-q-${lines.children.length}`, row.quantity, { type: 'number', min: '1', step: '1', style: 'max-width:6rem' });
    const price = input(`mh-rec-price-${lines.children.length}`, products.find((p) => p.id === row.product_id)?.price || '', {
      inputmode: 'decimal',
      style: 'max-width:9rem',
      'aria-label': 'Agreed unit price in naira',
    });
    const remove = button('Remove', { size: 'sm', variant: 'ghost', onClick: () => { rowNode.remove(); recompute(); } });

    const recompute = () => {
      row.product_id = productSelect.value;
      row.quantity = Number(qty.value) || 1;
      const parsed = parseAmount(price.value);
      row.unit_price = parsed.ok ? parsed.value : null;
      let sum = 0;
      for (const node of lines.querySelectorAll('.mh-rec-line')) {
        sum += Number(node.dataset.total || 0);
      }
      totals.textContent = `Total: ${formatNaira(sum.toFixed(2))}`;
      rowNode.dataset.total = String(
        (Math.round(Number(row.unit_price || 0) * 100) * row.quantity) / 100,
      );
      const catalogueItem = products.find((p) => p.id === row.product_id);
      // Name and reference are snapshotted into the order line, exactly as the
      // schema demands, so editing or archiving the product cannot rewrite this.
      rowNode.dataset.line = JSON.stringify({
        product_id: row.product_id,
        product_name: catalogueItem?.name || 'Item',
        product_reference: catalogueItem?.reference || null,
        currency: 'NGN',
        quantity: row.quantity,
        unit_price: row.unit_price,
        variant_label: line.variant_label || null,
      });
    };

    const rowNode = el('div', { class: 'mh-variant-row mh-rec-line', style: 'grid-template-columns:minmax(0,1.6fr) 6rem 9rem auto' }, [
      productSelect,
      qty,
      el('div', {}, [price, el('span', { class: 'mh-field__hint', text: 'Agreed unit price' })]),
      remove,
    ]);
    for (const control of [productSelect, qty, price]) control.addEventListener('input', recompute);
    // A price of an existing product defaults to its catalogue price; the owner
    // can change it for a negotiated figure, which is then snapshotted.
    recompute();
    lines.appendChild(rowNode);
  };

  const nextRef = suggestOrderReference(app.cache.orders || []);
  const orderRef = input('mh-order-reference', nextRef, { pattern: 'MH-ORD-[0-9]{6}', placeholder: 'MH-ORD-000001', required: true, spellcheck: false });
  const customerName = input('mh-customer-name', '', { maxlength: '120' });
  const customerContact = input('mh-customer-contact', '', { type: 'tel', inputmode: 'tel', maxlength: '24', placeholder: '0803 000 0000' });
  const notes = textarea('mh-order-notes', '', { maxlength: '1000', placeholder: 'Sizes agreed, colour, where it was arranged, anything that settles a later question.' });
  const when = input('mh-order-date', new Date().toISOString().slice(0, 10), { type: 'date' });

  const submit = button('Save this order', { variant: 'primary' });
  const form = el('form', { class: 'mh-editor', novalidate: true, onsubmit: (event) => event.preventDefault() }, [
    feedback,
    field({ label: 'Order reference', id: 'mh-order-reference', control: orderRef, required: true, hint: 'Format MH-ORD-000001. It is the number you both quote if a question comes later.' }),
    el('div', { class: 'mh-row mh-row--2' }, [
      field({ label: 'Customer name (optional)', id: 'mh-customer-name', control: customerName }),
      field({ label: 'Customer WhatsApp or phone (optional)', id: 'mh-customer-contact', control: customerContact, hint: 'Saved so you can reopen the conversation. Only a signed-in owner can read it — never a customer.' }),
    ]),
    el('div', { class: 'mh-field' }, [
      el('span', { class: 'mh-label', text: 'Lines' }),
      lines,
      el('div', { style: 'display:flex;gap:.6rem;align-items:center;margin-top:.5rem;flex-wrap:wrap' }, [
        button('Add a line', { size: 'sm', icon: 'plus', onClick: () => addLine() }),
        totals,
      ]),
    ]),
    field({ label: 'Date agreed', id: 'mh-order-date', control: when, hint: 'Defaults to today. Change it when recording a conversation from an earlier day.' }),
    field({ label: 'Notes', id: 'mh-order-notes', control: notes, hint: 'Private. Never shown on the storefront.' }),
    el('p', { class: 'mh-field__hint', text: 'Payment is recorded on the order card afterwards, only once the money has arrived.' }),
  ]);

  addLine();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clear(feedback);
    const values = formValues(form);
    const items = [...lines.querySelectorAll('.mh-rec-line')].map((node) => JSON.parse(node.dataset.line || '{}'));

    if (!/^MH-ORD-[0-9]{6}$/.test(String(values['mh-order-reference'] || '').trim().toUpperCase())) {
      showFieldErrors(form, { 'mh-order-reference': 'Use the format MH-ORD-000001.' });
      return;
    }
    if (!items.length || items.some((item) => !item.product_id || !item.quantity || item.quantity < 1)) {
      feedback.appendChild(el('p', { class: 'mh-notice mh-notice--error', role: 'alert', text: 'Every line needs a product and a quantity of at least 1.' }));
      return;
    }

    busy(submit, true, 'Saving…');
    try {
      await app.api.createOrder({
        order_reference: String(values['mh-order-reference']).trim().toUpperCase(),
        customer_name: values['mh-customer-name'] || null,
        customer_contact: values['mh-customer-contact'] || null,
        notes: values['mh-order-notes'] || null,
        order_date: values['mh-order-date'] ? new Date(`${values['mh-order-date']}T12:00:00`).toISOString() : new Date().toISOString(),
        items,
      });
      toast('Order recorded.');
      close();
      await reload();
      await app.reload();
    } catch (error) {
      clear(feedback);
      feedback.appendChild(el('p', { class: 'mh-notice mh-notice--error', role: 'alert', text: error.message || 'Could not record that order.' }));
      if (error.detail) feedback.appendChild(el('p', { class: 'mh-field__hint', text: `Database detail: ${error.detail}` }));
    } finally {
      busy(submit, false);
    }
  });

  submit.addEventListener('click', () => form.dispatchEvent(new Event('submit', { cancelable: true })));

  const backdrop = el('div', { class: 'mh-modal-backdrop' }, [
    el('div', { class: 'mh-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Record an order', style: 'width:min(100%,42rem)' }, [
      el('h2', { text: 'Record an order' }),
      el('p', { class: 'mh-small mh-muted', text: 'This is your record of a conversation you already had on WhatsApp. No message is sent and no payment is taken by saving this.' }),
      form,
      el('div', { class: 'mh-modal__actions' }, [
        button('Cancel', { variant: 'ghost', onClick: () => close() }),
        submit,
      ]),
    ]),
  ]);
  function close() {
    document.removeEventListener('keydown', onKey);
    backdrop.remove();
  }
  function onKey(event) {
    if (event.key === 'Escape') close();
  }
  document.addEventListener('keydown', onKey);
  document.body.appendChild(backdrop);
  orderRef.focus();
}
