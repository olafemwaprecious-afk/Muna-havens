/**
 * Store settings and categories.
 *
 * Only public-facing store information lives on this screen. Customer phone
 * numbers, order notes and image licence records belong to their own tables and
 * their own screens; nothing private is ever written into a field a visitor can
 * read. Every column edited here has a matching check in the database, so a
 * hand-crafted request cannot bypass what this form enforces.
 */

import { el, text, clear } from '../lib/dom.js';
import {
  button,
  field,
  input,
  textarea,
  busy,
  toast,
  panel,
  formValues,
  showFieldErrors,
  confirmDialog,
} from './ui.js';
import { normaliseWhatsAppNumber, validWhatsAppNumber } from '../lib/whatsapp.js';

/* Column limits are copied from mh_store_settings so the form refuses what the
   database would refuse, instead of showing a save error after the fact. */
const LIMITS = {
  business_name: 80,
  public_description: 400,
  delivery_notice: 160,
  referral_notice: 160,
  contact_email: 160,
  instagram_handle: 30,
};

export async function renderSettings(app, cache) {
  const settings = cache.settings || {};

  const businessName = input('business_name', settings.business_name || '', { maxlength: LIMITS.business_name, required: true });
  const description = textarea('public_description', settings.public_description || '', { maxlength: LIMITS.public_description });
  const whatsapp = input('whatsapp_number', settings.whatsapp_number || '', {
    inputmode: 'tel',
    maxlength: '20',
    placeholder: '+234 701 873 3485',
    required: true,
  });
  const deliveryNotice = input('delivery_notice', settings.delivery_notice || 'Delivery: Coming soon.', { maxlength: LIMITS.delivery_notice });
  const referralNotice = input('referral_notice', settings.referral_notice || 'Referral programme: Coming soon.', { maxlength: LIMITS.referral_notice });
  const contactEmail = input('contact_email', settings.contact_email || '', { type: 'email', maxlength: LIMITS.contact_email, placeholder: 'orders@example.com' });
  const instagram = input('instagram_handle', settings.instagram_handle || '', { maxlength: LIMITS.instagram_handle, placeholder: 'munashaven', spellcheck: false });

  const whatsappPreview = el('p', { class: 'mh-field__hint' });
  const updatePreview = () => {
    const normalised = normaliseWhatsAppNumber(whatsapp.value);
    if (normalised && validWhatsAppNumber(normalised)) {
      whatsappPreview.textContent = `Enquiry links will open WhatsApp for +${normalised.replace(/^\+/, '')}.`;
      whatsappPreview.style.color = '';
    } else {
      whatsappPreview.textContent = 'That number is not usable yet — type it as 0701…, 234… or +234…';
      whatsappPreview.style.color = 'var(--mh-danger)';
    }
  };
  whatsapp.addEventListener('input', updatePreview);
  updatePreview();

  const feedback = el('div', {});
  const save = button('Save store settings', { variant: 'primary', type: 'submit' });
  const form = el('form', { novalidate: true, class: 'mh-editor' }, [
    panel('What customers read', [
      feedback,
      field({ label: 'Business name', id: 'business_name', control: businessName, required: true, hint: 'Header, footer, page titles and the share message.' }),
      field({
        label: 'Shop description',
        id: 'public_description',
        control: description,
        hint: 'Plain wording about the shop itself. Do not state a stock count, a delivery time or a material you have not confirmed.',
      }),
      field({
        label: 'Delivery notice',
        id: 'delivery_notice',
        control: deliveryNotice,
        hint: 'Shown wherever a customer would otherwise assume a delivery promise. Keep “Coming soon.” until there is a real arrangement.',
      }),
      field({
        label: 'Referral programme notice',
        id: 'referral_notice',
        control: referralNotice,
        hint: 'Printed where the referral programme will appear. Leave the “Coming soon.” wording until that programme is actually built.',
      }),
    ]),
    panel('Where enquiries go', [
      field({
        label: 'WhatsApp number for enquiries',
        id: 'whatsapp_number',
        control: whatsapp,
        required: true,
        hint: 'Stored in international format. The storefront restores the + when it builds each link.',
      }),
      whatsappPreview,
      el('div', { class: 'mh-row mh-row--2' }, [
        field({ label: 'Contact email (optional)', id: 'contact_email', control: contactEmail, hint: 'Shown in the footer only if you set it.' }),
        field({ label: 'Instagram handle (optional)', id: 'instagram_handle', control: instagram, hint: 'Without the @, or with it — either is accepted.' }),
      ]),
    ]),
    el('div', { class: 'mh-savebar' }, [save]),
  ]);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clear(feedback);
    const values = formValues(form);
    const normalised = normaliseWhatsAppNumber(values.whatsapp_number);
    const errors = {};

    if (!String(values.business_name || '').trim()) errors.business_name = 'A business name is required.';
    if (!normalised || !validWhatsAppNumber(normalised)) {
      errors.whatsapp_number = 'Enter a usable number, for example 07018733485 or +2347018733485.';
    }
    if (values.contact_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.contact_email)) {
      errors.contact_email = 'That email address does not look complete.';
    }
    if (values.instagram_handle && !/^@?[A-Za-z0-9._]{1,30}$/.test(values.instagram_handle)) {
      errors.instagram_handle = 'Use letters, numbers, full stop or underscore only.';
    }
    for (const [key, max] of Object.entries(LIMITS)) {
      if (String(values[key] || '').length > max) errors[key] = `Keep this under ${max} characters.`;
    }

    if (Object.keys(errors).length) {
      showFieldErrors(form, errors);
      return;
    }

    busy(save, true, 'Saving…');
    try {
      await app.api.saveStoreSettings({
        business_name: String(values.business_name).trim(),
        whatsapp_number: `+${normalised.replace(/^\+/, '')}`,
        public_description: String(values.public_description || '').trim(),
        delivery_notice: String(values.delivery_notice || '').trim() || 'Delivery: Coming soon.',
        referral_notice: String(values.referral_notice || '').trim() || 'Referral programme: Coming soon.',
        contact_email: String(values.contact_email || '').trim() || null,
        instagram_handle: String(values.instagram_handle || '').trim().replace(/^@/, '') || null,
      });
      toast('Store settings saved. The storefront shows them on the next load.');
      await app.reload();
    } catch (error) {
      feedback.appendChild(el('p', { class: 'mh-notice mh-notice--error', role: 'alert', text: error.message || 'Could not save the settings.' }));
      if (error.detail) {
        feedback.appendChild(el('p', { class: 'mh-field__hint', text: `Database detail: ${error.detail}` }));
      }
    } finally {
      busy(save, false);
    }
  });

  if (app.api.mode === 'demo') {
    form.prepend(
      el('p', { class: 'mh-notice-strip' }, [
        el('span', { text: 'Preview mode: this form is live but cannot save, because the store database is not connected.' }),
      ]),
    );
  }

  return el('div', {}, [
    el('div', { class: 'mh-page__head' }, [
      el('div', {}, [
        el('h1', { text: 'Store settings' }),
        el('p', { text: 'The wording customers read, and the number every enquiry goes to.' }),
      ]),
    ]),
    form,
    await renderCategories(app, cache.categories || []),
  ]);
}

/* ------------------------------------------------------------ categories -- */

async function renderCategories(app, categories) {
  const rows = el('div', { class: 'mh-list' });
  const nameInput = input('mh-new-category-name', '', { placeholder: 'e.g. Human hair', maxlength: '60' });
  const slugInput = input('mh-new-category-slug', '', { placeholder: 'human-hair', maxlength: '60', spellcheck: false });
  const feedback = el('div', {});

  nameInput.addEventListener('input', () => {
    if (slugInput.dataset.touched === 'true') return;
    slugInput.value = slugify(nameInput.value);
  });
  slugInput.addEventListener('input', () => {
    slugInput.dataset.touched = 'true';
  });

  const draw = () => {
    clear(rows);
    if (!categories.length) {
      rows.appendChild(
        el('p', { class: 'mh-muted', style: 'margin:0', text: 'No categories yet. A product cannot be published until it belongs to one.' }),
      );
      return;
    }
    for (const category of categories) {
      const count = countProducts(app, category);
      const active = el('input', { type: 'checkbox', checked: category.is_active !== false, id: `mh-cat-${category.id}` });
      rows.appendChild(
        el('div', { class: 'mh-list-item' }, [
          el('div', { class: 'mh-list-item__body' }, [
            el('p', { class: 'mh-list-item__title', text: category.name }),
            el('p', {
              class: 'mh-small mh-muted',
              style: 'margin:0',
              text: `Address part “${category.slug}” · ${count} product(s)${category.description ? ` · ${category.description}` : ''}`,
            }),
          ]),
          el('label', { class: 'mh-checkbox', for: `mh-cat-${category.id}` }, [
            el('span', { text: 'Shown in the catalogue filter' }),
            active,
          ]),
          button('Save', {
            size: 'sm',
            onClick: async () => {
              try {
                await app.api.updateCategory(category.id, { is_active: active.checked });
                toast(active.checked ? `“${category.name}” appears in the catalogue filter again.` : `“${category.name}” is hidden from the catalogue filter. Its products stay listed under All.`);
                await app.reload();
              } catch (error) {
                toast(error.message || 'That change was refused.', 'error');
              }
            },
          }),
          count === 0
            ? button('Delete', {
                size: 'sm',
                variant: 'danger',
                onClick: async () => {
                  const yes = await confirmDialog({
                    title: `Delete the category “${category.name}”?`,
                    body: 'Only an empty category can be deleted, and this one has no products, so nothing else changes. This cannot be undone from the dashboard.',
                    confirmLabel: 'Delete category',
                    danger: true,
                  });
                  if (!yes) return;
                  try {
                    await app.api.deleteCategory(category.id);
                    toast('Category deleted.');
                    await app.reload();
                  } catch (error) {
                    toast(error.message || 'That category could not be deleted.', 'error');
                  }
                },
              })
            : null,
        ]),
      );
    }
  };
  draw();

  async function create() {
    clear(feedback);
    const name = String(nameInput.value || '').trim();
    const slug = slugify(slugInput.value || nameInput.value);
    const errors = {};
    if (!name) errors.name = 'Give the category a name.';
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      errors.slug = 'Lower-case letters, numbers and single hyphens only, e.g. human-hair.';
    }
    if (categories.some((c) => c.slug === slug)) errors.slug = 'That address part is already used by another category.';
    if (Object.keys(errors).length) {
      feedback.appendChild(
        el('p', { class: 'mh-notice mh-notice--error', role: 'alert', text: errors.name || errors.slug }),
      );
      return;
    }

    try {
      await app.api.createCategory({ name, slug, is_active: true, display_order: (categories.length + 1) * 10 });
      nameInput.value = '';
      slugInput.value = '';
      slugInput.dataset.touched = '';
      toast(`Category “${name}” added.`);
      await app.reload();
    } catch (error) {
      feedback.appendChild(el('p', { class: 'mh-notice mh-notice--error', role: 'alert', text: error.message || 'That category could not be added.' }));
    }
  }

  return panel('Categories', [
    el('p', {
      class: 'mh-small mh-muted',
      style: 'margin:0 0 .75rem',
      text: 'Every product belongs to exactly one category and must have one before it can be published. The address part is what the catalogue filter uses, and it must stay unique.',
    }),
    rows,
    el('div', { style: 'margin-top:1rem' }, [
      feedback,
      el('div', { class: 'mh-row mh-row--2' }, [
        field({ label: 'Name', id: 'mh-new-category-name', control: nameInput }),
        field({ label: 'Address part', id: 'mh-new-category-slug', control: slugInput, hint: 'Filled in from the name unless you change it.' }),
      ]),
      button('Add category', { variant: 'primary', size: 'sm', icon: 'plus', onClick: create }),
    ]),
  ]);
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function countProducts(app, category) {
  return (app.cache.products || []).filter((p) => p.category_id === category.id || p.category_slug === category.slug).length;
}
