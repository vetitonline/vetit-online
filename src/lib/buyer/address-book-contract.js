import { normalizeAddressInput, normalizeAddressId } from './validation.js';
export { normalizeAddressInput };
export const ADDRESS_BOOK_LIMIT=100;
export const addressId=value=>normalizeAddressId(value).toLowerCase();
export function addressFromRow(row){
  if(!row||typeof row!=='object'||Array.isArray(row)||typeof row.is_default!=='boolean')throw Error('Saved address response is invalid.');
  const text=(value,max,required=false)=>{
    if(value===null&&!required)return null;
    if(typeof value!=='string'||value.length>max||required&&!value.trim())throw Error('Saved address field is invalid.');
    return value.trim()||null;
  };
  // Legacy incomplete delivery fields remain visible for repair. Checkout applies
  // stricter PIN/phone/country rules separately; never silently invent a country.
  if(typeof row.country_code!=='string'||!/^[A-Z]{2}$/.test(row.country_code))throw Error('Saved address country is invalid.');
  for(const [value,max] of [[row.latitude,90],[row.longitude,180]])if(value!==null&&(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>max))throw Error('Saved coordinates are invalid.');
  const address={id:addressId(row.id),label:text(row.label,40),recipientName:text(row.recipient_name,120,true),phone:text(row.phone,32),
    addressLine1:text(row.address_line1,200,true),addressLine2:text(row.address_line2,200),locality:text(row.locality,120),city:text(row.city,120,true),stateRegion:text(row.state_region,120),
    postalCode:text(row.postal_code,20),countryCode:row.country_code,latitude:row.latitude,longitude:row.longitude,isDefault:row.is_default};
  if(Object.values(address).some(value=>typeof value==='string'&&/[\u0000-\u001f\u007f]/.test(value)))throw Error('Saved address contains unsupported characters.');
  return address;
}
export function normalizeAddressBook(body){
  if(body?.apiVersion!==1||body.state!=='available'||!Array.isArray(body.addresses)||body.addresses.length>ADDRESS_BOOK_LIMIT)throw Error('Saved address response is invalid.');
  const profileId=addressId(body.profileId),addresses=body.addresses.map(addressFromRow);
  if(new Set(addresses.map(row=>row.id)).size!==addresses.length||addresses.filter(row=>row.isDefault).length>1)throw Error('Saved address response is incomplete or inconsistent.');
  return{profileId,addresses};
}
export const addressRpcArgs=address=>({p_address_id:address.id,p_label:address.label,p_recipient_name:address.recipientName,p_phone:address.phone,p_address_line1:address.addressLine1,
  p_address_line2:address.addressLine2,p_locality:address.locality,p_city:address.city,p_state_region:address.stateRegion,p_postal_code:address.postalCode,p_country_code:address.countryCode,p_latitude:address.latitude,p_longitude:address.longitude,p_is_default:address.isDefault});
