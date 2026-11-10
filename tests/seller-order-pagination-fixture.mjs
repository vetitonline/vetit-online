import assert from 'node:assert/strict';
import {createSellerOrdersHandler} from '../src/lib/seller/orders.js';
export const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const owner=id(1),other=id(2),business=id(3),order=id(4),time='2026-11-10T10:00:00.123456+00:00';
export function paginationFixture(itemCount=251,shipmentCount=251){
 const calls=[],writes=[];let actor=owner;
 const tables={business_memberships:[{business_id:business,profile_id:owner,member_role:'owner',membership_status:'active'}],businesses:[{id:business,is_active:true,archived_at:null}],
 order_items:Array.from({length:itemCount},(_,n)=>({id:id(1000+n),business_id:business,order_id:order,listing_id:id(5),product_variant_id:null,title_snapshot:`Synthetic ${n}`,quantity:1,unit_price_minor:100,currency_code:'INR',created_at:time,private:'SECRET'})),
 fulfilments:Array.from({length:shipmentCount},(_,n)=>({id:id(2000+n),business_id:business,order_id:order,status:'packed',carrier:null,tracking_reference:null,shipped_at:null,delivered_at:null,created_at:time,private:'SECRET'}))};
 const client={from(table){const steps=[];calls.push({table,steps});let rows=[...(tables[table]??[])],limit=Infinity,single=false;const ordering=[];
 const q={select:(_fields,options)=>{steps.push(['select',_fields,options]);return q;},eq:(key,value)=>{steps.push(['eq',key,value]);rows=rows.filter(r=>r[key]===value);return q;},in:(key,values)=>{steps.push(['in',key,values]);rows=rows.filter(r=>values.includes(r[key]));return q;},is:(key,value)=>{rows=rows.filter(r=>r[key]===value);return q;},order:(key,options)=>{steps.push(['order',key,options]);ordering.push(key);return q;},limit:value=>{steps.push(['limit',value]);limit=value;return q;},maybeSingle:()=>{single=true;return q;},or:filter=>{
  steps.push(['or',filter]);const m=filter.match(/^created_at\.lt\.(.+),and\(created_at\.eq\.(.+),id\.lt\.([a-f0-9-]+)\)$/);assert.ok(m,filter);assert.equal(m[1],m[2]);rows=rows.filter(r=>r.created_at<m[1]||r.created_at===m[1]&&r.id<m[3]);return q;
 },then(resolve,reject){rows.sort((a,b)=>{for(const key of ordering){if(a[key]!==b[key])return a[key]<b[key]?1:-1;}return 0;});return Promise.resolve({data:single?rows[0]??null:rows.slice(0,limit),count:rows.length,error:null}).then(resolve,reject);}};return q;
 }};
 const handler=createSellerOrdersHandler({authenticate:async()=>({state:'authenticated',user:{id:actor},supabase:client}),rpc:async(_client,name,args)=>{writes.push({name,args});const row=tables.fulfilments.find(r=>r.id===args.p_fulfilment_id);row.status=args.p_next_status;row.carrier=args.p_carrier;row.tracking_reference=args.p_tracking_reference;if(row.status==='shipped')row.shipped_at=time;return{data:row.id};}});
 const fetchImpl=async(url,options={})=>handler({request:new Request(url,options)});
 return{tables,calls,writes,fetchImpl,actor:value=>{actor=value;},read:(query='',headers={})=>handler({request:new Request('https://vetit.invalid/api/seller/orders'+query,{headers})})};
}
