export class AppointmentLifecycleError extends Error { status: number; constructor(message: string, status?: number); }
export type AppointmentPolicy = {
  allowCustomerCancellation: boolean; allowReschedule: boolean; allowLateCancellation: boolean;
  noticeMinutes: number; refundBasisPoints: number; lateRefundBasisPoints: number; offerExpiryMinutes: number;
  lateCancellationChargePermitted: boolean; lateCancellationChargeDisclosure: string;
};
export const INITIAL_APPOINTMENT_POLICY: Readonly<AppointmentPolicy>;
/** India-first default for a future provider-local timezone contract; current RPCs continue to send absolute instants. */
export const DEFAULT_PROVIDER_TIMEZONE: 'Asia/Kolkata';
export type AppointmentCommand = { action: string; [key: string]: unknown };
export function appointmentId(value: unknown): string;
export function normalizeProviderTimezone(value?: unknown): string;
/** Launch supports one concurrent booking per named resource; pooled capacity is not represented. */
export function normalizeAppointmentResourceKey(value?: unknown): string;
export function normalizeAppointmentPolicy(value: unknown): AppointmentPolicy;
export function normalizeAppointmentCommand(input: unknown): AppointmentCommand;
export function previewAppointmentCancellation(input: { policy: AppointmentPolicy; startsAt: string; now?: number; capturedMinor?: number; providerCancellation?: boolean }): { allowed: boolean; refundMinor: number; paymentAction: string };
export function previewAppointmentReschedule(input: { policy: AppointmentPolicy; startsAt: string; now?: number }): boolean;
export function formatAppointmentAmount(minor: number, currencyCode: string): string;
