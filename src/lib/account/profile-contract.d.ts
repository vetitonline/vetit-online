export type AccountProfile = { id: string; fullName: string | null };
export class ProfileError extends Error { status: number; constructor(message: string, status?: number); }
export function normalizeProfileUpdate(input: unknown): { full_name: string };
export function normalizeProfile(row: unknown): AccountProfile;
