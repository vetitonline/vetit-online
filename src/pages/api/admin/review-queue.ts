import type { APIRoute } from 'astro';
import { authenticateApiRequest } from '../../../lib/supabase/api-auth';
import { loadReviewQueue, ReviewQueueError, type QueueClient } from '../../../lib/moderation/queue.js';

export const GET: APIRoute = async ({request,cookies}) => {
  const headers = {'cache-control':'private, no-store','content-type':'application/json',vary:'Cookie, Authorization'};
  const auth = await authenticateApiRequest(request,cookies);
  if (auth.state !== 'authenticated') return new Response(JSON.stringify({state:auth.state}),{status:auth.state === 'unauthenticated' ? 401 : 503,headers});
  try {
    // Supplemental migration is deliberately separate from generated hosted types.
    const data = await loadReviewQueue(auth.supabase as unknown as QueueClient,auth.user,new URL(request.url).searchParams);
    return new Response(JSON.stringify({apiVersion:1,state:'available',data}),{status:200,headers});
  } catch (error) {
    return new Response(JSON.stringify({state:'unavailable'}),{status:error instanceof ReviewQueueError ? error.status : 503,headers});
  }
};
