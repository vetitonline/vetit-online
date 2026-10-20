export type CheckStatus = 'passed' | 'failed' | 'uncertain' | 'unavailable';
export type Evidence = { status: CheckStatus; revision: string };
export type ModerationPolicy = { version: string; market: string; currency: string; automaticApproval: boolean };
export type SubmissionSnapshot = {
  type: 'seller' | 'product' | 'service'; revision: string; market: string; country: string;
  categoryClass: 'ordinary' | 'veterinary' | 'live_animal' | 'regulated';
  categoryAllowsAutomaticApproval: boolean; prohibited: boolean; suspicious: boolean;
  checks: Partial<Record<'profile' | 'business' | 'ownership' | 'category' | 'duplicate' | 'content' | 'professionalVerification' | 'species' | 'attributes' | 'sellerVerification', Evidence>>;
  currency?: string; priceMinor?: number;
  images?: Array<Evidence & { contentHash: string }>;
};
export type Assessment = { policyVersion: string; outcome: 'blocked' | 'review' | 'eligible'; risk: 'prohibited' | 'high' | 'unknown' | 'low'; reasons: string[]; canPublish: false };
export const INDIA_POLICY: Readonly<ModerationPolicy>;
export function validateSellerApplication(input: {profileName: string; country: string; display_name: string; legal_name?: string; business_type: string; public_email?: string; public_phone?: string; website_url?: string}, checks?: {market?: string; duplicateStatus?: CheckStatus; categoryEligible?: boolean}): {status: CheckStatus; reasons: string[]};
export function evaluateTextRules(text: string, rules?: {prohibited: string[]; restricted: string[]; suspicious: string[]}): {status: CheckStatus; reasons: string[]};
export function assessSubmission(snapshot: SubmissionSnapshot, policy?: ModerationPolicy): Assessment;
export function screenContent(input: { revision: string; text?: string; imageHashes?: string[] }, options?: { provider?: { screen(input: object,options?:{signal:AbortSignal}): Promise<Evidence> }; timeoutMs?: number }): Promise<{status: CheckStatus; revision: string | null}>;
