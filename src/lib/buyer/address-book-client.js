import { addressId,normalizeAddressBook,normalizeAddressInput } from './address-book-contract.js';
export class AddressBookError extends Error{constructor(message,status=400){super(message);this.status=status;}}
export async function requestAddressBook({baseUrl=globalThis.location?.origin,accessToken,command,profileId,signal,fetchImpl=fetch}={}){
  let origin;try{origin=new URL(baseUrl);if(!['http:','https:'].includes(origin.protocol)||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw Error();
    if(accessToken!==undefined&&(typeof accessToken!=='string'||accessToken.length>8192||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(accessToken)))throw Error();
  }catch{throw new AddressBookError('Address API configuration is invalid.');}
  const url=new URL('/api/buyer/addresses',origin);let method='GET',body;
  if(command){addressId(profileId);if(command.action==='save'){method='POST';body=normalizeAddressInput(command.address);}else if(command.action==='remove'){method='DELETE';url.searchParams.set('id',addressId(command.id));}else throw new AddressBookError('Address action is invalid.');}
  let response;try{response=await fetchImpl(url.toString(),{method,credentials:accessToken?'omit':'same-origin',cache:'no-store',redirect:'error',signal,
    headers:{accept:'application/json',...(accessToken?{authorization:`Bearer ${accessToken}`}:{ }),...(command?{'x-vetit-profile-id':profileId}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  }catch{throw new AddressBookError(command?'Address change could not be confirmed. Reload before trying again.':'Saved addresses could not be reached.',0);}
  if(!response.ok)throw new AddressBookError(response.status===401?'Sign in to manage delivery addresses.':response.status===409?'Your account changed. Reload your addresses.':response.status===404?'Address not found. Reload to check your saved addresses.':'Saved addresses are unavailable. Reload to check before trying again.',response.status);
  try{const result=await response.json();if(!command)return normalizeAddressBook(result);
    if(result.apiVersion!==1||result.state!==(method==='POST'?'saved':'deleted'))throw Error();
    return method==='POST'?{state:'saved',id:addressId(result.addressId)}:{state:'deleted'};
  }catch{throw new AddressBookError('Saved address response is invalid. Reload to check before trying again.',503);}
}
