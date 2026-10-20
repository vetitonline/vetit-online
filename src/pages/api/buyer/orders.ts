import { authenticateApiRequest } from '../../../lib/supabase/api-auth';
import { createBuyerOrderHistoryHandler } from '../../../lib/buyer/order-history.js';
export const prerender=false;
export const GET=createBuyerOrderHistoryHandler({authenticate:authenticateApiRequest});
