export type QuoteRequestLine = { listingId: string; quantity: number };
export type QuoteRequest = { lines: QuoteRequestLine[] };
export type CheckoutQuoteLine = QuoteRequestLine & {
  title: string;
  category: string;
  sellerName: string;
  unitAmountMinor: number;
  lineAmountMinor: number;
  currencyCode: 'INR';
};
export type CheckoutQuote = {
  state: 'quote_only';
  marketCode: 'IN';
  currencyCode: 'INR';
  lines: CheckoutQuoteLine[];
  subtotalMinor: number;
  deliveryMinor: null;
  feesMinor: null;
  totalMinor: null;
  checkoutEnabled: false;
};
export type CheckoutQuoteResponse = CheckoutQuote & { apiVersion: 1 };
export class CheckoutQuoteError extends Error { code: string; }
export const MAX_QUOTE_LINES: number;
export const MAX_LINE_QUANTITY: number;
export function normalizeQuoteLines(input: unknown): QuoteRequestLine[];
export function calculateCheckoutQuote(lines: QuoteRequestLine[], products: Array<{
  id: string;
  title: string;
  category: string;
  sellerName: string;
  priceMinor: number | null;
  priceIsFrom: boolean;
  currencyCode: string;
}>): CheckoutQuote;
