import { parseBearerAccessToken } from '../supabase/auth-token.js';

/** Reject cross-site cookie mutations while allowing native clients with bearer JWTs. */
export function isSameOriginMutation(request, { allowBearer = true } = {}) {
  if (request.headers.get('sec-fetch-site')?.toLowerCase() === 'cross-site') return false;
  if (allowBearer && parseBearerAccessToken(request.headers.get('authorization'))) return true;

  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

/** Cookie-backed browser forms must carry the exact same-origin Origin header. */
export function isSameOriginFormMutation(request) {
  return isSameOriginMutation(request, { allowBearer: false });
}
