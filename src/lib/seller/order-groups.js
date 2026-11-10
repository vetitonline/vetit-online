import {orderId,normalizeOrderItem,normalizeOrderFulfilment} from '../buyer/order-contract.js';
export function normalizeSellerOrders(body,{maxRecords=200}={}){
 if(body?.apiVersion!==1||body.state!=='available'||!Array.isArray(body.items)||!Array.isArray(body.fulfilments)||body.items.length>maxRecords||body.fulfilments.length>maxRecords)throw Error('Seller order response is invalid.');
 const items=body.items.map(row=>{if(!/^[A-Z]{3}$/.test(row.currency_code))throw Error('Invalid order currency.');return{...normalizeOrderItem(row,row.currency_code),orderId:orderId(row.orderId)};});
 const fulfilments=body.fulfilments.map(row=>({...normalizeOrderFulfilment(row),orderId:orderId(row.orderId)}));
 if(new Set(items.map(i=>i.id)).size!==items.length||new Set(fulfilments.map(i=>i.id)).size!==fulfilments.length)throw Error('Duplicate seller order records.');
 return{apiVersion:1,state:'available',profileId:orderId(body.profileId),items,fulfilments};
}
/** Group strictly by order AND business. Subtotals cover only returned seller lines. */
export function groupSellerOrders(input,{query='',status='all'}={}){
 const data=normalizeSellerOrders(input,{maxRecords:5000}),groups=new Map();
 const group=row=>{const key=row.orderId+':'+row.business_id;if(!groups.has(key))groups.set(key,{key,orderId:row.orderId,businessId:row.business_id,items:[],fulfilments:[],currencyCode:null,subtotalMinor:null});return groups.get(key);};
 for(const item of data.items)group(item).items.push(item);
 for(const shipment of data.fulfilments)group(shipment).fulfilments.push(shipment);
 for(const row of groups.values()){
  if(row.items.length){row.currencyCode=row.items[0].currency_code;let total=0n;
   for(const item of row.items){if(item.currency_code!==row.currencyCode)throw Error('Mixed order currencies.');total+=BigInt(item.quantity)*BigInt(item.unit_price_minor);}
   if(total>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Seller subtotal is out of range.');row.subtotalMinor=Number(total);
  }
 }
 const search=query.trim().slice(0,160).toLocaleLowerCase('en');
 return [...groups.values()].filter(row=>(status==='all'||row.fulfilments.some(f=>f.status===status))&&(!search||`${row.orderId} ${row.items.map(i=>i.title_snapshot).join(' ')}`.toLocaleLowerCase('en').includes(search)));
}
