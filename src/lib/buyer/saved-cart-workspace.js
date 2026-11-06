import { requestSavedCart } from './saved-cart-client.js';

const blank = phase => ({ phase, cart: null, message: '' });
/** A failed/unknown write must be followed by a fresh read, never an automatic retry. */
export function createSavedCartWorkspace({ read = requestSavedCart, render }) {
  let state = blank('idle'), revision = 0, active, disposed = false, busy = false;
  const publish = next => { state = next; render(state); };
  const current = version => !disposed && version === revision;
  function clear() { if (disposed) return; revision++; active?.abort(); busy = false; publish(blank('signin')); }
  async function load() {
    if (disposed || busy) return;
    active?.abort(); active = new AbortController();
    const version = ++revision;
    publish(blank('loading'));
    try {
      const cart = await read({ signal: active.signal });
      if (current(version)) publish({ phase: 'ready', cart, message: '' });
    } catch (error) {
      if (current(version)) publish({ ...blank(error?.status === 401 ? 'signin' : 'error'), message: error.message ?? 'Saved cart is unavailable.' });
    }
  }
  async function mutate(command) {
    if (disposed || busy || state.phase !== 'ready' || !state.cart) return;
    const profileId = state.cart.profileId;
    busy = true; active?.abort(); active = new AbortController();
    const version = ++revision;
    publish({ ...state, phase: 'saving', message: '' });
    try {
      await read({ command, profileId, signal: active.signal });
      if (!current(version)) return;
      const cart = await read({ signal: active.signal });
      if (!current(version)) return;
      if (cart.profileId !== profileId) throw Error('Your account changed. Reload before editing.');
      const found = command.action === 'set' ? cart.items.find(item => item.listing_id === command.item.listingId && item.product_variant_id === (command.item.productVariantId ?? null)) : cart.items.find(item => item.id === command.itemId);
      if (command.action === 'set' ? !found || found.quantity !== command.item.quantity : found) throw Error('Cart change could not be confirmed. Reload to check your saved items.');
      publish({ phase: 'ready', cart, message: 'Your saved cart has been updated.' });
    } catch (error) {
      if (current(version)) publish({ ...blank(error?.status === 401 ? 'signin' : 'error'), message: error.message ?? 'Cart change could not be confirmed. Reload before trying again.' });
    } finally { if (current(version)) busy = false; }
  }
  return { load, mutate, clear, dispose() { disposed = true; revision++; active?.abort(); busy = false; } };
}
