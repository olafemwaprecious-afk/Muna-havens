/**
 * Money handling.
 *
 * The database stores prices as `numeric(12,2)`; the API layer passes them
 * through as strings, so no float arithmetic ever touches a price. Formatting
 * and parsing live here. Parsing is only used for owner form input.
 */

export const NAIRA_SIGN = '\u20A6';
const CURRENCY_SYMBOLS = { NGN: NAIRA_SIGN, USD: '$', GHS: '\u20B5', GBP: '\u00A3', EUR: '\u20AC' };

/**
 * Format a stored numeric-string price for display: `28000.00` -> `₦28,000`.
 * Kobo is shown only when non-zero, matching how prices are quoted in Nigeria.
 */
export function formatNaira(value, { currency = 'NGN', showCents } = {}) {
  const amount = toNumber(value);
  if (amount === null || !Number.isFinite(amount)) return '';
  const symbol = CURRENCY_SYMBOLS[currency] || `${currency} `;
  const cents = showCents === undefined ? !Number.isInteger(amount) : Boolean(showCents);
  const fixed = amount.toFixed(cents ? 2 : 0);
  const [whole, frac] = fixed.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${symbol}${grouped}${frac ? `.${frac}` : ''}`;
}

/** Same as formatNaira but never returns an empty string. */
export function formatNairaOr(value, fallback = 'Price on request', options) {
  return formatNaira(value, options) || fallback;
}

export function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse owner form input into a fixed 2-decimal string, or return an error.
 *
 * Accepted: 28000 | 28,000 | ₦28,000 | 28000.00 | 28 000 | 1.234,50 | 3500,50
 * Rejected: negatives, letters, more than 2 decimal places, malformed
 * thousands groups (so a mistyped `1,5` cannot become 15 silently... it is
 * read as the decimal comma 1.50, which is the intended meaning).
 */
export function parseAmount(raw, { label = 'Price', maxDigits = 12 } = {}) {
  if (raw === null || raw === undefined) return { ok: false, error: `${label} is required.` };

  const text = String(raw)
    .replace(/[\u20A6\u00A3\u20AC\u20B5]/g, '')
    .replace(/\bNGN\b/gi, '')
    .replace(/[\s\u00A0]/g, '')
    .trim();

  if (!text) return { ok: false, error: `${label} is required.` };
  if (text.startsWith('-')) return { ok: false, error: `${label} cannot be negative.` };
  if (!/^[0-9.,]+$/.test(text)) {
    return { ok: false, error: `${label} must be a number, for example 28000 or 3500.50.` };
  }
  if (/^[.,]/.test(text) || /[.,]$/.test(text) || /[.,]{2,}/.test(text)) {
    return { ok: false, error: `${label} must be a number, for example 28000 or 3500.50.` };
  }

  const normalised = normaliseSeparators(text);
  if (!normalised.ok) return { ok: false, error: normalised.error };

  const digits = String(normalised.value);
  if (!/^\d{1,15}(\.\d{1,2})?$/.test(digits)) {
    return { ok: false, error: `${label} may have at most 2 decimal places (kobo).` };
  }
  const [wholePart] = digits.split('.');
  if (wholePart.length > maxDigits) {
    return { ok: false, error: `${label} is too large (max ${maxDigits} digits before the decimal point).` };
  }
  const rounded = Math.round(Number(digits) * 100) / 100;
  if (!Number.isFinite(rounded) || rounded < 0) {
    return { ok: false, error: `${label} must be zero or more.` };
  }
  return { ok: true, value: rounded.toFixed(2), display: formatNaira(rounded.toFixed(2)) };
}

/**
 * Collapse messy separators into a plain dot-decimal number string.
 *
 * The rule is deliberately conservative: a group is only read as thousands
 * grouping when the part before it actually looks like grouping (`28.000`,
 * `1,234,567`). So `28000.999` is not silently multiplied into a huge number —
 * it stays a decimal, and the two-decimal check then refuses it. Anything the
 * rule cannot decide is refused instead of guessed, because a wrong price is
 * worse than a form that asks again.
 */
function normaliseSeparators(text) {
  const separators = text.match(/[.,]/g) || [];
  if (separators.length === 0) return { ok: true, value: text };

  const lastSepIndex = Math.max(text.lastIndexOf('.'), text.lastIndexOf(','));
  const head = text.slice(0, lastSepIndex);
  const tail = text.slice(lastSepIndex + 1);
  const otherSep = text[lastSepIndex] === ',' ? '.' : ',';

  // Exactly three digits after the final separator, preceded by valid grouping:
  // a thousands separator, not a decimal point.
  if (/^\d{3}$/.test(tail) && /^\d{1,3}([.,]\d{3})*$/.test(head)) {
    return { ok: true, value: head.split(/[.,]/).join('') + tail };
  }

  if (!head.includes(otherSep)) return { ok: true, value: `${head}.${tail}` };

  const groups = head.split(otherSep);
  const validGroups = /^\d{1,3}$/.test(groups[0]) && groups.slice(1).every((group) => /^\d{3}$/.test(group));
  if (!validGroups) {
    return { ok: false, error: 'Check the separators — thousands groups must be 3 digits.' };
  }
  return { ok: true, value: `${groups.join('')}.${tail}` };
}

/** Non-negative whole number for stock quantities; null means "not tracked". */
export function parseQuantity(raw, { label = 'Stock quantity', required = false } = {}) {
  const text = raw === null || raw === undefined ? '' : String(raw).trim();
  if (!text) {
    return required ? { ok: false, error: `${label} is required.` } : { ok: true, value: null };
  }
  if (!/^\d+$/.test(text)) {
    return { ok: false, error: `${label} must be a whole number of 0 or more.` };
  }
  const n = Number(text);
  if (!Number.isSafeInteger(n) || n < 0) {
    return { ok: false, error: `${label} must be a whole number of 0 or more.` };
  }
  if (n > 1_000_000) {
    return { ok: false, error: `${label} looks too large — check the value.` };
  }
  return { ok: true, value: n };
}
