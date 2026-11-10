import {createSupabaseBrowserClient} from '../supabase/browser';
import {bindSellerAccount} from './account-guard.js';
const root=document.querySelector<HTMLElement>('[data-seller-account]');
if(root){
  try{
    const guard=bindSellerAccount(root,notify=>{
      const {data:{subscription}}=createSupabaseBrowserClient().auth.onAuthStateChange((event,session)=>{
        if(['INITIAL_SESSION','SIGNED_IN','SIGNED_OUT','TOKEN_REFRESHED'].includes(event))notify(session?.user?.id??null);
      });
      return()=>subscription.unsubscribe();
    });
    window.addEventListener('pagehide',()=>guard.dispose(),{once:true});
    window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
  }catch{ /* Server checks remain authoritative if browser auth is unavailable. */ }
}
