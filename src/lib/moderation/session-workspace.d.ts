import type {SubjectKind,ModerationStatus,ModerationCommand,ModerationResult} from './workflow.js';
/** userId must come from the trusted verified session host, never JWT decoding or editable metadata. */
export type ModerationSession={userId:string;accessToken:string;signal?:AbortSignal};
export type ModerationClient={status(kind:SubjectKind,subject:string,session:ModerationSession):Promise<ModerationStatus>;command(command:ModerationCommand,session:ModerationSession):Promise<ModerationResult>};
export function createModerationWorkspace(options:{client:ModerationClient;getSession:()=>Promise<ModerationSession|null>;kind:SubjectKind;subject:string;requestId?:()=>string}):{
 snapshot():{data:ModerationStatus|null;busy:boolean;refreshRequired:boolean};
 refresh():Promise<ModerationStatus>;
 submit(action:ModerationCommand['action'],fields?:{reasons?:string[];note?:string;correction?:string}):Promise<ModerationResult>;
};
