import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const commerceSql = await readFile(new URL('../supabase/test-project/20261009100000_vetit_buyer_cart_inventory_fulfilment.sql', import.meta.url), 'utf8');
const bookingSql = await readFile(new URL('../supabase/test-project/20261009110000_vetit_service_booking_transaction.sql', import.meta.url), 'utf8');
const databaseTypes = await readFile(new URL('../src/lib/supabase/database.types.ts', import.meta.url), 'utf8');

test('local commerce proposals are additive transaction scripts without destructive DDL or fixture writes', () => {
  for (const sql of [commerceSql, bookingSql]) {
    assert.match(sql.trim(), /^--[\s\S]*?\bbegin;[\s\S]*\bcommit;\s*$/i);
    assert.doesNotMatch(sql, /\b(drop\s+(table|schema|policy|function)|truncate\s+|alter\s+table[\s\S]{0,100}\bdrop\s+column)\b/i);
    assert.doesNotMatch(sql, /insert\s+into\s+public\.(profiles|businesses|categories|animal_species|listings)\b/i);
  }
});

test('privileged commerce functions have an empty search path and authenticated-only execution grants', () => {
  for (const [sql, functions] of [
    [commerceSql, ['set_seller_inventory', 'advance_seller_fulfilment']],
    [bookingSql, ['book_my_appointment']],
  ]) {
    for (const name of functions) {
      const definition = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\b[\\s\\S]*?as \\$function\\$`, 'i');
      const match = sql.match(definition);
      assert.ok(match, `${name} definition is present`);
      assert.match(match[0], /security\s+definer/i);
      assert.match(match[0], /set\s+search_path\s*=\s*''/i);
      assert.match(sql, new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${name}\\(`, 'i'));
      assert.match(sql, new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${name}\\([^;]+\\)\\s+to\\s+authenticated`, 'i'));
    }
  }
});

test('commerce SQL retains ownership, current-price, row-lock and total-integrity guards', () => {
  assert.match(commerceSql, /profile_id\s*=\s*requester_id/);
  assert.match(commerceSql, /membership_status\s*=\s*'active'/);
  assert.match(commerceSql, /quantity_reserved/);
  assert.match(commerceSql, /for\s+update\s+of\s+oi/i);
  assert.match(commerceSql, /calculated_subtotal\s*<>\s*saved_subtotal/i);
  assert.match(commerceSql, /valid_from\s*<=\s*now\(\)/i);
});

test('appointment SQL locks an available slot and derives service identity and price server-side', () => {
  assert.match(bookingSql, /from\s+public\.appointment_slots\s+s[\s\S]*?for\s+update/i);
  assert.match(bookingSql, /l\.moderation_status\s*=\s*'published'/i);
  assert.match(bookingSql, /b\.verification_status\s*=\s*'verified'/i);
  assert.match(bookingSql, /from\s+public\.listing_prices\s+lp/i);
  assert.match(bookingSql, /set\s+status\s*=\s*'booked'/i);
  assert.match(bookingSql, /insert\s+into\s+public\.bookings/i);
  assert.match(bookingSql, /bookings_one_per_appointment_slot_idx/i);
});

test('generated database types describe applied constraints and keep unapplied RPCs separate', () => {
  for (const constraint of [
    'cart_items_variant_listing_fk',
    'listing_prices_variant_listing_fk',
    'order_items_variant_listing_fk',
    'inventory_movements_related_order_item_id_fkey',
    'payments_booking_id_fkey',
  ]) assert.ok(databaseTypes.includes(constraint), `${constraint} is represented`);
  assert.ok(!databaseTypes.includes('fulfilment_events:'), 'unapplied event table is not represented as installed');
  assert.ok(!databaseTypes.includes('book_my_appointment:'), 'unapplied appointment RPC is kept out of generated DB types');
  assert.ok(databaseTypes.includes('get_my_seller_businesses:'), 'applied seller RPCs remain represented');
});
