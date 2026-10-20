import type {NativeAppointmentsState} from './appointments.js';
import type {NativeModerationSession} from './moderation-session.js';
import type {sendAppointmentCommand} from '../../src/lib/services/appointment-lifecycle-client.js';
export type ProviderAppointmentAction='confirm'|'complete'|'cancel';
export type ProviderActionState={phase:'idle'|'confirm'|'saving'|'uncertain'|'conflict'|'signin'|'denied'|'success';action:ProviderAppointmentAction|null;bookingId:string|null};
export function providerBookingActions(booking:NativeAppointmentsState['bookings'][number]|null|undefined,now?:number):ProviderAppointmentAction[];
export function providerActionCopy(language?:string):Record<'confirm'|'complete'|'cancel'|'question'|'warning'|'apply'|'back'|'saving'|'uncertain'|'conflict'|'signin'|'denied'|'success'|'check',string>;
export function createProviderAppointmentActions(options:{session:NativeModerationSession;apiBaseUrl:string;testApiOrigin:string;getView:()=>NativeAppointmentsState;refresh:()=>Promise<void>;render:(state:ProviderActionState)=>void;send?:typeof sendAppointmentCommand;timeoutMs?:number;now?:()=>number}):{prepare(action:ProviderAppointmentAction,bookingId:string):boolean;confirm():Promise<void>;cancel():void;reconcile():Promise<void>;clear():void;snapshot():ProviderActionState;dispose():void};
