/**
 * Input validation shared by the seller forms and their server handlers.
 * Database constraints and RLS remain authoritative.
 */
export function isSellerUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Reject ambiguous/file-valued scalar fields; repeated species/variant rows
 * are intentionally handled separately. Object adapters may expose get/has. */
export function assertSingleSellerFields(formData, fields) {
  for (const field of fields) {
    if (typeof formData.getAll === 'function' && formData.getAll(field).length > 1) throw new Error('Seller form contains duplicate fields.');
    const value = formData.get(field);
    if (value !== null && value !== undefined && typeof value !== 'string') throw new Error('Seller form fields must contain text.');
  }
}

/** @param {FormData} formData @param {string | null} [existingBusinessType] */
export function sellerBusinessInput(formData, existingBusinessType = null) {
  assertSingleSellerFields(formData, ['display_name', 'legal_name', 'business_type', 'public_email', 'public_phone', 'website_url']);
  const displayName = String(formData.get('display_name') ?? '').trim();
  const legalName = String(formData.get('legal_name') ?? '').trim() || null;
  const hasBusinessType = formData.has('business_type');
  const businessType = String(hasBusinessType ? formData.get('business_type') : existingBusinessType ?? 'individual');
  const publicEmail = String(formData.get('public_email') ?? '').trim().toLowerCase() || null;
  const publicPhone = String(formData.get('public_phone') ?? '').trim() || null;
  const websiteUrl = String(formData.get('website_url') ?? '').trim() || null;
  const allowedTypes = hasBusinessType
    ? new Set(['individual', 'company', 'farm', 'other'])
    : new Set(['individual', 'company', 'clinic', 'farm', 'service_provider', 'other']);
  if (displayName.length < 2 || displayName.length > 120) throw new Error('Enter a business name between 2 and 120 characters.');
  if (legalName && legalName.length > 180) throw new Error('Legal business name must be 180 characters or fewer.');
  if (!allowedTypes.has(businessType)) throw new Error('Choose a valid business type.');
  if (publicEmail && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(publicEmail) || publicEmail.length > 254)) throw new Error('Enter a valid public email address.');
  if (publicPhone && (!/^\+?[0-9 ()-]{7,32}$/.test(publicPhone) || publicPhone.replace(/\D/g, '').length < 7 || publicPhone.replace(/\D/g, '').length > 15)) throw new Error('Enter a valid public phone number with 7 to 15 digits.');
  if (websiteUrl) {
    if (websiteUrl.length > 2048 || /[\s\u0000-\u001f\u007f]/u.test(websiteUrl)) throw new Error('Website URL must be at most 2048 characters without whitespace or control characters.');
    let parsed;
    try { parsed = new URL(websiteUrl); } catch { throw new Error('Enter a valid website URL.'); }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Website URL must use HTTPS or HTTP.');
    if (parsed.username || parsed.password) throw new Error('Website URLs cannot contain embedded credentials.');
  }
  return { displayName, legalName, businessType, publicEmail, publicPhone, websiteUrl };
}

export function slugifySellerProduct(title) {
  const normalized = String(title ?? '').normalize('NFKC').toLowerCase().trim();
  const ascii = normalized.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100).replace(/-+$/g, '');
  if (ascii) return ascii;
  if (!/[\p{L}\p{N}]/u.test(normalized)) return '';
  // Stable ASCII URL identifier for Hindi/other scripts; never an auth/security
  // hash. Existing DB uniqueness remains authoritative for every slug.
  let checksum = 2166136261;
  for (const character of normalized) checksum = Math.imul(checksum ^ character.codePointAt(0), 16777619) >>> 0;
  const prefix = Array.from(normalized).map(character => character.codePointAt(0).toString(16)).join('-').slice(0, 70).replace(/-+$/g, '');
  return `item-${prefix}-${checksum.toString(16)}`;
}

export function normalizeSellerSku(value) {
  return String(value ?? '').trim().replace(/\s+/g, '-').toUpperCase();
}

export function sellerImageExtension(contentType) {
  return ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' })[String(contentType ?? '').toLowerCase()] ?? null;
}

export function isCanonicalSellerImagePath(path, businessId, listingId) {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(String(businessId)) || !uuidPattern.test(String(listingId))) return false;
  const parts = String(path ?? '').split('/');
  return parts.length === 3
    && parts[0].toLowerCase() === String(businessId).toLowerCase()
    && parts[1].toLowerCase() === String(listingId).toLowerCase()
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|jpeg|png|webp|avif)$/i.test(parts[2]);
}

export function sellerProductInput(formData, allowedCategorySpecies = new Map()) {
  assertSingleSellerFields(formData, ['title', 'description', 'category_id', 'base_amount_minor']);
  const title = String(formData.get('title') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const categoryId = String(formData.get('category_id') ?? '').trim();
  const speciesIds = [...new Set(formData.getAll('species_ids').map(String).map(value => value.trim()).filter(Boolean))];
  if (title.length < 3 || title.length > 160) throw new Error('Enter a product name between 3 and 160 characters.');
  if (description.length > 5000) throw new Error('Product details must be 5,000 characters or fewer.');
  if (!isSellerUuid(categoryId)) throw new Error('Choose a product category.');
  if (speciesIds.length < 1 || speciesIds.length > 8 || speciesIds.some(id => !isSellerUuid(id))) throw new Error('Choose between 1 and 8 pets or livestock types.');
  const permittedSpecies = allowedCategorySpecies.get(categoryId);
  if (!permittedSpecies) throw new Error('That category is not available for seller listings.');
  if (permittedSpecies.size && speciesIds.some(id => !permittedSpecies.has(id))) throw new Error('Choose a pet or livestock type supported by this category.');

  const baseRaw = String(formData.get('base_amount_minor') ?? '').trim();
  const baseAmountMinor = baseRaw === '' ? null : parseMinorAmount(baseRaw);
  const skus = formData.getAll('variant_sku').map(String);
  const names = formData.getAll('variant_name').map(String);
  const values = formData.getAll('variant_value').map(String);
  const amounts = formData.getAll('variant_amount_minor').map(String);
  const variants = [];
  for (let i = 0; i < Math.max(skus.length, names.length, values.length, amounts.length); i += 1) {
    const sku = normalizeSellerSku(skus[i]);
    const name = (names[i] ?? '').trim();
    const value = (values[i] ?? '').trim();
    const amount = (amounts[i] ?? '').trim();
    if (!sku && !name && !value && !amount) continue;
    if (sku.length < 1 || sku.length > 80 || name.length < 1 || name.length > 60 || value.length < 1 || value.length > 120 || amount === '') {
      throw new Error('Complete every variant with a SKU, option name, option value and INR price.');
    }
    variants.push({ seller_sku: sku, option_attributes: { [name]: value }, amount_minor: parseMinorAmount(amount) });
  }
  if (variants.length > 20) throw new Error('A listing can have up to 20 product variants.');
  if (new Set(variants.map(variant => variant.seller_sku)).size !== variants.length) throw new Error('Variant SKUs must be unique after normalization.');
  if (variants.some(variant => !/^[A-Z0-9][A-Z0-9._-]*$/.test(variant.seller_sku))) throw new Error('Variant SKUs may contain letters, numbers, dots, underscores and dashes.');
  if (variants.length && baseAmountMinor !== null) throw new Error('Use either one base price or variant prices, not both.');
  if (!variants.length && baseAmountMinor === null) throw new Error('Enter an INR price or add at least one priced variant.');
  const slug = slugifySellerProduct(title);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('Product name must contain letters or numbers.');
  return {
    title, slug, description, categoryId, speciesIds,
    baseAmountMinor, variants,
  };
}

function parseMinorAmount(input) {
  if (!/^\d{1,9}$/.test(input)) throw new Error('Enter a whole INR amount between ₹1 and ₹9,99,99,999.');
  const amount = Number(input);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 99999999) throw new Error('Enter a whole INR amount between ₹1 and ₹9,99,99,999.');
  return amount * 100;
}
