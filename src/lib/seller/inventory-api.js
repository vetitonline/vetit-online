import { InventoryError,inventoryId,normalizeSellerInventory,normalizeInventoryChange } from './inventory-contract.js';
import { readJsonBody } from '../api/json-body.js';
import { isSameOriginMutation } from '../api/request-security.js';
export function createInventoryHandler({authenticate}){
  const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  return async({request,cookies})=>{
    try{
      if(!['GET','POST'].includes(request.method))return json({state:'method_not_allowed'},405);
      if(request.method==='POST'&&!isSameOriginMutation(request))return json({state:'forbidden'},403);
      const auth=await authenticate(request,cookies);if(auth.state!=='authenticated')return json({state:auth.state==='unavailable'?'unavailable':'unauthorized'},auth.state==='unavailable'?503:401);
      if(request.method==='GET'){
        const result=await auth.supabase.rpc('get_my_seller_inventory');if(result.error)throw new InventoryError('Inventory is unavailable. The reviewed inventory backend may not be installed.',503);
        return json(normalizeSellerInventory({...result.data,apiVersion:1,state:'available',profileId:auth.user.id}));
      }
      if(request.headers.get('x-vetit-profile-id')!==auth.user.id)return json({state:'session_changed'},409);
      if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return json({state:'invalid_request'},415);
      const body=await readJsonBody(request,2048);if(!body.ok)return json({state:'invalid_request'},body.status);
      const change=normalizeInventoryChange(body.value);
      const {data,error}=await auth.supabase.rpc('set_seller_inventory_checked',{p_business_id:change.businessId,p_product_variant_id:change.productVariantId,p_quantity_on_hand:change.quantityOnHand,p_expected_inventory_id:change.expectedInventoryId,p_expected_updated_at:change.expectedUpdatedAt});
      if(error)throw new InventoryError(error.code==='40001'?'Stock changed. Reload before editing.':'Stock change could not be confirmed. Reload before trying again.',error.code==='42501'?403:error.code==='40001'?409:['22023','23514'].includes(error.code)?422:503);
      let id;try{id=inventoryId(data);}catch{throw new InventoryError('Stock change needs reconciliation.',503);}
      return json({apiVersion:1,state:'saved',inventoryLevelId:id});
    }catch(error){return json({state:'unavailable',message:error instanceof InventoryError?error.message:'Inventory is unavailable. Reload before trying again.'},error instanceof InventoryError?error.status:503);}
  };
}
