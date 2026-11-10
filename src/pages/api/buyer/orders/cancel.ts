import { authenticateApiRequest } from '../../../../lib/supabase/api-auth';
import { createBuyerOrderCancelHandler } from '../../../../lib/buyer/order-cancel-api.js';
export const prerender=false;
export const POST=createBuyerOrderCancelHandler({authenticate:authenticateApiRequest});
