import { requestAddressBook,AddressBookError } from './address-book-client.js';
import { normalizeAddressInput } from './address-book-contract.js';
export function createAddressBookWorkspace({read=requestAddressBook,render}){
  let revision=0,disposed=false,busy=false,active,state={phase:'idle',book:null,message:''};
  const current=id=>!disposed&&id===revision;
  const publish=value=>{state=value;render(value);};
  const clear=()=>{if(disposed)return;revision++;active?.abort();busy=false;publish({phase:'signin',book:null,message:'Your account changed. Reload your addresses.'});};
  async function load(){
    if(disposed||busy)return;active?.abort();active=new AbortController();const version=++revision;
    publish({phase:'loading',book:null,message:'Loading delivery addresses…'});
    try{const book=await read({signal:active.signal});if(current(version))publish({phase:'ready',book,message:''});}
    catch(error){if(current(version))publish({phase:error.status===401?'signin':'error',book:null,message:error.message??'Saved addresses are unavailable.'});}
  }
  async function mutate(command){
    if(disposed||busy||state.phase!=='ready'||!state.book)return;
    const profileId=state.book.profileId,previousIds=new Set(state.book.addresses.map(row=>row.id));busy=true;active?.abort();active=new AbortController();const version=++revision;
    publish({...state,phase:'saving',message:'Saving and checking your addresses…'});
    try{
      const expected=command.action==='save'?normalizeAddressInput(command.address):null;
      const result=await read({command,profileId,signal:active.signal});if(!current(version))return;
      const book=await read({signal:active.signal});if(!current(version))return;
      if(book.profileId!==profileId)throw new AddressBookError('Your account changed. Reload before editing.',409);
      if(command.action==='save'){
        if(expected.id?expected.id!==result.id:previousIds.has(result.id))throw Error('Address acknowledgement needs reconciliation. Reload before trying again.');
        const address=book.addresses.find(value=>value.id===result.id);
        const wanted={...expected,id:result.id};
        if(!address||Object.keys(wanted).some(key=>address[key]!==wanted[key]))throw Error('Address save needs reconciliation. Reload to check before trying again.');
      }else if(book.addresses.some(value=>value.id===command.id))throw Error('Address removal needs reconciliation. Reload before trying again.');
      publish({phase:'ready',book,message:command.action==='save'?'Delivery address saved.':'Delivery address removed.'});
    }catch(error){if(current(version))publish({phase:[401,409].includes(error.status)?'signin':'error',book:null,message:error.message??'Address change could not be confirmed. Reload before trying again.'});}
    finally{if(current(version))busy=false;}
  }
  return{load,mutate,clear,dispose(){disposed=true;revision++;active?.abort();}};
}
