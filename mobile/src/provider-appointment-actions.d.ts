import type {NativeAppointmentsState} from './appointments.js';
import type {NativeModerationSession} from './moderation-session.js';
import type {sendAppointmentCommand} from '../../src/lib/services/appointment-lifecycle-client.js';
export type ProviderAppointmentAction='confirm'|'complete'|'cancel'|'reschedule'|'readNotification';
export type ProviderActionState={phase:'idle'|'loading_slots'|'choosing'|'confirm'|'saving'|'uncertain'|'conflict'|'signin'|'denied'|'success';action:ProviderAppointmentAction|null;bookingId:string|null;notificationId?:string;slots?:Array<{id:string;startsAt:string;endsAt:string}>;replacement?:{id:string;startsAt:string;endsAt:string}};
export function providerBookingActions(booking:NativeAppointmentsState['bookings'][number]|null|undefined,now?:number):ProviderAppointmentAction[];
export function providerActionCopy(language?:string):Record<'readNotification'|'readLabel'|'unreadLabel'|'reschedule'|'loading_slots'|'choosing'|'confirm'|'complete'|'cancel'|'question'|'warning'|'apply'|'back'|'saving'|'uncertain'|'conflict'|'signin'|'denied'|'success'|'check',string>;
export function createProviderAppointmentActions(options:{session:NativeModerationSession;apiBaseUrl:string;testApiOrigin:string;getView:()=>NativeAppointmentsState;refresh:()=>Promise<void>;render:(state:ProviderActionState)=>void;send?:typeof sendAppointmentCommand;readSlots?:typeof import('../../src/lib/services/appointment-client.js').requestAppointmentSlots;timeoutMs?:number;now?:()=>number}):{prepare(action:ProviderAppointmentAction,bookingId:string,slotId?:string):boolean;prepareNotification(notificationId:string):boolean;loadReplacements(bookingId:string):Promise<void>;confirm():Promise<void>;cancel():void;reconcile():Promise<void>;clear():void;snapshot():ProviderActionState;dispose():void};

export const createCustomerAppointmentActions:typeof createProviderAppointmentActions;
export const createNativeAppointmentActions:typeof createProviderAppointmentActions;
export function customerBookingActions(booking:NativeAppointmentsState['bookings'][number]|null|undefined,now?:number):Array<'cancel'>;
export const customerActionCopy:typeof providerActionCopy;

export function customerCanReschedule(booking:NativeAppointmentsState['bookings'][number]|null|undefined,now?:number):boolean;
