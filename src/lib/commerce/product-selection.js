const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function selectionKey(listingId, variantId) {
  return `${listingId.toLowerCase()}:${variantId?.toLowerCase() ?? ''}`;
}
export function selectProductOption(options, variantId, quantity) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw Error('Choose a quantity from 1 to 99.');
  const option = options.find(value => (value.variantId ?? null) === (variantId?.toLowerCase() ?? null));
  if (!option || !Number.isSafeInteger(option.priceMinor) || option.priceMinor <= 0) throw Error('Select an available product option with a current price.');
  if (option.stockQuantity !== null && (!Number.isSafeInteger(option.stockQuantity) || option.stockQuantity < quantity)) throw Error('The requested quantity exceeds available stock.');
  return { ...option, quantity };
}

/** Only call after the parent catalogue loader has established public eligibility. */
export async function loadProductOptions(client, products, now = new Date().toISOString()) {
  if (!products.length) return [];
  const ids = products.map(product => product.id);
  const [variants, prices] = await Promise.all([
    client.from('product_variants').select('id,listing_id,option_attributes', { count: 'exact' }).in('listing_id', ids).eq('active_status', true).order('id').limit(1001),
    client.from('listing_prices').select('listing_id,product_variant_id,amount_minor,valid_from', { count: 'exact' }).in('listing_id', ids).eq('market_code', 'IN').eq('currency_code', 'INR').eq('status', 'active').lte('valid_from', now).or(`valid_to.is.null,valid_to.gt.${now}`).order('valid_from', { ascending: false }).limit(2001),
  ]);
  for (const result of [variants, prices]) if (result.error || !Array.isArray(result.data) || result.count !== result.data.length) throw Error('Product options are unavailable.');
  if (variants.data.length > 1000 || prices.data.length > 2000) throw Error('Product options exceed the supported range.');
  const current = new Map();
  for (const price of prices.data) {
    const key = selectionKey(price.listing_id, price.product_variant_id);
    if (!current.has(key)) current.set(key, price.amount_minor);
  }
  return products.map(product => {
    const options = [];
    const add = (variantId, attributes, label) => {
      const amount = current.get(selectionKey(product.id, variantId));
      if (Number.isSafeInteger(amount) && amount > 0) options.push({ variantId, attributes, label, priceMinor: amount, stockQuantity: null });
    };
    add(null, {}, 'Standard product');
    for (const variant of variants.data.filter(value => value.listing_id === product.id)) {
      if (!UUID.test(variant.id) || !variant.option_attributes || typeof variant.option_attributes !== 'object' || Array.isArray(variant.option_attributes)) continue;
      const entries = Object.entries(variant.option_attributes);
      if (!entries.length || entries.length > 20 || entries.some(([key, value]) => key.length > 100 || typeof value !== 'string' && typeof value !== 'number' || String(value).length > 200)) continue;
      const attributes = Object.fromEntries(entries.map(([key, value]) => [key, String(value)]));
      add(variant.id, attributes, entries.map(([key, value]) => `${key}: ${value}`).join(' · '));
    }
    return { ...product, options };
  });
}
