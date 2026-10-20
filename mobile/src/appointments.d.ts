import type {NativeModerationSession} from './moderation-session.js';
import type {getAppointmentDashboard} from '../../src/lib/services/appointment-lifecycle-client.js';
export type NativeAppointmentsState={phase:'idle'|'loading'|'signin'|'denied'|'error'|'empty'|'ready';businessId:string|null;businesses:Array<{id:string;name:string}>;bookings:Array<{id:string;serviceId:string;status:string;revision:number;startsAt:string;endsAt:string;priceMinor:number;currency:string}>;services:Array<{id:string;title:string}>;slots:Array<{id:string;serviceId:string;status:string;startsAt:string;endsAt:string}>;truncated:boolean};
export function createNativeAppointments(options:{session:NativeModerationSession;apiBaseUrl:string;testApiOrigin:string;render:(state:NativeAppointmentsState)=>void;read?:typeof getAppointmentDashboard;timeoutMs?:number}):{load(businessId?:string|null):Promise<void>;refresh():Promise<void>;clear():void;dispose():void};
export function appointmentCopy(language?:string):Record<'title'|'intro'|'personal'|'provider'|'loading'|'signin'|'denied'|'error'|'empty'|'slots'|'appointment'|'partial'|'refresh'|'zone',string>;
export function appointmentStatus(status:string,language?:string):string;
export function appointmentTime(value:string,language?:string):string;
