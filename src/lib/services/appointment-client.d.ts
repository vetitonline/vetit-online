export type AppointmentSlotResponse = {
  state: 'available' | 'empty';
  serviceListingId: string;
  slots: Array<{ id: string; startsAt: string; endsAt: string }>;
  truncated: boolean;
};
export class AppointmentClientError extends Error { status: number; }
export function requestAppointmentSlots(args: {
  baseUrl?: string; serviceListingId: string; signal?: AbortSignal; fetchImpl?: typeof fetch;
}): Promise<AppointmentSlotResponse>;
export function formatAppointmentAvailability(
  availability: AppointmentSlotResponse, formatTime?: (value: string) => string,
): string;
