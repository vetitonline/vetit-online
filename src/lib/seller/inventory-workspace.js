import { requestSellerInventory } from './inventory-client.js';
import { normalizeInventoryChange,InventoryError } from './inventory-contract.js';
export function createInventoryWorkspace({read=requestSellerInventory,render}){
  let revision=0,disposed=false,busy=false,active,state={phase:'idle',inventory:null,message:''};
  const current=value=>!disposed&&value===revision,publish=next=>{state=next;render(next);};
  function clear(){if(disposed)return;revision++;active?.abort();busy=false;publish({phase:'signin',inventory:null,message:'Your account changed. Reload inventory.'});}
  async function load(){if(disposed||busy)return;active?.abort();active=new AbortController();const version=++revision;publish({phase:'loading',inventory:null,message:''});try{const inventory=await read({signal:active.signal});if(current(version))publish({phase:'ready',inventory,message:''});}catch(error){if(current(version))publish({phase:error.status===401?'signin':'error',inventory:null,message:error.message});}}
  async function save(variantId,quantityOnHand){
    if(disposed||busy||state.phase!=='ready'||!state.inventory)return;
    const row=state.inventory.variants.find(value=>value.variantId===variantId);if(!row)throw new InventoryError('Reload and select an owned product option.');
    const change=normalizeInventoryChange({businessId:row.businessId,productVariantId:row.variantId,quantityOnHand,expectedInventoryId:row.inventoryId,expectedUpdatedAt:row.updatedAt});
    if(row.quantityReserved!==null&&quantityOnHand<row.quantityReserved)throw new InventoryError('On-hand stock cannot be below reserved units.');
    const owner=state.inventory.profileId;busy=true;active?.abort();active=new AbortController();const version=++revision;publish({...state,phase:'saving',message:''});
    try{const ack=await read({change,profileId:owner,signal:active.signal});if(!current(version))return;const inventory=await read({signal:active.signal});if(!current(version))return;
      if(inventory.profileId!==owner)throw new InventoryError('Your account changed. Reload inventory.',401);
      const latest=inventory.variants.find(value=>value.variantId===variantId);
      if(!latest||latest.businessId!==row.businessId||latest.inventoryId!==ack.inventoryLevelId||latest.quantityOnHand!==quantityOnHand)throw new InventoryError('Stock change needs reconciliation. Reload to check before trying again.',503);
      publish({phase:'ready',inventory,message:'Inventory updated and checked.'});
    }catch(error){if(current(version))publish({phase:error.status===401?'signin':'error',inventory:null,message:error.message});}finally{if(current(version))busy=false;}
  }
  return{load,save,clear,dispose(){disposed=true;revision++;active?.abort();state={phase:'idle',inventory:null,message:''};}};
}
