import type { APIRoute } from 'astro';
import {readPublicCatalog} from '../../../lib/marketplace/catalog-reader';

export const prerender = false;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': status === 200 ? 'public, max-age=0, s-maxage=30, stale-while-revalidate=120' : 'no-store',
    'X-Content-Type-Options': 'nosniff',
  },
});

/** Read-only shared catalogue for website and native clients. */
export const GET: APIRoute = async ({ request, cookies }) => {
  const result=await readPublicCatalog(request,cookies);
  return json(result.body,result.status);
};
