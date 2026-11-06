import type { SavedCart, SavedCartCommand } from './saved-cart-contract.js';
import type { requestSavedCart } from './saved-cart-client.js';
export type SavedCartState = { phase: 'idle' | 'loading' | 'ready' | 'saving' | 'signin' | 'error'; cart: SavedCart | null; message: string };
export function createSavedCartWorkspace(options: { read?: typeof requestSavedCart; render: (state: SavedCartState) => void }): { load(): Promise<void>; mutate(command: SavedCartCommand): Promise<void>; clear(): void; dispose(): void };
