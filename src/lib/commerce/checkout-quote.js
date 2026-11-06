const LISTING_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_QUOTE_LINES = 50;
export const MAX_LINE_QUANTITY = 99;

export class CheckoutQuoteError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CheckoutQuoteError';
    this.code = code;
  }
}

/** Normalize untrusted cart input. Client prices, sellers and payment fields are ignored. */
export function normalizeQuoteLines(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !Array.isArray(input.lines)) {
    throw new CheckoutQuoteError('invalid_request', 'Cart lines are required.');
  }
  if (input.lines.length < 1 || input.lines.length > MAX_QUOTE_LINES) {
    throw new CheckoutQuoteError('invalid_lines', 'Cart line count is outside the supported range.');
  }

  const quantities = new Map();
  for (const line of input.lines) {
    if (!line || typeof line !== 'object' || Array.isArray(line)
      || typeof line.listingId !== 'string' || !LISTING_ID.test(line.listingId)
      || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_LINE_QUANTITY) {
      throw new CheckoutQuoteError('invalid_line', 'A cart line is invalid.');
    }
    // UUIDs are case-insensitive. Canonicalize before combining quantities so
    // differently cased IDs cannot bypass the per-product quantity limit.
    const listingId = line.listingId.toLowerCase();
    const productVariantId = line.productVariantId == null ? null : typeof line.productVariantId === 'string' && LISTING_ID.test(line.productVariantId) ? line.productVariantId.toLowerCase() : false;
    if (productVariantId === false) throw new CheckoutQuoteError('invalid_line', 'A product option is invalid.');
    const key = listingId + ':' + (productVariantId ?? '');
    const previous = quantities.get(key);
    const next = (previous?.quantity ?? 0) + line.quantity;
    if (next > MAX_LINE_QUANTITY) {
      throw new CheckoutQuoteError('invalid_quantity', 'A product quantity exceeds the supported limit.');
    }
    quantities.set(key, { listingId, ...(productVariantId ? { productVariantId } : {}), quantity: next });
  }
  return [...quantities.values()];
}

/** Calculate a product subtotal from current, server-loaded public catalogue prices. */
export function calculateCheckoutQuote(lines, products) {
  const productsById = new Map(products.map((product) => [product.id, product]));
  let subtotalMinor = 0;
  const quoteLines = lines.map(({ listingId, productVariantId, quantity }) => {
    const product = productsById.get(listingId);
    if (!product) throw new CheckoutQuoteError('listing_unavailable', 'A product is no longer available.');
    const option = product.options?.find(value => (value.variantId ?? null) === (productVariantId ?? null));
    const amount = product.options ? option?.priceMinor : productVariantId ? null : product.priceIsFrom ? null : product.priceMinor;
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new CheckoutQuoteError('price_unavailable', 'A product does not have a directly quotable price.');
    }
    if (product.currencyCode !== 'INR') {
      throw new CheckoutQuoteError('market_unavailable', 'The product is not currently priced for the India market.');
    }

    if (option?.stockQuantity !== null && option?.stockQuantity !== undefined && (!Number.isSafeInteger(option.stockQuantity) || option.stockQuantity < quantity)) throw new CheckoutQuoteError('stock_unavailable', 'A product does not have the requested stock.');
    const lineAmountMinor = amount * quantity;
    if (!Number.isSafeInteger(lineAmountMinor) || !Number.isSafeInteger(subtotalMinor + lineAmountMinor)) {
      throw new CheckoutQuoteError('amount_out_of_range', 'The cart amount is outside the supported range.');
    }
    subtotalMinor += lineAmountMinor;
    return {
      listingId,
      ...(productVariantId ? { productVariantId } : {}),
      title: product.title,
      category: product.category,
      sellerName: product.sellerName,
      quantity,
      unitAmountMinor: amount,
      lineAmountMinor,
      currencyCode: 'INR',
    };
  });

  return {
    state: 'quote_only',
    marketCode: 'IN',
    currencyCode: 'INR',
    lines: quoteLines,
    subtotalMinor,
    deliveryMinor: null,
    feesMinor: null,
    totalMinor: null,
    checkoutEnabled: false,
  };
}
