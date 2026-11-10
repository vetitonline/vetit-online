/** Only a filtered public RPC may expose the capped purchasable quantity. */
export async function readProductStock(client,ids){
  if(!ids.length)return new Map();
  const {data,error}=await client.rpc('get_product_stock',{p_variant_ids:ids});
  if(error?.code==='PGRST202')return null; // Older approved schema: explicitly unknown, never fabricated zero.
  if(error||!Array.isArray(data)||data.length>ids.length)throw Error('Stock availability is unavailable.');
  const allowed=new Set(ids),result=new Map();
  for(const row of data){if(!allowed.has(row.variant_id)||result.has(row.variant_id)||!(row.max_quantity===null||Number.isSafeInteger(row.max_quantity)&&row.max_quantity>=0&&row.max_quantity<=99))throw Error('Stock availability response is invalid.');result.set(row.variant_id,row.max_quantity);}
  return result;
}
