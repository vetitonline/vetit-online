import type { AddressBook } from '../buyer/address-book-contract.js';
import type { requestAddressBook } from '../buyer/address-book-client.js';
import type { DeliveryAddress } from './checkout-service.js';
export type AddressPickerState={phase:'idle'|'loading'|'ready'|'error';book:AddressBook|null;message:string};
export function createCheckoutAddressPicker(options:{read?:typeof requestAddressBook;render:(state:AddressPickerState)=>void;apply:(address:DeliveryAddress,profileId:string)=>void}):{load():Promise<void>;choose(id:string):DeliveryAddress|undefined;clear():void;dispose():void};
