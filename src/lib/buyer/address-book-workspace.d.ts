import type { AddressBook,AddressCommand } from './address-book-contract.js';
import type { requestAddressBook } from './address-book-client.js';
export type AddressBookState={phase:'idle'|'loading'|'ready'|'saving'|'signin'|'error';book:AddressBook|null;message:string};
export function createAddressBookWorkspace(options:{read?:typeof requestAddressBook;render:(value:AddressBookState)=>void}):{load():Promise<void>;mutate(command:AddressCommand):Promise<void>;clear():void;dispose():void};
