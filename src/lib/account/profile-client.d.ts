import type { AccountProfile } from './profile-contract.js';
export function requestProfile(options?: { baseUrl?: string; accessToken?: string; update?: { fullName: string }; profileId?: string; signal?: AbortSignal; fetchImpl?: typeof fetch }): Promise<AccountProfile>;
