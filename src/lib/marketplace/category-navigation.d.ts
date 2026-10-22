import type { ProductCategory } from './catalog-types.js';
export function categoriesForSpecies(categories:ProductCategory[], speciesId?:string):ProductCategory[];
export function categoryNavigation(categories:ProductCategory[], speciesId?:string, selectedSlug?:string):{roots:ProductCategory[];children:ProductCategory[];breadcrumbs:ProductCategory[]};
