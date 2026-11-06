import { authenticateApiRequest } from '../../../lib/supabase/api-auth';
import { callProposedCommerceRpc } from '../../../lib/supabase/proposed-commerce-rpc';
import { createSavedCartHandler } from '../../../lib/buyer/saved-cart-api.js';

export const prerender = false;
export const GET = createSavedCartHandler({ authenticate: authenticateApiRequest, rpc: callProposedCommerceRpc });
export const POST = GET;
export const DELETE = GET;
