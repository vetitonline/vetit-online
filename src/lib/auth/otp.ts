import type { SupabaseClient } from "@supabase/supabase-js";

/** Normalize Indian mobile numbers to E.164. Accepts +91XXXXXXXXXX or 10 digits. */
export function normalizeIndianPhone(input: string): string {
  const compact = input.trim().replace(/[\s()-]/g, "");
  const national = compact.startsWith("+91")
    ? compact.slice(3)
    : compact.startsWith("91") && compact.length === 12
      ? compact.slice(2)
      : compact;

  if (!/^[6-9]\d{9}$/.test(national)) {
    throw new Error("Enter a valid Indian mobile number.");
  }

  return `+91${national}`;
}

/** Supabase sends email OTPs/magic links using the configured Auth email provider. */
export async function sendEmailOtp(client: SupabaseClient, email: string) {
  return client.auth.signInWithOtp({ email: email.trim().toLowerCase() });
}

/** SMS delivery is configured in Supabase Auth; no SMS vendor is hard-coded here. */
export async function sendIndianPhoneOtp(
  client: SupabaseClient,
  phone: string,
) {
  return client.auth.signInWithOtp({ phone: normalizeIndianPhone(phone) });
}

export async function verifyEmailOtp(
  client: SupabaseClient,
  email: string,
  token: string,
) {
  return client.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token,
    type: "email",
  });
}

export async function verifyIndianPhoneOtp(
  client: SupabaseClient,
  phone: string,
  token: string,
) {
  return client.auth.verifyOtp({
    phone: normalizeIndianPhone(phone),
    token,
    type: "sms",
  });
}
