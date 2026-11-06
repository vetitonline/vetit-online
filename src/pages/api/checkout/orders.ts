import { authenticateApiRequest } from '../../../lib/supabase/api-auth';
import { createCheckoutHandler } from '../../../lib/commerce/checkout-api.js';
import { checkoutDependencies, HOSTED_ORDER_CREATION_ENABLED } from '../../../lib/commerce/runtime-checkout';
export const prerender=false;
export const POST=createCheckoutHandler({authenticate:authenticateApiRequest,dependencies:checkoutDependencies,createOrder:true,orderCreationEnabled:HOSTED_ORDER_CREATION_ENABLED});
