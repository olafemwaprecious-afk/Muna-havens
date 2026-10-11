/**
 * Data layer.
 *
 * Two implementations behind one interface:
 *   live  — Supabase PostgREST with Row Level Security deciding what is
 *           visible. The browser only ever asks for published rows; RLS is
 *           what actually enforces it.
 *   demo  — bundled JSON, used when `assets/js/config.js` has not been
 *           generated, so the design can be reviewed before credentials
 *           exist. It is labelled in the UI and cannot write.
 *
 * Prices are transported as strings so no float conversion happens here.
 */

import { loadConfig, assetUrl } from './config.js';

/**
 * Public reads hit `mh_public_*` VIEWS, which carry no foreign keys, so a
 * PostgREST embed (`category:(...)`) cannot resolve through them. Category
 * labels are already joined inside the view; variants come from
 * `mh_public_product_variants` in one extra round trip.
 */
const IMAGE_BUCKET = 'muna-haven-product-images';

/** Mirrors mh_products_reference_format in the database. */
const REFERENCE_PATTERN = /^MH-[A-Z0-9]{2,8}-[0-9]{3}$/;

/** Max 5 MiB, matching the bucket limit. A client check for a fast message, not for safety. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function validateImageFile(file) {
  if (!file) return { ok: false, error: 'Choose an image file.' };
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { ok: false, error: 'Product images must be JPEG, PNG or WebP.' };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: 'That image is larger than 5 MB. Choose a smaller export from your phone camera.' };
  }
  if (file.size === 0) return { ok: false, error: 'That file is empty.' };
  return { ok: true };
}

const PUBLIC_PRODUCT_SELECT = [
  'id',
  'reference',
  'name',
  'slug',
  'description',
  'price',
  'currency',
  'availability',
  'is_featured',
  'is_new_arrival',
  'first_seen_at',
  'published_at',
  'image_url',
  'image_alt',
  'image_is_illustrative',
  'image_source_label',
  'category_slug',
  'category_name',
].join(',');

const OWNER_PRODUCT_SELECT = [
  'id',
  'reference',
  'name',
  'slug',
  'description',
  'price',
  'currency',
  'category_id',
  'status',
  'availability',
  'stock_mode',
  'stock_quantity',
  'low_stock_threshold',
  'image_url',
  'image_object_path',
  'image_alt',
  'image_is_illustrative',
  'image_source_label',
  'image_licence_note',
  'is_featured',
  'is_new_arrival',
  'first_seen_at',
  'published_at',
  'created_at',
  'updated_at',
  // A real foreign key, so PostgREST can embed it — unlike the public views.
  'category:mh_product_categories(id,slug,name)',
  'variants:mh_product_variants(id,product_id,option_type,option_value,position,is_enabled)',
].join(',');

/**
 * Flattens the category embed so an owner row and a public row look identical
 * to the UI. Without this the dashboard would need to know which of the two
 * shapes it was given, which is exactly the kind of detail that rots.
 */
export function normaliseProductRow(row) {
  if (!row) return row;
  const category = row.category || row.mh_product_categories || null;
  const out = { ...row };
  delete out.category;
  delete out.mh_product_categories;
  if (category) {
    out.category_slug = category.slug ?? null;
    out.category_name = category.name ?? null;
  }
  out.variants = (row.variants || []).slice().sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0) || String(a.option_value).localeCompare(String(b.option_value)),
  );
  return out;
}

export class DataError extends Error {
  constructor(message, { kind = 'network', detail = '' } = {}) {
    super(message);
    this.name = 'DataError';
    this.kind = kind;
    this.detail = detail;
  }
}

export function createDataLayer() {
  const config = loadConfig();
  if (config.mode === 'supabase') return liveLayer(config);
  return demoLayer();
}

/* ------------------------------------------------------------------ live -- */

function liveLayer(config) {
  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    throw new DataError('The Supabase client did not load.', { kind: 'config' });
  }
  const client = window.supabase.createClient(config.supabaseUrl, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'muna-haven-auth',
    },
    realtime: { params: { eventsPerSecond: 2 } },
  });

  let realtimeChannel = null;

  return {
    mode: 'supabase',
    client,
    config,

    /** Owner view of the settings row: private columns included. */
    async getOwnerStoreSettings() {
      const { data, error } = await client
        .from('mh_store_settings')
        .select('*')
        .eq('id', 1)
        .maybeSingle();
      if (error) throw translateError(error);
      return data || null;
    },

    async getStoreSettings() {
      const { data, error } = await client
        .from('mh_store_settings')
        .select('business_name,whatsapp_number,public_description,delivery_notice,referral_notice,updated_at')
        .eq('id', 1)
        .maybeSingle();
      if (error) throw translateError(error);
      return data || null;
    },

    async listCategories() {
      const { data, error } = await client
        .from('mh_product_categories')
        .select('id,slug,name,description,display_order')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      if (error) throw translateError(error);
      return data || [];
    },

    async listPublicProducts({ category = '', featured = false, limit = 0, search = '' } = {}) {
      let query = client
        .from('mh_public_products')
        .select(PUBLIC_PRODUCT_SELECT)
        .order('is_featured', { ascending: false })
        .order('first_seen_at', { ascending: false })
        .order('name', { ascending: true });
      if (category) query = query.eq('category_slug', category);
      if (featured) query = query.eq('is_featured', true);
      if (search) {
        const needle = sanitizeSearch(search);
        query = query.or(`name.ilike.%${needle}%,reference.ilike.%${needle}%,description.ilike.%${needle}%`);
      }
      if (limit) query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw translateError(error);
      const products = (data || []).map(normaliseProduct);
      return await attachPublicVariants(client, products);
    },

    async getProductByReference(reference) {
      const clean = String(reference || '').trim();
      if (!clean) return null;
      const { data, error } = await client
        .from('mh_public_products')
        .select(`${PUBLIC_PRODUCT_SELECT},variants:mh_public_variants(id,option_type,option_value,position)`)
        .eq('reference', clean)
        .maybeSingle();
      if (error) throw translateError(error);
      if (!data) {
        // "Exists but unpublished" and "does not exist" are intentionally
        // indistinguishable here: RLS removes the row either way, so a visitor
        // cannot probe which references exist. The owner dashboard shows the
        // true status.
        return null;
      }
      const [withVariants] = await attachPublicVariants(client, [normaliseProduct(data)]);
      return withVariants;
    },

    /**
     * Optional convenience only. Realtime can miss updates (closed tab,
     * dropped connection, sleep), so the UI always keeps a manual refresh and
     * never claims that a change was pushed instantly.
     */
    subscribeProducts(onChange) {
      if (!config.realtime || typeof client.channel !== 'function') return () => {};
      if (realtimeChannel) return () => {};
      realtimeChannel = client
        .channel('mh-products-public')
        .on('postgres_changes', PRODUCT_TOPIC, () => onChange({ source: 'realtime' }))
        .subscribe();
      return () => {
        if (realtimeChannel) client.removeChannel(realtimeChannel);
        realtimeChannel = null;
      };
    },

    /* ------------------------------------------------------------- owner -- */

    async authSession() {
      const { data, error } = await client.auth.getSession();
      if (error) throw translateError(error);
      return data?.session || null;
    },

    async signIn({ email, password }) {
      const { data, error } = await client.auth.signInWithPassword({
        email: String(email || '').trim(),
        password: String(password || ''),
      });
      if (error) throw new DataError(genericSignInFailure(), { kind: 'auth' });
      return data?.session || null;
    },

    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) throw translateError(error);
    },

    async requestPasswordReset(email) {
      const { error } = await client.auth.resetPasswordForEmail(String(email || '').trim(), {
        redirectTo: `${config.siteUrl}/owner/`,
      });
      // Supabase returns a generic error when rate limited; never reveal
      // whether the address exists.
      if (error) throw new DataError('If that email is registered, a reset link has been sent. Please check your inbox, including Spam.', { kind: 'auth' });
      return true;
    },

    async onUpdate(cb) {
      client.auth.onAuthStateChange((_event, session) => cb(session));
    },

    async listOwnerProducts({ includeArchived = true } = {}) {
      let query = client
        .from('mh_products')
        .select(OWNER_PRODUCT_SELECT)
        .order('updated_at', { ascending: false });
      if (!includeArchived) query = query.neq('status', 'archived');
      const { data, error } = await query;
      if (error) throw translateError(error);
      return (data || []).map(normaliseProduct);
    },

    async getOwnerProduct(id) {
      const { data, error } = await client
        .from('mh_products')
        .select(OWNER_PRODUCT_SELECT)
        .eq('id', id)
        .maybeSingle();
      if (error) throw translateError(error);
      return data ? normaliseProduct(data) : null;
    },

    async createProduct(payload) {
      const { data, error } = await client.from('mh_products').insert(payload).select().single();
      if (error) throw translateError(error);
      return normaliseProduct(data);
    },

    async updateProduct(id, patch) {
      const { data, error } = await client.from('mh_products').update(patch).eq('id', id).select().single();
      if (error) throw translateError(error);
      return normaliseProduct(data);
    },

    async deleteProduct(id) {
      const { error } = await client.from('mh_products').delete().eq('id', id);
      if (error) throw translateError(error);
      return true;
    },

    async referenceExists(reference, exceptId = null) {
      let query = client.from('mh_products').select('id').eq('reference', reference).limit(1);
      if (exceptId) query = query.neq('id', exceptId);
      const { data, error } = await query;
      if (error) throw translateError(error);
      return Boolean(data && data.length);
    },

    /**
     * Suggests the next reference. The database function is the authority, so a
     * suggestion produced here is what the server would produce; if the RPC is
     * unavailable (an older migration), a locally computed guess is offered and
     * the unique constraint still has the final say on save.
     */
    async nextReference(categorySlug) {
      const { data, error } = await client.rpc('mh_next_reference', { p_category_slug: categorySlug || 'gen' });
      const candidate = typeof data === 'string' ? data.trim() : '';
      if (!error && REFERENCE_PATTERN.test(candidate)) return candidate;

      const segment = String(categorySlug || 'gen')
        .replace(/[^a-z0-9]/gi, '')
        .toUpperCase()
        .slice(0, 6)
        .padEnd(2, 'X');
      const prefix = `MH-${segment}-`;
      const { data: rows, error: listError } = await client
        .from('mh_products')
        .select('reference')
        .like('reference', `${prefix}*`)
        .order('reference', { ascending: false })
        .limit(1);
      if (listError) throw translateError(listError);
      const last = rows?.[0]?.reference;
      const n = last ? Number(String(last).slice(prefix.length)) || 0 : 0;
      return `${prefix}${String(n + 1).padStart(3, '0')}`;
    },

    /**
     * Upload only. Saving the product row is a separate step, and the old
     * object is cleaned up afterwards via the guarded RPC — so an upload can
     * never leave a product pointing at a file that has already been removed.
     */
    async uploadImage(file) {
      validateImageFile(file);
      const path = buildStoragePath(file, null);
      const { data, error } = await client.storage
        .from(IMAGE_BUCKET)
        .upload(path, file, { cacheControl: '31536000', upsert: false, contentType: file.type });
      if (error) throw translateError(error);
      const { data: pub } = client.storage.from(IMAGE_BUCKET).getPublicUrl(data.path);
      return { path: data.path, url: pub?.publicUrl || null };
    },

    /** Owner-only, database-guarded: refuses while any product still references it. */
    async cleanupImage(path) {
      if (!path) return 'not-requested';
      const { data, error } = await client.rpc('mh_delete_unreferenced_image', { p_object_path: path });
      if (error) throw translateError(error);
      return data || 'unknown';
    },

    /* --------------------------------------------------------- categories -- */

    async listAllCategories() {
      const { data, error } = await client
        .from('mh_product_categories')
        .select('id,slug,name,description,display_order,is_active')
        .order('display_order', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw translateError(error);
      return data || [];
    },

    async createCategory(payload) {
      const { data, error } = await client.from('mh_product_categories').insert(payload).select().single();
      if (error) throw translateError(error);
      return data;
    },

    async deleteCategory(id) {
      const { error } = await client.from('mh_product_categories').delete().eq('id', id);
      if (error) throw translateError(error);
      return true;
    },

    async updateCategory(id, patch) {
      const { data, error } = await client.from('mh_product_categories').update(patch).eq('id', id).select().single();
      if (error) throw translateError(error);
      return data;
    },

    /* ----------------------------------------------------------- variants -- */

    async listVariants(productId) {
      const { data, error } = await client
        .from('mh_product_variants')
        .select('id,product_id,option_type,option_value,position,is_enabled')
        .eq('product_id', productId)
        .order('option_type', { ascending: true })
        .order('position', { ascending: true });
      if (error) throw translateError(error);
      return data || [];
    },

    /**
     * Replaces the variant list for one product. Rows are matched on their
     * natural key (option_type + option_value) so a re-save cannot duplicate a
     * size or colour, and the database unique constraint is the backstop.
     */
    async saveVariants(productId, rows) {
      const existing = await this.listVariants(productId);
      const wanted = (rows || []).filter((r) => r.option_type && r.option_value);
      const key = (r) => `${String(r.option_type).trim().toLowerCase()}::${String(r.option_value).trim().toLowerCase()}`;
      const existingByKey = new Map(existing.map((row) => [key(row), row]));
      const wantedKeys = new Set(wanted.map(key));

      const toCreate = wanted.filter((row) => !existingByKey.has(key(row)));
      const toUpdate = wanted.filter((row) => {
        const prior = existingByKey.get(key(row));
        return prior && (Boolean(prior.is_enabled) !== Boolean(row.is_enabled !== false) || Number(prior.position || 0) !== Number(row.position || 0));
      });
      const toDelete = existing.filter((row) => !wantedKeys.has(key(row))).map((row) => row.id);

      if (toCreate.length) {
        const { error } = await client
          .from('mh_product_variants')
          .insert(toCreate.map((row) => ({
            product_id: productId,
            option_type: String(row.option_type).trim(),
            option_value: String(row.option_value).trim(),
            position: Number(row.position) || 0,
            is_enabled: row.is_enabled !== false,
          })));
        if (error) throw translateError(error);
      }
      for (const row of toUpdate) {
        const prior = existingByKey.get(key(row));
        const { error } = await client
          .from('mh_product_variants')
          .update({ position: Number(row.position) || 0, is_enabled: row.is_enabled !== false })
          .eq('id', prior.id);
        if (error) throw translateError(error);
      }
      if (toDelete.length) {
        const { error } = await client.from('mh_product_variants').delete().in('id', toDelete);
        if (error) throw translateError(error);
      }
      return this.listVariants(productId);
    },

    /* ------------------------------------------------------------- orders -- */
    async listOrders({ limit = 50 } = {}) {
      const { data, error } = await client
        .from('mh_orders')
        .select(
          'id,order_reference,customer_name,customer_contact,order_status,payment_status,fulfilment_status,notes,total_amount,currency,created_at,updated_at,items:mh_order_items(id,product_name,product_reference,quantity,unit_price,line_total,variant_label)'
        )
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw translateError(error);
      return data || [];
    },

    /**
     * An order and its lines are two inserts, so the order row is created first
     * and the lines follow. If the lines fail, the empty order is removed again
     * rather than left behind as a half-record — a record of an order with no
     * items would be worse than no record at all.
     */
    async createOrder(payload) {
      const { items = [], ...order } = payload || {};
      const { data: created, error } = await client.from('mh_orders').insert(order).select().single();
      if (error) throw translateError(error);
      const rows = items.map((item) => ({ order_id: created.id, ...item }));
      if (rows.length) {
        const { error: itemsError } = await client.from('mh_order_items').insert(rows);
        if (itemsError) {
          await client.from('mh_orders').delete().eq('id', created.id);
          throw translateError(itemsError);
        }
      }
      return created;
    },

    async updateOrder(id, patch) {
      const { data, error } = await client.from('mh_orders').update(patch).eq('id', id).select().single();
      if (error) throw translateError(error);
      return data;
    },

    async updateStockAvailability(productId, patch) {
      const { data, error } = await client.from('mh_products').update(patch).eq('id', productId).select().single();
      if (error) throw translateError(error);
      return normaliseProduct(data);
    },

    async saveStoreSettings(patch) {
      const { data, error } = await client.from('mh_store_settings').update(patch).eq('id', 1).select().single();
      if (error) throw translateError(error);
      return data;
    },

    async dashboardSummary() {
      const count = async (filter) => {
        let q = client.from('mh_products').select('id', { count: 'exact', head: true });
        q = filter(q);
        const { count: n, error } = await q;
        if (error) throw translateError(error);
        return n || 0;
      };
      const [published, drafts, archived, outOfStock, needsAttention] = await Promise.all([
        count((q) => q.eq('status', 'published')),
        count((q) => q.eq('status', 'draft')),
        count((q) => q.eq('status', 'archived')),
        count((q) => q.eq('availability', 'out_of_stock')),
        count((q) => q.eq('status', 'published').eq('availability', 'out_of_stock')),
      ]);
      const orders = await this.listOrders({ limit: 5 });
      return { published, drafts, archived, outOfStock, needsAttention, recentOrders: orders };
    },
  };
}

const PRODUCT_TOPIC = { schema: 'public', table: 'mh_products', event: 'UPDATE' };

async function attachPublicVariants(client, products) {
  if (!products.length) return products;
  const ids = products.map((p) => p.id).filter(Boolean);
  if (!ids.length) return products;
  const { data, error } = await client
    .from('mh_public_product_variants')
    .select('id,product_id,option_type,option_value,position')
    .in('product_id', ids);
  if (error) throw translateError(error);
  const byProduct = new Map();
  for (const variant of data || []) {
    if (!byProduct.has(variant.product_id)) byProduct.set(variant.product_id, []);
    byProduct.get(variant.product_id).push({ ...variant, is_enabled: true });
  }
  return products.map((product) => ({
    ...product,
    variants: (byProduct.get(product.id) || []).sort(
      (a, b) => (a.position ?? 0) - (b.position ?? 0) || String(a.option_value).localeCompare(String(b.option_value)),
    ),
  }));
}

/* ------------------------------------------------------------------- demo -- */

function demoLayer() {
  let cache = null;
  const load = async () => {
    if (cache) return cache;
    const [products, settings] = await Promise.all([
      fetchJson('assets/data/demo-products.json'),
      fetchJson('assets/data/demo-settings.json'),
    ]);
    cache = { products: (products.products || []).map(normaliseProduct), settings };
    return cache;
  };

  const refused = async () => {
    throw new DataError('Preview data is read-only. Connect Supabase in .env to manage the real catalogue.', { kind: 'config' });
  };

  return {
    mode: 'demo',
    client: null,
    /** Owner view of the settings row: private columns included. */
    async getOwnerStoreSettings() {
      const { data, error } = await client
        .from('mh_store_settings')
        .select('*')
        .eq('id', 1)
        .maybeSingle();
      if (error) throw translateError(error);
      return data || null;
    },

    async getStoreSettings() {
      return (await load()).settings;
    },
    async listCategories() {
      return (await load()).categories || [];
    },
    async listPublicProducts({ category = '', featured = false, limit = 0 } = {}) {
      let rows = (await load()).products;
      if (category) rows = rows.filter((p) => p.category_slug === category);
      if (featured) rows = rows.filter((p) => p.is_featured);
      if (limit) rows = rows.slice(0, limit);
      return rows;
    },
    async getProductByReference(reference) {
      const clean = String(reference || '').trim().toLowerCase();
      return (await load()).products.find((p) => String(p.reference).toLowerCase() === clean) || null;
    },
    subscribeProducts() {
      return () => {};
    },
    async authSession() {
      return null;
    },
    signIn: refused,
    signOut: refused,
    requestPasswordReset: refused,
    onUpdate() {},
    uploadImage: refused,
    cleanupImage: async () => 'not-requested',
    listAllCategories: refused,
    deleteCategory: refused,
    createCategory: refused,
    updateCategory: refused,
    listVariants: async () => [],
    saveVariants: refused,
    listOwnerProducts: refused,
    getOwnerProduct: refused,
    createProduct: refused,
    updateProduct: refused,
    deleteProduct: refused,
    referenceExists: async () => false,
    nextReference: async () => 'MH-NEW-001',
    replaceImage: refused,
    listOrders: async () => [],
    createOrder: refused,
    updateOrder: refused,
    updateStockAvailability: refused,
    saveStoreSettings: refused,
    dashboardSummary: refused,
  };
}

async function fetchJson(relativePath) {
  const res = await fetch(assetUrl(relativePath), { cache: 'no-store' });
  if (!res.ok) throw new DataError(`Could not load preview data (${res.status}).`, { kind: 'network' });
  return res.json();
}

/* ------------------------------------------------------------------ utils -- */

function normaliseProduct(row) {
  const category = Array.isArray(row.category) ? row.category[0] : row.category;
  return {
    ...row,
    price: row.price === null || row.price === undefined ? null : String(row.price),
    category_name: category?.name || '',
    category_slug: category?.slug || row.category_slug || '',
    availability: row.availability || 'unknown',
    variants: row.variants || [],
  };
}

/** PostgREST `or=` filter syntax characters must never come from a user. */
export function sanitizeSearch(value) {
  return String(value || '')
    .replace(/[,()%\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64);
}

function buildStoragePath(file, productId) {
  const extByType = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' };
  const ext = extByType[file.type] || 'img';
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).slice(2, 8);
  const id = String(productId || 'new').replace(/[^a-z0-9]/gi, '').slice(0, 24) || 'new';
  return `${id}/${stamp}-${random}.${ext}`;
}

/** Map Postgres/PostgREST errors onto owner-meaningful messages. */
export function translateError(error) {
  const message = String(error?.message || error?.error_description || 'Request failed');
  const code = String(error?.code || '');
  if (/duplicate key/i.test(message)) {
    return new DataError('That product reference is already used by another product. Choose a different one.', { kind: 'validation', detail: message });
  }
  if (/violates check constraint/i.test(message)) {
    const constraint = /constraint "?([\w.]+)"?/i.exec(message)?.[1] || 'a validation rule';
    return new DataError(`The database rejected this change (${constraint}). Prices and quantities must be zero or more, and published products need a name, reference and price.`, { kind: 'validation', detail: message });
  }
  if (/row-level security|new row violates row-level security/i.test(message)) {
    return new DataError('You are not signed in with the owner account, so this change was refused.', { kind: 'auth', detail: message });
  }
  if (/relation .* does not exist|Could not find the table/i.test(message)) {
    return new DataError('The database tables are not set up yet. Run the migrations from db/migrations in the Supabase SQL editor.', { kind: 'config', detail: message });
  }
  if (code === 'PGRST301' || /JWT expired|invalid claim: exp/i.test(message)) {
    return new DataError('Your session has expired. Please sign in again.', { kind: 'auth', detail: message });
  }
  if (/failed to fetch|networkerror|fetch failed/i.test(message)) {
    return new DataError('No connection to the catalogue. Check your data/Wi-Fi and try again.', { kind: 'network', detail: message });
  }
  return new DataError(message, { kind: 'unknown', detail: message });
}

/** Never echo Supabase's "Email not confirmed"/user-existence detail to a stranger. */
function genericSignInFailure() {
  return 'Email or password is incorrect, or this account is not allowed to manage the store.';
}
