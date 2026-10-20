import type { ProductCategory } from './catalog-types.js';
export function categoryNavigation(categories:ProductCategory[], speciesId?:string, selectedSlug?:string):{roots:ProductCategory[];children:ProductCategory[];breadcrumbs:ProductCategory[]};
