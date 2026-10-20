import { TEST_SUPABASE_ORIGIN, resolveMobileApiBase } from './test-endpoints.js';
export const PUBLIC_TEST_KEYS = ['PUBLIC_SUPABASE_URL','PUBLIC_SUPABASE_PUBLISHABLE_KEY','EXPO_PUBLIC_VETIT_API_BASE_URL','EXPO_PUBLIC_VETIT_TEST_API_ORIGIN'];
/** Parse only approved public settings. Never return other credential-file fields. */
export function publicTestSettings(source) {
  const result = {};
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (!match || !PUBLIC_TEST_KEYS.includes(match[1])) continue;
    let value = match[2];
    if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) value = value.slice(1,-1);
    else value = value.replace(/\s+#.*$/, '').trim();
    result[match[1]] = value;
  }
  return result;
}
export function publicKeyReadiness(value) {
  if (!value) return 'missing';
  if (value.startsWith('sb_publishable_') && value.length > 20) return 'public-format-project-unverified';
  if (value.startsWith('sb_secret_')) return 'forbidden-secret';
  try {
    const parts = value.split('.');
    if (parts.length !== 3) return 'unsupported';
    const payload = JSON.parse(atob(parts[1].replaceAll('-','+').replaceAll('_','/')));
    if (payload.role === 'service_role') return 'forbidden-secret';
    return payload.role === 'anon' && payload.ref === 'apfyfmokcynqiaxqvvxx' ? 'test-anon-format-signature-unverified' : 'wrong-project-or-role';
  } catch { return 'unsupported'; }
}
export function assessTestReadiness(web, mobile) {
  let mobileReady = false;
  try { resolveMobileApiBase(mobile.EXPO_PUBLIC_VETIT_API_BASE_URL,mobile.EXPO_PUBLIC_VETIT_TEST_API_ORIGIN); mobileReady = true; } catch {}
  const key = publicKeyReadiness(web.PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const testUrl = web.PUBLIC_SUPABASE_URL === TEST_SUPABASE_ORIGIN;
  return { webTestUrlConfigured:testUrl, webPublicKeyStatus:key, mobileExplicitTestOriginConfigured:mobileReady,
    configurationReady:testUrl && ['public-format-project-unverified','test-anon-format-signature-unverified'].includes(key) && mobileReady,
    runtimeVerified:false };
}
