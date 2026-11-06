import { readJsonBody } from '../api/json-body.js';
import { isSameOriginMutation } from '../api/request-security.js';
import { CheckoutError, reviewCheckout, createCheckoutOrder } from './checkout-service.js';
import { CheckoutQuoteError } from './checkout-quote.js';
import { BuyerInputError } from '../buyer/validation.js';
export function createCheckoutHandler({ authenticate, dependencies, createOrder = false }) {
  const json = (body,status=200) => new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  return async ({request,cookies}) => {
    try {
      if (!isSameOriginMutation(request)) return json({state:'forbidden'},403);
      const auth = await authenticate(request,cookies);
      if (auth.state !== 'authenticated') return json({state:auth.state === 'unavailable'?'unavailable':'unauthorized'},auth.state === 'unavailable'?503:401);
      if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return json({state:'invalid_request'},415);
      if (createOrder && request.headers.get('x-vetit-profile-id') !== auth.user.id) return json({state:'session_changed'},409);
      const body = await readJsonBody(request);
      if (!body.ok) return json({state:'invalid_request'},body.status);
      const services = await dependencies(auth,request,cookies);
      const result = createOrder ? await createCheckoutOrder(body.value,auth.user.id,services) : { ...await reviewCheckout(body.value,services),profileId:auth.user.id };
      return json(result,createOrder?201:200);
    } catch(error) {
      const status = error instanceof CheckoutError ? error.status : error instanceof CheckoutQuoteError || error instanceof BuyerInputError ? 400 : 503;
      return json({state:status===503?'unavailable':'invalid_request',message:status===503?'Checkout is unavailable. No payment has been taken. Reconcile any existing order before retrying.':error.message},status);
    }
  };
}
