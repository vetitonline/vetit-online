import { authenticateApiRequest } from '../../../lib/supabase/api-auth';
import { createCheckoutHandler } from '../../../lib/commerce/checkout-api.js';
import { checkoutDependencies } from '../../../lib/commerce/runtime-checkout';
export const prerender=false;
export const POST=createCheckoutHandler({authenticate:authenticateApiRequest,dependencies:checkoutDependencies});
