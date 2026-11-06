import { ProfileError, normalizeProfile, normalizeProfileUpdate } from './profile-contract.js';
import { isSameOriginMutation } from '../api/request-security.js';
import { readJsonBody } from '../api/json-body.js';

const json = (body, status = 200) => new Response(JSON.stringify({ apiVersion: 1, ...body }), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
});

/** Request-scoped user clients retain RLS; never use a service key here. */
export function createProfileHandler({ authenticate }) {
  return async ({ request, cookies }) => {
    try {
      const writing = request.method === 'PATCH';
      if (!writing && request.method !== 'GET') return json({ state: 'method_not_allowed' }, 405);
      if (writing && !isSameOriginMutation(request)) return json({ state: 'forbidden' }, 403);
      const auth = await authenticate(request, cookies);
      if (auth.state !== 'authenticated') return json({ state: auth.state === 'unavailable' ? 'unavailable' : 'unauthorized' }, auth.state === 'unavailable' ? 503 : 401);
      let query;
      if (writing) {
        if (request.headers.get('x-vetit-profile-id') !== auth.user.id) return json({ state: 'session_changed', message: 'Your account changed. Reload before saving.' }, 409);
        if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return json({ state: 'invalid_request' }, 415);
        const body = await readJsonBody(request, 2048);
        if (!body.ok) return json({ state: 'invalid_request' }, body.status);
        const changes = normalizeProfileUpdate(body.value);
        query = auth.supabase.from('profiles').update(changes).eq('id', auth.user.id).select('id,full_name');
      } else {
        query = auth.supabase.from('profiles').select('id,full_name').eq('id', auth.user.id);
      }
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      // Do not insert a missing profile or synthesize a successful save.
      if (!data) return json({ state: 'not_found', message: 'Your account profile is not available. Contact support.' }, 404);
      const profile = normalizeProfile(data);
      if (profile.id !== auth.user.id) throw new Error('Profile ownership mismatch');
      return json({ state: 'available', profile });
    } catch (error) {
      if (error instanceof ProfileError && error.status === 400) return json({ state: 'invalid_request', message: error.message }, 400);
      return json({ state: 'unavailable', message: 'Account could not be loaded or saved. Reload to check before trying again.' }, 503);
    }
  };
}
