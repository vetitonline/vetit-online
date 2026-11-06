import { authenticateApiRequest } from '../../../lib/supabase/api-auth';
import { callProposedCommerceRpc } from '../../../lib/supabase/proposed-commerce-rpc';
import { createSellerOrdersHandler } from '../../../lib/seller/orders.js';
export const prerender=false;
export const GET=createSellerOrdersHandler({authenticate:authenticateApiRequest,rpc:callProposedCommerceRpc});
export const POST=GET;
