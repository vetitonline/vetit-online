import {sellerProductInput,isSellerUuid} from './validation.js';
export class SellerCatalogueError extends Error{constructor(status=503){super('Seller catalogue operation unavailable.');this.status=status;}}
const fail=status=>{throw new SellerCatalogueError(status);};
const id=value=>isSellerUuid(value)?value.toLowerCase():fail(400);
export function normalizeCatalogueSave(input,categories){
 if(!input||typeof input!=='object'||Array.isArray(input)||!input.fields||typeof input.fields!=='object'||Array.isArray(input.fields))fail(400);
 const allowed=new Set(['title','description','category_id','base_amount_minor','species_ids','variant_sku','variant_name','variant_value','variant_amount_minor']);
 const values=new Map();const form={get:key=>values.get(key)?.[0]??null,getAll:key=>values.get(key)??[],has:key=>values.has(key)};for(const [key,value] of Object.entries(input.fields)){if(!allowed.has(key))fail(400);const repeated=key==='species_ids'||key.startsWith('variant_');if(repeated){if(!Array.isArray(value)||value.length>20||value.some(x=>typeof x!=='string'||x.length>5000))fail(400);for(const item of value)values.set(key,[...(values.get(key)??[]),item]);}else{if(typeof value!=='string'||value.length>5000)fail(400);values.set(key,[value]);}}
 let product;try{product=sellerProductInput(form,new Map(categories.map(c=>[c.id,new Set(c.species)])));}catch{fail(422);}
 return{action:'save',businessId:id(input.businessId),listingId:input.listingId==null?null:id(input.listingId),product};
}

export function canonicalCatalogueProduct(input,categories){const p=normalizeCatalogueSave(input,categories).product;return JSON.stringify({...p,speciesIds:[...p.speciesIds].sort(),variants:[...p.variants].sort((a,b)=>a.seller_sku.localeCompare(b.seller_sku))});}
