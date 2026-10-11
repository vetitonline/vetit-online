/** Accept only bounded JWT bearer values; the Auth server still verifies each token. */
export function parseBearerAccessToken(authorization) {
  if (authorization === null || typeof authorization !== 'string' || authorization.length > 8192) return null;
  return /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(authorization)?.[1] ?? null;
}
