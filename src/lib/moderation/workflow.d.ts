import type {QueueClient} from './queue.js';
export type SubjectKind='seller'|'product'|'service';
export type ModerationState='pending'|'screened'|'eligible'|'approved'|'rejected'|'corrections'|'escalated'|'blocked';
export type ModerationCommand={action:'open';kind:SubjectKind;subject:string}|{action:'screen'|'approve'|'reject'|'corrections'|'escalate';caseId:string;version:number;requestId:string;reasons?:string[];note?:string;correction?:string};
export type ModerationResult={caseId:string;version:number;state:ModerationState;reasons?:string[]};
export type AutomaticApprovalStatus={status:'not_approved'|'approved'|'review_required';publicationEnabled:false;approvedAt?:string;validUntil?:string};
export type ModerationQueue={items:Array<{id:string;subject_id:string;subject_kind:SubjectKind;state:ModerationState;version:number;title:string;seller_name:string;market:string;category_id:string|null;classification:string;reasons:string[];created_at:string;updated_at:string;automatic_approval?:AutomaticApprovalStatus}>;hasMore:boolean};
export type ModerationStatus={case:(ModerationResult & {reasons:string[];correction:string;policyVersion?:string|null;revision?:string;updatedAt?:string;automaticApproval?:AutomaticApprovalStatus})|null;events:Array<{id:number;operation:string;state:ModerationState;reasons:string[];at:string;reviewer:string|null;note:string|null}>};
export class ModerationError extends Error{status:number;constructor(message:string,status?:number);}
export function moderationSubject(kind:string|null,subject:string|null):{kind:SubjectKind;subject:string};
export function normalizeModerationCommand(value:unknown):ModerationCommand;
export function moderationRpcStatus(code:string):number;
export function loadModerationQueue(client:QueueClient,params:URLSearchParams):Promise<ModerationQueue>;
export function executeModeration(client:QueueClient,value:unknown):Promise<ModerationResult>;
export function loadModerationStatus(client:QueueClient,kind:SubjectKind,subject:string):Promise<ModerationStatus>;
export function requestModeration(options:{baseUrl:string;testOrigin:string;accessToken?:string;fetchImpl?:typeof fetch;signal?:AbortSignal},command:ModerationCommand):Promise<ModerationResult>;
export function getModerationStatus(options:{baseUrl:string;testOrigin:string;accessToken?:string;fetchImpl?:typeof fetch;signal?:AbortSignal},kind:SubjectKind,subject:string):Promise<ModerationStatus>;
export function getModerationQueue(options:{baseUrl:string;testOrigin:string;accessToken:string;fetchImpl?:typeof fetch;signal?:AbortSignal},params?:URLSearchParams):Promise<ModerationQueue>;
export function moderationNeedsReview(c:{state:ModerationState;reasons?:string[];automaticApproval?:AutomaticApprovalStatus}|null):boolean;
