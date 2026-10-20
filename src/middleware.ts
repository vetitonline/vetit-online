import { defineMiddleware } from 'astro:middleware';
import { isProtectedPath } from './lib/auth/navigation.js';

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();
  if (isProtectedPath(context.url.pathname) || /^\/(login|auth)(\/|$)/.test(context.url.pathname)) {
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
  }
  return response;
});
