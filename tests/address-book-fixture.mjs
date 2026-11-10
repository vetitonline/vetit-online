import { randomUUID } from 'node:crypto';
export const alice='10000000-0000-4000-8000-000000000001',bob='10000000-0000-4000-8000-000000000002';
export const sampleAddress={id:null,label:'Home',recipientName:'Synthetic Customer',phone:'9876543210',addressLine1:'1 Synthetic Road',addressLine2:null,locality:'Test locality',city:'Mumbai',stateRegion:'Maharashtra',postalCode:'400001',countryCode:'IN',latitude:null,longitude:null,isDefault:false};
export function addressRow(address,owner=alice){return{id:address.id??randomUUID(),profile_id:owner,label:address.label,recipient_name:address.recipientName,phone:address.phone,address_line1:address.addressLine1,address_line2:address.addressLine2,locality:address.locality,city:address.city,state_region:address.stateRegion,postal_code:address.postalCode,country_code:address.countryCode,latitude:address.latitude,longitude:address.longitude,is_default:address.isDefault,created_at:'2026-11-10T00:00:00Z',updated_at:'2026-11-10T00:00:00Z'};}
/** Synthetic data adapter for HTTP/UI tests, never installed in the application. */
export function addressDatabase(initial=[]){
  const rows=initial.map(row=>({...row})),calls=[],rpcs=[];
  const client=owner=>({owner,from(table){if(table!=='addresses')throw Error('Unexpected table');const record={table,steps:[]};calls.push(record);let deleting=false,single=false,limit=Infinity,filters=[];
    const query={};for(const method of ['select','order'])query[method]=(...args)=>{record.steps.push([method,...args]);return query;};
    query.eq=(name,value)=>{filters.push([name,value]);record.steps.push(['eq',name,value]);return query;};query.delete=()=>{deleting=true;record.steps.push(['delete']);return query;};query.limit=value=>{limit=value;record.steps.push(['limit',value]);return query;};query.maybeSingle=()=>{single=true;return query;};
    query.then=(resolve,reject)=>{const selected=rows.filter(row=>filters.every(([field,value])=>row[field]===value));if(deleting)for(const row of selected)rows.splice(rows.indexOf(row),1);return Promise.resolve({data:single?selected[0]??null:selected.slice(0,limit).map(row=>({...row})),count:selected.length,error:null}).then(resolve,reject);};return query;
  }});
  const rpc=async(supabase,name,args)=>{
    rpcs.push([name,args]);if(name!=='save_my_address')throw Error('Unexpected RPC');
    const current=args.p_address_id?rows.find(row=>row.id===args.p_address_id&&row.profile_id===supabase.owner):null;
    if(args.p_address_id&&!current)return{error:{code:'P0002'},data:null};
    if(args.p_is_default)for(const row of rows)if(row.profile_id===supabase.owner)row.is_default=false;
    const address={id:args.p_address_id,label:args.p_label,recipientName:args.p_recipient_name,phone:args.p_phone,addressLine1:args.p_address_line1,addressLine2:args.p_address_line2,locality:args.p_locality,city:args.p_city,stateRegion:args.p_state_region,postalCode:args.p_postal_code,countryCode:args.p_country_code,latitude:args.p_latitude,longitude:args.p_longitude,isDefault:args.p_is_default};
    const saved=addressRow(address,supabase.owner);if(current)Object.assign(current,saved);else rows.push(saved);return{data:saved.id,error:null};
  };
  return{rows,calls,rpcs,client,rpc};
}
