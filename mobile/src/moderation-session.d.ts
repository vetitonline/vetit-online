import type {ModerationSession} from '../../src/lib/moderation/session-workspace.js';
export type NativeIdentity={userId:string;reviewerHint:boolean};
export type NativeModerationSession={snapshot():NativeIdentity|null;subscribe(listener:(identity:NativeIdentity|null)=>void):()=>void;refresh():Promise<ModerationSession>;getSession():Promise<ModerationSession>;clear():void};
export function createNativeModerationSession(options:{apiBaseUrl:string;testApiOrigin:string;getAccessToken:()=>Promise<string|null>;fetchImpl?:typeof fetch;timeoutMs?:number}):NativeModerationSession;
