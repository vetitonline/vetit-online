import type { InventoryChange,SellerInventory } from './inventory-contract.js';
type Options={baseUrl?:string;accessToken?:string;signal?:AbortSignal;fetchImpl?:typeof fetch};
export function requestSellerInventory(options:Options&{change:InventoryChange;profileId:string}):Promise<{inventoryLevelId:string}>;
export function requestSellerInventory(options?:Options):Promise<SellerInventory>;
