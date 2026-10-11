/**
 * Product management: list, create, edit, publish, archive, delete, images,
 * variants and stock.
 *
 * Nothing is trusted from the form: the database re-checks price and quantity
 * ranges, unique references and the publish requirements, and RLS decides who
 * may write at all. Client-side validation exists to give a fast, clear
 * message on a phone — not as the security boundary.
 */

import { el, text, icon, clear } from '../lib/dom.js';
import { assetUrl } from '../lib/config.js';
import {
  button,
  field,
  input,
  textarea,
  select,
  checkbox,
  busy,
  toast,
  confirmDialog,
  statusBadge,
  formatDateTime,
  panel,
  emptyState,
  formValues,
  showFieldErrors,
} from './ui.js';
import { formatNaira, parseAmount, parseQuantity } from '../lib/money.js';
import { priceTag, availabilityInfo, AVAILABILITY_LABELS } from '../lib/products.js';
import { validateImageFile } from '../lib/api.js';

const AVAILABILITY_OPTIONS = Object.entries(AVAILABILITY_LABELS).map(([value, label]) => ({ value, label }));

export function renderProducts(app, cache) {
  const products = cache.products || [];
  const filter = app.productsFilter || 'all';
  const search = (app.productsSearch || '').toLowerCase();

  const rows = products
    .filter((p) => (filter === 'all' ? true : p.status === filter))
    .filter((p) =>
      !search
        ? true
        : [p.name, p.reference, p.category_name, p.description]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(search)),
    );

  const tabs = [
    ['all', `All (${products.length})`],
    ['published', `Published (${products.filter((p) => p.status === 'published').length})`],
    ['draft', `Draft (${products.filter((p) => p.status === 'draft').length})`],
    ['archived', `Archived (${products.filter((p) => p.status === 'archived').length})`],
  ];

  return el('div', {}, [
    el('div', { class: 'mh-page__head' }, [
      el('div', {}, [
        el('h1', { text: 'Products' }),
        el('p', { text: 'One record per product. Editing a price here changes the catalogue card, the product page and the next WhatsApp message together.' }),
      ]),
      el('div', { class: 'mh-page__actions' }, [
        button('Add a product', { variant: 'primary', icon: 'plus', onClick: () => app.navigate('/products/new') }),
      ]),
    ]),

    el('div', { class: 'mh-toolbar', style: 'margin-bottom:1rem' }, [
      (() => {
        const box = input('mh-product-search', app.productsSearch || '', {
          type: 'search',
          placeholder: 'Search name, reference or description…',
          'aria-label': 'Search products',
        });
        let timer = 0;
        box.addEventListener('input', () => {
          window.clearTimeout(timer);
          timer = window.setTimeout(() => {
            app.productsSearch = box.value;
            app.reload();
          }, 250);
        });
        return el('div', { class: 'mh-search' }, [icon('search'), box]);
      })(),
      el('div', { class: 'mh-filters', role: 'group', 'aria-label': 'Filter by status' }, tabs.map(([value, label]) =>
        el('button', {
          class: 'mh-chip',
          type: 'button',
          'aria-pressed': String(filter === value),
          text: label,
          onClick: () => {
            app.productsFilter = value;
            app.reload();
          },
        }),
      )),
    ]),

    rows.length === 0
      ? el('div', { class: 'mh-panel' }, [
          emptyState(
            products.length === 0 ? 'No products yet' : 'Nothing matches that filter',
            products.length === 0
              ? 'Add your first product, or run the starter catalogue migration to load the three approved listings.'
              : 'Try the All tab, or clear the search box.',
          ),
        ])
      : el('div', { class: 'mh-list' }, rows.map((product) => productRow(app, product))),
  ]);
}

function productRow(app, product) {
  const availability = availabilityInfo(product);
  return el('article', { class: 'mh-list-item' }, [
    el('img', {
      class: 'mh-thumb',
      src: assetUrl(product.image_url || 'assets/img/placeholder-product.svg'),
      alt: '',
      width: '42',
      height: '42',
      loading: 'lazy',
    }),
    el('div', { class: 'mh-list-item__body' }, [
      el('p', { class: 'mh-list-item__title', text: product.name }),
      el('div', { class: 'mh-list-item__row' }, [
        el('span', { class: 'mh-ref', text: product.reference }),
        statusBadge(product.status),
        el('span', { class: `mh-badge mh-badge--${availability.tone}`, text: availability.label }),
        product.image_is_illustrative ? el('span', { class: 'mh-badge mh-badge--gold', text: 'Placeholder image' }) : null,
      ]),
      el('div', { class: 'mh-list-item__row' }, [
        priceTag(product),
        product.category_name ? el('span', { class: 'mh-small mh-muted', text: product.category_name }) : null,
        product.stock_mode === 'quantity'
          ? el('span', { class: 'mh-small mh-muted', text: `${product.stock_quantity ?? 0} in stock` })
          : el('span', { class: 'mh-small mh-muted', text: 'Stock not tracked' }),
      ]),
    ]),
    el('div', { class: 'mh-list-item__actions' }, [
      button('Edit', { size: 'sm', icon: 'edit', onClick: () => app.navigate(`/products/${product.id}`) }),
      product.status !== 'published'
        ? button('Publish', { size: 'sm', variant: 'primary', onClick: () => quickStatus(app, product, 'published') })
        : button('Unpublish', { size: 'sm', onClick: () => quickStatus(app, product, 'draft') }),
      product.status !== 'archived'
        ? button('Archive', { size: 'sm', variant: 'ghost', onClick: () => quickStatus(app, product, 'archived') })
        : null,
      button('View page', { size: 'sm', variant: 'ghost', onClick: () => window.open(`${assetUrl('')}#/product/${encodeURIComponent(product.reference)}`, '_blank', 'noopener') }),
    ]),
  ]);
}

async function quickStatus(app, product, status) {
  const save = app.api.updateProduct(product.id, { status });
  const label = status === 'published' ? 'Published' : status === 'archived' ? 'Archived' : 'Moved back to draft';
  try {
    await save;
    toast(`${label}: ${product.name}`);
    await app.reload();
  } catch (error) {
    toast(error.message || 'That change was refused.', 'error');
  }
}

/* ------------------------------------------------------------------ editor -- */

export async function renderProductEditor(app, productId) {
  const isNew = !productId;
  const product = isNew ? null : await app.api.getOwnerProduct(productId);
  if (!isNew && !product) {
    return el('div', { class: 'mh-panel' }, [
      el('h2', { text: 'That product could not be found' }),
      el('p', { text: 'It may have been deleted. Return to the list and try again.' }),
      button('Back to products', { onClick: () => app.navigate('/products') }),
    ]);
  }

  const categories = app.cache.categories || [];
  const state = {
    draft: {
      reference: product?.reference || (isNew ? await suggestReference(app, categories[0]?.slug) : ''),
      name: product?.name || '',
      description: product?.description || '',
      price: product?.price || '',
      category_id: product?.category_id || '',
      status: product?.status || 'draft',
      availability: product?.availability || 'unknown',
      stock_mode: product?.stock_mode || 'untracked',
      stock_quantity: product?.stock_quantity ?? '',
      low_stock_threshold: product?.low_stock_threshold ?? '',
      is_featured: Boolean(product?.is_featured),
      is_new_arrival: Boolean(product?.is_new_arrival),
      image_url: product?.image_url || '',
      image_object_path: product?.image_object_path || '',
      image_alt: product?.image_alt || '',
      image_is_illustrative: product?.image_is_illustrative !== false,
      image_source_label: product?.image_source_label || '',
      image_licence_note: product?.image_licence_note || '',
    },
    // The owner query embeds variants, so editing does not need a second round-trip.
    variants: product ? (product.variants || []).map((v) => ({ ...v })) : [],
    pendingImage: null, // { file, previewUrl, uploaded }
    replacedPath: null,
  };

  const form = el('form', { class: 'mh-editor', novalidate: true });
  const feedback = el('div', {});

  /* --- identity ------------------------------------------------------- */
  const referenceInput = input('reference', state.draft.reference, {
    required: true,
    spellcheck: false,
    'aria-describedby': 'reference-help',
    pattern: 'MH-[A-Z0-9]{2,8}-[0-9]{3}',
  });
  const nameInput = input('name', state.draft.name, { required: true, maxlength: '120' });
  const descriptionInput = textarea('description', state.draft.description, { maxlength: '2000' });
  const priceInput = input('price', state.draft.price, {
    inputmode: 'decimal',
    required: true,
    'aria-describedby': 'price-help',
    placeholder: '28000',
  });
  const categorySelect = select('category_id', [{ value: '', label: 'Choose a category…' }, ...categories.map((c) => ({ value: c.id, label: c.name }))], state.draft.category_id, { required: true });

  /* --- availability + stock ------------------------------------------ */
  const availabilitySelect = select('availability', AVAILABILITY_OPTIONS, state.draft.availability);
  const stockModeSelect = select('stock_mode', [
    { value: 'untracked', label: 'Do not track a quantity (status only)' },
    { value: 'quantity', label: 'Track a quantity' },
  ], state.draft.stock_mode);
  const quantityInput = input('stock_quantity', state.draft.stock_quantity, { type: 'number', min: '0', step: '1', inputmode: 'numeric' });
  const thresholdInput = input('low_stock_threshold', state.draft.low_stock_threshold, { type: 'number', min: '0', max: '999', step: '1' });
  const stockFields = el('div', { hidden: state.draft.stock_mode !== 'quantity' }, [
    field({ label: 'Quantity in stock', id: 'stock_quantity', hint: 'Only what you have counted. Leave stock tracking off if you have not confirmed a number.', control: quantityInput }),
    field({ label: 'Warn me at or below', id: 'low_stock_threshold', hint: 'Optional. When the quantity is at or under this number, availability is set to “Low stock” automatically.', control: thresholdInput }),
  ]);
  stockModeSelect.addEventListener('change', () => {
    stockFields.hidden = stockModeSelect.value !== 'quantity';
  });

  /* --- merchandising -------------------------------------------------- */
  const featuredBox = checkbox('is_featured', state.draft.is_featured, 'Show as featured on the home page');
  const newArrivalBox = checkbox('is_new_arrival', state.draft.is_new_arrival, 'Show under “New arrivals”');

  /* --- image ---------------------------------------------------------- */
  const preview = el('div', { class: 'mh-image-preview' }, [
    el('img', { src: assetUrl(state.draft.image_url || 'assets/img/placeholder-product.svg'), alt: 'Current product image' }),
    el('span', { class: 'mh-image-preview__badge', text: state.draft.image_is_illustrative ? 'Illustrative placeholder' : 'Your own product photograph' }),
  ]);
  const fileInput = el('input', { type: 'file', id: 'mh-image-file', accept: 'image/jpeg,image/png,image/webp', 'aria-describedby': 'image-help' });
  const imageStatus = el('p', { class: 'mh-field__hint', id: 'image-help', text: 'JPEG, PNG or WebP, up to 5 MB. A phone photo works well: fill the frame, plain background, no text written on it.' });
  const dropzone = el('div', { class: 'mh-dropzone' }, [
    el('strong', { text: 'Choose a photo from this phone' }),
    el('br'),
    fileInput,
    el('p', { class: 'mh-field__hint', style: 'margin:.5rem 0 0', text: 'Uploading replaces the current image once you save. The old file is removed only if no other product uses it.' }),
  ]);
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.dataset.dragging = 'true';
  });
  dropzone.addEventListener('dragleave', () => {
    dropzone.dataset.dragging = 'false';
  });
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.dataset.dragging = 'false';
    const file = e.dataTransfer?.files?.[0];
    if (file) acceptImage(file);
  });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) acceptImage(file);
  });

  function setPreview(src, { illustrative } = {}) {
    clear(preview);
    preview.appendChild(el('img', { src, alt: 'Selected image preview' }));
    preview.appendChild(
      el('span', { class: 'mh-image-preview__badge', text: illustrative ? 'Illustrative placeholder' : 'New photo — will be saved with this product' }),
    );
  }

  function acceptImage(file) {
    const check = validateImageFile(file);
    if (!check.ok) {
      imageStatus.textContent = check.error;
      imageStatus.style.color = 'var(--mh-danger)';
      state.pendingImage = null;
      return;
    }
    imageStatus.textContent = 'Ready to upload when you save. Check it looks right in the preview above.';
    imageStatus.style.color = '';
    if (state.pendingImage?.previewUrl) URL.revokeObjectURL(state.pendingImage.previewUrl);
    state.pendingImage = { file, previewUrl: URL.createObjectURL(file), uploaded: null };
    setPreview(state.pendingImage.previewUrl, { illustrative: false });
  }

  const starterNote = el('p', { class: 'mh-field__hint', text: 'Tick this while the image is a stand-in rather than a photo of the real item. Customers then see that it is illustrative.' });
  const illustrativeBox = checkbox('image_is_illustrative', state.draft.image_is_illustrative, 'This image is illustrative, not a photograph of this item', 'Untick once you have uploaded a real photo of your own stock.');
  illustrativeBox.querySelector('input').addEventListener('change', (e) => {
    starterNote.textContent = e.target.checked
      ? 'While ticked, the storefront shows a clear “illustrative” note beside the image.'
      : 'Ticked off: the image is presented as your own product photograph. Only untick this for a real photo of your stock.';
  });
  const sourceLabelInput = input('image_source_label', state.draft.image_source_label || '', { maxlength: '120', placeholder: 'Illustrative placeholder — not a photograph of this item' });
  const licenceInput = input('image_licence_note', state.draft.image_licence_note || '', { maxlength: '240', placeholder: 'Where the image came from, and any permission or credit' });
  const altInput = input('image_alt', state.draft.image_alt || '', { maxlength: '200', placeholder: 'Full bob wig with a lace parting, on a stand' });

  /* --- variants ------------------------------------------------------- */
  const variantRows = el('div', { class: 'mh-variant-rows' });
  const renderVariants = () => {
    clear(variantRows);
    if (!state.variants.length) {
      variantRows.appendChild(
        el('p', { class: 'mh-field__hint', text: 'No options yet. Add a row only for something you actually stock — for example Size: 14 inches, or leave this empty.' }),
      );
      return;
    }
    state.variants.forEach((variant, index) => {
      const typeInput = input(`vt-${index}`, variant.option_type || '', { placeholder: 'Type, e.g. Size', list: 'mh-option-types', maxlength: '40' });
      const valueInput = input(`vv-${index}`, variant.option_value || '', { placeholder: 'Value, e.g. 14 inches', maxlength: '60' });
      const enabled = el('input', { type: 'checkbox', checked: variant.is_enabled !== false });
      variantRows.appendChild(
        el('div', { class: 'mh-variant-row' }, [
          typeInput,
          valueInput,
          el('div', { style: 'display:flex;align-items:center;gap:.4rem' }, [
            el('label', { class: 'mh-visually-hidden', text: 'Enabled' }),
            enabled,
            button('Remove', {
              size: 'sm',
              variant: 'ghost',
              onClick: () => {
                state.variants.splice(index, 1);
                renderVariants();
              },
            }),
          ]),
        ]),
      );
      typeInput.addEventListener('change', () => (variant.option_type = typeInput.value));
      valueInput.addEventListener('change', () => (variant.option_value = valueInput.value));
      enabled.addEventListener('change', () => (variant.is_enabled = enabled.checked));
    });
  };
  renderVariants();

  const addVariant = () => {
    state.variants.push({ option_type: '', option_value: '', is_enabled: true, position: state.variants.length });
    renderVariants();
  };

  /* --- assemble ------------------------------------------------------- */
  form.appendChild(
    panel('Product details', [
      feedback,
      el('div', { class: 'mh-row mh-row--2' }, [
        field({
          label: 'Product reference',
          id: 'reference',
          control: referenceInput,
          required: true,
          hint: 'Shown to customers and quoted in every WhatsApp enquiry. Format MH-CATEGORY-000, and it must be unique.',
        }),
        field({ label: 'Display name', id: 'name', control: nameInput, required: true }),
      ]),
      el('datalist', { id: 'mh-option-types' }, [
        el('option', { value: 'Size' }),
        el('option', { value: 'Colour' }),
        el('option', { value: 'Length' }),
        el('option', { value: 'Style' }),
      ]),
      field({
        label: 'Price in naira',
        id: 'price',
        control: priceInput,
        required: true,
        hint: 'Digits only — 28000 or 28,000. Stored as an exact amount, never as text, and shown as ₦28,000.',
      }),
      field({ label: 'Category', id: 'category_id', control: categorySelect, required: true }),
      field({
        label: 'Description',
        id: 'description',
        control: descriptionInput,
        hint: 'Only state what you have confirmed. Leave out length, density, metal or stone claims you have not verified — customers read this as fact.',
      }),
      el('p', { class: 'mh-field__hint', id: 'price-help', text: 'A published product needs a name, a price, a category, a description and an image. The database refuses the publish if any is missing.' }),
    ]),
  );

  form.appendChild(
    panel('Availability and stock', [
      field({ label: 'Availability shown to customers', id: 'availability', control: availabilitySelect, hint: '“Availability to be confirmed” is the honest choice while you have not counted stock.' }),
      field({ label: 'Stock tracking', id: 'stock_mode', control: stockModeSelect }),
      stockFields,
    ]),
  );

  form.appendChild(
    panel('Image', [
      el('div', { class: 'mh-image-edit' }, [preview, el('div', {}, [dropzone, imageStatus])]),
      field({ label: 'Alt text for the image', id: 'image_alt', control: altInput, hint: 'Read aloud by screen readers and shown if the image fails to load.' }),
      el('div', {}, [illustrativeBox, starterNote]),
      field({ label: 'Image source note (shown to customers)', id: 'image_source_label', control: sourceLabelInput, hint: 'Leave the default wording while this is a placeholder.' }),
      field({ label: 'Licence or permission record (owner note)', id: 'image_licence_note', control: licenceInput, hint: 'Who took it, or where you have permission to use it. Kept in the database, not shown on the shop front.' }),
    ]),
  );

  form.appendChild(
    panel('Options', [
      el('p', { class: 'mh-small mh-muted', style: 'margin:0 0 .75rem', text: 'Add only what you really stock. These appear as choices on the product page and are included in the WhatsApp message when a customer picks one.' }),
      variantRows,
      el('p', { style: 'margin:.75rem 0 0' }, [button('Add an option', { size: 'sm', icon: 'plus', onClick: addVariant })]),
    ]),
  );

  form.appendChild(panel('On the home page', [el('div', {}, [featuredBox, newArrivalBox])]));

  const publishRow = el('div', { class: 'mh-row mh-row--2' }, [
    field({
      label: 'Visibility',
      id: 'status',
      control: select('status', [
        { value: 'draft', label: 'Draft — hidden from customers' },
        { value: 'published', label: 'Published — visible in the catalogue' },
        { value: 'archived', label: 'Archived — kept for history, hidden' },
      ], state.draft.status),
      hint: 'Only published products are readable by a visitor, and the database filters that — not the website.',
    }),
  ]);
  form.appendChild(panel('Publishing', [publishRow]));

  const saveButton = button(isNew ? 'Create product' : 'Save changes', { variant: 'primary', type: 'submit' });
  const saveBar = el('div', { class: 'mh-savebar' }, [
    isNew ? button('Cancel', { variant: 'ghost', onClick: () => app.navigate('/products') }) : null,
    !isNew && product.status !== 'archived'
      ? button('Archive', { variant: 'ghost', onClick: async () => {
          const yes = await confirmDialog({
            title: `Archive “${product.name}”?`,
            body: 'It disappears from the catalogue and from search, and can be published again later. Order history keeps its own copy of the name and price.',
            confirmLabel: 'Archive it',
          });
          if (!yes) return;
          try {
            await app.api.updateProduct(product.id, { status: 'archived' });
            toast('Product archived.');
            await app.reload();
          } catch (error) {
            toast(error.message || 'Could not archive that product.', 'error');
          }
        } })
      : null,
    !isNew
      ? button('Delete permanently', { variant: 'danger', onClick: () => deleteProduct(app, product, feedback) })
      : null,
    saveButton,
  ]);
  form.appendChild(saveBar);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clear(feedback);

    const values = formValues(form);
    const errors = {};

    const price = parseAmount(values.price, { label: 'Price' });
    if (!price.ok) errors.price = price.error;

    const reference = String(values.reference || '').trim().toUpperCase();
    if (!/^MH-[A-Z0-9]{2,8}-[0-9]{3}$/.test(reference)) {
      errors.reference = 'Use the format MH-CATEGORY-000, for example MH-HAIR-001.';
    }

    if (!String(values.name || '').trim()) errors.name = 'A display name is required.';
    if (!values.category_id) errors.category_id = 'Choose a category.';

    let quantity = { ok: true, value: null };
    if (values.stock_mode === 'quantity') {
      quantity = parseQuantity(values.stock_quantity, { label: 'Quantity', required: true });
      if (!quantity.ok) errors.stock_quantity = quantity.error;
    }

    const wantsPublish = values.status === 'published';
    if (wantsPublish && !String(values.description || '').trim()) {
      errors.description = 'A published product needs a description. Add one, or save as a draft.';
    }
    const hasImage = Boolean(
      state.pendingImage?.file || state.draft.image_url || product?.image_url || product?.image_object_path,
    );
    if (wantsPublish && !hasImage) {
      errors.image_alt = 'A published product needs an image. Upload a photo, or keep it as a draft for now.';
    }

    if (Object.keys(errors).length) {
      showFieldErrors(form, errors);
      return;
    }
    if (reference && (await app.api.referenceExists(reference, product?.id))) {
      feedback.appendChild(
        el('p', { class: 'mh-notice mh-notice--error', role: 'alert', text: 'Another product already uses that reference. Pick the next free number.' }),
      );
      return;
    }

    busy(saveButton, true, 'Saving…');
    try {
      let savedImage = {
        url: values.image_url || '',
        path: state.draft.image_object_path || '',
      };
      if (state.pendingImage?.file) {
        const uploaded = await app.api.uploadImage(state.pendingImage.file);
        savedImage = { url: uploaded.url, path: uploaded.path };
      }

      const payload = {
        reference,
        name: String(values.name).trim(),
        description: String(values.description || '').trim(),
        price: price.value,
        category_id: values.category_id || null,
        status: values.status,
        availability: values.availability,
        stock_mode: values.stock_mode,
        stock_quantity: quantity.value,
        low_stock_threshold: values.low_stock_threshold === '' ? null : Number(values.low_stock_threshold),
        is_featured: Boolean(values.is_featured),
        is_new_arrival: Boolean(values.is_new_arrival),
        image_url: savedImage.url,
        image_object_path: savedImage.path,
        image_alt: String(values.image_alt || '').trim() || null,
        image_is_illustrative: Boolean(values.image_is_illustrative),
        image_source_label: String(values.image_source_label || '').trim() || null,
        image_licence_note: String(values.image_licence_note || '').trim() || null,
      };
      if (payload.image_is_illustrative && !payload.image_source_label) {
        payload.image_source_label = 'Illustrative placeholder — not a photograph of this item';
      }

      const saved = isNew
        ? await app.api.createProduct(payload)
        : await app.api.updateProduct(product.id, payload);

      if (!isNew) {
        await app.api.saveVariants(product.id, state.variants.filter((v) => v.option_type && v.option_value));
        // Old file is released only after the new row is committed, and the
        // database still refuses if another product points at it.
        if (state.pendingImage?.file && state.draft.image_object_path && state.draft.image_object_path !== savedImage.path) {
          const result = await app.api.cleanupImage(state.draft.image_object_path);
          if (result === 'still-in-use') {
            feedback.appendChild(el('p', { class: 'mh-notice mh-notice--info', text: 'Your new photo is saved. The previous file stayed in Storage because another product still uses it.' }));
          }
        }
      }

      if (state.pendingImage?.previewUrl) URL.revokeObjectURL(state.pendingImage.previewUrl);
      state.pendingImage = null;

      toast(isNew ? `Created ${saved.reference}.` : `Saved ${saved.reference}.`);
      await app.reload();
      app.navigate('/products');
    } catch (error) {
      busy(saveButton, false);
      const node = el('p', { class: 'mh-notice mh-notice--error', role: 'alert' });
      node.appendChild(text(error.message || 'The save failed.'));
      feedback.appendChild(node);
      if (error.detail) {
        feedback.appendChild(el('p', { class: 'mh-field__hint', text: `Database detail: ${error.detail}` }));
      }
      return;
    }
    busy(saveButton, false);
  });

  if (app.api.mode === 'demo') {
    form.prepend(
      el('p', { class: 'mh-notice-strip' }, [
        icon('alert'),
        el('span', { text: 'Preview mode: this form is live but cannot save, because the store database is not connected. Fill it in to see how it behaves.' }),
      ]),
    );
  }

  return el('div', {}, [
    el('div', { class: 'mh-page__head' }, [
      el('div', {}, [
        el('p', { class: 'mh-eyebrow' }, [el('a', { href: '#/products', style: 'text-decoration:none', text: 'Products' })]),
        el('h1', { text: isNew ? 'Add a product' : product.name }),
        el('p', { text: isNew ? 'Save as a draft first if you are not ready to show it.' : `Reference ${product.reference} · last changed ${formatDateTime(product.updated_at)}` }),
      ]),
      !isNew
        ? el('div', { class: 'mh-page__actions' }, [
            button('Open public page', {
              size: 'sm',
              variant: 'ghost',
              onClick: () => window.open(`${assetUrl('')}#/product/${encodeURIComponent(product.reference)}`, '_blank', 'noopener'),
            }),
          ])
        : null,
    ]),
    form,
  ]);
}

async function deleteProduct(app, product, feedback) {
  clear(feedback);
  const typed = await confirmDialog({
    title: `Delete “${product.name}” permanently?`,
    body: 'This removes the product record and its reference. Recorded orders keep their own copy of the name and the price they were made at, so your history stays readable — but the product page will stop working for anyone holding the link. To hide a product but keep it, use Archive instead.',
    confirmLabel: 'Delete it permanently',
    danger: true,
    detail: el('p', { class: 'mh-notice mh-notice--info', text: `Type the reference ${product.reference} below to confirm.` }),
  });
  if (!typed) return;
  try {
    await app.api.deleteProduct(product.id);
    toast(`${product.reference} deleted.`);
    await app.reload();
    app.navigate('/products');
  } catch (error) {
    toast(error.message || 'The deletion was refused.', 'error');
  }
}

async function suggestReference(app, categorySlug) {
  try {
    return await app.api.nextReference(categorySlug || 'gen');
  } catch {
    return 'MH-NEW-001';
  }
}
