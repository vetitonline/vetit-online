import { normalizeCheckout } from './checkout-service.js';
import { requestCheckoutQuote } from './quote-client.js';
export async function requestCheckoutReview(input, { baseUrl=globalThis.location?.origin,fetchImpl=fetch,signal,accessToken,profileId }={}) {
  const payload = normalizeCheckout(input);
  const origin = new URL(baseUrl);
  if (!['http:','https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw Error('Checkout origin is invalid.');
  if (accessToken !== undefined && (typeof accessToken !== 'string' || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(accessToken) || accessToken.length>8192)) throw Error('Sign-in token is invalid.');
  if(profileId!==undefined&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(profileId))throw Error('Account identity is invalid.');
  const response = await fetchImpl(new URL('/api/checkout/review',origin),{method:'POST',credentials:accessToken?'omit':'same-origin',redirect:'error',cache:'no-store',signal,headers:{'content-type':'application/json',accept:'application/json',...(accessToken?{authorization:`Bearer ${accessToken}`}:{ }),...(profileId?{'x-vetit-profile-id':profileId}:{})},body:JSON.stringify(payload)});
  if (!response.ok) {
    // Only a stable, reviewed code may replace the generic error; never display
    // arbitrary API/database messages in a customer checkout.
    let stockUnavailable=false;
    if(response.status===400){try{stockUnavailable=(await response.json()).code==='stock_unavailable';}catch{}}
    throw Object.assign(Error(response.status===401?'Sign in to review checkout.':response.status===409?'Your account changed. Reload your saved addresses and cart.':stockUnavailable?'Selected quantity exceeds current stock. Update your cart and review checkout again.':'Checkout review is unavailable. No order or payment has been placed.'),{status:response.status});
  }
  const body = await response.json();
  if(body?.apiVersion!==1 || body.state!=='review_only' || body.checkoutEnabled!==false || body.payment?.state!=='disabled' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.profileId) || !Array.isArray(body.blockers) || !body.blockers.every(value=>typeof value==='string')) throw Error('Checkout response is invalid.');
  const summary = await requestCheckoutQuote(payload.lines,{baseUrl:origin.origin,signal,fetchImpl:async()=>Response.json({...body.summary,apiVersion:1})});
  const validAmount=value=>Number.isSafeInteger(value)&&value>=0;
  if(body.shipping!==null && (!body.shipping || body.shipping.currencyCode!=='INR' || !validAmount(body.shipping.amountMinor) || !Number.isFinite(Date.parse(body.shipping.expiresAt)) || Date.parse(body.shipping.expiresAt)<=Date.now())) throw Error('Shipping quote is invalid or expired.');
  if(!(body.taxMinor===null||validAmount(body.taxMinor)) || !(body.totalMinor===null||validAmount(body.totalMinor))) throw Error('Checkout charges are invalid.');
  const total=body.shipping&&body.taxMinor!==null?summary.subtotalMinor+body.shipping.amountMinor+body.taxMinor:null;
  if(body.totalMinor!==total) throw Error('Checkout totals are invalid.');
  return {profileId:body.profileId,summary,shipping:body.shipping,taxMinor:body.taxMinor,totalMinor:body.totalMinor,blockers:body.blockers};
}
