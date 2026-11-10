import {isSellerUuid} from './validation.js';
import {SellerCatalogueError} from './catalogue-contract.js';
export async function requestSellerCatalogue({baseUrl,accessToken,signal,command,profileId,fetchImpl=fetch}){
 const url=new URL(baseUrl);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new SellerCatalogueError(400);
 if(accessToken!==undefined&&(typeof accessToken!=='string'||!accessToken||accessToken.length>8192||/\s/.test(accessToken)))throw new SellerCatalogueError(401);
 if((command||profileId!==undefined)&&!isSellerUuid(profileId))throw new SellerCatalogueError(400);
 const response=await fetchImpl(new URL('/api/seller/catalogue',url),{method:command?'POST':'GET',headers:{accept:'application/json',...(accessToken?{authorization:`Bearer ${accessToken}`} :{}),...(command?{'content-type':'application/json','x-vetit-profile-id':profileId.toLowerCase()}:{})},credentials:accessToken?'omit':'same-origin',redirect:'error',cache:'no-store',signal,...(command?{body:JSON.stringify(command)}:{})});
 if(!response.ok)throw new SellerCatalogueError(response.status);
 let body;try{body=await response.json();}catch{throw new SellerCatalogueError(503);}
 if(body?.apiVersion!==1||!body.data||typeof body.data!=='object'||Array.isArray(body.data))throw new SellerCatalogueError(503);if(!isSellerUuid(body.data.profileId))throw new SellerCatalogueError(503);if(profileId&&body.data.profileId!==profileId.toLowerCase())throw new SellerCatalogueError(409);return body.data;
}
