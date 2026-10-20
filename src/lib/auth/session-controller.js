import { isProtectedPath, sessionLoginPath } from './navigation.js';

/** Inject browser effects so session transitions can be tested without Auth calls. */
export function createSessionController({ auth, location, render }) {
  let signedIn = false;
  let loggingOut = false;
  let revision = 0;
  let disposed = false;
  function update(user) {
    signedIn = Boolean(user);
    render(signedIn);
    if (!signedIn && !loggingOut && isProtectedPath(location.pathname)) {
      location.replace(sessionLoginPath(location.pathname + location.search, location.origin));
    }
  }
  const { data: { subscription } } = auth.onAuthStateChange((event) => {
    if (disposed) return;
    if (event === 'SIGNED_OUT') { revision++; update(null); }
    // No awaited Auth calls inside the SDK callback (which holds its auth lock).
    else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') queueMicrotask(() => void check());
  });
  async function check() {
    if (disposed || loggingOut) return;
    const current = ++revision;
    try {
      const { data, error } = await auth.getUser();
      if (disposed || loggingOut || current !== revision) return;
      if (!error) update(data.user);
      // Network errors must not masquerade as an expired session.
      else if (error.status === 401 || error.status === 403 || error.name === 'AuthSessionMissingError') update(null);
    } catch { /* Keep the current UI on temporary connectivity failure. */ }
  }
  async function logout() {
    if (disposed || loggingOut) return;
    loggingOut = true;
    revision++;
    try {
      const { error } = await auth.signOut({ scope: 'local' });
      if (error) throw error;
      if (disposed) return;
      revision++;
      update(null);
      location.replace('/login?reason=signed-out');
    } finally { loggingOut = false; }
  }
  return { check, logout, dispose: () => {
    disposed = true;
    revision++;
    subscription.unsubscribe();
  } };
}
