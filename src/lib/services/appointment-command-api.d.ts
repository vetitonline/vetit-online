import type {APIRoute} from 'astro';
import type {authenticateApiRequest} from '../supabase/api-auth';
import type {callAppointmentLifecycle} from './appointment-lifecycle-api';
export function createAppointmentCommandHandler(options:{authenticate:typeof authenticateApiRequest;rpc:typeof callAppointmentLifecycle;statusForCode:(code:string)=>number}):APIRoute;
