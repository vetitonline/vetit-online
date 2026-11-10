import type { SellerInventory } from './inventory-contract.js';
import type { requestSellerInventory } from './inventory-client.js';
export type InventoryState={phase:'idle'|'loading'|'ready'|'saving'|'signin'|'error';inventory:SellerInventory|null;message:string};
export function createInventoryWorkspace(options:{read?:typeof requestSellerInventory;render:(state:InventoryState)=>void}):{load():Promise<void>;save(variantId:string,quantity:number):Promise<void>;clear():void;dispose():void};
