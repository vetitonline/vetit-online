import type { FeaturedProduct } from './catalog-types.js';
export type PreviewCartLine = {product: FeaturedProduct; quantity: number};
export function canAddPreviewProduct(product: FeaturedProduct): boolean;
export function changePreviewCart(lines: PreviewCartLine[], action: {action:'add';product:FeaturedProduct}|{action:'quantity';id:string;quantity:number}|{action:'remove';id:string}): PreviewCartLine[];
export function previewCartSubtotal(lines: PreviewCartLine[]): number | null;
