/**
 * Dashboard UI primitives.
 *
 * Every control is built with DOM APIs and `textContent`, so a product name or
 * order note containing markup renders as literal text. `el()` comes from the
 * same helper the storefront uses.
 */

import { el, icon, text, clear } from '../lib/dom.js';

export { el, icon, text, clear };

export function field({ label, hint, control, id, error = '', required = false }) {
  const errorId = error ? `${id}-error` : '';
  if (error) control.setAttribute('aria-invalid', 'true');
  if (errorId) control.setAttribute('aria-describedby', errorId);
  else control.removeAttribute('aria-describedby');

  return el('div', { class: 'mh-field', 'data-field': id }, [
    el('label', { for: id }, [text(label), required ? el('span', { 'aria-hidden': 'true', text: ' *' }) : null]),
    control,
    hint ? el('p', { class: 'mh-field__hint', text: hint }) : null,
    error ? el('p', { id: errorId, class: 'mh-error-text', role: 'alert', text: error }) : null,
  ]);
}

export function input(name, value = '', attrs = {}) {
  return el('input', { class: 'mh-input', id: name, name, value: value ?? '', ...attrs });
}

export function textarea(name, value = '', attrs = {}) {
  return el('textarea', { class: 'mh-textarea', id: name, name, ...attrs }, [value ?? '']);
}

/** `select` with the chosen value applied after options exist. */
export function select(name, options, value, attrs = {}) {
  const node = el('select', { class: 'mh-select', id: name, name, ...attrs },
    options.map((option) =>
      el('option', {
        value: option.value,
        selected: String(option.value) === String(value ?? ''),
        text: option.label,
      }),
    ),
  );
  return node;
}

export function checkbox(name, checked, labelText, hint) {
  const box = el('input', { type: 'checkbox', id: name, name, checked: Boolean(checked) });
  return el('label', { class: 'mh-checkbox', for: name }, [
    box,
    el('span', {}, [text(labelText), hint ? el('span', { class: 'mh-field__hint', style: 'display:block', text: hint }) : null]),
  ]);
}

export function passwordField(name, { label, id = name, autocomplete = 'current-password' } = {}) {
  const control = el('input', {
    class: 'mh-input',
    type: 'password',
    id,
    name,
    autocomplete,
    required: true,
    'aria-describedby': `${id}-reveal-hint`,
  });
  const toggle = el('button', {
    class: 'mh-input-group__btn',
    type: 'button',
    'aria-pressed': 'false',
    'aria-label': 'Show password',
  }, [icon('eye')]);
  toggle.addEventListener('click', () => {
    const shown = control.type === 'text';
    control.type = shown ? 'password' : 'text';
    toggle.setAttribute('aria-pressed', String(!shown));
    toggle.setAttribute('aria-label', shown ? 'Show password' : 'Hide password');
    clear(toggle).appendChild(icon(shown ? 'eye' : 'eyeOff'));
    control.focus();
  });
  return el('div', { class: 'mh-field' }, [
    el('label', { for: id, text: label }),
    el('div', { class: 'mh-input-group' }, [control, toggle]),
    el('p', { id: `${id}-reveal-hint`, class: 'mh-field__hint', text: 'Revealing only shows the text on this screen. It is never saved or sent anywhere except Supabase sign-in.' }),
  ]);
}

export function button(label, { variant = '', size = '', icon: iconName = '', type = 'button', onClick, attrs = {} } = {}) {
  const classes = ['mh-btn', variant ? `mh-btn--${variant}` : '', size ? `mh-btn--${size}` : '']
    .filter(Boolean)
    .join(' ');
  const node = el('button', { class: classes, type, ...attrs }, [iconName ? icon(iconName) : null, text(label)]);
  if (onClick) node.addEventListener('click', onClick);
  return node;
}

export function busy(node, isBusy, busyLabel = 'Saving…') {
  if (!node) return;
  if (isBusy) {
    if (!node.dataset.idleHtml) node.dataset.idleHtml = '1';
    node.dataset.prevDisabled = node.disabled ? '1' : '';
    node.disabled = true;
    node.dataset.prevText = node.textContent;
    clear(node);
    node.appendChild(el('span', { class: 'mh-spinner', 'aria-hidden': 'true' }));
    node.appendChild(text(busyLabel));
  } else {
    node.disabled = node.dataset.prevDisabled === '1';
    const previous = node.dataset.prevText;
    clear(node);
    node.appendChild(text(previous || 'Save'));
  }
}

/**
 * Accessible confirmation dialog. `window.confirm` is avoided because it is
 * unreadable on some Android browsers and cannot show the consequence of a
 * destructive action in the owner's own words.
 */
export function confirmDialog({ title, body, confirmLabel = 'Yes, continue', cancelLabel = 'Cancel', danger = false, detail = null }) {
  return new Promise((resolve) => {
    const backdrop = el('div', { class: 'mh-modal-backdrop' });
    const headingId = 'mh-modal-title';
    let settled = false;

    const close = (value) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
      resolve(value);
    };
    function onKey(event) {
      if (event.key === 'Escape') close(false);
    }

    const confirmButton = el('button', {
      class: `mh-btn mh-btn--${danger ? 'danger' : 'primary'}`,
      type: 'button',
      text: confirmLabel,
    });
    confirmButton.addEventListener('click', () => close(true));
    const cancelButton = el('button', { class: 'mh-btn mh-btn--ghost', type: 'button', text: cancelLabel });
    cancelButton.addEventListener('click', () => close(false));

    const modal = el('div', { class: 'mh-modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': headingId }, [
      el('h2', { id: headingId, text: title }),
      el('p', { text: body }),
      detail || null,
      el('div', { class: 'mh-modal__actions' }, [cancelButton, confirmButton]),
    ]);

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    document.addEventListener('keydown', onKey);
    confirmButton.focus();
  });
}

let toastTimer = 0;
export function toast(message, tone = 'success') {
  let node = document.querySelector('.mh-toast');
  if (!node) {
    node = el('div', { class: 'mh-toast', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(node);
  }
  node.textContent = message;
  node.dataset.tone = tone;
  node.dataset.visible = 'true';
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    node.dataset.visible = 'false';
  }, 3200);
}

export function statusBadge(status) {
  const map = {
    published: ['ok', 'Published'],
    draft: ['neutral', 'Draft'],
    archived: ['warn', 'Archived'],
    recorded: ['neutral', 'Recorded'],
    confirmed: ['ok', 'Confirmed'],
    completed: ['gold', 'Completed'],
    cancelled: ['danger', 'Cancelled'],
    unpaid: ['warn', 'Payment not received'],
    partial: ['warn', 'Part paid'],
    paid: ['ok', 'Paid'],
    refunded: ['danger', 'Refunded'],
    pending: ['neutral', 'Not started'],
    packed: ['neutral', 'Packed'],
    dispatched: ['warn', 'Dispatched'],
    delivered: ['ok', 'Delivered'],
    collected: ['ok', 'Collected'],
  };
  const [tone, label] = map[status] || ['neutral', status || '—'];
  return el('span', { class: `mh-badge mh-badge--${tone}`, text: label });
}

export function panel(heading, children, { actions = null } = {}) {
  return el('section', { class: 'mh-panel' }, [
    actions
      ? el('div', { class: 'mh-panel__head' }, [el('h2', { text: heading }), actions])
      : el('h2', { text: heading }),
    ...children,
  ]);
}

export function emptyState(title, body, action) {
  return el('div', { class: 'mh-empty' }, [el('strong', { text: title }), el('p', { style: 'margin:0', text: body }), action || null]);
}

export function stat(label, value, tone = '') {
  return el('div', { class: `mh-stat ${tone ? `mh-stat--${tone}` : ''}` }, [
    el('p', { class: 'mh-stat__value', text: String(value) }),
    el('p', { class: 'mh-stat__label', text: label }),
  ]);
}

/** Collect a form into a plain object, trimming strings. */
export function formValues(form) {
  const data = new FormData(form);
  const out = {};
  for (const [key, value] of data.entries()) {
    out[key] = typeof value === 'string' ? value.trim() : value;
  }
  for (const node of form.querySelectorAll('input[type="checkbox"]')) {
    out[node.name] = node.checked;
  }
  return out;
}

/**
 * `CSS.escape` is not universal (older WebViews and non-browser hosts lack it),
 * and a missing feature here would throw inside the error reporter — the worst
 * possible moment. So it is used when present and approximated when not.
 */
function escapeIdentifier(value) {
  const text = String(value ?? '');
  if (typeof globalThis.CSS?.escape === 'function') return globalThis.CSS.escape(text);
  return text.replace(/[\\"]]/g, '\\$&');
}

/** Show per-field errors returned from the database or the validator. */
export function showFieldErrors(form, errors) {
  for (const node of form.querySelectorAll('[data-field]')) {
    const existing = node.querySelector('.mh-error-text');
    if (existing) existing.remove();
    const control = node.querySelector('.mh-input, .mh-textarea, .mh-select');
    if (control) control.removeAttribute('aria-invalid');
  }
  let firstBad = null;
  for (const [name, message] of Object.entries(errors || {})) {
    const selector = escapeIdentifier(name);
    const wrapper = form.querySelector(`[data-field="${selector}"]`) || form.querySelector(`[name="${selector}"]`)?.closest('.mh-field');
    if (!wrapper) continue;
    wrapper.appendChild(el('p', { class: 'mh-error-text', role: 'alert', text: message }));
    const control = wrapper.querySelector('.mh-input, .mh-textarea, .mh-select');
    if (control) {
      control.setAttribute('aria-invalid', 'true');
      if (!firstBad) firstBad = control;
    }
  }
  if (firstBad) firstBad.focus();
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString([], { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
