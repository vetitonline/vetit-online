const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const money=value=>Number.isSafeInteger(value)&&value>=0;
export class BuyerOrderError extends Error { constructor(message,status=400){super(message);this.name='BuyerOrderError';this.status=status;} }
export function orderId(value){if(typeof value!=='string'||!UUID.test(value))throw new BuyerOrderError('Order ID is invalid.');return value.toLowerCase();}
const timestamp=value=>typeof value==='string'&&TIME.test(value)&&Number.isFinite(Date.parse(value));
export function encodeOrderCursor(row){
  if(!timestamp(row?.created_at))throw new BuyerOrderError('Order cursor is invalid.');
  return btoa(JSON.stringify({createdAt:row.created_at,id:orderId(row.id)})).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}
export function normalizeOrderHistoryQuery(params){
  const detail=params.get('orderId');const rawLimit=params.get('limit');const token=params.get('cursor');
  if(detail!==null){if(rawLimit!==null||token!==null)throw new BuyerOrderError('Detail requests cannot include pagination.');return{orderId:orderId(detail)};}
  const limit=rawLimit===null?20:Number(rawLimit);
  if(rawLimit!==null&&!/^[1-9]\d?$/.test(rawLimit)||!Number.isInteger(limit)||limit<1||limit>50)throw new BuyerOrderError('Order page size must be 1 to 50.');
  let cursor=null;
  if(token!==null){try{
    if(!/^[A-Za-z0-9_-]{1,256}$/.test(token))throw Error();
    const value=JSON.parse(atob(token.replaceAll('-','+').replaceAll('_','/')));
    if(!object(value)||!timestamp(value.createdAt))throw Error();
    cursor={createdAt:value.createdAt,id:orderId(value.id)};
  }catch{throw new BuyerOrderError('Order cursor is invalid.');}}
  return{limit,cursor};
}
const summaryFields=['id','market_code','order_status','currency_code','subtotal_minor','delivery_minor','tax_minor','total_minor','created_at'];
const pick=(value,fields)=>Object.fromEntries(fields.map(key=>[key,value[key]]));
export function normalizeOrderSummary(row){
  if(!object(row)||!UUID.test(row.id)||!/^[A-Z]{2}$/.test(row.market_code)||!/^[A-Z]{3}$/.test(row.currency_code)
    ||!['pending','confirmed','processing','fulfilled','cancelled','refunded'].includes(row.order_status)||!timestamp(row.created_at)
    ||!['subtotal_minor','delivery_minor','tax_minor','total_minor'].every(key=>money(row[key])))throw new BuyerOrderError('Order response is invalid.',503);
  if(BigInt(row.subtotal_minor)+BigInt(row.delivery_minor)+BigInt(row.tax_minor)!==BigInt(row.total_minor))throw new BuyerOrderError('Order totals are invalid.',503);
  return pick(row,summaryFields);
}
export function normalizeOrderItem(row,currency){
  if(!object(row)||![row.id,row.listing_id,row.business_id].every(id=>typeof id==='string'&&UUID.test(id))
    ||!(row.product_variant_id===null||typeof row.product_variant_id==='string'&&UUID.test(row.product_variant_id))
    ||typeof row.title_snapshot!=='string'||!Number.isInteger(row.quantity)||row.quantity<1||row.quantity>999
    ||!money(row.unit_price_minor)||row.unit_price_minor===0||row.currency_code!==currency)throw new BuyerOrderError('Order item response is invalid.',503);
  return pick(row,['id','listing_id','business_id','product_variant_id','title_snapshot','quantity','unit_price_minor','currency_code']);
}
export function normalizeOrderFulfilment(row){
  if(!object(row)||![row.id,row.business_id].every(id=>typeof id==='string'&&UUID.test(id))||!['pending','packed','shipped','delivered','cancelled'].includes(row.status)
    ||!['carrier','tracking_reference'].every(key=>row[key]===null||typeof row[key]==='string')
    ||!['shipped_at','delivered_at'].every(key=>row[key]===null||timestamp(row[key])))throw new BuyerOrderError('Fulfilment response is invalid.',503);
  return pick(row,['id','business_id','status','carrier','tracking_reference','shipped_at','delivered_at']);
}
