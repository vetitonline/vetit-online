export class BuyerInputError extends Error { code: string; }
export type BuyerAddressInput = {
  id: string | null; label: string | null; recipientName: string; phone: string | null;
  addressLine1: string; addressLine2: string | null; locality: string | null; city: string;
  stateRegion: string | null; postalCode: string | null; countryCode: string;
  latitude: number | null; longitude: number | null; isDefault: boolean;
};
export type CartItemInput = { listingId: string; productVariantId: string | null; quantity: number; marketCode: string };
export type InventoryAdjustmentInput = { businessId: string; productVariantId: string; quantityOnHand: number; stockLocation: string | null };
export type FulfilmentTransitionInput = { fulfilmentId: string; nextStatus: 'packed' | 'shipped' | 'delivered' | 'cancelled'; carrier: string | null; trackingReference: string | null };
export type AppointmentBookingInput = { appointmentSlotId: string; marketCode: string };
export function normalizeAddressInput(input: unknown): BuyerAddressInput;
export function normalizeAddressId(value: unknown): string;
export function normalizeCartItemInput(input: unknown): CartItemInput;
export function normalizeCartItemId(input: unknown): string;
export function normalizeInventoryAdjustmentInput(input: unknown): InventoryAdjustmentInput;
export function normalizeFulfilmentTransitionInput(input: unknown): FulfilmentTransitionInput;
export function normalizeAppointmentBookingInput(input: unknown): AppointmentBookingInput;
