import { requestAddressBook } from '../buyer/address-book-client.js';
import { normalizeDeliveryAddress } from './checkout-service.js';
export function createCheckoutAddressPicker({read=requestAddressBook,render,apply}){
  let revision=0,disposed=false,active,book=null;
  const current=version=>!disposed&&version===revision;
  const clear=()=>{if(disposed)return;revision++;active?.abort();book=null;render({phase:'idle',book:null,message:'Load your saved addresses or enter delivery details manually.'});};
  async function load(){
    if(disposed)return;active?.abort();active=new AbortController();const version=++revision;book=null;
    render({phase:'loading',book:null,message:'Loading your delivery addresses…'});
    try{const result=await read({signal:active.signal});if(current(version)){book=result;render({phase:'ready',book,message:result.addresses.length?'Choose an address, then select “Use this address”.':'No saved addresses yet. Enter delivery details manually or add an address in your account.'});}}
    catch(error){if(current(version))render({phase:'error',book:null,message:error.message??'Saved addresses are unavailable. You can enter delivery details manually.'});}
  }
  function choose(id){
    if(disposed||!book)return;
    const address=book.addresses.find(value=>value.id===id);if(!address)throw Error('Reload and select a saved address.');
    const deliveryAddress=normalizeDeliveryAddress(address);
    apply(deliveryAddress,book.profileId);return deliveryAddress;
  }
  return{load,choose,clear,dispose(){disposed=true;revision++;active?.abort();book=null;}};
}
