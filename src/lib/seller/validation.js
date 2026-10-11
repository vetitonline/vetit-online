/**
 * Input validation shared by the seller forms and their server handlers.
 * Database constraints and RLS remain authoritative.
 */
/** @param {FormData} formData @param {string | null} [existingBusinessType] */
export function sellerBusinessInput(formData, existingBusinessType = null) {
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
  if (publicPhone && publicPhone.length > 32) throw new Error('Enter a public phone number under 33 characters.');
  if (websiteUrl) {
    let parsed;
    try { parsed = new URL(websiteUrl); } catch { throw new Error('Enter a valid website URL.'); }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Website URL must use HTTPS or HTTP.');
  }
  return { displayName, legalName, businessType, publicEmail, publicPhone, websiteUrl };
}

export function slugifySellerProduct(title) {
  return String(title ?? '').normalize('NFKD').toLowerCase().trim()
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
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
  const title = String(formData.get('title') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const categoryId = String(formData.get('category_id') ?? '').trim();
  const speciesIds = [...new Set(formData.getAll('species_ids').map(String).map(value => value.trim()).filter(Boolean))];
  if (title.length < 3 || title.length > 160) throw new Error('Enter a product name between 3 and 160 characters.');
  if (description.length > 5000) throw new Error('Product details must be 5,000 characters or fewer.');
  if (!/^[0-9a-f-]{36}$/i.test(categoryId)) throw new Error('Choose a product category.');
  if (speciesIds.length < 1 || speciesIds.length > 8 || speciesIds.some(id => !/^[0-9a-f-]{36}$/i.test(id))) throw new Error('Choose between 1 and 8 pets or livestock types.');
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
