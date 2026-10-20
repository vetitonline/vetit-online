/** Only normalized same-origin absolute paths are eligible after authentication. */
export function safeNextPath(requested, origin) {
  if (typeof requested !== 'string' || !requested.startsWith('/') || /[\\\u0000-\u0020\u007f]/.test(requested)) return '/';
  try {
    const target = new URL(requested, origin);
    return target.origin === new URL(origin).origin && !target.pathname.startsWith('//')
      ? `${target.pathname}${target.search}${target.hash}` : '/';
  } catch { return '/'; }
}

export function sessionLoginPath(path, origin) {
  return `/login?reason=session-expired&next=${encodeURIComponent(safeNextPath(path, origin))}`;
}

export function isProtectedPath(path) {
  return /^\/(appointments|orders|checkout)\/?$/.test(path) || /^\/(seller|admin)(\/|$)/.test(path) && !/^\/admin\/login\/?$/.test(path);
}
