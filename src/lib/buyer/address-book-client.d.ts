import type { AddressBook,AddressCommand } from './address-book-contract.js';
export class AddressBookError extends Error{status:number;constructor(message:string,status?:number);}
type Options={baseUrl?:string;accessToken?:string;signal?:AbortSignal;fetchImpl?:typeof fetch};
export function requestAddressBook(options:Options&{command:AddressCommand;profileId:string}):Promise<{state:'saved';id:string}|{state:'deleted'}>;
export function requestAddressBook(options?:Options):Promise<AddressBook>;
