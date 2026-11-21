import {authenticateApiRequest} from '../../../lib/supabase/api-auth';
import {createAdminOrdersHandler} from '../../../lib/admin/orders.js';
export const prerender=false;
export const GET=createAdminOrdersHandler({authenticate:authenticateApiRequest});
