export type StockVariant={variantId:string;listingId:string;businessId:string;title:string;sku:string;attributes:Record<string,unknown>;inventoryId:string|null;quantityOnHand:number|null;quantityReserved:number|null;updatedAt:string|null};
export type SellerInventory={apiVersion:1;state:'available';profileId:string;businesses:Array<{id:string;name:string}>;variants:StockVariant[]};
export type InventoryChange={businessId:string;productVariantId:string;quantityOnHand:number;expectedInventoryId:string|null;expectedUpdatedAt:string|null};
export class InventoryError extends Error{status:number;constructor(message:string,status?:number);}
export function inventoryId(value:unknown):string;
export function normalizeInventoryChange(input:unknown):InventoryChange;
export function normalizeSellerInventory(input:unknown):SellerInventory;
