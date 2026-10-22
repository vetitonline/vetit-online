export type CatalogueFields={title:string;description:string;category_id:string;base_amount_minor:string;species_ids:string[];variant_sku:string[];variant_name:string[];variant_value:string[];variant_amount_minor:string[]};
export type CatalogueCategory={id:string;label:string;species:string[]};
export type CatalogueCommand={action:'save'|'submit';businessId:string;listingId?:string|null;expectedRevision?:string;fields?:CatalogueFields};
export class SellerCatalogueError extends Error{status:number;constructor(status?:number);}
export function normalizeCatalogueSave(input:unknown,categories:Array<{id:string;species:string[]}>):{action:'save';businessId:string;listingId:string|null;product:{title:string;slug:string;description:string;categoryId:string;speciesIds:string[];baseAmountMinor:number|null;variants:Array<{seller_sku:string;option_attributes:Record<string,string>;amount_minor:number}>}};
export function canonicalCatalogueProduct(input:unknown,categories:Array<{id:string;species:string[]}>):string;
