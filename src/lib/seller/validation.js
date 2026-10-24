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

export class SellerProductValidationError extends Error {
  constructor(field, message, index) { super(message); this.field=field; if(index!==undefined)this.index=index; }
}
export function sellerProductValidationIssue(error) {
  return error instanceof SellerProductValidationError ? {field:error.field,message:error.message,...(error.index===undefined?{}:{index:error.index})} : null;
}
const invalidProduct=(field,message,index)=>{throw new SellerProductValidationError(field,message,index);};
export function sellerProductInput(formData, allowedCategorySpecies = new Map()) {
  for(const field of ['title', 'description', 'category_id', 'base_amount_minor']){
    try{assertSingleSellerFields(formData,[field]);}catch(error){invalidProduct(field,error.message);}
  }
  // Match the native JSON contract before coercion/deduplication. File-valued
  // option labels must never silently become "[object File]" in JSONB.
  const textRows = field => {
    const values = formData.getAll(field);
    if (!Array.isArray(values) || values.length > 20 || values.some(value => typeof value !== 'string' || value.length > 5000)) {
      invalidProduct(field,'Seller repeated fields must contain at most 20 bounded text values.');
    }
    return values;
  };
  const title = String(formData.get('title') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const categoryId = String(formData.get('category_id') ?? '').trim();
  const speciesIds = [...new Set(textRows('species_ids').map(value => value.trim()).filter(Boolean))];
  if (title.length < 3 || title.length > 160) invalidProduct('title','Enter a product name between 3 and 160 characters.');
  if (description.length > 5000) invalidProduct('description','Product details must be 5,000 characters or fewer.');
  if (!isSellerUuid(categoryId)) invalidProduct('category_id','Choose a product category.');
  if (speciesIds.length < 1 || speciesIds.length > 8 || speciesIds.some(id => !isSellerUuid(id))) invalidProduct('species_ids','Choose between 1 and 8 pets or livestock types.');
  const permittedSpecies = allowedCategorySpecies.get(categoryId);
  if (!permittedSpecies) invalidProduct('category_id','That category is not available for seller listings.');
  if (permittedSpecies.size && speciesIds.some(id => !permittedSpecies.has(id))) invalidProduct('species_ids','Choose a pet or livestock type supported by this category.');

  const baseRaw = String(formData.get('base_amount_minor') ?? '').trim();
  const baseAmountMinor = baseRaw === '' ? null : parseMinorAmount(baseRaw);
  const skus = textRows('variant_sku');
  const names = textRows('variant_name');
  const values = textRows('variant_value');
  const amounts = textRows('variant_amount_minor');
  const variants = [], variantRows=[];
  for (let i = 0; i < Math.max(skus.length, names.length, values.length, amounts.length); i += 1) {
    const sku = normalizeSellerSku(skus[i]);
    const name = (names[i] ?? '').trim();
    const value = (values[i] ?? '').trim();
    const amount = (amounts[i] ?? '').trim();
    if (!sku && !name && !value && !amount) continue;
    const incomplete=[[sku.length<1||sku.length>80,'variant_sku'],[name.length<1||name.length>60,'variant_name'],[value.length<1||value.length>120,'variant_value'],[amount==='','variant_amount_minor']].find(([bad])=>bad);
    if(incomplete)invalidProduct(incomplete[1],'Complete every variant with a SKU, option name, option value and INR price.',i);
    variants.push({ seller_sku: sku, option_attributes: { [name]: value }, amount_minor: parseMinorAmount(amount,'variant_amount_minor',i) });
    variantRows.push(i);
  }
  if (variants.length > 20) invalidProduct('variant_sku','A listing can have up to 20 product variants.');
  const duplicate=variants.findIndex((variant,index)=>variants.slice(0,index).some(previous=>previous.seller_sku===variant.seller_sku));
  if (duplicate!==-1) invalidProduct('variant_sku','Variant SKUs must be unique after normalization.',variantRows[duplicate]);
  const badSku=variants.findIndex(variant=>!/^[A-Z0-9][A-Z0-9._-]*$/.test(variant.seller_sku));
  if (badSku!==-1) invalidProduct('variant_sku','Variant SKUs may contain letters, numbers, dots, underscores and dashes.',variantRows[badSku]);
  if (variants.length && baseAmountMinor !== null) invalidProduct('base_amount_minor','Use either one base price or variant prices, not both.');
  if (!variants.length && baseAmountMinor === null) invalidProduct('base_amount_minor','Enter an INR price or add at least one priced variant.');
  const slug = slugifySellerProduct(title);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) invalidProduct('title','Product name must contain letters or numbers.');
  return {
    title, slug, description, categoryId, speciesIds,
    baseAmountMinor, variants,
  };
}

function parseMinorAmount(input,field='base_amount_minor',index) {
  if (!/^\d{1,9}$/.test(input)) invalidProduct(field,'Enter a whole INR amount between ₹1 and ₹9,99,99,999.',index);
  const amount = Number(input);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 99999999) invalidProduct(field,'Enter a whole INR amount between ₹1 and ₹9,99,99,999.',index);
  return amount * 100;
}
