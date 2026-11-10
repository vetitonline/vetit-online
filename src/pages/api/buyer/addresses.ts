import { authenticateApiRequest } from '../../../lib/supabase/api-auth';
import { callProposedCommerceRpc } from '../../../lib/supabase/proposed-commerce-rpc';
import { createAddressBookHandler } from '../../../lib/buyer/address-book-api.js';
export const prerender=false;
export const GET=createAddressBookHandler({authenticate:authenticateApiRequest,rpc:callProposedCommerceRpc});
export const POST=GET;
export const DELETE=GET;
