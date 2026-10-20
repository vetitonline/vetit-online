export const TEST_SUPABASE_ORIGIN = 'https://apfyfmokcynqiaxqvvxx.supabase.co';

export function assertTestSupabaseUrl(value) {
  if (value !== TEST_SUPABASE_ORIGIN) throw new Error('Development requires the explicit Vetit Test Supabase URL.');
}

export function resolveMobileApiBase(value, testOrigin) {
  try {
    const url = new URL(value?.trim() || '');
    const expected = new URL(testOrigin?.trim() || '');
    const octets = url.hostname.split('.').map(Number);
    const privateIpv4 = octets.length === 4 && octets.every(n => Number.isInteger(n) && n >= 0 && n <= 255) &&
      (octets[0] === 10 || octets[0] === 192 && octets[1] === 168 || octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || privateIpv4;
    if (url.origin !== expected.origin || expected.href !== `${expected.origin}/` ||
        url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
        /(^|\.)vetit\.online$/i.test(url.hostname.replace(/\.+$/, '')) ||
        !(url.protocol === 'https:' || local && url.protocol === 'http:')) throw new Error();
    return url.origin;
  } catch { throw new Error('This Test candidate requires an explicit Test API URL and matching EXPO_PUBLIC_VETIT_TEST_API_ORIGIN; production is forbidden.'); }
}
