import type { BuyerAddressInput } from './validation.js';
export { normalizeAddressInput } from './validation.js';
export type SavedAddress=BuyerAddressInput&{id:string};
export type AddressBook={profileId:string;addresses:SavedAddress[]};
export type AddressCommand={action:'save';address:BuyerAddressInput}|{action:'remove';id:string};
export const ADDRESS_BOOK_LIMIT:number;
export function addressId(value:unknown):string;
export function addressFromRow(row:unknown):SavedAddress;
export function normalizeAddressBook(body:unknown):AddressBook;
