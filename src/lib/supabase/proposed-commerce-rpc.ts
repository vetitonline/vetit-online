import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/** RPC contracts supplied by local, unapplied Test-only commerce proposals. */
type ProposedCommerceRpcs = {
  save_my_address: {
    args: {
      p_address_id: string | null; p_label: string | null; p_recipient_name: string; p_phone: string | null;
      p_address_line1: string; p_address_line2: string | null; p_locality: string | null; p_city: string;
      p_state_region: string | null; p_postal_code: string | null; p_country_code: string;
      p_latitude: number | null; p_longitude: number | null; p_is_default: boolean;
    };
    returns: string;
  };
  set_my_cart_item: {
    args: { p_listing_id: string; p_product_variant_id: string | null; p_quantity: number; p_market_code: string };
    returns: string;
  };
  remove_my_cart_item: { args: { p_cart_item_id: string }; returns: string | null };
  set_seller_inventory: {
    args: { p_business_id: string; p_product_variant_id: string; p_quantity_on_hand: number; p_stock_location: string | null };
    returns: string;
  };
  advance_seller_fulfilment: {
    args: { p_fulfilment_id: string; p_next_status: string; p_carrier: string | null; p_tracking_reference: string | null };
    returns: string;
  };
  book_my_appointment: { args: { p_appointment_slot_id: string; p_market_code: string }; returns: string };
};

type RpcError = { code: string; message: string };
type RpcResult<Name extends keyof ProposedCommerceRpcs> = {
  data: ProposedCommerceRpcs[Name]['returns'] | null;
  error: RpcError | null;
};

/**
 * Keep the generated Database type aligned with the applied Test schema while
 * allowing APIs to compile against explicitly unapplied, versioned contracts.
 * Calling one before its migration exists returns Supabase's normal RPC error.
 */
export async function callProposedCommerceRpc<Name extends keyof ProposedCommerceRpcs>(
  client: SupabaseClient<Database>,
  name: Name,
  args: ProposedCommerceRpcs[Name]['args'],
): Promise<RpcResult<Name>> {
  const invoke = client.rpc.bind(client) as unknown as (
    functionName: Name,
    functionArgs: object,
  ) => PromiseLike<RpcResult<Name>>;
  return await invoke(name, args);
}
