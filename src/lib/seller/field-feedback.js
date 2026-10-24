// Display only typed issues from the shared validator. Never replace form values.
const fields=new Set(['title','description','category_id','species_ids','base_amount_minor','variant_sku','variant_name','variant_value','variant_amount_minor']);
export function clearSellerFieldFeedback(form){
 for(const node of form.querySelectorAll('[data-seller-field-error]')){
  for(const input of form.querySelectorAll('[aria-describedby]')){
   const ids=(input.getAttribute('aria-describedby')??'').split(/\s+/).filter(id=>id&&id!==node.id);
   if(ids.length)input.setAttribute('aria-describedby',ids.join(' '));else input.removeAttribute('aria-describedby');
  }
  node.remove();
 }
 for(const input of form.querySelectorAll('[data-seller-invalid]')){input.removeAttribute('aria-invalid');input.removeAttribute('data-seller-invalid');}
}
export function showSellerFieldFeedback(form,issue){
 clearSellerFieldFeedback(form);
 if(!issue||!fields.has(issue.field)||typeof issue.message!=='string'||issue.message.length>256||issue.index!==undefined&&(!Number.isInteger(issue.index)||issue.index<0||issue.index>19))return false;
 const inputs=[...form.querySelectorAll(`[name="${issue.field}"]`)];
 const input=issue.field==='species_ids'?inputs.find(item=>!item.closest('[hidden]'))??inputs[0]:inputs[issue.index??0];if(!input)return false;
 const message=form.ownerDocument.createElement('p');message.id=`seller-field-error-${issue.field}-${issue.index??0}`;message.setAttribute('data-seller-field-error','');message.setAttribute('role','alert');message.className='seller-feedback is-error';message.textContent=issue.message;
 input.setAttribute('aria-invalid','true');input.setAttribute('data-seller-invalid','');
 input.setAttribute('aria-describedby',[input.getAttribute('aria-describedby'),message.id].filter(Boolean).join(' '));
 const container=issue.field==='species_ids'?form.querySelector('[data-seller-species]')?.parentElement??input.parentElement:input.parentElement;
 container.append(message);input.focus();return true;
}
