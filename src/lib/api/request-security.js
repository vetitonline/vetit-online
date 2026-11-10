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

const PROFILE_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A loaded account is a request precondition, never an authorization grant. */
export function matchesExpectedAccount(request,verifiedId){
  const expected=request.headers.get('x-vetit-profile-id');
  return typeof expected==='string'&&PROFILE_ID.test(expected)&&expected.toLowerCase()===verifiedId;
}
/** HTML forms use one explicit value because native form submits cannot set headers. */
export function matchesFormAccount(form,verifiedId){
  const values=form.getAll('expected_profile_id');
  return values.length===1&&typeof values[0]==='string'&&PROFILE_ID.test(values[0])&&values[0].toLowerCase()===verifiedId;
}
