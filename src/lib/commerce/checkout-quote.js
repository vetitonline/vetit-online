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
    const next = (quantities.get(line.listingId) ?? 0) + line.quantity;
    if (next > MAX_LINE_QUANTITY) {
      throw new CheckoutQuoteError('invalid_quantity', 'A product quantity exceeds the supported limit.');
    }
    quantities.set(line.listingId, next);
  }
  return [...quantities].map(([listingId, quantity]) => ({ listingId, quantity }));
}

/** Calculate a product subtotal from current, server-loaded public catalogue prices. */
export function calculateCheckoutQuote(lines, products) {
  const productsById = new Map(products.map((product) => [product.id, product]));
  let subtotalMinor = 0;
  const quoteLines = lines.map(({ listingId, quantity }) => {
    const product = productsById.get(listingId);
    if (!product) throw new CheckoutQuoteError('listing_unavailable', 'A product is no longer available.');
    if (product.priceIsFrom || !Number.isSafeInteger(product.priceMinor) || product.priceMinor < 0) {
      throw new CheckoutQuoteError('price_unavailable', 'A product does not have a directly quotable price.');
    }
    if (product.currencyCode !== 'INR') {
      throw new CheckoutQuoteError('market_unavailable', 'The product is not currently priced for the India market.');
    }

    const lineAmountMinor = product.priceMinor * quantity;
    if (!Number.isSafeInteger(lineAmountMinor) || !Number.isSafeInteger(subtotalMinor + lineAmountMinor)) {
      throw new CheckoutQuoteError('amount_out_of_range', 'The cart amount is outside the supported range.');
    }
    subtotalMinor += lineAmountMinor;
    return {
      listingId,
      title: product.title,
      category: product.category,
      sellerName: product.sellerName,
      quantity,
      unitAmountMinor: product.priceMinor,
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
