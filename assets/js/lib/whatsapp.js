/**
 * WhatsApp click-to-chat construction.
 *
 * Rules enforced here (and unit-tested):
 *  - the telephone number portion contains digits only, never `+`, spaces or
 *    punctuation;
 *  - the prefilled message is built from the live product record;
 *  - the whole message is percent-encoded so ₦, line breaks, commas and
 *    em-dashes survive;
 *  - if the number is unusable we return `null` and the caller renders a
 *    disabled button instead of a broken link.
 */

export const BUSINESS_WHATSAPP = '+2347018733485';

/** Digits only, E.164-style, no `+`. Nigerian numbers normalised to 234. */
export function normaliseWhatsAppNumber(raw) {
  if (!raw) return '';
  let value = String(raw).trim();
  const hadPlus = value.startsWith('+');
  value = value.replace(/[^\d]/g, '');
  if (!value) return '';
  // A local Nigerian number is 0 + 10 digits; the international form is the
  // country code 234 + those same 10 digits with the leading zero dropped.
  // Getting this wrong silently produces an 11-digit number that reaches nobody.
  if (!hadPlus && value.length === 11 && value.startsWith('0')) {
    value = `234${value.slice(1)}`;
  }
  return value;
}

/** @returns {string|null} 8–15 digit E.164 number without `+`, else null. */
export function validWhatsAppNumber(raw) {
  const digits = normaliseWhatsAppNumber(raw);
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

/**
 * Build the prefilled enquiry. Every field comes from the product record so a
 * price change is automatically reflected in the next message.
 */
export function buildOrderMessage(product, options = {}) {
  if (!product) return '';
  const {
    priceLabel = '',
    productUrl = '',
    variantLabel = '',
    businessName = "Muna's Haven",
    availabilityLabel = '',
  } = options;

  const lines = [];
  lines.push(`Hello ${businessName}! I'm interested in ordering:`);
  lines.push('');
  // A missing name is omitted, never printed as the word `undefined`: this text
  // is sent to the owner as-is and must read like a person wrote it.
  if (product.name) lines.push(`Product: ${product.name}`);
  if (product.reference) lines.push(`Product Reference: ${product.reference}`);
  if (priceLabel) lines.push(`Listed Price: ${priceLabel}`);
  if (product.category_name) lines.push(`Category: ${product.category_name}`);
  if (availabilityLabel) lines.push(`Availability shown: ${availabilityLabel}`);
  if (variantLabel) lines.push(`Selected option: ${variantLabel}`);
  if (productUrl) lines.push(`Product Link: ${productUrl}`);
  lines.push('');
  lines.push('Please confirm availability and the next steps for ordering.');
  lines.push('');
  lines.push('Thank you.');
  return lines.join('\n');
}

/**
 * @returns {{url:string, message:string, number:string}|null}
 */
export function buildWhatsAppLink({ number, message }) {
  const digits = validWhatsAppNumber(number);
  if (!digits || !message) return null;
  return {
    url: `https://wa.me/${digits}?text=${encodeURIComponent(message)}`,
    message,
    number: digits,
  };
}

/** A generic "chat with the shop" link, used in the header and footer. */
export function buildGeneralEnquiryLink(number, businessName = "Muna's Haven") {
  return buildWhatsAppLink({
    number,
    message: `Hello ${businessName}! I would like to ask about your products.\n\nThank you.`,
  });
}

/**
 * Convenience: full product enquiry link from a product record.
 * Returns null when the number or the price is unusable, so the UI can fail
 * gracefully rather than emit `wa.me/?text=`.
 */
export function productEnquiry(product, { number, businessName, priceLabel, productUrl, variantLabel, availabilityLabel }) {
  const message = buildOrderMessage(product, {
    priceLabel,
    productUrl,
    variantLabel,
    availabilityLabel,
    businessName,
  });
  return buildWhatsAppLink({ number: number || BUSINESS_WHATSAPP, message });
}
