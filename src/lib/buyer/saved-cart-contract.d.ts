import type { CartItemInput } from './validation.js';
export { normalizeCartItemInput, normalizeCartItemId } from './validation.js';
export type SavedCartItem = { id: string; listing_id: string; product_variant_id: string | null; quantity: number; title: string | null };
export type SavedCart = { apiVersion: 1; state: 'available'; profileId: string; marketCode: string; cart: { id: string; market_code: string; currency_code: string; status: 'active' } | null; items: SavedCartItem[] };
export type SavedCartCommand = { action: 'set'; item: CartItemInput } | { action: 'remove'; itemId: string };
export class SavedCartError extends Error { status: number; constructor(message: string, status?: number); }
export const MAX_SAVED_CART_LINES: number;
export function cartId(value: unknown): string;
export function normalizeSavedCart(body: unknown): SavedCart;
