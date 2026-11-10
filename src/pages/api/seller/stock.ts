import { authenticateApiRequest } from '../../../lib/supabase/api-auth';
import { createInventoryHandler } from '../../../lib/seller/inventory-api.js';
export const prerender=false;
export const GET=createInventoryHandler({authenticate:authenticateApiRequest});
export const POST=GET;
