import { isSellerUuid } from './validation.js';
export class InventoryError extends Error{constructor(message,status=400){super(message);this.status=status;}}
export const inventoryId=value=>{if(!isSellerUuid(value))throw new InventoryError('Inventory identifier is invalid.');return value.toLowerCase();};
export function normalizeSellerInventory(body){
  if(body?.apiVersion!==1||body.state!=='available'||!Array.isArray(body.businesses)||!Array.isArray(body.variants)||body.businesses.length>100||body.variants.length>1000)throw new InventoryError('Inventory response is invalid.',503);
  const profileId=inventoryId(body.profileId),businesses=body.businesses.map(b=>{if(typeof b.name!=='string'||b.name.length>120)throw new InventoryError('Inventory business is invalid.',503);return{id:inventoryId(b.id),name:b.name};});
  const ids=new Set(businesses.map(b=>b.id));if(ids.size!==businesses.length)throw new InventoryError('Duplicate inventory business.',503);
  const variants=body.variants.map(row=>{
    const variantId=inventoryId(row.variantId),listingId=inventoryId(row.listingId),businessId=inventoryId(row.businessId);
    if(!ids.has(businessId)||typeof row.title!=='string'||row.title.length>160||typeof row.sku!=='string'||row.sku.length>80||!row.attributes||typeof row.attributes!=='object'||Array.isArray(row.attributes)||JSON.stringify(row.attributes).length>5000)throw new InventoryError('Inventory option is invalid.',503);
    if(row.inventoryId===null){if(row.quantityOnHand!==null||row.quantityReserved!==null||row.updatedAt!==null)throw new InventoryError('Unknown inventory is inconsistent.',503);}
    else if(!Number.isSafeInteger(row.quantityOnHand)||row.quantityOnHand<0||!Number.isSafeInteger(row.quantityReserved)||row.quantityReserved<0||row.quantityReserved>row.quantityOnHand||typeof row.updatedAt!=='string'||!Number.isFinite(Date.parse(row.updatedAt)))throw new InventoryError('Inventory counts are invalid.',503);
    return{variantId,listingId,businessId,title:row.title,sku:row.sku,attributes:row.attributes,inventoryId:row.inventoryId===null?null:inventoryId(row.inventoryId),quantityOnHand:row.quantityOnHand,quantityReserved:row.quantityReserved,updatedAt:row.updatedAt};
  });
  if(new Set(variants.map(row=>row.variantId)).size!==variants.length)throw new InventoryError('Duplicate stock option.',503);
  return{apiVersion:1,state:'available',profileId,businesses,variants};
}
export function normalizeInventoryChange(input){
  if(!input||typeof input!=='object'||Array.isArray(input)||!Number.isSafeInteger(input.quantityOnHand)||input.quantityOnHand<0||input.quantityOnHand>10000000)throw new InventoryError('Enter whole on-hand units from 0 to 10,000,000.');
  const expectedInventoryId=input.expectedInventoryId===null?null:inventoryId(input.expectedInventoryId);
  if(expectedInventoryId===null?input.expectedUpdatedAt!==null:typeof input.expectedUpdatedAt!=='string'||!Number.isFinite(Date.parse(input.expectedUpdatedAt)))throw new InventoryError('Reload stock before editing.');
  if(input.stockLocation!==undefined&&input.stockLocation!==null)throw new InventoryError('This workspace manages default-location stock only.');
  return{businessId:inventoryId(input.businessId),productVariantId:inventoryId(input.productVariantId),quantityOnHand:input.quantityOnHand,expectedInventoryId,expectedUpdatedAt:input.expectedUpdatedAt};
}
