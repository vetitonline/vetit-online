import { ProfileError, normalizeProfile, normalizeProfileUpdate } from './profile-contract.js';

/** Platform-neutral transport: browser cookies or a native verified bearer session. */
export async function requestProfile({ baseUrl, accessToken, update, profileId, signal, fetchImpl = fetch } = {}) {
  let origin;
  try {
    origin = new URL(baseUrl ?? globalThis.location?.origin);
    if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw Error();
    if (accessToken !== undefined && (typeof accessToken !== 'string' || !accessToken || accessToken.length > 8192 || /\s/.test(accessToken))) throw Error();
  } catch { throw new ProfileError('Account API configuration is invalid.'); }
  const changes = update === undefined ? undefined : normalizeProfileUpdate(update);
  if (changes) normalizeProfile({ id: profileId, full_name: changes.full_name });
  let response;
  try {
    response = await fetchImpl(new URL('/api/account/profile', origin).toString(), {
      method: changes ? 'PATCH' : 'GET', credentials: accessToken ? 'omit' : 'same-origin',
      redirect: 'error', cache: 'no-store', signal,
      headers: { accept: 'application/json', ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}), ...(changes ? { 'content-type': 'application/json', 'x-vetit-profile-id': profileId } : {}) },
      ...(changes ? { body: JSON.stringify({ fullName: changes.full_name }) } : {}),
    });
  } catch { throw new ProfileError(changes ? 'Save could not be confirmed. Reload your account before trying again.' : 'Account could not be reached.', 0); }
  if (!response.ok) throw new ProfileError(response.status === 401 ? 'Sign in to view your account.' : response.status === 404 ? 'Your account profile is unavailable. Contact support.' : 'Account could not be loaded or saved. Reload before trying again.', response.status);
  try {
    const body = await response.json();
    if (body?.apiVersion !== 1 || body.state !== 'available') throw Error();
    const profile = normalizeProfile({ id: body.profile?.id, full_name: body.profile?.fullName });
    if (changes && profile.id !== profileId) throw Error();
    return profile;
  } catch { throw new ProfileError('Account returned an invalid response. Reload before trying again.', 503); }
}
