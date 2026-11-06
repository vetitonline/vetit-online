import type { ProductOption } from './product-selection.js';
export function requestProductOptions(listingId: string, options?: { baseUrl?: string; signal?: AbortSignal; fetchImpl?: typeof fetch }): Promise<ProductOption[]>;
