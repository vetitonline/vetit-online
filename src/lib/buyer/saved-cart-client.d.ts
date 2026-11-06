import type { SavedCart, SavedCartCommand } from './saved-cart-contract.js';
export function requestSavedCart(options: { command: SavedCartCommand; profileId: string; baseUrl?: string; accessToken?: string; signal?: AbortSignal; fetchImpl?: typeof fetch }): Promise<{ apiVersion: 1; state: 'saved' | 'deleted'; cartItemId?: string }>;
export function requestSavedCart(options?: { baseUrl?: string; accessToken?: string; signal?: AbortSignal; fetchImpl?: typeof fetch }): Promise<SavedCart>;
