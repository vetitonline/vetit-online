import type {APIRoute} from 'astro';
import {readPublicCatalogueWindow} from '../../../lib/marketplace/catalogue-window';
export const prerender=false;
export const GET:APIRoute=async({request,cookies})=>{
 const result=await readPublicCatalogueWindow(request,cookies);
 return Response.json(result.body,{status:result.status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
};
