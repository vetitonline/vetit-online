import { safeNextPath } from './navigation.js';

export async function completeAuthCallback(requestUrl, exchangeCode) {
  const url = new URL(requestUrl);
  let target = '/login?reason=callback-failed';
  const code = url.searchParams.get('code');
  if (code && !url.searchParams.has('error')) {
    try {
      const { error } = await exchangeCode(code);
      if (!error) target = safeNextPath(url.searchParams.get('next'), url.origin);
    } catch { /* Do not reflect provider errors or authorization codes. */ }
  }
  return new Response(null, { status: 303, headers: {
    Location: target, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
  } });
}
