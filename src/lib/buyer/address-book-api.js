import { normalizeAddressInput,BuyerInputError } from './validation.js';
import { ADDRESS_BOOK_LIMIT,addressId,addressFromRow,addressRpcArgs } from './address-book-contract.js';
import { isSameOriginMutation } from '../api/request-security.js';
import { readJsonBody } from '../api/json-body.js';
const fields='id,label,recipient_name,phone,address_line1,address_line2,locality,city,state_region,postal_code,country_code,latitude,longitude,is_default,created_at,updated_at';
export function createAddressBookHandler({authenticate,rpc}){
  const json=(body,status=200)=>new Response(JSON.stringify({apiVersion:1,...body}),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  return async({request,cookies,url=new URL(request.url)})=>{
    try{
      if(!['GET','POST','DELETE'].includes(request.method))return json({state:'method_not_allowed'},405);
      if(request.method!=='GET'&&!isSameOriginMutation(request))return json({state:'forbidden'},403);
      const auth=await authenticate(request,cookies);
      if(auth.state!=='authenticated')return json({state:auth.state==='unavailable'?'unavailable':'unauthorized'},auth.state==='unavailable'?503:401);
      const {supabase,user}=auth;
      if(request.method==='GET'){
        const result=await supabase.from('addresses').select(fields+',profile_id',{count:'exact'}).eq('profile_id',user.id).order('is_default',{ascending:false}).order('created_at',{ascending:false}).order('id').limit(ADDRESS_BOOK_LIMIT+1);
        if(result.error||!Array.isArray(result.data)||result.count!==result.data.length||result.data.length>ADDRESS_BOOK_LIMIT)throw Error();
        const rows=result.data.map(row=>{if(row.profile_id!==user.id)throw Error();addressFromRow(row);const {profile_id,...value}=row;return value;});
        if(new Set(rows.map(row=>row.id)).size!==rows.length||rows.filter(row=>row.is_default).length>1)throw Error();
        return json({state:'available',profileId:user.id,addresses:rows});
      }
      if(request.headers.get('x-vetit-profile-id')!==user.id)return json({state:'session_changed',message:'Your account changed. Reload addresses before editing.'},409);
      if(request.method==='DELETE'){
        const id=addressId(url.searchParams.get('id'));
        const result=await supabase.from('addresses').delete().eq('id',id).eq('profile_id',user.id).select('id').maybeSingle();
        if(result.error)throw Error();if(!result.data)return json({state:'not_found'},404);if(result.data.id!==id)throw Error();
        return json({state:'deleted'});
      }
      if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return json({state:'invalid_request'},415);
      const body=await readJsonBody(request,4096);if(!body.ok)return json({state:'invalid_request'},body.status);
      if(body.value?.countryCode!==undefined&&typeof body.value.countryCode!=='string')return json({state:'invalid_request'},400);
      const address=normalizeAddressInput(body.value);if(address.id)address.id=addressId(address.id);
      if(Object.values(address).some(value=>typeof value==='string'&&/[\u0000-\u001f\u007f]/.test(value)))return json({state:'invalid_request',message:'Address fields cannot contain control characters.'},400);
      if(address.id){const own=await supabase.from('addresses').select('id').eq('id',address.id).eq('profile_id',user.id).maybeSingle();if(own.error)throw Error();if(!own.data)return json({state:'not_found'},404);}
      const result=await rpc(supabase,'save_my_address',addressRpcArgs(address));
      if(result.error)return json({state:'unavailable',message:'Address change could not be confirmed. Reload to check before trying again.'},result.error.code==='42501'?403:result.error.code==='P0002'?404:result.error.code==='22023'?422:503);
      let saved;try{saved=addressId(result.data);}catch{throw Error('Invalid address acknowledgement');}
      if(address.id&&saved!==address.id)throw Error('Mismatched address acknowledgement');
      return json({state:'saved',addressId:saved},address.id?200:201);
    }catch(error){return json({state:error instanceof BuyerInputError?'invalid_request':'unavailable',message:error instanceof BuyerInputError?error.message:'Saved addresses are unavailable. Reload before trying again.'},error instanceof BuyerInputError?400:503);}
  };
}
