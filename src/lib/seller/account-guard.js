/** Bind a rendered seller workspace to its original account. This supplements,
 * rather than replaces, server ownership/role checks and database policies. */
export function bindSellerAccount(root,subscribe){
  const expected=root.dataset.profileId;
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(expected??''))return{dispose(){}};
  let locked=false;
  const invalidate=()=>{
    if(locked)return;locked=true;root.dataset.accountInvalidated='true';
    for(const form of root.querySelectorAll('form'))form.dataset.accountInvalidated='true';
    for(const control of root.querySelectorAll('input,textarea,select,button')){control.disabled=true;if('value' in control)control.value='';}
    const message=root.ownerDocument.createElement('p');message.setAttribute('role','status');message.textContent='Your account changed. Reload this seller page before continuing.';
    const reload=root.ownerDocument.createElement('a');reload.href=root.ownerDocument.location.pathname+root.ownerDocument.location.search;reload.textContent='Reload seller workspace';
    root.replaceChildren(message,reload);
  };
  const unsubscribe=subscribe(current=>{if(current!==expected)invalidate();});
  return{dispose(){unsubscribe();invalidate();}};
}
