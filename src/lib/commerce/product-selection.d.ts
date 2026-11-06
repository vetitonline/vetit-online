import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/database.types';
import type { FeaturedProduct } from '../marketplace/catalog-types.js';
export type ProductOption = { variantId: string | null; attributes: Record<string,string>; label: string; priceMinor: number; stockQuantity: number | null };
export function selectionKey(listingId: string, variantId?: string | null): string;
export function selectProductOption(options: ProductOption[], variantId: string | null, quantity: number): ProductOption & { quantity: number };
export function loadProductOptions(client: SupabaseClient<Database>, products: FeaturedProduct[], now?: string): Promise<Array<FeaturedProduct & { options: ProductOption[] }>>;
