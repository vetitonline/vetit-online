import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { startCheckoutDatabase } from './checkout-postgres-runner.mjs';
import { createPostgresOrderRepository,issuePostgresCheckoutQuote } from '../src/lib/commerce/postgres-order-repository.server.js';
import { createCheckoutOrder } from '../src/lib/commerce/checkout-service.js';

const literal=value=>"'"+String(value).replaceAll("'","''")+"'";
const json=value=>literal(JSON.stringify(value))+'::jsonb';
test('atomic checkout on isolated PostgreSQL 17, canonical baseline and seller/commerce migrations',{skip:process.env.VETIT_CHECKOUT_DB_TESTS!=='1'},async t=>{
  const db=await startCheckoutDatabase();const sql=db.sql;
  const alice=randomUUID(),bob=randomUUID(),seller=randomUUID(),catalog=randomUUID(),business=randomUUID(),category=randomUUID();
  const products=Array.from({length:30},()=>({id:randomUUID(),variant:randomUUID(),inventory:randomUUID()}));
  const request=(indices=[0],quantity=1)=>({lines:indices.map(index=>({listingId:products[index].id,productVariantId:products[index].variant,quantity})),customer:{name:'Synthetic Customer',email:'synthetic@example.invalid'},deliveryAddress:{recipientName:'Synthetic Customer',phone:'9876543210',addressLine1:'1 Synthetic Road',addressLine2:null,locality:null,city:'Mumbai',stateRegion:'Maharashtra',postalCode:'400001',countryCode:'IN'}});
  const actor=(id,source,role='authenticated')=>sql(`begin;set local role ${role};set local request.jwt.claim.sub=${literal(id??'')};${source};commit;`);
  const issue=async(input,owner=alice)=>JSON.parse(await actor(null,`select public.issue_checkout_quote('${owner}',${json(input)},500,100,'synthetic-rates-v1',300)`,'service_role'));
  const place=(quote,input,owner=alice,key=randomUUID(),expected=quote.totalMinor)=>actor(owner,`select public.place_my_order('${quote.id}','${key}',${expected},${json(input)})`).then(JSON.parse);
  const counts=()=>sql(`select jsonb_build_array((select count(*) from public.orders),(select count(*) from public.order_items),(select count(*) from public.fulfilments),(select count(*) from vetit_checkout.reservations),(select count(*) from vetit_checkout.checkouts),(select coalesce(sum(quantity_reserved),0) from public.inventory_levels));`).then(JSON.parse);
  try{
    await sql(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
      create schema auth;create table auth.users(id uuid primary key,email text,phone text,raw_user_meta_data jsonb not null default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
      grant usage on schema auth to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;
      create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
      alter table storage.objects enable row level security;
      create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:cardinality(string_to_array($1,'/'))-1] $$;
      grant usage on schema storage to anon,authenticated;grant select on storage.objects,storage.buckets to anon,authenticated;grant insert,update,delete on storage.objects to authenticated;`);
    await sql(await readFile(new URL('../supabase/test-project/20261009000000_vetit_marketplace_baseline.sql',import.meta.url),'utf8'));
    // Synthetic fixtures are created before installing the seller mutation guards.
    await sql(`insert into auth.users(id) values('${alice}'),('${bob}'),('${seller}'),('${catalog}');
      insert into public.businesses(id,display_name,verification_status) values('${business}','Synthetic Seller','verified');
      insert into public.business_memberships(business_id,profile_id,member_role) values('${business}','${seller}','owner'),('${business}','${catalog}','catalog_manager');
      insert into public.categories(id,name,slug) values('${category}','Synthetic products','synthetic-products');
      insert into public.markets(country_code,currency_code,market_status) values('IN','INR','active');
      ${products.map((p,index)=>`insert into public.listings(id,business_id,category_id,kind,title,slug,moderation_status) values('${p.id}','${business}','${category}','product','Synthetic ${index}','synthetic-${index}','published');
        insert into public.product_variants(id,listing_id,seller_sku,option_attributes) values('${p.variant}','${p.id}','SYNTHETIC-${index}','{"size":"M"}');
        insert into public.listing_prices(listing_id,product_variant_id,market_code,currency_code,amount_minor) values('${p.id}','${p.variant}','IN','INR',10000);
        insert into public.listing_markets values('${p.id}','IN','available','approved');
        insert into public.inventory_levels(id,business_id,product_variant_id,quantity_on_hand) values('${p.inventory}','${business}','${p.variant}',3);`).join('\n')}`);
    for(const path of ['supabase/test-project/20261009010000_business_private_fields.sql','supabase/migrations/20261008092024_vetit_seller_backend_foundation.sql','supabase/migrations/20261008210707_vetit_seller_security_hardening.sql','supabase/test-project/20261009100000_vetit_buyer_cart_inventory_fulfilment.sql','supabase/test-project/20261106160000_atomic_checkout.proposal.sql'])await sql(await readFile(new URL('../'+path,import.meta.url),'utf8'));

    await t.test('creates immutable snapshots, per-seller fulfilments and reservations in one transaction',async()=>{
      const input=request([0,1],2),quote=await issue(input),order=await place(quote,input);
      assert.equal(order.order_status,'pending');assert.equal(order.subtotal_minor,40000);assert.equal(order.total_minor,40600);
      const stored=JSON.parse(await sql(`select jsonb_build_object('items',(select count(*) from public.order_items where order_id='${order.id}'),'fulfilments',(select count(*) from public.fulfilments where order_id='${order.id}'),'reserved',(select sum(quantity) from vetit_checkout.reservations where order_id='${order.id}'),'snapshots',(select bool_and(business_id='${business}' and unit_price_minor=10000) from public.order_items where order_id='${order.id}'));`));
      assert.deepEqual(stored,{items:2,fulfilments:1,reserved:4,snapshots:true});
      await assert.rejects(actor(alice,`update public.orders set total_minor=1 where id='${order.id}'`),/permission denied/);
      await assert.rejects(sql(`update public.order_items set title_snapshot='Changed after purchase' where order_id='${order.id}';`),/snapshots are immutable/);
    });
    await t.test('same-key concurrent requests create exactly one order and reserve once; replay survives expiry',async()=>{
      const input=request([2],2),quote=await issue(input),key=randomUUID();
      const results=await Promise.all(Array.from({length:4},()=>place(quote,input,alice,key)));
      assert.equal(new Set(results.map(value=>value.id)).size,1);
      assert.equal(await sql(`select quantity_reserved from public.inventory_levels where id='${products[2].inventory}';`),'2');
      await sql(`update vetit_checkout.quotes set expires_at=clock_timestamp()-interval '1 second' where id='${quote.id}';`);
      assert.equal((await place(quote,input,alice,key)).id,results[0].id);
      const changed=request([2],1);await assert.rejects(place(quote,changed,alice,key),/conflict/);
      const fresh=await issue(input);await assert.rejects(place(fresh,input,alice,key),/conflict/);
      await assert.rejects(place(quote,input,alice,randomUUID()),/already used/);
    });
    await t.test('different customers racing the last stock cannot oversell',async()=>{
      const input=request([3],2),a=await issue(input),b=await issue(input,bob);
      const results=await Promise.allSettled([place(a,input),place(b,input,bob)]);
      assert.equal(results.filter(value=>value.status==='fulfilled').length,1);
      assert.match(results.find(value=>value.status==='rejected').reason.message,/Insufficient inventory/);
      assert.equal(await sql(`select quantity_reserved from public.inventory_levels where id='${products[3].inventory}';`),'2');
    });
    await t.test('opposite multi-item cart order uses deterministic locks without deadlocks',async()=>{
      const a=request([4,5],1),b=request([5,4],1),aq=await issue(a),bq=await issue(b,bob);
      const results=await Promise.all([place(aq,a),place(bq,b,bob)]);assert.equal(results.length,2);
      assert.equal(await sql(`select sum(quantity_reserved) from public.inventory_levels where id in ('${products[4].inventory}','${products[5].inventory}');`),'4');
    });
    await t.test('late-line stock failure rolls back order, earlier reservations and idempotency entry',async()=>{
      const input=request([6,7],2),quote=await issue(input);
      const last=quote;await sql(`update public.inventory_levels set quantity_on_hand=0 where id='${products[7].inventory}';`);
      const before=await counts();const key=randomUUID();await assert.rejects(place(last,input,alice,key),/Insufficient inventory/);assert.deepEqual(await counts(),before);
      assert.equal(await sql(`select quantity_reserved from public.inventory_levels where id='${products[6].inventory}';`),'0');
      await sql(`update public.inventory_levels set quantity_on_hand=3 where id='${products[7].inventory}';`);
      assert.equal((await place(quote,input,alice,key)).order_status,'pending');
    });
    await t.test('caller transaction rollback restores all inventory and order records',async()=>{
      const input=request([8],2),quote=await issue(input),key=randomUUID(),before=await counts();
      await sql(`begin;set local role authenticated;set local request.jwt.claim.sub='${alice}';select public.place_my_order('${quote.id}','${key}',${quote.totalMinor},${json(input)});rollback;`);
      assert.deepEqual(await counts(),before);assert.equal(await sql(`select quantity_reserved from public.inventory_levels where id='${products[8].inventory}';`),'0');
    });
    await t.test('unexpected downstream trigger failure rolls back a fully allocated checkout',async()=>{
      await sql(`create function public.synthetic_checkout_failure() returns trigger language plpgsql as $$ begin
        if current_setting('vetit.test.failure',true)='yes' then raise exception 'Synthetic downstream failure';end if;return new;end $$;
        create trigger synthetic_checkout_failure after insert on vetit_checkout.order_events for each row execute function public.synthetic_checkout_failure();`);
      const input=request([15],2),quote=await issue(input),key=randomUUID(),before=await counts();
      await assert.rejects(actor(alice,`set local vetit.test.failure='yes';select public.place_my_order('${quote.id}','${key}',${quote.totalMinor},${json(input)})`),/Synthetic downstream failure/);
      assert.deepEqual(await counts(),before);assert.equal(await sql(`select quantity_reserved from public.inventory_levels where id='${products[15].inventory}';`),'0');
      assert.equal((await place(quote,input,alice,key)).order_status,'pending');
    });
    await t.test('quote expiry is checked after a contended inventory lock',async()=>{
      const input=request([16]),quote=await issue(input),before=await counts();
      const hold=sql(`set application_name='checkout_stock_barrier';begin;select id from public.inventory_levels where id='${products[16].inventory}' for update;select pg_sleep(1);commit;`);
      let locked=false;for(let i=0;i<40;i++){if(await sql(`select count(*) from pg_stat_activity where application_name='checkout_stock_barrier' and wait_event='PgSleep';`)==='1'){locked=true;break;}await new Promise(resolve=>setTimeout(resolve,10));}
      assert.equal(locked,true,'Inventory holder must have reached the barrier');
      await sql(`update vetit_checkout.quotes set expires_at=clock_timestamp()+interval '100 milliseconds' where id='${quote.id}';`);
      await assert.rejects(place(quote,input),/expired/);await hold;
      assert.deepEqual(await counts(),before);
    });
    await t.test('price expiry during an inventory wait invalidates the checkout without partial reservation',async()=>{
      const input=request([20]),quote=await issue(input),before=await counts();
      const hold=sql(`set application_name='checkout_price_barrier';begin;select id from public.inventory_levels where id='${products[20].inventory}' for update;select pg_sleep(1.5);commit;`);
      let locked=false;for(let i=0;i<40;i++){if(await sql(`select count(*) from pg_stat_activity where application_name='checkout_price_barrier' and wait_event='PgSleep';`)==='1'){locked=true;break;}await new Promise(resolve=>setTimeout(resolve,10));}assert.equal(locked,true);
      await sql(`begin;alter table public.listing_prices disable trigger guard_seller_listing_prices;
        update public.listing_prices set valid_to=clock_timestamp()+interval '500 milliseconds' where listing_id='${products[20].id}';
        alter table public.listing_prices enable trigger guard_seller_listing_prices;commit;`);
      await assert.rejects(place(quote,input),/price unavailable/);await hold;assert.deepEqual(await counts(),before);
    });
    await t.test('unauthorized actors cannot issue quotes, spoof customers, read private rows or create orders directly',async()=>{
      const input=request([9]),quote=await issue(input);
      await assert.rejects(actor(alice,`select public.issue_checkout_quote('${alice}',${json(input)},0,0,'client',300)`),/permission denied/);
      await assert.rejects(place(quote,input,bob),/quote not found/);
      await assert.rejects(actor(null,`select public.place_my_order('${quote.id}','${randomUUID()}',${quote.totalMinor},${json(input)})`,'anon'),/permission denied/);
      for(const table of ['vetit_checkout.quotes','vetit_checkout.reservations','public.inventory_levels'])await assert.rejects(actor(alice,`select * from ${table}`),/permission denied/);
      await assert.rejects(actor(alice,`insert into public.orders(customer_profile_id,market_code,currency_code,subtotal_minor,total_minor) values('${alice}','IN','INR',1,1)`),/permission denied/);
    });
    await t.test('totals, addresses, option ownership, inactive market and untracked base products fail closed',async()=>{
      const input=request([10]),quote=await issue(input),before=await counts();
      await assert.rejects(place(quote,input,alice,randomUUID(),1),/details or total/);
      await assert.rejects(place(quote,{...input,deliveryAddress:{...input.deliveryAddress,city:'Different City'}}),/details or total/);
      await assert.rejects(issue({...input,lines:[{...input.lines[0],productVariantId:products[11].variant}]}),/option unavailable/);
      await assert.rejects(issue({...input,lines:[{listingId:products[10].id,quantity:1}]}),/stock-tracked/);
      await sql(`update public.markets set market_status='maintenance' where country_code='IN';`);
      await assert.rejects(place(quote,input),/Market unavailable/);
      await sql(`update public.markets set market_status='active' where country_code='IN';`);
      assert.deepEqual(await counts(),before);
    });
    await t.test('expired quotes and authoritative price changes fail without inventory side effects',async()=>{
      const input=request([12]),quote=await issue(input),before=await counts();
      await sql(`update vetit_checkout.quotes set expires_at=clock_timestamp()-interval '1 second' where id='${quote.id}';`);
      await assert.rejects(place(quote,input),/expired/);
      const fresh=await issue(input);
      // Owner-only fixture mutation simulates a trusted catalogue correction; keep the NEW parent-lock trigger active.
      await sql(`begin;alter table public.listing_prices disable trigger guard_seller_listing_prices;
        update public.listing_prices set amount_minor=11000 where listing_id='${products[12].id}';
        alter table public.listing_prices enable trigger guard_seller_listing_prices;commit;`);
      await assert.rejects(place(fresh,input),/price, seller or snapshot changed/);assert.deepEqual(await counts(),before);
    });
    await t.test('seller suspension and category withdrawal invalidate a previously issued quote',async()=>{
      const input=request([17]),quote=await issue(input),before=await counts();
      await actor(seller,`set local request.jwt.claims='{"app_metadata":{"vetit_admin":true}}';select public.review_seller_business('${business}','suspended')`);
      await assert.rejects(place(quote,input),/Seller unavailable/);
      await actor(seller,`set local request.jwt.claims='{"app_metadata":{"vetit_admin":true}}';select public.review_seller_business('${business}','verified')`);
      await sql(`update public.categories set moderation_status='archived' where id='${category}';`);
      await assert.rejects(place(quote,input),/Category unavailable/);
      await sql(`update public.categories set moderation_status='active' where id='${category}';`);
      assert.deepEqual(await counts(),before);
    });
    await t.test('inventory owned by a different seller cannot back a checkout reservation',async()=>{
      const otherBusiness=randomUUID(),input=request([24]),quote=await issue(input),before=await counts();
      await sql(`insert into public.businesses(id,display_name,verification_status) values('${otherBusiness}','Other Synthetic Seller','verified');
        update public.inventory_levels set business_id='${otherBusiness}' where id='${products[24].inventory}';`);
      await assert.rejects(place(quote,input),/Insufficient inventory/);assert.deepEqual(await counts(),before);
      await assert.rejects(actor(seller,`update public.inventory_levels set quantity_on_hand=99 where id='${products[24].inventory}'`),/permission denied/);
      await sql(`update public.inventory_levels set business_id='${business}' where id='${products[24].inventory}';`);
    });
    await t.test('customer cancellation releases once and cannot cancel another customer or a paid order',async()=>{
      const input=request([13],2),quote=await issue(input),order=await place(quote,input);
      await assert.rejects(actor(bob,`select public.cancel_my_checkout_order('${order.id}')`),/not found/);
      for(let i=0;i<2;i++)assert.equal(JSON.parse(await actor(alice,`select public.cancel_my_checkout_order('${order.id}')`)).order_status,'cancelled');
      assert.equal(await sql(`select quantity_reserved from public.inventory_levels where id='${products[13].inventory}';`),'0');
      assert.equal(await sql(`select count(*) from vetit_checkout.order_events where order_id='${order.id}' and new_status='cancelled';`),'1');
      assert.equal((await place(quote,input,alice,(await sql(`select idempotency_key from vetit_checkout.checkouts where order_id='${order.id}';`)))).order_status,'cancelled');
    });
    await t.test('captured-payment proof, seller role and shipment state govern consume/delivery transitions',async()=>{
      const input=request([14],2),quote=await issue(input),order=await place(quote,input);
      const shipment=await sql(`select id from public.fulfilments where order_id='${order.id}';`);
      await assert.rejects(actor(alice,`select public.confirm_checkout_order('${order.id}')`),/permission denied/);
      await assert.rejects(actor(null,`select public.confirm_checkout_order('${order.id}')`,'service_role'),/captured payment/);
      await assert.rejects(actor(seller,`select public.advance_checkout_fulfilment('${shipment}','packed')`),/Paid order/);
      await sql(`insert into public.payments(order_id,customer_profile_id,provider,provider_payment_reference,status,amount_minor,currency_code) values('${order.id}','${alice}','sandbox','${randomUUID()}','captured',${order.total_minor},'INR');`);
      assert.equal(JSON.parse(await actor(null,`select public.confirm_checkout_order('${order.id}')`,'service_role')).order_status,'confirmed');
      assert.equal(JSON.parse(await actor(null,`select public.confirm_checkout_order('${order.id}')`,'service_role')).order_status,'confirmed');
      assert.equal(await sql(`select count(*) from vetit_checkout.order_events where order_id='${order.id}' and new_status='confirmed';`),'1');
      await assert.rejects(actor(alice,`select public.cancel_my_checkout_order('${order.id}')`),/unpaid pending/);
      await assert.rejects(actor(catalog,`select public.advance_checkout_fulfilment('${shipment}','packed')`),/access denied/);
      await assert.rejects(actor(bob,`select public.advance_checkout_fulfilment('${shipment}','packed')`),/access denied/);
      await actor(seller,`select public.advance_checkout_fulfilment('${shipment}','packed')`);
      await assert.rejects(actor(seller,`select public.advance_checkout_fulfilment('${shipment}','shipped')`),/Carrier and tracking/);
      await actor(seller,`select public.advance_checkout_fulfilment('${shipment}','shipped','Synthetic carrier','TEST-ONLY')`);
      assert.equal(await sql(`select quantity_on_hand||':'||quantity_reserved from public.inventory_levels where id='${products[14].inventory}';`),'1:0');
      await actor(seller,`select public.advance_checkout_fulfilment('${shipment}','shipped','Synthetic carrier','TEST-ONLY')`);
      assert.equal(await sql(`select count(*) from public.inventory_movements where inventory_level_id='${products[14].inventory}';`),'1');
      await assert.rejects(actor(null,`select public.complete_checkout_order('${order.id}')`,'service_role'),/delivered/);
      await actor(seller,`select public.advance_checkout_fulfilment('${shipment}','delivered')`);
      assert.equal(JSON.parse(await actor(null,`select public.complete_checkout_order('${order.id}')`,'service_role')).order_status,'fulfilled');
      assert.equal(await actor(bob,`select count(*) from public.orders where id='${order.id}'`),'0');
      assert.equal(await actor(seller,`select count(*) from public.order_items where order_id='${order.id}'`),'1');
    });
    await t.test('JavaScript repository creates, replays after expiry and cancels through real PostgreSQL RPC functions',async()=>{
      const allowed=new Set(['issue_checkout_quote','get_my_checkout_order','place_my_order','cancel_my_checkout_order']);
      const client=(owner,role)=>({rpc:async(name,args)=>{
        assert.ok(allowed.has(name));
        const values=Object.values(args).map(value=>value===null?'null':typeof value==='object'?json(value):typeof value==='number'?String(value):literal(value));
        return{data:JSON.parse(await actor(owner,`select public.${name}(${values.join(',')})`,role)||'null'),error:null};
      }});
      const input=request([18],1),key=randomUUID();
      const quote=await issuePostgresCheckoutQuote(client(null,'service_role'),input,{approved:true,customerId:alice,deliveryMinor:500,taxMinor:100,rateReference:'synthetic-adapter'});
      const repo=createPostgresOrderRepository(client(alice,'authenticated'),{approved:true,quoteId:quote.id});
      const services={repository:repo,loadProducts:async()=>[{id:products[18].id,title:'Synthetic 18',category:'Synthetic',sellerName:'Synthetic Seller',currencyCode:'INR',priceMinor:10000,priceIsFrom:false,options:[{variantId:products[18].variant,priceMinor:10000,stockQuantity:3}]}],
        shipping:{quote:async()=>({id:'synthetic-adapter',amountMinor:500,currencyCode:'INR',expiresAt:quote.expiresAt})},taxes:{quote:async()=>({amountMinor:100,currencyCode:'INR'})}};
      const command={...input,idempotencyKey:key,expectedTotalMinor:quote.totalMinor};
      const created=await createCheckoutOrder(command,alice,services);assert.equal(created.state,'created');
      await sql(`update vetit_checkout.quotes set expires_at=clock_timestamp()-interval '1 second' where id='${quote.id}';`);
      const replay=await createCheckoutOrder(command,alice,{...services,loadProducts:async()=>{throw Error('Expired offer must not be repriced');}});
      assert.equal(replay.state,'existing');assert.equal(replay.order.id,created.order.id);
      assert.equal((await repo.cancelOrder({orderId:created.order.id,customerId:alice})).order_status,'cancelled');
      assert.equal(await sql(`select quantity_reserved from public.inventory_levels where id='${products[18].inventory}';`),'0');
    });
    await t.test('shipment transaction rollback restores stock, reservations, status and movement ledger',async()=>{
      const input=request([19],2),quote=await issue(input),order=await place(quote,input);
      const shipment=await sql(`select id from public.fulfilments where order_id='${order.id}';`);
      await sql(`insert into public.payments(order_id,customer_profile_id,provider,provider_payment_reference,status,amount_minor,currency_code) values('${order.id}','${alice}','sandbox','${randomUUID()}','captured',${order.total_minor},'INR');`);
      await actor(null,`select public.confirm_checkout_order('${order.id}')`,'service_role');
      await sql(`begin;set local role authenticated;set local request.jwt.claim.sub='${seller}';select public.advance_checkout_fulfilment('${shipment}','packed');select public.advance_checkout_fulfilment('${shipment}','shipped','Synthetic','ROLLBACK');rollback;`);
      assert.equal(await sql(`select quantity_on_hand||':'||quantity_reserved from public.inventory_levels where id='${products[19].inventory}';`),'3:2');
      assert.equal(await sql(`select status from public.fulfilments where id='${shipment}';`),'pending');
      assert.equal(await sql(`select consumed from vetit_checkout.reservations where order_id='${order.id}';`),'0');
      assert.equal(await sql(`select count(*) from public.inventory_movements where inventory_level_id='${products[19].inventory}';`),'0');
    });
    await t.test('saved delivery addresses enforce ownership, default rollback and immutable existing order snapshots',async()=>{
      const save=(owner,id,label,defaultAddress)=>actor(owner,`select public.save_my_address(${id?literal(id):'null'},${literal(label)},'Synthetic Customer','9876543210','9 Address-book Road',null,null,'Mumbai','Maharashtra','400001','IN',null,null,${defaultAddress})`);
      const snapshots=()=>sql(`select jsonb_agg(delivery_address_snapshot order by id) from public.orders where customer_profile_id='${alice}';`);
      const before=await snapshots();
      const home=await save(alice,null,'Home',true),foreign=await save(bob,null,'Foreign',true),work=await save(alice,null,'Work',true);
      assert.equal(await actor(alice,'select id from public.addresses where is_default'),work);
      assert.equal(await actor(alice,`select count(*) from public.addresses where id='${foreign}'`),'0');
      await assert.rejects(save(alice,foreign,'Attempted foreign edit',true),/Address not found/);
      assert.equal(await actor(alice,'select id from public.addresses where is_default'),work,'Failed foreign update must roll back the earlier default reset');
      await actor(alice,`delete from public.addresses where id='${foreign}'`);
      assert.equal(await actor(bob,`select count(*) from public.addresses where id='${foreign}' and is_default`),'1');
      await save(alice,work,'Updated work',true);
      assert.equal(await actor(alice,`select label from public.addresses where id='${work}'`),'Updated work');
      await actor(alice,`delete from public.addresses where id='${home}'`);
      assert.equal(await snapshots(),before,'Address-book edits/removal cannot rewrite placed-order delivery snapshots');
    });
  }finally{await db.stop();}
});
