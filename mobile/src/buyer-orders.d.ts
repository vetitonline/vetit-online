import type {NativeModerationSession} from './moderation-session.js';
import type {OrderWorkspaceState} from '../../src/lib/buyer/order-workspace.js';
export function createNativeBuyerOrders(options:{session:NativeModerationSession;apiBaseUrl:string;testApiOrigin:string;render:(state:OrderWorkspaceState)=>void}):{load(options?:{orderId?:string;more?:boolean}):Promise<void>;retry():Promise<void>;clear():void;dispose():void};
