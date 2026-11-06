import { authenticateApiRequest } from '../../../lib/supabase/api-auth';
import { createProfileHandler } from '../../../lib/account/profile-api.js';
export const prerender = false;
export const GET = createProfileHandler({ authenticate: authenticateApiRequest });
export const PATCH = GET;
